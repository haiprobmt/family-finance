'use strict';
// 3.0 features through the real UI: assets/net worth (2 devices + conflict), recurring
// rules with idempotent confirmation, planned ≠ actual, privacy mode, grounded assistant,
// drill-through, simulator, backup before reset, legacy-backend compatibility, service
// worker cache boundary and responsive layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createWorld } = require('./harness.cjs');
const syn = require('../fixtures/synthetic.cjs');
const NOW = '2026-11-24T03:00:00Z';
const go = (dev, view) => dev.page.evaluate(v => nav(v), view);

async function addAsset(dev, { name, value }) {
  await go(dev, 'assets');
  await dev.page.click('#addAssetBtn');
  await dev.page.fill('#assetName', name);
  await dev.page.fill('#assetValue', String(value));
  await dev.page.click('#assetForm .submit-entry');
}

test('assets sync across devices, net worth computed, stale edit surfaces COLLECTION_CONFLICT', async () => {
  const w = await createWorld({ now: NOW, migrate: true });
  try {
    const a = await w.device('A'), b = await w.device('B');
    await w.connect(a); await w.connect(b);
    await addAsset(a, { name: 'Tài khoản mẫu', value: 2000000000 });
    await a.page.waitForFunction(() => document.querySelector('#syncPill b').textContent === 'Đã đồng bộ' && JSON.parse(localStorage.getItem('ffpages:ext_cache_v1')).collections.assets.pending === null);
    const rows = w.sheetRows('Assets');
    assert.equal(rows.length, 2); assert.equal(rows[1][2], 'Tài khoản mẫu'); assert.equal(rows[1][6], 2000000000);
    await w.syncNow(b); await go(b, 'assets');
    assert.match(await b.page.textContent('#assetList'), /Tài khoản mẫu/);
    const shinhan = syn.loanSchedule().records.find(r => r.bank === 'Shinhan' && r.month === '2026-11').principal;
    assert.match(await b.page.textContent('#netWorthSummary'), new RegExp(new Intl.NumberFormat('vi-VN').format(2000000000 - shinhan)));
    // A changes the collection; B edits from its stale copy.
    await addAsset(a, { name: 'Tiền mặt mẫu', value: 5000000 });
    await a.page.waitForFunction(() => JSON.parse(localStorage.getItem('ffpages:ext_cache_v1')).collections.assets.values.length === 2);
    await addAsset(b, { name: 'Xe mẫu', value: 300000000 });
    await b.page.waitForSelector('#assetConflict:not([hidden])');
    assert.match(await w.pill(b), /Xung đột/);
    assert.equal(w.sheetRows('Assets').length, 3, 'stale write did not overwrite');
    await b.page.click('#assetConflict [data-choice="remote"]');
    await b.page.waitForFunction(() => document.querySelector('#assetConflict').hidden);
    assert.deepEqual(a.errors.concat(b.errors), []);
  } finally { await w.close(); }
});

test('recurring rule: planned stays out of actuals, confirmation is idempotent across devices, skip persists', async () => {
  const w = await createWorld({ now: NOW, migrate: true });
  try {
    const a = await w.device('A'), b = await w.device('B');
    await w.connect(a); await w.connect(b);
    const expenseBefore = await a.page.textContent('#expenseTotal');
    await go(a, 'plan'); await a.page.click('#addRuleBtn');
    await a.page.fill('#ruleAmount', '3500000'); await a.page.fill('#ruleStart', '2026-11-26'); await a.page.fill('#ruleNote', 'Học phí mẫu');
    await a.page.click('#ruleForm .submit-entry');
    await a.page.waitForFunction(() => JSON.parse(localStorage.getItem('ffpages:ext_cache_v1')).collections.recurring.pending === null && JSON.parse(localStorage.getItem('ffpages:ext_cache_v1')).collections.recurring.values.length === 1);
    assert.equal(w.sheetRows('RecurringRules').length, 2);
    assert.match(await a.page.textContent('#financialCalendar'), /Học phí mẫu[\s\S]*Sắp đến/);
    assert.match(await a.page.textContent('#homeReminderList'), /Sắp đến hạn/);
    assert.equal(await a.page.textContent('#expenseTotal'), expenseBefore, 'planned item not counted as actual spend');
    await go(a, 'budget'); assert.match(await a.page.textContent('#budgetInsights'), /không[\s\S]*tính vào "đã chi"/);
    await w.syncNow(b);
    const ruleId = (await w.local(a, 'ext_cache_v1')).collections.recurring.values[0].id, occId = `rec-${ruleId}-2026-11-26`;
    await go(a, 'plan'); await a.page.click(`#financialCalendar [data-action="confirm-occ"][data-occ-id="${occId}"]`);
    await a.page.waitForFunction(id => (JSON.parse(localStorage.getItem('ffpages:family_finance_transactions_v1')).find(t => t.id === id) || {}).synced, occId);
    // B still shows it pending (stale) and confirms too: same ID → replay-safe.
    await b.page.evaluate(id => fvConfirmOccurrence(id), occId);
    await b.page.waitForFunction(id => (JSON.parse(localStorage.getItem('ffpages:family_finance_transactions_v1')).find(t => t.id === id) || {}).synced, occId);
    assert.equal(w.sheetRows('Transactions').filter(r => r[0] === occId).length, 1, 'exactly one transaction');
    assert.equal(w.sheetRows('Transactions').find(r => r[0] === occId)[2], '2026-11-26');
    await a.page.click(`#financialCalendar [data-action="skip-occ"][data-occ-id="rec-${ruleId}-2026-12-26"]`);
    await a.page.waitForFunction(() => JSON.parse(localStorage.getItem('ffpages:ext_cache_v1')).collections.recurring.pending === null && JSON.parse(localStorage.getItem('ffpages:ext_cache_v1')).collections.recurring.values[0].skipped.length === 1);
    assert.equal(w.sheetRows('RecurringRules')[1][11], '2026-12-26');
  } finally { await w.close(); }
});

test('privacy mode hides amounts everywhere and persists across reload', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    await a.page.click('#privacyBtn');
    for (const sel of ['#expenseTotal', '#incomeTotal']) assert.match(await a.page.textContent(sel), /•/);
    assert.equal(await a.page.getAttribute('#privacyBtn', 'aria-pressed'), 'true');
    await go(a, 'dashboard'); assert.ok(!/\d{1,3}(\.\d{3})+ ₫/.test(await a.page.textContent('#dashCashflow')));
    await a.page.reload(); await a.page.waitForSelector('#expenseTotal');
    assert.match(await a.page.textContent('#expenseTotal'), /•/);
  } finally { await w.close(); }
});

test('assistant chips use grounded tools with provenance; provider failure still shows computed data', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    await a.page.click('#assistantBtn'); await a.page.click('[data-ai-tool="summary"]');
    await a.page.waitForSelector('.chat-bubble.provenance');
    const log = await a.page.textContent('#chatLog');
    assert.match(log, /Trả lời mẫu/); assert.match(log, /Nguồn số liệu: Google Sheets · Transactions/);
    const req = w.requests.find(r => r.params.action === 'assistant_tool');
    assert.equal(req.params.tool, 'summary'); assert.equal(req.params.month, '2026-11');
    w.aiHandler = () => ({ status: 503, body: {} });
    await a.page.click('[data-ai-tool="budget_status"]');
    await a.page.waitForFunction(() => document.querySelectorAll('.chat-bubble.provenance').length === 2);
    assert.match(await a.page.textContent('#chatLog'), /DeepSeek đang quá tải[\s\S]*Số liệu tính sẵn: Đã dùng/);
  } finally { await w.close(); }
});

test('dashboard KPI drill-through lists exactly the source transactions; simulator shows labelled assumptions', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    await go(a, 'dashboard'); await a.page.click('[data-action="drill"][data-type="Expense"]');
    await a.page.waitForSelector('#categoryDetailOverlay.open');
    const expected = (await w.local(a, 'family_finance_transactions_v1')).filter(t => t.type === 'Expense' && t.date.startsWith('2026-11')).length;
    assert.equal(await a.page.locator('#categoryDetailBody tr').count(), expected);
    await a.page.keyboard.press('Escape');
    await go(a, 'assets'); await a.page.fill('#simExtra', '5000000'); await a.page.click('#simulatorForm .submit-entry');
    const out = await a.page.textContent('#simulatorResult');
    assert.match(out, /Tiết kiệm ròng \(ước tính\)/); assert.match(out, /Lãi suất cố định 7\.500%\/năm/);
  } finally { await w.close(); }
});

test('backup is offered before clearing device data and never contains the token', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    w.offline.add('A'); await w.addEntry(a, { amount: 1000, note: 'E2E unsynced' });
    await a.page.click('#settingsBtn');
    const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#clearDataBtn')]);
    const text = fs.readFileSync(await download.path(), 'utf8'), data = JSON.parse(text);
    assert.equal(data.kind, 'family-finance-local-backup');
    assert.ok(data.transactions.some(t => t.note === 'E2E unsynced'));
    assert.ok(data.pendingOperations.length >= 1);
    assert.ok(!text.includes(syn.TEST_TOKEN) && !text.includes('script.google.com'));
    assert.deepEqual(await w.local(a, 'family_finance_transactions_v1'), []);
  } finally { await w.close(); }
});

test('APK-era (legacy) Apps Script: PWA still syncs, ext features degrade honestly, assistant falls back', async () => {
  const w = await createWorld({ now: NOW, files: ['tests/legacy/Code.legacy.gs'] });
  try {
    const a = await w.device('A'); await w.connect(a);
    await w.addEntry(a, { amount: 5000, note: 'E2E legacy backend' });
    assert.equal(w.sheetRows('Transactions').filter(r => r[7] === 'E2E legacy backend').length, 1);
    await go(a, 'assets');
    assert.match(await a.page.textContent('#extBanner'), /chưa có tính năng Tài sản/);
    assert.equal(await w.pill(a), 'Đã đồng bộ', 'unsupported extension does not block core sync');
    await a.page.click('#assistantBtn'); await a.page.click('[data-ai-tool="summary"]');
    await a.page.waitForFunction(() => [...document.querySelectorAll('.chat-bubble.ai')].some(b => b.textContent.includes('Trả lời mẫu')));
    assert.ok(w.requests.some(r => r.params.action === 'chat_scoped'), 'fell back to chat_scoped');
    assert.deepEqual(a.errors, []);
  } finally { await w.close(); }
});

test('service worker caches only allowlisted static files and serves the shell offline', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const d = await w.device('SW', { serviceWorkers: 'allow' });
    await d.page.goto(w.base);
    await d.page.evaluate(() => navigator.serviceWorker.ready);
    const cached = await d.page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return { keys: await caches.keys(), urls: out }; });
    assert.deepEqual(cached.keys, ['family-finance-pages-v3']);
    assert.ok(cached.urls.length >= 30);
    assert.ok(cached.urls.every(u => u.startsWith(w.base)), 'no third-party or API responses cached');
    await d.context.setOffline(true);
    await d.page.reload();
    assert.equal(await d.page.title(), 'Chi Tiêu Gia Đình');
    assert.ok(await d.page.evaluate(() => typeof FFDomain.loan.loanSummary === 'function'), 'domain scripts served from cache');
  } finally { await w.close(); }
});

test('responsive layout: no horizontal page overflow on phone and desktop; controls have accessible names', async () => {
  const w = await createWorld({ now: NOW, migrate: true });
  try {
    for (const viewport of [{ width: 360, height: 780 }, { width: 1280, height: 900 }]) {
      const d = await w.device('V' + viewport.width, { viewport }); await w.connect(d);
      await d.page.keyboard.press('Escape');
      for (const view of ['home', 'history', 'dashboard', 'budget', 'assets', 'plan']) {
        await go(d, view); await d.page.waitForTimeout(50);
        const overflow = await d.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `${view} @${viewport.width}px overflows by ${overflow}px`);
      }
      const unnamed = await d.page.evaluate(() => [...document.querySelectorAll('button, input, select')].filter(el => el.offsetParent !== null && el.type !== 'hidden').filter(el => !(el.getAttribute('aria-label') || el.textContent.trim() || el.labels?.length || el.title)).map(el => el.outerHTML.slice(0, 80)));
      assert.deepEqual(unnamed, []);
      assert.deepEqual(d.errors, []);
    }
  } finally { await w.close(); }
});

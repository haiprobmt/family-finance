'use strict';
// TEST_PLAN §4 two-device sync matrix, driven through the real PWA UI against the real
// Apps Script code on the in-memory Sheets emulation. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld } = require('./harness.cjs');
const syn = require('../fixtures/synthetic.cjs');
const NOW = '2026-11-24T03:00:00Z';
const countId = (w, pred) => w.sheetRows('Transactions').filter(pred).length;

test('online create is acknowledged; requests are POST with token only in the body', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    await w.addEntry(a, { amount: 123000, note: 'E2E online' });
    await a.page.waitForFunction(() => document.querySelector('#syncPill b').textContent === 'Đã đồng bộ');
    assert.equal(countId(w, r => r[7] === 'E2E online'), 1);
    assert.equal((await w.local(a, 'family_finance_transactions_v1')).find(t => t.note === 'E2E online').synced, true);
    for (const r of w.requests) { assert.equal(r.method, 'POST'); assert.ok(!r.url.includes(syn.TEST_TOKEN)); assert.equal(r.params.nativeVersion, '3'); }
    assert.deepEqual(a.errors, []);
  } finally { await w.close(); }
});

test('offline create is durable across reload and syncs exactly once when the network returns', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    w.offline.add('A');
    await w.addEntry(a, { amount: 45000, note: 'E2E offline' });
    assert.match(await w.pill(a), /chờ|Lỗi/);
    await a.page.reload();
    await a.page.waitForSelector('#historyList', { state: 'attached' });
    const draft = (await w.local(a, 'family_finance_transactions_v1')).find(t => t.note === 'E2E offline');
    assert.equal(draft.synced, false, 'draft survives restart while offline');
    assert.equal(countId(w, r => r[7] === 'E2E offline'), 0);
    w.offline.delete('A');
    await w.syncNow(a); await w.syncNow(a);
    assert.equal(countId(w, r => r[7] === 'E2E offline'), 1, 'synced once');
    assert.equal(await w.pill(a), 'Đã đồng bộ');
  } finally { await w.close(); }
});

test('server accepted but response lost: retry does not duplicate', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    w.dropResponse.add('A');
    await w.addEntry(a, { amount: 99000, note: 'E2E lost response' });
    assert.equal(countId(w, r => r[7] === 'E2E lost response'), 1, 'server applied the write');
    await w.syncNow(a);
    assert.equal(countId(w, r => r[7] === 'E2E lost response'), 1, 'replay with the same ID is idempotent');
    assert.equal((await w.local(a, 'family_finance_transactions_v1')).filter(t => t.note === 'E2E lost response').length, 1);
  } finally { await w.close(); }
});

test('A and B update the same transaction: B gets a visible conflict, no silent overwrite', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'), b = await w.device('B');
    await w.connect(a); await w.connect(b);
    const id = 'syn-1';
    const edit = async (dev, amount) => dev.page.evaluate(async ([id, amount]) => { editIncome(id); document.querySelector('#amountInput').value = amount; document.querySelector('#entryForm').requestSubmit(); }, [id, amount]);
    await edit(a, '111111');
    await a.page.waitForFunction(id => JSON.parse(localStorage.getItem('ffpages:family_finance_transactions_v1')).find(t => t.id === id).synced, id);
    await edit(b, '222222');
    await b.page.waitForFunction(id => !!JSON.parse(localStorage.getItem('ffpages:family_finance_transactions_v1')).find(t => t.id === id).conflict, id);
    assert.equal(w.sheetRows('Transactions').find(r => r[0] === id)[4], 111111, 'A\'s write kept');
    assert.equal(await w.pill(b), 'Xung đột · Xem lại');
    // Resolve on B by taking the Sheets copy.
    await b.page.evaluate(id => editIncome(id), id);
    await b.page.waitForFunction(id => { const t = JSON.parse(localStorage.getItem('ffpages:family_finance_transactions_v1')).find(t => t.id === id); return t && !t.conflict && t.amount === 111111; }, id);
  } finally { await w.close(); }
});

test('A deletes while B edits a stale copy: B sees the conflict (remote deleted)', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'), b = await w.device('B');
    await w.connect(a); await w.connect(b);
    await a.page.evaluate(() => deleteTransaction('syn-2'));
    await a.page.waitForFunction(() => JSON.parse(localStorage.getItem('ffpages:family_deleted_v2') || '[]').length === 0);
    assert.equal(countId(w, r => r[0] === 'syn-2'), 0);
    await b.page.evaluate(() => { editIncome('syn-2'); document.querySelector('#amountInput').value = '5000'; document.querySelector('#entryForm').requestSubmit(); });
    await b.page.waitForFunction(() => { const t = JSON.parse(localStorage.getItem('ffpages:family_finance_transactions_v1')).find(t => t.id === 'syn-2'); return t && t.conflict && t.conflict.remote === null; });
    assert.equal(countId(w, r => r[0] === 'syn-2'), 0, 'stale edit did not resurrect the row');
  } finally { await w.close(); }
});

test('budget changed on B: A receives BUDGET_CONFLICT and can choose a version', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'), b = await w.device('B');
    await w.connect(a); await w.connect(b);
    const save = async (dev, value) => { await dev.page.click('.nav-item[data-nav="budget"]'); await dev.page.fill('#budget-food', value); await dev.page.click('#saveBudgetBtn'); await dev.page.waitForFunction(() => !document.querySelector('#saveBudgetBtn').disabled); };
    await save(b, '7000000');
    await save(a, '6000000');
    await a.page.waitForSelector('#budgetConflict:not([hidden])');
    assert.equal(await w.pill(a), 'Xung đột · Xem lại');
    assert.ok(w.sheetRows('Budgets').some(r => r[0] === '2026-11:food' && r[1] === 7000000), 'B\'s budget kept');
    await a.page.click('#useRemoteBudget');
    assert.equal((await w.local(a, 'family_budget_sync_v2')).pending, null);
  } finally { await w.close(); }
});

test('invalid token: clear auth error, drafts retained', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    await a.page.evaluate(() => { const c = JSON.parse(sessionStorage.getItem('ffpages:connection')); c.token = 'wrong-token-but-long-enough-xx'; sessionStorage.setItem('ffpages:connection', JSON.stringify(c)); });
    await w.addEntry(a, { amount: 7000, note: 'E2E bad token' });
    await w.syncNow(a);
    assert.match(await w.pill(a), /Lỗi đồng bộ/);
    assert.match(await a.page.getAttribute('#syncPill', 'title'), /Mã kết nối gia đình không đúng/);
    assert.equal((await w.local(a, 'family_finance_transactions_v1')).find(t => t.note === 'E2E bad token').synced, false);
  } finally { await w.close(); }
});

test('partial sync failure: acknowledged operations are removed, the rest retained', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const a = await w.device('A'); await w.connect(a);
    w.offline.add('A');
    await w.addEntry(a, { amount: 1000, note: 'E2E first' });
    await w.addEntry(a, { amount: 2000, note: 'E2E second' });
    w.offline.delete('A');
    w.failWhen = p => p.action === 'v3_create' && p.note === 'E2E second';
    await a.page.evaluate(() => retryUnsynced());
    const local = await w.local(a, 'family_finance_transactions_v1');
    assert.equal(local.find(t => t.note === 'E2E first').synced, true);
    assert.equal(local.find(t => t.note === 'E2E second').synced, false);
    assert.equal(countId(w, r => r[7] === 'E2E second'), 0);
    w.failWhen = null;
    await w.syncNow(a);
    assert.equal(countId(w, r => r[7] === 'E2E second'), 1);
  } finally { await w.close(); }
});

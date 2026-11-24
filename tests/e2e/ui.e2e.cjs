'use strict';
// Family Finance 3.0 professional UI — QA gates (UI_IMPLEMENTATION_GUIDE §4 Phase 4, §8):
//  - financial values identical to the pre-redesign UI on the same synthetic fixture;
//  - 360/390/430/768/1024/1440/1920 px: no page overflow, correct shell, no console errors;
//  - phones: interactive targets >= 44 px; keyboard focus trap / return; hash routes + back;
//  - axe-core WCAG 2.2 AA scan of every screen (when axe-core is installed).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createWorld } = require('./harness.cjs');
const baseline = require('../fixtures/ui-baseline-values.json');
const NOW = '2026-11-24T03:00:00Z';
const VIEWS = ['home', 'history', 'budget', 'assets', 'loans', 'plan', 'ai', 'reports', 'settings'];
const WIDTHS = [360, 390, 430, 768, 1024, 1440, 1920];
const go = (dev, view) => dev.page.evaluate(v => nav(v), view);
const squash = s => String(s).replace(/\s+/g, '');

async function seedExtras(w, d) {
  await d.page.evaluate(() => {
    extStore.edit('assets', [{ id: 'a1', type: 'bank', name: 'Tiết kiệm mẫu', currency: 'VND', acquisitionDate: '', acquisitionValue: '', currentValue: 1500000000, valuationDate: '2026-11-01', ownershipShare: 1, notes: '', status: 'active', disposalDate: '' }]);
    extStore.edit('recurring', [{ id: 'r1', type: 'Expense', amount: 3500000, category: 'kids', person: 'Gia đình', note: 'Học phí mẫu', cadence: 'monthly', interval: 1, startDate: '2026-11-26', endDate: '', status: 'active', skipped: [] }]);
  });
  await w.syncNow(d);
}

test('financial values on every migrated screen match the pre-redesign UI (same fixture)', async () => {
  const w = await createWorld({ now: NOW, migrate: true });
  try {
    const d = await w.device('P', { viewport: { width: 390, height: 844 } }); await w.connect(d); await seedExtras(w, d);
    const p = d.page, b = baseline;
    await go(d, 'home');
    for (const id of ['expenseTotal', 'incomeTotal', 'remainingTotal']) assert.equal(await p.getAttribute('#' + id, 'aria-label'), b.home[id], id);
    assert.equal((await p.textContent('#savingRate')).trim(), b.home.savingRate);
    assert.equal((await p.textContent('#debtSummary')).trim(), b.home.debtSummary);
    assert.equal((await p.textContent('#budgetCaption')).trim(), b.home.budgetCaption);
    const gauge = squash(await p.textContent('#budgetGauge'));
    assert.ok(gauge.includes(b.home.budgetGaugeValue), 'budget used % ' + gauge);
    assert.ok(gauge.includes(squash('1.256.000 ₫ / 22.517.123 ₫')), 'spent / limit (22,52 tr compact before) ' + gauge);
    await go(d, 'reports');
    assert.equal(await p.textContent('#cumulativeIncome'), b.dashboard.cumulativeIncome);
    assert.equal(await p.textContent('#cumulativeExpense'), b.dashboard.cumulativeExpense);
    assert.equal(await p.textContent('#accumulatedSavingsValue'), b.dashboard.savings);
    await go(d, 'loans');
    const rows = await p.$$eval('#loanScheduleBody tr', trs => trs.slice(0, 8).map(r => r.innerText));
    assert.deepEqual(rows.map(squash), b.dashboard.loanRows.map(squash), 'loan schedule rows');
    await go(d, 'budget');
    const inputs = await p.$$eval('[data-budget]', els => Object.fromEntries(els.map(i => [i.dataset.budget, i.value || i.placeholder])));
    assert.deepEqual(inputs, b.budget, 'budget inputs (values and loan placeholder)');
    await go(d, 'assets');
    const nw = squash(await p.textContent('#netWorthSummary'));
    for (const v of ['1.500.000.000 ₫', '895.000.000 ₫', '605.000.000 ₫']) assert.ok(nw.includes(squash(v)), v);
    await go(d, 'home');
    const dashNw = squash(await p.textContent('#dashNetWorth'));
    for (const v of ['605 tr', '1.500 tr', '895 tr']) assert.ok(dashNw.includes(squash(v)), 'compact ' + v + ' in ' + dashNw);
    assert.equal(await p.locator('#historyList [data-tx-id]').count(), b.historyCount, 'transaction count');
    assert.deepEqual(d.errors, []);
  } finally { await w.close(); }
});

test('7 viewport widths: right shell, every screen fits without page overflow, no console errors', async () => {
  const w = await createWorld({ now: NOW, migrate: true });
  try {
    for (const width of WIDTHS) {
      const d = await w.device('W' + width, { viewport: { width, height: width < 640 ? 820 : 900 } }); await w.connect(d);
      const shell = await d.page.evaluate(() => ({ sidebar: getComputedStyle(document.querySelector('.sidebar')).display !== 'none', bottom: getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none', sideW: document.querySelector('.sidebar').getBoundingClientRect().width }));
      if (width < 640) { assert.equal(shell.sidebar, false); assert.equal(shell.bottom, true); }
      else if (width < 1024) { assert.equal(shell.bottom, false); assert.equal(Math.round(shell.sideW), 72, 'icon rail'); }
      else { assert.equal(shell.bottom, false); assert.equal(Math.round(shell.sideW), 248, 'full sidebar'); }
      for (const view of VIEWS) {
        await go(d, view);
        const r = await d.page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, clipped: [...document.querySelectorAll('.view.active .money')].filter(m => !m.closest('.table-wrap, .chart-scroll')).filter(m => { const b = m.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1); }).length }));
        assert.ok(r.overflow <= 1, `${view} @${width}px overflows by ${r.overflow}px`);
        assert.equal(r.clipped, 0, `${view} @${width}px clips money values`);
      }
      if (width < 640) {
        const pad = await d.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom));
        assert.ok(pad >= 64 + 56, 'content clears the bottom nav and quick-add button');
      }
      assert.deepEqual(d.errors, [], 'console errors @' + width);
      await d.context.close();
    }
  } finally { await w.close(); }
});

test('phones: interactive targets are at least 44×44 px on every screen', async () => {
  const w = await createWorld({ now: NOW, migrate: true });
  try {
    for (const width of [360, 390, 430]) {
      const d = await w.device('T' + width, { viewport: { width, height: 820 } }); await w.connect(d); await seedExtras(w, d);
      for (const view of VIEWS) {
        await go(d, view);
        const small = await d.page.evaluate(() => [...document.querySelectorAll('.view.active button, .view.active a, .view.active input, .view.active select, .view.active textarea, .view.active summary, .topbar button, .bottom-nav button, .fab')]
          .filter(el => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden')
          .filter(el => !(el.type === 'checkbox' && el.closest('label.check')))
          .map(el => { const r = el.getBoundingClientRect(), minW = el.classList.contains('bar-hit') ? 24 : 44; return { el: el.outerHTML.slice(0, 90), w: Math.round(r.width), h: Math.round(r.height), ok: r.height >= 43.5 && r.width >= minW - 0.5 }; })
          .filter(x => !x.ok));
        assert.deepEqual(small, [], `${view} @${width}px`);
      }
    }
  } finally { await w.close(); }
});

test('navigation: hash deep links, browser back, active state, page title focus', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const d = await w.device('N', { viewport: { width: 1440, height: 900 } }); await w.connect(d);
    const p = d.page;
    await p.click('.side-link[data-nav="history"]');
    assert.equal(await p.evaluate(() => location.hash), '#/giao-dich');
    assert.equal(await p.getAttribute('.side-link[data-nav="history"]', 'aria-current'), 'page');
    assert.equal(await p.evaluate(() => document.activeElement.id), 'historyTitle', 'focus moves to the page heading');
    await p.click('.side-link[data-nav="loans"]');
    await p.goBack();
    await p.waitForFunction(() => document.querySelector('#historyView').classList.contains('active'));
    await p.goto(w.base + '#/bao-cao');
    await p.waitForFunction(() => document.querySelector('#reportsView').classList.contains('active'));
    assert.match(await p.title(), /^Báo cáo/);
    const m = await w.device('M', { viewport: { width: 390, height: 844 } }); await w.connect(m);
    await m.page.click('.nav-item[data-nav="more"]');
    await m.page.waitForSelector('#moreOverlay.open');
    await m.page.click('#moreOverlay [data-nav="plan"]');
    assert.equal(await m.page.evaluate(() => location.hash), '#/lich');
    assert.equal(await m.page.getAttribute('.nav-item[data-nav="more"]', 'aria-current'), 'page', '"Khác" marked active for secondary pages');
    assert.equal(await m.page.evaluate(() => document.querySelector('#moreOverlay').classList.contains('open')), false);
  } finally { await w.close(); }
});

test('dialogs: focus moves in, Tab is trapped, Escape closes safe dialogs and returns focus; unsafe ones need Cancel', async () => {
  const w = await createWorld({ now: NOW });
  try {
    const d = await w.device('K', { viewport: { width: 1280, height: 900 } }); await w.connect(d);
    const p = d.page;
    await go(d, 'history');
    const first = p.locator('#historyList .tx-open').first();
    await first.focus(); await p.keyboard.press('Enter');
    await p.waitForSelector('#transactionDetailOverlay.open');
    assert.ok(await p.evaluate(() => document.querySelector('#transactionDetailOverlay').contains(document.activeElement)), 'focus inside dialog');
    for (let i = 0; i < 6; i++) await p.keyboard.press('Tab');
    assert.ok(await p.evaluate(() => document.querySelector('#transactionDetailOverlay').contains(document.activeElement)), 'Tab stays inside');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('#transactionDetailOverlay').classList.contains('open'));
    assert.ok(await p.evaluate(() => document.activeElement.classList.contains('tx-open')), 'focus returned to the row');
    await p.click('.sidebar [data-open-entry]');
    await p.waitForSelector('#entryOverlay.open');
    await p.fill('#amountInput', '12000');
    await p.keyboard.press('Escape');
    assert.equal(await p.evaluate(() => document.querySelector('#entryOverlay').classList.contains('open')), true, 'unsaved entry is not dismissed by Escape');
    await p.click('#entryOverlay .sheet-actions [data-close="entry"]');
    assert.equal(await p.evaluate(() => document.querySelector('#entryOverlay').classList.contains('open')), false);
    assert.ok(await p.evaluate(() => document.activeElement === document.querySelector('.sidebar [data-open-entry]')), 'focus returned to the trigger');
    // Keyboard focus shows a visible ring (mouse focus intentionally does not, per :focus-visible).
    await p.keyboard.press('Tab');
    const ring = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
    assert.ok(ring, 'visible keyboard focus ring');
  } finally { await w.close(); }
});

function axeSource() {
  for (const candidate of [process.env.AXE_CORE_PATH, (() => { try { return require.resolve('axe-core/axe.min.js'); } catch { return null; } })(), '/tmp/claude-0/axe/node_modules/axe-core/axe.min.js']) if (candidate && fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  return null;
}
const AXE = axeSource();
test('accessibility: axe-core WCAG 2.2 AA scan of every screen and dialog (desktop and phone)', { skip: AXE ? false : 'axe-core not installed (npm install --no-save axe-core@4.10.3)' }, async () => {
  const w = await createWorld({ now: NOW, migrate: true });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const d = await w.device('A' + viewport.width, { viewport }); await w.connect(d); await seedExtras(w, d);
      await d.page.evaluate(AXE); // via DevTools protocol: the app's CSP (script-src 'self') stays untouched
      const scan = async label => {
        // A toast that starts fading out during axe.run is measured at partial opacity (false
        // color-contrast failure on #toast); wait until it has gone, then for every animation.
        await d.page.waitForFunction(() => !document.querySelector('#toast').classList.contains('show'), null, { timeout: 5000 });
        await d.page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))));
        const res = await d.page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })));
        assert.deepEqual(res, [], `${label} @${viewport.width}px`);
      };
      for (const view of VIEWS) { await go(d, view); await scan(view); }
      await d.page.evaluate(() => openEntry('Expense')); await d.page.waitForSelector('#entryOverlay.open'); await scan('entry dialog');
      await d.page.click('#entryOverlay [data-close="entry"]');
    }
  } finally { await w.close(); }
});

'use strict';
// Captures every screen (and key dialogs) at phone and desktop widths using the e2e harness:
// real PWA + real apps-script/*.gs on emulated Sheets, synthetic fixture only.
// Usage: node tools/capture-screenshots.cjs <outDir> [widths=390,1440]
const path = require('path');
const fs = require('fs');
const { createWorld } = require('../tests/e2e/harness.cjs');
const out = path.resolve(process.argv[2] || 'screenshots');
const widths = (process.argv[3] || '390,1440').split(',').map(Number);
const VIEWS = ['home', 'history', 'budget', 'assets', 'loans', 'plan', 'ai', 'reports', 'settings'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const w = await createWorld({ now: '2026-11-24T03:00:00Z', migrate: true });
  try {
    for (const width of widths) {
      const d = await w.device('S' + width, { viewport: { width, height: width < 640 ? 844 : 900 } });
      await w.connect(d);
      await d.page.evaluate(() => {
        extStore.edit('assets', [{ id: 'a1', type: 'bank', name: 'Tiết kiệm mẫu', currency: 'VND', acquisitionDate: '', acquisitionValue: '', currentValue: 1500000000, valuationDate: '2026-11-01', ownershipShare: 1, notes: '', status: 'active', disposalDate: '' }]);
        extStore.edit('recurring', [{ id: 'r1', type: 'Expense', amount: 3500000, category: 'kids', person: 'Gia đình', note: 'Học phí mẫu', cadence: 'monthly', interval: 1, startDate: '2026-11-26', endDate: '', status: 'active', skipped: [] }]);
      });
      await w.syncNow(d);
      await d.page.waitForTimeout(2600); // let the connection toast fade
      const label = width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
      for (const view of VIEWS) {
        await d.page.evaluate(v => nav(v), view);
        await d.page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))));
        await d.page.screenshot({ path: path.join(out, `${label}-${width}-${view}.png`), fullPage: true });
      }
      await d.page.evaluate(() => { nav('home'); openEntry('Expense'); });
      await d.page.waitForTimeout(300);
      await d.page.screenshot({ path: path.join(out, `${label}-${width}-dialog-entry.png`) });
      await d.page.evaluate(() => closeOverlay('#entryOverlay'));
      if (width < 640) {
        await d.page.click('.nav-item[data-nav="more"]'); await d.page.waitForTimeout(200);
        await d.page.screenshot({ path: path.join(out, `${label}-${width}-menu-more.png`) });
      }
      if (d.errors.length) console.error(width, d.errors);
    }
    console.log('screenshots written to', out);
  } finally { await w.close(); }
})().catch(e => { console.error(e); process.exit(1); });

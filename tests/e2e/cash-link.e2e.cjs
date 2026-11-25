'use strict';
// Tài sản → Tiền mặt shows Tiết kiệm tích lũy (Báo cáo), through the real UI. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld } = require('./harness.cjs');
const NOW = '2026-11-24T03:00:00Z';
const go = (d, view) => d.page.evaluate(v => nav(v), view);
const squash = s => String(s).replace(/\s+/g, ' ').trim();

test('a Tiền mặt asset is valued automatically from Tiết kiệm tích lũy', async () => {
  const w = await createWorld({ now: NOW, migrate: true });
  try {
    const a = await w.device('A', { viewport: { width: 1280, height: 900 } }); await w.connect(a);
    const p = a.page;
    await go(a, 'reports');
    const savings = squash(await p.textContent('#accumulatedSavingsValue'));
    assert.match(savings, /₫/);
    await go(a, 'assets');
    await p.click('#addAssetBtn');
    await p.selectOption('#assetType', 'cash');
    assert.equal(await p.isHidden('#assetValueField'), true, 'no manual value for linked cash');
    assert.match(await p.textContent('#assetLinkedHelp'), /Tiết kiệm tích lũy/);
    await p.fill('#assetName', 'Tiền mặt');
    await p.click('#assetForm .submit-entry');
    await p.waitForFunction(() => document.querySelector('#assetList') && document.querySelector('#assetList').textContent.includes('Tự động từ Tiết kiệm tích lũy'));
    const row = squash(await p.locator('#assetList tr', { hasText: 'Tiền mặt' }).first().innerText());
    assert.ok(row.includes(savings), row + ' should include ' + savings);
    assert.equal(await p.locator('#assetList tr', { hasText: 'Tiền mặt' }).locator('[data-action="value-asset"]').count(), 0, 'no manual valuation button');
    const stored = w.sheetRows('Assets').find(r => r[2] === 'Tiền mặt');
    assert.ok(stored, 'saved to the Assets sheet'); assert.equal(stored[1], 'cash'); assert.equal(stored[6], '', 'no hand-entered value stored');
    await go(a, 'reports');
    assert.match(await p.textContent('#accumulatedSavingsHelp'), /Tiền mặt/);
    // A second cash asset is a normal asset with its own value.
    await go(a, 'assets'); await p.click('#addAssetBtn'); await p.selectOption('#assetType', 'cash');
    assert.equal(await p.isHidden('#assetValueField'), false);
    await p.keyboard.press('Escape');
    assert.deepEqual(a.errors, []);
  } finally { await w.close(); }
});

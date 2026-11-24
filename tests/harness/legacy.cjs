'use strict';
// Loads the frozen pre-3.0 PWA calculation code (tests/legacy) into a sandbox.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; }, _map: m };
}

function loadLegacy({ loanSchedule = { start: '2026-10', end: '2030-12', records: [], extraDebt: 0 }, loanRates = null } = {}) {
  const storage = memoryStorage(loanRates ? { 'ffpages:family_finance_loan_rates_v1': JSON.stringify(loanRates) } : {});
  const ctx = vm.createContext({ Intl, Date, Math, JSON, Number, String, Object, Array, Map, Set, localStorage: storage, document: { addEventListener() {} } });
  vm.runInContext('var LOAN_SCHEDULE=' + JSON.stringify(loanSchedule) + ';', ctx);
  for (const f of ['dashboard.legacy.js', 'app-pure.legacy.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'legacy', f), 'utf8'), ctx, { filename: f });
  ctx.set = (name, value) => { ctx.__v = value; vm.runInContext(name + '=__v', ctx); };
  ctx.run = code => vm.runInContext(code, ctx);
  return ctx;
}

module.exports = { loadLegacy, memoryStorage };

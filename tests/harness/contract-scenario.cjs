'use strict';
// A deterministic request sequence touching every v3 action, validation rule and
// conflict path. Run against the frozen legacy Code.gs and the refactored backend;
// the transcripts (responses + resulting sheet contents) must be identical.
const { FakeSpreadsheet, loadBackend } = require('./apps-script-runtime.cjs');
const syn = require('../fixtures/synthetic.cjs');

const T = syn.TEST_TOKEN;
const auth = (p) => ({ token: T, nativeVersion: '3', webVersion: '1', ...p });
const tx = (id, over = {}) => ({ id, timestamp: '2026-11-02T03:04:05.000Z', date: '2026-11-02', type: 'Expense', amount: '125000', category: 'food', person: 'Vợ', note: 'Bữa trưa', ...over });
const base = (o) => JSON.stringify({ date: o.date, type: o.type, amount: Number(o.amount), category: o.category, person: o.person, note: o.note });

function steps() {
  const s = [];
  const add = (label, params) => s.push({ label, params });
  add('get', null);
  add('no token', { action: 'snapshot', nativeVersion: '3' });
  add('wrong token', { action: 'snapshot', nativeVersion: '3', token: 'x'.repeat(31) });
  add('old client', { action: 'snapshot', token: T });
  add('wrong nativeVersion', { action: 'snapshot', token: T, nativeVersion: '2' });
  add('unknown action', auth({ action: 'drop_tables' }));
  add('snapshot initial', auth({ action: 'snapshot' }));
  add('create', auth({ action: 'v3_create', ...tx('c-1') }));
  add('create replay (response lost)', auth({ action: 'v3_create', ...tx('c-1') }));
  add('create income', auth({ action: 'v3_create', ...tx('c-2', { type: 'Income', category: 'salary', amount: '30000000', note: '' }) }));
  add('create formula note', auth({ action: 'v3_create', ...tx('c-3', { note: '=HYPERLINK("x")', person: '+Chồng', category: '@food' }) }));
  add('create long note', auth({ action: 'v3_create', ...tx('c-4', { note: 'n'.repeat(2100) }) }));
  for (const [label, over] of [
    ['amount zero', { amount: '0' }], ['amount negative', { amount: '-5' }], ['amount NaN', { amount: 'abc' }], ['amount Infinity', { amount: 'Infinity' }],
    ['amount over limit', { amount: '1000000000001' }], ['amount at limit', { amount: '1000000000000' }], ['bad date', { date: '02/11/2026' }], ['bad type', { type: 'Transfer' }]
  ]) add('validate ' + label, auth({ action: 'v3_create', ...tx('v-' + label.replace(/\s/g, '-'), over) }));
  add('id missing', auth({ action: 'v3_create', ...tx('') }));
  add('id too long', auth({ action: 'v3_create', ...tx('i'.repeat(151)) }));
  add('id 150 ok', auth({ action: 'v3_create', ...tx('i'.repeat(150)) }));
  const original = tx('c-1');
  add('update without base', auth({ action: 'v3_update', ...tx('c-1', { amount: '130000' }) }));
  add('update stale base', auth({ action: 'v3_update', ...tx('c-1', { amount: '130000' }), base: base({ ...original, amount: '1' }) }));
  add('update ok', auth({ action: 'v3_update', ...tx('c-1', { amount: '130000', timestamp: '2026-11-03T00:00:00.000Z' }), base: base(original) }));
  add('update replay identical', auth({ action: 'v3_update', ...tx('c-1', { amount: '130000' }), base: base(original) }));
  add('update type change', auth({ action: 'v3_update', ...tx('c-1', { type: 'Income', amount: '130000', category: 'food' }), base: base({ ...original, amount: '130000' }) }));
  add('update missing row', auth({ action: 'v3_update', ...tx('nope'), base: base(original) }));
  add('update formula note round-trip', auth({ action: 'v3_update', ...tx('c-3', { note: '=HYPERLINK("y")', person: '+Chồng', category: '@food' }), base: base(tx('c-3', { note: '=HYPERLINK("x")', person: '+Chồng', category: '@food' })) }));
  add('delete', auth({ action: 'v3_delete', id: 'c-2' }));
  add('delete replay', auth({ action: 'v3_delete', id: 'c-2' }));
  add('delete unknown', auth({ action: 'v3_delete', id: 'never-existed' }));
  add('snapshot after writes', auth({ action: 'snapshot' }));
  add('budgets invalid json', auth({ action: 'save_budgets', values: 'not json', revision: '' }));
  add('budgets array', auth({ action: 'save_budgets', values: '[]', revision: '' }));
  add('budgets unknown category', auth({ action: 'save_budgets', values: JSON.stringify({ casino: 1 }), revision: '' }));
  add('budgets -1 unscoped', auth({ action: 'save_budgets', values: JSON.stringify({ 'loan-payment': -1 }), revision: '' }));
  add('budgets -1 scoped non-loan', auth({ action: 'save_budgets', values: JSON.stringify({ '2026-11:food': -1 }), revision: '' }));
  add('budgets stale revision', auth({ action: 'save_budgets', values: JSON.stringify({ food: 1 }), revision: 'stale' }));
  return s;
}

function run(files, { seed = true, properties = { FAMILY_ACCESS_TOKEN: T } } = {}) {
  const ss = new FakeSpreadsheet();
  if (seed) syn.seedSpreadsheet(ss, { txs: syn.transactions({ monthCount: 3, perMonth: 4 }) });
  const rt = loadBackend(files, { spreadsheet: ss, properties });
  const transcript = [];
  let revision = null;
  for (const step of steps()) {
    const res = step.params ? rt.post(step.params) : rt.get();
    if (res.budgets && res.budgets.revision) revision = res.budgets.revision;
    transcript.push({ label: step.label, res });
  }
  // Revision-dependent budget steps.
  const valid = { ...syn.budgets(), food: 4200000, '2026-12:loan-payment': -1 };
  for (const [label, params] of [
    ['budgets save ok', { action: 'save_budgets', values: JSON.stringify(valid), revision }],
    ['budgets save same values with stale revision', { action: 'save_budgets', values: JSON.stringify(valid), revision }],
    ['budgets other device stale', { action: 'save_budgets', values: JSON.stringify({ ...valid, food: 1 }), revision }]
  ]) transcript.push({ label, res: rt.post(auth(params)) });
  const sheets = {};
  for (const sheet of ss.getSheets()) sheets[sheet.getName()] = sheet.dump().map(r => sheet.getName() === 'Budgets' ? r.slice(0, 2) : r);
  return { transcript, sheets, rt };
}

module.exports = { run, steps, auth, tx, base };

'use strict';
// Deterministic SYNTHETIC household data. Every name, amount and loan figure is
// invented. Never replace these with real records.
function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const EXPENSE = ['food', 'grocery', 'kids', 'transport', 'home', 'bills', 'health', 'couple-allowance', 'other', 'loan-payment'];
const INCOME = ['salary', 'bonus', 'business', 'other-income'];
const PEOPLE = ['Vợ', 'Chồng', 'Gia đình'];
const NOTES = ['', 'Siêu thị A', 'Chợ sáng', 'Xăng xe', 'Học phí', 'Điện tháng', '=1+1', '@mention', '+84 test', '-dash', 'Ghi chú <b>html</b>'];

function months(start, count) {
  const [y, m] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 + i, 1)); return d.toISOString().slice(0, 7); });
}

function transactions({ seed = 7, start = '2026-05', monthCount = 10, perMonth = 18 } = {}) {
  const rnd = prng(seed), out = [];
  let n = 0;
  for (const month of months(start, monthCount)) {
    const [y, m] = month.split('-').map(Number), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push({ id: 'syn-' + (++n), timestamp: `${month}-01T02:00:00.000Z`, date: `${month}-0${1 + Math.floor(rnd() * 5)}`, type: 'Income', amount: 20000000 + Math.round(rnd() * 50) * 100000, category: 'salary', person: 'Chồng', note: 'Lương tổng hợp' });
    if (rnd() < 0.4) out.push({ id: 'syn-' + (++n), timestamp: `${month}-15T02:00:00.000Z`, date: `${month}-15`, type: 'Income', amount: 1000000 + Math.round(rnd() * 30) * 100000, category: INCOME[1 + Math.floor(rnd() * 3)], person: PEOPLE[Math.floor(rnd() * 3)], note: '' });
    for (let i = 0; i < perMonth; i++) {
      const day = String(1 + Math.floor(rnd() * days)).padStart(2, '0');
      out.push({ id: 'syn-' + (++n), timestamp: `${month}-${day}T0${Math.floor(rnd() * 9)}:00:00.000Z`, date: `${month}-${day}`, type: 'Expense', amount: (5 + Math.floor(rnd() * 400)) * 1000, category: EXPENSE[Math.floor(rnd() * EXPENSE.length)], person: PEOPLE[Math.floor(rnd() * 3)], note: NOTES[Math.floor(rnd() * NOTES.length)] });
    }
  }
  return out;
}

function budgets() {
  return {
    food: 4000000, grocery: 3000000, kids: 2500000, transport: 1200000, home: 0, bills: 1500000, health: 800000, 'couple-allowance': 1000000, other: 500000,
    '2026-08:food': 4500000, '2026-09:loan-payment': 9000000, '2026-11:loan-payment': -1, '2026-12:transport': 1500000
  };
}

// Synthetic loan schedule (fake figures). Techcombank rows from 2026-11 are
// included on purpose: the backend must exclude them.
function loanRows() {
  const rows = [['Bank', 'Month', 'Principal', 'Rate', 'Interest', 'Days']];
  let shinhan = 900000000, tcb = 300000000;
  for (const month of months('2026-10', 18)) {
    const [y, m] = month.split('-').map(Number), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    rows.push(['Shinhan', "'" + month, shinhan, 0.075, Math.round(shinhan * 0.075 * days / 365), days]);
    if (month !== '2027-02') rows.push(['Techcombank', "'" + month, tcb, 0.09, Math.round(tcb * 0.09 * days / 365), days]);
    shinhan -= 5000000; tcb -= 909400;
  }
  return rows;
}
function loanSchedule() {
  // Shape returned by readPrivateLoans for loanRows() (Techcombank >= 2026-11 removed).
  const out = { start: '2026-10', end: '2030-12', records: [], extraDebt: 2000000 };
  for (const r of loanRows().slice(1)) { const month = r[1].slice(1); if (r[0] === 'Techcombank' && month >= '2026-11') continue; out.records.push({ bank: r[0], month, principal: r[2], rate: r[3], interest: r[4], days: r[5] }); }
  return out;
}

function transactionSheetRows(list) {
  return [['ID', 'Timestamp', 'Date', 'Type', 'Amount', 'Category', 'Person', 'Note'], ...list.map(t => [t.id, t.timestamp, t.date, t.type, t.amount, t.category, t.person, /^[=+@-]/.test(t.note) ? "'" + t.note : t.note])];
}
function budgetSheetRows(values) {
  return [['Category', 'Budget', 'UpdatedAt'], ...Object.keys(values).sort().map(k => [k, values[k], '2026-01-01T00:00:00.000Z'])];
}

const TEST_TOKEN = 'synthetic-test-token-0123456789';

function seedSpreadsheet(ss, { txs = transactions(), budgetValues = budgets(), loans = true, extraDebt = 2000000 } = {}) {
  ss.seed('Transactions', transactionSheetRows(txs));
  ss.seed('Budgets', budgetSheetRows(budgetValues));
  if (loans) { ss.seed('Loans', loanRows()); ss.seed('FinanceSettings', [['Key', 'Value'], ['ExtraDebtMonthly', extraDebt]]); }
  return ss;
}

module.exports = { prng, months, transactions, budgets, loanRows, loanSchedule, transactionSheetRows, budgetSheetRows, seedSpreadsheet, TEST_TOKEN, EXPENSE, INCOME, PEOPLE };

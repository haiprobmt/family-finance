'use strict';
// In-memory Google Sheets REST API (the 3 calls server/sheets-api.js makes), applying batchUpdate
// requests the way Sheets does: atomic, grid limits enforced, values and number formats stored
// separately, dates as serial numbers in the spreadsheet's time zone. Synthetic data only.
const { serialToMs, msToSerial, wallToUtc, formatDate } = require('../../server/workbook');

const clone = v => JSON.parse(JSON.stringify(v));

// Value typed by a person (seed): same parsing rules as the Apps Script emulation.
function userEntered(value, tz) {
  if (typeof value === 'number') return { v: { numberValue: value } };
  if (typeof value === 'boolean') return { v: { boolValue: value } };
  if (value === '' || value == null) return {};
  const text = String(value);
  if (text.startsWith("'")) return { v: { stringValue: text.slice(1) } };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) return { v: { numberValue: msToSerial(wallToUtc(Date.UTC(+m[1], +m[2] - 1, +m[3]), tz), tz) }, fmt: 'DATE' };
  if (/^-?\d+(\.\d+)?$/.test(text) && text.length < 16) return { v: { numberValue: Number(text) } };
  return { v: { stringValue: text } };
}

class FakeSheetsApi {
  constructor({ timeZone = 'Asia/Ho_Chi_Minh', title = 'Synthetic' } = {}) {
    this.state = { timeZone, title, sheets: [] };
    this.calls = { getMetadata: 0, getSheetData: 0, batchUpdate: 0 };
    this.nextId = 100;
    this.failNextBatch = null;
  }
  sheet(title) { return this.state.sheets.find(s => s.title === title) || null; }
  // Test helper: create/replace a sheet from a 2D array of typed values.
  seed(title, rows) {
    let s = this.sheet(title);
    if (!s) { s = { sheetId: this.nextId++, title, rowCount: 1000, columnCount: 26, frozen: 0, cells: [] }; this.state.sheets.push(s); }
    s.cells = rows.map(r => r.map(v => userEntered(v, this.state.timeZone)));
    return this;
  }
  async getMetadata() {
    this.calls.getMetadata++;
    return clone({ title: this.state.title, timeZone: this.state.timeZone, sheets: this.state.sheets.map(({ sheetId, title, rowCount, columnCount }) => ({ sheetId, title, rowCount, columnCount })) });
  }
  async getSheetData(titles) {
    this.calls.getSheetData++;
    const out = new Map();
    for (const t of titles) {
      const s = this.sheet(t);
      if (!s) throw Object.assign(new Error('Google Sheets 400: Unable to parse range: ' + t), { status: 400 });
      out.set(t, clone(s.cells.map(r => r.map(c => (c && c.v ? { effectiveValue: c.v, ...(c.fmt ? { effectiveFormat: { numberFormat: { type: c.fmt } } } : {}) } : {})))));
    }
    return out;
  }
  async batchUpdate(requests) {
    this.calls.batchUpdate++;
    if (this.failNextBatch) { const e = this.failNextBatch; this.failNextBatch = null; throw e; }
    const backup = clone(this.state);
    try { for (const r of requests) this.apply(r); }
    catch (e) { this.state = backup; throw e; }
    return { replies: requests.map(() => ({})) };
  }
  byId(id) { const s = this.state.sheets.find(x => x.sheetId === id); if (!s) throw new Error('No grid with id: ' + id); return s; }
  apply(r) {
    const [kind] = Object.keys(r), q = r[kind];
    if (kind === 'addSheet') {
      const p = q.properties;
      if (this.sheet(p.title)) throw new Error('A sheet with the name "' + p.title + '" already exists.');
      if (this.state.sheets.some(s => s.sheetId === p.sheetId)) throw new Error('duplicate sheetId');
      this.state.sheets.push({ sheetId: p.sheetId, title: p.title, rowCount: p.gridProperties.rowCount, columnCount: p.gridProperties.columnCount, frozen: 0, cells: [] });
    } else if (kind === 'updateCells') {
      if (q.fields !== 'userEnteredValue') throw new Error('fake: unsupported fields ' + q.fields);
      const s = this.byId(q.start.sheetId);
      q.rows.forEach((row, i) => (row.values || []).forEach((cell, j) => {
        const ri = q.start.rowIndex + i, ci = q.start.columnIndex + j;
        if (ri >= s.rowCount || ci >= s.columnCount) throw new Error('Range exceeds grid limits');
        while (s.cells.length <= ri) s.cells.push([]);
        const target = s.cells[ri][ci] || (s.cells[ri][ci] = {});
        const v = cell.userEnteredValue;
        if (v && 'formulaValue' in v) throw new Error('fake: formulas are never written');
        if (v) target.v = clone(v); else delete target.v;
      }));
    } else if (kind === 'repeatCell') {
      if (q.fields !== 'userEnteredFormat.numberFormat') throw new Error('fake: unsupported fields ' + q.fields);
      const s = this.byId(q.range.sheetId);
      for (let ri = q.range.startRowIndex; ri < q.range.endRowIndex; ri++) for (let ci = q.range.startColumnIndex; ci < q.range.endColumnIndex; ci++) {
        if (ri >= s.rowCount || ci >= s.columnCount) throw new Error('Range exceeds grid limits');
        while (s.cells.length <= ri) s.cells.push([]);
        const target = s.cells[ri][ci] || (s.cells[ri][ci] = {});
        target.fmt = q.cell.userEnteredFormat.numberFormat.type;
      }
    } else if (kind === 'deleteDimension') {
      const s = this.byId(q.range.sheetId);
      if (q.range.dimension !== 'ROWS') throw new Error('fake: rows only');
      const n = q.range.endIndex - q.range.startIndex;
      if (q.range.endIndex > s.rowCount) throw new Error('Range exceeds grid limits');
      if (s.rowCount - n < 1) throw new Error("You can't delete all the rows on the sheet.");
      s.cells.splice(q.range.startIndex, n);
      s.rowCount -= n;
    } else if (kind === 'appendDimension') {
      const s = this.byId(q.sheetId);
      if (q.dimension === 'ROWS') s.rowCount += q.length; else s.columnCount += q.length;
    } else if (kind === 'updateSheetProperties') {
      const s = this.byId(q.properties.sheetId);
      s.frozen = q.properties.gridProperties.frozenRowCount;
    } else throw new Error('fake: unsupported request ' + kind);
  }
  // Test helper: like FakeSheet.dump() — dates as YYYY-MM-DD, trailing empty cells/rows trimmed.
  dump(title) {
    const s = this.sheet(title), tz = this.state.timeZone;
    const rows = s.cells.map(r => Array.from(r, c => {
      if (!c || !c.v) return '';
      if ('numberValue' in c.v) return c.fmt ? formatDate(new Date(serialToMs(c.v.numberValue, tz)), tz, 'yyyy-MM-dd') : c.v.numberValue;
      return 'stringValue' in c.v ? c.v.stringValue : c.v.boolValue;
    }));
    for (const r of rows) while (r.length && r[r.length - 1] === '') r.pop();
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    return rows;
  }
  titles() { return this.state.sheets.map(s => s.title); }
}

module.exports = { FakeSheetsApi };

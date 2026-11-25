'use strict';
// In-memory copy of the spreadsheet for ONE request, exposing the subset of SpreadsheetApp the
// backend (apps-script/*.gs) uses. Reads come from data loaded through the Sheets API; writes
// change the copy immediately (so later reads in the same request see them, as in Apps Script)
// and are recorded as Sheets API batchUpdate requests, sent in one atomic call after the request
// succeeds. A sheet whose data is not loaded yet throws NeedData; the runtime loads it and
// re-runs the request (see gas-runtime.js).

class NeedData extends Error {
  constructor(kind, name) { super('need ' + kind + (name ? ' ' + name : '')); this.need = { kind, name }; }
}

// ---- time zone helpers (spreadsheet serial numbers are wall-clock time in the sheet's zone) ----
const dtfCache = new Map();
function partsIn(tz, ms) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dtfCache.set(tz, f);
  }
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}
// Milliseconds to add to a UTC instant to get the wall-clock time in tz.
function tzOffset(tz, ms) {
  const p = partsIn(tz, ms);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}
function wallToUtc(wallMs, tz) {
  let utc = wallMs - tzOffset(tz, wallMs);
  utc = wallMs - tzOffset(tz, utc);
  return utc;
}
const SERIAL_EPOCH_DAYS = 25569; // 1899-12-30 → 1970-01-01
function serialToMs(serial, tz) { return wallToUtc(Math.round((serial - SERIAL_EPOCH_DAYS) * 86400000), tz); }
function msToSerial(ms, tz) { return (ms + tzOffset(tz, ms)) / 86400000 + SERIAL_EPOCH_DAYS; }

// Utilities.formatDate subset: yyyy MM dd HH mm ss.
function formatDate(date, tz, pattern) {
  const p = partsIn(tz, date.getTime()), pad = n => String(n).padStart(2, '0');
  const map = { yyyy: String(p.year), MM: pad(p.month), dd: pad(p.day), HH: pad(p.hour), mm: pad(p.minute), ss: pad(p.second) };
  return String(pattern).replace(/yyyy|MM|dd|HH|mm|ss/g, k => map[k]);
}

const isDate = v => Object.prototype.toString.call(v) === '[object Date]';
const DATE_TYPES = new Set(['DATE', 'DATE_TIME', 'TIME']);

// Sheets API CellData → the value Apps Script's getValues() would return.
function fromCell(cell, tz, DateCtor) {
  const ev = cell && cell.effectiveValue;
  if (!ev) return '';
  if (Object.prototype.hasOwnProperty.call(ev, 'numberValue')) {
    const type = cell.effectiveFormat && cell.effectiveFormat.numberFormat && cell.effectiveFormat.numberFormat.type;
    return DATE_TYPES.has(type) ? new DateCtor(serialToMs(ev.numberValue, tz)) : ev.numberValue;
  }
  if (Object.prototype.hasOwnProperty.call(ev, 'stringValue')) return ev.stringValue;
  if (Object.prototype.hasOwnProperty.call(ev, 'boolValue')) return ev.boolValue;
  if (Object.prototype.hasOwnProperty.call(ev, 'errorValue')) return cell.formattedValue || '#ERROR!';
  return '';
}

// A value written by setValues/appendRow, as Sheets stores it when Apps Script writes it:
// a leading apostrophe forces text (and is not returned), YYYY-MM-DD becomes a date at local
// midnight, plain numeric text becomes a number. Everything else stays text.
function coerce(value, tz, DateCtor) {
  if (isDate(value)) return new DateCtor(value.getTime());
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.startsWith("'")) return text.slice(1);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3], t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d) return new DateCtor(wallToUtc(t.getTime(), tz));
    return text;
  }
  if (/^-?\d+(\.\d+)?$/.test(text) && text.length < 16) return Number(text);
  return text;
}

// Model value → CellData for updateCells (fields: userEnteredValue). Strings are always literal.
function toCell(v, tz) {
  if (isDate(v)) return { userEnteredValue: { numberValue: msToSerial(v.getTime(), tz) } };
  if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
  if (typeof v === 'boolean') return { userEnteredValue: { boolValue: v } };
  if (v === '' || v === null || v === undefined) return {};
  return { userEnteredValue: { stringValue: String(v) } };
}
function dateFormat(v, tz) {
  const p = partsIn(tz, v.getTime());
  return p.hour || p.minute || p.second ? { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm:ss' } : { type: 'DATE', pattern: 'yyyy-mm-dd' };
}

const empty = v => v === '' || v === null || v === undefined;

class Sheet {
  constructor(book, meta, rows) {
    this.book = book; this.sheetId = meta.sheetId; this.name = meta.title;
    this.rowCount = meta.rowCount || 1000; this.columnCount = meta.columnCount || 26;
    this.rows = rows; // null until loaded
  }
  data() {
    if (!this.rows) { this.book.needs.add(this.name); throw new NeedData('sheet', this.name); }
    return this.rows;
  }
  getName() { return this.name; }
  getLastRow() { const r = this.data(); for (let i = r.length - 1; i >= 0; i--) if (r[i].some(v => !empty(v))) return i + 1; return 0; }
  getLastColumn() { let n = 0; for (const row of this.data()) for (let c = row.length - 1; c >= n; c--) if (!empty(row[c])) { n = c + 1; break; } return n; }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(row, col, numRows = 1, numCols = 1) {
    if (!(row >= 1 && col >= 1 && numRows >= 1 && numCols >= 1)) throw new Error('Phạm vi không hợp lệ.');
    const sheet = this, book = this.book;
    return {
      getValues() {
        const rows = sheet.data(), out = [];
        for (let r = 0; r < numRows; r++) {
          const src = rows[row - 1 + r] || [], line = [];
          for (let c = 0; c < numCols; c++) { const v = src[col - 1 + c]; line.push(empty(v) ? '' : isDate(v) ? new book.DateCtor(v.getTime()) : v); }
          out.push(line);
        }
        return out;
      },
      getValue() { return this.getValues()[0][0]; },
      setValues(values) {
        if (!Array.isArray(values) || values.length !== numRows || values.some(v => !Array.isArray(v) || v.length !== numCols)) throw new Error('The number of rows or columns in the data does not match the range.');
        sheet.write(row, col, values);
        return this;
      },
      setValue(v) { return this.setValues([[v]]); },
      setNumberFormat() { return this; }
    };
  }
  appendRow(values) { this.write(this.getLastRow() + 1, 1, [values]); return this; }
  write(row, col, values) {
    const rows = this.data(), tz = this.book.timeZone, D = this.book.DateCtor;
    const coerced = values.map(line => line.map(v => coerce(v, tz, D)));
    for (let r = 0; r < coerced.length; r++) {
      const idx = row - 1 + r;
      while (rows.length <= idx) rows.push([]);
      for (let c = 0; c < coerced[r].length; c++) rows[idx][col - 1 + c] = coerced[r][c];
    }
    this.book.ensureGrid(this, row - 1 + coerced.length, col - 1 + (coerced[0] ? coerced[0].length : 0));
    this.book.ops.push({ updateCells: { start: { sheetId: this.sheetId, rowIndex: row - 1, columnIndex: col - 1 }, rows: coerced.map(line => ({ values: line.map(v => toCell(v, tz)) })), fields: 'userEnteredValue' } });
    coerced.forEach((line, r) => line.forEach((v, c) => {
      if (!isDate(v)) return;
      const range = { sheetId: this.sheetId, startRowIndex: row - 1 + r, endRowIndex: row + r, startColumnIndex: col - 1 + c, endColumnIndex: col + c };
      this.book.ops.push({ repeatCell: { range, cell: { userEnteredFormat: { numberFormat: dateFormat(v, tz) } }, fields: 'userEnteredFormat.numberFormat' } });
    }));
  }
  deleteRow(n) {
    const rows = this.data();
    if (!(n >= 1 && n <= this.rowCount)) throw new Error('Row out of range: ' + n);
    rows.splice(n - 1, 1);
    this.rowCount--;
    this.book.ops.push({ deleteDimension: { range: { sheetId: this.sheetId, dimension: 'ROWS', startIndex: n - 1, endIndex: n } } });
  }
  setFrozenRows(n) {
    this.book.ops.push({ updateSheetProperties: { properties: { sheetId: this.sheetId, gridProperties: { frozenRowCount: n } }, fields: 'gridProperties.frozenRowCount' } });
  }
}

class Workbook {
  // meta: {timeZone, sheets:[{sheetId,title,rowCount,columnCount}]}; loaded: Map title → CellData[][]
  constructor(meta, loaded, DateCtor = Date) {
    this.timeZone = meta.timeZone || 'Asia/Ho_Chi_Minh';
    this.DateCtor = DateCtor;
    this.ops = [];
    this.needs = new Set(); // sheet titles whose data the request needs but are not loaded yet
    this.sheets = new Map();
    for (const m of meta.sheets) {
      const raw = loaded.get(m.title);
      this.sheets.set(m.title, new Sheet(this, m, raw ? raw.map(line => line.map(cell => fromCell(cell, this.timeZone, DateCtor))) : null));
    }
  }
  ensureGrid(sheet, rows, cols) {
    if (rows > sheet.rowCount) { this.ops.push({ appendDimension: { sheetId: sheet.sheetId, dimension: 'ROWS', length: rows - sheet.rowCount } }); sheet.rowCount = rows; }
    if (cols > sheet.columnCount) { this.ops.push({ appendDimension: { sheetId: sheet.sheetId, dimension: 'COLUMNS', length: cols - sheet.columnCount } }); sheet.columnCount = cols; }
  }
  // ---- Spreadsheet API ----
  getSheetByName(name) { return this.sheets.get(String(name)) || null; }
  getSheets() { return [...this.sheets.values()]; }
  getSpreadsheetTimeZone() { return this.timeZone; }
  insertSheet(name) {
    name = String(name);
    if (this.sheets.has(name)) throw new Error('A sheet with the name "' + name + '" already exists. Please enter another name.');
    const used = new Set([...this.sheets.values()].map(s => s.sheetId));
    let sheetId;
    do sheetId = 1 + Math.floor(Math.random() * 2147483000); while (used.has(sheetId));
    const meta = { sheetId, title: name, rowCount: 1000, columnCount: 26 };
    this.ops.push({ addSheet: { properties: { sheetId, title: name, gridProperties: { rowCount: meta.rowCount, columnCount: meta.columnCount } } } });
    const sheet = new Sheet(this, meta, []);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

module.exports = { Workbook, NeedData, formatDate, serialToMs, msToSerial, wallToUtc, tzOffset, coerce, fromCell, toCell };

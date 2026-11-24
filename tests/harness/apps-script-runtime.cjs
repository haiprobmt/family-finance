'use strict';
// In-memory emulation of the Apps Script services used by apps-script/*.gs.
// It models the Google Sheets behaviours the backend depends on:
//  - date-like strings written to cells become Date objects (YYYY-MM-DD, and
//    YYYY-MM when autoParseMonths is enabled, as Sheets does for unformatted cells);
//  - numeric strings become numbers;
//  - a leading apostrophe forces literal text and is not returned by getValues();
//  - getDataRange() returns a rectangular grid padded with ''.
// Synthetic data only. Never point this at real spreadsheet exports.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');

const isDate = v => Object.prototype.toString.call(v) === '[object Date]';
function coerce(value, opts) {
  const D = opts.DateCtor || Date;
  if (isDate(value)) return new D(value.getTime());
  if ( typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.startsWith("'")) return text.slice(1);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) return new D(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{4})-(\d{2})$/.exec(text);
  if (m && opts.autoParseMonths) return new D(Date.UTC(+m[1], +m[2] - 1, 1));
  if (/^-?\d+(\.\d+)?$/.test(text) && text.length < 16) return Number(text);
  return text;
}

class FakeSheet {
  constructor(name, opts) { this.name = name; this.rows = []; this.opts = opts; this.frozen = 0; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((n, r) => Math.max(n, r.length), 0); }
  appendRow(values) { this.rows.push(values.map(v => coerce(v, this.opts))); return this; }
  deleteRow(n) { if (n < 1 || n > this.rows.length) throw new Error('Row out of range: ' + n); this.rows.splice(n - 1, 1); }
  setFrozenRows(n) { this.frozen = n; }
  getDataRange() {
    const nr = Math.max(1, this.getLastRow()), nc = Math.max(1, this.getLastColumn());
    return this.getRange(1, 1, nr, nc);
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    const sheet = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const src = sheet.rows[row - 1 + r] || [];
          const line = [];
          for (let c = 0; c < numCols; c++) { const v = src[col - 1 + c]; line.push(v === undefined ? '' : (isDate(v) ? new (sheet.opts.DateCtor || Date)(v.getTime()) : v)); }
          out.push(line);
        }
        return out;
      },
      setValues(values) {
        if (values.length !== numRows || values.some(v => v.length !== numCols)) throw new Error('The number of rows or columns in the data does not match the range.');
        for (let r = 0; r < numRows; r++) {
          const idx = row - 1 + r;
          while (sheet.rows.length <= idx) sheet.rows.push([]);
          const target = sheet.rows[idx];
          for (let c = 0; c < numCols; c++) target[col - 1 + c] = coerce(values[r][c], sheet.opts);
        }
        // Sheets has no "trailing empty rows" in getLastRow; trim fully empty tail rows.
        while (sheet.rows.length && sheet.rows[sheet.rows.length - 1].every(v => v === '' || v === undefined)) sheet.rows.pop();
        return this;
      },
      setValue(v) { return this.setValues([[v]]); },
      getValue() { return this.getValues()[0][0]; },
      setNumberFormat() { return this; }
    };
  }
  // Test helper: plain JSON view with dates as YYYY-MM-DD.
  dump() { return this.rows.map(r => r.map(v => isDate(v) ? v.toISOString().slice(0, 10) : v)); }
}

class FakeSpreadsheet {
  constructor(opts = {}) { this.opts = { autoParseMonths: false, timeZone: 'Asia/Ho_Chi_Minh', ...opts }; this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { if (this.sheets.has(name)) throw new Error('A sheet with the name "' + name + '" already exists.'); const s = new FakeSheet(name, this.opts); this.sheets.set(name, s); return s; }
  getSheets() { return [...this.sheets.values()]; }
  getSpreadsheetTimeZone() { return this.opts.timeZone; }
  // Test helper: seed a sheet from a 2D array (values coerced like user entry).
  seed(name, rows) { const s = this.getSheetByName(name) || this.insertSheet(name); s.rows = []; rows.forEach(r => s.appendRow(r)); return s; }
}

function formatDate(date, tz, fmt) {
  // Fake dates are stored at UTC midnight; format with UTC fields for determinism.
  const d = isDate(date) ? date : new Date(date);
  const pad = n => String(n).padStart(2, '0');
  const map = { yyyy: d.getUTCFullYear(), MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()), HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()) };
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss/g, k => map[k]);
}

function createRuntime({ spreadsheet = new FakeSpreadsheet(), properties = {}, fetchHandler = null, now = null } = {}) {
  const props = { ...properties };
  const logs = [];
  const fetches = [];
  const globals = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ content: text, setMimeType() { return this; }, getContent() { return this.content; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, text) => [...crypto.createHash(alg).update(String(text), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
      formatDate,
      getUuid: () => crypto.randomUUID()
    },
    UrlFetchApp: {
      fetch(url, options) {
        fetches.push({ url, options });
        if (!fetchHandler) throw new Error('UrlFetchApp disabled in tests');
        const res = fetchHandler(url, options);
        return { getResponseCode: () => res.status, getContentText: () => (typeof res.body === 'string' ? res.body : JSON.stringify(res.body)) };
      }
    }
  };
  if (now) {
    const RealDate = Date;
    const fixed = new RealDate(now).getTime();
    globals.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  }
  const context = vm.createContext(globals);
  // Cells must hold Dates from the sandbox realm so `instanceof Date` works in .gs code.
  spreadsheet.opts.DateCtor = vm.runInContext('Date', context);
  for (const sheet of spreadsheet.getSheets()) sheet.rows = sheet.rows.map(r => r.map(v => coerce(v, spreadsheet.opts)));
  return { context, spreadsheet, props, logs, fetches };
}

// Load an ordered list of backend source files into one shared global scope,
// exactly like Apps Script concatenates project files.
function loadBackend(files, options = {}) {
  const rt = createRuntime(options);
  for (const file of files) {
    const code = fs.readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8');
    vm.runInContext(code, rt.context, { filename: file });
  }
  rt.post = params => JSON.parse(rt.context.doPost({ parameter: params }).getContent());
  rt.get = () => JSON.parse(rt.context.doGet({ parameter: {} }).getContent());
  rt.call = (name, ...args) => rt.context[name](...args);
  return rt;
}

// Backend file list as deployed (order matters only for top-level statements).
function backendFiles() {
  const dir = path.join(ROOT, 'apps-script');
  const manifest = path.join(dir, 'files.json');
  if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, 'utf8')).map(f => path.join('apps-script', f));
  return ['apps-script/Code.gs'];
}

module.exports = { FakeSpreadsheet, FakeSheet, createRuntime, loadBackend, backendFiles, formatDate, ROOT };

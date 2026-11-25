'use strict';
// Runs the family-finance backend (the plain-JavaScript files in apps-script/, bundled as
// apps-script/dist/Code.gs) on Node instead of Google Apps Script. The backend code is unchanged;
// this file provides the few Apps Script services it calls:
//   SpreadsheetApp   → workbook.js (a per-request copy of the Google Sheet, via the Sheets API)
//   PropertiesService→ environment variables (FAMILY_ACCESS_TOKEN, DEEPSEEK_API_KEY, AI_PROVIDER)
//   UrlFetchApp      → fetch()
//   Utilities, LockService, ContentService → small local equivalents
// The backend is synchronous while network calls are not. Each request therefore runs in
// passes: when the code touches sheet data or a URL that is not loaded yet, the pass records
// what it needs; the runtime loads it and runs the request again from the start. Only the final,
// complete pass's sheet writes are sent, as ONE atomic Sheets batchUpdate. Every pass works on
// fresh data copies, so discarded passes have no effect.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { Workbook, NeedData, formatDate } = require('./workbook');

const ROOT = path.join(__dirname, '..');
const BUNDLE = path.join(ROOT, 'apps-script', 'dist', 'Code.gs');
// Loaded together with the sheet list so a typical request needs just two Sheets reads.
const KNOWN_SHEETS = ['Transactions', 'Budgets', 'Loans', 'FinanceSettings', 'Migrations', 'Assets', 'AssetValuations', 'RecurringRules', 'Debts'];
const MAX_PASSES = 8;
const RUN_TIMEOUT_MS = 20000;

class NeedFetch extends Error {}

function loadCode(file, buildId) {
  const code = fs.readFileSync(file, 'utf8');
  const marker = "const BUILD_ID='dev';";
  if (!code.includes(marker)) throw new Error('BUILD_ID marker missing in ' + file);
  return code.replace(marker, 'const BUILD_ID=' + JSON.stringify(String(buildId || 'dev')) + ';');
}

// sheets: { getMetadata(), getSheetData(titles), batchUpdate(requests) } (sheets-api.js or a test fake)
function createBackend({ sheets, properties = {}, buildId = 'dev', file = BUNDLE, fetchImpl = globalThis.fetch, log = console, now = null } = {}) {
  const props = { ...properties };
  let current = null; // state of the pass being executed (passes are synchronous, never interleaved)

  const textOutput = text => ({ content: String(text), setMimeType() { return this; }, getContent() { return this.content; } });
  const globals = {
    console: { log: (...a) => log.log('[backend]', ...a), info: (...a) => log.log('[backend]', ...a), warn: (...a) => log.warn('[backend]', ...a), error: (...a) => log.error('[backend]', ...a) },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        if (!current.book) { current.needMeta = true; throw new NeedData('meta'); }
        return current.book;
      },
      flush() {}
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (Object.prototype.hasOwnProperty.call(props, k) && props[k] !== '' ? String(props[k]) : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    // Requests that write are already serialised by the server (see index.js).
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {}, hasLock() { return true; } }) },
    ContentService: { MimeType: { JSON: 'application/json', TEXT: 'text/plain' }, createTextOutput: textOutput },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5', SHA_1: 'sha1' },
      computeDigest: (alg, text) => [...crypto.createHash(alg).update(String(text), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
      formatDate: (date, tz, pattern) => formatDate(date, tz, pattern),
      getUuid: () => crypto.randomUUID()
    },
    UrlFetchApp: {
      fetch(url, options = {}) {
        const key = JSON.stringify([String(url), options]);
        if (!current.fetched.has(key)) { current.fetchNeeds.set(key, { url: String(url), options }); throw new NeedFetch('Đang gọi dịch vụ bên ngoài.'); }
        const res = current.fetched.get(key);
        if (res.error) throw new Error(res.error);
        if (res.status >= 400 && !options.muteHttpExceptions) throw new Error('Request failed for ' + url + ' returned code ' + res.status);
        return { getResponseCode: () => res.status, getContentText: () => res.body, getHeaders: () => ({}) };
      }
    }
  };
  if (now) {
    const RealDate = Date, fixed = new RealDate(now).getTime();
    globals.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  }
  const context = vm.createContext(globals);
  vm.runInContext(loadCode(file, buildId), context, { filename: path.basename(file), timeout: RUN_TIMEOUT_MS });
  const DateCtor = vm.runInContext('Date', context);

  async function doFetch({ url, options }) {
    const headers = { ...(options.headers || {}) };
    if (options.contentType) headers['Content-Type'] = options.contentType;
    try {
      const res = await fetchImpl(url, { method: String(options.method || 'get').toUpperCase(), headers, body: options.payload == null ? undefined : String(options.payload), signal: AbortSignal.timeout(90000) });
      return { status: res.status, body: await res.text() };
    } catch (e) {
      return { error: 'Không gọi được ' + new URL(url).host + ': ' + (e.name === 'TimeoutError' ? 'hết thời gian chờ' : e.message) };
    }
  }

  // Runs `source` (a call expression) in passes until it completes without missing data, then
  // commits its sheet writes. Throws what the final pass threw; returns what it returned.
  async function execute(source, request) {
    const state = { meta: null, loaded: new Map(), fetched: new Map() };
    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      current = { book: state.meta ? new Workbook(state.meta, state.loaded, DateCtor) : null, needMeta: false, fetchNeeds: new Map(), fetched: state.fetched };
      let result, error = null;
      try {
        context.__request = request;
        result = vm.runInContext(source, context, { timeout: RUN_TIMEOUT_MS });
      } catch (e) {
        error = e;
      } finally {
        delete context.__request;
      }
      const run = current;
      current = null;
      const sheetNeeds = run.book ? [...run.book.needs] : [];
      if (run.needMeta || sheetNeeds.length || run.fetchNeeds.size) {
        let toLoad = sheetNeeds;
        if (run.needMeta) {
          state.meta = await sheets.getMetadata();
          const titles = new Set(state.meta.sheets.map(s => s.title));
          toLoad = KNOWN_SHEETS.filter(t => titles.has(t));
        }
        toLoad = toLoad.filter(t => !state.loaded.has(t));
        if (toLoad.length) { const data = await sheets.getSheetData(toLoad); for (const t of toLoad) state.loaded.set(t, data.get(t) || []); }
        for (const [key, req] of run.fetchNeeds) state.fetched.set(key, await doFetch(req));
        continue;
      }
      if (error) throw error;
      if (run.book && run.book.ops.length) await sheets.batchUpdate(run.book.ops);
      return result;
    }
    throw new Error('Yêu cầu cần quá nhiều lần đọc Google Sheets.');
  }

  return {
    // GET/POST → the JSON text the backend produced (doGet/doPost never throw).
    async handle(method, parameter) {
      const output = await execute(method === 'GET' ? 'doGet(__request)' : 'doPost(__request)', { parameter: { ...parameter } });
      return output && typeof output.getContent === 'function' ? output.getContent() : JSON.stringify({ ok: false, error: 'Máy chủ không trả kết quả.' });
    },
    // A parameterless backend function, e.g. migrationsDryRun, setup.
    async runFunction(name) {
      if (!/^[A-Za-z_]\w*$/.test(name) || typeof context[name] !== 'function') throw new Error('Không có hàm ' + name);
      return execute(name + '()', null);
    },
    properties: props
  };
}

module.exports = { createBackend, KNOWN_SHEETS, BUNDLE };

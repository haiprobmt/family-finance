'use strict';
// Minimal Google Sheets API v4 client (no dependencies). Credentials, first match wins:
//   1. GOOGLE_APPLICATION_CREDENTIALS → a service-account key JSON (share the spreadsheet with its
//      client_email as Editor), or an "authorized_user" JSON (gcloud auth application-default login).
//   2. The VM's attached service account (Google Compute Engine metadata server).
const fs = require('fs');
const crypto = require('crypto');

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function createTokenSource({ credentialsFile, fetchImpl = globalThis.fetch }) {
  let creds = null;
  if (credentialsFile) {
    creds = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
    if (!['service_account', 'authorized_user'].includes(creds.type)) throw new Error('GOOGLE_APPLICATION_CREDENTIALS: unsupported credential type ' + creds.type);
  }
  let cached = null;
  async function fetchToken() {
    let res;
    if (creds && creds.type === 'service_account') {
      const now = Math.floor(Date.now() / 1000), aud = creds.token_uri || 'https://oauth2.googleapis.com/token';
      const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: creds.private_key_id })) + '.' + b64url(JSON.stringify({ iss: creds.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 }));
      const jwt = unsigned + '.' + b64url(crypto.sign('RSA-SHA256', Buffer.from(unsigned), creds.private_key));
      res = await fetchImpl(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }), signal: AbortSignal.timeout(20000) });
    } else if (creds) {
      res = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: creds.client_id, client_secret: creds.client_secret, refresh_token: creds.refresh_token }), signal: AbortSignal.timeout(20000) });
    } else {
      res = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=' + encodeURIComponent(SCOPE), { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) })
        .catch(() => { throw new Error('No Google credentials: set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file.'); });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error('Google sign-in failed (' + res.status + '): ' + (body.error_description || body.error || 'no access token'));
    return { token: body.access_token, expires: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  }
  return {
    describe: () => (creds ? (creds.type === 'service_account' ? 'service account ' + creds.client_email : 'user credentials') : 'VM metadata service account'),
    async get() {
      if (!cached || cached.expires - Date.now() < 120000) cached = await fetchToken();
      return cached.token;
    }
  };
}

function createSheetsClient({ spreadsheetId, credentialsFile, fetchImpl = globalThis.fetch }) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(String(spreadsheetId || ''))) throw new Error('SPREADSHEET_ID is missing or invalid (the long id in the spreadsheet URL between /d/ and /edit).');
  const tokens = createTokenSource({ credentialsFile, fetchImpl });
  const base = API + spreadsheetId;

  async function call(method, url, body, { retryAll = true } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, { method, headers: { Authorization: 'Bearer ' + await tokens.get(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
      if (res.ok) return res.json();
      // 429 = quota: the request was not applied, always safe to retry. 5xx only for reads.
      if (attempt < 3 && (res.status === 429 || (retryAll && res.status >= 500))) { await new Promise(r => setTimeout(r, 500 * 2 ** attempt + Math.random() * 300)); continue; }
      const err = await res.json().catch(() => ({}));
      const message = err.error && err.error.message || res.statusText;
      const hint = res.status === 403 ? ' — share the spreadsheet with ' + tokens.describe() + ' as Editor, and enable the Google Sheets API.' : res.status === 404 ? ' — check SPREADSHEET_ID.' : '';
      const e = new Error('Google Sheets ' + res.status + ': ' + message + hint);
      e.status = res.status;
      throw e;
    }
  }
  const quote = title => "'" + String(title).replace(/'/g, "''") + "'";

  return {
    describe: () => tokens.describe(),
    async getMetadata() {
      const j = await call('GET', base + '?fields=' + encodeURIComponent('properties(title,timeZone),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'));
      return {
        title: j.properties && j.properties.title,
        timeZone: j.properties && j.properties.timeZone || 'Asia/Ho_Chi_Minh',
        sheets: (j.sheets || []).map(s => ({ sheetId: s.properties.sheetId, title: s.properties.title, rowCount: s.properties.gridProperties && s.properties.gridProperties.rowCount, columnCount: s.properties.gridProperties && s.properties.gridProperties.columnCount }))
      };
    },
    // Map title → CellData[][] (rows from row 1, cells from column A; trailing empties may be absent).
    async getSheetData(titles) {
      const qs = new URLSearchParams({ includeGridData: 'true', fields: 'sheets(properties(title),data(startRow,startColumn,rowData(values(effectiveValue,effectiveFormat(numberFormat(type))))))' });
      for (const t of titles) qs.append('ranges', quote(t));
      const j = await call('GET', base + '?' + qs);
      const out = new Map();
      for (const s of j.sheets || []) {
        const d = (s.data || [])[0] || {};
        if ((d.startRow || 0) !== 0 || (d.startColumn || 0) !== 0) throw new Error('Unexpected grid offset for ' + s.properties.title);
        out.set(s.properties.title, (d.rowData || []).map(r => r.values || []));
      }
      return out;
    },
    async batchUpdate(requests) {
      return call('POST', base + ':batchUpdate', { requests }, { retryAll: false });
    }
  };
}

module.exports = { createSheetsClient, createTokenSource };

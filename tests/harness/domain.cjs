'use strict';
// Loads docs/src/domain/*.js into an isolated realm, as the browser does with <script>.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DIR = path.join(__dirname, '..', '..', 'docs', 'src', 'domain');
const FILES = JSON.parse(fs.readFileSync(path.join(DIR, 'files.json'), 'utf8'));
function loadDomain() {
  const ctx = vm.createContext({ Intl });
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  return ctx.FFDomain;
}
// Cross-realm values compare structurally after a JSON round trip.
const plain = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
module.exports = { loadDomain, plain, FILES, DIR };

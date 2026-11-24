// Local persistence adapter over the existing localStorage keys (implementation/BASELINE_AUDIT.md §4).
// Compatibility rules: legacy keys are never renamed or deleted here; new keys are additive.
// IndexedDB is intentionally not used until a tested migration/rollback exists.
(function (root) {
  'use strict';
  const PREFIX = 'ffpages:';
  const SCHEMA_VERSION = 3;
  const KEYS = {
    transactions: 'family_finance_transactions_v1', budgets: 'family_finance_budgets_v1', budgetSync: 'family_budget_sync_v2',
    pendingDeletes: 'family_deleted_v2', lastVerified: 'lastVerifiedV3', lastPerson: 'lastPerson', connection: 'connection',
    loanRates: 'family_finance_loan_rates_v1', loans: 'loans', legacyEndpoint: 'family_finance_endpoint_v1',
    // 3.0 additive keys
    ext: 'ext_cache_v1', hideAmounts: 'privacy_hide_amounts', schemaVersion: 'schema_version'
  };
  function createStore(storage) {
    const read = (key, fallback) => { try { const v = JSON.parse(storage.getItem(PREFIX + key)); return v ?? fallback; } catch { return fallback; } };
    const write = (key, value) => storage.setItem(PREFIX + key, JSON.stringify(value));
    return {
      read, write,
      // Records the schema marker. Legacy data is read in place; nothing is moved or dropped.
      migrate() { const from = read(KEYS.schemaVersion, null); if (from !== SCHEMA_VERSION) write(KEYS.schemaVersion, SCHEMA_VERSION); return { from, to: SCHEMA_VERSION }; },
      inventory() { const out = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); } return out.sort(); }
    };
  }
  root.FFData = { PREFIX, SCHEMA_VERSION, KEYS, createStore };
})(typeof globalThis !== 'undefined' ? globalThis : this);

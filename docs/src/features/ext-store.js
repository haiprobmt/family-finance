// Client store for the additive 3.0 collections (assets, valuations, recurring rules, debts).
// Local-first: edits are kept as a pending replacement with the base revision, pushed with
// ext_save, and surfaced as conflicts when another device changed the collection.
// A backend without ext_* actions (pre-3.0 deployment) is detected and left untouched.
(function (root) {
  'use strict';
  const E = root.FFSync.engine;
  const NAMES = ['assets', 'valuations', 'recurring', 'debts'];
  function createExtStore({ read, write, request, onChange }) {
    const saved = read('ext_cache_v1', null) || {};
    let state = { supported: saved.supported ?? null, lastError: null, collections: {} };
    for (const n of NAMES) state.collections[n] = { ...E.emptyCollection(), ...((saved.collections || {})[n] || {}) };
    const persist = () => { write('ext_cache_v1', { supported: state.supported, collections: state.collections }); if (onChange) onChange(); };
    const api = {
      NAMES,
      state: () => state,
      values: name => state.collections[name].values,
      collection: name => state.collections[name],
      edit(name, values) { state.collections[name] = E.editCollection(state.collections[name], values); persist(); },
      operations: () => E.pendingOperations({ ext: { collections: state.supported === false ? {} : state.collections } }),
      async sync() {
        let snap;
        try { snap = await request({ action: 'ext_snapshot' }); }
        catch (e) { if (/không được hỗ trợ/.test(e.message || '')) { state.supported = false; state.lastError = null; persist(); return 'unsupported'; } state.lastError = e.message; throw e; }
        state.supported = true; state.lastError = null;
        for (const n of NAMES) {
          const remote = snap.collections && snap.collections[n];
          let local = E.rebaseInitial(state.collections[n], remote);
          const decision = E.collectionDecision(local, remote);
          // No entry at all: the deployed Code.gs predates this collection (needs updating), as
          // opposed to available:false, where only the owner's migrationsApply step is missing.
          if (decision === 'unavailable') { state.collections[n] = { ...local, available: false, outdated: !remote }; continue; }
          if (decision === 'adopt') { state.collections[n] = E.adoptCollection(local, remote); continue; }
          if (decision === 'conflict') { state.collections[n] = { ...local, remote, available: true }; continue; }
          try {
            const res = await request({ action: 'ext_save', collection: n, values: JSON.stringify(local.pending.values), revision: local.pending.baseRevision || '' });
            state.collections[n] = E.adoptCollection(local, res.collection);
          } catch (e) {
            const p = e.payload || {};
            if (p.code === 'COLLECTION_CONFLICT') state.collections[n] = { ...local, remote: p.collection, available: true };
            else if (p.code === 'FEATURE_NOT_MIGRATED') state.collections[n] = { ...local, available: false };
            else { state.collections[n] = local; state.lastError = e.message; persist(); throw e; }
          }
        }
        persist();
        return 'ok';
      },
      resolve(name, choice) {
        const c = state.collections[name]; if (!c.remote) return;
        if (choice === 'remote') state.collections[name] = E.adoptCollection(c, c.remote);
        else state.collections[name] = { ...c, pending: { values: c.pending ? c.pending.values : c.values, baseRevision: c.remote.revision }, remote: null };
        persist();
      },
      clear() { state = { supported: null, lastError: null, collections: Object.fromEntries(NAMES.map(n => [n, E.emptyCollection()])) }; persist(); }
    };
    return api;
  }
  root.FFExt = { NAMES, createExtStore };
})(typeof globalThis !== 'undefined' ? globalThis : this);

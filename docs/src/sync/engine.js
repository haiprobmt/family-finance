// Sync engine: pure functions over the client's persisted state. No DOM, no network.
// The transport (nativeRequest) and storage are injected by the app.
// Rules: an operation is removed only after server acknowledgement; deletes stay as
// tombstones until acknowledged; stale writes surface as conflicts, never silent overwrite.
(function (root) {
  'use strict';
  const S = root.FFSync = root.FFSync || {};

  // ---- Transaction records (verbatim legacy mapping; parity-tested) ----
  function sheetDate(value) {
    const raw = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // This family's Sheet serializes local midnight as 16:00 UTC (UTC+8).
    // Recover its calendar date independently of the phone's timezone.
    const parsed = new Date(raw);
    if (raw.includes('T') && !Number.isNaN(parsed.getTime())) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(parsed);
      const get = type => parts.find(p => p.type === type).value;
      return `${get('year')}-${get('month')}-${get('day')}`;
    }
    return raw.slice(0, 10);
  }
  function sheetRecord(row) {
    return { id: String(row.ID || row.id || ''), timestamp: String(row.Timestamp || row.timestamp || ''), date: sheetDate(row.Date || row.date), type: String(row.Type || row.type || 'Expense'), amount: Number(row.Amount || row.amount || 0), category: String(row.Category || row.category || 'other'), person: String(row.Person || row.person || 'Gia đình'), note: String(row.Note || row.note || ''), synced: true };
  }
  function sameTransactionValues(a, b) { return ['date', 'type', 'category', 'person', 'note'].every(k => String(a[k] || '') === String(b[k] || '')) && Number(a.amount) === Number(b.amount); }
  function mergeSheetTransactions(remote, local) {
    const pending = local.filter(t => !t.synced), remoteIds = new Set(remote.map(t => t.id));
    return remote.map(t => { const edit = pending.find(p => p.id === t.id); if (!edit || sameTransactionValues(edit, t)) return t; if (!edit.pendingUpdate && !edit.conflict) edit.conflict = { remote: t }; return edit; }).concat(pending.filter(t => !remoteIds.has(t.id)));
  }

  // ---- Budgets ----
  function sameBudgets(a, b) { return JSON.stringify(Object.keys(a).sort().map(k => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map(k => [k, b[k]])); }
  // 'adopt' remote, 'conflict' (pending based on an old revision), or 'push' pending values.
  function budgetDecision(budgetState, remote) {
    const pending = budgetState.pending;
    if (!pending || sameBudgets(pending.values, remote.values)) return 'adopt';
    if (pending.baseRevision !== remote.revision) return 'conflict';
    return 'push';
  }

  // ---- Revisioned collections (assets, valuations, recurring) ----
  const sortKeys = v => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {}) : v);
  function canonical(values) { return JSON.stringify(sortKeys([...values].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))); }
  function emptyCollection() { return { values: [], revision: null, pending: null, remote: null, available: null }; }
  function collectionDecision(local, remote) {
    if (!remote || remote.available === false) return 'unavailable';
    const pending = local.pending;
    if (!pending || canonical(pending.values) === canonical(remote.values)) return 'adopt';
    if (pending.baseRevision !== remote.revision) return 'conflict';
    return 'push';
  }
  function editCollection(local, values) {
    return { ...local, values, pending: { values, baseRevision: local.pending ? local.pending.baseRevision : local.revision }, remote: null };
  }
  // A collection edited before this device ever synced (baseRevision null) may be pushed
  // only onto an empty server collection; otherwise it is a conflict for the user to resolve.
  function rebaseInitial(local, remote) {
    if (local.pending && local.pending.baseRevision === null && remote && remote.available !== false && Array.isArray(remote.values) && !remote.values.length) return { ...local, pending: { ...local.pending, baseRevision: remote.revision } };
    return local;
  }
  function adoptCollection(local, remote) { return { values: remote.values, revision: remote.revision, pending: null, remote: null, available: true }; }

  // ---- Durable operation view (internal envelope; never sent to the v3 API) ----
  function pendingOperations({ transactions = [], pendingDeletes = [], budgetState = {}, ext = {} }) {
    const ops = [];
    for (const id of pendingDeletes) ops.push({ operationId: 'delete:' + id, entityType: 'transaction', entityId: id, operation: 'delete' });
    for (const t of transactions) if (!t.synced && !pendingDeletes.includes(t.id)) ops.push({ operationId: (t.pendingUpdate ? 'update:' : 'create:') + t.id, entityType: 'transaction', entityId: t.id, operation: t.pendingUpdate ? 'update' : 'create', baseRevision: t.base || null, createdAt: t.timestamp || null, conflict: !!t.conflict });
    if (budgetState.pending) ops.push({ operationId: 'budgets:' + (budgetState.pending.baseRevision || 'new'), entityType: 'budgets', entityId: 'budgets', operation: 'replace', baseRevision: budgetState.pending.baseRevision || null, conflict: !!budgetState.remote });
    for (const [name, c] of Object.entries(ext.collections || {})) if (c.pending && c.available !== false) ops.push({ operationId: name + ':' + (c.pending.baseRevision || 'new'), entityType: name, entityId: name, operation: 'replace', baseRevision: c.pending.baseRevision || null, conflict: !!c.remote });
    return ops;
  }

  // ---- Status model: unconfigured | conflict | offline | syncing | failed | pending | synced | unverified ----
  // `online` is optional (navigator.onLine); only an explicit false reports the offline state.
  function syncStatus({ configured, syncing = false, lastError = null, lastSyncOk = false, operations = [], online = true }) {
    const pending = operations.length, conflict = operations.some(o => o.conflict);
    let state;
    if (!configured) state = 'unconfigured';
    else if (conflict) state = 'conflict';
    else if (online === false) state = 'offline';
    else if (syncing) state = 'syncing';
    else if (lastError) state = 'failed';
    else if (pending) state = 'pending';
    else if (lastSyncOk) state = 'synced';
    else state = 'unverified';
    const label = { unconfigured: 'Chưa kết nối', offline: pending ? 'Ngoại tuyến · ' + pending + ' thay đổi lưu trên máy' : 'Ngoại tuyến · Dữ liệu trên máy', syncing: 'Đang đồng bộ…', conflict: 'Xung đột · Xem lại', failed: pending ? 'Lỗi đồng bộ · ' + pending + ' thay đổi chờ · Thử lại' : 'Lỗi đồng bộ · Thử lại', pending: pending + ' thay đổi chờ gửi · Thử lại', synced: 'Đã đồng bộ', unverified: 'Chờ đồng bộ · Thử lại' }[state];
    return { state, pending, conflict, label, error: lastError };
  }

  // ---- Local backup (FR-07/FR-08). Never includes the connection token. ----
  function localBackup({ transactions = [], pendingDeletes = [], budgets = {}, budgetState = {}, ext = {}, appVersion = '3.0.0', createdAt }) {
    return { kind: 'family-finance-local-backup', format: 1, appVersion, createdAt, warning: 'Tệp chứa dữ liệu tài chính gia đình. Không chia sẻ công khai.', transactions, pendingDeletes, budgets, budgetState, ext, pendingOperations: pendingOperations({ transactions, pendingDeletes, budgetState, ext }) };
  }
  // CSV export with explicit date range; cells guarded against spreadsheet formula injection.
  function transactionsCsv(rows, from, to) {
    const cell = v => { let s = String(v === undefined || v === null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const picked = rows.filter(r => String(r.date) >= from && String(r.date) <= to).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return ['ID,Date,Type,Amount,Category,Person,Note,Synced', ...picked.map(r => [r.id, r.date, r.type, r.amount, r.category, r.person, r.note, r.synced ? 'yes' : 'no'].map(cell).join(','))].join('\r\n');
  }

  S.engine = { sheetDate, sheetRecord, sameTransactionValues, mergeSheetTransactions, sameBudgets, budgetDecision, canonical, emptyCollection, collectionDecision, editCollection, rebaseInitial, adoptCollection, pendingOperations, syncStatus, localBackup, transactionsCsv };
})(typeof globalThis !== 'undefined' ? globalThis : this);

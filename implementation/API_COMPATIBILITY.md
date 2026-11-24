# API Compatibility Contract

## 1. Current observed contract

Source of truth: apps-script/Code.gs, docs/web-bridge.js and repository README on inspected main.

### Transport

- Google Apps Script Web App endpoint ending in /exec.
- HTTPS POST with URL-encoded form body.
- Browser fetch uses credentials: omit.
- Token is sent in POST body, never URL.
- PWA sends nativeVersion=3, webVersion=1 and token.
- Backend requires nativeVersion equal to string 3.
- doGet reports apiVersion: 3.

### Actions

| Action | Purpose | Compatibility requirement |
|---|---|---|
| snapshot | Returns transaction snapshot, budgets and private loan summary | Preserve response fields and semantics |
| save_budgets | Saves budget object with revision check | Preserve BUDGET_CONFLICT |
| v3_create | Creates transaction | Preserve validation and ID behavior |
| v3_update | Updates transaction using base snapshot | Preserve TX_CONFLICT |
| v3_delete | Deletes transaction | Preserve acknowledgement semantics |
| chat_scoped | Sends scoped question/context to AI | Keep key server-side; optional feature |

### Snapshot fields observed

- ok
- apiVersion
- webVersion
- loans
- assistantKnowledgeVersion
- budgets containing values and revision
- transactions

The exact private loan object shape must be verified from the complete backend before refactor. Do not invent or narrow fields.

### Conflict codes

- BUDGET_CONFLICT: server budget revision differs from submitted revision.
- TX_CONFLICT: transaction is missing or its current fields differ from submitted base snapshot.

### Transaction rules observed

- ID required and at most 150 characters.
- Date format YYYY-MM-DD.
- Type exactly Income or Expense.
- Amount finite, greater than zero and at most 1e12.
- Update cannot change transaction type.
- Text values are truncated and protected against leading formula characters.
- Update uses a base snapshot to detect stale writes.

## 2. Compatibility requirements

Until a separately approved API version is deployed:
1. Keep all existing action names.
2. Keep request field names and encoding.
3. Keep response fields and conflict codes.
4. Keep authentication and token placement.
5. Keep API behavior for old APK clients.
6. Add new capabilities through optional fields or new actions only when old clients safely ignore them.
7. Never change the meaning of an existing field.
8. Do not require a new client version for current transaction/budget operations.

## 3. Proposed evolution

- Extract handler logic into services without changing public router.
- Add contract tests using request/response fixtures.
- New domain APIs are additive and explicitly versioned.
- Keep apiVersion 3 stable until a coordinated client migration is ready.
- If breaking change is necessary, introduce parallel versioned action, dual-run, migrate clients, then retire old path only after evidence and approval.

## 4. Required compatibility matrix

| Client | API | Expected |
|---|---|---|
| Existing APK 2.3.0 | Current v3 | Snapshot and supported writes continue |
| Current PWA | Current v3 | Existing workflows continue |
| Refactored PWA | Current v3 | Same contract and conflict behavior |
| New feature client | Additive endpoint | Old clients unaffected |
| Invalid token | Protected action | Rejected |
| Missing/old nativeVersion | Protected action | Existing rejection preserved |

## 5. Changes prohibited without explicit approval

- Removing nativeVersion check.
- Changing token transport.
- Renaming sheets or transaction columns.
- Changing Income/Expense enum.
- Removing conflict detection.
- Returning fake success for writes.
- Changing loan inclusion rules.
- Exposing AI provider credentials to clients.

# Data Model — Compatibility-first

## 1. Existing schema verified from source

### Transactions sheet

The backend expects the first eight columns in this order:

| Column | Meaning | Current constraints |
|---|---|---|
| ID | Stable transaction ID | Required; max 150 chars |
| Timestamp | Create/update timestamp | ISO-like string |
| Date | Transaction date | YYYY-MM-DD |
| Type | Income or Expense | Exact enum values |
| Amount | VND amount | Positive finite number; max 1e12 |
| Category | Category key | Formula-injection guarded |
| Person | Person label | Formula-injection guarded |
| Note | Free text | Max 2,000 chars in backend |

### Budgets sheet

| Column | Meaning |
|---|---|
| Category | Category key or month-scoped key |
| Budget | Integer VND; special -1 sentinel allowed only for month-scoped loan-payment |
| UpdatedAt | Timestamp |

Current backend allowlist includes food, grocery, kids, transport, home, bills, health, couple-allowance, other and loan-payment. Income categories are separate from expense budgets.

### Private sheets

- Loans: documented headers Bank, Month, Principal, Rate, Interest, Days.
- FinanceSettings: Key, Value; includes ExtraDebtMonthly.
- These sheets contain private data. Never copy rows into repository fixtures or public source.

## 2. Local storage keys to characterize

Current PWA references keys including:
- ffpages:family_finance_transactions_v1
- ffpages:family_finance_budgets_v1
- ffpages:family_finance_endpoint_v1
- ffpages:family_budget_sync_v2
- ffpages:family_deleted_v2
- ffpages:lastVerifiedV3
- ffpages:connection
- ffpages:family_finance_loan_rates_v1
- ffpages:loans

Do not rename/delete before a migration adapter is implemented and tested with synthetic fixtures. Connection state may contain credentials; never include real values in fixtures.

## 3. Proposed additive logical entities

These are future logical entities, not authorization to create sheets immediately.

| Entity | Suggested fields |
|---|---|
| Asset | id, type, name, currency, acquisitionDate, acquisitionValue, currentValue, valuationDate, ownershipShare, notes, status |
| AssetValuation | id, assetId, valuationDate, value, sourceType, note |
| LoanAccount | id, lender, productName, currency, originalPrincipal, startDate, maturityDate, rateType, repaymentMethod, dueDay, prepaymentFeeRule, status |
| LoanBalanceSnapshot | id, loanId, effectiveDate, principalOutstanding, source |
| LoanPaymentSchedule | id, loanId, dueDate, principalDue, interestDue, feeDue, rateApplied, status |
| LoanPayment | id, loanId, paidAt, principalPaid, interestPaid, feesPaid, transactionId, status |
| RecurringRule | id, type, amount, category, person, note, cadence, startDate, endDate, nextOccurrence, status |
| PlannedOccurrence | id, ruleId, dueDate, amount, status, generatedOperationId, transactionId |
| FinancialGoal | id, name, targetAmount, targetDate, currentAmount, status |
| Notification | id, type, referenceId, scheduledAt, deliveredAt, status |
| SyncOperation | operationId, entityType, entityId, operation, baseRevision, createdAt, status |

## 4. Money and date conventions

- Currency is VND for current scope.
- Persist monetary values as integer VND.
- Do not store locale-formatted strings.
- Calendar dates use YYYY-MM-DD; month keys use YYYY-MM.
- Timestamps use ISO 8601 with timezone.
- Interest calculations explicitly define day-count convention and rounding. Existing Techcombank forecast path uses 365; preserve as a characterized legacy rule until contract terms authorize a change.

## 5. Financial invariants

1. A posted transaction has one stable ID and canonical amount.
2. Income/expense amounts are positive; type determines aggregation sign.
3. Pending recurring occurrence is not a posted transaction.
4. Planned and forecast amounts do not enter actual cash flow.
5. Loan principal repayment reduces cash and liability; it is not an expense in net-worth accounting.
6. Interest and fees are expenses; principal repayment reduces liability.
7. A loan payment linked to a transaction must not be counted twice.
8. Asset values require valuation date and source label.
9. Net worth = assets less liabilities at the same valuation cut-off.
10. Missing source data is unknown, not zero.
11. Budget actuals derive from posted expense transactions under documented category policy.
12. Replaying an operation must not duplicate a record.

## 6. Migration policy

- Add new sheets/columns only through versioned, repeatable migrations.
- Existing sheet names and first eight transaction columns remain unchanged.
- Run dry-run against a copied spreadsheet first.
- Each migration records version, timestamp, row counts and validation result, never sensitive values.
- Migration must be safe to rerun.
- Rollback restores a pre-migration backup; do not rely on destructive reverse migrations.

## 7. Implemented in 3.0 (created only by `migrationsApply()`)

| Sheet | Headers | Notes |
|---|---|---|
| `Assets` | id, type, name, currency, acquisitionDate, acquisitionValue, currentValue, valuationDate, ownershipShare, notes, status, disposalDate, UpdatedAt | type ∈ cash, bank, real-estate, vehicle, investment, other; share 0–1; empty value = unknown |
| `AssetValuations` | id, assetId, valuationDate, value, sourceType, note, UpdatedAt | sourceType ∈ estimate, statement, appraisal, market |
| `RecurringRules` | id, type, amount, category, person, note, cadence, interval, startDate, endDate, status, skipped, UpdatedAt | cadence ∈ weekly, monthly, yearly; `skipped` = comma-separated dates |
| `Migrations` | MigrationId, AppliedAt, Result, Counts | metadata only (legacy row counts) |

Text cells are written with a leading apostrophe so Sheets never re-types them (dates, numbers, formulas). Each collection's revision is SHA-256 of its canonical JSON sorted by id.

Planned occurrences are **not stored**: they are generated deterministically from rules. Occurrence/transaction ID = `rec-<ruleId>-<YYYY-MM-DD>`, so confirming twice (or from two devices) creates one transaction (invariant 12). Confirmation writes through the existing `v3_create`.

Not implemented (still future): LoanAccount, LoanBalanceSnapshot, LoanPaymentSchedule, LoanPayment, FinancialGoal, Notification. The private `Loans` sheet stays the only loan source, as FR-03 requires until schema discovery is approved.

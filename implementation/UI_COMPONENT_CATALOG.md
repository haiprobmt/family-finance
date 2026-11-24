# Family Finance 3.0 — Shared UI Component Catalog

Status: Implementation specification  
Companion: UI_DESIGN_SYSTEM.md and UI_IMPLEMENTATION_GUIDE.md

## 1. Component architecture

Build a small reusable component layer around the current application. Components own presentation and interaction states; existing business logic, API calls, storage and financial calculations remain in the current domain/service layer.

Layers:
1. Tokens — colors, typography, spacing, elevation and breakpoints.
2. Primitives — Button, IconButton, Input, Select, Checkbox, Tabs, Badge, Avatar, Spinner, Skeleton, Tooltip.
3. Composites — AppShell, Sidebar, BottomNav, PageHeader, Card, MetricCard, FilterBar, DataTable, EmptyState, Alert, Modal/Sheet, Toast.
4. Domain display components — MoneyAmount, TransactionRow, BudgetProgress, LoanSummary, SyncStatus, PeriodSelector, FinancialChart.
5. Page composition — Dashboard, Transactions, Budgets, Assets & Debt, Loan Details, Calendar, AI Advisor, Reports, Settings.

Use current repository conventions and plain JavaScript/CSS unless inspection proves another framework/build setup already exists. Do not introduce a framework or bundler solely for the visual refresh.

## 2. Shared component contracts

### AppShell
Responsive frame: desktop sidebar + main content; mobile top bar + content + bottom nav. Inputs include active route, title, sync state, notification count and profile label. Must not own financial data fetching or persistence. Preserve navigation/deep links.

### Sidebar / BottomNav
Navigation items use stable IDs, labels and consistent line icons. Active state uses brand tint plus an indicator. Bottom nav has at most five destinations; secondary modules appear under Khác. Active state is exposed accessibly.

### PageHeader
Title, optional subtitle, period selector slot, primary action and secondary action slots. Actions wrap/stack on mobile. At most one primary action.

### Card
Variants: default, muted, outlined, elevated (overlay only). Supports title, description, action slot and content. Avoid unnecessary nested cards.

### MetricCard
Inputs: label, value, currency, delta, delta period, trend, helper text and emphasis. Amount uses MoneyAmount. A positive delta is not automatically favorable: increased debt is negative. Support loading, unavailable and error states. No metric calculation inside visual component.

### MoneyAmount
Inputs: amount, currency (default VND), semantic, precision, compact and showCurrency. Use Intl.NumberFormat where supported. Preserve full precision in transaction/loan details. Avoid floating-point arithmetic; receive authoritative domain values. Never render missing/invalid values as zero.

### Badge / StatusPill
Variants: neutral, success, warning, danger, info, brand. Always include text; use for meaningful statuses, not decoration.

### Button / IconButton
Variants: primary, secondary, outline, ghost, danger; sizes sm/md/lg. States: default, hover, focus-visible, pressed, disabled, loading. Loading prevents duplicate submission. Icon-only controls require accessible name and 44px mobile hit area.

### Form controls
Input, Textarea, Select, DatePicker, Checkbox, Radio and Switch. Persistent label, helper and error text. Validate at domain boundary as well as UI. Do not mutate amount/date values merely for display. Use native mobile affordances where appropriate.

### Tabs / SegmentedControl
Tabs switch content panels. Segmented controls are for small mutually exclusive choices (e.g. month/quarter/year). Active state is not color-only.

### SearchInput / FilterBar
Search and filters are independent. Active filters are visible and clearable. Mobile filters open a sheet with Apply and Reset. Debounce only if consistent with current data flow.

### DataTable
Inputs: columns, rows, sort, selection, empty/loading state. Right-align money columns and use tabular numerals. Keep headers meaningful. Support keyboard and mobile fallback. Never render untrusted user content as HTML. Sorting/pagination must not mutate underlying financial data.

### TransactionRow
Shows category icon, description, category/person, date and amount. Income/expense signs and colors follow semantics. Selecting opens the existing detail/edit flow. Do not add a second persistence path.

### BudgetProgress
Inputs: spent, limit, remaining, percent and status. Clamp visual bar to 0–100%, but show actual overage (e.g. 112%). Show spent and limit values. Respect current month/category/loan override semantics.

### LoanSummary / LoanScheduleRow
Separate principal, interest, installment, outstanding balance, rate and remaining term. Use existing model values; do not invent amortization assumptions in UI. Forecast/simulation is visibly separated from actual records. Preserve current loan exclusions and settings.

### PeriodSelector
Supports month/quarter/year/custom range only where relevant. Shows selected period. Changing period refreshes view and must not mutate records. Use consistent locale/timezone.

### SyncStatus
States: offline, pending, syncing, synced, conflict, error. Include last successful sync when known. Conflict offers recovery; never silently discard local changes. A queued request is not “synced”.

### FinancialChart
Types: line, bar, donut. Inputs: series, labels, period, unit and accessible summary. Domain calculations stay outside chart. Provide text/table fallback and handle empty, partial, loading states. Avoid misleading baselines/unlabeled axes.

### EmptyState
Explains why data is absent and offers one relevant action. Distinguish no records, no filtered results and loading failure.

### Skeleton / Spinner
Skeleton for page/card loading; spinner for short in-place actions. Reserve dimensions to prevent layout shifts.

### Alert / Toast
Alert is persistent context; toast is transient confirmation. Errors remain available until recoverable. Do not use toast as sole confirmation for destructive actions.

### Modal / BottomSheet
Modal for short confirm/edit flows; bottom sheet for mobile filters/actions. Trap focus and return it to trigger on close. Escape/back closes only when safe; unsaved edits require confirmation. Destructive confirmation names target and consequence.

### AIInsightCard
Shows insight, period, source facts and qualification. Recommendations are advisory; no automatic writes. Proposed changes lead to review/confirmation. Never present generated estimates as authoritative balances.

## 3. Required component states

Every interactive component defines default, hover (pointer), focus-visible, active, disabled and loading (where relevant). Data components also define error, empty and responsive states.

## 4. Suggested file organization

Adapt to actual repository conventions. This is a proposal, not an instruction to move all files immediately.

~~~text
docs/
  styles/
    tokens.css
    base.css
    layout.css
    components.css
    pages.css
  components/
    app-shell.js
    button.js
    card.js
    metric-card.js
    money-amount.js
    status-badge.js
    data-table.js
    transaction-row.js
    budget-progress.js
    loan-summary.js
    sync-status.js
    financial-chart.js
    modal.js
    toast.js
  pages/
    dashboard.js
    transactions.js
    budgets.js
    assets-debt.js
    loans.js
    calendar.js
    ai-advisor.js
    reports.js
    settings.js
~~~

The agent must inspect script loading, globals, imports and deployment constraints before choosing the final structure.

## 5. Component acceptance checklist

- Reused on multiple screens where the pattern is shared.
- No business rules or API calls inside visual primitives.
- Keyboard and screen-reader behavior verified.
- Responsive behavior verified at mobile/tablet/desktop widths.
- Loading, empty, error and disabled states implemented.
- Money and dates formatted consistently.
- No secrets, private data or unsafe HTML injection.
- No regression in transaction, budget, loan or sync flows.

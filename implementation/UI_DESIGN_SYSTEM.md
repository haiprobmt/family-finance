# Family Finance 3.0 — UI Design System

Status: Approved visual direction / implementation specification  
Scope: Responsive PWA and Android WebView

## 1. Product direction

Build a professional household-finance workspace: calm, precise, data-first and trustworthy. It must feel like a serious personal-finance product, not a budgeting game, banking advertisement or AI toy.

Principles:
1. Data before decoration; financial values and context are the visual focus.
2. Clear hierarchy; net worth, cash flow, debt and budget status are quickly understood.
3. Restrained color; orange is the brand/action accent, semantic colors communicate meaning.
4. Consistency across desktop, mobile web and Android WebView.
5. Progressive disclosure: summaries first, details on demand.
6. Honest communication: actual, planned and forecast values are distinct.
7. Safe interaction: destructive and financially consequential actions require confirmation.

Avoid cartoon illustrations, emoji icons, excessive gradients, glassmorphism, neon colors, decorative shadows and oversized pill controls.

## 2. Color tokens

Use centralized CSS custom properties.

| Token | Value | Usage |
|---|---|---|
| brand-50 | #FFF7ED | subtle brand surface |
| brand-100 | #FFEDD5 | selected/hover surface |
| brand-500 | #F59E0B | brand accent |
| brand-600 | #EA8A00 | primary action |
| brand-700 | #C96D00 | pressed/strong accent |
| bg | #F5F6F8 | application background |
| surface | #FFFFFF | cards and panels |
| surface-muted | #F8FAFC | secondary surface |
| border | #E5E7EB | borders/dividers |
| text | #172033 | primary text |
| text-muted | #667085 | secondary text |
| text-subtle | #98A2B3 | tertiary/disabled |
| income | #159A65 | income/positive cash flow |
| income-bg | #EAF7F0 | income tint |
| expense | #D94848 | expense/negative cash flow |
| expense-bg | #FEF0F0 | expense tint |
| info | #2878D0 | informational state |
| info-bg | #EFF6FF | informational tint |
| warning | #B7791F | caution/threshold |
| warning-bg | #FFF7E6 | caution tint |
| success | #16845B | completed/healthy |
| success-bg | #EAF7F0 | success tint |
| danger | #C93636 | destructive actions |
| danger-bg | #FFF0F0 | destructive tint |
| focus | #2563EB | keyboard focus ring |

Rules:
- Orange is not the income color. Income is green; expenses are red.
- Pair color with a label, icon or value; never communicate status by color alone.
- Ordinary outstanding debt is neutral navy; reserve red for overdue/negative movement.
- Charts use stable category colors and a visible legend.

## 3. Typography

Preferred stack: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif. The app must render correctly without downloading a remote font.

| Token | Size / line-height | Weight | Usage |
|---|---|---|---|
| xs | 12 / 16px | 400–500 | metadata |
| sm | 13 / 20px | 400–500 | helper text |
| md | 14 / 20px | 400–500 | default body/control |
| lg | 16 / 24px | 500–600 | section title |
| xl | 20 / 28px | 600 | page title |
| 2xl | 24 / 32px | 600–700 | key metric |
| 3xl | 30 / 36px | 600–700 | desktop hero metric |

Financial values use tabular numerals. Always show currency context; default VND unless current settings specify otherwise. Preserve full precision in transaction and loan details. Dashboard compact values are acceptable only when the full amount remains accessible. Never silently convert missing/invalid values to zero.

## 4. Spacing, layout and shape

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px.

- Desktop sidebar: 240–256px; content max width 1440px; page padding 24–32px.
- Tablet: collapsible sidebar/icon rail; page padding 20px.
- Mobile: compact top bar + bottom navigation; page padding 16px.
- Grid: 12 columns desktop, 8 tablet, 4 mobile.
- Card radius: 12px default, 16px prominent summary, 8px dense controls.
- Button/input radius: 8px; do not capsule every control.
- Border: 1px solid border token. Shadows reserved for overlays.
- Card padding: 16px default, 20–24px for hero metrics.
- Minimum mobile touch target: 44×44px.

Breakpoints: mobile <640px; tablet 640–1023px; desktop >=1024px; wide >=1440px. Use responsive CSS, not user-agent detection.

## 5. Navigation

Desktop sidebar:
- Tổng quan
- Giao dịch
- Ngân sách
- Tài sản & Nợ
- Lịch tài chính
- AI Advisor
- Báo cáo
- Cài đặt

Sidebar footer shows sync state and app version. Main header shows page title, relevant period selector, sync state and contextual actions.

Mobile:
- Compact top bar.
- Bottom navigation with no more than five primary destinations: Tổng quan, Giao dịch, Ngân sách, Tài sản/Khoản vay, Khác.
- Quick-add action must not obscure content or system navigation.
- Preserve deep links and browser back behavior.

## 6. Responsive behavior

- Desktop tables remain tables. On mobile, convert to compact rows or horizontally scroll only when column relationships must remain visible.
- Reorder dashboard cards by importance; do not simply shrink desktop layout.
- Charts resize and retain accessible legends; avoid unreadable desktop charts on mobile.
- Filters open as a bottom sheet on mobile.
- Long dialogs become full-height sheets on small screens.
- Sticky navigation respects safe-area insets.
- Inputs remain visible above mobile keyboards.
- Verify viewport and safe-area behavior in Android WebView.

## 7. Data visualization

Use simple bar, line and donut charts. No 3D, bevel, decorative gradients or gimmick animations. Every chart has title, period, legend and empty state. Keep category colors stable across screens. Tooltips show exact VND values and date range. Provide textual/table alternatives for critical data. Group categories beyond 6–7 slices into “Khác”. Avoid dual axes unless necessary and clearly labeled.

## 8. Financial UX rules

- Label Thực tế / Dự kiến / Dự báo explicitly.
- Show selected period and last successful sync time where relevant.
- Distinguish total assets, liabilities, net worth and cash balance.
- Separate loan principal, interest, installment and remaining balance.
- Budget used, remaining and over-budget values must reconcile.
- Localize Vietnamese dates and VND consistently.
- Confirm before delete, reset, bulk edit or financial-impact action.
- Show offline, pending, syncing, synced, conflict and error states.
- AI recommendations are advisory, cite period/source facts and never appear as verified balances.

## 9. Accessibility

Target WCAG 2.2 AA. Provide keyboard navigation and visible focus. Inputs require persistent labels. Icon-only buttons require accessible names. Use semantic landmarks, headings and table headers. Support reduced motion and text zoom. Never rely on hover for essential actions. Error messages explain the issue and recovery.

## 10. CSS token starter

~~~css
:root {
  --color-brand-50: #FFF7ED;
  --color-brand-100: #FFEDD5;
  --color-brand-500: #F59E0B;
  --color-brand-600: #EA8A00;
  --color-brand-700: #C96D00;
  --color-bg: #F5F6F8;
  --color-surface: #FFFFFF;
  --color-surface-muted: #F8FAFC;
  --color-border: #E5E7EB;
  --color-text: #172033;
  --color-text-muted: #667085;
  --color-text-subtle: #98A2B3;
  --color-income: #159A65;
  --color-income-bg: #EAF7F0;
  --color-expense: #D94848;
  --color-expense-bg: #FEF0F0;
  --color-info: #2878D0;
  --color-info-bg: #EFF6FF;
  --color-warning: #B7791F;
  --color-warning-bg: #FFF7E6;
  --color-success: #16845B;
  --color-success-bg: #EAF7F0;
  --color-danger: #C93636;
  --color-danger-bg: #FFF0F0;
  --color-focus: #2563EB;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-overlay: 0 8px 24px rgb(16 24 40 / 12%);
  --sidebar-width: 248px;
}
~~~

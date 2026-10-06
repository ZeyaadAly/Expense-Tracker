# Expense Tracker V2 — UX Specification

**Version:** 2.0 Planning — T02 decisions recorded
**Status:** P0 planning frozen; T03 completed; T04 ✅ Completed — explicit user visual approval recorded on 2026-10-06; T05 next, not started
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`, `02-prd.md`

**Release rule:** Core completion requires P0 only. P1 sections are optional enhancement contracts; post-V2 features do not gate core release. Decisions are frozen as of 2026-10-06; future material changes follow change control.

---

# 1. Purpose

This document defines the V2 user experience, information architecture, page structure, navigation, major interactions, responsive behavior, visual hierarchy, UI states, accessibility expectations, and code-first browser design requirements.

It describes **how users move through and interact with the product**.

It does not define final implementation code, database schema, or API contracts.

---

# 2. UX Goals

V2 should feel like a complete personal finance application rather than a single transaction page.

The UX should be:

- clear;
- fast;
- trustworthy;
- consistent;
- responsive;
- accessible;
- financially understandable;
- easy to scan;
- safe during destructive or uncertain actions.

The interface should help users quickly answer:

- How much money do I have?
- Where is it?
- What did I spend?
- What income is coming in?
- What expenses repeat?
- Am I overspending?
- Am I saving enough?
- What should I pay attention to next?

---

# 3. Information Architecture

P0 public: /login, /register, /forgot-password, /reset-password. P0 protected: /dashboard, /transactions, /accounts, /recurring, /analytics, /budgets, /goals, /settings. Root / redirects after session resolution.

**V2 Core Completion = P0 only.** P1 features are planned V2 enhancements after the core release and require explicit promotion to become core gates.

- P0: Supabase Auth/profile, protected app, user isolation, accounts, account-aware transactions, transfers, recurring definitions/occurrences/generation/upcoming, dashboard, analytics, monthly category budgets, manual-progress goals, custom categories, core settings, search/filter/cursor pagination, migration, financial/security/accessibility validation and production acceptance.
- P1: notifications, reports/CSV/JSON export, recurring-pattern detection, deterministic insight cards, goal projections/history/detail, and account detail page.
- Post-V2 / P2: user-identity deletion, budget rollover, account-linked automatic goal progress, email/push, PDF/Excel, advanced detection, richer debt products, bank sync, AI advice, OCR, investments, shared wallets and currency conversion.

P0 shows budget warning states within budget/dashboard views; persistent notifications are P1. /reports, account-detail routes, notification controls and export sections are absent from P0 navigation. P1 tables/endpoints/browser states below describe enhancement contracts, not core requirements.

P1 route /accounts/[id] is optional account detail; goal detail can be a P1 expandable panel (no P0 route). Reports/export and notifications stay out of core navigation/header. The layout examples below show the eventual P1 slots, not P0 required controls.

---

# 4. Global App Layout

## Desktop

Use a persistent 220–240px dark sidebar and a main content area with 32px desktop gutters. Prefer flat sections, data rails and asymmetric composition over uniform card grids.

Suggested layout:

```text
┌──────────────────┬─────────────────────────────────────┐
│                  │ Header                              │
│  Expense Tracker │                                     │
│                  │ Page content                        │
│  Dashboard       │                                     │
│  Transactions    │                                     │
│  Accounts        │                                     │
│  Recurring       │                                     │
│  Budgets         │                                     │
│  Goals           │                                     │
│  Analytics       │                                     │
│  Analytics       │                                     │
│                  │                                     │
│  Settings        │                                     │
└──────────────────┴─────────────────────────────────────┘
```

Sidebar behavior:

- app/logo at top;
- grouped navigation items;
- active route clearly indicated;
- settings/profile at bottom;
- collapsible only if necessary;
- avoid icon-only navigation as the default.

## Tablet

Use top header with drawer navigation at 768–1023px, preserving content width. Desktop persistent sidebar begins at1024px.

## Mobile

Use:

- top app header;
- menu button;
- slide-over navigation drawer.

Core mobile navigation must remain easy to reach.

Do not simply scale down the desktop sidebar.

---

# 5. Navigation Groups

Suggested grouping:

## Overview
- Dashboard

## Money
- Transactions
- Accounts
- Recurring

## Planning
- Budgets
- Goals

## Insights
- Analytics
- Reports (P1 only)

## Account
- Settings

This grouping should be consistent across desktop and mobile.

---

# 6. Global Header

The protected application header should support:

- current page title;
- optional page description;
- primary action button;
- user/profile menu;
- notification button (P1 only);
- responsive navigation trigger on mobile.

Examples:

Dashboard:
- Title: Dashboard
- Action: Add transaction

Transactions:
- Title: Transactions
- Action: Add transaction

Accounts:
- Title: Accounts
- Action: Add account

Recurring:
- Title: Recurring
- Action: Add recurring item

Budgets:
- Title: Budgets
- Action: Create budget

Goals:
- Title: Goals
- Action: Add goal

---

# 7. Authentication UX

## 7.1 Login Page

Route:

`/login`

Layout:

- centered auth card on desktop;
- full-width content area on mobile;
- app branding;
- email;
- password;
- sign-in button;
- forgot password link;
- register link.

States:

- idle;
- submitting;
- invalid credentials;
- network/server error;
- session expired.

Accessibility:

- visible labels;
- password visibility toggle optional;
- errors associated with fields;
- focus moves to first invalid field.

---

## 7.2 Registration Page

Route:

`/register`

Fields:

- display name;
- email;
- password;
- confirm password.

Optional later:

- terms/privacy checkbox.

Success state:

- account created;
- production email verification required; show “Check your email”, resend feedback and expired/invalid verification-link state;
- do not expose protected data until verified sign-in/bootstrap succeeds;
- retain registration display-name draft for validated profile PUT after sign-in.

---

## 7.3 Forgot Password

Route:

`/forgot-password`

Fields:

- email.

Success always uses generic email-sent feedback without exposing whether an address exists.

---

## 7.4 Reset Password

Route:

`/reset-password`

Fields:

- new password;
- confirm password.

Success:

- confirmation;
- clear recovery session and return to sign in;
- expired/invalid reset link has a new-reset-request action;
- provider redirect allowlist and local return paths only.

---

# 8. Dashboard UX

Route:

`/dashboard`

The dashboard is the main financial overview.

## 8.1 Dashboard Structure

Suggested order:

1. page header;
2. date/period selector (default This month, month-to-date);
3. primary financial summary;
4. account overview;
5. income vs expenses chart;
6. recent transactions;
7. upcoming recurring activity;
8. budget progress;
9. goals preview;
10. financial insights (P1 only; omitted in core).

---

## 8.2 Financial Summary Hierarchy

Present one prominent Net Position area (the existing Total Balance/net-worth metric, including archived accounts), with Income, Expenses and Net Savings as subordinate figures integrated into the cash-flow section. These remain the existing API metrics; do not introduce a new balance calculation or a traditional four-equal-card row.

Required figures:

- Total Balance (net worth, including archived accounts)
- Income
- Expenses
- Net Savings

Example:

```text
Total Balance
25,480.00 EGP

Income
15,000.00 EGP

Expenses
8,240.00 EGP

Net Savings
6,760.00 EGP
```

Rules:

- exact decimal formatting;
- visible EGP;
- values may wrap;
- negative values must be explicit;
- never communicate meaning by color only.

---

## 8.3 Account Overview

Cards/list for:

- Cash
- Bank
- Savings
- Wallet
- Credit Card

Each card may show:

- account name;
- type;
- current balance;
- optional status;
- P0 action to open Transactions filtered by account; P1 link to account detail.

On desktop, use horizontal cards/grid.

On mobile, use stacked cards or horizontal scrolling only if content remains accessible.

---

## 8.4 Income vs Expenses Chart

Chart options:

- bar chart;
- line chart;
- grouped columns.

P0 chart shows backend monthly series clipped to selected dashboard period. Default this_month means current month-to-date; do not invent a previous-period comparison. Allowed period labels: This month, Last month, 3 months, 6 months, 1 year (API §77).

Requirements:

- accessible labels;
- text/table equivalent;
- no reliance on color only;
- tooltip is supplemental, not the only data source.

---

## 8.5 Recent Transactions

Show 5–8 latest transactions.

Each item:

- description;
- category;
- account;
- date;
- signed amount;
- type.

Action:

- View all transactions.

---

## 8.6 Upcoming Recurring Activity

Show upcoming items such as:

- salary;
- rent;
- subscriptions;
- bills.

Each item:

- description;
- type;
- amount;
- next date;
- account.

If no recurring items:

- “No upcoming recurring activity.”

---

## 8.7 Budget Preview

Show top relevant budgets with progress bars.

Example:

```text
Food
1,800 / 3,000 EGP

Transport
900 / 1,500 EGP
```

Warnings:

- near limit;
- exceeded.

---

## 8.8 Goals Preview

Show:

- goal name;
- saved;
- target;
- progress;
- target date.

Action:

- View goals.

---

## 8.9 Financial Insights — P1

Use compact insight cards.

Examples:

- “Food spending is 18% higher than last month.”
- “You saved 42% of your income this month.”
- “Recurring expenses use 31% of recurring income.”

Insights should be deterministic and factual.

---

# 9. Transactions Page UX

Route:

`/transactions`

This becomes the main financial entry and transaction-management page: a polished financial ledger with clear date/group hierarchy, dense readable rows, account/category context, exact signed values, desktop tables and mobile cards.

## 9.1 Layout

Suggested order:

1. header;
2. quick summary;
3. search;
4. filter row;
5. transaction table/list;
6. pagination.

---

## 9.2 Search

Search input placeholder:

`Search transactions`

Should search:

- description;
- category;
- account.

Use explicit search submit in P0; preserve query/filter state and reset cursor history on submission.

---

## 9.3 Filters

Filters:

- type;
- account;
- category;
- date range;
- recurring status: Generated/Manual; omit for All.

Optional UI:

- filter chips showing active filters;
- Clear all action.

Desktop:

- horizontal filter row with wrapping.

Mobile:

- primary search visible;
- filters open in a sheet/drawer.

---

## 9.4 Transaction Table

Desktop columns:

- Date
- Description
- Account
- Category
- Type
- Amount
- Actions

Actions:

- Edit
- Delete

Do not hide essential actions behind hover only.

---

## 9.5 Mobile Transaction Cards

Each card:

- type badge;
- signed amount;
- description;
- account;
- category;
- date;
- Edit/Delete actions.

No horizontal scrolling required.

---

## 9.6 Pagination

Use default 25 records (maximum 100), Next and Previous based on frontend cursor history. Backend only returns nextCursor/hasMore; no total-page count. Disable Previous on first page. Reset history on query/filter changes and mutations; preserve filter state. Invalid/expired cursor offers refresh from first page; changing data may require refresh. Do not display fabricated total pages.

---

## 9.7 Add/Edit Transaction Dialog

Fields:

- Type
- Account
- Amount
- Category
- Date
- Description

Layout:

Desktop:
- centered modal;
- max width ~620px.

Mobile:
- full-screen sheet/dialog;
- vertically stacked fields.

Validation:
- field-level errors;
- summary error optional;
- preserve values after failure.

---

# 10. Accounts Page UX

P0 /accounts shows current balances for active/archived accounts, archived-inclusive Total Balance (net worth), create/edit/archive/restore and a paginated transfer list with edit/delete. Transactions link opens /transactions?accountId=...; no core account-detail route.

Add/edit fields: name, type, openingBalance, read-only EGP. Assets label positive as money owned; card positive as “Amount owed”, negative as “Credit balance”. Explain payments use Transfer to avoid a duplicate expense. Current balances use all history, independent of dashboard period.

### Frozen account/category lifecycle

Accounts support create/edit/archive/restore, never hard delete in P0. Opening balance and crossing between credit-card and asset semantics can be edited only while `opening_balance_locked = false`. Set that flag permanently on first transaction or transfer involving the account; deletion never unlocks it. Lock/check the account row atomically to prevent concurrent first activity and opening-balance edits. Name and asset-to-asset type edits remain allowed.

Archiving an account **automatically pauses all its active recurring definitions** in the same database transaction. Archiving a custom category does the same for its definitions. Lock affected accounts/categories and definitions consistently so archive cannot race a posting. Restore does not auto-resume schedules; user resumes explicitly after both references are active. System categories cannot be edited/archived.

Archived references remain in history and totals. Reject new transactions/transfers/recurring definitions or postings using archived references. Editing a transaction/transfer requires its resulting account/category references to be active; restore first for historical corrections. Hard deletion of owned historical transactions/transfers remains allowed even when parents are archived. Existing goal links to archived accounts remain metadata; assigning a link requires an owned active account. Category kind is immutable after any transaction, recurring definition or budget references it; category owner/system flag is always immutable.

Opening balance/asset-card conversion controls disable permanently after first posted activity and explain why. Archive confirmation names how many active recurring items will pause; success reports paused count. Restore says schedules need explicit resume. New user has no seeded account/data: prompt Create your first account, offer cash Main Account with zero opening balance as form defaults only, then Add transaction. Existing migrated owner sees preserved Main Account.

Account detail /accounts/[id] is P1 only.

---

# 11. Transfer UX

P0 launched from Accounts page; P1 may launch from account detail. Fields: From, To, exact amount, date, optional note; select distinct active owned accounts. Show source/destination and amount in confirmation, pending and uncertain-outcome states. Transfer list supports cursor Next/Previous, edit and delete confirmation; hard deletion recomputes balances and is allowed for archived parent history. Card payment reduces asset balance and positive card debt, with no duplicate expense. Transfer is neutral labeling, never ordinary income/expense.

---

# 12. Recurring Page UX

Route:

`/recurring`

## 12.1 Main Sections

Treat recurring finance as a schedule/timeline: distinguish expected income/expenses and upcoming occurrences from posted actuals, with active/paused schedules clearly labeled.

Suggested tabs or segmented control:

- All
- Income
- Expenses
- Upcoming

---

## 12.2 Recurring Item Card/Table

Show:

- description;
- type;
- amount;
- frequency;
- account;
- category;
- next occurrence;
- status.

Actions:

- Edit
- Pause/Resume
- Archive (no hard delete/restore recurring in P0).

---

## 12.3 Add Recurring Item

Fields:

- type;
- account;
- amount;
- category;
- description;
- frequency;
- start date;
- end date optional.

P0 frequency derives from startDate only; no independent weekday/day fields. Explain past startDate starts on the next anchored occurrence on/after Cairo today without imported history. Monthly month-end and yearly Feb29 use last valid day.

---

## 12.4 Upcoming Timeline

Optional layout:

```text
Today
- Salary +15,000 EGP

Tomorrow
- Rent -5,000 EGP

Oct 10
- Internet -600 EGP
```

---

## 12.5 Recurring Suggestion UX — P1

When a likely recurring pattern is detected:

```text
Possible recurring transaction

Netflix
200.00 EGP
appears monthly

[ Not now ] [ Create recurring ]
```

Never enable recurring behavior without user confirmation.

---

# 13. Analytics Page UX

Route:

`/analytics`

Lead with a factual financial narrative/summary based on existing P0 values (for example savings rate, net savings and period), then supporting trends, category spending, account activity and recurring obligations. Avoid a wall of charts. This summary does not promote P1 deterministic insight cards into core.

## 13.1 Header Controls

Time range:

- 7 days;
- 30 days;
- 3 months;
- 6 months;
- 1 year;
- Custom.

P0 optional filter: account. Category analytics filter is post-core until explicitly contracted.

---

## 13.2 Analytics Sections

### Overview Cards

- Income
- Expenses
- Net Savings
- Savings Rate
- Average Daily Spend

### Income vs Expenses

Time-series chart.

### Spending by Category

Donut or horizontal bar chart.

### Income Sources

Bar/donut chart.

### Savings Trend

Line chart.

### Account Activity

Breakdown by account.

### Recurring Commitments

Show:

- recurring income;
- recurring expenses;
- remaining recurring cash flow.

### Top Insights — P1

Deterministic text cards.

---

## 13.3 Analytics Empty State

When insufficient data exists:

- explain that more transaction history is needed;
- do not display misleading charts.

---

# 14. Budgets Page UX

Route:

`/budgets`

## 14.1 Header

Use readable progress with explicit near-limit/over-budget labels and values, not color alone.

Controls:

- month selector;
- Create Budget button.

---

## 14.2 Budget Cards

Each card:

- category;
- allocated amount;
- spent;
- remaining;
- progress;
- status.

States:

- normal;
- near limit;
- exceeded.

---

## 14.3 Create/Edit Budget

Fields:

- category;
- amount;
- period;
- optional alert threshold.

---

## 14.4 Empty State

Message:

`No budgets for this month.`

Action:

`Create your first budget`

---

# 15. Goals Page UX

Keep the goals page calm and progress-oriented. P0 /goals cards: name, manual saved amount, target, remaining, percentage, optional target date and status. Create/edit dialog includes optional owned active linked account, explicitly labeled “Reference only; does not calculate savings”. Update progress uses this same dialog; no detail route/history required. Complete/archive actions require clear consequences and keyboard access.

P0 goal progress is manually maintained `savedAmount`; `linkedAccountId` is optional owned-account metadata only and never changes progress. No progress-event table or detail page is required in P0. Saved amount may exceed target; percentComplete is not clamped, remainingAmount is `max(targetAmount - savedAmount, 0)`. At 100%+, suggest completion; only an explicit user transition sets status completed. Complete requires savedAmount >= targetAmount; reducing a completed goal below target requires an explicit transition back to active in the same update. Active/completed goals can be archived; archived goals are read-only in P0. Projection/history/detail are P1; automatic account-derived progress is post-V2.

At 100%+ show a completion suggestion/action without changing status. Progress-bar fill may visually cap at 100%, but text shows true percentage and amount. P1 detail/history/projection browser states are optional and clearly labelled.

---

# 16. Reports Page UX — P1

Route:

`/reports`

## 16.1 Report Controls

- date range;
- account;
- report type.

---

## 16.2 Report Sections

- income;
- expenses;
- net savings;
- category breakdown;
- account balances;
- recurring commitments.

---

## 16.3 Export Actions

- Export CSV
- Export JSON

Future:

- PDF
- Excel

Export should clearly state selected period/scope.

---

# 17. Settings Page UX

Route:

`/settings`

Suggested tabs/sections:

- Profile
- Accounts
- Categories
- Security
- Preferences
- Data & Export (P1 only)

---

## 17.1 Profile Settings

Fields:

- display name;
- email (read-only/provider-managed);
- locale en (read-only P0);
- timezone Africa/Cairo (read-only P0);
- currency EGP (read-only P0).

---

## 17.2 Categories

List:

- default categories;
- custom categories;
- archived categories.

Actions:

- Add;
- Edit;
- Archive;
- Restore.

---

## 17.3 Security

Actions:

- Change password;
- Sign out;
- stronger all-session revocation and user-identity deletion are post-V2; no core deletion control.

---

# 18. Notifications UX — P1

Global bell icon in header.

Panel/drawer should show:

- unread count;
- recent notifications;
- mark as read;
- mark all as read.

Types:

- recurring upcoming;
- budget warning;
- budget exceeded;
- goal milestone.

---

# 19. Global UI States

Every page/section must define:

- loading;
- empty;
- error;
- stale data;
- partial error;
- success;
- pending mutation;
- uncertain mutation outcome;
- unauthorized/session expired.

---

# 20. Loading UX

Use skeletons for:

- cards;
- tables;
- charts.

Avoid excessive spinners.

With reduced motion:

- skeletons should be static;
- no pulsing animation required.

---

# 21. Empty States

Empty states must explain what the user can do next.

Examples:

Accounts:
- “No accounts yet.”
- “Add your first account to start tracking money.”

Transactions:
- “No transactions yet.”
- “Add your first income or expense.”

Recurring:
- “No recurring activity configured.”

Budgets:
- “No budgets for this month.”

Goals:
- “No savings goals yet.”

---

# 22. Error States

Errors should:

- use plain language;
- avoid technical details;
- preserve useful data where possible;
- offer scoped Retry;
- not reset user inputs unnecessarily.

---

# 23. Session Expiry UX

When authentication expires:

- stop protected operations;
- display clear message;
- redirect to login;
- preserve safe return path if practical.

Do not show protected stale financial data after logout/session invalidation.

---

# 24. Destructive Action UX

Destructive actions requiring confirmation:

- delete transaction;
- delete transfer/budget;
- archive account (state automatic recurring pause);
- archive recurring definition;
- archive goal;
- archive category (state automatic recurring pause).

User-identity deletion is post-V2 and has no core confirmation state.

Confirmation dialog should:

- name the affected item;
- state consequence;
- use danger styling;
- require explicit confirmation.

---

# 25. Form UX Rules

All forms should:

- use visible labels;
- mark required fields;
- show helper text where useful;
- show field-level errors;
- preserve values after server errors;
- disable duplicate submissions;
- maintain accessible focus.

Do not rely only on placeholder text.

---

# 26. Money Display Rules

Use exact decimal strings.

Display examples:

- `+15,000.00 EGP`
- `−850.00 EGP`
- `25,480.00 EGP`

Rules:

- income can show plus sign;
- expense can show minus sign;
- transfer should show neutral transfer labeling;
- do not abbreviate money as 15K unless later explicitly approved;
- large values may wrap.

---

# 27. Date Display Rules

API/storage may use date-only ISO values.

User-facing format:

`DD/MM/YYYY`

Time-based notifications may use localized date/time separately.

Avoid timezone conversion of date-only financial dates.

---

# 28. Chart UX Rules

All charts must:

- have title;
- explain time period;
- show units;
- support screen-reader-accessible equivalent;
- use more than color alone;
- handle empty data;
- handle negative values;
- support long labels.

Tooltips are supplemental only.

---

# 29. Responsive Rules

## Mobile `<768px`

- 16px page gutters;
- drawer navigation;
- cards stacked;
- tables become cards where needed;
- filters use vertical layout/sheet;
- dialogs may become full-screen;
- chart legends wrap;
- no page-level horizontal scroll.

## Tablet `768–1023px`

- 24px gutters;
- header with drawer navigation;
- two-column card layouts where useful;
- tables remain possible if readable.

## Desktop `>=1024px`

- persistent 220–240px sidebar;
- 32px page gutters and max content width around 1400px;
- asymmetric composed workspaces, avoiding uniform card grids;
- full tables;
- side-by-side analytical panels.

Reference widths:

- 360px
- 768px
- 1440px

---

# 30. Accessibility Requirements

Target practical WCAG 2.1 AA behavior.

Requirements:

- semantic headings;
- visible labels;
- keyboard navigation;
- visible focus;
- no hover-only controls;
- no color-only meaning;
- 44px touch targets where appropriate;
- focus trap in dialogs;
- focus return after dialog close;
- screen-reader-friendly status announcements;
- chart alternatives;
- reduced motion;
- sufficient contrast.

---

# 31. Code-First Design System Direction

The actual Next.js/React/TypeScript/Tailwind CSS 4 browser implementation is the visual source of truth. Build an original premium financial workspace with restrained editorial hierarchy: warm neutral canvas, strong typography, dense readable information, fine borders, minimal shadows, tabular numbers, intentional whitespace and asymmetric composition. Linear, Stripe, Ramp, Mercury and financial terminals may inform discipline; do not copy their designs.

Starting semantic tokens (refine only for contrast/accessibility):

| Token | Value |
|---|---|
| canvas | #F5F6F2 |
| surface | #FFFFFF |
| sidebar | #11130F |
| text-primary | #161914 |
| text-secondary | #666B62 |
| border | #DDE0D8 |
| primary | #2457E6 |
| income | #16845B |
| expense | #CF3E46 |
| warning | #B7791F |
| transfer | #5564C9 |

Define CSS custom properties and Tailwind semantic mappings for base/text/borders/brand/financial/status colors, hover/focus/disabled states and subtle backgrounds. Verify foreground/background combinations for WCAG AA; a palette color is not automatically suitable for small text. Changes for contrast must be recorded with their reason.

Prefer Geist when practical through the existing Next.js setup; it is not currently configured in the root layout. Otherwise use a high-quality available sans-serif. Define page-title/H1/H2/H3/body/small/label/helper/caption/financial/table typography; financial numbers use tabular numerals with visible decimals. Spacing scale: 4/8/12/16/20/24/32/40/48/64px. Restrained radius tokens: 6px small, 8px control, 12px card, 16px dialog, pill only for badges. Borders do most separation; elevation levels none/subtle/dropdown/modal.

Use flat sections, dividers, small panels, data rails and structured tables; cards only where useful. No purple/random decorative gradients, heavy glassmorphism, giant rounded cards, excessive shadows, generic four-card SaaS grids, emoji icons or large welcome/hero sections. Light theme first; dark theme is not required. Use one consistent professional icon set, reusing an existing set or adding one lightweight library only when justified. Motion is limited to purposeful state transitions and respects prefers-reduced-motion.

---

# 32. Suggested Reusable Components

Global:

- AppShell
- Sidebar
- MobileNavDrawer
- PageHeader
- UserMenu
- NotificationButton (P1)

UI:

- Button
- IconButton
- Card
- Badge
- Tabs
- Select
- Input
- DatePicker
- Dialog
- Drawer
- DropdownMenu
- Pagination
- EmptyState
- ErrorState
- Skeleton
- FeedbackBanner

Finance:

- MoneyDisplay
- AccountCard
- SummaryCard
- TransactionRow
- TransactionCard
- TransactionForm
- TransferForm
- RecurringCard
- BudgetCard
- GoalCard
- InsightCard (P1)
- FinancialChart

---

# 33. Desktop Dashboard Composition

Compose a financial workspace rather than a component-library demo. Lead with a large **Net Position** area (existing archived-inclusive Total Balance/net worth), pair an integrated cash-flow visualization and subordinate Income/Expenses/Net Savings figures with an account rail/panel, then organize recent activity, upcoming recurring timeline, budget progress and goals with unequal visual emphasis. Analytical summary describes existing P0 metrics and periods; P1 insight cards stay optional. Flat sections and fine dividers should carry most structure. Do not use a row of four equal balance/income/expense/savings cards followed by six equal panels.

# 34. Mobile Dashboard Composition

At 360px, stack Net Position, compact cash-flow figures/visualization, account overview, activity, upcoming schedule, budget progress and goals by importance. Use top bar plus navigation drawer, 16px gutters and readable exact numbers. Reflow rails and tables; no horizontal page overflow. Preserve financial hierarchy rather than shrinking the desktop composition. Tablet uses compact header/drawer navigation, 24px gutters and selective two-column regions.

---

# 35. Required P0 UX Flows

Auth: register → email verification/expired link → sign-in → bootstrap → dashboard → sign-out; forgot/reset success/expired link and session-expiry recovery.

New user: empty dashboard → create first account → add transaction.

Account: create → edit opening balance before activity → locked after activity → archive with automatic recurring pause → restore → explicit schedule resume.

Transactions: create/edit/hard-delete generated/manual records, search/filters/cursor history and uncertain writes.

Transfers: create/card payment → balances, list/edit/delete with confirmation.

Recurring: past-start explanation → upcoming → daily posting/catch-up display → pause/resume → archive; exhausted and failed/pending states have safe labels.

Budgets: create/edit/delete → normal/near-limit/exceeded.

Goals: create → manual progress → 100%+ suggestion → explicit complete/archive.

Analytics/dashboard: change period → actual/forecast separately labelled; zero-income savings rate “Not applicable”. P1 flows do not gate T04.

---

# 36. Code-First Delivery and Historical Design Attempt

**Approved decision:** do not use Figma. T03/T04 build real reusable frontend UI with Next.js, React, TypeScript and Tailwind CSS 4; the browser is the visual source of truth. T03 is completed and verified; T04 is completed following explicit user visual approval on 2026-10-06. The reviewed code-first V2 prototype is approved as the visual source of truth; preserve its UI design for later integration. The original amendment was documentation-only; T03 implements the component foundation.

**T03 — Build V2 Code-First Design System & App Shell:** semantic tokens, typography, layout, responsive shell/navigation and reusable P0 components, exercised through static component specimens. No API calls, Supabase/Auth clients, database access or integration with V1 financial services. Use exact-string fixtures and local presentation state only.

**T04 — Build V2 P0 UI Prototype with Fixtures:** compose /login, /register, /forgot-password, /reset-password, /dashboard, /transactions, /accounts, /recurring, /analytics, /budgets, /goals and /settings with mock data. Simulate auth/session/bootstrap, mutations, filters/pagination, validation and recovery in browser state only. These previews provide no authentication or authorization. Keep fixture previews development-only and prevent accidental production exposure before the later real auth/isolation gates. Do not alter the deployed V1 experience for a prototype. UI approval gates T05+ integration.

**Abandoned attempt:** [Expense Tracker — V2](https://www.figma.com/design/05Flgth8HPK8evKrxwRtmf) was created before the decision; quota prevented canvas construction. No custom foundation/components were completed. This file is non-authoritative and abandoned, not a dependency or quota blocker. Do not create, modify or resume it. No provider access is needed for the revised tasks.

---

# 37. Browser UI States — P0 Required, P1 Optional

## Auth

Desktop + Mobile:

- Login — default
- Login — validation error
- Login — invalid credentials
- Register — default
- Register — validation errors
- Forgot password
- Reset password
- Session expired
- Verify email / resend / expired verification link
- Reset link expired or invalid
- Profile bootstrap pending/failure/retry

## Dashboard

Desktop + Mobile:

- Dashboard — populated
- Dashboard — loading
- Dashboard — empty/new user
- Dashboard — partial error
- Dashboard — full error
- Dashboard — negative savings month
- Dashboard — budget warning
- Dashboard — upcoming recurring activity

Tablet:

- Dashboard — populated
- Dashboard — loading

## Transactions

Desktop + Mobile:

- Transactions — populated
- Transactions — search active
- Transactions — filters active
- Transactions — no results
- Transactions — loading
- Transactions — error
- Add transaction
- Add transaction — validation
- Edit transaction
- Delete confirmation

## Accounts

Desktop + Mobile:

- Accounts — populated
- Accounts — empty
- Add account
- Edit account
- Archive account confirmation with recurring pause count
- Restore account / explicit schedule resume
- Opening balance locked after first activity
- Credit-card debt/payment/overpayment
- Transfer list / edit / delete confirmation
- Account detail (P1 optional)
- Transfer form
- Transfer confirmation/error

## Recurring

Desktop + Mobile:

- Recurring — populated
- Recurring — empty
- Add recurring
- Edit recurring
- Pause confirmation
- Upcoming timeline
- Past-start no-history explanation
- Recurring exhausted / overdue / failed retry feedback
- Archive confirmation
- Recurring suggestion (P1 optional)

## Analytics

Desktop + Mobile:

- Analytics — populated
- Analytics — alternate time range
- Analytics — loading
- Analytics — insufficient data
- Analytics — error

## Budgets

Desktop + Mobile:

- Budgets — populated
- Budgets — empty
- Create budget
- Near-limit budget
- Exceeded budget

## Goals

Desktop + Mobile:

- Goals — populated
- Goals — empty
- Create/edit goal / manual update progress
- 100%+ completion suggestion / explicit completion
- Archive confirmation
- Goal detail/history/projection (P1 optional)
- Completed goal

## Reports — P1 Optional

Desktop + Mobile, only when P1 is promoted:

- Reports (P1 only) — default
- Report — filtered period
- Export state
- Report — no data

## Settings

Desktop + Mobile:

- Profile
- Accounts settings
- Categories
- Add category
- Archived category
- Security
- Export (P1 optional)

User-identity deletion confirmation is post-V2 and excluded from this checklist.

---

# 38. Browser Responsive QA

At minimum:

- 360px dashboard stress case
- 360px transaction form with keyboard-safe layout
- 768px dashboard
- 768px transaction table
- 1440px analytics dashboard
- long descriptions
- very large money values
- long category/account names
- multiline errors
- empty charts
- dense notifications (P1 optional)

---

# 39. UX Acceptance Criteria

T03/T04 browser UI is ready for later Auth/API integration only when:

- all P0 core routes have defined layouts;
- all P0 major forms are designed;
- auth states are covered;
- user ownership implications are reflected in flows;
- desktop/mobile navigation is clear;
- loading/error/empty states are defined;
- destructive actions have confirmations;
- recurring/budget/goal workflows are complete;
- analytics charts have accessible alternatives;
- responsive behavior is documented;
- frontend components are reusable with semantic tokens and responsive CSS layout;
- critical P0 fixture flows are navigable and reviewable in the actual browser;
- auth verification/reset/bootstrap, card payment/debt display, archive-induced pause/restore, cursor history, manual goal completion and zero-denominator states are covered;
- P1 browser states/pages never block core acceptance;
- 360/768/1440 browser and keyboard/stress checks are recorded;
- fixture-only delivery has no Auth/API connections and UI approval is recorded before integration.

---

# 40. BMAD Next Step

T02 financial/product/security contracts remain frozen. **T03 — Build V2 Code-First Design System & App Shell** is completed. The development-only `/v2/design-system` route implements semantic tokens, responsive shell and reusable fixture components under isolated V2 styling. See [T03 verification](t03-verification.md) for the inventory, 360/768/1440 checks, keyboard/axe audits, exact-money stress cases and production 404 boundary. Local sans-serif typography and a consistent local outline SVG set require no new application dependencies.

**T04 — Build V2 P0 UI Prototype with Fixtures** is ✅ Completed, with all twelve P0 routes under `/v2`, using isolated fictional data and local React state at its approval checkpoint. The user explicitly approved the reviewed code-first prototype as the visual source of truth on 2026-10-06 and instructed that its UI design remain unchanged. See [T04 verification](t04-verification.md) for preserved browser evidence, state coverage and the approval record. `/v2/design-system` retains specimen navigation; application pages use a separate shell composed from the T03 primitives, icons and finance components. All V2 routes remain development-only until later release gates.

**T07 provider integration:** the four Auth pages now invoke real T06 Supabase helpers with the approved layout/components/styles. Copy distinguishes real authentication from fictional financial pages. Fake Auth-state selectors, simulated resend and bootstrap retry were removed; registration requires confirmation, forgot-password success remains neutral, and password update requires an actual recovery event/session. Login redirects a confirmed/existing session to the fixture dashboard; reset success attempts local signout and offers login. The development-only test signout control occupies the former preview-control area. No new visual design, financial data integration or global route guard was introduced. See [T07 verification](t07-verification.md). T01–T07 are complete; T08 is next and unstarted.

T04 uses a dominant net-position overview and account rail, desktop transaction ledger/mobile cards, recurring timeline, narrative analytics with lightweight bars and text equivalents, category budget rows, manual goal cards and sectioned settings. Period controls filter fixture records locally; account balances remain all-history. Review controls are collapsed by default; `?state=loading|empty|error|stale|stress` provides repeatable review surfaces. Form outcomes include success, rejection, pending and uncertain, with preserved drafts and no automatic retry. Opening balances stay permanently locked after posted activity; archive pauses schedules, restore requires explicit resume, and completed goals must explicitly reopen before saved progress falls below target. No auth provider, API, storage persistence or database connection is present.

### Frozen money contract

All persisted monetary columns use PostgreSQL **NUMERIC without a precision/scale typmod**, with explicit `scale(value) <= 2` and range CHECK constraints. This preserves V1's excess-scale rejection: `NUMERIC(11,2)` would round before a CHECK could inspect the original value. Effective per-value bounds are nine integer digits and two fractional digits; no monetary column uses float/double.

| Value | Minimum | Maximum |
|---|---|---|
| Transaction, transfer, recurring amount | `0.01` | `999999999.99` |
| Account opening balance (all types) | `-999999999.99` | `999999999.99` |
| Budget amount, goal target | `0.01` | `999999999.99` |
| Goal saved amount | `0.00` | `999999999.99` |

Inputs are plain decimal strings with zero, one or two fractional digits; no exponent, whitespace, separators, plus sign or leading zeroes except zero itself. A minus sign is allowed only for opening balance; reject negative zero. Normalize accepted values to two fractional digits. Reject excess decimals (including trailing zeroes such as `1.230`) and out-of-range inputs with field validation; never round input.

Derived balances/SUM totals are unbounded exact NUMERIC and serialize as two-decimal strings. PostgreSQL rounds derived averages and percentages to two decimals, with ties away from zero (half-up for nonnegative values). Percentages are decimal strings, may exceed 100 or be negative where meaningful, and are null for zero denominators. Never calculate financial values with JS floating-point arithmetic.

### Frozen periods and aggregates

P0 currency EGP, locale en, financial timezone **Africa/Cairo** (profile fields read-only). Dashboard default is `GET /api/v2/dashboard?period=this_month`; allowed enums: **this_month, last_month, 3_months, 6_months, 1_year**. this_month is first day of current Cairo month through today; last_month is the full previous month; other enums span the current month plus previous 2/5/11 calendar months through today. Return explicit resolved from/to.

Analytics uses required explicit inclusive `from` and `to`; both valid dates from 1900-01-01 through 9999-12-31, from <= to, maximum **366 calendar days** per request. Actuals include only stored posted transactions; future range portions are allowed for forecast comparison and contain no future manual postings. Presets resolve 7/30 days inclusively ending today; 3/6/12 months start at first of month 2/5/11 months before current month. Transfer/manual transaction dates range 1900-01-01 through Cairo today.

AverageDailyExpense = actual expenses / **number of calendar days represented in the inclusive requested range**, including zero-spend/future days. Dashboard current month is already month-to-date; label it accordingly. savingsRatePercent = netSavings / income * 100; return **null when income is zero**, display “Not applicable”, never fabricated zero/infinity. Category percent uses total corresponding income/expenses as denominator, null if zero. Budget default threshold is **90%**, near_limit when spent*100 >= threshold*allocated and spent <= allocated, exceeded when spent > allocated; compare exact values before display rounding, and zero spend is normal.

Recurring commitments are the exact sum of **projected anchored occurrences within the selected range**, without weekly/yearly monthly normalization. Include only currently active schedules with active parents, respecting start/end dates; omit durable skipped dates. Posted occurrence dates use current definition amount as a forecast assumption, not an actual transaction total; deleted generated transactions are never reposted. Label forecast separately from actuals and explain that projections use the current schedule. Account balance is current all-history net worth (including archived accounts), not historical period income minus expenses.

Recurring lifecycle is frozen in architecture §20; UX must label daily delayed posting, no historic creation backfill, skipped paused dates, failed retry and exhausted nextOccurrence.

---

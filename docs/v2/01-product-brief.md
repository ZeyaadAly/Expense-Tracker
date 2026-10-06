# Expense Tracker V2 — Product Brief

**Version:** 2.0 Planning — T02 decisions recorded
**Status:** P0 planning frozen with approved code-first design amendment; revised T03/T04 not started
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Previous release:** V1 — completed and deployed

**Release rule:** Core completion requires P0 only. P1 sections are optional enhancement contracts; post-V2 features do not gate core release. Decisions are frozen as of 2026-10-06; future material changes follow change control.

---

## 1. Executive Summary

Expense Tracker V2 evolves the existing single-user expense tracker into a secure, multi-user personal finance platform.

V1 proved the core full-stack flow: users can create, read, update, delete, filter, and summarize income and expense transactions through a Next.js frontend, Express API, PostgreSQL/Supabase database, and production Vercel deployment.

V2 expands that foundation into a broader personal finance product centered on:

- user accounts and authentication;
- multiple financial accounts;
- richer transaction management;
- recurring income and recurring expenses;
- analytics and financial insights;
- budgets;
- savings goals;
- notifications and reminders (P1);
- dedicated pages instead of a single dashboard;
- stronger user-specific data isolation and security.

The product should remain understandable and practical rather than becoming a banking platform. V2 focuses on personal finance organization, analysis, and planning.

---

## 2. Product Vision

Build a personal finance application that helps a user answer four questions:

1. What do I own and where is my money?
2. Where does my money come from and where does it go?
3. What financial activity repeats automatically or predictably?
4. Am I improving my financial position over time?

The V2 experience should move beyond recording transactions and become a financial overview and planning system.

---

## 3. Problem Statement

V1 provides useful transaction tracking, but it has major limitations:

- no authentication;
- one shared transaction collection;
- no user ownership or isolation;
- no concept of bank/cash/savings accounts;
- no transfers between accounts;
- no recurring transaction model;
- no analytical dashboard;
- no budgets or goals;
- only one main application page;
- limited filtering and reporting;
- no personalized financial insights.

A user with salary income, recurring bills, several accounts, savings goals, and monthly spending patterns needs more than a flat transaction list.

V2 should solve this by organizing financial data around the authenticated user and providing dedicated workflows for tracking, analyzing, and planning finances.

---

## 4. Target Users

### Primary Persona — Individual Personal Finance User

A person who wants to track their financial life without using a complicated accounting system.

Typical behavior:

- receives one or more recurring income sources;
- spends from cash, bank accounts, cards, or wallets;
- pays repeated bills/subscriptions;
- wants to know monthly income, expenses, and savings;
- wants to understand where money is being spent;
- may have savings goals or spending limits.

### Secondary Persona — Student / Early-Career User

A user with a smaller financial footprint who may have:

- salary or allowance income;
- freelance income;
- daily transport and food costs;
- subscriptions;
- short-term savings goals;
- a need for a simple but visual financial overview.

---

## 5. Product Goals

V2 should:

1. Support secure account creation and sign-in.
2. Ensure every user's financial data is isolated.
3. Allow a user to manage multiple financial accounts.
4. Make transaction entry and management easier at scale.
5. Support recurring income and expense schedules.
6. Provide useful financial analytics over time.
7. Support monthly budgets and progress monitoring.
8. Support savings goals.
9. Provide clear upcoming financial activity.
10. Expand the product into multiple focused pages.
11. Preserve exact money handling and safe date behavior from V1.
12. Maintain responsive and accessible UX.
13. Keep the backend authoritative for financial calculations.
14. Remain deployable within the existing Next.js + Express + Supabase/PostgreSQL architecture.

---

## 6. Release Scope and Non-Goals

**V2 Core Completion = P0 only.** P1 features are planned V2 enhancements after the core release and require explicit promotion to become core gates.

- P0: Supabase Auth/profile, protected app, user isolation, accounts, account-aware transactions, transfers, recurring definitions/occurrences/generation/upcoming, dashboard, analytics, monthly category budgets, manual-progress goals, custom categories, core settings, search/filter/cursor pagination, migration, financial/security/accessibility validation and production acceptance.
- P1: notifications, reports/CSV/JSON export, recurring-pattern detection, deterministic insight cards, goal projections/history/detail, and account detail page.
- Post-V2 / P2: user-identity deletion, budget rollover, account-linked automatic goal progress, email/push, PDF/Excel, advanced detection, richer debt products, bank sync, AI advice, OCR, investments, shared wallets and currency conversion.

P0 shows budget warning states within budget/dashboard views; persistent notifications are P1. /reports, account-detail routes, notification controls and export sections are absent from P0 navigation. P1 tables/endpoints/browser states below describe enhancement contracts, not core requirements.

---

## 7. V2 Product Areas — P0 and P1

### 7.1 Authentication and User Profiles

V2 introduces real users.

Required capabilities:

- sign up;
- sign in;
- sign out;
- forgot password;
- reset password;
- production email verification required;
- protected application routes;
- user profile;
- user-specific data ownership.

Supabase Auth is final; Express verifies ES256 JWTs using the configured project JWKS. Profiles bootstrap through the authenticated backend; see architecture §7.

The browser should authenticate the user, while the Express backend should validate authenticated requests before reading or modifying financial data.

### 7.2 Financial Accounts

Users can create and manage accounts representing where money is held.

Examples:

- Cash
- Bank account
- Savings account
- Credit card
- Mobile wallet

Initial account fields may include:

- ID
- User ID
- Name
- Account type
- Initial balance
- Currency
- Status
- Created timestamp
- Updated timestamp

P0 is EGP-only, with Africa/Cairo financial dates.

### 7.3 Transactions

Transactions remain a core domain but become user- and account-aware.

Each income or expense transaction should belong to:

- one authenticated user;
- one financial account;
- one category.

Transaction management should support:

- create;
- read;
- edit;
- delete;
- search;
- pagination;
- date filtering;
- account filtering;
- type filtering;
- category filtering;
- deterministic sorting.

The main transaction entry and management experience should move to a dedicated `/transactions` page.

### 7.4 Transfers

Users should be able to move money between their own accounts.

Example:

- From: Bank Account
- To: Cash
- Amount: 2,000 EGP

A transfer must not increase income or expenses.

Final: a dedicated `transfers` table with atomic create/edit/hard-delete; different owned active accounts, optional description, manual date rules, explicit delete confirmation. Transfers never affect income/expense analytics.

### 7.5 Recurring Income and Expenses

V2 introduces recurring financial activity.

Examples:

**Income**
- monthly salary;
- weekly freelance payment;
- daily allowance;
- yearly bonus.

**Expenses**
- monthly rent;
- internet;
- phone bill;
- subscriptions;
- weekly transport allowance;
- yearly membership.

Initial recurrence frequencies:

- daily;
- weekly;
- monthly;
- yearly.

A recurring definition should support:

- type;
- amount;
- account;
- category;
- description;
- frequency;
- start date;
- next occurrence;
- optional end date;
- active/paused/archived status; next occurrence nullable when paused/archived/exhausted.

The implementation plan must distinguish between the recurring schedule definition and actual generated financial transactions.

### 7.6 Recurring Pattern Detection — P1

A later V2 milestone may detect likely recurring activity from transaction history.

Examples:

> Salary of 15,000 EGP appears every month. Mark as recurring?

> Netflix appears monthly. Create a recurring expense?

This feature should begin with deterministic pattern detection rather than AI.

It should be optional and never create recurring transactions without user confirmation.

### 7.7 Dashboard

The V2 dashboard becomes an overview rather than the main data-entry screen.

Suggested dashboard sections:

- total balance;
- total income;
- total expenses;
- savings/net cash flow;
- account balances;
- recent transactions;
- upcoming recurring transactions;
- monthly budget status;
- basic income vs expense chart;
- financial insights (P1, omitted from core).

The dashboard should link users to deeper pages rather than trying to contain every feature.

### 7.8 Analytics

A dedicated `/analytics` page should help users understand financial behavior.

Initial analytics may include:

- income vs expenses by month;
- expense breakdown by category;
- income sources;
- monthly net savings;
- account-level activity;
- average daily spending (P0);
- richer spending metrics, largest expense and highest spending category insights (P1);
- spending trend;
- recurring income total;
- recurring expense total.

Time ranges may include:

- 7 days;
- 30 days;
- 3 months;
- 6 months;
- 1 year;
- custom range.

Financial totals should be calculated on the backend/database, not recomputed with unsafe JavaScript floating-point arithmetic.

### 7.9 Financial Insights — P1

V2 can generate deterministic insights such as:

- Food spending increased compared with last month.
- Transport spending decreased.
- You saved a percentage of your income this month.
- Recurring expenses use part of recurring monthly income.
- Average daily spending for the selected period.

Insights should be based on verified financial calculations.

AI-generated advice is not required for core V2.

### 7.10 Budgets

Users can define spending budgets.

Example:

- Food — 3,000 EGP/month
- Transport — 1,500 EGP/month
- Entertainment — 1,000 EGP/month

The budget experience should show:

- allocated amount;
- spent amount;
- remaining amount;
- percentage used;
- exceeded state;
- near-limit state.

Initial scope should focus on monthly category budgets.

### 7.11 Savings Goals

Users can create financial goals.

Examples:

- Emergency Fund
- Laptop
- Travel
- Tuition

A goal may include:

- name;
- target amount;
- current saved amount;
- target date;
- status;
- optional linked account.

The application may later estimate when a user could reach a goal based on savings history.

### 7.12 Notifications and Alerts — P1

Initial V2 notifications should be in-app.

Examples:

- recurring payment due tomorrow;
- recurring salary expected soon;
- 90% of budget used;
- budget exceeded;
- goal milestone reached.

Email/push notifications can be considered later.

### 7.13 Categories

V2 should support:

- system default categories;
- user-defined categories;
- income/expense applicability;
- optional icon;
- optional display color;
- active/archived state.

Custom categories archive/restore only; historical references stay valid and archive pauses active schedules. System categories are immutable.

### 7.14 Reports and Export — P1

A later V2 milestone should support a dedicated `/reports` page.

Possible report content:

- selected date period;
- income;
- expenses;
- net savings;
- category breakdown;
- recurring costs;
- account balances.

Export formats can initially include:

- CSV;
- JSON.

PDF/Excel export may be added later if justified.

---

## 8. Proposed Application Pages

### Public / Authentication

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`

### Protected Application

- `/dashboard`
- `/transactions`
- `/accounts`
- `/analytics`
- `/recurring`
- `/budgets`
- `/goals`
- `/reports` (P1 only)
- `/settings`

### Settings Areas

Potential settings sections:

- Profile
- Accounts
- Categories
- Preferences
- Security
- Data export (P1)

The information architecture is frozen in UX §3, with P1 navigation hidden in core.

---

## 9. High-Level User Journeys

### Journey A — New User

1. User creates an account.
2. User verifies/signs in.
3. User creates their first financial account.
4. User adds current balance or opening balance.
5. User adds income/expense transactions.
6. Dashboard begins showing personalized financial data.

### Journey B — Monthly Salary User

1. User records salary.
2. User marks salary as monthly recurring income.
3. User records monthly bills.
4. User marks bills as recurring expenses.
5. Dashboard shows upcoming salary/bills.
6. Analytics compares monthly income and recurring obligations.

### Journey C — Budgeting

1. User creates a monthly Food budget.
2. User records food expenses.
3. Budget progress updates.
4. User receives warning near the limit.
5. Analytics shows whether food spending increased/decreased.

### Journey D — Saving for a Goal

1. User creates a savings goal.
2. User assigns a target amount/date.
3. User manually updates goal progress; an optional linked account is metadata only.
4. Dashboard shows current percentage.
5. Analytics can later estimate progress trend.

---

## 10. Proposed V2 Navigation

Desktop navigation may use a sidebar.

Suggested sections:

### Overview
- Dashboard

### Money
- Transactions
- Accounts
- Recurring

### Planning
- Budgets
- Goals

### Insights
- Analytics
- Reports (P1 only)

### Account
- Settings

Mobile navigation should be designed separately during UX planning and must not simply shrink the desktop sidebar.

---

## 11. High-Level Data Model

The frozen V2 domain (detailed in database design) includes:

- Supabase `auth.users`
- `profiles`
- `accounts`
- `categories`
- `transactions`
- `transfers` (dedicated, final)
- `recurring_transactions`
- `recurring_occurrences` (durable P0 idempotency ledger)
- `budgets`
- `goals`
- `notifications` (P1 only)

Core ownership principle:

> Every user-owned financial record must be securely associated with one authenticated user.

---

## 12. High-Level Architecture Direction

The intended architecture remains:

```text
Browser
   ↓
Next.js frontend
   ↓
Supabase Auth session/token
   ↓
Express API
   ↓
Authentication / authorization middleware
   ↓
PostgreSQL / Supabase
```

Important principles:

- browser never receives database credentials;
- the frontend does not bypass the Express API for financial business logic;
- backend verifies authenticated identity;
- backend queries are user-scoped;
- database constraints remain a final safety layer;
- exact money values remain PostgreSQL numeric values and decimal strings in API contracts;
- financial aggregates are calculated in PostgreSQL/backend;
- date-only values preserve calendar-day meaning.

The authentication/security decisions are frozen in architecture §§7, 10.

---

## 13. Security Goals

V2 introduces materially higher security requirements.

Required principles:

- authenticated access to protected data;
- strict per-user authorization;
- no cross-user data exposure;
- secure token verification;
- limited backend database role;
- TLS;
- parameterized SQL;
- safe API errors;
- rate limiting strategy where appropriate;
- secure password/reset flows delegated to the authentication provider;
- no secrets in frontend bundles;
- no trust in frontend-supplied user IDs;
- user identity derived from the verified authenticated session/token.

Security testing must explicitly attempt cross-user access.

---

## 14. Frozen Financial Rules

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

### Frozen balance and credit-card rules

Asset-like accounts (cash/bank/savings/mobile_wallet/other):

`currentBalance = openingBalance + income - expenses + incomingTransfers - outgoingTransfers`.

Credit cards use **debt-positive** balances:

`currentBalance = openingBalance + expenses - income + outgoingTransfers - incomingTransfers`.

Purchases are expense transactions and increase debt. Refunds/credits recorded as income reduce debt (and count as income under this simple tracker model). A payment is a transfer from an asset account to the card: asset money falls and card debt falls; payment never counts as expense again. Transfers from cards model cash advances and increase debt. Overpayment is allowed and produces negative debt (credit owed to the user).

**Total Balance = net worth = SUM(asset balances) - SUM(card debt balances)**, including archived accounts; archiving cannot remove money/debt from net worth. Period income/expenses/netSavings are actual income/expense transactions only. Account balances are current all-history values, independent of selected dashboard/analytics period. No credit limit, statement cycle, interest or billing automation is included.

### Frozen periods and aggregates

P0 currency EGP, locale en, financial timezone **Africa/Cairo** (profile fields read-only). Dashboard default is `GET /api/v2/dashboard?period=this_month`; allowed enums: **this_month, last_month, 3_months, 6_months, 1_year**. this_month is first day of current Cairo month through today; last_month is the full previous month; other enums span the current month plus previous 2/5/11 calendar months through today. Return explicit resolved from/to.

Analytics uses required explicit inclusive `from` and `to`; both valid dates from 1900-01-01 through 9999-12-31, from <= to, maximum **366 calendar days** per request. Actuals include only stored posted transactions; future range portions are allowed for forecast comparison and contain no future manual postings. Presets resolve 7/30 days inclusively ending today; 3/6/12 months start at first of month 2/5/11 months before current month. Transfer/manual transaction dates range 1900-01-01 through Cairo today.

AverageDailyExpense = actual expenses / **number of calendar days represented in the inclusive requested range**, including zero-spend/future days. Dashboard current month is already month-to-date; label it accordingly. savingsRatePercent = netSavings / income * 100; return **null when income is zero**, display “Not applicable”, never fabricated zero/infinity. Category percent uses total corresponding income/expenses as denominator, null if zero. Budget default threshold is **90%**, near_limit when spent*100 >= threshold*allocated and spent <= allocated, exceeded when spent > allocated; compare exact values before display rounding, and zero spend is normal.

Recurring commitments are the exact sum of **projected anchored occurrences within the selected range**, without weekly/yearly monthly normalization. Include only currently active schedules with active parents, respecting start/end dates; omit durable skipped dates. Posted occurrence dates use current definition amount as a forecast assumption, not an actual transaction total; deleted generated transactions are never reposted. Label forecast separately from actuals and explain that projections use the current schedule. Account balance is current all-history net worth (including archived accounts), not historical period income minus expenses.

---

## 15. UX Principles

V2 should remain:

- responsive;
- keyboard accessible;
- screen-reader friendly;
- clear under loading/error/empty states;
- usable on mobile;
- consistent across pages;
- explicit about financial units and time periods.

The UI should favor understandable financial language over accounting jargon.

Data visualizations must always include a non-color-only interpretation and accessible text/table equivalents where appropriate.

---

## 16. Success Criteria

V2 will be successful when an authenticated user can:

1. create an account and securely sign in;
2. manage multiple financial accounts;
3. record account-specific transactions;
4. move money between accounts without corrupting income/expense totals;
5. configure recurring income and expenses;
6. view upcoming recurring activity;
7. analyze financial trends;
8. define and track budgets;
9. define and track savings goals;
10. manage categories/profile/settings;
11. access only their own financial information;
12. use the system across mobile, tablet, and desktop;
13. receive accurate financial calculations;
14. recover safely from API/network failures.

---

## 17. Product Milestones — Summary

Milestone numbering here is a product-area summary; the executable task/milestone dependencies are authoritative in implementation plan §20. P1 bullets are not core gates.

### M1 — Discovery and Design
- Product brief
- PRD
- UX specification
- Architecture
- Database design
- API design
- Code-first frontend design system/app shell and fixture UI prototype
- Implementation plan

### M2 — Authentication and User Isolation
- Supabase Auth
- login/register/reset flows
- protected frontend
- authenticated Express API
- user-specific data access

### M3 — Accounts
- accounts backend
- accounts UI
- account-aware transactions
- transfer design/implementation

### M4 — Transaction Management V2
- dedicated transaction page
- search
- pagination
- advanced filters
- account/category/date filtering

### M5 — Recurring Finance
- recurring definitions
- upcoming activity
- schedule processing
- recurring pattern suggestions (P1)

### M6 — Analytics
- analytical queries
- analytics APIs
- charts
- deterministic insights (P1)

### M7 — Budgets
- monthly budgets
- progress
- warnings

### M8 — Goals
- savings goals
- progress tracking
- projections (P1)

### M9 — Settings / Categories / Reports
- profile
- custom categories
- export/reporting (P1)

### M10 — V2 Quality and Deployment
- full validation
- security audit
- multi-user isolation testing
- documentation
- production deployment

---

## 18. Product Decisions Resolved in T02

All former open questions are resolved: derived balances with debt-positive cards; dedicated transfers; automatic date-based daily recurrence with durable occurrences; archive-only parents; manual goal progress; server-side ILIKE search; cursor pagination; EGP/Cairo-only core; no budget rollover; P1 notifications; post-V2 identity deletion.

### Frozen account/category lifecycle

Accounts support create/edit/archive/restore, never hard delete in P0. Opening balance and crossing between credit-card and asset semantics can be edited only while `opening_balance_locked = false`. Set that flag permanently on first transaction or transfer involving the account; deletion never unlocks it. Lock/check the account row atomically to prevent concurrent first activity and opening-balance edits. Name and asset-to-asset type edits remain allowed.

Archiving an account **automatically pauses all its active recurring definitions** in the same database transaction. Archiving a custom category does the same for its definitions. Lock affected accounts/categories and definitions consistently so archive cannot race a posting. Restore does not auto-resume schedules; user resumes explicitly after both references are active. System categories cannot be edited/archived.

Archived references remain in history and totals. Reject new transactions/transfers/recurring definitions or postings using archived references. Editing a transaction/transfer requires its resulting account/category references to be active; restore first for historical corrections. Hard deletion of owned historical transactions/transfers remains allowed even when parents are archived. Existing goal links to archived accounts remain metadata; assigning a link requires an owned active account. Category kind is immutable after any transaction, recurring definition or budget references it; category owner/system flag is always immutable.

P0 goal progress is manually maintained `savedAmount`; `linkedAccountId` is optional owned-account metadata only and never changes progress. No progress-event table or detail page is required in P0. Saved amount may exceed target; percentComplete is not clamped, remainingAmount is `max(targetAmount - savedAmount, 0)`. At 100%+, suggest completion; only an explicit user transition sets status completed. Complete requires savedAmount >= targetAmount; reducing a completed goal below target requires an explicit transition back to active in the same update. Active/completed goals can be archived; archived goals are read-only in P0. Projection/history/detail are P1; automatic account-derived progress is post-V2.

Recurring execution is final in architecture §§20–22; pagination/auth/RLS are final in §§7, 10, 32. Account detail and goal detail/history are P1. No implementation-blocking product decisions remain.

---

## 19. Frozen V1 Migration Strategy

### Frozen migration ownership and cutover

The migration operator supplies the **verified intended existing-data owner UUID** at execution time; no real UUID is hardcoded. Preserve **all retained V1 production records, including retained demo rows**, assign them to that owner and a cash `Main Account` with openingBalance `0.00`. Record actual IDs/counts/amounts/categories/dates/timestamps/totals from the production inventory at cutover; historical T14 counts are not a migration assumption. Unknown category mapping aborts; never seed or silently delete retained data.

Choose a **maintenance-window cutover**, not dual public operation:

1. Rehearse full migration/rollback on a disposable production-like copy, prepare source/environment rollback artifacts, and take a verified production backup.
2. Deploy and verify maintenance enforcement for **all V1 financial reads/writes and summary routes**, across current and still-reachable older deployments; suspend old runtime SELECT/INSERT/UPDATE/DELETE grants if needed to neutralize old deployments. Public V1 health may remain. Verify direct HTTP requests are blocked before schema/backfill. No V2 financial writes or cron yet.
3. Capture the frozen inventory; execute additive tables/nullable columns/reference seeds through the privileged versioned migration workflow.
4. Operator creates/verifies the Auth owner and provisions profile; create default Main Account.
5. Final backfill user_id/account_id/category_id, preserving IDs, amounts, descriptions, transaction_date, created_at and updated_at. Backfill bypasses only the timestamp-update trigger in the privileged maintenance transaction, restoring it afterward; normal runtime cannot bypass it.
6. Reconcile every preserved field and exact totals, validate ownership/category mapping; only then apply NOT NULL, ownership FKs, checks and indexes.
7. Deploy authenticated V2 backend while maintenance remains; verify auth/isolation and permanently remove V1 financial handlers. Restore only V2-required runtime grants once old deployments cannot bypass maintenance.
8. Deploy V2 frontend, verify production under controlled access; run reconciliation/isolation/financial checks before enabling user access and daily cron.
9. Close maintenance after gates pass. Verify `/api/v1` financial paths remain unavailable (maintenance 503, then 410 API_RETIRED with no data); protect/remove old backend deployments and public aliases. Retirement enforcement precedes the first V2 user write; never retain unauthenticated read-only compatibility against V2 data.

Temporary compatibility consists only of retained legacy columns/backups and a maintenance response to old clients. P0 keeps `transaction_date` in storage and maps it to API `date`; no date-column rename. Retain legacy category text for rollback evidence, make it nullable/drop its V1-only category check after reconciliation, and map V2 categories by category_id; do not fabricate legacy values for new custom categories. Later column removal is a separate migration after stability, not part of first cutover.

### Frozen rollback windows

**A — Before any V2 financial user/cron writes:** keep maintenance enforced; use the rehearsed compatibility rollback or verified backup to restore the V1 schema/data and deployment. Reconcile against frozen inventory before restoring V1 access/grants. Retain legacy columns; do not automatically delete newly created Auth identities. A return to public V1 is only valid if the restored dataset is still the original shared/demo-only baseline and no multi-user financial data is exposed.

**B — After any V2 financial user/cron writes:** keep authenticated V2 controls or maintenance in place; **forward-fix is preferred**. Never deploy an unguarded V1 backend or blindly restore the pre-cutover backup. Any point-in-time/data recovery requires a current snapshot, explicit reconciliation/replay of all post-cutover writes and operator approval of recovery/data-loss consequences. Schema rollback cannot erase new users/categories/transfers/occurrences. Record the write-enable checkpoint in the runbook.

---

## 20. BMAD Next Step

T01/T02 are complete. The approved design-process amendment replaces Figma with Next.js/React/TypeScript/Tailwind CSS 4 browser implementation as the visual source of truth. Next: **T03 — Build V2 Code-First Design System & App Shell**, then **T04 — Build V2 P0 UI Prototype with Fixtures**. Both use static fixtures only, without API or authentication connections. UI approval precedes T05+ integration. This task changes documentation only; neither revised task has started.

---

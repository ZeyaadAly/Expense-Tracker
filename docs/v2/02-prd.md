# Expense Tracker V2 — Product Requirements Document (PRD)

**Version:** 2.0 Planning — T02 decisions recorded
**Status:** P0 planning frozen with approved code-first design amendment; revised T03/T04 not started
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`

**Release rule:** Core completion requires P0 only. P1 sections are optional enhancement contracts; post-V2 features do not gate core release. Decisions are frozen as of 2026-10-06; future material changes follow change control.

---

## 1. Purpose

This PRD translates the Expense Tracker V2 product brief into detailed product requirements, user stories, acceptance criteria, scope boundaries, and quality expectations.

V2 expands the deployed V1 into a secure multi-user personal finance platform with:

- authentication;
- user-specific financial data;
- multiple financial accounts;
- account-aware transactions;
- transfers;
- recurring income and expenses;
- financial analytics;
- budgets;
- savings goals;
- notifications (P1);
- custom categories;
- reports and exports (P1);
- multiple application pages.

This document defines **what the product must do**. Detailed UX belongs in the UX specification. Detailed technical design belongs in architecture, database, and API documents.

---

## 2. Product Goals

V2 must allow an authenticated user to:

1. securely create and access their own account;
2. manage multiple financial accounts;
3. record income and expense transactions per account;
4. transfer money between owned accounts;
5. define recurring income and expenses;
6. view upcoming recurring financial activity;
7. analyze financial behavior over time;
8. define and monitor budgets;
9. define and monitor financial goals;
10. view budget warnings in core views (persistent in-app alerts are P1);
11. manage categories and profile settings;
12. search, filter, and paginate transaction history;
13. access only their own financial information;
14. use the application reliably on mobile, tablet, and desktop.

---

## 3. V2 Scope

**V2 Core Completion = P0 only.** P1 features are planned V2 enhancements after the core release and require explicit promotion to become core gates.

- P0: Supabase Auth/profile, protected app, user isolation, accounts, account-aware transactions, transfers, recurring definitions/occurrences/generation/upcoming, dashboard, analytics, monthly category budgets, manual-progress goals, custom categories, core settings, search/filter/cursor pagination, migration, financial/security/accessibility validation and production acceptance.
- P1: notifications, reports/CSV/JSON export, recurring-pattern detection, deterministic insight cards, goal projections/history/detail, and account detail page.
- Post-V2 / P2: user-identity deletion, budget rollover, account-linked automatic goal progress, email/push, PDF/Excel, advanced detection, richer debt products, bank sync, AI advice, OCR, investments, shared wallets and currency conversion.

P0 shows budget warning states within budget/dashboard views; persistent notifications are P1. /reports, account-detail routes, notification controls and export sections are absent from P0 navigation. P1 tables/endpoints/browser states below describe enhancement contracts, not core requirements.

---

## 4. Personas

### Persona A — Salaried User

Needs recurring salary, recurring bills, account balances, monthly analytics, budgets, and savings goals.

### Persona B — Freelancer

Needs flexible income sources, multiple accounts, date-range analytics, and cash-flow visibility.

### Persona C — Student / Early-Career User

Needs easy transaction entry, mobile usability, simple budgets, recurring subscriptions, and short-term goals.

---

## 5. User Role

### Authenticated User

Can manage only their own:

- profile;
- accounts;
- categories;
- transactions;
- transfers;
- recurring transactions;
- budgets;
- goals;
- notifications (P1);
- reports and exports.

No admin dashboard is required in core V2.

---

## 6. Authentication Requirements

### AUTH-01 — Registration

User can register with email and password.

**Acceptance criteria**
- valid registration succeeds;
- invalid email/password is rejected;
- duplicate email is handled safely;
- errors do not expose internals.

### AUTH-02 — Sign In

**Acceptance criteria**
- valid credentials authenticate;
- invalid credentials return safe feedback;
- protected pages require authentication.

### AUTH-03 — Sign Out

**Acceptance criteria**
- session clears;
- protected pages become inaccessible.

### AUTH-04 — Password Recovery

**Acceptance criteria**
- user can request and complete password reset securely.

### AUTH-05 — Session Persistence

**Acceptance criteria**
- valid session survives reload;
- expired session requires reauthentication.

### AUTH-06 — Backend Token Verification

ES256 JWTs verified against project JWKS; verified sub determines owner. Production email confirmation and 15-minute access tokens are configured in T05, not T02.

**Acceptance criteria**
- Express verifies authenticated requests;
- backend derives user identity from verified auth context;
- frontend-supplied user IDs are never trusted.

---

## 7. User Profile Requirements

### Frozen authentication boundary

Supabase Auth email/password with email confirmation enabled in production; reset redirects are allowlisted. Frontend uses one Supabase browser client with session persistence/automatic refresh, accesses its current token for each Express request, and sends Bearer authorization. Use a client protected layout/route guard with an initial loading gate: render no financial content or requests before session/bootstrap succeeds. P0 renders authenticated financial data client-side; no cookie-based Express auth or financial SSR cache is introduced. Root / redirects to dashboard or login after session resolution; only local allowlisted return paths are accepted.

Backend uses **jose remote JWKS verification**, as described by Supabase's official JWT guidance, against the configured project `/auth/v1/.well-known/jwks.json`. T05 must verify/select an asymmetric **ES256 signing key** before T09 verification tests; do not assume the current project already has one. Pin allowed algorithm ES256, exact issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`, expiration, nbf when present, nonempty UUID sub and authenticated role. Identity is verified sub, never user metadata or body/query userId. Fail closed on verification/JWKS failure; no legacy HS256 fallback/shared JWT secret. Cache remote keys through the library and test rotation/unknown kid.

Profile provisioning uses authenticated **POST /api/v2/profile/bootstrap** with empty JSON body: idempotent insert-on-conflict using verified sub, defaults EGP/en/Africa/Cairo and no auth-schema reads or admin key. Signup display name remains a draft until verified sign-in; PUT /profile writes validated displayName. Bootstrap runs after authenticated session resolution and before financial reads. GET/PUT /profile returns **409 PROFILE_REQUIRED** if missing; client re-runs bootstrap safely. This avoids an auth.users trigger failure blocking signup; profiles also backfill through the operator migration flow. Only displayName is editable in P0; currency/locale/timezone are returned read-only.

On sign-out/user change/auth invalidation, clear financial data and cursor history, abort pending reads and suppress late responses from the old session. Supabase refreshes sessions; on API 401 block operations, clear protected UI and redirect to login without retrying uncertain writes. Supabase sign-out does not instantly revoke locally verified access tokens; authorization lasts until JWT expiry. Configure access-token lifetime **15 minutes** in T05. Strong session revocation and identity deletion require separate post-V2 design.

References checked 2026-10-06: [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts), [user provisioning and trigger failure behavior](https://supabase.com/docs/guides/auth/managing-user-data).

---

## 8. Account Requirements

P0 account types: cash, bank, savings, credit_card, mobile_wallet, other. Required fields: name, type, openingBalance, currency EGP. Owned create/read/update/archive/restore; no account hard-delete endpoint. Account detail page is P1.

### Frozen balance and credit-card rules

Asset-like accounts (cash/bank/savings/mobile_wallet/other):

`currentBalance = openingBalance + income - expenses + incomingTransfers - outgoingTransfers`.

Credit cards use **debt-positive** balances:

`currentBalance = openingBalance + expenses - income + outgoingTransfers - incomingTransfers`.

Purchases are expense transactions and increase debt. Refunds/credits recorded as income reduce debt (and count as income under this simple tracker model). A payment is a transfer from an asset account to the card: asset money falls and card debt falls; payment never counts as expense again. Transfers from cards model cash advances and increase debt. Overpayment is allowed and produces negative debt (credit owed to the user).

**Total Balance = net worth = SUM(asset balances) - SUM(card debt balances)**, including archived accounts; archiving cannot remove money/debt from net worth. Period income/expenses/netSavings are actual income/expense transactions only. Account balances are current all-history values, independent of selected dashboard/analytics period. No credit limit, statement cycle, interest or billing automation is included.

### Frozen account/category lifecycle

Accounts support create/edit/archive/restore, never hard delete in P0. Opening balance and crossing between credit-card and asset semantics can be edited only while `opening_balance_locked = false`. Set that flag permanently on first transaction or transfer involving the account; deletion never unlocks it. Lock/check the account row atomically to prevent concurrent first activity and opening-balance edits. Name and asset-to-asset type edits remain allowed.

Archiving an account **automatically pauses all its active recurring definitions** in the same database transaction. Archiving a custom category does the same for its definitions. Lock affected accounts/categories and definitions consistently so archive cannot race a posting. Restore does not auto-resume schedules; user resumes explicitly after both references are active. System categories cannot be edited/archived.

Archived references remain in history and totals. Reject new transactions/transfers/recurring definitions or postings using archived references. Editing a transaction/transfer requires its resulting account/category references to be active; restore first for historical corrections. Hard deletion of owned historical transactions/transfers remains allowed even when parents are archived. Existing goal links to archived accounts remain metadata; assigning a link requires an owned active account. Category kind is immutable after any transaction, recurring definition or budget references it; category owner/system flag is always immutable.

---

## 9. Transaction Requirements

### TX-01 — Create Transaction

Required fields:

- account;
- type;
- amount;
- category;
- date;
- description.

### TX-02 — Transaction List

Must support:

- user scoping;
- deterministic sorting;
- pagination;
- search;
- filters;
- loading/error/empty states.

### TX-03 — Search

Initial searchable fields:

- description;
- category name;
- account name.

Search must be server-side and parameterized.

### TX-04 — Advanced Filters

Support:

- type;
- category;
- account;
- date range;
- recurring Generated/Manual; omit for All.

### TX-05 — Pagination

Cursor pagination is final: scope-bound signed cursor, backend nextCursor only, frontend cursor history for Previous (API §11).

### TX-06 — Edit Transaction

Ownership must be checked.

### TX-07 — Delete Transaction

Hard delete with explicit confirmation; generated occurrence ledger remains posted with transaction link cleared.

---

## 10. Transfer Requirements

P0 uses dedicated transfers with create/read/edit/hard-delete, different owned active accounts and positive exact amount. Description is optional (trimmed 0–200 Unicode code points; blank normalizes to null). Dates use 1900-01-01 through Cairo today. All mutations are atomic using one checked-out DB client and consistent account row locks; delete requires confirmation. No transfer archival. Deletes against archived parents are permitted for correction; edits require active resulting references. Transfers never count as income/expense.

---

## 11. Recurring Transaction Requirements

### Frozen recurring execution

- Provider: **Vercel Cron**, one daily job on the Express backend project, `0 3 * * *` (03:00 UTC). Hobby's once-daily, hour-level precision is sufficient: P0 promises date-based daily posting, not midnight or minute precision. Infrastructure uses UTC; all financial due dates and manual-date validation use **Africa/Cairo**, fixed/read-only in P0. No auth/provider settings are changed by T02.
- Endpoint: **GET /internal/recurring/process**, outside `/api/v2`, with server-only `Authorization: Bearer <CRON_SECRET>`; constant-time secret validation, no-store, no redirects, no browser credentials or user token authorization. Never authenticate by user-agent/header schedule alone.
- Process active schedules oldest-due first, at most **100 occurrences per definition and 1000 attempts globally per invocation**; stop earlier with a safety buffer before the configured function deadline. Each occurrence commits independently. Return safe counts plus `hasRemaining`; unfinished/failed work continues next daily invocation or an operator's authenticated invocation of the same handler. Provider does not guarantee retries; log backlog/failures safely.
- Creating a schedule anchors it to `startDate` but initializes `nextOccurrence` to the first anchored date **on or after Cairo today** (or startDate if future). No historic import/backfill occurs. Today's occurrence is due even if today's cron already ran; it posts on the next run using its original date.
- Monthly recurrence uses the original start-date day, clamped to the last valid day each month (Jan 31 → Feb 28/29 → Mar 31). Weekly recurrence uses startDate's weekday (ISO Monday=1 … Sunday=7); yearly uses original month/day, with Feb 29 → Feb 28 in non-leap years and Feb 29 again in leap years. API accepts no independent weekday/month-day fields in P0.
- Catch-up applies only to active schedules missed by the scheduler; occurrences are posted with their original dates. End date is inclusive. After the final occurrence, `nextOccurrence = null`; expose an exhausted flag without adding a new stored lifecycle status.
- Pause clears nextOccurrence and marks any pending/failed unposted occurrence rows skipped. Resume finds the first anchored, nonterminal occurrence on or after today; paused history is not generated. Archive behaves like pause and is permanent in P0 (no recurring restore).
- Definition edits lock the definition, retain posted/skipped occurrences and historical transactions unchanged, mark pending/failed unposted rows skipped, then recalculate the first unprocessed anchored date on or after today. Paused/archived definitions keep nextOccurrence null. Already terminal dates are never replayed, even after schedule edits or generated-transaction deletion.
- Durable `recurring_occurrences` rows own idempotency. Claim/create pending occurrence under definition lock and commit; in a second transaction lock definition/occurrence, recheck active parents, create transaction, mark posted/link it, and advance schedule together. On failure roll back financial writes and record a sanitized failed occurrence separately under a fresh row lock, only if still nonterminal; never overwrite a concurrent posted/skipped status. Retain its due date for retry. Concurrent runners serialize on row locks; posted/skipped dates never generate again. Failures on one definition must not prevent attempting other definitions.

Pattern suggestions are P1, require user confirmation and never auto-enable schedules.

---

## 12. Dashboard Requirements

P0 dashboard includes net-worth Total Balance, period income/expenses/netSavings, account balances, income/expense chart, recent transactions, upcoming recurring, budget snapshot and goals preview. Insight cards and notification bell are P1.

### Frozen periods and aggregates

P0 currency EGP, locale en, financial timezone **Africa/Cairo** (profile fields read-only). Dashboard default is `GET /api/v2/dashboard?period=this_month`; allowed enums: **this_month, last_month, 3_months, 6_months, 1_year**. this_month is first day of current Cairo month through today; last_month is the full previous month; other enums span the current month plus previous 2/5/11 calendar months through today. Return explicit resolved from/to.

Analytics uses required explicit inclusive `from` and `to`; both valid dates from 1900-01-01 through 9999-12-31, from <= to, maximum **366 calendar days** per request. Actuals include only stored posted transactions; future range portions are allowed for forecast comparison and contain no future manual postings. Presets resolve 7/30 days inclusively ending today; 3/6/12 months start at first of month 2/5/11 months before current month. Transfer/manual transaction dates range 1900-01-01 through Cairo today.

AverageDailyExpense = actual expenses / **number of calendar days represented in the inclusive requested range**, including zero-spend/future days. Dashboard current month is already month-to-date; label it accordingly. savingsRatePercent = netSavings / income * 100; return **null when income is zero**, display “Not applicable”, never fabricated zero/infinity. Category percent uses total corresponding income/expenses as denominator, null if zero. Budget default threshold is **90%**, near_limit when spent*100 >= threshold*allocated and spent <= allocated, exceeded when spent > allocated; compare exact values before display rounding, and zero spend is normal.

Recurring commitments are the exact sum of **projected anchored occurrences within the selected range**, without weekly/yearly monthly normalization. Include only currently active schedules with active parents, respecting start/end dates; omit durable skipped dates. Posted occurrence dates use current definition amount as a forecast assumption, not an actual transaction total; deleted generated transactions are never reposted. Label forecast separately from actuals and explain that projections use the current schedule. Account balance is current all-history net worth (including archived accounts), not historical period income minus expenses.

---

## 13. Analytics Requirements

### ANALYTICS-01 — Time Ranges

Support:

- 7 days;
- 30 days;
- 3 months;
- 6 months;
- 1 year;
- custom range.

### ANALYTICS-02 — Income vs Expenses

Aggregates must come from backend/database.

### ANALYTICS-03 — Expense Category Breakdown

Charts must include accessible text equivalents.

### ANALYTICS-04 — Income Sources

### ANALYTICS-05 — Savings Trend

### ANALYTICS-06 — Account Analytics

### ANALYTICS-07 — Recurring Commitments

Show recurring income and expense totals and relationship.

---

## 14. Financial Insights — P1

Initial insights should be deterministic, for example:

- spending increased/decreased;
- savings rate;
- largest expense;
- top category;
- recurring obligations percentage;
- budget near/exceeded.

AI is not required for core V2.

---

## 15. Budget Requirements

### BUDGET-01 — Monthly Category Budget

Fields:

- category;
- amount;
- month/year;
- optional threshold.

### BUDGET-02 — Budget Progress

Show:

- allocated;
- spent;
- remaining;
- percentage used.

### BUDGET-03 — Alerts

States:

- normal;
- near limit;
- exceeded.

### BUDGET-04 — Budget History

Previous periods remain reviewable.

### BUDGET-05 — Rollover

Post-V2; no rollover in P0.

---

## 16. Goal Requirements

P0 goal progress is manually maintained `savedAmount`; `linkedAccountId` is optional owned-account metadata only and never changes progress. No progress-event table or detail page is required in P0. Saved amount may exceed target; percentComplete is not clamped, remainingAmount is `max(targetAmount - savedAmount, 0)`. At 100%+, suggest completion; only an explicit user transition sets status completed. Complete requires savedAmount >= targetAmount; reducing a completed goal below target requires an explicit transition back to active in the same update. Active/completed goals can be archived; archived goals are read-only in P0. Projection/history/detail are P1; automatic account-derived progress is post-V2.

---

## 17. Category Requirements

### CAT-01 — System Categories

Default categories remain available.

### CAT-02 — Custom Categories

Users can create their own categories.

### CAT-03 — Archive Categories

Historical usage must remain valid after archive.

---

## 18. Notification Requirements — P1

### NOTIF-01 — In-App Notifications

Examples:

- upcoming recurring activity;
- budget near limit;
- budget exceeded;
- goal milestone.

### NOTIF-02 — Read/Unread State

### NOTIF-03 — Email/Push

Post-V2 / P2; not part of P1 in-app notifications.

---

## 19. Reports and Export — P1

### REPORT-01 — Reports Page

May include:

- income;
- expenses;
- net savings;
- category breakdown;
- recurring commitments;
- account balances.

### REPORT-02 — CSV Export

### REPORT-03 — JSON Export

### REPORT-04 — Ownership

Export includes only authenticated user's data.

---

## 20. Settings Requirements

P0 settings: validated displayName profile edit, read-only EGP/en/Africa/Cairo preferences, account/archive/restore management, system/custom category management and password reset/sign-out. Data export is P1. User-identity deletion is post-V2, with no core endpoint/control/frame.

---

## 21. Navigation Requirements

Protected navigation:

- Dashboard
- Transactions
- Accounts
- Recurring
- Budgets
- Goals
- Analytics
- Reports (P1 only)
- Settings

Desktop/mobile navigation is frozen in UX §§3–5; optional P1 controls are hidden in P0.

---

## 22. Functional Requirements Summary

The system must:

- authenticate users;
- authorize every protected request;
- scope all financial data per user;
- manage accounts;
- manage transactions;
- manage transfers;
- manage recurring activity;
- calculate summaries;
- calculate analytics;
- manage budgets;
- manage goals;
- manage categories;
- manage notifications when P1 is promoted;
- export data when P1 is promoted;
- support search/filter/pagination.

---

## 23. Non-Functional Requirements

### Security

- no cross-user data leakage;
- no frontend-trusted owner IDs;
- parameterized SQL;
- TLS;
- sanitized errors;
- secrets outside source control;
- limited DB role;
- verified auth tokens.

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

### Reliability

- uncertain writes are not auto-retried;
- transfers are atomic;
- recurring generation is idempotent;
- destructive actions require confirmation.

### Performance

- transaction history must paginate;
- analytics need appropriate indexes/aggregations;
- dashboard should avoid excessive sequential requests.

### Accessibility

Target practical WCAG 2.1 AA compliance.

### Responsive Design

Primary reference widths:

- 360px;
- 768px;
- 1440px.

### Maintainability

- TypeScript;
- modular domains;
- typed API contracts;
- automated tests;
- documented migrations;
- clear docs.

---

## 24. Data Ownership Rules

Mandatory rules:

1. Every user-owned financial row is associated with the authenticated user directly or through an owned parent.
2. API clients cannot choose the effective owner.
3. Backend derives owner from verified authentication.
4. Read/update/delete operations enforce ownership.
5. Analytics and exports are user-scoped.
6. Both transfer accounts must belong to the authenticated user.
7. Recurring items, budgets, goals, categories, and notifications are user-scoped.

---

## 25. V1-to-V2 Migration Requirements

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

## 26. Error and Recovery Requirements

Preserve V1's strong recovery model:

- structured errors;
- independent loading/error states;
- stale request protection;
- scoped retries;
- no automatic retry of uncertain writes;
- retained form drafts;
- safe auth-expiry handling;
- safe offline/network handling;
- duplicate-safe recurring processing.

---

## 27. Observability Requirements

At minimum:

- backend error logging;
- sanitized request context;
- recurring-job logging;
- health endpoint;
- mutation-failure visibility;
- auth-failure monitoring without secret leakage.

---

## 28. Page-Level Acceptance Summary

- `/login` — sign in
- `/register` — create account
- `/forgot-password` — request reset
- `/reset-password` — complete reset
- `/dashboard` — overview
- `/transactions` — full transaction management
- `/accounts` — financial accounts
- `/recurring` — recurring activity
- `/analytics` — trends and breakdowns
- `/budgets` — budget tracking
- `/goals` — savings goals
- `/reports` — P1 reports/export
- `/settings` — P0 profile/categories/security; P1 export

---

## 29. V2 Release Priorities

**V2 Core Completion = P0 only.** P1 features are planned V2 enhancements after the core release and require explicit promotion to become core gates.

- P0: Supabase Auth/profile, protected app, user isolation, accounts, account-aware transactions, transfers, recurring definitions/occurrences/generation/upcoming, dashboard, analytics, monthly category budgets, manual-progress goals, custom categories, core settings, search/filter/cursor pagination, migration, financial/security/accessibility validation and production acceptance.
- P1: notifications, reports/CSV/JSON export, recurring-pattern detection, deterministic insight cards, goal projections/history/detail, and account detail page.
- Post-V2 / P2: user-identity deletion, budget rollover, account-linked automatic goal progress, email/push, PDF/Excel, advanced detection, richer debt products, bank sync, AI advice, OCR, investments, shared wallets and currency conversion.

P0 shows budget warning states within budget/dashboard views; persistent notifications are P1. /reports, account-detail routes, notification controls and export sections are absent from P0 navigation. P1 tables/endpoints/browser states below describe enhancement contracts, not core requirements.

---

## 30. V2 Completion Definition

V2 is complete only when:

- multiple users can register and sign in;
- users cannot access another user's financial records;
- account balances are accurate;
- account-aware CRUD works;
- transfers reconcile correctly;
- recurring processing is duplicate-safe;
- analytics reconcile with source transactions;
- budgets work;
- goals work;
- migration from V1 is verified;
- accessibility/responsive checks pass;
- automated tests pass;
- production deployment passes hosted acceptance checks.

---

## 31. Decisions Resolved in T02

No implementation-blocking decisions remain. Money is fixed in §23; balances/lifecycle in §8; dedicated transfer lifecycle in §10; provider/occurrence ledger in §11; periods in §12; manual goals in §16; migration in §25. Express-primary authorization and private schema are P0; RLS is a post-core hardening milestone (architecture §10). Search begins with parameterized ILIKE; additional indexes require measured evidence. User deletion and rollover are post-V2, not unresolved core decisions.

---

## 32. BMAD Next Step

P0 product and financial contracts remain frozen after T02. Approved process amendment: T03 builds the code-first design system/app shell; T04 builds P0 browser pages with fixtures. Next.js, React, TypeScript and Tailwind CSS 4 browser implementation is the visual source of truth. No Auth/API integration in T03/T04; T05+ retains production authentication/authorization and backend integration intent. This documentation task starts no implementation.

---

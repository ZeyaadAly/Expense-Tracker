# Expense Tracker V2 — Architecture

**Version:** 2.0 Planning — T02 decisions recorded
**Status:** P0 planning frozen with approved code-first design amendment; revised T03/T04 not started
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`, `02-prd.md`, `03-ux-specification.md`

**Release rule:** Core completion requires P0 only. P1 sections are optional enhancement contracts; post-V2 features do not gate core release. Decisions are frozen as of 2026-10-06; future material changes follow change control.

---

# 1. Purpose

This document defines the proposed technical architecture for Expense Tracker V2.

It focuses on:

- authentication;
- authorization;
- user data isolation;
- frontend/backend responsibilities;
- database access;
- financial account modeling;
- transfers;
- recurring transactions;
- analytics;
- budgets;
- goals;
- notifications;
- pagination;
- caching;
- V1-to-V2 migration;
- deployment;
- testing;
- security boundaries.

This document defines **how the system should be structured technically**.

Detailed table definitions belong in `05-database-design.md`.  
Detailed endpoint contracts belong in `06-api-design.md`.

---

# 2. Existing V1 Baseline

V1 is already deployed and verified.

Current V1 architecture:

```text
Browser
   ↓
Next.js Frontend
   ↓
Express API
   ↓
PostgreSQL / Supabase
```

V1 characteristics:

- Next.js frontend;
- Express + TypeScript backend;
- PostgreSQL / Supabase;
- Session Pooler;
- limited backend database role;
- exact numeric money values;
- decimal strings in API responses;
- no frontend direct database access;
- CRUD and summary endpoints;
- no authentication;
- one shared transaction collection.

V2 should preserve the strengths of V1 while introducing authenticated multi-user architecture.

---

# 3. V2 High-Level Architecture

Proposed architecture:

```text
┌───────────────────────────┐
│       Web Browser         │
│                           │
│ Next.js Client / Server   │
└──────────────┬────────────┘
               │
               │ Supabase Auth
               ▼
┌───────────────────────────┐
│      Supabase Auth        │
│                           │
│ Sessions / JWT / Users    │
└──────────────┬────────────┘
               │
               │ Access Token
               ▼
┌───────────────────────────┐
│       Express API         │
│                           │
│ Auth Middleware           │
│ Authorization             │
│ Validation                │
│ Domain Services           │
│ Repositories              │
└──────────────┬────────────┘
               │
               │ PostgreSQL
               ▼
┌───────────────────────────┐
│   Supabase PostgreSQL     │
│                           │
│ Profiles                  │
│ Accounts                  │
│ Transactions              │
│ Transfers                 │
│ Recurring                 │
│ Budgets                   │
│ Goals                     │
│ Categories                │
│ Notifications (P1)        │
└───────────────────────────┘
```

---

# 4. Architectural Principles

V2 should follow these principles.

## 4.1 Express Remains the Financial API Boundary

The browser must not access financial tables directly.

The frontend may use Supabase Auth for authentication, but all financial business logic should go through Express.

This preserves:

- consistent authorization;
- business-rule enforcement;
- centralized validation;
- centralized financial calculations;
- auditability;
- future portability.

---

## 4.2 Authentication and Authorization Are Separate

Authentication answers:

> Who is the user?

Authorization answers:

> Is this user allowed to access this resource?

Supabase Auth handles authentication.

Express must still enforce authorization for:

- accounts;
- transactions;
- transfers;
- recurring items;
- budgets;
- goals;
- categories;
- notifications;
- exports.

---

## 4.3 Backend Derives User Identity

The frontend must never send a trusted `userId` that determines ownership.

The backend should obtain the authenticated user ID from the verified token/session.

Example:

```text
Authorization: Bearer <access_token>
```

Middleware verifies the token and attaches a trusted identity:

```text
request.auth.userId
```

All domain queries use this trusted identity.

---

## 4.4 Exact Money Is Mandatory

All financial amounts must continue using exact decimal semantics.

Rules:

- PostgreSQL unrestricted `NUMERIC` with scale/range checks (database §38);
- API decimal strings;
- no JavaScript floating-point calculations for financial totals;
- aggregate calculations performed in PostgreSQL/backend;
- frontend only formats decimal strings.

---

## 4.5 Date-Only Financial Dates Stay Date-Only

Transaction dates should remain calendar values such as:

```text
2026-10-06
```

Do not convert them through JavaScript timezone logic unnecessarily.

---

# 5. Frontend Architecture

Recommended frontend architecture:

```text
frontend/
  src/
    app/
    components/
    features/
      auth/
      dashboard/
      transactions/
      accounts/
      recurring/
      analytics/
      budgets/
      goals/
      reports/
      settings/
    lib/
      api/
      auth/
      money/
      dates/
      validation/
    types/
```

The final structure can adapt to current conventions.

---

# 6. Frontend Responsibilities

Frontend should handle:

- routing;
- page composition;
- authenticated session awareness;
- form state;
- presentation validation;
- loading/error states;
- accessible dialogs;
- navigation;
- charts;
- local UI state;
- safe formatting;
- calling Express API.

Frontend must not:

- decide resource ownership;
- calculate authoritative balances;
- calculate authoritative analytics totals;
- trust local financial aggregates;
- directly mutate financial tables;
- store database secrets.

---

# 7. Authentication Architecture

### Frozen authentication boundary

Supabase Auth email/password with email confirmation enabled in production; reset redirects are allowlisted. Frontend uses one Supabase browser client with session persistence/automatic refresh, accesses its current token for each Express request, and sends Bearer authorization. Use a client protected layout/route guard with an initial loading gate: render no financial content or requests before session/bootstrap succeeds. P0 renders authenticated financial data client-side; no cookie-based Express auth or financial SSR cache is introduced. Root / redirects to dashboard or login after session resolution; only local allowlisted return paths are accepted.

Backend uses **jose remote JWKS verification**, as described by Supabase's official JWT guidance, against the configured project `/auth/v1/.well-known/jwks.json`. T05 must verify/select an asymmetric **ES256 signing key** before T09 verification tests; do not assume the current project already has one. Pin allowed algorithm ES256, exact issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`, expiration, nbf when present, nonempty UUID sub and authenticated role. Identity is verified sub, never user metadata or body/query userId. Fail closed on verification/JWKS failure; no legacy HS256 fallback/shared JWT secret. Cache remote keys through the library and test rotation/unknown kid.

Profile provisioning uses authenticated **POST /api/v2/profile/bootstrap** with empty JSON body: idempotent insert-on-conflict using verified sub, defaults EGP/en/Africa/Cairo and no auth-schema reads or admin key. Signup display name remains a draft until verified sign-in; PUT /profile writes validated displayName. Bootstrap runs after authenticated session resolution and before financial reads. GET/PUT /profile returns **409 PROFILE_REQUIRED** if missing; client re-runs bootstrap safely. This avoids an auth.users trigger failure blocking signup; profiles also backfill through the operator migration flow. Only displayName is editable in P0; currency/locale/timezone are returned read-only.

On sign-out/user change/auth invalidation, clear financial data and cursor history, abort pending reads and suppress late responses from the old session. Supabase refreshes sessions; on API 401 block operations, clear protected UI and redirect to login without retrying uncertain writes. Supabase sign-out does not instantly revoke locally verified access tokens; authorization lasts until JWT expiry. Configure access-token lifetime **15 minutes** in T05. Strong session revocation and identity deletion require separate post-V2 design.

References checked 2026-10-06: [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts), [user provisioning and trigger failure behavior](https://supabase.com/docs/guides/auth/managing-user-data).

---

# 8. User Profile Architecture

Supabase owns auth identity; private `expense_tracker.profiles.user_id` references auth.users(id). Provision via authenticated POST /api/v2/profile/bootstrap, not an auth trigger. GET/PUT /profile enforce verified sub and recover missing rows through bootstrap. P0 currency EGP, locale en and timezone Africa/Cairo are read-only; validated displayName is editable.

---

# 9. Authorization Strategy

Every protected query must be scoped to the authenticated user.

Bad:

```sql
SELECT * FROM transactions WHERE id = $1;
```

Preferred:

```sql
SELECT *
FROM transactions
WHERE id = $1
  AND user_id = $2;
```

Or ownership through account:

```sql
SELECT t.*
FROM transactions t
JOIN accounts a ON a.id = t.account_id
WHERE t.id = $1
  AND a.user_id = $2;
```

This prevents accidental cross-user access.

---

# 10. RLS Timing and Integrity Enforcement

Express token verification and ownership-scoped authorization are mandatory P0 controls. **RLS is deferred to a dedicated post-core hardening milestone**, requiring transaction-local user context/reset and pooled-connection isolation tests before activation. Runtime role remains NOBYPASSRLS; no admin credentials are used for API/cron.

Keep `expense_tracker` outside exposed Data API schemas. Revoke schema/table/function privileges from PUBLIC, anon and authenticated; browser publishable key is for Auth only. Grant the limited runtime role only required application DML/function privileges, including new objects explicitly; no DDL, role management, TRUNCATE, auth.users access or broad default grants. Any views stay private. Migrations run through the existing separate privileged workflow with project/history verification.

Store user_id directly on transactions and every user-owned root/occurrence. Use unique (id,user_id) parent keys and composite ownership FKs for transaction/account, transfer source/destination, recurring/account, goal/account, occurrence/definition and generated transaction/definition. Targeted SECURITY INVOKER triggers plus service checks enforce system-or-same-user category ownership/kind, immutable ownership, generated occurrence identity and immutable category kind once referenced. System category iff is_system=true and user_id IS NULL; custom iff is_system=false and user_id IS NOT NULL. Archived-parent checks use row locks in services/triggers. Database integrity supplements, but does not replace, read authorization.

See [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api).

---

# 11. Backend Layering

Recommended backend flow:

```text
Route
  ↓
Authentication Middleware
  ↓
Request Validation
  ↓
Service
  ↓
Repository
  ↓
PostgreSQL
```

Responsibilities:

## Routes
- HTTP concerns;
- path/query/body extraction;
- status codes;
- response envelopes.

## Auth Middleware
- token verification;
- trusted user identity.

## Validators
- schema/input validation;
- filter validation;
- pagination validation.

## Services
- business rules;
- transfers;
- recurring logic;
- ownership-aware operations;
- budget logic;
- goal logic.

## Repositories
- parameterized SQL;
- transactions;
- query composition;
- row mapping.

---

# 12. API Versioning

V2 uses `/api/v2`. V1 financial routes are blocked by maintenance before additive migration and permanently return 410 API_RETIRED after cutover. No public V1 read/write compatibility against multi-user V2 data. `/api/v1/health` may remain public and sanitized; protect/remove older deployments that could bypass retirement.

---

# 13. Financial Account Architecture

Accounts should be first-class domain entities.

Likely attributes:

- id;
- user_id;
- name;
- type;
- opening_balance;
- opening_balance_locked (permanent after first posted activity);
- currency;
- status;
- created_at;
- updated_at.

---

# 14. Account Balance Strategy

### Frozen balance and credit-card rules

Asset-like accounts (cash/bank/savings/mobile_wallet/other):

`currentBalance = openingBalance + income - expenses + incomingTransfers - outgoingTransfers`.

Credit cards use **debt-positive** balances:

`currentBalance = openingBalance + expenses - income + outgoingTransfers - incomingTransfers`.

Purchases are expense transactions and increase debt. Refunds/credits recorded as income reduce debt (and count as income under this simple tracker model). A payment is a transfer from an asset account to the card: asset money falls and card debt falls; payment never counts as expense again. Transfers from cards model cash advances and increase debt. Overpayment is allowed and produces negative debt (credit owed to the user).

**Total Balance = net worth = SUM(asset balances) - SUM(card debt balances)**, including archived accounts; archiving cannot remove money/debt from net worth. Period income/expenses/netSavings are actual income/expense transactions only. Account balances are current all-history values, independent of selected dashboard/analytics period. No credit limit, statement cycle, interest or billing automation is included.

Derived queries are authoritative; no mutable current-balance source or materialized cache in P0.

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

---

# 15. Credit Card and Account Lifecycle

### Frozen account/category lifecycle

Accounts support create/edit/archive/restore, never hard delete in P0. Opening balance and crossing between credit-card and asset semantics can be edited only while `opening_balance_locked = false`. Set that flag permanently on first transaction or transfer involving the account; deletion never unlocks it. Lock/check the account row atomically to prevent concurrent first activity and opening-balance edits. Name and asset-to-asset type edits remain allowed.

Archiving an account **automatically pauses all its active recurring definitions** in the same database transaction. Archiving a custom category does the same for its definitions. Lock affected accounts/categories and definitions consistently so archive cannot race a posting. Restore does not auto-resume schedules; user resumes explicitly after both references are active. System categories cannot be edited/archived.

Archived references remain in history and totals. Reject new transactions/transfers/recurring definitions or postings using archived references. Editing a transaction/transfer requires its resulting account/category references to be active; restore first for historical corrections. Hard deletion of owned historical transactions/transfers remains allowed even when parents are archived. Existing goal links to archived accounts remain metadata; assigning a link requires an owned active account. Category kind is immutable after any transaction, recurring definition or budget references it; category owner/system flag is always immutable.

Debt-positive cards and net-worth formula are defined in §14; statements/limits/interest remain post-V2.

---

# 16. Transfer Architecture

Dedicated `expense_tracker.transfers` is final. Fields: id/user_id/source_account_id/destination_account_id/amount/date/optional description/created_at/updated_at. Create/read/edit/hard-delete in P0; no archival. Positive amount, distinct owned active accounts for create/edit, 1900-01-01 through Cairo today, optional trimmed note up to 200 code points. Delete is allowed with archived parents and confirmation. Lock owned account rows in UUID order and use one checked-out pg client for BEGIN/COMMIT/ROLLBACK. Derived balances recompute effects; no paired income/expense rows. Atomicity is part of initial backend delivery.

---

# 17. Transaction Architecture

Transactions represent posted income/expense with direct user_id plus account_id and category_id. Keep V1 `transaction_date` and API `date` mapping. Composite account/owner FK, category ownership/type triggers and user-scoped services are mandatory. Manual create/edit dates run 1900-01-01 through Cairo today. Hard-delete with confirmation; generated transaction deletion clears occurrence link but preserves terminal posted ledger and never regenerates it. Generated recurring IDs/occurrence dates are server-owned immutable metadata, not accepted in manual bodies.

---

# 18. Category Architecture

Recommended categories:

```text
categories
```

Two sources:

- system categories;
- user-created categories.

Potential fields:

- id;
- user_id nullable for system category;
- name;
- type applicability;
- icon;
- color;
- status.

Historical transactions should retain category references even if category becomes archived.

---

# 19. Recurring Transaction Architecture

Core tables: recurring_transactions (definition), recurring_occurrences (durable per-date processing ledger), transactions (actuals). The occurrence ledger persists independently of transaction deletion. All three have verified user ownership; generated transactions reference the definition and occurrence date. Final columns/FKs are in database §§17–20.

---

# 20. Recurring Generation Strategy

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

References checked 2026-10-06: [Vercel Cron HTTP GET and UTC](https://vercel.com/docs/cron-jobs), [Hobby cadence and precision](https://vercel.com/docs/cron-jobs/usage-and-pricing), [secret, failure and duration behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

---

# 21. Recurring Idempotency

Required `recurring_occurrences` ledger with UNIQUE(recurring_transaction_id, occurrence_date), owner FK, pending/posted/skipped/failed statuses and nullable generated_transaction_id. Posted/skipped are terminal. Transaction deletion leaves posted marker and clears link via FK; processor never infers missing work from transaction absence. Generated transactions additionally have a unique partial index on definition/date. T32 persistence and T30 calculator precede processor T31.

---

# 22. Recurrence Calendar Rules

Use original startDate anchor and monthly clamping without drift; yearly Feb 29 clamps to Feb 28 in non-leap years. Weekly uses ISO weekday 1–7. End date inclusive; exhausted nextOccurrence null. Full pause/resume/edit/catch-up rules are frozen in §20. No schedule pattern changes rewrite posted history.

---

# 23. Recurring Pattern Detection Architecture — P1

Pattern detection should be deterministic initially.

Possible process:

1. group similar transactions by user;
2. compare descriptions/category/account/amount;
3. inspect date intervals;
4. calculate confidence;
5. surface suggestions.

Do not automatically create recurring definitions.

This feature can run on-demand or asynchronously.

---

# 24. Budget Architecture

Budgets should represent user/category/period limits.

Conceptual key:

```text
user + category + month
```

Budget spending should be calculated from actual transactions.

Do not maintain a manually incremented `spent` field as source of truth.

Computed:

```text
Spent =
SUM(expense transactions for category and period)
```

---

# 25. Goal Architecture

P0 goal progress is manually maintained `savedAmount`; `linkedAccountId` is optional owned-account metadata only and never changes progress. No progress-event table or detail page is required in P0. Saved amount may exceed target; percentComplete is not clamped, remainingAmount is `max(targetAmount - savedAmount, 0)`. At 100%+, suggest completion; only an explicit user transition sets status completed. Complete requires savedAmount >= targetAmount; reducing a completed goal below target requires an explicit transition back to active in the same update. Active/completed goals can be archived; archived goals are read-only in P0. Projection/history/detail are P1; automatic account-derived progress is post-V2.

---

# 26. Notification Architecture — P1

Use a persistent notifications table for in-app notifications.

Potential sources:

- budget threshold;
- recurring due date;
- goal milestone;
- system events.

Notification generation can be:

- request-driven;
- scheduled-job-driven.

Email/push delivery is deferred.

---

# 27. Analytics Architecture

Analytics should primarily be calculated in PostgreSQL.

Avoid:

```text
fetch thousands of transactions
→ calculate all analytics in browser
```

Preferred:

```text
Frontend
  ↓
Analytics API
  ↓
PostgreSQL aggregate query
```

Examples:

- monthly income/expenses;
- category totals;
- account totals;
- savings trend;
- recurring totals;
- average spending.

---

# 28. Analytics Query Strategy

Use dedicated aggregate queries.

Potential indexes:

- user/date;
- user/type/date;
- user/category/date;
- account/date.

Exact indexes will be defined in database design after query patterns are finalized.

---

# 29. Analytics API Shape

Prefer coarse endpoints rather than dozens of tiny requests.

Example:

```text
GET /api/v2/analytics/overview?from=...&to=...
```

Could return:

- totals;
- trend series;
- category breakdown;
- account breakdown;
- top metrics.

Other endpoints can be split where caching/performance warrants it.

---

# 30. Dashboard Data Strategy

GET /api/v2/dashboard?period=this_month returns resolved period, summary, accounts, incomeVsExpenses series, recentTransactions, upcomingRecurring, budgets and goals. P0 excludes insights; P1 may add them explicitly. Run a small set of efficient user-scoped SQL queries in a read-only REPEATABLE READ transaction on one pg client for a consistent snapshot. Reuse analytics/budget/goal calculations; no request waterfall. Final acceptance depends on T38, T42/T43, T45 as well as accounts/transactions/recurring.

### Frozen periods and aggregates

P0 currency EGP, locale en, financial timezone **Africa/Cairo** (profile fields read-only). Dashboard default is `GET /api/v2/dashboard?period=this_month`; allowed enums: **this_month, last_month, 3_months, 6_months, 1_year**. this_month is first day of current Cairo month through today; last_month is the full previous month; other enums span the current month plus previous 2/5/11 calendar months through today. Return explicit resolved from/to.

Analytics uses required explicit inclusive `from` and `to`; both valid dates from 1900-01-01 through 9999-12-31, from <= to, maximum **366 calendar days** per request. Actuals include only stored posted transactions; future range portions are allowed for forecast comparison and contain no future manual postings. Presets resolve 7/30 days inclusively ending today; 3/6/12 months start at first of month 2/5/11 months before current month. Transfer/manual transaction dates range 1900-01-01 through Cairo today.

AverageDailyExpense = actual expenses / **number of calendar days represented in the inclusive requested range**, including zero-spend/future days. Dashboard current month is already month-to-date; label it accordingly. savingsRatePercent = netSavings / income * 100; return **null when income is zero**, display “Not applicable”, never fabricated zero/infinity. Category percent uses total corresponding income/expenses as denominator, null if zero. Budget default threshold is **90%**, near_limit when spent*100 >= threshold*allocated and spent <= allocated, exceeded when spent > allocated; compare exact values before display rounding, and zero spend is normal.

Recurring commitments are the exact sum of **projected anchored occurrences within the selected range**, without weekly/yearly monthly normalization. Include only currently active schedules with active parents, respecting start/end dates; omit durable skipped dates. Posted occurrence dates use current definition amount as a forecast assumption, not an actual transaction total; deleted generated transactions are never reposted. Label forecast separately from actuals and explain that projections use the current schedule. Account balance is current all-history net worth (including archived accounts), not historical period income minus expenses.

---

# 31. Search Architecture

Transaction search should be server-side.

Initial strategy:

- parameterized PostgreSQL case-insensitive matching;
- search description;
- category name;
- account name.

Future:

- PostgreSQL full-text search;
- trigram indexes.

Do not add Elasticsearch-like infrastructure initially.

---

# 32. Pagination Strategy

Transactions and transfers use cursor pagination ordered by **date DESC, createdAt DESC, id DESC** (transaction storage column is `transaction_date`). P1 notifications use **createdAt DESC, id DESC**. Default limit **25**, maximum **100**; integer limits only. Backend returns `meta: {limit, nextCursor, hasMore}`; no total-page count or previousCursor.

Opaque cursor is a versioned base64url payload plus HMAC-SHA256 signature using server-only `CURSOR_SIGNING_SECRET`. Payload binds resource, verified user ID, ordering tuple, normalized filter/search scope and limit; it expires after **24 hours**. Validate encoding, signature, version, types, expiry and scope before querying. Malformed, tampered, expired, wrong-user or wrong-scope cursors return **400 VALIDATION_ERROR** with a generic cursor field message. Scope excludes the cursor itself; omitted/default filters canonicalize identically.

Frontend keeps cursor history for Next/Previous, resets it on filter/search/limit changes and after financial mutations, and starts over on invalid cursor. Every page request still applies user scoping. Paging is keyset-based, not a historical snapshot: inserts do not shift already traversed pages, but edits/deletes can change membership; refresh resets the list.

---

# 33. API Response Conventions

Preserve V1 response conventions.

Success:

```json
{
  "data": {}
}
```

List:

```json
{
  "data": [],
  "meta": {}
}
```

Error:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Safe message",
    "details": []
  }
}
```

---

# 34. Validation Architecture

Use reusable domain validators.

Domains likely need validators for:

- auth/profile;
- account;
- transaction;
- transfer;
- recurring;
- budget;
- goal;
- category;
- analytics query;
- pagination;
- reports/export.

Avoid duplicating validation across route handlers.

---

# 35. Client API Architecture

Recommended frontend API client:

```text
lib/api/
  client.ts
  auth.ts
  accounts.ts
  transactions.ts
  transfers.ts
  recurring.ts
  analytics.ts
  budgets.ts
  goals.ts
  reports.ts
```

Client should:

- attach access token;
- parse envelopes;
- handle 401 centrally;
- preserve typed errors;
- avoid automatic mutation retry.

---

# 36. Frontend Data Fetching

Use simple request hooks/utilities first.

Do not introduce a large state-management library unless necessary.

Potential approach:

- React server/client boundaries where appropriate;
- client hooks for interactive authenticated data;
- AbortController/request identity for stale-request protection.

A dedicated data library may be considered later if complexity grows.

---

# 37. Auth Session on Frontend

Use the single Supabase browser client/protected layout specified in §7. Resolve session and profile bootstrap before protected fetches/rendering. Subscribe to auth changes, clear all protected data/history and abort requests on identity change/sign-out; fail closed on 401. No financial data in SSR or shared cache.

---

# 38. Caching Strategy

Financial data should prioritize correctness.

Recommended:

- no long-lived browser cache for mutation-sensitive financial data;
- use controlled revalidation;
- P0 API responses use Cache-Control no-store; private short-lived caching is a later measured change;
- mutation success should invalidate affected reads.

Do not cache authentication-sensitive responses publicly.

---

# 39. Mutation Strategy

For create/update/delete/transfer:

- no optimistic financial mutation by default;
- wait for backend confirmation;
- refresh authoritative state;
- no automatic retry when outcome is uncertain.

This preserves V1's strong recovery model.

---

# 40. Concurrency

Potential concurrency problems:

- simultaneous edits;
- duplicate recurring processing;
- transfer double submission;
- stale account summary.

Mitigations:

- database transactions;
- unique constraints;
- idempotency keys where appropriate;
- optimistic concurrency/version fields only if needed.

---

# 41. Idempotency

Strongly recommended for:

- recurring generation;
- possibly transfers;
- possibly high-risk mutation requests.

A future header may support:

```text
Idempotency-Key
```

For normal manual CRUD, V1-style uncertain-write handling may remain sufficient.

---

# 42. Database Connection Architecture

Continue using:

- Supabase Session Pooler;
- limited backend application role;
- TLS;
- shared PostgreSQL pool.

Do not use administrative database credentials in application runtime.

---

# 43. Database Role Strategy

Backend runtime role should have only permissions needed for application operations.

Migrations use a separate privileged workflow.

Do not let runtime backend perform schema migrations.

---

# 44. Schema Ownership

Migrations should manage:

- tables;
- indexes;
- functions;
- triggers;
- constraints;
- privileges.

Application runtime should not have:

- DDL;
- role creation;
- schema ownership;
- destructive admin privileges.

---

# 45. V1-to-V2 Migration Architecture

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

---

# 46. Migration Rollback

### Frozen rollback windows

**A — Before any V2 financial user/cron writes:** keep maintenance enforced; use the rehearsed compatibility rollback or verified backup to restore the V1 schema/data and deployment. Reconcile against frozen inventory before restoring V1 access/grants. Retain legacy columns; do not automatically delete newly created Auth identities. A return to public V1 is only valid if the restored dataset is still the original shared/demo-only baseline and no multi-user financial data is exposed.

**B — After any V2 financial user/cron writes:** keep authenticated V2 controls or maintenance in place; **forward-fix is preferred**. Never deploy an unguarded V1 backend or blindly restore the pre-cutover backup. Any point-in-time/data recovery requires a current snapshot, explicit reconciliation/replay of all post-cutover writes and operator approval of recovery/data-loss consequences. Schema rollback cannot erase new users/categories/transfers/occurrences. Record the write-enable checkpoint in the runbook.

---

# 47. Default Account Migration

Preserve retained V1 data under the operator-provided verified Auth owner, create cash Main Account with opening_balance=0.00 and set opening_balance_locked=true if migrated activity exists. Map every legacy category to stable system ID; unknown values abort. Keep transaction_date and original IDs/timestamps. New users create their own first account; no automatic demo/default financial data for new users.

---

# 48. Authentication Migration

Maintenance blocks all V1 financial endpoints before schema execution; V2 backend removes them before write-enable. No read-only V1 access to V2 data. Old clients receive 503 maintenance then 410 API_RETIRED; rollback windows §46 do not authorize exposing V2 data through V1.

---

# 49. Health Architecture

Continue:

```text
GET /api/v2/health
```

It should verify:

- API running;
- database reachable.

Do not include sensitive provider details.

---

# 50. Observability

Recommended production observability:

- structured backend logs;
- request IDs;
- error codes;
- recurring job run summaries;
- health checks;
- deployment logs.

Do not log:

- passwords;
- access tokens;
- database URLs;
- sensitive financial payloads unnecessarily.

---

# 51. Rate Limiting

V2 introduces authentication endpoints and heavier analytics.

Consider rate limiting for:

- auth-sensitive backend routes;
- export endpoints;
- analytics;
- search;
- recurring suggestion generation.

Provider-level and application-level options should be evaluated.

---

# 52. Security Headers

Continue production HTTPS/HSTS.

Evaluate:

- Content-Security-Policy;
- Referrer-Policy;
- frame protections;
- secure cookies/session behavior;
- CORS restrictions.

---

# 53. CORS

Production CORS should allow only trusted frontend origins.

Avoid wildcard CORS for authenticated financial APIs.

Credentials/token behavior should be tested in production.

---

# 54. CSRF Consideration

If API authentication uses Bearer tokens in Authorization headers, classic cookie CSRF risk is reduced.

If cookie-based auth is introduced, CSRF defenses become mandatory.

P0 transport is Bearer token only (see §7); cookie API auth would require a new approved decision.

---

# 55. Reporting / Export Architecture — P1

Reports should query backend.

Export flow:

```text
Frontend
  ↓
Express
  ↓
User-scoped query
  ↓
CSV/JSON response
```

Exports should be generated server-side.

Large exports may later become background jobs.

---

# 56. File Storage

Core V2 does not require file uploads.

If receipts/avatars are later added, use object storage with explicit ownership policies.

Do not add storage infrastructure yet.

---

# 57. Notification Processing — P1

Budget notifications may be generated:

- when transaction mutations cross thresholds;
- during scheduled scans.

Recurring upcoming notifications may be scheduled.

Keep notification generation idempotent.

---

# 58. Testing Architecture

V2 needs multiple levels.

## Unit Tests

- validators;
- recurrence calculations;
- money helpers;
- pagination cursors;
- insight calculations when P1 is promoted.

## Integration Tests

- repositories;
- auth middleware;
- user ownership;
- transfers;
- recurring generation;
- analytics.

## Browser Tests

- auth flows;
- dashboard;
- transaction CRUD;
- account CRUD;
- transfer;
- recurring;
- budgets;
- goals;
- analytics;
- accessibility.

---

# 59. Multi-User Security Tests

Mandatory scenarios:

1. User A creates account/transaction.
2. User B attempts direct read by ID.
3. User B attempts update.
4. User B attempts delete.
5. User B attempts analytics access.
6. User B attempts export if P1 is promoted; P0 verifies that unimplemented P1 routes expose no data.

All must fail safely.

---

# 60. Transfer Tests

Mandatory:

- valid transfer;
- source/destination same account rejected;
- cross-user destination rejected;
- exact money preserved;
- transaction rollback on failure;
- account balances reconcile.

---

# 61. Recurring Tests

Mandatory:

- daily;
- weekly;
- monthly;
- yearly;
- month-end edge cases;
- leap year;
- paused schedules;
- end date;
- duplicate scheduler execution;
- missed occurrence handling.

---

# 62. Analytics Tests

Verify analytics against known datasets.

Examples:

- category totals;
- monthly totals;
- zero data;
- negative net savings;
- transfers excluded;
- recurring projections separated from actuals.

---

# 63. Deployment Architecture

Recommended production layout:

```text
Vercel Project 1
Next.js Frontend

Vercel Project 2
Express Backend

Supabase
Auth + PostgreSQL
```

This builds on the proven V1 deployment architecture.

---

# 64. Environment Variables

P0 frontend public configuration: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_API_BASE_URL. Backend private configuration: DATABASE_URL (limited role Session Pooler), DATABASE_SSL_CA_FILE, CLIENT_ORIGIN, SUPABASE_URL (issuer/JWKS configuration), CRON_SECRET, CURSOR_SIGNING_SECRET. Pin issuer/audience/ES256 in backend config. No service-role key/shared JWT secret is required. Cron and cursor secrets are server-only; rotate under a documented runbook. Preserve TLS CA bundling and max-five pool per process.

---

# 65. Supabase Keys

Frontend uses a publishable key for Auth only; do not grant financial Data API privileges. No service-role/admin key in frontend, backend API or cron. JWKS public keys verify asymmetric ES256 tokens; only privileged migration/operator workflows manage schema/Auth owner configuration.

---

# 66. Scheduled Job Deployment

Vercel backend project owns one daily UTC cron at 0 3 * * * targeting GET /internal/recurring/process. Configure function deadline and safe per-run budget in T33; benchmark bounded batches against actual plan limits. Keep cron disabled until migration and authenticated production acceptance pass. No always-running worker or Supabase scheduler in core.

---

# 67. Internal Job Security

Require exact server CRON_SECRET Bearer credential, fail closed if absent, constant-time comparison, Cache-Control no-store, no sensitive job payload/logs. User JWTs and browser access cannot execute the job. Idempotent row-lock/ledger design handles duplicated operator/provider invocation.

---

# 68. Domain Service Boundaries

Suggested services:

```text
AuthService
ProfileService
AccountService
TransactionService
TransferService
RecurringService
AnalyticsService
BudgetService
GoalService
CategoryService
NotificationService
ReportService
DashboardService
```

Avoid creating needless abstraction layers beyond what each domain needs.

---

# 69. Database Transactions

Use PostgreSQL transactions for operations involving multiple writes.

Mandatory operations (all on one checked-out pg client):

- transfer creation;
- transfer update/delete;
- recurring occurrence creation + next-date update;
- account/category archive and recurring auto-pause workflows where multiple records change.

Use one consistent lock hierarchy: account rows by UUID, category rows by UUID, recurring definitions by UUID, then occurrence rows by date/id. Initial pending claims lock only definitions/occurrences and commit before posting acquires parent locks. Re-read/revalidate state after locks; never acquire a parent lock while holding a later-level lock. Lock-order/concurrent archive/posting tests are mandatory.

---

# 70. Deletion and Archive Strategy

Transactions/transfers/budgets hard-delete with explicit confirmation (budget deletion removes plan, never transactions). Accounts/custom categories/recurring definitions/goals archive only in P0. System categories immutable. Occurrence markers never delete through public API; posted marker survives generated transaction deletion. Archive auto-pauses affected schedules as §15. Exact FK deletion matrix in database §44; no destructive cascades from normal parents.

---

# 71. User Identity Deletion — Post-V2

No user-identity deletion endpoint/control/task/frame in P0 or P1. A later design must handle recent authentication, revocation/remaining JWT validity, retention/export, application cleanup, auth identity last, and audited recovery. P0 auth-owner FKs use RESTRICT so deleting a retained Auth identity cannot silently cascade financial data. Deferring this feature leaves no implementation-blocking P0 policy.

---

# 72. Session Expiry Behavior

If API returns 401:

Frontend should:

- clear/refresh invalid auth state;
- stop protected writes;
- redirect to login;
- avoid showing stale protected financial data indefinitely.

---

# 73. Error Taxonomy

Likely V2 error categories:

- `AUTH_REQUIRED`
- `AUTH_INVALID`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `FORBIDDEN` or safe not-found policy
- `DATABASE_UNAVAILABLE`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

Final codes belong in API design.

---

# 74. Cross-User Resource Response Policy

Security-sensitive decision:

When User B requests User A's resource ID, returning `404` is often preferable to exposing resource existence via `403`.

Recommendation:

Use ownership-scoped lookup and return `404` when the resource is not visible to the authenticated user.

Reserve `403` for actions where existence is already known and policy requires it.

---

# 75. Performance Targets

Initial practical targets:

- dashboard data in a small number of requests;
- transaction pagination;
- indexed ownership/date filters;
- analytics queries under acceptable production latency for normal personal datasets;
- avoid N+1 queries.

Do not optimize prematurely with distributed caches.

---

# 76. Scaling Assumptions

Core V2 is a personal finance application, not a high-frequency banking ledger.

Assume:

- modest users;
- thousands to tens of thousands of transactions per user;
- recurring jobs once daily with bounded catch-up;
- analytics over personal datasets.

Architecture should scale cleanly but remain simple.

---

# 77. Frozen Architecture Decision Summary

| Topic | Final rule |
|---|---|
| Release | P0-only core; P1 optional |
| Stack | Next.js + Express + private Supabase PostgreSQL; separate Vercel projects |
| Auth | Supabase browser session; Bearer; jose/ES256 project JWKS; verified sub |
| Profile | Idempotent authenticated backend bootstrap; no auth trigger |
| Authorization | Express ownership scoping; composite FKs/targeted integrity triggers |
| RLS | Dedicated post-core hardening; private schema/no browser grants in P0 |
| Money | Unrestricted NUMERIC, scale<=2, explicit bounds; reject input rounding |
| Balance | Derived asset balances; debt-positive cards; archived-inclusive net worth |
| Transfers | Dedicated table; atomic create/edit/hard-delete |
| Recurring | Definition + durable occurrence ledger + posted transaction |
| Scheduler | Daily Vercel Cron GET at 03:00 UTC; Cairo dates; bounded catch-up |
| Goals | Manual progress; linked-account metadata; explicit completion |
| Pagination | Signed user/filter-bound cursors; frontend history |
| Period | dashboard this_month enum; inclusive analytics dates |
| Migration | Maintenance; preserve inventory; operator owner; retire V1 before writes |
| Rollback | Before writes rehearsed restore; after writes authenticated forward-fix |
| Writes | No automatic uncertain-write retries |

No implementation-blocking architecture decisions remain. Details are normative in the sections above and database/API contracts.

---

# 78. Architecture Risks

## Risk 1 — Migration from Public V1 to Authenticated V2

Mitigation:

- additive migration;
- disposable rehearsal;
- staged deployment;
- rollback plan.

## Risk 2 — Cross-User Data Leakage

Mitigation:

- trusted auth middleware;
- ownership-scoped repository queries;
- multi-user penetration tests;
- possible later RLS.

## Risk 3 — Recurring Duplicate Creation

Mitigation:

- unique occurrence constraint;
- transactional processor;
- idempotent job design.

## Risk 4 — Transfer Accounting Bugs

Mitigation:

- dedicated transfer model;
- database transactions;
- reconciliation tests.

## Risk 5 — Analytics Performance

Mitigation:

- indexes;
- aggregate queries;
- pagination;
- avoid browser aggregation.

## Risk 6 — Serverless Job Reliability

Mitigation:

- idempotent job;
- persistent schedule state;
- observable runs;
- safe retry.

---

# 79. Architecture Acceptance Criteria

Architecture is ready for implementation planning when:

- auth flow is agreed;
- ownership enforcement is agreed;
- account balance model is agreed;
- transfer model is agreed;
- recurring generation strategy is agreed;
- pagination model is agreed;
- analytics strategy is agreed;
- migration strategy is agreed;
- deployment strategy is agreed;
- remaining schema details can be defined without architectural ambiguity.

---

# 80. BMAD Next Step

T02 technical contracts remain frozen. The approved code-first amendment makes T03 the frontend design system/app shell and T04 the P0 browser prototype, using Next.js/React/TypeScript/Tailwind CSS 4 and fixtures only. Browser implementation is the visual source of truth; UI approval precedes T05+ authentication/API integration. Simulated prototype sessions are presentation state, never production authorization. This amendment changes documentation only.

---

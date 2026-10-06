# Expense Tracker V2 — Architecture

**Version:** 2.0 Planning  
**Status:** Draft for BMAD Architecture  
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`, `02-prd.md`, `03-ux-specification.md`

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
│ Notifications             │
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

- PostgreSQL `numeric`;
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

## 7.1 Preferred Authentication Provider

Use Supabase Auth.

Reasons:

- already using Supabase;
- supports email/password;
- supports password reset;
- supports session persistence;
- supports JWT access tokens;
- avoids building password storage/security manually.

---

## 7.2 Auth Flow

### Sign In

```text
Browser
  ↓
Supabase Auth sign-in
  ↓
Access token/session
  ↓
Browser calls Express with Bearer token
  ↓
Express verifies token
  ↓
Trusted user identity attached to request
```

---

## 7.3 Token Verification Strategy

Preferred architecture:

- Express verifies Supabase JWTs using provider-supported verification;
- use JWKS/public key verification if supported by the configured Supabase project;
- avoid calling Supabase Auth for every API request if local verification is safe and supported;
- verify issuer, audience, expiration, and signature;
- reject invalid/expired tokens.

Implementation details should be finalized during backend task design.

---

## 7.4 Auth Middleware

Proposed middleware responsibility:

```text
authenticateRequest
```

It should:

1. read Bearer token;
2. verify token;
3. extract authenticated Supabase user ID;
4. attach trusted auth context;
5. reject unauthenticated requests with 401.

Example trusted context:

```ts
type AuthContext = {
  userId: string;
  email?: string;
};
```

---

## 7.5 Protected API Policy

All V2 financial endpoints should require authentication.

Potential exceptions:

- `/api/v2/health`
- public metadata if ever needed.

---

# 8. User Profile Architecture

Supabase Auth owns authentication identities.

Application-specific profile data should live in:

```text
profiles
```

Likely relation:

```text
auth.users.id
   ↓
profiles.user_id
```

Profile can store:

- display name;
- locale;
- timezone;
- preferred currency;
- created/updated timestamps.

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

# 10. RLS Strategy

Recommended: use **Express authorization as primary enforcement** and consider **PostgreSQL Row Level Security as defense-in-depth**.

However, because the backend currently uses a shared database role, RLS requires careful session/user-context design.

Two options:

## Option A — Express-Only Authorization

Pros:

- simpler;
- easier with pooled connections;
- straightforward repository queries.

Cons:

- database trusts application queries;
- authorization bugs could expose data.

## Option B — Express + RLS Defense-in-Depth

Pros:

- additional data isolation;
- database-level protection.

Cons:

- more complex with pooled connections;
- requires trusted session context or JWT integration;
- easy to misconfigure.

### Recommendation

Start V2 architecture with:

**Express authorization as mandatory primary control.**

Evaluate RLS as a separate hardening milestone after the data model and auth integration are stable.

Do not assume RLS automatically solves authorization.

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

Recommended V2 route prefix:

```text
/api/v2
```

Keep V1 temporarily available during migration if necessary:

```text
/api/v1
```

Do not remove V1 until:

- V2 frontend is deployed;
- migration is complete;
- rollback window is closed.

---

# 13. Financial Account Architecture

Accounts should be first-class domain entities.

Likely attributes:

- id;
- user_id;
- name;
- type;
- opening_balance;
- currency;
- status;
- created_at;
- updated_at.

---

# 14. Account Balance Strategy

This is a critical architecture decision.

Recommended approach:

**Do not store mutable current balance as the primary source of truth.**

Store:

- opening balance;
- transactions;
- transfers.

Then calculate current balance from financial activity.

Example:

```text
Current Balance =
Opening Balance
+ Income
- Expenses
+ Incoming Transfers
- Outgoing Transfers
```

Benefits:

- auditable;
- fewer synchronization bugs;
- historical reconstruction;
- easier correction.

For performance, a materialized/cache strategy may be added later if necessary.

---

# 15. Credit Card Consideration

Credit cards behave differently from cash/assets.

Core V2 can initially model them as an account type with a signed balance convention, but this must be documented carefully.

If debt-specific behavior becomes complex, credit cards can be expanded later.

Do not let credit-card complexity block the initial account architecture.

---

# 16. Transfer Architecture

Recommended model:

Use a dedicated `transfers` table rather than pretending transfers are ordinary income/expense transactions.

Proposed conceptual structure:

```text
transfers
- id
- user_id
- source_account_id
- destination_account_id
- amount
- date
- description
- created_at
- updated_at
```

Benefits:

- transfer semantics are explicit;
- avoids double counting in analytics;
- easier account balance calculation;
- easier transfer editing/deletion.

Transfer creation must occur inside a PostgreSQL transaction.

---

# 17. Transaction Architecture

Transactions represent real income or expense.

Likely ownership:

```text
transaction
  ↓
account
  ↓
user
```

Transactions may still store `user_id` directly for simpler indexing and authorization, even if ownership is derivable through account.

That decision should be finalized in database design.

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

Recurring activity should be modeled separately from posted transactions.

Concept:

```text
recurring_transactions
```

Stores schedule definition.

Generated real transactions are written into:

```text
transactions
```

Each generated transaction should reference its recurring definition and occurrence date.

---

# 20. Recurring Generation Strategy

Vercel/Serverless architecture means recurring work cannot depend on an always-running process.

Recommended strategy:

```text
Scheduled job / Cron
   ↓
POST internal recurring processor
   ↓
Find due recurring definitions
   ↓
Create missing occurrences transactionally
   ↓
Advance next occurrence
```

Possible scheduler:

- Vercel Cron;
- Supabase scheduled function/cron;
- another trusted scheduler.

### Recommendation

Prefer a provider-supported scheduled job that calls a protected internal backend route or job handler.

---

# 21. Recurring Idempotency

Recurring generation must be duplicate-safe.

Recommended technique:

Unique occurrence key such as:

```text
(recurring_transaction_id, occurrence_date)
```

Generated transactions should include:

- recurring_definition_id;
- occurrence_date.

A unique constraint prevents duplicate posting.

---

# 22. Monthly Recurrence Rules

Monthly schedules need clear rules.

Example issue:

A recurring item starts on January 31.

What happens in February?

Recommendation:

Define explicit behavior such as:

- use the last valid day of shorter months.

Example:

```text
Jan 31
Feb 28/29
Mar 31
Apr 30
```

This rule must be captured in database/domain design and tests.

---

# 23. Recurring Pattern Detection Architecture

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

Goals are planning entities.

They should not distort transaction accounting.

Two possible models:

## Manual Progress

User directly updates saved amount.

## Linked Account Progress

Progress derives from selected account balance.

### Recommendation

Start with manual saved amount plus optional linked account metadata.

Avoid automatically interpreting every account deposit as goal progress until rules are clearer.

---

# 26. Notification Architecture

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

Avoid excessive waterfall requests.

Potential design:

```text
GET /api/v2/dashboard
```

Returns:

- summary;
- account balances;
- recent transactions;
- upcoming recurring;
- budget highlights;
- goal highlights;
- insights.

Benefits:

- fewer requests;
- consistent snapshot;
- simpler loading state.

Detailed pages continue using dedicated endpoints.

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

Recommended:

**Cursor pagination** for transaction history.

Reason:

- stable under inserts;
- better for large histories;
- works well with deterministic sort keys.

Potential ordering:

```text
date DESC,
created_at DESC,
id DESC
```

Cursor contains the ordering tuple.

Offset pagination remains acceptable for simpler admin/report-like pages.

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

Frontend should maintain access to Supabase auth session.

Requirements:

- protected pages redirect if unauthenticated;
- API client obtains current access token;
- expired token handled safely;
- auth state changes clear protected cached data.

---

# 38. Caching Strategy

Financial data should prioritize correctness.

Recommended:

- no long-lived browser cache for mutation-sensitive financial data;
- use controlled revalidation;
- summary/dashboard may use short-lived caching if explicitly invalidated;
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

Migration is high risk and should be staged.

Recommended sequence:

## Phase 1 — Additive Schema

Add:

- profiles;
- accounts;
- ownership columns;
- V2 tables.

Do not break V1 immediately.

## Phase 2 — Create Initial User

Create/authenticate the intended owner for existing V1 production data.

## Phase 3 — Backfill Ownership

Assign existing V1 transactions to:

- one user;
- one default account.

Example default account:

```text
Main Account
```

## Phase 4 — Deploy V2 Backend Compatibility

Backend supports new ownership-aware schema.

## Phase 5 — Deploy V2 Frontend

Authentication required.

## Phase 6 — Retire V1 Behavior

Disable ownerless writes and old unauthenticated API routes.

---

# 46. Migration Rollback

Before migration:

- create database backup;
- test migration on disposable copy;
- verify row counts/totals;
- document rollback commands.

Migration must not silently change historical amounts/dates/categories.

---

# 47. Default Account Migration

Existing V1 transactions need an account.

Recommended:

Create one default account for the migrated owner:

```text
Main Account
```

Opening balance should be chosen carefully to avoid double counting.

Preferred migration:

- opening balance = 0;
- existing transactions recreate current historical balance.

---

# 48. Authentication Migration

Current V1 is public.

V2 deployment must avoid a long window where:

- V2 schema requires user IDs;
- V1 frontend still sends unauthenticated writes.

Deployment order must ensure compatibility.

Potential temporary backend:

- V1 endpoints remain read-only briefly;
- or maintenance window;
- or coordinated frontend/backend release.

Final implementation plan should choose one.

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

The final auth transport must be documented before implementation.

---

# 55. Reporting / Export Architecture

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

# 57. Notification Processing

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
- insight calculations.

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
6. User B attempts export.

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

Frontend likely needs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL`

Backend likely needs:

- `DATABASE_URL`
- `DATABASE_SSL_CA_FILE`
- `CLIENT_ORIGIN`
- Supabase auth verification configuration as required.

Do not expose service-role/admin keys to frontend.

---

# 65. Supabase Keys

Frontend may use the public/anon key for authentication client operations.

Backend should not use a service-role key unless a specific trusted admin operation requires it.

Prefer JWT verification without broad Supabase administrative privileges.

---

# 66. Scheduled Job Deployment

If Vercel Cron is used:

```text
Vercel Cron
  ↓
Protected internal job route
  ↓
Recurring service
  ↓
PostgreSQL transaction
```

Internal route should require a scheduler secret or provider-authenticated mechanism.

Do not leave scheduler endpoints publicly executable.

---

# 67. Internal Job Security

A job route should verify a separate internal credential.

Example:

```text
Authorization: Bearer <cron-secret>
```

The exact mechanism depends on provider capabilities.

This secret must not be exposed to browser code.

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

Mandatory candidates:

- transfer creation;
- transfer update/delete;
- recurring occurrence creation + next-date update;
- account deletion/archive workflows where multiple records change.

---

# 70. Soft Delete / Archive Strategy

Recommended archive behavior for:

- accounts;
- categories;
- recurring definitions;
- goals where history matters.

Transactions should generally use actual deletion only if V2 product policy keeps V1 semantics.

A future audit-history feature may change this.

---

# 71. Account Deletion

User account deletion is dangerous.

Recommended architecture:

1. explicit confirmation;
2. recent authentication check if provider supports it;
3. delete/export warning;
4. cleanup application data;
5. delete auth identity last.

Exact retention rules should be defined before implementation.

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
- recurring jobs daily/hourly depending on design;
- analytics over personal datasets.

Architecture should scale cleanly but remain simple.

---

# 77. Architecture Decision Summary

Current recommended decisions:

| Topic | Decision |
|---|---|
| Authentication | Supabase Auth |
| Financial API | Express remains authoritative |
| User identity | Verified token-derived user ID |
| Authorization | Express ownership checks |
| RLS | Evaluate as defense-in-depth later |
| Accounts | First-class entities |
| Balance | Derived from opening balance + activity |
| Transfers | Dedicated transfer model |
| Recurring | Definition + generated transaction records |
| Scheduling | Provider-supported cron/job |
| Recurring duplicates | Unique occurrence constraint |
| Analytics | PostgreSQL/backend aggregates |
| Dashboard | Aggregated dashboard endpoint |
| Search | PostgreSQL server-side |
| Pagination | Cursor-based for transactions |
| Money | PostgreSQL numeric + decimal strings |
| Dates | Date-only semantics |
| API | `/api/v2` |
| Deployment | Separate Vercel frontend/backend + Supabase |
| Writes | No automatic uncertain-write retry |

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

Next artifact:

**`05-database-design.md`**

It should define:

- all V2 tables;
- columns and types;
- primary/foreign keys;
- relationships;
- user ownership;
- indexes;
- unique constraints;
- recurring occurrence constraints;
- transfer structure;
- budgets/goals/categories/notifications;
- V1 migration SQL strategy;
- privileges;
- possible RLS preparation;
- exact money types;
- date/time rules.

No V2 application implementation should begin yet.

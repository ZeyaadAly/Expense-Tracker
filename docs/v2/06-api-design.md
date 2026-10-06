# Expense Tracker V2 — API Design

**Version:** 2.0 Planning — T02 decisions recorded
**Status:** P0 planning frozen with approved code-first design amendment; revised T03/T04 not started
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`, `02-prd.md`, `03-ux-specification.md`, `04-architecture.md`, `05-database-design.md`

**Release rule:** Core completion requires P0 only. P1 sections are optional enhancement contracts; post-V2 features do not gate core release. Decisions are frozen as of 2026-10-06; future material changes follow change control.

---

# 1. Purpose

This document defines the proposed authenticated HTTP API for Expense Tracker V2.

It specifies:

- API versioning;
- authentication rules;
- success/error envelopes;
- authorization behavior;
- profile endpoints;
- dashboard endpoints;
- account endpoints;
- transaction endpoints;
- transfer endpoints;
- recurring endpoints;
- analytics endpoints;
- budget endpoints;
- goal endpoints;
- category endpoints;
- notification endpoints;
- reports/export;
- pagination;
- filtering;
- search;
- exact money/date serialization;
- error codes;
- rate-limit considerations.

This is a design contract. Implementation may refine details, but V2 development should not invent incompatible behavior outside this contract without updating the document.

---

# 2. Base URL

V2 prefix `/api/v2` on the existing separate Express backend. Internal job is root GET /internal/recurring/process. V1 financial routes receive 503 MAINTENANCE during cutover, then 410 API_RETIRED with no data; public sanitized V1 health may remain. No old unauthenticated V1 financial compatibility against V2 data. P1 endpoints below remain unimplemented/absent in core unless explicitly promoted.

---

# 3. Authentication

All financial/user-specific V2 endpoints require authentication unless explicitly marked public.

Client sends:

```http
Authorization: Bearer <access_token>
```

The backend:

1. validates token;
2. derives trusted `userId`;
3. ignores any client-supplied owner ID;
4. scopes all financial operations to that user.

Public endpoint:

T10 transport reads the current token through T06 `getAccessToken()` for every protected request. Missing tokens fail locally with typed `AUTH_REQUIRED` (status 0), without fetching. Backend 401 failures remain typed auth errors; session/navigation decisions belong to the T08 layer, with no low-level redirect/signout. `503 AUTH_UNAVAILABLE` is a temporary server availability error. Requests never retry automatically. Cancellation is distinct and an interrupted dispatched mutation may have an uncertain outcome. A 204 returns undefined; other successes require the JSON data envelope, retaining optional meta and exact money strings.

`NEXT_PUBLIC_API_BASE_URL` retains its V1 `/api/v1` prefix in shared deployments. The isolated V2 client accepts a backend origin, `/api/v1`, or `/api/v2` and constructs `/api/v2`; other base paths fail configuration validation. V1 URL handling remains unchanged.

```text
GET /api/v2/health
```

---

# 4. Authorization Behavior

The backend must not expose cross-user resource existence.

Preferred behavior:

If User B requests a valid ID that belongs to User A:

```text
404 NOT_FOUND
```

rather than revealing ownership via 403.

401 is reserved for missing/invalid authentication.

403 may be used only where the resource is already known and a policy explicitly requires it.

---

# 5. Success Envelopes

Single-resource success:

```json
{
  "data": {}
}
```

List success:

```json
{
  "data": [],
  "meta": {}
}
```

Mutation success may return:

```json
{
  "data": {}
}
```

DELETE may return:

```text
204 No Content
```

when no response body is required.

---

# 6. Error Envelope

All API errors should use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the highlighted fields.",
    "details": []
  }
}
```

`details` may contain field errors:

```json
{
  "field": "amount",
  "message": "Amount must be greater than zero."
}
```

Production errors must never expose:

- stack traces;
- SQL;
- database credentials;
- auth secrets;
- provider internals.

---

# 7. Common Error Codes

Recommended V2 codes:

- `AUTH_REQUIRED`
- `AUTH_INVALID`
- `AUTH_UNAVAILABLE` — 503 when signing-key retrieval/configuration is unavailable; sanitized retry-later message, never successful authentication.
- `PROFILE_REQUIRED`
- `MAINTENANCE`
- `API_RETIRED`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `METHOD_NOT_ALLOWED`
- `UNSUPPORTED_MEDIA_TYPE`
- `PAYLOAD_TOO_LARGE`
- `DATABASE_UNAVAILABLE`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

Domain-specific examples:

- `ACCOUNT_ARCHIVED`
- `ACCOUNT_CONFLICT`
- `TRANSFER_SAME_ACCOUNT`
- `RECURRING_DUPLICATE`
- `CATEGORY_ARCHIVED`
- `BUDGET_CONFLICT`
- `GOAL_INVALID_STATE`

Final implementation should keep the set compact.

---

# 8. Media Type and Body Rules

For JSON mutation endpoints:

```http
Content-Type: application/json
```

Bodies must reject:

- malformed JSON;
- unexpected properties where strict validation applies;
- wrong scalar types;
- oversized bodies.

P0 JSON body limit is 16kb, preserving V1. Reject unknown mutation/query properties, repeated scalar queries, malformed/oversized input. Bootstrap accepts exactly `{}`.

---

# 9. Money Serialization and Validation

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

# 10. Date Serialization

Calendar financial dates:

```text
YYYY-MM-DD
```

Examples:

```json
{
  "date": "2026-10-06"
}
```

Timestamps:

```text
ISO 8601 UTC
```

Example:

```json
{
  "createdAt": "2026-10-06T07:45:12.234Z"
}
```

---

# 11. Pagination

Transactions and transfers use cursor pagination ordered by **date DESC, createdAt DESC, id DESC** (transaction storage column is `transaction_date`). P1 notifications use **createdAt DESC, id DESC**. Default limit **25**, maximum **100**; integer limits only. Backend returns `meta: {limit, nextCursor, hasMore}`; no total-page count or previousCursor.

Opaque cursor is a versioned base64url payload plus HMAC-SHA256 signature using server-only `CURSOR_SIGNING_SECRET`. Payload binds resource, verified user ID, ordering tuple, normalized filter/search scope and limit; it expires after **24 hours**. Validate encoding, signature, version, types, expiry and scope before querying. Malformed, tampered, expired, wrong-user or wrong-scope cursors return **400 VALIDATION_ERROR** with a generic cursor field message. Scope excludes the cursor itself; omitted/default filters canonicalize identically.

Frontend keeps cursor history for Next/Previous, resets it on filter/search/limit changes and after financial mutations, and starts over on invalid cursor. Every page request still applies user scoping. Paging is keyset-based, not a historical snapshot: inserts do not shift already traversed pages, but edits/deletes can change membership; refresh resets the list.

Example GET /api/v2/transactions?limit=25&cursor=<opaque-cursor>; lists return `{data: [...], meta: {limit: 25, nextCursor: null, hasMore: false}}`. Transfer and P1 notification lists use the same meta envelope.

---

# 12. List Limits

Final default 25, maximum 100 for cursor lists; integer 1–100, invalid/repeated limits return 400 VALIDATION_ERROR. Accounts/categories/recurring/budgets/goals list small planning collections with meta.count; recurring upcoming returns date-ordered occurrences, days integer 1–366 default 30. Financial aggregate ranges are bounded by §78.

---

# 13. Search

Transaction search parameter:

```text
q
```

Example:

```text
GET /api/v2/transactions?q=netflix
```

Search inspects:

- description;
- category name;
- account name.

Search must be:

- parameterized;
- user-scoped;
- compatible with filters/pagination.

---

# 14. Filter Conventions

Use lowercase query values.

Example:

```text
type=expense
```

Avoid:

```text
type=Expense
```

Omit query parameters for “All”.

Do not send:

```text
type=all
```

unless API design later explicitly supports it.

---

# 15. Health Endpoint

## GET `/health`

Public.

Response:

```json
{
  "data": {
    "api": "running",
    "database": "reachable"
  }
}
```

On DB failure:

```http
503 Service Unavailable
```

Safe body:

```json
{
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "The database is temporarily unavailable.",
    "details": []
  }
}
```

Use:

```http
Cache-Control: no-store
```

---

# 16. Profile Endpoints

### POST /profile/bootstrap

Authenticated, body `{}`; idempotently creates current verified sub profile with EGP/en/Africa/Cairo defaults. Returns 200 `{data: profile}` whether created or already present; never accepts owner ID. Frontend invokes after session resolution and retries safely on definite failure.

### GET /profile

Returns `{data: {userId, displayName, preferredCurrency: "EGP", locale: "en", timezone: "Africa/Cairo", createdAt, updatedAt}}`. Missing profile → 409 PROFILE_REQUIRED; bootstrap recovers it. Profile userId is an output only, never a trusted input.

### PUT /profile

Body exactly `{displayName: "Zeyad"}`; nullable or trimmed 1–100 Unicode code points. Currency/locale/timezone are read-only P0. Return 200 profile; missing profile → 409 PROFILE_REQUIRED. No GET side-effect provisioning or auth.users read required.

T13 bootstrap always starts displayName=null; Auth metadata is not imported. A validated registration draft, stored locally for its exact signup user UUID, may be applied through PUT after verified sign-in/bootstrap if the existing name is null. All profile routes reject query parameters; bootstrap requires exactly `{}`. PUT rejects unknown fields, including userId/email/preferences/timestamps, empty names, control characters and invalid Unicode. Unchanged PUT names, repeated bootstrap and GET preserve timestamps; actual changes use the existing T11 timestamp trigger and serialize UTC. A missing Auth FK during bootstrap is a sanitized 500 INTERNAL_ERROR; no Auth-table reads or admin credentials are needed. Frontend bootstrap failure keeps protected children unmounted with explicit Retry; 401 clears the session gate and redirects to login. Settings editing remains T49.

### Frozen authentication boundary

Supabase Auth email/password with email confirmation enabled in production; reset redirects are allowlisted. Frontend uses one Supabase browser client with session persistence/automatic refresh, accesses its current token for each Express request, and sends Bearer authorization. Use a client protected layout/route guard with an initial loading gate: render no financial content or requests before session/bootstrap succeeds. P0 renders authenticated financial data client-side; no cookie-based Express auth or financial SSR cache is introduced. Root / redirects to dashboard or login after session resolution; only local allowlisted return paths are accepted.

Backend uses **jose remote JWKS verification**, as described by Supabase's official JWT guidance, against the configured project `/auth/v1/.well-known/jwks.json`. T05 must verify/select an asymmetric **ES256 signing key** before T09 verification tests; do not assume the current project already has one. Pin allowed algorithm ES256, exact issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`, expiration, nbf when present, nonempty UUID sub and authenticated role. Identity is verified sub, never user metadata or body/query userId. Fail closed on verification/JWKS failure; no legacy HS256 fallback/shared JWT secret. Cache remote keys through the library and test rotation/unknown kid.

Profile provisioning uses authenticated **POST /api/v2/profile/bootstrap** with empty JSON body: idempotent insert-on-conflict using verified sub, defaults EGP/en/Africa/Cairo and no auth-schema reads or admin key. Signup display name remains a draft until verified sign-in; PUT /profile writes validated displayName. Bootstrap runs after authenticated session resolution and before financial reads. GET/PUT /profile returns **409 PROFILE_REQUIRED** if missing; client re-runs bootstrap safely. This avoids an auth.users trigger failure blocking signup; profiles also backfill through the operator migration flow. Only displayName is editable in P0; currency/locale/timezone are returned read-only.

On sign-out/user change/auth invalidation, clear financial data and cursor history, abort pending reads and suppress late responses from the old session. Supabase refreshes sessions; on API 401 block operations, clear protected UI and redirect to login without retrying uncertain writes. Supabase sign-out does not instantly revoke locally verified access tokens; authorization lasts until JWT expiry. Configure access-token lifetime **15 minutes** in T05. Strong session revocation and identity deletion require separate post-V2 design.

References checked 2026-10-06: [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts), [user provisioning and trigger failure behavior](https://supabase.com/docs/guides/auth/managing-user-data).

---

# 17. Dashboard Endpoint

**GET /dashboard?period=this_month**; enum/default/ranges frozen in §77. Response `data` requires:

- period: {key, from, to, timezone: "Africa/Cairo"};
- summary: {totalBalance, income, expenses, netSavings, currency: "EGP"}, exact monetary strings;
- accounts: account resource array (§18), including archived balances in total;
- incomeVsExpenses: monthly series (§49), clipped to resolved range;
- recentTransactions: up to 5 transaction resources, newest by transaction cursor order;
- upcomingRecurring: first 5 projected upcoming occurrences, ordered occurrenceDate then recurringTransactionId;
- budgets: current Cairo month's budget resources (§51);
- goals: first 3 active goals ordered targetDate NULLS LAST then id.

Each financial query scopes verified user; use read-only REPEATABLE READ snapshot. Empty collections are arrays; summary values are "0.00" except totalBalance may reflect opening balance. P1 insights may later extend response; core has no insight requirement. Dashboard charts reuse backend analytics, never frontend totals.

---

# 18. Account Resource Shape

Example:

```json
{
  "id": "uuid",
  "name": "CIB Bank",
  "type": "bank",
  "openingBalance": "5000.00",
  "currentBalance": "18400.00",
  "currency": "EGP",
  "status": "active",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`currentBalance` is calculated/derived. Include `openingBalanceEditable` boolean derived from permanent opening_balance_locked; currency EGP. Credit-card currentBalance is debt-positive; cards show amount owed/credit explicitly. Total Balance is net worth including archived accounts (§77).

---

# 19. GET `/accounts`

Returns authenticated user's accounts.

Optional query:

```text
status=active
```

Response:

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Cash",
      "type": "cash",
      "openingBalance": "0.00",
      "currentBalance": "5200.00",
      "currency": "EGP",
      "status": "active",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": {
    "count": 1
  }
}
```

---

# 20. POST `/accounts`

Request:

```json
{
  "name": "CIB Bank",
  "type": "bank",
  "openingBalance": "5000.00",
  "currency": "EGP"
}
```

Response:

```http
201 Created
```

with created account. Name trimmed 1–100 code points; valid type, explicit openingBalance, currency EGP only, active status server-owned.

---

# 21. GET `/accounts/:id`

Returns one owned account.

Cross-user/unknown resource:

```text
404 NOT_FOUND
```

---

# 22. PUT `/accounts/:id`

Full editable details: `{name, type, openingBalance}` with required values and currency omitted/read-only EGP. OpeningBalance must equal current value when openingBalanceEditable=false; changing it returns 409 ACCOUNT_CONFLICT. Changing credit_card ↔ asset semantics is also rejected after first activity; name and asset-to-asset type edits allowed. Status is not accepted here; use explicit archive/restore endpoints. Account locking prevents edit racing first posting. Return 200 account resource.

---

# 23. Account Archive and Restore

**POST /accounts/:id/archive** and **POST /accounts/:id/restore**, empty body. Archive is idempotent, atomically pauses active associated recurring definitions and skips their unposted reservations; returns `{data: account, meta: {pausedRecurringCount}}`. Restore returns active account, never resumes schedules. Historical balances remain; no DELETE /accounts/:id in core. New activity requires active account; edits of historical transaction/transfer with archived resulting references require restore first.

---

# 24. Transaction Resource Shape

Example:

```json
{
  "id": "uuid",
  "accountId": "uuid",
  "accountName": "CIB Bank",
  "categoryId": "uuid",
  "categoryName": "Food",
  "type": "expense",
  "amount": "250.50",
  "currency": "EGP",
  "description": "Groceries",
  "date": "2026-10-06",
  "recurringTransactionId": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

Do not expose `userId`. Include recurringOccurrenceDate as nullable date-only output for generated transactions; immutable linkage is server-owned even if the user edits the posted transaction date/amount.

---

# 25. GET `/transactions`

Queries: type income/expense, accountId/categoryId UUID, inclusive from/to, q, recurring generated/manual, limit/cursor. Omit recurring for all; `all` is invalid. Server-side description/account/category name search; empty q normalizes to omitted; trim q up to 200 Unicode code points. Normalize scope before cursor comparison. Result includes only verified user records; invisible referenced filter IDs return 404 NOT_FOUND, no existence leakage. Date range may include future boundaries for search but manual writes cannot be future; invalid from>to rejected.

---

# 26. Transaction List Response

```json
{
  "data": [
    {
      "id": "uuid",
      "accountId": "uuid",
      "accountName": "Cash",
      "categoryId": "uuid",
      "categoryName": "Food",
      "type": "expense",
      "amount": "250.50",
      "currency": "EGP",
      "description": "Groceries",
      "date": "2026-10-06",
      "recurringTransactionId": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": {
    "limit": 25,
    "nextCursor": null,
    "hasMore": false
  }
}
```

---

# 27. POST `/transactions`

Request:

```json
{
  "accountId": "uuid",
  "type": "expense",
  "amount": "250.50",
  "categoryId": "uuid",
  "date": "2026-10-06",
  "description": "Groceries"
}
```

Rules:

- account must belong to user;
- category valid for user/type;
- archived account/category rejected;
- amount exact and positive;
- date valid from 1900-01-01 through Cairo today;
- all fields strictly validated, monetary scale/range as §9;
- transaction_date storage maps to date; generated linkage is server-owned.

Response:

```http
201 Created
```

with created transaction.

---

# 28. GET `/transactions/:id`

Returns one owned transaction.

---

# 29. PUT `/transactions/:id`

Full update body:

```json
{
  "accountId": "uuid",
  "type": "expense",
  "amount": "275.00",
  "categoryId": "uuid",
  "date": "2026-10-06",
  "description": "Groceries and household items"
}
```

---

# 30. DELETE `/transactions/:id`

Response:

```http
204 No Content
```

No JSON body. Hard delete, including generated transactions; keep durable posted occurrence, clear its generated_transaction_id and never regenerate it. Confirmation is required in UI; ownership applies even with archived parents.

---

# 31. Transfer Resource Shape

Example:

```json
{
  "id": "uuid",
  "sourceAccountId": "uuid",
  "sourceAccountName": "CIB Bank",
  "destinationAccountId": "uuid",
  "destinationAccountName": "Cash",
  "amount": "2000.00",
  "currency": "EGP",
  "date": "2026-10-06",
  "description": "Withdraw cash",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

# 32. GET `/transfers`

Optional accountId (either side), inclusive from/to, limit/cursor. Same signed cursor/meta as §11, with resource/filter scope bound. Sort date DESC, createdAt DESC, id DESC. Return transfer resource array; invisible account filter ID → 404 NOT_FOUND. P0 accounts page includes a transfer list/edit/delete flow without requiring account detail route.

---

# 33. POST `/transfers`

Request:

```json
{
  "sourceAccountId": "uuid",
  "destinationAccountId": "uuid",
  "amount": "2000.00",
  "date": "2026-10-06",
  "description": "Withdraw cash"
}
```

Validation:

- different accounts;
- both owned;
- both accounts active for create/edit;
- positive exact amount 0.01–999999999.99;
- date 1900-01-01 through Cairo today;
- description optional, nullable/trimmed 0–200 Unicode code points, blank becomes null;
- atomic locked operation; no income/expense effects.

Response:

```http
201 Created
```

Transfer creation must be atomic.

---

# 34. GET `/transfers/:id`

Returns owned transfer.

---

# 35. PUT `/transfers/:id`

Supported in P0. Full create semantic fields; description optional/null. Require distinct owned active resulting accounts, exact amount/manual date. Lock old and new accounts consistently; mutation atomic, derived balances recomputed. Return 200 transfer resource.

---

# 36. DELETE `/transfers/:id`

Supported in P0, hard delete with explicit UI confirmation. Atomic ownership-scoped deletion, including archived parents, causes derived balance effects to disappear. Return 204, no body. No transfer archive endpoint.

---

# 37. Recurring Resource Shape

Example:

```json
{
  "id": "uuid",
  "accountId": "uuid",
  "accountName": "CIB Bank",
  "categoryId": "uuid",
  "categoryName": "Salary",
  "type": "income",
  "amount": "15000.00",
  "currency": "EGP",
  "description": "Salary",
  "frequency": "monthly",
  "startDate": "2026-01-01",
  "nextOccurrence": "2026-11-01",
  "endDate": null,
  "status": "active",
  "exhausted": false,
  "createdAt": "...",
  "updatedAt": "..."
}
```

`nextOccurrence` is nullable when paused/archived/exhausted; `exhausted` is derived.

---

# 38. GET `/recurring`

Filters:

- type
- status
- accountId
- categoryId
- frequency

---

# 39. POST `/recurring`

Required accountId, categoryId, type, amount, description, frequency, startDate; optional nullable endDate. No userId, nextOccurrence or independent weekday/month-day input. Create returns 201 recurring resource; ownership/active category-kind checks mandatory.

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

---

# 40. GET `/recurring/:id`

---

# 41. PUT `/recurring/:id`

Full create fields; current lifecycle status retained. Lock definition, keep terminal occurrence identity/history and posted transactions unchanged, skip unposted pending/failed reservations and recalculate next nonterminal anchored date on/after Cairo today if active. Return 200 recurring resource; archived definitions immutable.

---

# 42. POST `/recurring/:id/pause`

Empty body, idempotent for paused; active → paused, nextOccurrence=null; mark unposted pending/failed occurrences skipped atomically. Archived → 409 CONFLICT. Return 200 recurring resource.

---

# 43. POST `/recurring/:id/resume`

Empty body; require owned active account/category and nonarchived definition. Find first anchored nonterminal occurrence on/after Cairo today, ignoring paused history; null/exhausted if end already passed. Idempotent for already active. Return 200 recurring resource.

---

# 44. POST `/recurring/:id/archive`

Empty body, idempotent terminal archive; nextOccurrence=null, unposted reservations skipped, historical generated transactions and terminal markers preserved. No DELETE or restore recurring endpoint in P0.

---

# 45. GET `/recurring/upcoming`

days integer 1–366, default 30. From Cairo today through today+days-1 inclusive; active definitions/parents only, respect start/end and omit terminal posted/skipped dates (upcoming is unposted future/due forecast). Return `{data: [{recurringTransactionId, description, type, amount, currency:"EGP", occurrenceDate, accountName}], meta:{from,to}}`; order occurrenceDate ASC then recurringTransactionId ASC. No financial posting is caused by this GET.

---

# 46. Recurring Suggestions — P1

## GET `/recurring/suggestions`

Returns deterministic potential recurring patterns.

Example:

```json
{
  "data": [
    {
      "suggestionId": "opaque-id",
      "description": "Netflix",
      "type": "expense",
      "amount": "200.00",
      "suggestedFrequency": "monthly",
      "confidence": "high",
      "sampleTransactionIds": ["uuid", "uuid", "uuid"]
    }
  ]
}
```

No recurring definition is created automatically.

---

# 47. Analytics Base

Recommended:

```text
/api/v2/analytics
```

Common query:

- `from`
- `to`
- optional `accountId`

All analytics are user-scoped.

---

# 48. GET `/analytics/overview`

Required inclusive from/to, optional owned accountId; §78 range validation. Required `data` fields:

- period {from,to,timezone:"Africa/Cairo",calendarDays};
- summary {income,expenses,netSavings,savingsRatePercent,averageDailyExpense};
- incomeVsExpenses: monthly rows (§49);
- expenseByCategory/incomeByCategory: category rows (§50);
- accountActivity: [{accountId,accountName,type,income,expenses,netSavings,incomingTransfers,outgoingTransfers}];
- recurring {income,expenses,netCashFlow,basis:"projected_occurrences",from,to}.

Monetary values are two-decimal strings; savingsRatePercent string or null. No P0 insight cards; projections never merge into actual totals. Savings trend reuses netSavings series. All account/category/series ordering deterministic (month ASC; breakdown amount DESC then ID; account name then ID). Zero-fill months intersecting the selected range; empty breakdowns are []; exact amounts are computed in PostgreSQL. Category percentages null on zero denominator.

---

# 49. Analytics Time Series Shape

Monthly item `{period:"2026-10", from:"2026-10-01", to:"2026-10-06", income:"15000.00", expenses:"8240.00", netSavings:"6760.00"}`. from/to clip the calendar month to requested inclusive range. Same rows drive income/expense and savings charts, including zero-filled months. Backend defines values; frontend only formats.

---

# 50. Category Breakdown Shape

Example:

```json
{
  "categoryId": "uuid",
  "categoryName": "Food",
  "amount": "1800.00",
  "percentage": "21.84"
}
```

---

# 51. Budget Resource Shape

Example:

```json
{
  "id": "uuid",
  "categoryId": "uuid",
  "categoryName": "Food",
  "amount": "3000.00",
  "spent": "1800.00",
  "remaining": "1200.00",
  "percentUsed": "60.00",
  "year": 2026,
  "month": 10,
  "alertThresholdPercent": 90,
  "status": "normal",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`spent`, `remaining`, and status are derived. remaining may be negative; percentUsed is rounded to two decimals only for display. Status compares exact spent/allocated/threshold before rounding (§77).

---

# 52. GET `/budgets`

Omitting both year/month selects the current Cairo calendar month. Supplying either requires both; validate year1900–9999/month1–12. categoryId is optional and user-visible only.

Filters:

- year
- month
- categoryId

Example:

```text
GET /api/v2/budgets?year=2026&month=10
```

---

# 53. POST `/budgets`

Request:

```json
{
  "categoryId": "uuid",
  "amount": "3000.00",
  "year": 2026,
  "month": 10,
  "alertThresholdPercent": 90
}
```

Duplicate budget for same user/category/period:

```text
409 CONFLICT
```

---

# 54. PUT `/budgets/:id`

Allows changing:

- amount;
- threshold.

P0 full PUT body is exactly `{amount, alertThresholdPercent}`. Category/year/month are immutable after creation; delete/recreate deliberately to change period/category. Threshold integer 1–100, omitted on POST defaults to90; year1900–9999 and month1–12. POST returns201, PUT200 with budget resource. Expense/both active owned/system category only for creation; invisible IDs404. Existing budget amount/threshold can be edited if its category later archives; historical spending still computes.

---

# 55. DELETE `/budgets/:id`

P0 hard delete plan with explicit confirmation, return 204. Does not delete transactions. Prior budgets remain reviewable until deliberately deleted; no budget archive/rollover.

---

# 56. Goal Resource Shape

Example:

```json
{
  "id": "uuid",
  "name": "New Laptop",
  "targetAmount": "60000.00",
  "savedAmount": "32000.00",
  "remainingAmount": "28000.00",
  "percentComplete": "53.33",
  "targetDate": "2027-03-01",
  "linkedAccountId": null,
  "status": "active",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

# 57. GET `/goals`

Omitted status returns all owned goals, including archived. Invalid status returns field validation error.

Optional filter:

```text
status=active
```

---

# 58. POST `/goals`

Required name (trimmed, 1–120 code points), targetAmount and savedAmount; targetDate and linkedAccountId default null. targetDate, when supplied, is a valid date1900-01-01–9999-12-31. Server sets status active, including when initially funded above target; completion stays explicit. Return201 with goal resource.

Request:

```json
{
  "name": "New Laptop",
  "targetAmount": "60000.00",
  "savedAmount": "32000.00",
  "targetDate": "2027-03-01",
  "linkedAccountId": null
}
```

---

# 59. PUT `/goals/:id`

Full editable fields name/targetAmount/savedAmount/targetDate/linkedAccountId/status (active or completed); ownership and active link assignment checks apply. Manual savedAmount only, linked account metadata. Allow saved>target; remaining max(target-saved,0), unbounded percent display. Completed requires saved>=target; lowering below target requires explicit active status. Archived goal →409 GOAL_INVALID_STATE; use archive endpoint for archive.

---

# 60. POST `/goals/:id/complete`

P0 required endpoint, empty body. Explicit active→completed only if savedAmount>=targetAmount; otherwise 409 GOAL_INVALID_STATE. Already completed is idempotent; no automatic status change. Return 200 goal.

---

# 61. POST `/goals/:id/archive`

P0 required endpoint, empty body. Active/completed → archived, idempotent. Archived goal read-only; no public DELETE/restore in core. Goal projection/history/detail are P1; no progress-history core endpoint.

---

# 62. Category Resource Shape

Example:

```json
{
  "id": "uuid",
  "name": "Education",
  "kind": "expense",
  "icon": "book",
  "color": "#2563EB",
  "status": "active",
  "isSystem": false
}
```

---

# 63. GET `/categories`

Filters:

- kind
- status

Authenticated through T09 requireAuth. Return system + current verified user's owned categories; no profile is required for this read. Default status=active; status=archived explicitly selects archived rows only. kind=income/expense includes both-kind categories; kind=both means both-kind only; omitted kind includes all kinds. Sort isSystem DESC then name ASC (PostgreSQL C collation for environment-stable ordering) then id ASC; return `{data: CategoryResource[], meta: {count}}` without userId or timestamps. Unknown parameters, invalid/empty values, bracket notation and repeated parameters return 400 VALIDATION_ERROR. Identity comes only from req.auth.userId. GET only; authenticated unsupported methods return 405. No custom writes are enabled until T48.

---

# 64. POST `/categories`

Request:

```json
{
  "name": "Education",
  "kind": "expense",
  "icon": "book",
  "color": "#2563EB"
}
```

---

# 65. PUT `/categories/:id`

System categories cannot be edited by users. P0 full PUT body matches category creation fields; optional nullable icon/color, status via lifecycle only.

Custom categories can be edited. Owner/isSystem are immutable; kind cannot change once referenced by any transaction, recurring definition or budget. Names trimmed 1–80 Unicode code points; same-user case-insensitive name uniqueness.

---

# 66. POST `/categories/:id/archive`

Only custom owned categories.

Historical transaction references remain valid. Atomically pause active associated recurring definitions and skip unposted reservations. Restore never auto-resumes them.

---

# 67. POST `/categories/:id/restore`

Restores archived custom category; idempotent, returns200 category, does not resume schedules. Archive returns200 category plus meta.pausedRecurringCount, like account archive. All lifecycle bodies are empty JSON objects.

---

# 68. Notification Resource Shape — P1

Example:

```json
{
  "id": "uuid",
  "type": "budget_near_limit",
  "title": "Food budget almost used",
  "message": "You have used 90% of your Food budget.",
  "status": "unread",
  "createdAt": "...",
  "readAt": null
}
```

---

# 69. GET `/notifications` — P1

Required when P1 promoted: status unread/read, type, limit/cursor; §11 signed cursor ordered createdAt DESC,id DESC. Same list meta. Include meta.unreadCount exact nonnegative integer for bell. Missing P1 implementation means route absent in P0, not an empty fabricated bell.

---

# 70. POST `/notifications/:id/read` — P1

Marks notification read.

---

# 71. POST `/notifications/read-all` — P1

Marks all current user's notifications read.

---

# 72. Reports — P1

## GET `/reports/summary`

Queries:

- from
- to
- optional accountId

Returns report-ready data.

---

# 73. CSV Export — P1

## GET `/exports/transactions.csv`

Queries may mirror transaction filters.

Response:

```http
Content-Type: text/csv
Content-Disposition: attachment; filename="transactions.csv"
```

Only current user's data.

---

# 74. JSON Export — P1

## GET `/exports/transactions.json`

Response:

```http
Content-Type: application/json
Content-Disposition: attachment; filename="transactions.json"
```

---

# 75. Full Data Export — Post-V2

A later endpoint may support:

```text
GET /exports/all
```

This should be considered carefully if data becomes large.

---

# 76. User Identity Deletion — Post-V2

No DELETE /profile/account or alternative account-deletion API in P0/P1. No core deletion control or required browser UI state. Later policy must address recent authentication, JWT/session revocation, retention/export, explicit cleanup and auth identity last. Normal financial account lifecycle is archive/restore (§23), not user identity deletion.

---

# 77. Dashboard Period and Financial Definitions

### Frozen periods and aggregates

P0 currency EGP, locale en, financial timezone **Africa/Cairo** (profile fields read-only). Dashboard default is `GET /api/v2/dashboard?period=this_month`; allowed enums: **this_month, last_month, 3_months, 6_months, 1_year**. this_month is first day of current Cairo month through today; last_month is the full previous month; other enums span the current month plus previous 2/5/11 calendar months through today. Return explicit resolved from/to.

Analytics uses required explicit inclusive `from` and `to`; both valid dates from 1900-01-01 through 9999-12-31, from <= to, maximum **366 calendar days** per request. Actuals include only stored posted transactions; future range portions are allowed for forecast comparison and contain no future manual postings. Presets resolve 7/30 days inclusively ending today; 3/6/12 months start at first of month 2/5/11 months before current month. Transfer/manual transaction dates range 1900-01-01 through Cairo today.

AverageDailyExpense = actual expenses / **number of calendar days represented in the inclusive requested range**, including zero-spend/future days. Dashboard current month is already month-to-date; label it accordingly. savingsRatePercent = netSavings / income * 100; return **null when income is zero**, display “Not applicable”, never fabricated zero/infinity. Category percent uses total corresponding income/expenses as denominator, null if zero. Budget default threshold is **90%**, near_limit when spent*100 >= threshold*allocated and spent <= allocated, exceeded when spent > allocated; compare exact values before display rounding, and zero spend is normal.

Recurring commitments are the exact sum of **projected anchored occurrences within the selected range**, without weekly/yearly monthly normalization. Include only currently active schedules with active parents, respecting start/end dates; omit durable skipped dates. Posted occurrence dates use current definition amount as a forecast assumption, not an actual transaction total; deleted generated transactions are never reposted. Label forecast separately from actuals and explain that projections use the current schedule. Account balance is current all-history net worth (including archived accounts), not historical period income minus expenses.

### Frozen balance and credit-card rules

Asset-like accounts (cash/bank/savings/mobile_wallet/other):

`currentBalance = openingBalance + income - expenses + incomingTransfers - outgoingTransfers`.

Credit cards use **debt-positive** balances:

`currentBalance = openingBalance + expenses - income + outgoingTransfers - incomingTransfers`.

Purchases are expense transactions and increase debt. Refunds/credits recorded as income reduce debt (and count as income under this simple tracker model). A payment is a transfer from an asset account to the card: asset money falls and card debt falls; payment never counts as expense again. Transfers from cards model cash advances and increase debt. Overpayment is allowed and produces negative debt (credit owed to the user).

**Total Balance = net worth = SUM(asset balances) - SUM(card debt balances)**, including archived accounts; archiving cannot remove money/debt from net worth. Period income/expenses/netSavings are actual income/expense transactions only. Account balances are current all-history values, independent of selected dashboard/analytics period. No credit limit, statement cycle, interest or billing automation is included.

---

# 78. Date Range Validation

Analytics: required from/to, inclusive valid calendar dates 1900-01-01 through 9999-12-31, from<=to, max 366 days. Same bound applies to P1 report aggregate periods. Transaction/transfer list ranges may be longer (paginated), with valid inclusive dates/from<=to. Dashboard only accepts its fixed enum/default, not explicit dates. Financial writes ≤Cairo today; recurring end/start may be future. Never timezone-convert DATE through JS timestamps. AccountId filters are ownership-validated with 404 on invisibility.

---

# 79. Archived Resource Rules

Archived rows stay visible through history and totals; list status filtering is explicit. Account/category create/posting rejects archived references with 409 ACCOUNT_ARCHIVED/CATEGORY_ARCHIVED. Edits to resulting archived references require restore; historical hard delete remains permitted. Archive auto-pauses active schedules, restore requires explicit schedule resume. Definition/goal archives immutable; no hard delete for those roots.

---

# 80. Conflict Examples

Use `409 Conflict` for cases such as:

- duplicate monthly budget;
- duplicate case-insensitive custom category name (uniqueness enforced);
- recurrence duplicate/conflict;
- resource state conflict.

Avoid using 409 for ordinary field validation.

---

# 81. Validation Examples

Invalid account:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the highlighted fields.",
    "details": [
      {
        "field": "accountId",
        "message": "Select a valid account."
      }
    ]
  }
}
```

---

# 82. Authentication Error

Missing token:

```http
401 Unauthorized
```

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Sign in to continue.",
    "details": []
  }
}
```

---

# 83. Expired / Invalid Token

```http
401 Unauthorized
```

```json
{
  "error": {
    "code": "AUTH_INVALID",
    "message": "Your session is no longer valid. Sign in again.",
    "details": []
  }
}
```

---

# 84. Resource Not Found

```http
404 Not Found
```

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "The requested resource was not found.",
    "details": []
  }
}
```

This should also cover ownership-hidden resources.

---

# 85. Rate Limit Response

```http
429 Too Many Requests
```

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Try again shortly.",
    "details": []
  }
}
```

---

# 86. Database Failure

```http
503 Service Unavailable
```

```json
{
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "The service is temporarily unavailable.",
    "details": []
  }
}
```

---

# 87. Internal Error

```http
500 Internal Server Error
```

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong.",
    "details": []
  }
}
```

No stack trace in production.

---

# 88. Method Handling

Known path + unsupported method:

```http
405 Method Not Allowed
Allow: GET, PUT, DELETE
```

Use structured error response.

---

# 89. Unknown Route

```http
404 Not Found
```

JSON only.

No default HTML response.

---

# 90. Caching

Financial/user-specific responses:

Recommended:

```http
Cache-Control: no-store
```

for every P0 financial/profile/internal job endpoint.

Some analytics/dashboard responses may later use private short-lived caching if:

- user-specific;
- invalidation rules are clear.

Do not use public shared cache for authenticated financial data.

---

# 91. Idempotency

Recurring internal processor must be idempotent.

For manual transfers or other critical writes, API may later support:

```http
Idempotency-Key: <opaque-value>
```

P0 manual CRUD/transfers have no Idempotency-Key support; no automatic uncertain-write retries. Deliberate repeated transfer requests create distinct rows, so UI must refresh/check before retry.

---

# 92. Internal Recurring Job Endpoint

**GET /internal/recurring/process**, root path, not /api/v2; CRON_SECRET Bearer only, fail closed/constant-time comparison/no-store. POST is unsupported (405 Allow: GET). Vercel Cron on backend calls daily 0 3 * * * UTC; bounded processing and occurrence ownership are defined in architecture §20. Authenticated user tokens do not authorize execution. Job data remains safe counts only.

---

# 93. Internal Job Response

200 `{data:{processed:12,created:4,skipped:8,failed:0,hasRemaining:false}}`; processed counts attempts, created counts newly posted transactions, skipped counts terminal/no-longer-eligible dates, failed counts unsuccessful attempts. Partial bounded progress returns hasRemaining=true, persists state and logs safely. Missing/invalid internal credential 401; unavailable DB503. No automatic provider retries assumed; operator invocation is duplicate-safe.

---

# 94. OpenAPI

V2 should strongly consider maintaining an OpenAPI document after routes stabilize.

Benefits:

- frontend/backend agreement;
- generated docs;
- testability;
- easier future mobile client.

This can be added as an implementation milestone.

---

# 95. Request IDs

Backend may return:

```http
X-Request-Id: <id>
```

Useful for tracing without exposing internals.

---

# 96. API Testing Requirements

Each domain needs tests for:

- authentication;
- authorization;
- validation;
- success;
- not found;
- cross-user access;
- database failure;
- exact money;
- date behavior;
- method handling.

---

# 97. Multi-User API Test Cases

User A owns:

- account A;
- transaction A;
- budget A.

User B tries:

```text
GET transaction A
PUT transaction A
DELETE transaction A
POST transfer using account A
GET budget A
```

Expected:

```text
404 or safe denial according to ownership policy
```

No data leakage.

---

# 98. Transfer API Test Cases

- valid transfer;
- same account rejected;
- source not owned;
- destination not owned;
- archived account rejected;
- exact amount preserved;
- atomic failure rollback.

---

# 99. Recurring API Test Cases

- create daily;
- weekly;
- monthly;
- yearly;
- pause/resume;
- invalid date combinations;
- duplicate processing;
- month-end;
- leap year.

---

# 100. Analytics API Test Cases

Known fixture dataset should verify:

- totals;
- category breakdown;
- savings;
- averages;
- recurring commitments;
- transfers excluded;
- empty period;
- negative savings.

---

# 101. API Acceptance Criteria

The V2 API design is ready for implementation planning when:

- auth policy is consistent;
- ownership behavior is defined;
- all core resources have endpoints;
- pagination/filter/search behavior is defined;
- money/date serialization is consistent;
- transfer and recurring rules are represented;
- analytics contract is sufficient for UX;
- errors are standardized;
- P1 export scope is explicit and excluded from core gates;
- internal job route strategy is understood.

---

# 102. BMAD Next Step

API contracts remain frozen for P0 after T02. Next: code-first T03 design system/app shell and T04 P0 browser prototype with fixtures. Neither connects to V2 APIs or Supabase Auth; later tasks replace fixtures with verified user-scoped integration. P1 endpoints remain optional enhancement contracts. This task edits documentation only.

---

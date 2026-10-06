# Expense Tracker V2 — API Design

**Version:** 2.0 Planning  
**Status:** Draft for BMAD API Design  
**Date:** 2026-10-06  
**Project:** Expense Tracker  
**Depends on:** `01-product-brief.md`, `02-prd.md`, `03-ux-specification.md`, `04-architecture.md`, `05-database-design.md`

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

V2 API prefix:

```text
/api/v2
```

Example production base:

```text
https://<backend-host>/api/v2
```

V1 may remain temporarily available at:

```text
/api/v1
```

during migration and rollback windows.

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

The explicit body-size limit should be documented in implementation configuration.

---

# 9. Money Serialization

Money values must be strings.

Correct:

```json
{
  "amount": "1250.50"
}
```

Incorrect:

```json
{
  "amount": 1250.5
}
```

The same rule applies to:

- balances;
- budget values;
- goal values;
- analytics totals;
- transfer amounts;
- recurring amounts.

Frontend must never require float arithmetic to interpret API money.

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

Recommended transaction pagination:

cursor-based.

Request example:

```text
GET /api/v2/transactions?limit=25&cursor=<opaque-cursor>
```

Response:

```json
{
  "data": [],
  "meta": {
    "limit": 25,
    "nextCursor": "opaque-or-null",
    "hasMore": true
  }
}
```

Cursor must be opaque to the client.

Server ordering:

```text
date DESC
createdAt DESC
id DESC
```

---

# 12. List Limits

Suggested defaults:

```text
default limit: 25
maximum limit: 100
```

Final values may be tuned later.

Invalid limits return `VALIDATION_ERROR`.

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

Search may inspect:

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

## GET `/profile`

Returns current authenticated profile.

Response:

```json
{
  "data": {
    "userId": "uuid",
    "displayName": "Zeyad",
    "preferredCurrency": "EGP",
    "locale": "en",
    "timezone": "Africa/Cairo",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## PUT `/profile`

Request:

```json
{
  "displayName": "Zeyad",
  "locale": "en",
  "timezone": "Africa/Cairo"
}
```

The authenticated user ID is not accepted in body.

---

# 17. Dashboard Endpoint

## GET `/dashboard`

Purpose:

Return dashboard overview in one coarse request.

Optional query:

```text
period=month
```

or explicit range later.

Example response:

```json
{
  "data": {
    "summary": {
      "totalBalance": "25480.00",
      "income": "15000.00",
      "expenses": "8240.00",
      "netSavings": "6760.00",
      "currency": "EGP"
    },
    "accounts": [],
    "recentTransactions": [],
    "upcomingRecurring": [],
    "budgets": [],
    "goals": [],
    "insights": []
  }
}
```

This endpoint should not replace detailed domain endpoints.

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

`currentBalance` is calculated/derived.

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

with created account.

---

# 21. GET `/accounts/:id`

Returns one owned account.

Cross-user/unknown resource:

```text
404 NOT_FOUND
```

---

# 22. PUT `/accounts/:id`

Full update of editable account fields.

Example:

```json
{
  "name": "Main Bank",
  "type": "bank",
  "status": "active"
}
```

Opening balance mutability should be decided carefully.

Recommendation:

Allow changing opening balance only before financial activity exists, or provide a dedicated adjustment workflow.

---

# 23. POST `/accounts/:id/archive`

Preferred over hard delete where history exists.

Response:

```json
{
  "data": {
    "id": "uuid",
    "status": "archived"
  }
}
```

Optional restore:

```text
POST /accounts/:id/restore
```

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

Do not expose `userId`.

---

# 25. GET `/transactions`

Supported query parameters:

- `type`
- `accountId`
- `categoryId`
- `from`
- `to`
- `q`
- `recurring`
- `limit`
- `cursor`

Example:

```text
GET /api/v2/transactions?type=expense&accountId=<uuid>&from=2026-10-01&to=2026-10-31&limit=25
```

`recurring` may support:

```text
generated
manual
all
```

if useful; omit if it complicates initial release.

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
- date valid.

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

No JSON body.

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

Optional filters:

- accountId
- from
- to
- limit
- cursor

If `accountId` supplied, return transfers where account is source or destination.

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
- active unless policy permits archived history-only;
- positive amount.

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

Full update allowed only if accounting consistency can be maintained.

Body same semantic fields as create.

---

# 36. DELETE `/transfers/:id`

If supported:

```http
204 No Content
```

The backend must reverse/recompute derived account effects automatically because balances are derived from source data.

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
  "createdAt": "...",
  "updatedAt": "..."
}
```

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

Request:

```json
{
  "accountId": "uuid",
  "categoryId": "uuid",
  "type": "income",
  "amount": "15000.00",
  "description": "Salary",
  "frequency": "monthly",
  "startDate": "2026-10-01",
  "endDate": null
}
```

Server calculates:

```text
nextOccurrence
```

according to recurrence rules.

---

# 40. GET `/recurring/:id`

---

# 41. PUT `/recurring/:id`

Full update of future recurrence definition.

Must not rewrite historical generated transactions.

---

# 42. POST `/recurring/:id/pause`

Returns updated status.

---

# 43. POST `/recurring/:id/resume`

Recalculates/validates next occurrence.

---

# 44. POST `/recurring/:id/archive`

Archives recurring definition.

---

# 45. GET `/recurring/upcoming`

Suggested query:

```text
days=30
```

Example:

```text
GET /api/v2/recurring/upcoming?days=30
```

Response:

```json
{
  "data": [
    {
      "recurringTransactionId": "uuid",
      "description": "Rent",
      "type": "expense",
      "amount": "5000.00",
      "currency": "EGP",
      "occurrenceDate": "2026-11-01",
      "accountName": "CIB Bank"
    }
  ]
}
```

---

# 46. Recurring Suggestions

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

Response may include:

```json
{
  "data": {
    "period": {
      "from": "2026-10-01",
      "to": "2026-10-31"
    },
    "summary": {
      "income": "15000.00",
      "expenses": "8240.00",
      "netSavings": "6760.00",
      "savingsRatePercent": "45.07",
      "averageDailyExpense": "265.81"
    },
    "incomeVsExpenses": [],
    "expenseByCategory": [],
    "incomeByCategory": [],
    "accountActivity": [],
    "recurring": {
      "income": "15000.00",
      "expenses": "6800.00"
    },
    "insights": []
  }
}
```

Percentage values should also use strings if exact decimal behavior is desired.

---

# 49. Analytics Time Series Shape

Example:

```json
{
  "period": "2026-10",
  "income": "15000.00",
  "expenses": "8240.00",
  "netSavings": "6760.00"
}
```

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

`spent`, `remaining`, and status are derived.

---

# 52. GET `/budgets`

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

Changing category/period may be allowed only if uniqueness remains valid.

---

# 55. DELETE `/budgets/:id`

Could be:

```http
204 No Content
```

Because budget history may be useful, archive behavior can be evaluated later.

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

Optional filter:

```text
status=active
```

---

# 58. POST `/goals`

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

Full update of editable fields.

---

# 60. POST `/goals/:id/complete`

Optional explicit lifecycle endpoint.

---

# 61. POST `/goals/:id/archive`

Optional explicit archive endpoint.

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

By default, return:

- applicable system categories;
- current user's categories.

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

System categories should not be editable by user.

Custom categories can be edited.

---

# 66. POST `/categories/:id/archive`

Only custom owned categories.

Historical transaction references remain valid.

---

# 67. POST `/categories/:id/restore`

Restores archived custom category.

---

# 68. Notification Resource Shape

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

# 69. GET `/notifications`

Filters:

- status
- type
- limit
- cursor

---

# 70. POST `/notifications/:id/read`

Marks notification read.

---

# 71. POST `/notifications/read-all`

Marks all current user's notifications read.

---

# 72. Reports

## GET `/reports/summary`

Queries:

- from
- to
- optional accountId

Returns report-ready data.

---

# 73. CSV Export

## GET `/exports/transactions.csv`

Queries may mirror transaction filters.

Response:

```http
Content-Type: text/csv
Content-Disposition: attachment; filename="transactions.csv"
```

Only current user's data.

---

# 74. JSON Export

## GET `/exports/transactions.json`

Response:

```http
Content-Type: application/json
Content-Disposition: attachment; filename="transactions.json"
```

---

# 75. Full Data Export

A later endpoint may support:

```text
GET /exports/all
```

This should be considered carefully if data becomes large.

---

# 76. Account Deletion API

Potential endpoint:

```text
DELETE /profile/account
```

or:

```text
POST /profile/delete-account
```

Because this is highly destructive, it should require:

- recent authentication;
- explicit confirmation;
- final UX/security design.

Do not implement until policy is finalized.

---

# 77. Dashboard Period Query

Possible values:

```text
period=this_month
period=last_month
period=3_months
period=6_months
period=1_year
```

Or use explicit:

```text
from
to
```

Recommendation:

Use explicit dates for analytics and a simpler period enum for dashboard convenience.

---

# 78. Date Range Validation

Rules:

- `from <= to`;
- valid calendar dates;
- maximum range may be imposed for expensive analytics;
- use user's calendar semantics;
- do not timezone-shift date-only values.

---

# 79. Archived Resource Rules

Archived resources:

- remain visible in historical output where referenced;
- cannot be used for new activity unless restored.

Example:

Creating a transaction with archived account:

```text
409 ACCOUNT_ARCHIVED
```

or validation error depending final taxonomy.

---

# 80. Conflict Examples

Use `409 Conflict` for cases such as:

- duplicate monthly budget;
- duplicate custom category name if uniqueness enforced;
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

for highly sensitive or mutation-sensitive endpoints.

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

Not mandatory for every V2 CRUD endpoint initially.

---

# 92. Internal Recurring Job Endpoint

Possible internal route:

```text
POST /internal/recurring/process
```

This should not live under public authenticated user routes.

Protected by:

- cron secret;
- provider auth;
- internal-only controls.

Response may include safe job counts.

Do not expose sensitive financial records.

---

# 93. Internal Job Response Example

```json
{
  "data": {
    "processed": 12,
    "created": 4,
    "skipped": 8,
    "failed": 0
  }
}
```

Useful for observability.

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
- export behavior is defined;
- internal job route strategy is understood.

---

# 102. BMAD Next Step

Next artifact:

**`07-implementation-plan.md`**

It should convert the V2 design into phased milestones and small implementation tasks, including:

- migration safety;
- authentication foundation;
- user isolation;
- accounts;
- transactions V2;
- transfers;
- recurring;
- analytics;
- budgets;
- goals;
- categories/settings;
- reports/export;
- testing;
- security validation;
- Figma implementation dependencies;
- deployment and final verification.

No V2 code should be started before the implementation plan is reviewed.

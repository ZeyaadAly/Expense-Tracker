# Expense Tracker — API Design

**Version:** 1.0  
**Date:** 2026-10-01  
**Status:** Contract specification; endpoints have not been implemented or tested  
**Related documents:** [Project brief](01-project-brief.md) · [Requirements](02-requirements.md) · [Database design](03-database-design.md)

## 1. Purpose and architecture

The Next.js frontend calls an Express REST API. Express verifies Supabase Auth access tokens, validates requests, accesses Supabase PostgreSQL, and returns JSON. The browser never connects directly to the transaction database. V1 allows only one approved Auth account, identified by the server-only `APP_OWNER_USER_ID`.

Development defaults:

- Frontend origin: `http://localhost:3000`.
- Express origin: `http://localhost:4000`.
- API prefix: `/api/v1`.
- Example base URL: `http://localhost:4000/api/v1`.

Configure origins through environment variables. Hosting URLs are decided during deployment. All transaction and summary routes require a valid Supabase Auth bearer token from the approved account. These routes are planned and have not been implemented. Any hosted demo uses sample data until access controls are verified.

## 2. Endpoint overview

Paths below are relative to `/api/v1`.

`GET /api/health` is a public backend setup route outside `/api/v1`. It returns 200 with `{ "status": "ok", "api": "running", "configuration": "valid" }` after startup validation succeeds. It checks local configuration syntax only; it does not contact Supabase Auth or PostgreSQL. Missing required configuration prevents the server from starting, so the route is unavailable in that case.

| Method | Path | Purpose | Success status |
| --- | --- | --- | --- |
| GET | `/transactions` | List transactions, optionally filtered | 200 |
| GET | `/transactions/:id` | Retrieve one transaction | 200 |
| POST | `/transactions` | Create a transaction | 201 |
| PUT | `/transactions/:id` | Replace all five editable fields | 200 |
| DELETE | `/transactions/:id` | Permanently delete one transaction | 204 |
| GET | `/summary` | Retrieve totals for all transactions | 200 |

Use PUT for a complete editable-field update. Partial PATCH updates are outside V1. No separate category endpoint is needed for the fixed lists.

## 3. Shared contract conventions

- Request and response field names use camelCase. Express maps them to database snake_case columns.
- JSON bodies are required for POST and PUT, with `Content-Type: application/json` (an optional charset parameter is allowed).
- Successful JSON responses use `{ "data": ... }`; errors use `{ "error": ... }`.
- Amounts and totals are decimal strings. JSON numbers are not accepted for `amount`.
- Type/category values are lowercase codes; display labels belong to the frontend.
- Dates use `YYYY-MM-DD`. Timestamps use UTC ISO 8601 strings.
- Responses include `currency: "EGP"`; currency is fixed and cannot be submitted as an editable field.
- POST and PUT accept exactly five fields: `type`, `amount`, `description`, `category`, `date`. Reject unknown properties, including `id`, `currency`, `createdAt`, and `updatedAt`.
- Limit JSON request bodies to 16 KiB. The limit is separate from field validation.
- Set `Cache-Control: no-store` on application API responses. The frontend refreshes the list and summary after successful writes.
- Route IDs must be canonical hyphenated UUID strings; accept hexadecimal letters in either case and return lowercase IDs. Express generates new IDs server-side.
- Validate route IDs, queries, and request bodies before querying the database. A syntactically invalid ID returns 400; a valid but absent ID returns 404.
- For every transaction and summary route, require `Authorization: Bearer <Supabase access token>`. Express verifies the token with Supabase Auth and checks the user ID against `APP_OWNER_USER_ID` before any database access. Missing or invalid credentials return 401; a valid token for another user returns 403.

### Transaction response object

```json
{
  "id": "8d090605-20b3-4f87-a513-f487b705b7a2",
  "type": "expense",
  "amount": "250.50",
  "currency": "EGP",
  "description": "Grocery shopping",
  "category": "food",
  "date": "2026-09-30",
  "createdAt": "2026-10-01T12:00:00.000Z",
  "updatedAt": "2026-10-01T12:00:00.000Z"
}
```

Database mapping: `date` → `transaction_date`, `createdAt` → `created_at`, and `updatedAt` → `updated_at`. Other editable names match their column names.

## 4. Request validation

| Field | Rule | Example |
| --- | --- | --- |
| `type` | String; exactly `income` or `expense` | `"expense"` |
| `amount` | String; canonical unsigned decimal format, range 0.01–999999999.99, maximum two fractional digits | `"250.50"` |
| `description` | String; trim whitespace, then require 1–200 Unicode code points | `"Grocery shopping"` |
| `category` | String; valid code for the selected type | `"food"` |
| `date` | String; strict valid calendar date, from 1900-01-01 through today in Africa/Cairo | `"2026-09-30"` |

Amount syntax: `^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$`, followed by an exact range check. Accept `"10"`, `"10.5"`, and `"10.50"`; return them normalized to `"10.00"`, `"10.50"`, and `"10.50"`. Reject zero, negatives, leading zeros such as `"010"`, whitespace, separators, exponent notation, currency symbols, and excess precision. Do not silently round values or convert them through JavaScript Number.

Validate dates as calendar values; do not rely on a JavaScript Date parser that rolls impossible dates into a later month. Preserve the submitted calendar day throughout storage and retrieval.

All five fields are required for POST and PUT. Null, array, object, boolean, or numeric values in string fields are invalid. Reject a non-object body, missing body, or empty object. Collect independent field validation errors in one response where practical.

| Type | Category codes |
| --- | --- |
| `income` | `salary`, `freelance`, `gift`, `other` |
| `expense` | `food`, `transport`, `shopping`, `bills`, `entertainment`, `other` |

## 5. List transactions

**GET `/transactions`**

Optional query parameters:

| Parameter | Accepted values | Behavior |
| --- | --- | --- |
| `type` | `income`, `expense` | Restrict the list to that type. |
| `category` | Any category code from the combined lists | Restrict the list to that category. |

- Missing parameters mean All. The frontend omits parameters for All; literal `all` is invalid.
- Combine parameters with AND logic.
- With type omitted, `category=other` matches both types.
- Reject an incompatible pair such as `type=income&category=food` with 400.
- Reject empty values, unknown parameters, repeated parameters, and non-scalar query values with 400.
- No pagination, search, date-range, or configurable sorting parameters exist in V1.
- Sort by transaction date descending, creation timestamp descending, then ID descending.

Example request: `GET /api/v1/transactions?type=expense&category=food`.

Example 200 response:

```json
{
  "data": [
    {
      "id": "8d090605-20b3-4f87-a513-f487b705b7a2",
      "type": "expense",
      "amount": "250.50",
      "currency": "EGP",
      "description": "Grocery shopping",
      "category": "food",
      "date": "2026-09-30",
      "createdAt": "2026-10-01T12:00:00.000Z",
      "updatedAt": "2026-10-01T12:00:00.000Z"
    }
  ],
  "meta": {
    "count": 1,
    "filters": { "type": "expense", "category": "food" }
  }
}
```

`count` is the number of matching records returned. Omitted filter values appear as null in `meta.filters`. An empty result returns 200 with `data: []` and `count: 0`, not 404.

The summary response's overall transaction count helps the frontend distinguish an empty database from a list with no filter matches.

## 6. Retrieve one transaction

**GET `/transactions/:id`**

Return 200 with `{ "data": <transaction object> }`. Return 404 if the UUID is valid but no row exists. This endpoint can refresh details before editing; it does not add concurrency protection.

## 7. Create a transaction

**POST `/transactions`**

Example request body:

```json
{
  "type": "expense",
  "amount": "250.50",
  "description": "Grocery shopping",
  "category": "food",
  "date": "2026-09-30"
}
```

Validate the body, generate a UUID, perform a parameterized insert, and return 201 with `{ "data": <saved transaction object> }` after commit. Set `Location: /api/v1/transactions/<generated-id>`.

Return the trimmed description, normalized amount, database-managed timestamps, and generated ID. An invalid request writes nothing. Identical valid submissions create separate records; there is no uniqueness rule on description, date, or amount.

## 8. Update a transaction

**PUT `/transactions/:id`**

Example request body:

```json
{
  "type": "expense",
  "amount": "300.00",
  "description": "Updated grocery total",
  "category": "food",
  "date": "2026-09-30"
}
```

Validate all five fields, then update only the row identified by the route ID. Return 200 with `{ "data": <updated transaction object> }` after commit.

- Keep `id` and `createdAt` unchanged; refresh `updatedAt` even if editable values are unchanged.
- Return 404 if no row was updated. PUT does not create a missing transaction.
- Invalid updates change nothing.
- Concurrent updates use last-write-wins in V1; no version token or conflict response is implemented.

## 9. Delete a transaction

**DELETE `/transactions/:id`**

The frontend asks for confirmation before sending the request. No request body is required or supported. Delete only the selected row.

- Return 204 with an empty body after a successful committed deletion. The client must not attempt to parse JSON from this response.
- Return 404 if the valid ID is already absent.
- There is no soft delete, undo, or deletion archive in V1.

## 10. Overall summary

**GET `/summary`**

No query parameters are supported. Reject filter parameters rather than silently applying or ignoring them.

Example 200 response:

```json
{
  "data": {
    "totalIncome": "1000.00",
    "totalExpenses": "250.50",
    "balance": "749.50",
    "currency": "EGP",
    "transactionCount": 2,
    "scope": "all"
  }
}
```

Calculate sums, balance, and count over all rows in the one approved account's collection in one database statement. Extend the database design's aggregate query with `COUNT(*)`; map its result to a nonnegative integer for this small V1 dataset. Totals remain unrestricted decimal strings and may exceed the per-transaction amount limit. Balance may be negative.

An empty table returns `"0.00"` for all three monetary values and `transactionCount: 0`. A database failure returns an error rather than fabricated zeros.

List and summary requests are separate reads and may observe different committed moments. V1 refreshes both after mutations; it does not guarantee a cross-endpoint snapshot during simultaneous writes.

## 11. Error contract

Example validation error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the highlighted fields.",
    "details": [
      { "field": "amount", "message": "Enter a positive amount with at most two decimal places." },
      { "field": "category", "message": "Choose a category valid for the selected type." }
    ]
  }
}
```

Every error includes a stable `code`, a readable `message`, and a `details` array (empty when there are no field details). Use `body` for object-level errors, `id` for route ID errors, query names for filter errors, and the relevant property name for unknown input fields.

| HTTP status | Error code | Situation |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | Missing, expired, or invalid Supabase Auth access token. |
| 403 | `FORBIDDEN` | Valid user identity that is not the approved V1 account. |
| 400 | `VALIDATION_ERROR` | Invalid fields, ID, query parameters, or body shape. |
| 400 | `INVALID_JSON` | Malformed JSON syntax. |
| 404 | `TRANSACTION_NOT_FOUND` | Valid ID with no matching transaction. |
| 404 | `ROUTE_NOT_FOUND` | Unknown API route. |
| 405 | `METHOD_NOT_ALLOWED` | Unsupported method on a known route; include the Allow header. |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds 16 KiB. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST/PUT body is not application/json. |
| 503 | `DATABASE_UNAVAILABLE` | Recognized database connection/availability failure. |
| 500 | `INTERNAL_ERROR` | Unexpected server failure. |

Reject query parameters on every endpoint except the documented list filters. Reject nonempty bodies on GET and DELETE. CORS preflight OPTIONS requests are handled by middleware and are not application mutations.

Map known user-correctable database constraint violations to validation errors where possible. Log unexpected failures server-side without exposing SQL, connection strings, stack traces, or internal provider messages.

## 12. Frontend request behavior

1. Load transactions and summary when the dashboard opens; show loading, empty, or error states as appropriate.
2. Abort or ignore outdated list requests after filter changes so older results cannot overwrite newer selections.
3. Disable repeated submit/delete actions while pending.
4. After a successful mutation, display success and refresh the filtered list and overall summary.
5. If refresh fails after success, show “Saved, but the dashboard could not refresh” (or the corresponding deleted message) and offer Retry. Do not resend the mutation.
6. Show validation details beside fields and keep entered values after rejected saves.
7. On missing-record responses, explain that the record is unavailable and refresh the list.
8. A timeout, connection loss, or unexpected server error during a write may leave its outcome uncertain. Ask the user to refresh/check before retrying; do not automatically retry writes.

For creation without request-level idempotency, checking similar records cannot prove which request created them. Keep that limitation explicit in recovery behavior.

## 13. Configuration and plugin integration

- Server environment: `PORT` (development default 4000), `CLIENT_ORIGIN` (development default http://localhost:3000), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `APP_OWNER_USER_ID` for the approved account (required when Auth protection is implemented). `DATABASE_URL` is needed when PostgreSQL access is implemented. `SUPABASE_SERVICE_ROLE_KEY` is reserved for future server-only admin operations and is not used by the current health route or planned direct SQL access.
- Client environment: `NEXT_PUBLIC_API_BASE_URL`, containing the public API base URL only. No database secrets enter client configuration.
- Allow configured frontend origins through CORS. CORS does not provide authentication; Express must verify the Auth token and approved account on each application data request.
- Use parameterized SQL and a reusable connection pool; keep provider credentials server-side.
- Express connects to Supabase PostgreSQL using the database design's limited-role access model. The browser does not call the Supabase Data API for transaction data.
- Vercel may host the frontend; decide Express hosting, URLs, TLS, connection mode, and provider limits during deployment setup.
- Figma designs should cover the loading/error/form states defined by this contract. Notion may track implementation tasks while Markdown remains the documentation source.

This document creates no hosted resource or plugin connection.

## 14. API verification checklist

Checks are planned and have not been executed.

- [ ] Create a valid transaction; verify 201, Location, generated ID, normalized values, and persistence.
- [ ] Read the record and list; verify field names and date/timestamp serialization.
- [ ] Update all editable fields; verify preserved ID/creation time and changed update time.
- [ ] Delete; verify 204 with no body, then 404 on a subsequent deletion.
- [ ] Reject incomplete PUT requests and confirm missing IDs are never upserted.
- [ ] Reject numeric JSON amounts, invalid amount syntax, and values outside the allowed range.
- [ ] Reject invalid dates, category/type combinations, blank descriptions, and unknown input fields.
- [ ] Verify filters individually and together, Other across both types, empty lists, and deterministic ordering.
- [ ] Reject duplicate/unknown query parameters, incompatible filters, and filters on summary.
- [ ] Verify summary zeros, exact 0.10 + 0.20 arithmetic, negative balances, counts, and totals above the individual amount limit.
- [ ] Verify malformed JSON, oversized payloads, wrong media types, unsupported methods, and unknown routes.
- [ ] Simulate database errors and uncertain network outcomes without leaking internal details or reporting false success.
- [ ] Verify configured CORS behavior and no-store response headers.
- [ ] Verify 401 for missing/invalid tokens and 403 for valid tokens from other users before transaction data is exposed.
- [ ] Complete the frontend → Express → PostgreSQL → response flow using sample data.

## 15. Next step

Create `05-implementation-plan.md` with small tasks for project setup, Figma design, database setup, Express endpoints, frontend integration, verification, and sample-data deployment.

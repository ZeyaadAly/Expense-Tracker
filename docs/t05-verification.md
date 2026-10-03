# T05 verification

Status: Completed. T06 has not started.

## Scope

Added reusable transaction types, body/UUID/query validators, exact decimal formatting,
transaction row mapping, ApiError, request policy, unsupported-method handling, JSON 404,
and centralized error middleware. The application now mounts its router at /api/v1,
sets no-store on API responses, applies configured CORS, and parses JSON with a 16 KiB limit.
Health is the only production endpoint; test-only routes are injected by the test runner.
No frontend, authentication, database schema, role, TLS, or secret configuration was changed.

Transaction validation requires exactly five string fields, rejects unknown properties,
checks lowercase type/category pairs, enforces canonical positive decimal amounts from
0.01 to 999999999.99, trims descriptions and counts 1-200 Unicode code points, and accepts
only real YYYY-MM-DD dates from 1900-01-01 through today in Africa/Cairo. Valid amounts
are normalized by string operations. Creation and full-field updates can share the validator.

UUIDs are canonical hyphenated strings, normalized to lowercase. The query validator
uses the original URL to detect repeated/bracketed/unknown parameters and incompatible
type/category pairs. Filters are allowed only when explicitly requested by a future route.

All errors have `{error:{code,message,details}}`. Parser failures map to INVALID_JSON,
PAYLOAD_TOO_LARGE, or UNSUPPORTED_MEDIA_TYPE; known availability failures map to
DATABASE_UNAVAILABLE; known named transaction check violations map to field validation.
Unexpected failures return sanitized INTERNAL_ERROR and produce a generic server log,
never the original error object, SQL, connection string, or stack. Unsupported methods
include Allow. CORS handles OPTIONS preflight. GET/HEAD/DELETE request bodies are rejected.

The row mapper returns camelCase, EGP, exact decimal strings, date-only values, and UTC ISO
timestamps. Future SQL must format transaction_date as YYYY-MM-DD (for example using
to_char), instead of allowing the pg default date parser to introduce a timezone shift.

## Executed checks

- Backend lint, TypeScript check, and production build passed.
- Nine automated test groups passed with Node's built-in test runner; no dependency added.
- Validation checks cover missing values, types, metadata, enums, amount syntax/range,
  Unicode whitespace/code points, leap years, impossible/future dates, and Cairo midnight.
- Mapper checks cover exact money, unchanged date-only values, UTC timestamps, and invalid rows.
- HTTP checks cover valid and exactly-16-KiB JSON, oversized/malformed JSON, body shape,
  media types, JSON 404/405 with Allow, field errors, sanitized unexpected/database errors,
  CORS preflight, no-store, rejected read/delete bodies, and absence of transaction endpoints.
- Both exact T04 health responses passed in isolated HTTP tests.
- Existing T04 health runner passed against live Supabase on port 44004 and a deliberately
  unavailable database on port 44005, preserving the running development server on 4000.
- The development server on port 4000 also returned the documented HTTP 200 health result.
- Existing T04 disposable database runner passed on a fresh PostgreSQL 17 cluster: both
  migrations, repeatable seed, exact totals, constraints, timestamps, limited-role CRUD,
  and denied DDL. The disposable server was stopped afterward.

## Repeat checks

From backend/: run `npm run lint`, `npm run typecheck`, `npm run build`, then `npm test`.
Tests load compiled modules, so rebuild after source changes.

Run `node scripts/verify-t04-health.mjs` with its default ports free. Set
HEALTH_SUCCESS_PORT and HEALTH_FAILURE_PORT to alternate ports when development is running.
See the README for the disposable SQL runner's loopback/fresh-database requirements.

Next: T06 create/read/summary endpoints. No T06 routes or database queries were implemented.

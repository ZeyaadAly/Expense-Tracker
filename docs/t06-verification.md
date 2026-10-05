# T06 verification

> **Historical checkpoint:** This report preserves the results and task/deployment state at its recorded date. Later-task and fixture-only statements are historical. Current local V1 evidence is in [T12 verification](t12-verification.md); current setup/status is in [handoff](07-handoff.md). T14 integrated deployment has not started.


Status: Completed. T07 has not started; its T03 design prerequisite remains outstanding.

## Implemented contract

- POST /api/v1/transactions: validates all five editable fields and absence of query
  parameters before database access, generates a UUID, inserts with bound parameters,
  and returns 201 with Location and `{data: transaction}` after the statement commits.
- GET /api/v1/transactions: validates only optional type/category filters, combines them
  with AND, and returns mapped records plus matching count and normalized filter metadata.
  Ordering is transaction date DESC, creation time DESC, ID DESC. No pagination or date-range
  options were added. Empty results return 200 with an empty array.
- GET /api/v1/transactions/:id: validates canonical UUID and absence of queries, returns
  a mapped record or 404 TRANSACTION_NOT_FOUND. Uppercase IDs are accepted and normalized.
- GET /api/v1/summary: rejects queries and calculates income, expenses, balance, and count
  in a single unfiltered PostgreSQL aggregate statement. Empty money totals are 0.00;
  scope is all, currency is EGP, and transactionCount is a nonnegative safe integer.

Routes delegate SQL to one small service using the existing production pool. User data
is always bound as parameters. Optional SQL fragments and identifiers are fixed application
strings. Money remains numeric in PostgreSQL and decimal strings in Node; only record
count is converted to Number. Dates are formatted with to_char before pg row parsing,
and existing T05 mapping produces UTC timestamps and camelCase API fields.

The existing centralized middleware handles validation, known constraints, database
availability, and unexpected errors. Unsupported methods return 405 and Allow before
body parsing, including unimplemented PUT/DELETE methods. No update/delete handlers,
frontend, authentication, schema/privilege changes, or environment changes were added.

## Executed verification

- Lint, TypeScript check, production build, and diff checks passed.
- All 12 automated test groups passed with no skips, including nine T05 regression groups
  and real HTTP/PostgreSQL T06 integration using expense_tracker_app on loopback.
- Seed summary matched income 1000.00, expenses 296.25, balance 703.75, count 3.
- Empty list/summary, create status/Location/UUID, metadata rejection, trimmed text,
  date/timestamp serialization, single reads/missing records, and exact money passed.
- Type/category/combined filters, Other across types, unmatched results, deterministic
  ordering including UUID tie-breaking, and unfiltered summary totals passed.
- Invalid requests were rejected before any database query in instrumented service tests.
- Known database unavailability returned 503; unexpected errors returned sanitized 500
  on all four endpoints. Unsupported methods returned 405/Allow without implementing writes.
- Direct limited-role invalid inserts still failed database constraints.
- 0.10 + 0.20 totaled exactly 0.30. Negative balance and totals exceeding the individual
  transaction limit passed. SQL-like description text was stored as literal data.
- Created records were committed and readable from another connection. Nine test rows
  also remained after a complete disposable PostgreSQL stop/start.
- T04 migration/seed/constraints/role runner passed against the initial fresh local cluster.
- T04 live health runner passed 200 and 503/no-store/exact JSON on alternate ports.
- Running development backend returned 200/no-store for health, list, and summary through
  the unchanged limited-role Session Pooler configuration. Remote checks were read-only.
- Disposable PostgreSQL was stopped; remote transaction data was not modified or seeded.

## Repeat verification

From backend/: run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test`.
The real PostgreSQL integration test is explicitly skipped unless T06_DISPOSABLE_DATABASE_URL
is supplied. It accepts only loopback hosts and resets transaction data in that selected
database, so use a disposable database only, never retained development data.

Prepare a clean loopback database with both migrations using the existing T04 SQL runner,
then point T06_DISPOSABLE_DATABASE_URL at its administrative test connection. The API under
test connects separately as expense_tracker_app; the administrative test client only manages
fixtures and performs independent assertions. The existing local trust-auth fixture supports
that separate login without storing test passwords. The production pool retains verified TLS.

Next: T07 dashboard layout after completing the outstanding T03 Figma design.

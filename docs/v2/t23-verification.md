# T23 — Advanced transaction filters verification

**Status: Completed locally on 2026-10-08 (Africa/Cairo).** Nothing was applied remotely. Existing T20–T22 workspace work is preserved. T24 is ready and unstarted.

## Supported query and response

Authenticated GET `/api/v2/transactions` supports exactly q, type, accountId, categoryId, from, to, recurring. Absent values mean no corresponding filter. Only q trims whitespace and treats blank as omitted; other blank or whitespace-padded values are invalid.

- type: lowercase income/expense; explicit all is invalid.
- accountId/categoryId: canonical hyphenated UUIDs, case-insensitive syntax normalized lowercase. Owned accounts and owned/system categories are visible, including archived references.
- from/to: independent inclusive bounds, real YYYY-MM-DD within 1900-01-01–9999-12-31; reject from > to. Do not convert dates through timestamps or apply write-time Cairo-today restrictions. Future read ranges are accepted.
- recurring: manual means recurring_transaction_id IS NULL; generated means IS NOT NULL. Omit for both; all is invalid. Only stored transactions are listed, never scheduled forecasts or definitions.
- q: unchanged T22 case-insensitive literal description/account/category search, trimmed to at most 200 Unicode code points; preserve Unicode, literal wildcard escaping and PostgreSQL locale behavior.

Repeated keys, unknown keys, bracket/object/array notation, malformed enum/UUID/calendar values, impossible dates, reversed ranges, overlong/null-containing q return structured 400 VALIDATION_ERROR before database access. Original URL parsing keeps repeated parameters observable. Malformed encoded UUID/date/enum values fail their typed validation; q retains T22 URLSearchParams decoding behavior. Authentication precedes validation. All query parameters remain rejected on POST, detail GET, PUT and DELETE.

The existing response remains `{data, meta: {count}}`; count is the returned filtered collection length, which also equals the full filtered total before pagination. There is no separate COUNT query or cursor metadata. Public resources retain exactly the existing 14 fields, exact two-decimal money strings and no owner field.

## SQL composition and privacy

Reuse the T21/T22 SELECT, mapper and ownership-safe primary-key reference joins. Bind verified owner as $1; allocate subsequent parameter placeholders in a small internal bind function. Append only fixed predicate fragments for validated filter presence. All supplied filters combine with AND, outside the parenthesized description/account/category ILIKE OR group. Literal q escaping remains `ESCAPE '!'`, protecting percent, underscore and the escape character; raw input never enters SQL structure. Node maps returned rows and does not filter production transaction sets.

The frozen API explicitly requires **404 NOT_FOUND** for invisible filter references, overriding the task's preferred empty response where a frozen exception exists. Account visibility lookup includes user_id; category lookup includes system-or-same-user. Neither performs a global reference lookup, checks active status or exposes owner/name data. Foreign and nonexistent IDs return identical status/code/message/details and no-store headers, even with contradictory/future filters. No 403 or foreign-owner explanation is returned. Visible IDs without matching transactions return a normal empty 200 list. A visible expense-only category combined with income returns empty, without semantic category-kind validation.

The main transaction query still includes authenticated ownership independently of reference validation, and joins retain same-owner account/system-or-owned category safety. Archived historical references remain searchable/filterable. Primary keys ensure one output per transaction; tests independently check result uniqueness and metadata. Ordering is unchanged: transaction_date DESC, created_at DESC, id DESC, ready for T24.

## Functional and isolation evidence

Real local ES256/JWKS HTTP harness, production T09 authentication and expense_tracker_app SQL role. A/B tokens deliberately contain misleading metadata owners. Each new user has two accounts, expense/income custom categories, system references, multiple dates, income/expense and manual/generated postings with durable occurrence links.

- All **128 subsets** of the seven filters match an independently declared fixture oracle. This covers every individual filter, search+type/account/category, account+category, full date range, all filters, and OR-group precedence when account/category names match but descriptions do not.
- A/B each verify own results, no foreign search rows, both system category filters, type/category mismatch emptiness, and generated/manual discrimination. Both directions compare foreign and nonexistent account/category filters, including combinations with search/type/future range/generated.
- Test October 1, 15 and 31 boundaries in **2025**, keeping postings valid under the current 2026-10-08 write rule. Full-month ranges include both endpoints; same-day ranges include only that day; one-sided lower/upper bounds work. Future October 2026 and 9999 ranges validate and return empty. Leap-year/century, minimum/maximum calendar dates and invalid encodings are also unit/API-tested.
- UUID uppercase normalization works; exact 0.01, 0.10, 0.30 and 999999999.99 serialization is unchanged. Full resource keys, counts, uniqueness and no-store are checked throughout.
- Single-statement date/createdAt ties retain UUID DESC; existing T22 ordering probes also cover later createdAt and transaction date.
- Full financial snapshots, timestamps and totals are identical before/after read/error probes and after archived-history filters. No filter mutates financial state.
- Archive an account and custom category, then filter by each ID, combined IDs/search/date/type/manual, and generated: history remains visible. Delete an archived generated row through the existing API; its occurrence stays posted with the same owner/definition/date and timestamps except the existing updated_at change, and only generated_transaction_id is cleared. Manual/generated results remain correct afterward.
- Unit tests verify placeholder values, exact ownership predicates, grouped SQL structure, reference-lookup scoping and validation before SQL. Invalid enums, UUIDs, blank values, all repeated scalar fields, arrays/objects, unknown keys, limit/cursor, SQL-looking typed values and unauthenticated access are covered.

## Performance and index decision

Reuse T22's **10,000 additional transactions per owner**, two accounts/two categories each, plus functional fixtures; **20,081 stored transactions overall** after the T23 generated deletion. No second bulk fixture or speculative index is added. The earlier balance-plan 5,000 transaction/2,000 transfer fixture is separately measured then rolled back before search/filter plans.

ANALYZE the three reference/transaction tables as disposable administrator, then run runtime-role EXPLAIN `(ANALYZE, BUFFERS, FORMAT JSON)` on the **actual captured production list SQL and parameters**. Timings below cover the list SELECT, excluding the small ownership-reference prechecks and HTTP serialization.

| Representative filter | Returned rows | Planning ms | Execution ms | Transaction access |
|---|---:|---:|---:|---|
| User + February 1901 range | 784 | 2.413 | 2.440 | Index scan |
| User + account | 5,001 | 0.758 | 13.627 | Bitmap heap/index scan |
| User + category | 5,001 | 0.643 | 13.174 | Bitmap heap/index scan |
| User + expense + date | 784 | 0.706 | 2.699 | Index scan |
| q + date + account | 100 | 0.889 | 8.212 | Bitmap heap/index scan |

Plans used existing transactions_user_account_date_idx and transactions_user_category_date_idx, plus small reference scans/joins and deterministic sorting. The existing transactions_user_order_idx and transactions_user_type_date_idx also cover the frozen filter patterns; the planner need not choose a particular index to remain correct. Date/type-date cases chose account/date access through owned-account joins, without planner forcing. Existing indexes are sufficient at this scale; no migration/index/extension change was justified. These are single local warm-cache samples, not a production latency guarantee. B's scoped search/type/date/manual combination returns zero A rows on the same scale fixture.

## Quality results and disposable lifecycle

- Backend lint, typecheck, production build and explicit runner ESLint passed.
- Full backend suite selecting only T23_DISPOSABLE_DATABASE_URL: **67 tests, 53 passed, 0 failed, 14 environment-gated skips**. All five T23 tests ran.
- Selected fresh integration passed **3,263 T23 grouped checks**, **599 T16 isolation**, **263 account**, **285 balance/summary**, **244 T21 CRUD**, and **263 T22 search** checks. Counts include grouped resource/money assertions and are not HTTP request counts. Existing T21 four locking races and three post-write rollback faults also passed.
- Real V1 list/detail/filter/summary reads and ownerless-create rejection passed in the shared T16/T21 regression. No V1 implementation changed. Standalone environment-gated suites skipped by this selection are not claimed as separately rerun.
- No frontend source, dependency/lockfile, schema, grants, authentication implementation or transaction mutation logic changed for T23. No frontend suite required.

Use only an ignored workspace copy `.tmp-v2-t23/pgdata-copy` of the stopped synthetic T11 PostgreSQL 17.11 cluster on 127.0.0.1:55451. Windows fresh-initdb limitations are unchanged from T21/T22. The reset helper verifies exact data_directory before replacing only the copy's postgres database and local fixture roles; original cluster directories remain unchanged. Fresh setup applies two V1 migrations, four T11 migrations, T12 reference seed and T15 constraints. Twelve synthetic Auth identities exist after this expanded run. The disposable cluster was stopped after verification; no hosted access or .env fallback occurred.

Reproduce by building backend, preparing a fresh password-free loopback fixture, explicitly setting `T23_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55451/postgres`, and running `npm --prefix backend test`. Select only one fresh-cluster suite per database. Shared T16/T21/T22 integration now includes T23; the guard rejects initialized/remote/credential-bearing databases. Stop the cluster after the run.

## T23 file inventory and next task

Created:

- backend/tests/v2-filters.test.mjs
- backend/tests/helpers/v2-filters.mjs
- docs/v2/t23-verification.md

Updated:

- backend/src/types/v2-transaction.ts — typed seven-key filter contract
- backend/src/validators/v2-transaction.ts — strict typed scalar/date validation
- backend/src/services/v2-transactions.ts — scoped reference visibility and bound predicates
- backend/tests/v2-transactions.test.mjs and tests/helpers/v2-transactions.mjs — unsupported probes now use invalid filter values
- backend/tests/v2-search.test.mjs and tests/helpers/v2-search.mjs — preserve T22 rejection checks using invalid values now that valid filters are supported
- backend/scripts/verify-v2-isolation.mjs — include T23 in the shared real-auth regression
- docs/v2/06-api-design.md and 07-implementation-plan.md — current exact semantics/checkpoint
- .gitignore — local disposable T23 artifacts

No genuine T23 blocker remains. T24 cursor/limit/signing/nextCursor/navigation stays unstarted; T25 real Transactions frontend stays unstarted. No production/remote changes were applied. Ready for **T24 — Add Cursor Pagination**, without implementing it.

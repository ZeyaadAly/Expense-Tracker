# T22 — Server-side transaction search verification

**Status: Completed locally on 2026-10-08.** No remote database access, production migration, seed, deployment or backfill was performed. T23 is ready and unstarted. Existing T20/T21 workspace work was preserved.

## Search contract and validation

Authenticated `GET /api/v2/transactions?q=<text>` accepts only optional q. Parse the original URL to retain repeated keys and reject bracket/object/array query shapes. URL values are strings, so `q=null` searches the literal word rather than representing a JSON null. Trim outer whitespace; missing, empty and whitespace-only values return the normal list. Accept at most 200 Unicode code points after trimming, including 200 supplementary-plane emoji; reject 201. Reject repeated q (including repeated empty values), unknown keys and null characters with the existing 400 VALIDATION_ERROR envelope before SQL. PostgreSQL text cannot represent a null byte. Authentication still precedes query validation.

Matching fields are transaction description, account name and category name. Do not search money, resource/owner IDs, JWT claims or unrelated metadata. POST, detail GET, PUT and DELETE still reject all query parameters. Type/account/category/date/recurring filters and limits/cursors remain unsupported.

The response stays `{data, meta: {count}}`, with the same explicit 14-field transaction resources, exact decimal-string money, nullable immutable recurring linkage and no public userId. Search returns every matching owned row until T24 adds pagination.

## SQL, ownership and history

The existing list SELECT, mapper and joins are reused. Bind verified user identity as $1 and the search pattern as $2. Add one parenthesized OR predicate for the three fields after `t.user_id=$1`, retaining account same-owner and category system-or-same-owner join predicates. Search executes in PostgreSQL; Node only maps returned resources.

Use ILIKE with fixed `ESCAPE '!'`: prefix each `%`, `_` and `!` in user text with `!`, then add the server-owned leading/trailing `%` for substring matching. Backslashes and single/double quotes remain ordinary bound text. No raw q enters SQL structure. These semantics follow [PostgreSQL pattern matching](https://www.postgresql.org/docs/17/functions-matching.html).

Real ES256 JWT/JWKS HTTP tests use A/B tokens with misleading metadata owners. B searching A-only description, account and custom-category terms receives ordinary empty 200 lists; reciprocal B-only terms are hidden from A. Repeat isolation with 10,000 additional rows per owner. System categories and owned custom categories match; account/category primary keys keep each transaction unique, verified by result IDs and counts. There is no archive-status restriction in historical read joins, and archived account and category names still find the owner's transaction.

Injection-looking strings were stored and then matched literally, including `' OR 1=1 --` and `%'; DROP TABLE expense_tracker.transactions; --`. Percent/underscore controls distinguish literal punctuation from wildcard matches; the latter SQL-looking string contains a literal underscore too. Quotes, backslashes, doubled backslashes, `!` and combined `! 20%_` match expected fixtures. Full financial rows/timestamps/totals/balances before and after search and validation failures are identical. Subsequent scale inserts/queries confirm the table remains intact.

## Unicode and ordering

Arabic descriptions/account/category names, accented Latin descriptions and reference names, mixed-case English and a 200-emoji description match successfully. Preserve accents and code points without normalization or accent folding. ILIKE uses PostgreSQL's locale-dependent case behavior; this is not a promise of language-independent case folding.

All lists and searches retain `transaction_date DESC, created_at DESC, id DESC`. Fixtures separately test later transaction date, later createdAt on the same date, and identical date/createdAt ties from one multi-row insert, resolved by UUID DESC. Missing/blank q returns byte-equivalent parsed resources and ordering to the basic list. No relevance ordering was added.

## Performance

PostgreSQL 17.11, disposable loopback cluster, normal existing indexes, limited expense_tracker_app runtime role. Add **10,000 transactions each for A and B**, spread over two accounts and two custom categories per owner, plus smaller functional fixtures, for 20,056 stored transactions overall. The earlier balance regression separately measures 5,000 transactions and 2,000 transfers inside a rolled-back fixture; these are absent during search measurements. ANALYZE runs as disposable administrator; EXPLAIN `(ANALYZE, BUFFERS, FORMAT JSON)` runs as the runtime role on the actual production service SQL and bound parameters.

| Search / owner | Rows | Planning ms | Execution ms |
|---|---:|---:|---:|
| A-only scale description / A | 100 | 2.676 | 18.299 |
| A-only scale description / B | 0 | 0.815 | 16.359 |
| B-only scale description / B | 100 | 0.832 | 15.189 |
| Salary account name / A | 5,001 | 0.804 | 24.102 |
| Transport category name / A | 5,001 | 0.802 | 28.188 |

Planner selected sequential transaction scans with the ownership filter in SQL, hash joins against small references, and in-memory quicksort using the required ordering. The A scan retained 10,023 owned rows and removed 10,033 others before name/description matching. Reference joins are inner-unique. Search owner filtering does not require an index scan to remain secure. Existing owner/order indexes are available; scanning is reasonable at this fixture's size and owner selectivity. No temporary disk blocks were used. These single local warm-cache measurements support simple ILIKE at current personal-finance scale; they do not establish production latency or broad-term response/serialization cost. No index, pg_trgm, full-text extension or schema change was justified or added.

## Verification and reproduction

- Backend lint, typecheck, production build and explicit ESLint of the updated isolation runner passed.
- Full backend suite with only T22_DISPOSABLE_DATABASE_URL selected: **62 tests, 49 passed, 0 failed, 13 environment-gated skips**. All four T22 tests ran, including its fresh integration.
- The selected fresh integration passed **263 T22 search checks**, **599 T16 isolation checks**, **263 T17 account checks**, **285 balance/summary checks**, and **244 T21 transaction checks**, including the existing transaction four concurrency races and three post-write rollback faults.
- T16/T21 real V1 list/detail/filter/summary reads and ownerless-write rejection passed within that integration. V1 implementation and its existing production cutover boundary are unchanged. Skipped standalone environment-gated suites are not claimed as separately rerun.
- No frontend source changed; no frontend suite was required. No dependency/lockfile, auth implementation, migration, privilege grant or financial mutation logic changed for T22.

Only an ignored workspace copy of the stopped synthetic T11 cluster was used, at 127.0.0.1:55451. As in T21, Windows prevents fresh initdb loading; reuse the test-only cluster files. Verify exact data_directory is the T22 copy before resetting only its postgres database and fixture roles to an empty template0 database. Original cluster directories remain unchanged. Guarded integration applies two V1, four T11 and one T15 migrations, the existing T12 system seed and synthetic users. The full verifier has ten synthetic Auth identities after T22. The cluster was stopped after verification.

To rerun: build backend; create a fresh isolated password-free loopback database; explicitly set `T22_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55451/postgres`; run `npm --prefix backend test`. No application .env is loaded by the integration harness and no hosted fallback exists. The fixture rejects an initialized database; reset only a verified disposable copy or start another empty cluster before rerunning. The shared T16/T21 runner now includes T22 checks too; select only one fresh-cluster suite per database.

## T22 file inventory and deferred scope

Created:

- backend/tests/v2-search.test.mjs
- backend/tests/helpers/v2-search.mjs
- docs/v2/t22-verification.md

Updated for T22:

- backend/src/validators/v2-transaction.ts — strict list q validation
- backend/src/routes/v2-transactions.ts — GET list query wiring
- backend/src/services/v2-transactions.ts — bound literal search predicate
- backend/tests/v2-transactions.test.mjs and tests/helpers/v2-transactions.mjs — T21 rejection probes now use malformed q shapes
- backend/scripts/verify-v2-isolation.mjs — shared search integration extension
- docs/v2/06-api-design.md and 07-implementation-plan.md — current search semantics and checkpoint
- .gitignore — disposable T22 artifacts

No genuine blocker remains. Advanced filters stay T23, signed cursor pagination stays T24, and real Transactions frontend wiring stays T25. Search is designed to compose with these later stages; none was started. No remote/production changes were applied.

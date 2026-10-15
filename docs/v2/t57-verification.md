# T57 — Full Backend Regression

**Status: Completed locally, 2026-10-15 (Africa/Cairo).** Started on clean `main`, synchronized with `origin/main`, at `7093754c5edc9c40a4dd0ec46de88b6b56c29f46`. T50–T56 remain optional/deferred. T58 is unstarted. Hosted financial acceptance remains intentionally deferred.

## Environment and source isolation

Windows, Node 24.19.0, npm 11.17.0, PostgreSQL 17.11, UTF-8. A new cluster was initialized under ignored `.tmp-v2-t57/pgdata`, listening only on `127.0.0.1:55451`. No retained cluster/production restore was reused. Administration uses a password-free local postgres connection; application verification uses `expense_tracker_app` and real ES256/JWKS middleware with synthetic A/B identities.

A `git archive` snapshot of the starting SHA was extracted under `.tmp-v2-t57/source`. `npm ci --offline` installed committed locked dependencies from the local cache. The backend's T10 transport test also imports the frontend TypeScript loader, so the snapshot's frontend locked dependencies were installed for that backend test. No frontend regression task was performed. Only the audited T57 verifier scripts and the Analytics test-directory correction were copied into this snapshot. Application source, runtime entry points, dependency lockfiles and migration SQL are unchanged.

## Fresh migrations, seed and privileges

The current eight-file migration inventory, ordering and SHA-256 hashes are recorded in [migration inventory](assets/t57/migration-inventory.json): two V1 foundation/role migrations; four T11 core/reference/index-trigger/runtime-grant migrations; T15 ownership constraints; T32 occurrence invariants. Full P0 fixtures apply this chain in order, with the nine-category reference seed before ownership constraints. No SQL patch or remote migration is required.

Each matrix initializer runs against a newly recreated empty database and cleared application/browser roles within this new cluster. Reset refuses remote URLs, credentials/options, an unexpected data directory, or live preceding test connections. Full system preparation is repeated independently. Historical V1 and T12 suites deliberately use their documented earlier schema stages; their delete-based cleanup is not applied to T15 archive-only parents.

T11 catalog/reversal checks pass (339 checks). T15 includes the T14 backfill/rollback rehearsal (64 T14 checks), 210 ownership checks and 15 corruption/preflight probes. IDs, amounts, dates and timestamps remain reconciled. No unvalidated constraints remain. Reapplying the reference seed twice preserves complete rows/timestamps, stable IDs and exactly nine system categories; shared Other remains `both`.

The runtime role is nonsuperuser, NOINHERIT, without role/database creation or BYPASSRLS. Actual denied statements cover DDL, TRUNCATE, constraint/trigger changes, CREATE ROLE, role/session escalation, schema ownership changes and Auth reads. anon/authenticated lack private schema/table/function access, and PUBLIC has no private-function EXECUTE. Core security remains the frozen Express owner predicates plus composite ownership keys/triggers; this does not claim tenant RLS on the shared runtime connection.

## Test selection and pass summary

The complete general backend suite passes: **132 tests, 104 passed, zero failures, 28 explicitly database-gated entries**. Separate fresh runs cover those database gates; skipped wrappers are not counted as executed tests. **17 fresh-database runs pass 57 test groups with zero skips.** Some unit groups repeat within focused suites; counts are not presented as a unique combined test total.

| Fresh run | Test groups passed | Coverage |
| --- | ---: | --- |
| Legacy | 12 | Four T06-gated V1 CRUD/filter/summary/persistence groups plus their units |
| Schema | 1 | T11 catalog, constraints, reversal, privileges |
| Migration/ownership | 2 | T15 plus embedded T14 rehearsal |
| Category reads | 2 | T12 seed, filters, isolation, private privileges |
| Profile | 3 | T13 bootstrap, concurrency, defaults, update, injection |
| Shared isolation/concurrency | 2 | T16/T17/T18/T21/T22/T23/T24/T26 helpers once, T27 races, recurring/Analytics/Budget/Goal/category isolation extensions |
| Recurring definitions | 3 | T29 lifecycle, dates, parent checks, ten races, eleven rollback faults |
| Occurrence ledger | 2 | T32 reservation, linkage, terminal states, six faults, lost acknowledgement |
| Processor | 3 | T31 limits, catch-up, contention, crash/lost-ack recovery, scale |
| Cron orchestration | 5 | T33 local HTTP authentication, deadlines, overlapping/cold/lost-response delivery; no cron activation |
| Dashboard | 4 | T36 five periods, exact totals, snapshot consistency, 30k scale |
| Analytics direct | 3 | T38 summary/series/breakdowns/activity/forecast and read-only snapshot |
| Analytics HTTP | 3 | T39 real HTTP/JWT version of the same fixture matrix |
| Budgets | 4 | T42 CRUD, derived progress, transaction effects, isolation and faults |
| Budget status | 2 | T43 23 boundaries and six concurrent visibility cases |
| Goals | 4 | T45 lifecycle, manual progress, metadata-only links, races/faults |
| Custom categories | 2 | T48 lifecycle, duplicate/kind rules, seven races, four rollback probes |

All 28 general-suite database gates map to this table. T14 is executed inside T15; nine shared fresh-initializer wrappers (T16/17/18/21/22/23/24/26/27) share one combined run instead of rebuilding their identical large fixtures nine times. The 14 T30 recurrence-calculator tests run in the full suite. Results are in [matrix results](assets/t57/matrix-result.json) and [overall result](assets/t57/result.json).

## Domain and financial matrix

Auth tests cover absent/malformed tokens, signature/algorithm/subject/role/issuer/audience/expiry failures, A/B validity, misleading editable metadata, JWKS rotation/failure and safe 503 behavior. Profile bootstrap is idempotent under concurrency, defaults are EGP/en/Africa/Cairo, only displayName can change, and owner injection is rejected.

System/custom categories, immutable system rows, case-insensitive custom uniqueness across archived names, permitted system-name collisions and referenced-kind locks pass. Accounts pass create/list/detail/edit/archive/restore, permanent opening/card-semantics locks, negative assets and overpaid cards. T18 verifies asset `opening + income - expenses + incoming - outgoing`, card `opening + expenses - income + outgoing - incoming`, and net assets minus debt across all four transfer type combinations and archived accounts.

Transaction CRUD preserves exact amounts, date-only values, generated identity and durable deleted-generated history. Search matches description/account/category names with literal `%`, `_`, `!`, quotes, backslashes, accented text, Arabic and emoji; SQL-looking strings remain bound text. All 128 subsets of the seven filters preserve AND composition and ownership-safe reference validation. Pagination verifies default 25/max 100, six-digit timestamp boundaries, deterministic tuple ordering, signature/user/filter/resource/limit binding, expiry/tampering/rotation and 10,023 rows across 101 pages. Insert/delete/edit cases follow frozen keyset membership semantics; pagination is not an immutable snapshot.

Transfers preserve net position and remain excluded from posted income/expenses. Recurring definitions have no financial effect until a generated posting. Calculator tests cover daily/weekly/monthly/yearly anchors, Jan31 clamp, leap-day/century rules, inclusive end dates and resume skips. Ledger and processor tests verify unique dates, terminal transitions, explicit failed retry, immutable generated links, 100-per-definition/1,000-per-invocation ceilings, catch-up continuation and repeated/concurrent processing.

All five Dashboard periods reconcile income/expenses/savings with Analytics over the same inclusive range. Analytics covers the 366-day bound, monthly zero filling, category distributions, account movements, daily averages, nullable savings rate, recurring forecast, generated posting/deletion and transfer exclusion. Budget tests cover exact/proportional progress, custom thresholds, normal/near-limit/exactly 100%/exceeded states, create/edit/move/delete/generated expense effects and archived history. Goals cover zero/exact/over-target manual savings, explicit completion/reopen/archive and metadata-only account links.

Money cases include 0.01/0.10/0.20/0.30/999999999.99, unrestricted aggregates above the per-input ceiling, negative derived values, card overpayment, budget overrun and goals above 100%. Date cases include date-only round trips, Cairo midnight, leap dates, month/year boundaries, inclusive ranges and recurrence anchors. Financial arithmetic remains in PostgreSQL NUMERIC; no application calculation was rewritten.

## Integrated cross-domain A/B gate

The new system verifier passes **829 counted checks** across three separate Node processes (670 initial, 103 recovery, 56 terminal). Each owner has a profile, custom category, cash/bank/card accounts, income/expense transactions, transfer, recurring definition, budget and goal. Misleading JWT metadata cannot choose ownership. Reciprocal body/query/path/nested-metadata injections fail, and foreign/missing account, transaction, transfer, recurring, budget, goal and category mutations return identical frozen-policy errors. Public snapshots contain no other user's private IDs.

One custom category is used simultaneously by a transaction, recurring definition and budget. Rename updates historical labels; kind change is rejected; archive preserves history/budget progress and pauses recurring; new transaction/recurring/Budget creation rejects the archived category. Restore admits new activity and leaves recurring paused. One account is used by transactions, a transfer, recurring and goal metadata. Archive retains history, balances and goal linkage, pauses recurring, and blocks new financial activity; restore leaves it paused and admits new activity.

The independent fixture oracle reconciles each user's net position to **129.89**, card debt **19.70**, posted expenses **0.21**, Budget remaining **-0.01** / **105.00%**, and manually saved Goal **133.33%**. Lifecycle/profile/category changes preserve the financial oracle and B's entire public snapshot. A temporary maximum-value transaction is posted/deleted exactly. New and historical references remain coherent across all domains.

## Concurrency and rollback

Coverage reuses the existing finite high-value matrices; it does not claim exhaustive scheduling of every possible interleaving. T27 includes 29 forced races, all four transfer directions, opposing pairs, 20 stress rounds/180 successful mutations, six faults and uncertain-COMMIT checks, with zero observed deadlocks. T26 additionally covers 11 races/11 faults; accounts 4 races/2 faults; transactions 4 races/3 faults; recurring 10 races/11 faults; processor 12 races/12 rollback/lost-ack probes; Goals 10 races/6 faults; categories 7 races/4 faults. T32 has six rollback probes. Budget CRUD rollback and six T43 committed/rolled-back visibility cases pass. T33 covers three overlapping delivery races and a lost HTTP acknowledgement.

Injected failures occur after real writes, not only before SQL validation. Reconciliation compares original rows, references, timestamps, ledger states and financial totals after rollback. No partial committed state or duplicate generated transaction was observed.

## Restart and persistence

The initial system process commits a pending occurrence and full A/B snapshots, then stops PostgreSQL while its Express/JWT server and limited Pool remain alive. A profile request returns sanitized 503. Restarting PostgreSQL lets the same application pool reconnect; all durable rows, public snapshots, reservation identity and signed cursor continuation match exactly.

Windows ends a PostgreSQL child with its verifier process job, so the orchestrator owns a replacement server for the separate recovery processes. This also exercises PostgreSQL WAL recovery before the next process compares the saved snapshots. The second Node process recovers the pending occurrence once, observes idempotent repetition, deletes the generated transaction and persists its posted-null marker. A third Node process verifies that marker and posts zero on another processor run. Cursor continuity and full application state do not depend on the original services, pool, API port, JWKS cache or process memory. All local PostgreSQL/API/JWKS helpers are stopped afterward.

## Configuration, HTTP and secret review

**33 safety checks pass.** Configuration probes run only in the isolated snapshot with no `.env`, and use synthetic values without connecting to a hosted database. DATABASE_URL, PORT and CLIENT_ORIGIN failures are safe; CA-file resolution and `rejectUnauthorized:true` are checked; all five URL TLS override parameters are rejected. SUPABASE_URL/Auth, cursor-key and CRON_SECRET failures remain independently fail-closed through their existing lazy boundaries, preserving public health rather than inventing a new startup contract.

HTTP verifies no-store, strict method/body/query boundaries and sanitized errors. CORS grants the configured exact origin and does not reflect an attacker origin or grant credentials; an untrusted-origin request need not receive an HTTP 403 for the browser to deny it. Limited-role and browser-role checks are described above. Pattern scanning covers source, examples, docs, migrations and compiled output: **336 files, zero recognized secrets**, nine documented/synthetic credential placeholders classified separately. No values are printed for findings. Final diff/artifact review excludes private environments, synthetic JWTs, cursors and raw database snapshots from committed evidence.

## Performance smoke

These are local synthetic observations, not hosted latency guarantees. Existing query plans are retained in the [matrix results](assets/t57/matrix-result.json); compact measurements are in [performance evidence](assets/t57/performance.json).

| Representative case | Measurement |
| --- | --- |
| Account balances, 5k transactions/2k transfers | DB execution 6.67 ms |
| Search, 20k additional A/B rows | DB execution 42.92–55.71 ms for reference/description probes |
| Deep cursor after 50 pages | DB execution 3.03 ms; search pagination 129.39–142.26 ms |
| Mixed integrated transfer HTTP requests | median 16.28 ms, including CRUD/error paths |
| Processor, 1k posts /2k definitions /40 users | isolated rerun 8,120 ms; due selection 0.94 ms |
| Dashboard, 30k transactions | median 15.35 ms |
| Analytics, 30,023 transactions | direct median 59.22 ms; HTTP median 88.75 ms |
| Budgets, 30,012 transactions /777 budgets | median 13.55 ms |
| Goals, 10k total /2k owned rows | list 35.49 ms |
| Categories, 1k owned rows | list 17.05 ms |

The first processor sample took 30,178.9 ms while clean dependency installation/other tests competed for resources. An isolated repeat of the same 403-check suite completed 1,000 posts in 8,120 ms, compared with the historical 9,547 ms observation. No material application regression or concrete new index requirement was established; no speculative optimization was made.

## Findings, limitations and production boundary

The clean source run discovered a test-only defect: Analytics wrote its performance JSON into a directory left by previous local runs. The existing integration now creates that directory recursively; both direct and HTTP modes pass from clean directories. No application-code defect was found. Backend lint/typecheck/build, full suite, focused verifiers, explicit script ESLint, whitespace review and secret review pass.

Supabase identities/JWKS are synthetic and PostgreSQL is local. Production TLS options are validated without an external TLS handshake. Actual hosted Auth/financial acceptance, production restore certification and hosted timing are intentionally outside T57. P1 notifications/reports/exports remain absent and deferred. These boundaries do not block this local P0 backend gate.

No remote database operation, production write, environment change, manual deployment, gate removal or cron activation occurred. Production entry points, frontend gate, migration SQL and lockfiles are unchanged. `backend/vercel.json` retains an empty cron list; category-management enablement remains absent from the Vercel entry point. T58+ are not marked complete.

## Reproduction and files

Create a new isolated source snapshot, install both committed lockfiles for backend/shared-loader support, and run backend lint/typecheck/build/full tests there. Initialize a new UTF-8 PostgreSQL 17 cluster at loopback port 55451 under a directory named `.tmp-v2-t57/pgdata`; do not use a retained database. Build before verification because services are imported from `dist`.

Set only `T57_DISPOSABLE_DATABASE_URL` to the password-free local postgres URL; set `T57_DATA_DIRECTORY` to that new cluster, `T57_PG_BIN` to the PostgreSQL binary directory and `T57_OUTPUT_DIRECTORY` to an ignored `.tmp-v2-t57` directory. Run `node scripts/verify-v2-backend-regression.mjs` from the snapshot backend, then `node scripts/verify-v2-backend-safety.mjs`. The runner guards the data directory before destructive resets, applies the staged/current migrations, runs the 17 matrix suites and three system phases, and stops PostgreSQL after the system gate. Windows portable PostgreSQL binaries are used for restart. Optional `T57_MATRIX_ONLY=1`, `T57_SYSTEM_ONLY=1` and `T57_FROM_SUITE=<label>` support inspected recovery without repeating passed suites.

Added three backend verifier scripts and this report/evidence. Updated the Analytics integration's evidence-directory setup, ignore rule, README and implementation plan. Synthetic data/raw logs remain ignored. **Next core task: T58 — Full Frontend Regression. It was not started.**

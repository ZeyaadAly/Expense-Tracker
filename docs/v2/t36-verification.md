# T36 — Dashboard Aggregate API

Date: 2026-10-12. **Completed locally for the authorized authoritative core stage.** Full P0 chart/budget/goal previews still depend on future domain services. T37 was not started; no frontend, V1 behavior, schema, migration, grant, environment secret, hosted data or deployment changed. Earlier uncommitted T33/T34 work is preserved.

## Contract and domain reuse

GET `/api/v2/dashboard` accepts only optional `period`, default `this_month`, and requires T09 JWT authentication. Data is scoped solely by verified req.auth.userId. Strict original-URL parsing rejects repeated/unknown/bracket keys, empty/invalid periods and supplied owner/date/limit parameters. Both local and Vercel entry points register the service. Responses retain no-store and safe shared errors; supported method is GET only.

Period resolution captures Cairo today once, then uses PostgreSQL calendar dates and inclusive boundaries. `this_month` starts at the current month's first day and ends today; `last_month` covers the complete previous month; `3_months`, `6_months`, `1_year` start at the first day 2/5/11 months before the current month and end today. No browser date or financial calculation is involved.

The T18 repository's existing grouped balance CTE and net-position projection now also expose assets and signed card debt. The formula is not copied. `summary.totalBalance` is T18 net position; assets include signed balances of non-card accounts, cardDebt includes positive debt and negative overpayment. All include archived accounts. Account resources reuse T18 mapping, exact currentBalance and createdAt ASC/id ASC ordering. Balances are all-history, independent of selected period.

The reusable V2 transaction-totals read returns PostgreSQL NUMERIC income, expenses and netSavings for owned posted transaction dates in range. T21 has no separate existing V2 period-summary service; V1's unscoped compatibility summary remains unchanged. Money is SQL numeric text, normalized by the existing string formatter. Transfers, definitions and reservations are absent from period actuals; persisted generated transactions count once. Deleting a generated transaction removes its financial effect while preserving the posted marker.

Recent transactions reuse the existing T21 projection and public mapper, ordered transaction_date DESC/created_at DESC/id DESC, maximum five. This global owned-history preview is independent of selected period and requires no cursor signing secret. Upcoming extracts the existing T29 read into a composable helper using the unchanged T30 calculator. Horizon is Cairo today through today+29 inclusive; first five occurrences ordered date then definition UUID. Only active definitions/parents qualify; posted/skipped dates are omitted, including deleted generated postings. The dashboard caps per-definition candidates at five before the shared final ordering; T29's full projection retains its existing behavior.

`meta.stage=core` and `meta.deferred=[incomeVsExpenses,budgets,goals]` explicitly identify absent future-domain sections. They are omitted rather than represented by fake empty financial previews. T38 owns chart calculations; T42/T43 budgets; T45 goals. Savings rate/averages are not fields of this staged summary, so no fabricated percentage is returned. API design section 17 documents the full example and staged boundary.

## Snapshot, isolation and exactness

One checked-out pg client owns a read-only REPEATABLE READ transaction covering range, position, accounts, totals, recent transactions and upcoming definitions/terminal markers. Eight SELECT statements execute serially on that single client, followed by COMMIT. No internal HTTP calls, domain-service pool waterfall, writes, row locks or retries occur. Failure rolls back; rollback failure discards the client. Keeping SQL serialized respects pg's connection protocol and avoids deprecated concurrent client.query calls.

The fresh synthetic A/B API uses real local ES256/JWKS verification and the actual limited expense_tracker_app role. No hosted authentication is contacted. Dashboard net position and account resources reconcile with T18; each recent resource reconciles with T21; upcoming equals the first five T29 occurrences; all five period actuals reconcile with independent SQL. A's payload excludes B's financial rows, names and schedule. B's cards-only snapshot remains independent. Metadata claiming another owner cannot affect verified identity.

Fixtures cover empty, opening-only, mixed assets/cards, archived-only expense account, cards-only, positive debt, negative overpayment and negative assets; 0.10+0.20=0.30; negative net savings; exact 1999999999.98 period income; boundary dates; four transfer directions with unchanged net position and income/expenses; generated posting then deletion with retained marker; global recent preview and timestamp/UUID ties; active/paused/archived schedules; inactive account/category parents; terminal markers; inclusive upcoming horizon and exclusion just beyond it. Read-only full financial snapshots remain identical.

A forced concurrent commit after snapshot acquisition inserts income, changes an account name and pauses a schedule. Every section returns the complete old state; the next request returns the complete new state. The test inspects actual REPEATABLE READ and transaction_read_only=on. A separate writer's uncommitted updates remain invisible and rollback produces no drift. No sleeps are used to infer snapshot consistency.

Calendar tests cover all five resolved periods, January/year rollover, leap February, and both sides of Cairo midnight while UTC is still the previous day. SQL DATE strings are never converted through JavaScript timestamps. Zero-income users receive exact zeros or negative net savings as applicable; no undefined percentage field is fabricated.

## Local performance

PostgreSQL 17 disposable workload: 20 scale owners, 30,000 transactions, 2,000 transfers, 1,000 recurring definitions, in addition to correctness fixtures. Runtime queries use expense_tracker_app; admin performs only fresh setup, migration application and ANALYZE. Twelve warm service calls measured **10.87 ms minimum, 12.65 ms median, 20.64 ms maximum** in the recorded run. These measure local service/database latency, not hosted network/JWT latency.

Exact production SELECT statements were captured with runtime-role EXPLAIN ANALYZE/BUFFERS:

| Section | Execution ms |
|---|---:|
| Position | 1.259 |
| Period totals | 0.073 |
| Account resources | 1.095 |
| Recent five | 0.097 |
| Upcoming definitions | 0.191 |
| Terminal markers | 0.021 |

Existing user/account/date and user/order indexes support the workload. Small account/marker tables appropriately use sequential scans; no external sort spill or concrete bottleneck justified an index migration. Full local plans and timings are retained in [performance evidence](assets/t36/performance.json). No speculative index was added. Balances intentionally remain authoritative all-history reads; this local test does not claim constant cost for unlimited history.

## Validation and reproduction

- Backend lint, typecheck and build pass.
- Full backend suite: 112 tests, 89 passed, 23 database-gated skips, zero failures; the required gated integrations were run separately on fresh copies as listed below. All 14 T30 calculator tests pass in the full suite.
- T36: four tests pass, including 214 grouped integration checks, with no gated skip in its dedicated fresh run.
- Fresh T31: three tests, 403 checks, 12 races and 12 rollback/recovery probes pass.
- Fresh T32: two tests, 103 checks pass.
- Fresh T29: three tests, 357 checks, 10 races and 11 rollback faults pass.
- Fresh T18/shared regression: three tests pass; T16 599, T17 263, T18 285, T21 244, search 263, filters 3263, pagination 6065, T26 917 and recurring isolation 31 checks, zero failures.
- Source/docs/compiled-backend credential scan and git diff --check pass. No credential values are printed or stored in evidence.

Initialize a **fresh disposable** password-free local PostgreSQL cluster at 127.0.0.1:55451, database postgres, role postgres. Build backend, set only `T36_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55451/postgres`, then run `node --test tests/dashboard.test.mjs` from backend. The initializer refuses existing app/Auth schemas and runtime/browser roles, and applies only existing migrations through T32 plus the system seed. Each other gated suite needs its own fresh database. Never point these initializers at retained development or hosted data. The ignored `.tmp-v2-t36` runner verifies the exact disposable data directory before resetting its own database. The disposable cluster is stopped after verification.

## Files and next boundary

Added dashboard route, service and query validator; reusable V2 transaction totals; focused tests; this report and performance evidence. Updated T18 position projection, T21 bounded recent helper, T29 composable upcoming helper, app/local/Vercel wiring, shared local Auth harness, architecture/API/plan documentation and the ignored scratch directory. No frontend files were changed by T36.

Core backend data is ready for a staged **T37 — Build V2 Dashboard UI**. Full P0 dashboard acceptance still waits for its documented analytics, budget and goal dependencies. No local core blocker remains. T35 remains optional/deferred; T37 is not implemented.

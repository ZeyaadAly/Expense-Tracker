# T45 — Build Goal Backend

**Status: Completed locally, 2026-10-13 (Africa/Cairo).** Started from clean synchronized main at `7f383dbe656a4e0acaefecc5c89673fae0284b56`. T46 — Build Goals Page remains unstarted. Production-preview financial acceptance remains **partial / intentionally deferred**. No remote database, Auth account, environment, cron or manual deployment change occurred.

## Frozen contract and routes

Authenticated development routes, relative to `/api/v2`:

| Method | Route | Result |
| --- | --- | --- |
| GET | `/goals` | All owned statuses by default; optional single status filter; count metadata |
| POST | `/goals` | Create active goal; 201 and Location |
| GET | `/goals/:id` | Owned resource; safe404 for foreign/missing |
| PUT | `/goals/:id` | Full editable fields, including explicit active/completed status |
| POST | `/goals/:id/complete` | Explicit funded completion; idempotent200 |
| POST | `/goals/:id/archive` | Active/completed to archived; idempotent200 |

API§§56–61, database§24 and PRD§16 resolve illustrative alternatives in the task: **remainingAmount is max(target-saved,0)**; reopening is **full PUT status active**, with no separate `/reopen` endpoint. No DELETE/restore/history/projection endpoint, linkedAccountName, completionSuggested or completed/archive timestamp is added. The resource contains id/name/targetAmount/savedAmount/remainingAmount/percentComplete/targetDate/linkedAccountId/status/createdAt/updatedAt, with no userId. List order is createdAt DESC then id DESC.

## Manual money, validation and completion

savedAmount is always manually supplied. Optional linkedAccountId is reference metadata; account balance, income/expense transactions, transfers and net position never calculate savings. Target is a positive exact decimal string0.01–999999999.99; saved accepts0.00–999999999.99. At most two fractional places, canonical decimal syntax; numbers, signs, exponent notation, whitespace, leading zeros, overprecision and overrange fail400. No financial JavaScript float arithmetic.

Names trim and accept1–120 Unicode code points without truncation; NUL/unpaired surrogates cannot be stored in PostgreSQL and fail validation. Optional POST date/link default null. Full PUT explicitly requires all six editable fields. Date-only targetDate permits past/today/future valid days1900-01-01–9999-12-31, including correct leap centuries; no transaction-style Cairo-today restriction applies. Nullable links use normalized canonical UUIDs. Unknown/owner/server fields and unknown/repeated/bracketed query keys reject before SQL. Only active/completed/archived status filters are accepted.

PostgreSQL NUMERIC calculates remaining and unbounded percentComplete; `round(saved*100/target,2)` supplies two decimal places with ties away from zero, as documented by [PostgreSQL](https://www.postgresql.org/docs/17/functions-math.html). Tests include0.10/0.30→33.33%,0.20/0.30→66.67%, exact100%, above100%, zero, maximum inputs, a9999999999900.00% result and the0.125→0.13 tie. List/single/mutation responses share one projection and string-only formatting.

An active goal remains active at/above target. A future UI may suggest completion using **exact savedAmount >= targetAmount**, not rounded percentComplete:9999.99/10000.00 displays100.00% but completion still rejects409. No extra suggestion field is invented. Explicit complete or PUT completed requires actual funding. Completed goals may be edited while still funded; lowering savings requires explicit active status in the same PUT. Archived goals reject PUT/complete with409 GOAL_INVALID_STATE and remain readable. Repeated complete/archive and unchanged PUT preserve timestamps; identity/createdAt persist. Lifecycle bodies accept empty objects or omitted JSON bodies; no lifecycle fields are accepted.

## Linked accounts, locks and financial non-effect

Create/new changed links require an owned active account. Invisible/missing account IDs return safe404; owned archived assignments return409 ACCOUNT_ARCHIVED. Existing archived account metadata can be retained during other edits or cleared; archived goal history stays readable. Account archival never mutates savedAmount.

Mutation transactions use one checked-out client, BEGIN/COMMIT or ROLLBACK and no automatic retry. Goal updates first establish owned existence, then exclusively lock a nonnull submitted account **before** locking/re-reading the goal FOR UPDATE. New-assignment status validation uses the locked current goal link. This preserves unchanged archived links while preventing archive/assignment races. Exclusive account locks match the T15 trigger; shared-to-exclusive upgrades would otherwise risk deadlocks under simultaneous assignments. Complete/archive lock only their owned goal. No account balance or financial posting service is invoked by Goal mutations.

Real financial snapshots verify Goal operations preserve accounts, categories, transactions, transfers, recurring definitions/occurrences, budgets, balances and income/expense totals. Separately, a massive opening balance edit, income creation/edit/deletion and transfer creation/deletion leave the linked Goal resource unchanged. Archived accounts retain their links until explicitly changed. No schema migration, new index, privilege broadening, dependency or shared financial formula is needed; existing T11/T15 checks/FKs/triggers remain authoritative.

## Isolation, concurrency and rollback

T16 now registers and invokes the actual Goal API in its shared synthetic ES256/JWKS/limited-role harness.25 grouped checks exercise owned create/get/update/complete/reopen-via-PUT/archive; B empty all/status lists; foreign/missing identical404 for GET/PUT/complete/archive; foreign account rejection on create and update. Identity is solely the verified JWT subject, including deliberately misleading user_metadata. Owner injection fails400. All responses use no-store, structured safe errors and existing405 Allow guards. Tests verify invalid auth401, validation400, unavailable503 and generic unexpected500 without SQL/schema/stack disclosure.

**10 forced locking races:** double complete; complete versus lowering update in both orders; explicit reopening PUT versus archive in both orders; create-link and update-link versus account archive in both orders; simultaneous link assignments to the same account. The first real SQL lock/write is held, the second connection is confirmed waiting on a PostgreSQL Lock event, then released. Final results match valid serialized outcomes; idempotent double completion returns identical timestamps/resources.

**Six post-write rollback probes:** create, update, complete, reopening PUT, archive and response-projection failure after insert. Full snapshots including goal/financial rows and timestamps are identical after rollback. A separate broken-rollback test discards the client and preserves the original failure without retry. Runtime DDL/TRUNCATE/trigger disabling/escalation attempts reject42501; the shared isolation suite additionally verifies private-schema browser denial and limited role attributes.

## Performance

Synthetic PostgreSQL17.11 fixture:2,000 personal goals plus8,000 unrelated-owner goals, with all three statuses. One list statement, no account lookup per result. Limited-role EXPLAIN ANALYZE BUFFERS shows existing goals_user_status_idx bitmap scans and an in-memory sort; single GET uses goals_pkey. No speculative index/migration.

| Selection | Rows | Service elapsed ms | SQL execution ms |
| --- | ---: | ---: | ---: |
| All | 2000 | 36.276 | 3.629 |
| Active | 667 | 9.192 | 1.897 |
| Completed | 666 | 10.009 | 1.205 |
| Archived | 667 | 7.799 | 1.220 |
| Single | 1 | — | 0.078 |

These are local synthetic samples, not hosted guarantees. Evidence: [plans and measurements](assets/t45/performance.json), [focused result](assets/t45/result.json). Repeated reads return identical resources/order; the counting wrapper verifies one driver query for all2,000 goals.

## Quality and regressions

- Backend lint, typecheck and build passed.
- Focused T45: four tests passed, zero skips/failures;245 grouped integration checks,10 races,six rollback probes and25 isolation checks.
- Full backend suite:130 tests,103 passed,27 explicit disposable gates skipped,zero failures. Fresh integration runs below cover the relevant gated groups separately.
- Fresh T18/shared: three tests passed,zero failures/skips. T16 foundation599, T17 accounts263, T18 balances285, transactions244, search263, filters3263, pagination6065, transfers917, recurring isolation31, Analytics isolation14, Budgets isolation15 and Goals isolation25.
- Secret/artifact scan and git diff --check passed before commit.
- Frontend source is unchanged; frontend tests/build/browser audits are outside this backend-only task.

The disposable guard accepts only password-free postgres@127.0.0.1:55451/postgres without URL options. Tests never load application.env or fall back to DATABASE_URL. The fresh synthetic cluster is ignored `.tmp-v2-t45/pgdata`; reset scripts verify that exact data_directory before resetting it. No production restore/archive directory was touched. PostgreSQL and all test HTTP/JWKS servers were stopped after verification.

## Production boundary and reproduction

Local index.ts registers Goals only outside NODE_ENV production. Vercel server.mjs omits Goal service registration; an app constructed with that omitted service returns404 for Goal routes. Automated source checks preserve the frontend production404 financial gate and empty Vercel cron list. No frontend Goal page/Dashboard preview integration was performed. No remote SQL, env update, manual deployment or hosted financial acceptance occurred; pushing main may trigger the existing Git build with gates preserved. Hosted financial acceptance remains intentionally deferred.

Build backend, initialize a **fresh disposable** PostgreSQL17 cluster listening only on127.0.0.1:55451, database postgres, without application/Auth schemas or app/browser roles. Set only T45_DISPOSABLE_DATABASE_URL to that password-free admin connection, then run `node --test tests/goals.test.mjs` from backend. For T18/shared, use another fresh cluster/reset of that same disposable-only directory and set only T18_DISPOSABLE_DATABASE_URL before running `node --test tests/v2-account-balances.test.mjs`. Never use retained data. Stop the disposable cluster afterward.

Changed files: Goal types/validator/service/router; app/local entry wiring; Goal tests/isolation helper and shared harness/runner; README/API/implementation-plan/T16 matrix; this report and two synthetic JSON evidence files; ignore rule. Database design/schema/privileges, V1 source, frontend, Vercel entry/config and dependencies remain unchanged.

No known T45 blocker remains. Exact next task: **T46 — Build Goals Page**. It is unstarted; T47 projection remains optional and unpromoted. Do not resume production acceptance automatically.

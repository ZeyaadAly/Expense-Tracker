# T33 — Configure Daily Vercel Scheduled Execution

Date: 2026-10-12. Status: **Completed locally. Production scheduling remains disabled under the frozen release gate.**

The checkout already contained the protected handler, entry-point wiring, environment example, cron-ready template and HTTP/database harness. This task reviewed and verified that implementation, added a fresh-process Vercel entry-point smoke test, and closed the missing verification/checkpoint documentation. T31, T30 and T32 production implementations were reused without modification. No frontend or schema changes.

## Schedule and deployment boundary

The prepared schedule in `backend/vercel.cron-ready.json` is `0 3 * * *`: daily at 03:00 UTC, path `/internal/recurring/process`. The deployment is the separate Express backend project rooted at `backend`; `server.mjs` exports the application and imports the compiled services. The cron path is relative to that backend origin, without a `/backend` prefix or frontend rewrite.

The recognized `backend/vercel.json` deliberately retains `crons: []`. The implementation plan explicitly prohibits production activation until the T66–T71 validation/write-enable gate and T72 scheduler verification. The ready template is not automatically consumed by Vercel. At release, merge its cron entry into the then-current reviewed active configuration, verify the backend project root, configure the private secret, and verify deployment protection and the effective function duration. No hosted configuration, environment values, deployment, production request or remote database migration was performed here.

Both configuration files parse successfully and retain the Express preset, `npm run build`, CA inclusion and explicit `server.mjs` maximum duration of 60 seconds. Tests verify that both backend entry points wire the same T31 processor and that the configured path resolves over actual Express HTTP. An additional child-process test imports the real `server.mjs`, initializes its production app/pool, and verifies lazy missing configuration, unauthorized requests and safe unavailable-database handling. No Vercel build or hosted scheduler delivery was attempted; those remain release verification.

## Authentication, input and security

`GET /internal/recurring/process` requires `Authorization: Bearer <CRON_SECRET>`. It is outside the normal `/api/v2` JWT boundary and supplies no browser CORS headers. Existing V1/V2 CORS remains unchanged.

Generate a dedicated server-only secret from at least 32 random bytes. Hex/base64url are examples, not required formats. Lazy validation requires at least 32 printable, non-whitespace ASCII characters; missing or invalid server configuration returns 503 `CRON_UNAVAILABLE` without processor work or unrelated startup failures. Missing, invalid or duplicate Authorization headers return safe 401. Authentication uses SHA-256 digests and `timingSafeEqual`, without prefix diagnostics or logging credentials.

Only GET is accepted; authenticated HEAD and other methods return 405 with `Allow: GET`. Query strings, bodies and trailing slash variants return 400. HTTP input cannot supply an owner, date, limits or retry action. Origin, user-agent, user JWT and schedule metadata are not scheduler credentials. Every handled response sets `Cache-Control: no-store` and a fresh `X-Request-ID`.

The response explicitly projects actual T31 counters and flags, plus referenceDate/requestId/processed. Logs contain only timestamp, date, duration, request ID, counters and a fixed outcome class. No raw error, SQL, identity, description, account/category name, token or secret is returned/logged. Failed attempts or failure-recording failures produce safe 500 `PROCESSING_FAILED` with a count-only summary; thrown database availability failures produce 503 `DATABASE_UNAVAILABLE`, and other exceptions safe 500 `INTERNAL_ERROR`. A final-query disconnect after committed posting returns 503; the next invocation observes durable progression.

The read-only security scan passed over source/docs and 52 compiled backend JavaScript files. It also checks tracked environment files and privately compares configured local secret values when present. No private configured values were available for comparison in this checkout; generated test secrets remain isolated from hosted credentials.

## Cairo date, processor and runtime budget

At invocation, the existing `cairoToday(now)` helper derives the date-only reference using `Africa/Cairo`. HTTP tests cross midnight during both summer and winter; no UTC date slicing is used.

One call to `processDueRecurring` supplies the explicit reference date, `maxPerDefinition: 100`, `maxAttempts: 1000` and the existing caller-supplied `shouldStop` predicate. No recurrence/occurrence logic is duplicated. The monotonic clock stops new processor work at 45 seconds, leaving a 15-second buffer beneath the configured 60-second function duration. This deadline is cooperative: it cannot cancel an already-running SQL statement. Durable T31/T32 transactions remain the recovery boundary if the platform interrupts an in-flight operation.

Deadline/backlog alone returns 200 with `deadlineReached`, `limitReached` and `hasRemaining` visible. No recursive request, unbounded pass, background work or automatic failed-marker recovery occurs. Explicit failed recovery remains an internal T32 operation.

## End-to-end database evidence

All mutating verification used a newly initialized PostgreSQL 17 cluster under ignored `.tmp-v2-t33/pgdata`, bound to `127.0.0.1:55451`. Fresh fixtures applied the existing local migrations; production application work ran as limited `expense_tracker_app`. Admin access was confined to fixture setup and observation. The reset helper asserts the exact disposable data directory before recreating the test database/roles between suites. No retained development or remote database was used.

The T33 real HTTP/database group passed **104 focused checks**, including:

- A/B owned income/expense posting and exact T18 income, expenses, balances and net position; zero owner mismatches or ownerless generated rows.
- Repeated same-day requests leave the complete financial snapshot unchanged. Closing/recreating the pool and handler retains the same durable result.
- Two genuinely overlapping HTTP requests wait behind an observed database parent lock; both complete with only one financial transaction for the occurrence.
- The server destroys the client connection after a committed processor result, before HTTP acknowledgement. Retrying creates no additional transaction.
- A deadline immediately after committed reservation leaves one pending marker, an unchanged due cursor and no financial transaction. A later invocation posts once.
- One definition with 121 due occurrences processes 100, reports remaining work, then processes 21 with no duplicates.
- Eleven definitions with 101 due occurrences each process 1000, then 110, then 1 across three bounded invocations. Remaining work is reported until fully drained; no definition exceeds 100 per invocation and no invocation exceeds 1000 attempts.
- Paused, archived and exhausted definitions do not post. Forced account/category archive races prevent incorrect financial writes. Explicit failed recovery follows T32 only.
- A refused local database connection returns safe 503 without state change. A disconnect during the final backlog query after commit returns 503 and resumes without duplicate financial activity.
- Public V1/V2 health responses, JWT-required V2 APIs and cross-owner hiding remain intact; a valid user JWT cannot authorize cron execution.

Three forced database races cover the overlapping cron and account/category archive boundaries. The fresh-process entry-point smoke adds independent cold application initialization coverage; it does not require recurrence state in memory.

## Quality and regressions

- Backend lint, typecheck and build: passed using `npm.cmd` (PowerShell script execution policy prevents the `npm.ps1` shim).
- T33: all five top-level tests pass, including the 104-check real PostgreSQL/HTTP group; no gated skip in the focused run.
- T30 calculator: all 14 tests pass, including Cairo boundaries and the independent calendar oracle.
- T31: all three tests pass; 403 integration checks, 12 forced races and 12 rollback/lost-ack probes. The representative 40-user/2000-definition workload processes 1000 attempts in 7935 ms locally; due scan 0.893 ms.
- T32: both tests pass; 103 integration checks including double reservation/posting, reconnect, six rollback faults and lost COMMIT acknowledgement.
- T29: all three tests pass; 357 integration checks, ten forced races and eleven rollback faults.
- T18: all three tests pass. The shared T16–T26/isolation regression includes 599 foundation checks, 263 account checks, 285 balance checks, 244 transaction checks, 263 search checks, 3263 filter checks, 6065 pagination checks, 917 transfer checks and 31 recurring isolation checks; zero failures.
- Full backend suite: 108 tests, 86 passed, 22 environment-gated skips, zero failures. This ungated run is supplementary; the fresh focused database runs above separately execute the relevant skipped groups.
- Security scan and `git diff --check`: passed.

Local timing is evidence for this synthetic workload, not a hosted latency guarantee.

## Reproduction and manual invocation

Build first because tests import compiled backend modules. Run the unit/config/smoke groups with `node --test tests/recurring-cron.test.mjs tests/recurrence.test.mjs` from `backend`.

For full T33 HTTP integration, initialize a **fresh** password-free disposable loopback PostgreSQL cluster on port 55451 with database `postgres` and admin role `postgres`; it must have no existing application/Auth schema or browser/application roles. Set only `T33_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55451/postgres` and run `node --test tests/recurring-cron.test.mjs`. The suite guards that URL and bootstraps fixtures. For T31/T32/T29/T18, recreate the empty disposable database and application/browser roles between runs and use each suite's corresponding `Txx_DISPOSABLE_DATABASE_URL`; never point fixture runners at retained data.

For manual local processing, follow the environment-held secret example in [README](../../README.md#local-recurring-scheduler-t33). It writes due V2 financial activity, so use disposable development data. Do not paste a real secret into documentation or shell history.

## Provider reality check

Official documentation checked 2026-10-12 confirms [cron HTTP GET and UTC](https://vercel.com/docs/cron-jobs), automatic `Authorization: Bearer` delivery from CRON_SECRET and possible overlapping/duplicate delivery in [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), and [maximum-duration configuration](https://vercel.com/docs/functions/configuring-functions/duration). Existing Express entry-point/configuration conventions were inspected locally; fetching the [Express guide](https://vercel.com/docs/frameworks/backend/express) timed out during this run, so no new hosted compatibility claim is based on that fetch.

## Remaining issues and next task

No local T33 blocker remains. Production cron activation and actual hosted delivery verification are intentionally deferred to the frozen release sequence. **T34 — Build Recurring Page** is next and was not started.

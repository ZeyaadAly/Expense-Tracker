# T29 — Recurring definition backend

Date: 2026-10-09. Status: **Completed locally. Production not applied.**

## Original blocker and resolution

The previous 2026-10-08 report blocked T29 on the missing T30 calculator and T32 durable occurrence invariants. Both tasks subsequently completed locally; see [T30 verification](t30-verification.md) and [T32 verification](t32-verification.md). T29 reuses their implementations. This report replaces the blocked checkpoint with implementation and fresh verification evidence.

## Endpoints and resource

Authenticated routes under `/api/v2`:

- GET/POST `/recurring`
- GET/PUT `/recurring/:id`
- POST `/recurring/:id/pause`
- POST `/recurring/:id/resume`
- POST `/recurring/:id/archive`
- GET `/recurring/upcoming`, the existing T29 read-only projection contract

Both `src/index.ts` and Vercel `server.mjs` wire the service through createApp. Routes stay thin. Ownership comes exclusively from verified req.auth.userId; JWT user metadata is ignored. Existing T09 auth, JSON policy, no-store responses, method enforcement and safe error envelope apply. Foreign/missing definitions and parent references return identical 404 NOT_FOUND. No restore or DELETE recurring route exists.

Resources use the frozen shape: ID, account/category IDs and names, income/expense type, exact normalized amount, EGP currency, description, frequency, date-only start/end/nextOccurrence, lifecycle status, derived exhausted flag and ISO timestamps. No userId or occurrence/generated internals escape.

## Validation and list contract

Create/full PUT accept accountId, categoryId, type, amount, description, frequency, startDate and optional nullable endDate. Missing endDate becomes null. Unknown fields—including owner/userId, status, nextOccurrence, currency, weekday/dayOfMonth and occurrence/generated fields—are rejected.

Amounts reuse existing validation/formatting: decimal strings only, 0.01–999999999.99, at most two decimals; no exponent, whitespace, leading zeros, rounding or JS financial arithmetic. Description is trimmed, 1–200 Unicode code points; controls/invalid Unicode are rejected without truncation. T30 validates real 1900–9999 dates, exactly four frequencies and endDate >= startDate.

Accounts must be owned and active. Categories must be active system/current-user custom categories compatible with type or both-kind. Shared T21/T32 reference validation supplies parent locks and privacy behavior. Archived parents give ACCOUNT_ARCHIVED/CATEGORY_ARCHIVED; incompatible kind gives field validation.

List filters are precisely status, type, accountId, categoryId and frequency, combined with AND. Unknown/repeated/empty/malformed/bracketed parameters fail. Omitted status includes all statuses; foreign reference filters return empty lists. Order: active, paused, archived; nextOccurrence ascending, nulls last; UUID tie-breaker. Response includes meta.count. No search/pagination was added.

## T30 scheduling and exhaustion

Every recurrence selection calls getFirstOccurrenceOnOrAfter or getNextOccurrenceAfter with the original schedule anchor. Cairo today comes from the existing utility at the service boundary. No recurrence math is duplicated.

Creation selects the first anchored date on/after today, or future start. It creates no historical transactions or occurrence rows. Today is included. EndDate is inclusive; valid exhausted schedules are stored active with null nextOccurrence. The derived exhausted flag means active with null nextOccurrence; paused/archived return false.

Active edits and paused resumes select the first available anchored date on/after today, excluding durable reserved dates. Paused gaps are skipped without materializing missed ledger rows. Resume after endDate returns active/null/exhausted. Already active resume validates parents and otherwise preserves nextOccurrence and updatedAt.

Persistence integration proves Jan 31 → non-leap Feb 28 → Mar 31 and Feb 29 yearly → non-leap Feb 28 → leap Feb 29, including inclusive/between-anchor ends. Tests cover all four old-start frequencies, future starts, today, exhausted creation/edit/resume and a long paused gap.

## T32 and historical integrity

T32 exposes two caller-owned transaction helpers: skipUnpostedOccurrencesInTransaction and getReservedDatesInTransaction. They lock/check the owned definition and reuse the existing constrained ledger. T29 never reserves or posts occurrences. Rescheduling advances through T30 candidates only when a date already exists in durable history; work is bounded by history rather than elapsed calendar time.

Posted/skipped markers, dates, links and timestamps stay unchanged. Generated transactions stay unchanged. A posted marker whose transaction was deleted still blocks replay. Definition updates cannot rewrite links or ownership.

**Frozen-policy clarification:** the request's general failed-history preservation language conflicts with its instruction to follow the frozen lifecycle contract. PRD §11, architecture §20, database §18 and API §§39–44 explicitly require pending/failed *unposted reservations* to become skipped on edit/pause/archive. T29 follows that explicit contract: their identities/dates/createdAt remain, but status/processedAt/updatedAt change and failureCode clears. The report does not claim failed status is retained. Posted/skipped terminal records remain byte-for-byte unchanged.

## Lifecycle and archived references

Active → paused clears nextOccurrence and skips unposted reservations atomically. Paused → active validates parents and recomputes available scheduling without backfill. Active/paused → archived clears nextOccurrence and skips unposted reservations; archive is permanent. Archived update/pause/resume gives 409 CONFLICT. Repeated pause/resume/archive preserves timestamps when already in the requested state. Identical resulting PUT avoids a definition write.

Actual account API archive pauses the new recurring schedule and skips its reservation. Resume fails while account is archived. Account restore leaves the definition paused; explicit resume is required.

The existing T15 category archive trigger pauses active definitions; archived category names remain readable. Create/PUT/resume rejects archived categories. Category reactivation leaves definitions paused; explicit resume is verified. No category mutation API or T48 implementation was introduced. The category trigger's existing pause behavior remains unchanged.

## Concurrency and rollback

Create/edit/resume lock account FOR UPDATE, category FOR SHARE, then definition FOR UPDATE. Pause/archive lock definition then ledger without later acquiring parents. Resume rereads references and returns CONFLICT on stale discovery instead of automatically retrying. Account archive coordinates through existing parent-first locks. PostgreSQL's [documented row-lock behavior](https://www.postgresql.org/docs/17/explicit-locking.html) supports this ordering. Supabase changelog retrieval was unavailable; no Supabase platform settings/features/dependencies changed.

Ten actual races are forced and observed through pg_blocking_pids: both orders of pause/update, resume/archive, update/archive and account archive/resume, plus two pauses and two resumes. Valid final lifecycle/nextOccurrence states and idempotent results pass. An additional controlled reference edit during resume discovery returns 409 and leaves the new paused definition intact.

Eleven rollback faults cover create/update/pause/resume/archive after their SQL mutation and before COMMIT, plus after the T32 reservation skip. Full snapshots include every definition/occurrence/transaction/account row and timestamps. All roll back without occurrence corruption, transaction side effects or timestamp drift. Each mutation uses one client/transaction; failed rollback discards the connection. No automatic mutation retry or optimistic versioning was introduced.

## Financial non-effect and isolation

T18 account summary/net-position resources and complete transaction/transfer snapshots prove definition creation/edit/pause/resume/archive has no financial effect. Synthetic posting occurs solely through T32 in test fixtures to verify history. Subsequent lifecycle changes leave generated records/totals unchanged. Generated deletion uses actual T21 API; its terminal marker survives.

Actual local ES256/JWKS authentication drives User A/B create/list/read/update/pause/resume/archive tests. B cannot see/mutate A's definitions or create using A's account/custom category. Foreign/missing errors and filters do not disclose existence. T16's continuing verifier now calls verifyRecurringIsolation: 31 additional real recurring API checks pass in the full domain regression.

## Upcoming projection

The frozen GET contract is read-only in a REPEATABLE READ snapshot. days is a strictly validated integer 1–366, default 30; interval is Cairo today through today+days-1 inclusive, clamped at the supported upper bound. PostgreSQL supplies range arithmetic; T30 supplies recurrence selection. Only owned active definitions with active parents are included; posted/skipped dates are excluded. Exact-string results sort by occurrence date then definition ID. A full database snapshot proves no mutation. No forecast is persisted/generated.

## Fresh verification

Four separate local cluster copies were initialized under ignored .tmp-v2-t29, using only 127.0.0.1:55451/postgres and the explicit disposable URL guard. Migrations: two V1, four T11, T12 system-category seed, T15 ownership constraints and T32 invariants. Application operations use the actual limited expense_tracker_app role; admin is only for synthetic setup/observation. No new grants/migration/broad privileges/browser Data API access were needed.

- Backend lint, typecheck and production build: passed.
- Final full suite selecting T29: **100 tests, 81 passed, 19 other database-gated skips, 0 failures**. T29's three tests all pass; focused integration: **357 checks, ten forced races, eleven rollback faults**.
- All **14 T30 recurrence tests** pass in each full run.
- Separate fresh full suite selecting T32: **100 tests, 81 passed, 19 gated skips, 0 failures**; **103 T32 integration checks** pass.
- Separate fresh full suite selecting T27: **100 tests, 81 passed, 19 gated skips, 0 failures**. T16 599, T17 263, T18 285, T21 244, T22 263, T23 3263, T24 6065, T26 917 and T27 4833 checks pass, plus **31 recurring isolation checks**. T27 retains 29 forced races, six rollback faults and zero observed deadlocks.

Gated tests deliberately use separate fresh databases; selecting multiple schema initializers in one run is invalid. These are actual new runs, not copied prior results. No frontend source changed, so no frontend suite was run. Local clusters are stopped after verification.

Reproduce: build backend; initialize/start a fresh local copy; set only one of T29_DISPOSABLE_DATABASE_URL, T32_DISPOSABLE_DATABASE_URL or T27_DISPOSABLE_DATABASE_URL to `postgresql://postgres@127.0.0.1:55451/postgres`; run `npm.cmd --prefix backend test`. Use a fresh copy for each selection.

## Changes and boundary

Added types/recurring.ts, validators/recurring.ts, services/recurring.ts, routes/recurring.ts, tests/v2-recurring.test.mjs and tests/helpers/v2-recurring-isolation.mjs. Updated T32 helpers, app/local/Vercel wiring, shared auth harness, T16 verifier, ignored local directory, API design, implementation plan and this report. Existing database design already expresses the lifecycle; no database-design/schema/grant change was necessary.

No production/remote resources, V1 behavior, frontend integration, cron, processor or historical backfill changed. All seven definition routes and planned projection are implemented and verified. No remaining T29 blockers.

Next: **T31 — Implement Recurring Processor**. It is not started automatically.

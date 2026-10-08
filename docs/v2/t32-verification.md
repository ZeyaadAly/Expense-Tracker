# T32 — Durable occurrence persistence / idempotency

Date: 2026-10-08. Status: **Completed locally.** T30/T32 prerequisites are satisfied; return to T29, which remains unimplemented.

## Model and internal API

The existing recurring_occurrences table remains authoritative. `(recurring_transaction_id, occurrence_date)` is the durable unique key. Owner is checked on every service lookup and preserved by T15 composite foreign keys. Stored states are pending, posted, skipped and failed; posted/skipped are immutable terminal markers.

`createRecurringOccurrenceService(database)` exposes:

- `getOccurrence(userId, definitionId, occurrenceDate)`: owned definition required; absent occurrence returns null; foreign/missing definition gives identical NOT_FOUND.
- `reserveOccurrence(...)`: locks owned definition, validates the exact anchored date using T30 and active definition status for new reservations, inserts pending with ON CONFLICT DO NOTHING, then reads the row. Existing reservations and terminal markers are returned unchanged, even after schedule edits/archive/deletion. No future-range enumeration or historical scanning.
- `postOccurrence(...)`: one explicit transaction for parent validation/locks, definition/occurrence lock, generated insert, terminal link/status and commit. A reservation must already exist. Pending is required for new posting; posted/skipped return the existing marker without another financial write.
- `postOccurrenceInTransaction(client, ...)`: identical posting implementation for a caller that owns BEGIN/COMMIT. T31 can compose nextOccurrence advancement in that same transaction; T32 does not implement advancement or scheduler orchestration.
- `transitionOccurrence(..., action, failureCode?)`: skip, fail or explicit retry. Skip is idempotent and never overwrites posted history. Fail cannot overwrite terminal rows. Failed recovery explicitly clears failure metadata/processedAt and restores pending; reserving a failed row does not retry it automatically. Repeated identical transitions do not write or drift timestamps.

Failure codes written by the service are DATABASE_UNAVAILABLE, POSTING_FAILED or INVALID_REFERENCE. Error payloads, SQL and stacks are never persisted. The database additionally restricts failure codes to uppercase identifiers of at most 40 characters. The first failure record is retained on repeated fail calls.

## Atomic posting and locking

T21 and T32 share `transaction-write.ts` for account/category validation locks and transaction insertion. T32 reuses validateV2Transaction for exact decimal strings, description/type/reference syntax and Cairo manual-date bound. Generated fields are derived exclusively from the locked definition and requested occurrence: owner, account/category, type, amount, description, original occurrence identity and date. No money passes through float arithmetic.

Posting locks account FOR UPDATE, category FOR SHARE, definition FOR UPDATE, then occurrence FOR UPDATE. This matches T17 account archive and category archive ordering; reservation/transition take only definition then occurrence, without later acquiring parents. Definition fields are reread under lock; a concurrent edit detected after reference discovery returns CONFLICT without an automatic retry. Current active parents, active definition and T30 schedule eligibility are rechecked before a new financial insert.

BEGIN/COMMIT/ROLLBACK use one client. A rollback failure discards the connection while retaining the original error. No mutation is retried automatically. Failed posting leaves the durable pending reservation intact; later failure recording/recovery is explicit work in a fresh transaction. Old pending rows have no timeout or automatic transition in T32; T31 owns inspection/recovery policy and invocation limits.

## Local migration

Generated with Supabase CLI 2.120.0 using `supabase migration new v2_occurrence_invariants`, then authored and applied only to disposable PostgreSQL:

`supabase/migrations/20261008135130_v2_occurrence_invariants.sql`.

T11/T15 lacked paired generated fields, generated-pair FK/partial uniqueness, immutable terminal transitions and generated identity checks. The migration adds those guarantees without duplicating tables or introducing columns/grants:

- generated definition/date must both be null or both nonnull;
- generated pair references a reserved occurrence and is unique among generated transactions;
- generated metadata and occurrence owner/definition/date/ID are immutable;
- linked transaction must match owner, definition and occurrence date;
- posted/skipped cannot revert or accept replacement links; failed requires pending recovery before posting;
- posting requires a link, except an existing posted marker whose transaction was subsequently deleted;
- a deferred generated-insert constraint trigger requires the matching posted/link state at commit, rejecting orphan generated inserts;
- ledger deletion is blocked, in addition to existing runtime DELETE/TRUNCATE/DDL restrictions;
- no-op occurrence updates preserve timestamps.

The existing owner-composite ON DELETE SET NULL FK still clears only generated_transaction_id. The terminal guard permits that clear only when the old transaction no longer exists. The date, owner, status and processed timestamp survive. Live links cannot be manually cleared, replaced or used to regenerate deleted history.

Preflight detects inconsistent existing generated pairs/links and fails without repairing financial history. A deliberate inconsistent-history fixture proved rollback before constraint installation. Existing posted markers with null links remain valid historical deletion records. Functions are SECURITY INVOKER with qualified private-schema access; PUBLIC/anon/authenticated EXECUTE is revoked. Runtime role and browser Data API grants are unchanged.

PostgreSQL's documented trigger execution within the statement transaction and its FK-trigger behavior informed the deletion/atomicity checks: [PostgreSQL 17 trigger behavior](https://www.postgresql.org/docs/17/trigger-definition.html). Supabase changelog fetch was unavailable; no Supabase platform feature/configuration changed.

## Focused verification

Fresh database with two V1 migrations, four T11 migrations, T12 seed, T15 constraints, then T32 migration. Actual expense_tracker_app role performs all domain operations and direct rejection probes; postgres is limited to disposable setup/observation.

**103 focused integration checks passed**, including:

- two reservations and two posts forced into genuine contention; pg_blocking_pids confirms the second client waits on the first; both receive the same logical row/result;
- exactly one generated transaction and one accounting effect under concurrent posting and repeated calls;
- six injected rollback faults: after reservation insert, after generated insert, before occurrence update, after occurrence update, before commit and during failure transition; full row/definition/account snapshots unchanged;
- an actual database divide-by-zero after posting plus a caller's nextOccurrence update rolls back both, proving transaction composition;
- real COMMIT followed by simulated acknowledgement loss; an explicit retry returns the committed posted row with no second transaction;
- all clients/pools close and reconnect between reservation and completion; pending state survives without in-memory recovery;
- actual T21 JWT-authenticated generated PUT preserves the occurrence identity/marker, and DELETE retains posted history with null linkage;
- posted and skipped dates cannot replay after deletion or schedule-anchor changes;
- User B cannot reserve, post, inspect or transition A's definition; foreign and missing definitions are indistinguishable;
- direct owner mismatch, duplicate key, invalid status, identity rewrite, terminal reversal, cross-owner generated link and orphan insert are rejected;
- runtime DELETE/TRUNCATE/DDL/trigger disabling are denied; no anon/authenticated table reads;
- exact amounts 0.10, 0.20 and 999999999.99 and unchanged calendar dates; aggregate balance 1000000000.29 proves exact unrestricted totals;
- custom category archive blocks posting; account archive skips unposted reservations and retains posted history; paused new reservation is rejected.

Reservations and recovery alone have no accounting effect. A generated financial edit changes its actual amount as T21 permits; deletion reverses that actual amount once. The original occurrence identity remains terminal independently of those financial changes.

## Regression and quality

Backend lint, typecheck and production build pass. Full suite with the T32 integration selected: **97 tests, 79 passed, 18 other database-gated skips, zero failures**; all 14 T30 recurrence tests pass.

A second fresh full-suite run selects T27 integration and installs T32 through the shared isolation preparation helper: **97 tests, 79 passed, 18 gated skips, zero failures**. Actual domains pass T16 599 checks, T17 263, T18 285, T21 244, T22 263, T23 3263, T24 6065, T26 917 and T27 4833. Existing generated regression fixtures were updated to reserve/insert/link atomically; deleted historical markers are produced through actual generated deletion rather than invalid posted-null inserts. Financial expectations and ownership rejection assertions remain intact.

Before the fixture changes, the earlier T16–T27 baseline also passed. The authoritative regression evidence above is the later run with T32 installed.

Reproduction: build backend; on a fresh explicitly guarded database set only T32_DISPOSABLE_DATABASE_URL to `postgresql://postgres@127.0.0.1:55451/postgres`, then `npm.cmd --prefix backend test`. For the broad domain regression, reset the disposable copy, set only T27_DISPOSABLE_DATABASE_URL to the same URL and rerun. Do not select both fresh-database initializers in one run.

## Scope and checkpoint

Added occurrence service, shared T21/T32 writer, local migration, focused tests, compliant generated-fixture helper and this report. Updated the shared isolation preparation and five generated regression helpers, database-design clarification, implementation plan and ignored local test directory.

No recurring public route, global due-definition scan, processor/cron, frontend, hosted schema, dependency package or production data was changed. Test posting is confined to the copied synthetic cluster. Existing V1 route behavior and financial calculation formulas are unchanged; existing uncommitted work is preserved. The local cluster is stopped after verification.

Next: **Return to T29 — Build Recurring Backend**. Its T30/T32 dependency blocker is resolved locally. T29 was not started automatically.

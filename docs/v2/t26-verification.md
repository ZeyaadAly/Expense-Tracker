# T26 — Atomic transfer backend verification

**Status: Completed locally on 2026-10-08 (Africa/Cairo).** T01–T26 are complete locally. T27 remains the separate focused atomicity/concurrency verification task and is not started or marked complete. T28 frontend integration still waits for that gate. The mandatory initial atomicity tests requested for T26 ran within this delivery. No recurring implementation, frontend change, new schema/migration/index/grant, remote access, production data or deployment. Earlier uncommitted work remains intact.

## Routes, validation and mapping

- GET/POST `/api/v2/transfers` and GET/PUT/DELETE `/api/v2/transfers/:id` use existing T09 authentication, no-store and structured errors.
- POST returns 201 and Location; GET/PUT return 200; DELETE returns empty 204. Known unsupported methods return 405. Detail/mutation queries are rejected.
- POST/full PUT require sourceAccountId, destinationAccountId, amount and date; description is optional/null. Unknown owner/server fields are rejected. UUIDs normalize lowercase; same account is a structured 400 VALIDATION_ERROR on destinationAccountId before SQL.
- Shared exact-positive decimal validation accepts string values 0.01–999999999.99, zero/one/two decimals, normalized to two; numeric JSON, zero, negative, exponent, excess scale, signs, whitespace, leading zeroes and out-of-range inputs reject without rounding. No production JavaScript financial arithmetic.
- Manual dates stay YYYY-MM-DD, real calendar dates from 1900-01-01 through Africa/Cairo today. Leap-day/minimum/future and Cairo-midnight boundaries are tested; no date timezone shifting.
- Notes trim to 0–200 Unicode code points. Omitted/null/blank becomes null; full PUT omission clears the note. Invalid Unicode/null bytes and overlong/non-string notes reject without truncation; 200 emoji code points are accepted.
- Explicit typed mapping exposes exactly id, sourceAccountId/sourceAccountName, destinationAccountId/destinationAccountName, amount, currency EGP, date, description, createdAt and updatedAt. Names come from ownership-safe joins; date stays date-only and timestamps serialize UTC. No userId, cursor tuple or internal columns escape. PUT preserves ID/createdAt/owner and refreshes updatedAt through the unchanged trigger.

## Ownership and archived lifecycle

Every transfer read/lock/write binds verified req.auth.userId. Both references must be visible to that owner; check visibility of both before reporting status. Foreign and nonexistent transfers/accounts/filter references have identical 404 NOT_FOUND envelopes, without global owner lookup or 403. Signed user_metadata cannot switch the effective user. Both A→B and B→A cases exercise actual CRUD/list/reference/filter paths. Injection attempts compare full financial rows/timestamps and derived snapshot state before/after.

Create and every PUT require distinct active owned resulting accounts, even unchanged references. An owned archived result returns 409 ACCOUNT_ARCHIVED; replacing all archived references with active owned accounts is allowed. Historical GET/list remains visible with either/both accounts archived, and DELETE is allowed against archived parents. T15 permanently locks opening balance and card/asset conversion on first transfer activity; deleting/moving a transfer never unlocks it. No account hard deletion or transfer archival is introduced.

## Atomicity, locks and errors

One checked-out client executes BEGIN, all dependent checks/writes/readback, COMMIT or ROLLBACK. PUT/DELETE first lock the owned transfer row, then lock the distinct union of old/new account IDs in ascending UUID order; create locks both endpoints in the same order. The child lock ensures old references are current after competing edits and returns 404 after a competing committed deletion. All parent locks remain held through commit. T17 lifecycle operations lock accounts/definitions without transfer child locks, so there is no reverse account-to-transfer lock edge. T15 posting locks use the same parent UUID order. Neither balance writes nor reversal bookkeeping exists.

Archive first: a waiting mutation reads committed archived status and rejects. Transfer first: archive waits for transfer commit, then leaves readable historical activity. This serial ordering does not promise an account can never be archived after a valid posting.

**11 forced real PostgreSQL races**, observed through pg_stat_activity lock waits:

1. Source archive wins before create.
2. Destination archive wins before create.
3. Source create wins before archive.
4. Destination create wins before archive.
5. Source archive wins before reassignment PUT.
6. Destination archive wins before reassignment PUT.
7. PUT wins before DELETE on the same row.
8. DELETE wins before PUT, which then receives 404.
9. Two PUTs serialize, including changed old/new endpoints and exact final reconciliation.
10. Opposite-direction creates on the same accounts serialize without deadlock.
11. First transfer wins before a competing opening-balance edit, which then returns ACCOUNT_CONFLICT; deletion retains the permanent lock.

**11 real rollback faults:** eight service faults immediately after transfer/account row locking or actual INSERT/UPDATE/DELETE, plus three actual HTTP faults after those writes. Complete before/after financial snapshots include rows and microsecond timestamps; T18 net position also agrees. First-activity flags roll back after failed insert/update. HTTP faults return sanitized 500 with no driver detail. All five routes separately test connection failure 503 and unexpected/constraint failure 500. Unit verification confirms rollback connection failure discards the client while preserving the original error. No automatic write retry exists; a connection/COMMIT error can leave an uncertain outcome, which must be inspected with reads before any deliberate retry. P0 still has no idempotency header.

Lock semantics checked against [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html); acquired row locks remain until transaction end. Applied Supabase/Postgres skill guidance. Supabase's changelog markdown fetch returned 503; no new Supabase SDK/platform feature was added. No hosted advisor/project access was needed.

## Financial reconciliation

The unchanged T18 account-balance repository is authoritative. For opening source 200.00, destination 100.00, transfer 25.00:

| Direction | Source | Destination |
|---|---:|---:|
| Asset → asset | 175.00 | 125.00 |
| Asset → card | 175.00 | 75.00 debt |
| Card → asset | 225.00 debt | 125.00 |
| Card → card | 225.00 debt | 75.00 debt |

For each combination, actual API create, amount update, source/destination reassignment and delete reconcile all four test accounts and archived-inclusive net position. Independent expected arithmetic is integer cents in test-only BigInt; production remains PostgreSQL NUMERIC. Exact 0.10/0.20/combined 0.30 and 999999999.99 effects pass, including derived values beyond input bounds. Asset-to-card overpayment produces -50.00 card credit; outgoing card movement retains debt-positive semantics. Deletion removes both effects through the current transfer row, with no manual reversal.

Independent owner-scoped transaction income/expenses/net savings and real V1 summary remain identical throughout transfer CRUD and races. Only actual transactions enter those totals. No new dashboard/analytics endpoint is claimed; existing summary/repository isolation is demonstrated.

## Cursor lists

Exactly accountId/from/to/limit/cursor; accountId matches either direction, dates combine inclusively with AND and allow one-sided/future read ranges. Foreign/missing account filters match 404 even when a future range would return no rows. Unknown/search/type/recurring, repeated/bracketed keys, invalid UUID/calendar/ranges and malformed limits fail before SQL.

Reuse T24's strict version-1 HMAC-SHA256 codec with explicit transfers resource, verified owner, 24-hour expiry and fixed-order normalized accountId/from/to/limit scope hash. Default 25, maximum 100; fetch limit+1, return only limit/nextCursor/hasMore. Invalid cursor decode precedes account visibility/transfer SQL. Server-only dedicated CURSOR_SIGNING_SECRET remains exactly 64 hex characters; missing/malformed key returns 503 CURSOR_UNAVAILABLE without querying, while CRUD/health remain available. No random production fallback, new secret, count/offset/previous cursor.

Actual API traversal of 57 rows at limits 1/25/100 and account/inclusive date scopes matches an independent ordered admin query without duplication or omission. Fixtures include tied dates/timestamps and adjacent PostgreSQL microseconds. Keyset continuation uses date/created_at/id DESC with full six-digit UTC timestamp precision. Deleted anchor and newer insertion cases pass. Wrong owner/resource/scope/limit, tampered tokens, expiry and rotation are tested across unit/HTTP cases. Existing transaction cursors retain their exact default resource/payload/error message; T24 regression passes. Paging is not an immutable historical snapshot.

## Disposable run and quality results

Only `.tmp-v2-t26/pgdata-copy`, copied from the stopped synthetic T25 cluster, ran on IPv4 loopback port 55451. Its reset helper verifies the exact data_directory before replacing only the copy's database/test roles with an empty template0 database. This preserves the established workaround for Windows Application Control preventing fresh initdb. Original clusters are untouched. The fixture guards refuse remote/credential/options/initialized databases, load no .env and use no DATABASE_URL fallback.

Existing two V1 migrations → four T11 migrations → T12 categories → T15 constraints on empty financial tables → synthetic identities → actual local ES256/JWKS/T09 tokens → runtime-role domain fixtures/tests. All transfer CRUD uses expense_tracker_app; explicit DDL/TRUNCATE/role creation/escalation remains denied. No new grants. Shared T16 private-schema/browser-role/trigger protections also pass.

- Backend lint, typecheck, production build and explicit server/runner ESLint: passed.
- Full backend suite with only T26_DISPOSABLE_DATABASE_URL: **79 tests; 63 passed, zero failed, 16 environment-gated skips**. Other standalone fresh-cluster groups remain unset; their domain checks run through the shared integration, not independently claimed.
- Fresh integration: **917 transfer grouped checks, 11 races, 11 rollback faults**; plus **599 T16**, **263 T17 account**, **285 T18/T19/T20 balance/summary**, **244 T21 CRUD**, **263 T22 search**, **3,263 T23 filter**, **6,065 T24 pagination** checks. T24 still traverses 10,023 rows over 101 pages. Counts describe grouped helper assertions, not raw HTTP-request totals.
- V1 route/service/validator implementation is unchanged by T26. Real legacy read/filter/summary and ownerless-write rejection checks pass; transfers leave V1 summary unchanged. Existing production cutover/retirement requirements remain separate.
- No frontend source changed; no frontend suite was necessary. No dependency/lockfile changed.

Reproduce after backend build on a fresh guarded local fixture: set only T26_DISPOSABLE_DATABASE_URL to its approved password-free loopback database, then run `npm.cmd --prefix backend test`. Each fresh integration consumes an empty database; reset only an exact verified disposable copy or use another fresh fixture before repeating. Stop the copied cluster afterward. At delivery pg_ctl reports no server and a direct loopback TCP probe returns ECONNREFUSED. The test server had already exited before the final stop attempt, which found no process; its ignored copy retains a stale postmaster.pid marker. No running database remains; graceful shutdown is not claimed.

## T26 file inventory and next task

Created backend/src/types/transfer.ts, validators/transfer.ts, utils/transfer-mapper.ts, services/transfers.ts, routes/transfers.ts, tests/v2-transfers.test.mjs, tests/helpers/v2-transfers.mjs and this report.

Updated backend/src/app.ts, src/index.ts, server.mjs (route/service wiring), src/utils/transaction-cursor.ts (resource parameter with transaction default unchanged), tests/helpers/v2-isolation.mjs and scripts/verify-v2-isolation.mjs (actual transfer API extension), docs/v2/06-api-design.md, 07-implementation-plan.md, t16-verification.md and .gitignore. Database design needs no ambiguity correction and is unchanged by T26; no schema file changed.

No genuine blocker remains. Ready for **T27 — Verify Transfer Atomicity and Concurrency** as the separate focused gate, preserving the user's instruction not to start it. Transfer UI is T28; it is unchanged/disabled here. Nothing was applied remotely.

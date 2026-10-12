# T24 — Cursor pagination verification

**Status: Completed locally on 2026-10-08 (Africa/Cairo).** No remote access, deployment, schema migration, seed/backfill or production configuration change. T25 is ready and unstarted; existing workspace work is preserved.

## Pagination contract

Authenticated GET `/api/v2/transactions` accepts the existing seven filters plus limit/cursor. Default limit 25; canonical decimal integers 1–100 accepted. Blank, padded, signed, leading-zero, decimal/exponent, zero, over-100, repeated and bracketed limits are rejected with structured 400 validation. Limit defaults only when omitted.

The response is `{data, meta: {limit, nextCursor, hasMore}}`. No count, total-count query, offset/page number, previousCursor or navigation UI. Fetch limit+1 matching rows in PostgreSQL, return at most limit resources, and sign the last **returned** tuple only when an extra row exists. Empty/final/exactly-full final pages have hasMore=false and nextCursor=null. All 14 public transaction fields and exact monetary/date/recurring mapping stay unchanged.

## Cursor design and validation

Version-1 base64url JSON payload plus base64url HMAC-SHA256 signature. Payload binds transactions resource, verified user, last returned date/createdAt/id, SHA-256 query scope, issuedAt and expiresAt. Each cursor expires exactly 24 hours after issuance. Signature integrity is not encryption; the cursor is an opaque client token, not a source of authority independent of authentication. It contains no descriptions, account/category names, email, auth tokens or secrets.

Fixed-order scope hashes normalized q/type/accountId/categoryId/from/to/recurring/limit; cursor itself is excluded. Blank/omitted q, trimmed q, normalized UUID case and omitted/explicit default limit canonicalize consistently. q case/content changes, any filter changes and page-size changes require a new first page. Existing lowercase enum and exact date semantics are unchanged.

Validate bounded length (2,048 characters), structure, canonical base64url, 32-byte signature using timingSafeEqual, strict JSON object keys, version/resource, canonical UUIDs, real dates, exact UTC timestamp shape, scope/user binding, safe integer issuance/expiry, future issuance and expiry. Missing fields, extra fields, malformed JSON, bad dates/timestamps, unknown version/resource, payload/signature tampering, wrong user/scope, expiry and secret rotation produce the same generic 400 VALIDATION_ERROR cursor message. Repeated/bracketed query shapes retain structured query validation. Cursor validation precedes reference lookups and transaction SQL.

## Tuple correctness and search/filter preservation

Continuation SQL uses `(t.transaction_date,t.created_at,t.id) < ($date::date,$timestamp::timestamptz,$id::uuid)` under ORDER BY date DESC, created_at DESC, id DESC. PostgreSQL compares UUIDs; no JavaScript continuation sorting. All values are bound, and the existing owner predicate, ownership-safe joins and AND-composed filters/grouped ILIKE search remain authoritative. T23 foreign/missing reference filters without a cursor keep identical 404 behavior. Invalid cursors fail before reference lookup, revealing no additional reference information.

**Timestamp precision:** select a private UTC to_char projection with all six PostgreSQL fractional digits for cursor creation. Do not round the tuple through pg's JavaScript Date parser. Public createdAt retains its existing millisecond format. An adversarial unit fixture has two distinct microsecond timestamps within the same public millisecond; the generated token and next SQL parameters retain the precise boundary, and the private projection never appears in public resources.

Real A/B fixtures each contain 122 rows across three dates, two multi-row batches creating exact date/createdAt ties, distinct batch timestamps, an income row and a generated row with durable occurrence. Default/1/100 page traversal equals independently ordered SQL IDs exactly, without duplicates/skips. Search, every T23 filter and all filters combined are traversed with limit=7 and compared to complete regression collections. Empty and exactly-one generated results have terminal metadata. Resource fields and exact 0.01/0.10/999999999.99 strings remain intact.

Cross-user tokens and changed q/type/account/category/from/to/recurring/limit all fail generically. Equivalent trimmed/blank/default/UUID-case requests continue successfully. Tamper coverage includes altered payload bytes, user, sort ID, scope hash and signature, as well as validly signed malformed payloads in codec tests.

## Mutable data and deep traversal

Keyset paging is not an immutable snapshot. Deleting the anchor still permits tuple continuation. An insertion newer than the anchor does not shift the next page. Deleting an unseen row and moving another unseen row ahead of the anchor changes membership as expected; continuation returns the remaining older rows. Clients refresh/reset navigation after financial mutations, with Previous cursor history deferred to T25.

Reused T22 scale owner: **10,023 rows across 101 HTTP pages at limit=100**, equal to the independently selected full ordered ID set. No duplicate or skipped row; final nextCursor=null. A/B smaller fixtures traverse independently, and A cursors submitted by B are rejected with no owner detail. T21 generated-delete marker preservation and T23 archived-history behavior pass in the same run.

## Performance and index decision

Reuse the 20,000-row T22 bulk fixture plus existing domain/smaller pagination fixtures. No new index/schema/extension. Capture actual production paginated SQL/parameters and run runtime-role EXPLAIN `(ANALYZE, BUFFERS, FORMAT JSON)`. Local PostgreSQL 17.11 measurements below include the list SELECT, not reference prechecks or HTTP serialization.

| Query | Limit | DB rows (including lookahead) | Planning ms | Execution ms |
|---|---:|---:|---:|---:|
| First unfiltered page | 100 | 101 | 0.486 | 0.388 |
| Deep unfiltered after 50 pages | 100 | 101 | 0.560 | 0.460 |
| Search first page | 25 | 26 | 0.849 | 13.890 |
| Search continuation | 25 | 26 | 0.863 | 11.180 |
| Account/date first page | 25 | 26 | 0.540 | 0.242 |
| Account/date continuation | 25 | 26 | 0.554 | 0.269 |

First/deep unfiltered plans use transactions_user_order_idx with nested-loop/memoized reference joins and an early Limit. Account/date plans use transactions_user_account_date_idx plus incremental sort. Search plans use existing transactions_account_idx with owned-reference joins, filtering and bounded sort. Existing indexes suffice at this scale; no planner forcing or speculative index. Single local warm-cache measurements do not establish production latency. Search remains a literal ILIKE scan where needed, as required by T22.

## Environment and staged behavior

Dedicated backend-only CURSOR_SIGNING_SECRET: **32 cryptographically random bytes encoded as exactly 64 hexadecimal characters**. Generate privately, share the same configured key across backend instances and never reuse database/JWT/service-role credentials. backend/.env.example supplies only an empty entry and instructions; README documents local setup. Runtime entry points pass configuration explicitly; there is no implicit per-process random fallback.

Missing/malformed configuration safely returns 503 CURSOR_UNAVAILABLE for authenticated transaction listing before database access. V1-only startup, public health and V2 CRUD remain available, matching staged configuration conventions. Tests cover those boundaries. Single-key rotation invalidates old cursors; restart at the first page. No production key was provisioned or committed. Tests use ephemeral random keys, never returned in verifier results or diagnostics.

## Quality and disposable lifecycle

- Backend lint, typecheck, build, and explicit ESLint of server.mjs/shared runner passed.
- Full backend suite with only T24_DISPOSABLE_DATABASE_URL selected: **73 tests, 58 passed, 0 failed, 15 environment-gated skips**. All six T24 tests ran, including fresh integration.
- Fresh integration: **6,065 T24 grouped checks**, plus **599 T16 isolation**, **263 account**, **285 balance/summary**, **244 T21 CRUD**, **263 T22 search**, and **3,263 T23 filter** checks. Counts include grouped resource/ordering checks, not request counts. Existing locking races and rollback faults pass.
- After expanding missing-field/tampered-field parser cases and splitting validation into readable checks, build/lint/typecheck and all five non-integration T24 tests passed again. Parser behavior is unchanged; no second fresh run is claimed.
- Prior full-set regression assertions now use **test-only collectors over real bounded service/HTTP pages**. They reconstruct meta.count only inside the legacy regression harness; the wire contract is asserted directly through rawRequest by T24. No unbounded production list path was retained. Updated T22/T23 plan regressions measure bounded first pages while still verifying complete collected results.
- Real V1 read/filter/summary compatibility and unchanged ownerless-create rejection pass inside the shared regression. Standalone environment-gated suites remain skipped as reported, not separately claimed. No frontend source or dependency/lockfile changed.

Only `.tmp-v2-t24/pgdata-copy`, an ignored copy of the stopped synthetic T11 cluster, ran at 127.0.0.1:55451. The reset helper verified exact data_directory before replacing only the copy's postgres database/fixture roles; original cluster directories were unchanged. Existing Windows fresh-initdb limitations are unchanged from T21–T23. Guarded setup applied two V1 migrations, four T11 migrations, T12 reference seed and T15 constraints, with fourteen synthetic Auth identities after this run. No application .env/hosted fallback in the integration harness. The disposable cluster was stopped after verification.

Rerun: build backend; prepare a fresh password-free guarded loopback database; explicitly set T24_DISPOSABLE_DATABASE_URL to the existing approved local fixture URI; run `npm --prefix backend test`. Select one fresh-cluster suite per database. Existing T16–T23 shared runners now include T24 too. Stop the cluster afterward.

## T24 file inventory and next task

Created:

- backend/src/utils/transaction-cursor.ts
- backend/tests/v2-pagination.test.mjs
- backend/tests/helpers/v2-pagination.mjs
- backend/tests/helpers/transaction-pages.mjs
- docs/v2/t24-verification.md

Updated:

- backend/src/types/v2-transaction.ts, validators/v2-transaction.ts, services/v2-transactions.ts, routes/v2-transactions.ts — page contract, query validation, exact tuple, bounded SQL and response
- backend/src/index.ts and backend/server.mjs — dedicated private configuration wiring
- backend/.env.example and README.md — key setup/staged behavior/rotation
- backend/tests/helpers/v2-isolation.mjs — ephemeral key and raw page transport/full-set regression collector
- backend/tests/v2-transactions.test.mjs, v2-search.test.mjs, v2-filters.test.mjs and corresponding helper files — pagination-aware regression probes/collectors/SQL plan expectations
- backend/scripts/verify-v2-isolation.mjs — shared pagination verification
- docs/v2/04-architecture.md, 06-api-design.md and 07-implementation-plan.md — final implementation mechanics/current checkpoint
- .gitignore — disposable T24 artifacts

No genuine task blocker remains. Ready for **T25 — Build Transactions Page**. No frontend Next/Previous/search/filter/page integration was started; no offset pagination or previousCursor was implemented; nothing was applied remotely.

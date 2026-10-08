# T16 — Expand Multi-User Isolation Tests

**Status: ✅ Foundation completed locally on 2026-10-07 (Africa/Cairo).** Current implemented V2 profile/category scope has no observed cross-user isolation defect. T16 remains an expanding test gate as each domain lands; T59 is final P0 isolation acceptance. T17 has not started.

No remote database/Auth access, production migrations, RLS, runtime privilege expansion, Accounts API, V1 retirement, deployment, application-source or frontend change was made. No constraints were weakened. The private-schema + Express authorization architecture is unchanged.

## Central harness and verification path

`backend/tests/helpers/v2-isolation.mjs` provides stable synthetic User A/B fixtures, a third bootstrap user, a missing-Auth identity for safe error tests, disposable connection/schema guards, owned fixture builders, complete financial snapshots, signed JWT/JWKS setup and shared rejection/error assertions. A/B each have a profile, two accounts, income/expense/both and archived custom categories, income/expense transactions, a transfer, recurring definition/posted occurrence, budget and linked goal. No real users or hardcoded production IDs are used.

Fresh portable PostgreSQL 17.11 ran only on loopback port 55451, password-free local admin/database, under ignored `.tmp-v2-t16/`. The harness refuses remote hosts, credentials, URL options, other database/admin/port/protocol, existing private/auth schemas and existing app/browser roles. A public test marker plus minimal private auth.users UUID fixture model local FK/grant prerequisites. No .env loading or DATABASE_URL fallback exists.

Canonical T16 path: two unchanged V1 migrations → four unchanged T11 migrations → T12 reference seed → unchanged T15 constraints on empty financial tables → synthetic Auth users → real profile bootstrap → runtime-created owned financial fixtures → isolation suite. No historical backfill is needed on this empty T16 fixture. Separately, the original T15 verifier ran its complete T14 backfill path on another fresh cluster. All clusters started for this task were stopped.

The API harness uses generated ephemeral ES256 keys and an actual local HTTP JWKS endpoint. Production T09 middleware performs issuer/audience/role/expiry/signature verification; real T12/T13 services query PostgreSQL as expense_tracker_app. Auth identity is not mocked. Only assertion-helper unit tests use synthetic HTTP response objects, without registering fake production endpoints.

## API-level coverage

- A and B tokens resolve to their respective profiles even when signed user_metadata claims contain the other owner's ID. Missing tokens produce 401 AUTH_REQUIRED; malformed JWT, foreign issuer/audience/role, wrong signing key and expired tokens produce 401 AUTH_INVALID.
- GET/PUT/bootstrap use only verified sub. Bootstrap races create exactly one profile per owner and preserve existing timestamps/defaults. Valid concurrent updates return the correct owner/name and preserve createdAt. Unknown owner fields on PUT and bootstrap are rejected; full profile row snapshots confirm both owners remain unchanged after injection attempts.
- Both owners' category results match exact owned/system IDs and deterministic order for all combinations of active/archived and omitted/income/expense/both kind. Independent fixture counts also verify results, so a reused SQL predicate cannot hide a leak. Foreign custom IDs and owner fields are absent; meta.count matches the returned list.
- Unknown pagination/order/filter-ID parameters, malformed IDs, duplicate/bracket filters, empty values and SQL-like kind/status values return 400 VALIDATION_ERROR. Current categories have no pagination contract; this tests strict rejection, not an unimplemented cursor flow. Unsupported category mutation methods return 405 METHOD_NOT_ALLOWED.
- Every checked API error uses the existing error envelope and no-store behavior. A missing Auth FK during bootstrap is sanitized to 500 INTERNAL_ERROR; no raw DB detail reaches the client.

## Owner injection and hidden-resource policy

PUT /profile and POST /profile/bootstrap reject userId, ownerId, createdBy, profileId, user_id, nested owner/profile IDs and server timestamps. All profile methods and category GET reject query owner overrides in both A→B and B→A directions. Valid signed metadata also cannot override identity.

There are no resource-ID profile/category endpoints today. Appending foreign, nonexistent or malformed IDs gives the same generic 404 ROUTE_NOT_FOUND; GET/PUT/DELETE variants cannot reveal existence or mutate records. This is routing behavior, not proof of future resource-specific authorization. Self-profile absence follows the frozen 409 PROFILE_REQUIRED bootstrap contract.

`expectForeignResourceHidden()` defaults to 404 NOT_FOUND and requires an owned route to return 200 before comparing foreign and nonexistent responses. Future resource tasks must use this mode with actual endpoints, including PUT/DELETE as their contracts permit. Unit tests demonstrate detection of a differing foreign-owner message and refusal to claim resource isolation without an owned route. No new domain endpoints were created to satisfy the helper.

## Database integrity and authorization distinction

The limited shared backend role has access to all owners; it has no authenticated end-user identity inside PostgreSQL. It can create an otherwise valid account for any existing Auth UUID and can perform unscoped reads/mutations permitted by grants. Consequently, T16 does **not** claim SQL-role tenant isolation, standalone account-owner inference, or cross-user delete authorization from FKs. Future account/domain services must bind verified request identity and use ownership predicates before returning/mutating data.

T15 constraints reject malformed links and immutable-owner changes independent of service checks. For each A→B and B→A direction, direct runtime tests reject foreign transaction account/category/definition references and owner changes; transfer source/destination inserts/updates; recurring account/category inserts/updates; occurrence definition/generated links and duplicate dates; foreign or income-only budget categories; foreign goal links; and account/custom-category owner reassignment. Both owners can use system income/expense/both categories, own resources, valid expense/both budgets, compatible recurring categories, and nullable or owned goal links.

Explicit test-only parameterized SELECT/UPDATE/DELETE predicates return no foreign row, and per-owner transaction export-style projections contain exactly their own IDs. These are reusable future service query patterns, not deployed API/export implementations. An unscoped runtime count deliberately confirms both owners are visible, keeping this distinction explicit. Account/category archive-only and occurrence preservation rules remain verified by T15.

## Isolation matrix

API = real current endpoint; DB = native integrity; Pattern = test-only future owner-scoped SQL/hidden-resource hook. Future cells are not claimed endpoint coverage.

| Domain | Read | Create/link | Update | Delete | List/aggregate/export |
|---|---|---|---|---|---|
| Profile | API self | API bootstrap | API + immutable DB owner | No endpoint | N/A |
| Categories | API owned/system | DB owner integrity; writes future | DB owner integrity; API future | T15 archive-only; API future | API filters/order/count |
| Accounts | T17 API owned/foreign hiding; T18 scoped balances | T17 API owner binding/injection rejection + DB references | T17 API locks/foreign hiding + immutable DB owner | T17 archive/restore API; DELETE 405 | T17 API filters/order/count; T18 list/detail balance equality and owner-scoped net position |
| Transactions | Pattern; API future | DB owner links | DB links/owner + Pattern | Pattern; API future | Per-owner DB totals/projection Pattern; API future |
| Transfers | T26 API owned/foreign hiding, archived history | T26 API both-account ownership/injection rejection + DB links | T26 API full PUT/foreign hiding/ordered locks + DB links | T26 API owned hard-delete including archived parents | T26 owner-scoped account/date filters and signed resource/user/scope-bound cursor pages; T18 net-position reconciliation |
| Recurring definitions | Pattern; API future | DB account/category ownership | DB links + Pattern | Pattern; API future | Future |
| Recurring occurrences | Pattern; API future | DB definition/generated ownership and uniqueness | DB links + Pattern | Runtime deletion denied in T15 | Processor/API future |
| Budgets | Pattern; API future | DB own/system expense/both | DB category + Pattern | Pattern; API future | Future |
| Goals | Pattern; API future | DB nullable/own account | DB link + Pattern | Pattern; API future | Future |

Dashboard/analytics/current financial-domain endpoints do not exist yet. P1 report/export/notification endpoint tests remain deferred unless promoted. No cursor or aggregate endpoint coverage is claimed.

## Runtime and browser boundary

Runtime attempts to disable triggers, drop constraints, TRUNCATE, create tables/roles, change schema ownership, SET ROLE postgres, SET SESSION AUTHORIZATION postgres or read auth.users are denied. Role attributes remain non-superuser, no role/database creation, no bypass RLS and NOINHERIT. No extra grants were added for convenience.

anon/authenticated have no private schema USAGE, CRUD on any of the nine tables, or private function EXECUTE. Actual SET LOCAL ROLE reads fail; PUBLIC function EXECUTE is absent. Core RLS stays disabled as designed. A source assertion scans frontend source for direct `.from()` calls to private financial tables; the broader reviewed matches were Array.from utilities. No financial browser Data API calls were found.

## Concurrency, rollback, logs and money

68 HTTP operations ran concurrently across bootstrap/update/category rounds, with 124 grouped concurrency checks. Owners stayed distinct and final names matched their tokens. A third user safely recovers its own missing profile without disturbing A/B resources.

Every one of 58 rejected financial ownership writes uses a savepoint and compares complete rows/timestamps across eight financial/reference tables plus exact per-user totals/account balances. Two cases update a valid transfer in a CTE before attempting a foreign recurring link; rejection restores the earlier update too. Valid probe writes are rolled back. No partial/orphan write, timestamp mutation, owner side effect or financial drift remained.

| Fixture metric | Before | After |
|---|---:|---:|
| Transactions | 4 | 4 |
| Income | 30.00 | 30.00 |
| Expenses | 10.00 | 10.00 |
| Balance | 20.00 | 20.00 |
| A income / expenses / balance | 10.00 / 3.00 / 7.00 | Same |
| B income / expenses / balance | 20.00 / 7.00 / 13.00 | Same |
| A cash / bank balances | 6.50 / 0.50 | Same |
| B cash / bank balances | 12.50 / 0.50 | Same |

Only intended profile changes occur. Financial snapshots include exact PostgreSQL timestamp text. API error logging was captured and asserted to contain only two generic “Unexpected API error” lines for deliberate FK/V1 failures; no JWT, owner ID or financial payload appeared. Source review confirms arbitrary driver errors/credentials are not logged.

## V1 and production boundary

After T15, unchanged V1 list/single/summary reads return 200 with four retained fixture rows and exact totals. Old V1 POST without ownership fails with sanitized 500; no V1 implementation was changed. These legacy reads are unauthenticated/unscoped by the existing V1 contract, so this is compatibility evidence, not a secure V2 authorization path. Production must block/retire all V1 financial access at the planned cutover before enabling real V2 data. T16 does not perform that retirement.

Nothing was applied remotely. Fresh-cluster grants are exactly the existing migration grants. No production users, owner IDs, Auth keys, service/admin credentials, database URLs or tokens were added to documentation.

## Quality evidence and rerun

- Backend production build, typecheck, lint and explicit verifier ESLint passed. Build needed sandbox escalation to overwrite existing generated dist files.
- Full suite on a fresh T16-selected cluster: 47 tests, 38 passed, 0 failed, 9 environment-gated groups skipped. Its T16 integration passed **599 grouped checks**: 257 API, 58 DB rejections, 68 positive DB/predicate/reconciliation, 92 privilege/logging, 124 concurrency. Helpers perform additional assertions within each group; the count is not individual HTTP requests or raw assertions.
- Separate fresh T15 verification: 2 tests passed, 207 T15 checks plus 64 T14 checks, no failures/skips.
- Separate fresh T11 verification: 339 checks passed.
- Pre-T15 baseline cluster with real V1/T12/T13 integration enabled: 47 tests, 43 passed, 0 failed, 4 fresh-cluster groups skipped. Those groups ran separately; T14 ran inside T15. Baseline write/cleanup cases intentionally run before ownership enforcement.
- After tightening the future hidden-resource helper, its guard/error/source unit tests and lint passed again; the change does not affect current ROUTE_NOT_FOUND integration assertions.
- No frontend/shared frontend source was changed, so no visual/frontend suite was required. Secret/whitespace review passed for the T16 files.

For a fresh ignored local cluster, build backend, set only T16_DISPOSABLE_DATABASE_URL explicitly to the approved password-free loopback fixture, then run `node --test tests/v2-isolation.test.mjs` or `node scripts/verify-v2-isolation.mjs` from backend. Never reuse a production/ordinary development database. Existing-schema guards intentionally reject reruns on a used cluster; create a new disposable cluster and stop it afterward. For full regressions, run fresh-cluster groups separately and pre-T15 write tests on a distinct baseline cluster.

## Changes and next gate

**T26 extension (2026-10-08):** actual authenticated transfer GET/list/POST/PUT/DELETE now run in the shared JWT/runtime harness. Both A→B and B→A attempts to read/edit/delete foreign transfers or select foreign source/destination/filter accounts match missing-resource 404s. Lists independently contain only owned rows; owner/server-field injections reject with complete financial snapshots unchanged. The transfer extension passed 917 grouped checks, 11 forced locking races and 11 rollback faults alongside all original T16–T24 checks. Exact asset/card effects, net position, income/expense exclusion, archived history and signed resource-bound pagination are verified. This supersedes the Transfers matrix's original future-API cells. No recurring/analytics/export endpoint delivery is claimed. See [T26 verification](t26-verification.md).

**T21 extension (2026-10-08):** the real JWT harness mounts transaction CRUD and runs 244 transaction checks, four real locking races and three post-write rollback faults under the limited runtime role. A/B read/list/create/update/delete and account/category reference selection are scoped; invisible IDs match missing-resource responses. Archived history, generated identity/marker preservation, exact asset/card balances and V1 read compatibility are covered. Original 599 isolation, 263 account and 285 balance/summary checks pass in the same fresh run. Search/filter/cursor, transaction frontend and transfer APIs remain deferred. See [T21 verification](t21-verification.md).

Central helper: `backend/tests/helpers/v2-isolation.mjs`. Added runner `backend/scripts/verify-v2-isolation.mjs`, suite `backend/tests/v2-isolation.test.mjs`, and this report; updated `.gitignore` for test artifacts and implementation plan T16/checkpoint. Architecture/database/API contracts needed no correction; no production abstraction was added for tests.

No genuine T16 blocker remains in implemented scope. The original T16 checkpoint preceded T17. **T17 extension (2026-10-07):** the real auth harness now mounts Accounts; the verifier runs 263 grouped account checks after the original 599-check reconciliation, including owned/foreign GET/PUT/archive/restore, strict owner injection, lists, exact money, lifecycle rollback and four database races. See [T17 verification](t17-verification.md). Other future-domain cells remain deferred. Next: **T18 — Build Account Balance Queries**.

**T18 extension (2026-10-07):** 191 additional grouped balance checks use the production repository under expense_tracker_app and actual account HTTP endpoints. A/B lists and details agree with independently selected owned IDs; scoped net positions stay distinct and foreign balance IDs return 404. Complete snapshots verify read-only behavior. All 599 original checks and 263 T17 checks still pass. No dashboard/analytics/transfer API coverage is claimed. See [T18 verification](t18-verification.md). Next: **T19 — Build Accounts Page**, not started.

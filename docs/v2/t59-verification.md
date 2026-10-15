# T59 — Multi-User Security Acceptance

**Status: Completed locally, 2026-10-15 (Africa/Cairo).** Starting clean, synchronized `main`: `03f025fc0790667c060e309387c152c58861c26f`. No unresolved P0 multi-user security issue remains in the implemented local scope. T35/T41/T47/T50–T56 remain optional/deferred. T60 is not implemented by this task.

## Threat scope and environment

An authenticated malicious tenant knows another tenant's valid UUIDs and attempts reads, mutations, foreign references, search/filter/pagination reuse, ownership injection, lifecycle actions and aggregate inference. Unauthenticated clients, malformed/forged JWTs, browser-origin restrictions, browser database roles, accidental logging/bundling of secrets, and session changes with pending requests are included. Database credentials/server compromise are outside tenant authorization: the shared runtime role is **not tenant-scoped**.

A new PostgreSQL 17.11 cluster was initialized under ignored `.tmp-v2-t59/pgdata`, listening only on `127.0.0.1:55451`. Node 24.19.0/npm 11.17.0 executed a starting-HEAD `git archive` snapshot with both locked dependency installations from the local npm cache. No private application `.env` was copied. Synthetic A/B/C users and real ES256 signatures/local JWKS exercise production authentication middleware. The eight migrations, nine-system-category seed, ownership constraints, occurrence invariants and limited runtime/browser privileges are applied by the guarded fresh initializers. Legacy regression stages deliberately use their documented earlier schema.

The dedicated runner verifies the actual server data directory and absence of previous clients before resetting the disposable database/roles. A/B fixtures have profiles, distinct custom categories, active/archived accounts, transactions/transfers, definitions/occurrences/generated postings, budgets and goals. Additional browser fixtures make B financially distinctive (999999.00 opening balance and 999.99 expense versus A's 111.00/1.11). Same-name account/category/goal/description cases are exercised by the domain suites; authorization remains UUID/owner-based.

## Route authentication inventory

All paths below are relative to `/api/v2`. Each private route is registered through its domain router's `router.all(..., requireAuth, allowMethods(...))`, before service dispatch. Middleware discards any pre-existing identity and verifies ES256, exact issuer/audience, required exp/sub/role, UUID subject, authenticated role, signature and optional nbf. Owner is exclusively `req.auth.userId`. OPTIONS is CORS preflight without data; unsupported authenticated methods return 405. Missing/malformed credentials cannot reach private SQL, including method fallthrough.

| Boundary | Routes / methods | Protection |
| --- | --- | --- |
| Public | GET health (V1 and V2) | Safe API/database reachability only |
| Profile | GET/PUT profile; POST profile/bootstrap | T09 JWT |
| Categories | GET/POST categories; PUT categories/:id; POST :id/archive, :id/restore | T09 JWT; management development-only |
| Accounts | GET/POST accounts; GET accounts/summary; GET/PUT accounts/:id; GET :id/summary; POST :id/archive, :id/restore | T09 JWT |
| Transactions | GET/POST transactions; GET/PUT/DELETE transactions/:id | T09 JWT |
| Transfers | GET/POST transfers; GET/PUT/DELETE transfers/:id | T09 JWT |
| Recurring | GET/POST recurring; GET recurring/upcoming; GET/PUT recurring/:id; POST :id/pause, :id/resume, :id/archive | T09 JWT |
| Dashboard | GET dashboard | T09 JWT |
| Analytics | GET analytics/overview | T09 JWT; absent from production registration |
| Budgets | GET/POST budgets; GET/PUT/DELETE budgets/:id | T09 JWT; absent from production registration |
| Goals | GET/POST goals; GET/PUT goals/:id; POST :id/complete, :id/archive | T09 JWT; absent from production registration |
| Cron | GET /internal/recurring/process (root path) | Separate exact CRON_SECRET; no user JWT or CORS |
| Retired/deferred | V1 financial routes; P1 reports/export/notifications | V1 financial 410 in runtime entry points; P1 routes absent |

Browser signup/login/reset/logout use Supabase Auth only. No private financial Supabase Data API calls exist. Local harness factories may mount historical V1 compatibility for regression; both actual runtime entry points set financialMode=v2, retiring that unscoped legacy service before its handlers.

## Owner-scoped SQL audit

The following **32 audit entries** cover every implemented private service/repository, shared SQL helper and intentional exception. Paths are under `backend/src/services/`. Public request identity originates in verified JWT sub; internal recurring work originates in a stored database owner. Inserts bind the trusted owner separately from validated editable fields. No public body, query, metadata or path chooses identity.

| # | File / functions | Operation and owner predicate / authority |
| --- | --- | --- |
| 1 | profiles.ts: get | SELECT profiles WHERE user_id=$1; verified sub |
| 2 | profiles.ts: ensureProfile/update | INSERT trusted user_id, ON CONFLICT; UPDATE WHERE user_id; no Auth-table read |
| 3 | categories.ts: list/read | is_system OR user_id=$owner, including archived rows |
| 4 | categories.ts: create/update/lockCustom | INSERT owner; locked visible lookup rejects system mutation; UPDATE id AND user_id |
| 5 | categories.ts: update kind-use probe | ID-only EXISTS after owned custom category lock; immutable owner/composite constraints make all custom references same-owner |
| 6 | categories.ts: archive/restore | id AND user_id; definitions and occurrence updates explicitly owner-scoped |
| 7 | accounts.ts: create/update/lock | INSERT owner; SELECT/UPDATE id AND user_id |
| 8 | accounts.ts: archive/restore | account, dependent definitions and occurrence updates owner-scoped |
| 9 | account-balances.ts: scoped_accounts/resources | user_id=$1 plus optional account/status; all account read APIs reuse it |
| 10 | account-balances.ts: transaction_totals | t.user_id=$1 AND joined account owner equals transaction owner |
| 11 | account-balances.ts: transfer_entries/netPosition | both UNION arms t.user_id=$1; owned account join; archived-inclusive owner aggregate |
| 12 | transaction-totals.ts: getTransactionTotals/CTE | user_id=$1, inclusive date range and optional account |
| 13 | v2-transactions.ts: list/read/getRecentTransactions | common source t.user_id=$1; same-owner account and visible category joins |
| 14 | v2-transactions.ts: list reference checks | account id AND owner; category id AND (system OR owner) before filter SQL |
| 15 | v2-transactions.ts: create/update/delete | trusted-owner insert; update locks id AND user_id; mutation predicates repeat owner |
| 16 | transaction-write.ts: lockTransactionReferences | account id AND owner, category id AND (system OR owner); active checks under locks |
| 17 | transaction-write.ts: insertTransaction | trusted owner bound explicitly; generated linkage internal-only, checked by database invariants |
| 18 | transfers.ts: list/read/filter | t.user_id=$1; source/destination joins match owner; filter account visibility checked |
| 19 | transfers.ts: create/update/delete/locks | sorted account locks WHERE user_id AND id=ANY; transfer locks/mutations id AND owner |
| 20 | recurring.ts: list/read/references | r.user_id; owned account and visible category; reference validation reuses posting locks |
| 21 | recurring.ts: create/update/pause/resume/archive | INSERT trusted owner; all UPDATE id AND user_id; ledger helpers take same owner |
| 22 | recurring.ts: getUpcomingRecurring | owned active definitions/parents; terminal occurrence exclusion WHERE user_id |
| 23 | recurring-occurrences.ts: definition/read/get/reserve | definition id AND owner first; occurrence owner AND definition AND date; INSERT same owner |
| 24 | recurring-occurrences.ts: post/transition/skip/reserved dates | owner-bound reads/updates; generated transaction receives same owner; no public occurrence endpoint |
| 25 | recurring-processor.ts: candidate scan/hasRemaining | intentional global scan; optional internal scopes, bounded due candidates return DB user_id |
| 26 | recurring-processor.ts: claim/post/failure/advance | candidate's DB owner rechecked under lock and propagated to ledger/posting; UPDATE id AND user_id |
| 27 | dashboard.ts: getDashboard | one read-only repeatable snapshot; passes identical owner to balances/totals/recent/upcoming |
| 28 | analytics.ts: overview/summary/monthly/category | account visibility checked in snapshot; all transaction aggregates WHERE user_id; visible category joins |
| 29 | analytics.ts: activity/commitments | owner-scoped transaction/transfer UNIONs/accounts/definitions/skipped ledger; forecast final join r.user_id=$1 |
| 30 | budgets.ts: progress/list/read | selected b.user_id=$1; spending join t.user_id=b.user_id even for shared system categories |
| 31 | budgets.ts: create/update/delete | visible category locked; INSERT owner; budget lock and UPDATE/DELETE id AND user_id |
| 32 | goals.ts: progress/list/read/create/update/complete/archive | WHERE user_id and optional id/status; link account id AND owner; all mutations owner-bound; manual savings independent of account activity |

No missing expected owner scope was found. The category-kind existence probe is safe because it follows authorization of a locked immutable custom category and only returns a boolean about valid references to that row. It is not a lookup oracle for arbitrary/foreign categories. The global processor is an internal multi-tenant operation, never a user-controlled owner API. Legacy transactions.ts is intentionally unscoped historical V1 code and is unreachable through actual retired financial routes.

## API A/B, aggregate and privacy matrix

| Domain | Executed acceptance |
| --- | --- |
| Profiles/categories/settings | Verified subject/bootstrap/display-name isolation; system categories shared; owned custom categories only; foreign update/archive/restore matches nonexistent; settings account choices owner-bound |
| Accounts/balances | CRUD/lifecycle/detail/summary including archived privacy; independent totals exclude foreign transactions/transfers/generated postings; four asset/card transfer directions |
| Transactions | CRUD, account/category/generated-field injection, B-only search empty, all 128 filter subsets, paging and archived history |
| Pagination | A/B cross-use, modified owner/signature, filter/limit/resource mismatch, expiry/key rotation; structured400 and no foreign rows |
| Transfers | Foreign list/get/edit/delete and either foreign account rejected; balances and posted income/expenses remain owner-specific |
| Recurring/ledger | Definition reads/lifecycle/references isolated; foreign get/reserve/post helpers404; concurrent global processing creates one posting per owner/date with no owner crossover |
| Dashboard/Analytics | Totals, position, account snapshots, recent/upcoming, series/category/activity/forecast independently reconcile; foreign account filters404 |
| Budgets/goals | Foreign lifecycle/CRUD/reference404; shared-category spending remains owner-specific; manual Goal savings do not change with linked account activity |
| Owner injection | userId/user_id/ownerId/owner_id/createdBy/profileId/accountUserId through every supported route's query and all write bodies, nested owner and metadata; strict400 and whole financial snapshot unchanged |
| Mass assignment | Derived/server fields, status/archive/system flags, timestamps and generated linkage rejected; Goal's documented editable active/completed status remains supported |
| Foreign/missing errors | Status/code/message/details/envelope equal where frozen; no belongs-to-another-user disclosure; known foreign UUIDs used |

Timing smoke alternates eight foreign and eight nonexistent reads for each of six domains in both directions. Foreign medians were 14.70–16.03ms; missing medians 14.86–15.91ms, with no gross distinction. Medians are recorded in the security evidence; this tests gross expensive foreign-only work, not constant-time behavior or a statistical side-channel guarantee.

## Database integrity, concurrency and rollback

The isolation foundation directly rejects 58 cross-owner/invariant writes under the runtime role, including transaction account/category/definition, transfer endpoints, recurring parents, occurrence owner/generated links, Budget category, Goal link and owner reassignment. Its 68 positive database checks verify owned/system references and zero-row owner-scoped foreign operations. Focused T15/T32 suites separately exercise the full constraint/trigger/terminal-state catalogs and corruption/reversal probes. Profile/Auth ownership FKs and archive-only parents remain intact. Runtime cannot disable triggers/constraints, escalate roles, perform DDL/TRUNCATE or read auth.users. anon/authenticated have no private financial schema/table/function CRUD access; PUBLIC has no private function EXECUTE.

Concurrent A/B requests and forced category/account archive versus posting/lifecycle races pass. T27 includes 29 forced races, 20 stress rounds/180 successful mutations, six rollback faults, uncertain commit and zero observed deadlocks. Other domain suites cover post-write injected failures and verify complete rows/timestamps/balances after rollback. The supplement races two global processors and checks exact A/B posting cardinality and owner equality against definitions. No partial cross-tenant write is accepted. Query plans and bounded set-based aggregates remain unchanged; no authorization N+1 fix was needed.

## Frontend session privacy

The verified flow is browser → owner-pinned T10 transport → real Express/JWT → limited-role PostgreSQL → protected rendering. Session epochs key the profile/protected subtree by user; stores abort reads/writes and invalidate generations on disposal. The token supplier refuses a different mounted owner. All domain stores and profile preparation suppress obsolete responses, including ignored-abort cases in automated tests.

T58 system/recovery regression is rerun locally. T59 adds populated A→populated B checks across Dashboard, Accounts/detail/transfer history, Transactions, Recurring, Analytics, Budgets, Goals and Settings; six open mutation dialogs with A drafts/references; explicit held-response release after switching for Dashboard/Transactions/Analytics/Settings; foreign account deep links; and API 401 protected-content clearing. T58 additionally tests actual local session expiry, a late successful A write, signed-out redirects and reload/restart persistence. Transfers live inside Accounts/detail, not a separate route. No A values should remain in shell, rendered page, dialog, draft or selectable options after switch.

## Cursor, cron, CORS and secret boundaries

JWT tests reject wrong issuer/audience/role/sub, expiry, future nbf, bad signature and malformed tokens, with no owner fallback. Editable JWT metadata never supplies identity. Cron tests deny missing/wrong secrets and user JWTs; a valid synthetic secret alone dispatches local processing, and cannot authenticate a normal user API. Cron accepts no query/body controls and returns/logs projected counts only.

The frozen cursor is HMAC-signed **not encrypted**: its caller-owned UUID and ordering tuple are readable. It contains no email, Auth metadata, financial description/amount, signing key or foreign identity. Profile already returns the caller's UUID. User/filter/limit/resource/time binding prevents reuse to access another tenant. This does not claim cursor ciphertext or anonymity of the caller's own ID.

CORS returns only the configured exact frontend origin, never wildcard or attacker reflection; credentials are not granted. A direct attacker-origin HTTP request can receive a response, but its origin cannot read that response in a browser. CORS is not tenant authorization. Browser Supabase access remains Auth-only; database browser roles remain denied private CRUD. Cursor/cron/database credentials and connection CA configuration stay backend-only. Generic unexpected-error logging never prints arbitrary driver objects.

Backend/frontend source, compiled frontend chunks and source maps are scanned alongside representative local logs. Raw synthetic tokens, keys, cursors, snapshots and logs remain ignored; committed evidence contains sanitized counts/check names and synthetic IDs only. Pattern scans are finite checks, not a proof against every possible secret encoding.

## Findings, limitations and production boundary

No application security defect has been found in the executed gates. Initial harness execution needed sandbox permission for PostgreSQL restart; that system phase passed after permission. Test selector/fixture corrections are verification-only. No application source, schema/migration, grants, dependencies, lockfiles or financial semantics are changed by T59.

Verification uses synthetic JWKS and local PostgreSQL/Edge. It does not certify hosted Auth/financial acceptance, physical browsers, other browser engines, exhaustive concurrency schedules or constant-time side channels. Locally verified JWTs remain valid until expiration after provider sign-out; stronger immediate revocation is a separate frozen post-core design. Shared runtime credentials can access multiple users by design; constraints protect relationships, not arbitrary omitted owner predicates.

No remote database access/write, remote Supabase alteration, Vercel environment alteration, manual deployment, production gate removal or cron enablement occurred. Existing category-management and Analytics/Budgets/Goals registration gates remain. Production financial UI and Settings remain gated; `backend/vercel.json` keeps `crons: []`.

## Reproduction and results

Create a fresh `.tmp-v2-t59/pgdata` cluster on loopback port 55451 and a `git archive` source snapshot; install both lockfiles and build backend. Run `backend/scripts/verify-v2-security.mjs` with T59_DISPOSABLE_DATABASE_URL (password-free loopback postgres URL), T59_DATA_DIRECTORY (absolute new cluster path), T59_OUTPUT_DIRECTORY (ignored T59 subdirectory). It resets only the validated fresh cluster, runs the expanded T16 suite including transfer concurrency, then resets for the additional attack matrix.

For regression, adapt **only the snapshot copies** of verify-v2-backend-regression.mjs and verify-v2-backend-system.mjs from T57/t57 to T59/t59 and set corresponding T59 variables including PG_BIN. This preserves existing reset guards while selecting the new cluster. Run all 17 matrix suites and the three system phases. Run the general backend suite separately without disposable URLs; its 28 gated wrappers are covered by the fresh matrix.

For browser regression, adapt only snapshot path guards `.tmp-v2-t58`→`.tmp-v2-t59` in verify-v2-frontend-regression.mjs and t58-browser-api.mjs; retain T58 variable names/session fixture conventions. Set T58_SUITES=system,recovery and T58_DATA_DIRECTORY/TOOLS_ROOT/DISPOSABLE_DATABASE_URL. Start headless Edge CDP 9224 with its own ignored profile. After the system restart phase, run frontend/scripts/verify-v2-session-security.mjs with the same TOOLS_ROOT/OUTPUT_DIRECTORY against the still-running local API/frontend. Then run recovery. Browser scripts use no remote financial API.

| Gate | Executed result |
| --- | --- |
| Backend general suite | 132 named tests: 104 passed, 28 database-gated wrappers; zero failures. All gates covered by fresh matrix below. |
| T57 fresh matrix | 17 fresh runs, 57 passed groups, zero failures/skips |
| T57 integrated system | 829 checks across initial 670/recover 103/terminal 56, zero failures |
| T16 expanded foundation | 612 checks: 270 API, 58 DB rejections, 68 positive DB, 92 boundaries, 124 concurrent |
| T16 domain extensions | Accounts 263; balances 285; transactions 244; search 263; filters 3263; pagination 6065; transfers 917; recurring 31; Analytics 14; Budgets 15; Goals 25; T27 concurrency 4833. Counts are grouped assertions, not unique test cases. |
| T59 additional attack matrix | 156 route-authentication; 561 owner-injection; 275 mass-assignment; 6 occurrence denial; 2 concurrent processor; 19 boundary/log; 192 timing requests; zero failures |
| SQL ownership audit | 32 reviewed entries, zero unresolved findings |
| Frontend automated suite | 183 passed, zero failures/skips |
| T58 browser session regression | 33 system checks, 56 axe audits/zero violations; one restart gate covering 9 routes; 15 recovery checks |
| T59 browser supplement | 21 checks: 9 populated switches, 6 open dialogs, 4 explicit held responses, 1 foreign URL, 1 API 401 clear |
| Source/bundle/log scan | 709 files including 96 source maps, 45 logs, 754 file-level checks, zero findings |
| Backend configuration/secret scan | 33 checks, 347 files, zero recognized secrets; 9 documented/synthetic placeholders |
| Quality | Backend lint/typecheck/build; frontend lint/typecheck/tests/build; explicit lint of new verifier scripts; git diff --check pass |

Evidence: [security matrix/timings](assets/t59/security.json), [summary/regression](assets/t59/result.json), [migration inventory](assets/t59/migration-inventory.json), [browser privacy](assets/t59/session-security.json), [browser recovery](assets/t59/recovery.json), [restart](assets/t59/restart.json), [artifact scan](assets/t59/artifacts.json). Full synthetic raw logs/snapshots stay ignored. Repeated/shared assertions are not represented as one unique combined total.

Changes: three verification scripts (`backend/scripts/verify-v2-security.mjs`, `backend/scripts/verify-v2-security-artifacts.mjs`, `frontend/scripts/verify-v2-session-security.mjs`), this report/sanitized evidence, `.gitignore`, README and implementation-plan checkpoints. No product fix was required. Next core task from the plan: **T60 — Financial Reconciliation Tests**; do not start automatically.

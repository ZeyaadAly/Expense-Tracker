# T12 Result — V1 validation and testing

> **Historical checkpoint:** This report preserves the results and task/deployment state at its recorded date. Later-task and fixture-only statements are historical. Current local V1 evidence is in [T12 verification](t12-verification.md); current setup/status is in [handoff](07-handoff.md). T14 integrated deployment has not started.


**Date:** 2026-10-05 (Africa/Cairo)  
**Status:** ✅ Completed. All required local V1 gates pass; no unresolved critical issue. T13 has not started.

## Environment and isolation

Windows/PowerShell; Node 26.5.0, npm 12.0.2, PostgreSQL 17.11, Next.js 16.3.8, React 19.2.8, agent-browser 0.38.1/Chrome. Read the brief, requirements, database/API designs, implementation plan, T03 specification, T04–T11 reports, frontend AGENTS/CLAUDE, package scripts, and existing verification/test runners before edits. There is no backend AGENTS/CLAUDE file. Consulted the installed Next.js server/client guide and browser verification skills.

All test writes target new loopback clusters on **55442** (browser/persistence) and **55443** (clean-snapshot verification). Both migrations run in order in each fresh cluster. Test Express on 4108 uses the actual compiled application/router/service and the limited application role, with isolated failure injection and fixture administration. This wrapper is never a production entry point. Local trust authentication/non-TLS belongs only to these disposable tests; production connection/TLS code is unchanged.

Browser regressions initially ran against development on 3000. The final T12 continuous flow and live T08–T11 reruns use `next build`/`next start` on 3000 with the disposable API URL embedded at build time. T07's explicitly selected fixture regression requires development. Remote access is restricted to the configured health `SELECT 1` and `SELECT current_user`/TLS inspection; no remote transaction data, schema, grants, or secrets are modified.

The repository already contained uncommitted T10/T11 changes, which were preserved. Git reads use a command-local `safe.directory` exception; global Git configuration was not changed. Evidence directories are ignored.

## Quality gates and exact counts

Counts below are named Node test groups/browser assertions, not every loop iteration inside a group. Repeated executions are not added together.

| Gate | Final result |
| --- | --- |
| Backend lint / type-check / production build | Pass; zero lint errors/warnings |
| Backend full suite | **24 passed, 0 failed, 0 skipped**, including limited-role PostgreSQL CRUD and T12 money/date integration |
| Frontend lint / type-check / production build | Pass; zero lint errors/warnings; build completes |
| Frontend full suite | **22 passed, 0 failed, 0 skipped** |
| Frontend domain verification | One passing runner covering money/date/Unicode/category validation |
| T07 fixture browser regression | **69 passed** |
| T08 live browser regression | **61 passed** |
| T09 live browser regression | **58 passed** |
| T10 live browser regression | **34 passed** |
| T11 live browser regression | **86 passed** |
| T12 production CRUD/responsive/accessibility | **94 passed** |
| Final frontend/backend/PostgreSQL restart and repeated reconnect | **20 passed** (four phases × five checks) |
| Fresh-session production console/fixture exclusion | **7 passed** |
| Fresh migration/seed/constraint/trigger runner | Pass on each of two new clusters; three rows after seed twice |
| T12 schema/index/role/admin-denial checks | **14 passed** |
| T12 source/history/browser-bundle security/config checks | **15 passed** |
| Configured TLS health | Exact 200 success and exact 503 unavailable/no-store pass |
| Configured production identity/TLS socket | Limited role true; TLS socket authorized true |
| Clean source snapshot | Both locked installs, lint, type-check, builds and complete suites pass; fresh migrations/seed pass |

Final browser total: **429 passing named checks, zero final failures** (308 existing regressions + 94 T12 + 20 restart/reconnect + 7 production hygiene). Accessibility audits: **47 audits, zero violations** across the six browser suites (T07 6, T08 6, T09 3, T10 3, T11 9, T12 20). No high-severity violation remains.

## Requirements traceability

Every row describes the acceptance details verified together. Paths below are relative to repository root. Baseline provider/design work is historical evidence, not a new provider audit.

| Requirement / source | Implementation location | Verification | Status |
| --- | --- | --- | --- |
| Brief §3–8; requirements §1–2: agreed stack, EGP, one shared collection, no auth or extra features | Package manifests; `frontend/src/lib/transactions.ts`; migrations; API routes | Source/scope review, exact API envelopes; no product-feature changes | Pass |
| FR-01: five fields, Expense/Cairo defaults, empty amount/category/description | `frontend/src/components/transactions/transaction-form.tsx`; dashboard | T07/T08 defaults and browser creation | Pass |
| FR-01: type/category compatibility and shared Other | Form; `frontend/src/lib/transactions.ts` | Domain runner, T07/T08/T11; backend validators | Pass |
| FR-01: inline validation, retained values, cancel, pending locks, no duplicate POST | Form; dashboard; API client | T07/T08 browser and API-client tests | Pass |
| FR-01: confirmed save, authoritative reads, hidden-by-filter save, rejection/uncertainty recovery | Dashboard; API client | T08/T11, T12 seeded create and exact four-write evidence | Pass |
| FR-02: persisted list, every field/action, newest date/creation/ID order, all matching rows | `backend/src/services/transactions.ts`; transaction list/panel | T06 integration; T11 SQL/query tests; T08/T12 browser | Pass |
| FR-02: text labels and distinct initial empty state | Transaction list; summary; panel | T07/T08/T11 empty/nonempty/unknown count cases | Pass |
| FR-02: refresh and frontend/backend/database restart persistence | PostgreSQL; API reads; dashboard | T12 snapshot equality, ID absence and exact summary checks after each restart | Pass |
| FR-03: prefilled edit, full replacement, validation, cancel, same ID/createdAt, timestamp update | Form; routes/service; SQL trigger | T09 browser/backend, T12 money POST/PUT/GET | Pass |
| FR-03: changed filters/order, missing record, retained drafts, server/uncertain outcomes | Dashboard/form; API client | T09/T11 hidden edit, 404/503/500/lost response and read-only recovery | Pass |
| FR-04: identifying confirmation, cancel, one DELETE, 204, selected ID only | Delete confirmation; API client; routes/service | T10 browser/backend; T12 deletes Taxi, verifies 404 | Pass |
| FR-04: missing/failure/uncertain deletion, successful-delete refresh failure | Confirmation; dashboard | T10/T11 failure injection, GET-only recovery, pending Escape/duplicate lock | Pass |
| FR-05: global PostgreSQL totals/count, negative/empty/large sums, exact EGP strings | Service summary aggregate; summary components | Backend T06/T12; client tests; T12 exact totals table | Pass |
| FR-05: filters never alter summary; unavailable is not zero; post-write refresh | Dashboard; summary; API client | T08/T11/T12 request evidence and partial failures | Pass |
| FR-06: All omission, individual/AND filters, unique Other, incompatible reset, reset action | Filter bar/panel; query validator; service | T11 backend/client/browser; T12 combined filters | Pass |
| FR-06: no-match versus empty, active filters survive all writes | Dashboard/panel | T08–T11 hidden writes, reset and active-key mutation races | Pass |
| UI-01: single coherent dashboard | `frontend/src/app/page.tsx`; dashboard | All live browser suites; production fixture query ignored | Pass |
| UI-02: responsive layout without horizontal page scrolling or hidden actions | Global CSS; summary/list/forms/dialogs | T12 320/360/768/1024/1440; long 200-character description/large money/error states | Pass |
| UI-03: keyboard controls, visible focus | Buttons/native controls; global CSS | Actual Tab/Escape/focus commands; T07 visible focus; T12 containment/return | Pass |
| UI-04: labels, radio fieldset/select/input relationships, linked errors | Form/filter components | T07–T12 audits; T12 every invalid field's described-by IDs resolve | Pass |
| UI-05: named modal, containment, background inertness, initial/return/fallback focus, idle/pending Escape | `frontend/src/components/ui/dialog-shell.tsx` | Native showModal review; T07/T09/T10/T12 keyboard and pending behavior | Pass |
| UI-06: independent initial/read loading, progress, duplicate locks | Read hook/controller; dashboard/forms | T08 loading, T11 updating/dedup, all pending mutation runners | Pass |
| UI-07: independent list/summary/both failure and scoped retry | Read hook; dashboard; summary/panel | T08/T11 exact GET scopes and dedup; T12 error audits | Pass |
| UI-08: plain text descriptions and HTML-like text | List/form React text children | T07 stress HTML-like text; backend literal SQL-like description integration | Pass |
| UI-09: readable status/type/balance, live regions, no color-only meaning | Feedback/summary/badges/panel | T07–T12 audits; T11 single loading announcement and polite stale feedback | Pass |
| UI specification: 44px targets and reduced motion | Global CSS/buttons | T12 visible main control target geometry; T11 actual preference and static computed animation | Pass |
| Field rules: exactly five string values, lowercase enums, category pairing, trim and 1–200 Unicode code points | Backend validator; frontend domain/form | Foundations, T09 full-replacement, domain and client tests | Pass |
| Money: 0.01–999999999.99, no floating point, excess precision/syntax rejected | Numeric constraints; validators/string formatting | T12 all seven values create/edit/read, exact totals above max; T05/T06/domain malformed values | Pass |
| Dates: 1900 minimum, real calendar, Cairo today/future, YYYY-MM-DD API and DD/MM/YYYY display | Validators; SQL date/trigger; frontend helpers | T12 actual today and tomorrow; T05 synthetic Cairo midnight; domain leap/year tests; 1900 browser persistence | Pass |
| Server-managed UUID/currency/timestamps; callers cannot write metadata | Validators; mapper/service; SQL trigger | Foundations metadata rejection, T06 ID/Location, T09/T12 invariant timestamps | Pass |
| Integrity: completed single-statement mutation or no invalid change; no upsert on missing ID | Service SQL; centralized middleware | Real limited-role CRUD, invalid-write unchanged count/value, missing PUT/DELETE | Pass |
| Reliability: old responses never authoritative, abort handling, overlapping retries, mutation supersedes reads | `frontend/src/lib/api/read-request.ts`; read hook; dashboard | Six request/count groups; T11 ignored-abort races and rapid mutation/filter changes | Pass |
| Reliability: saved/deleted versus failed refresh; retry failed reads only | Dashboard/form/delete feedback | T08–T11 confirmed success with refresh failures; old warning cleanup | Pass |
| Reliability: no automatic writes; uncertain outcomes require check-before-retry | API client; synchronous mutation locks | Client POST/PUT/DELETE attempt counters; browser committed-lost and GET-only checks | Pass |
| API health: exact 200/503, sanitization, no-store | Health route/database health | Foundations both responses; live configured TLS health runner | Pass |
| API POST/list/item/PUT/DELETE/summary contracts, 201 Location/204 empty, 404 missing | Routes/service/mapper | All backend integration groups, T08–T12 browser flow | Pass |
| API malformed JSON, 16KiB limit, body/media policy, unknown properties | App/request/error middleware | Foundations exact boundary/malformed/oversize/415/read/delete bodies | Pass |
| API query/UUID validation; unsupported/repeated/incompatible query params rejected before SQL | Request validator/routes | Foundations/T06/T09/T10/T11 query/UUID and zero-query assertions | Pass |
| API route 404/method 405/correct Allow and OPTIONS/CORS | Routes/app/request middleware | Foundations/T06 HTTP method and exact-origin/preflight checks | Pass |
| DB schema/types/nullability/PK/checks/index/trigger | Both migrations | Two clean migration runs; T12 14 catalog/permission checks; T04 trigger invariant tests | Pass |
| DB repeatable seed and exact baseline totals | `supabase/seed.sql` | Seed twice on two new clusters; count 3 and 1000.00/296.25/703.75 | Pass |
| DB least-privilege login, memberships/admin attributes, CRUD/function execution; denied DDL/admin | Role migration; production pool | T04 CRUD/trigger; T12 role catalog plus denied CREATE/ALTER/DROP/TRUNCATE/ROLE/DATABASE | Pass |
| Security: ignored env, no recognized tracked/history credential patterns, no public DB credential/client | Ignore files; server config; API client | Security runner 15 assertions, built browser chunks, runtime resource hosts | Pass within documented scan scope |
| Security: parameterized SQL, sanitized errors, scoped CORS, verified TLS and role | Services/middleware/pool/env | SQL-binding tests; HTTP errors; live authorized TLS/current_user; security source checks | Pass |
| Configuration: examples, 4000/3000 ports, public API URL, Session Pooler 5432/custom role/CA | Examples; README; env/pool | Examples/source review, configured TLS health and fresh clean builds/install/tests | Pass |
| Build/dependency hygiene: no TypeScript/lint/build problems, dev-only production paths gated | Package scripts; page development branch | Both clean builds/checks/tests; runtime production preview query; import review | Pass |
| Brief completion README/config/setup prerequisites | README and package scripts | Existing setup commands exercised from isolated source snapshot; stale CRUD statements corrected | Pass |
| Implementation plan T12: verification, minimal fixes, truthful evidence; T13 remains unstarted | This report; plan | All acceptance rows/gates; only test/doc changes | Pass |
| Plugin/design/provider checkpoints T03/T04; deployment T14 | Prior reports and approved specification | Historical T03/T04 evidence read; no new Figma comparison or deployment performed | Historical / outside T12 |

## Exact end-to-end flow

Real production browser → Express → disposable PostgreSQL. Each expected value is independently asserted against the exact API decimal string and visible summary; no financial assertions use floating-point arithmetic.

| Step | Expected income | Expected expenses | Expected balance | Count | Actual |
| --- | --- | --- | --- | --- | --- |
| Load seeded dashboard | 1000.00 | 296.25 | 703.75 | 3 | Exact match |
| Create Income/Other 1000.00, `T12 income`, 1900-01-01 | 2000.00 | 296.25 | 1703.75 | 4 | Exact match |
| Create Expense/Other 250.50, `T12 expense`, 1900-01-01 | 2000.00 | 546.75 | 1453.25 | 5 | Exact match |
| Edit new expense to 300.00 / `T12 edited expense` | 2000.00 | 596.25 | 1403.75 | 5 | Exact match; same ID |
| Filter Expense + Other | 2000.00 | 596.25 | 1403.75 | 5 globally | One matching edited row; summary unchanged |
| Reset; delete seeded Taxi fare 45.75 | 2000.00 | 550.50 | 1449.50 | 4 | Exact match; deleted ID 404 |
| Browser refresh | 2000.00 | 550.50 | 1449.50 | 4 | Exact match |

Request evidence contains exactly POST, POST, PUT, DELETE, one each deliberate action; no duplicate mutation. Full rows/timestamps/IDs and summary are saved in ignored `.tmp-t12/crud-snapshot.json` for equality checks after restarts. The income and edited expense remain while the deleted Taxi stays absent.

Final frontend and backend restarts each pass five snapshot/UI checks. PostgreSQL restart and a second running-pool reconnect each pass five checks without restarting the corrected API. Full list/summary objects (including IDs/timestamps), created/edited records and deleted-ID 404 remain identical: **2000.00 / 550.50 / 1449.50**, count 4. A fresh browser session passes seven normal-production checks, including no console errors/hydration warnings and production ignoring `?preview=populated`.

Stress record adds Income 999999999.99 with a 200-character unbroken description: income **1000001999.99**, expenses **550.50**, balance **1000001449.49**, count 5. Exact server values render and wrap at all five widths; deleting only that stress ID restores the snapshot. Separate backend integration creates/updates/reads 0.01, 0.10, 0.20, 0.30, 1.00, 1000.00, 999999999.99 with total **1000001001.60**. Existing tests also prove 0.10 + 0.20 = 0.30, empty 0.00 and negative balance.

## Failure and race matrix

| Scenario | Executed evidence and expected behavior | Result |
| --- | --- | --- |
| List / summary / both unavailable; recovery | T08/T11/T12; usable successful region, no invented zeros, scoped GET-only Retry / Retry all | Pass |
| Create validation / 503 / unexpected 500 / committed-lost response | T08 + API tests; preserved values, safe errors, uncertain retry gate, one POST | Pass |
| Create success then partial/both refresh failure | T08/T11; confirmed success retained; retry only failed reads | Pass |
| Edit validation / missing / 503 / unexpected 500 / committed-lost response | T09 + API tests; retained draft, disabled missing ID, safe uncertainty checks | Pass |
| Edit hidden / filter changes during refresh / failed success refresh | T09/T11; preserved current filters, authoritative GETs, accurate hidden feedback | Pass |
| Delete missing / 503 / unexpected 500 / committed-lost response | T10; identifying context, no false success, one DELETE, deliberate retry only | Pass |
| Delete success then failed refresh / filtered uncertainty check | T10/T11; deleted wording; GET-only refresh and unfiltered absence check when required | Pass |
| Rapid filters / stale list success and error / ignored abort | T11 browser and request tests; newest key wins and obsolete errors silent | Pass |
| Overlapping retries / mutation + old reads / abort in JSON parsing | T11 client/controller/browser; same-key read dedup, forced new mutation generations | Pass |
| Empty / no matches / unavailable or inconsistent counts | T08/T11; distinct states, neutral uncertainty and authoritative retry | Pass |

Failure cases intentionally generate expected HTTP 400/404/500/503 and malformed/lost responses. These are not unexpected console/network failures. Normal production flow is checked separately for console errors, hydration warnings and browser exceptions.

## Defects found and fixed

1. **Disposable verification wrapper crashed during PostgreSQL restart.** Its limited-role pool and persistent administrative Client lacked idle connection error handling. Production's pool already handles idle errors. Replace only the test administrative Client with a one-connection Pool and add generic error handlers to both test pools. Pools discard interrupted idle clients and reconnect. The PostgreSQL restart/reconnect phase is the regression check: the API stays running and the entire saved row/summary snapshot is unchanged. No production architecture, grants, TLS or schema change.
2. **Stale README CRUD claims.** Remove statements that Delete is a preview/unimplemented and that T12 has not started; link this verification checkpoint. This fixes documentation correctness only.
3. **T08 browser focus assertion raced the form's existing animation-frame callback.** Wait for the amount input to receive focus before asserting its invalid state, matching T09's established timing guard. The assertion and full 61-check T08 rerun pass; product focus behavior is unchanged.

No product defect or UI redesign was needed. Initial new-test lint errors were fixed before final gates. An early browser failure was caused by concurrently resetting the same disposable database in backend tests; all browser writes now run sequentially and clean-backend tests use the separate 55443 cluster. Those failed attempts are not counted as passing executions.

## Clean setup and build hygiene

Created `.tmp-t12/clean` from tracked plus current nonignored source files, excluding `.env`, node_modules, dist, .next, browser evidence and portable PostgreSQL artifacts. This validates the current working tree, including the user's uncommitted completed tasks; it is not a claim that HEAD already contains those tasks. No Git worktree/commit was created.

Ran both `npm ci` installations from lockfiles, lint, type-check, build, complete tests and the frontend domain runner. Clean backend SQL verification uses a second fresh PostgreSQL cluster on 55443 and passes migrations, seed, constraints and role checks. No ignored application build artifacts are copied. Backend offline install initially lacked cached xtend; normal locked install succeeded with network access. Frontend installs from cache. The installed npm policy blocks esbuild/unrs-resolver postinstall scripts; the required builds/lint/type-check/tests still pass. Clean `tsx watch` development startup was not separately tested under that policy.

Dependency/import review finds every direct production dependency used (Express, cors, dotenv, pg; Next, React/React DOM runtime). TypeScript/ESLint/Tailwind tooling remains development-only. The only frontend page fixture path is explicitly development gated; production `?preview=populated` still reads persisted API records. Fixture financial calculations stay inside fixture code. Runtime financial totals come only from PostgreSQL, and monetary values remain strings.

## Security and configuration

The 15-check runner scans current versioned/nonignored source, all Git history diffs, and built browser JS for recognized credential patterns, printing only check names/counts. It finds no matches; this is a targeted pattern scan, not a guarantee against every possible secret format. `.env` files are ignored and untracked. The public Supabase CA is a certificate, not a secret. Browser code has only the public Express URL; no database connection, service-role key or Supabase client. Browser resource entries contain no Supabase host.

The production pool retains certificate/hostname verification, rejects URL SSL overrides and uses the limited role. Live `SELECT current_user` confirms the expected role; socket authorization is true. Exact sanitized health envelopes/no-store pass with a reachable database and a simulated unavailable database. All user-controlled SQL values are bound parameters; body/query validators reject unsupported values before database access. CORS permits the single configured origin and denied-origin/preflight checks pass.

Existing setup examples provide PORT 4000, CLIENT_ORIGIN localhost:3000, server-only DATABASE_URL and CA file; frontend example provides NEXT_PUBLIC_API_BASE_URL only. Actual configured Session Pooler TLS works read-only. Current provider documentation agrees with session pooling on 5432 for persistent IPv4 backends and a custom role username; see [Supabase connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres) and [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement). Changelog Markdown fetch was unsupported by the browsing adapter; no new Supabase feature/API/schema was implemented.

## Known limitations

- Browser validation covers Chrome desktop with responsive viewport emulation. Native mobile keyboard/safe-area behavior, Safari/Firefox, and a physical screen-reader session were not exercised; actual keyboard commands, native dialog semantics and automated audits were exercised.
- Cairo midnight is tested using deterministic instants immediately before/after midnight, not by waiting for a real midnight.
- List and summary are independent reads, as documented. They do not guarantee an atomic cross-endpoint snapshot during concurrent external writes; visible count conflicts receive explicit recovery.
- POST has no idempotency key. Uncertain-write recovery remains deliberately conservative and never automatically resends a write.
- Hosted integrated deployment and a new full remote database/provider audit are outside T12. The old hosted demo remains historical fixture output until deployment work.
- T07's historical Figma quota/comparison limitation remains unchanged. T12 does not require another Figma edit/read.
- Clean snapshot verification still requires documented Node/npm/PostgreSQL/browser prerequisites and private provider credentials for real TLS setup; those tools/credentials are not shipped in the repository.

## Final V1 acceptance

| Area | Status | Evidence |
| --- | --- | --- |
| Create | ✅ Pass | T08/T12 browser, backend and client contract |
| Read | ✅ Pass | List/item reads, deterministic ordering, API envelopes |
| Update | ✅ Pass | T09/T12 exact full replacement and same-record persistence |
| Delete | ✅ Pass | T10/T12 selected ID, 204/404, no duplicate write |
| Summary | ✅ Pass | Exact seeded/empty/negative/large/global totals |
| Filters | ✅ Pass | Individual/AND/Other/reset/preserved active key |
| Loading | ✅ Pass | Independent loading/updating and pending controls |
| Errors | ✅ Pass | Full failure matrix, sanitization, retained contexts |
| Empty states | ✅ Pass | True empty/no match/unknown/conflicting snapshots |
| Recovery | ✅ Pass | Scoped/deduplicated GETs, no automatic write retry |
| Accessibility | ✅ Pass | 47 zero-violation audits and keyboard/focus checks |
| Responsive | ✅ Pass | 320/360/768/1024/1440, long text/errors/large money |
| Persistence | ✅ Pass | Exact snapshot after frontend/backend/DB restarts and repeated reconnect |
| Security | ✅ Pass | 15 source/history/bundle checks, live verified TLS, least privilege |
| Exact money | ✅ Pass | Seven round-trip values; exact PostgreSQL aggregates |
| Dates | ✅ Pass | 1900/current/future/calendar/Cairo midnight/date-only display |

## Reproduction and changed files

Run quality scripts from each package; build backend before tests. Prepare a fresh disposable loopback cluster/database `postgres`, set `DISPOSABLE_DATABASE_URL`, and run `backend/scripts/verify-t04-database.mjs`; then set `T06_DISPOSABLE_DATABASE_URL` and run backend `npm test` serially. `verify-t12-database.mjs` additionally guards port 55442. A second independent cluster avoids resetting browser data while clean suites run.

Set `T08_DISPOSABLE_DATABASE_URL` to the browser disposable administrative URL and run `node frontend/scripts/t08-test-api.mjs` from root. Build frontend with process-scoped `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4108/api/v1`, then `npm run start`. From frontend run T11/T10/T09/T08 sequentially, then `node scripts/verify-t12.mjs PATH_TO_AGENT_BROWSER prepare`. Do not run any shared-database fixture suite concurrently. T07 runs separately against development and explicit preview URLs.

Run the T12 runner with `frontend-restart`, `backend-restart`, `postgres-restart`, or `postgres-reconnect` **after actually restarting that component**; these phases do not write/reset records. Restart PostgreSQL while the corrected test API remains running to prove reconnection. `production-hygiene` starts a fresh browser session and checks normal production console and ignored fixture query. Run `node backend/scripts/verify-t12-security.mjs` after the frontend build. Use existing read-only health runner with free alternate ports. Stop only verification-created servers/browsers/clusters at the end.

T12 files: `.gitignore`; `README.md`; `docs/05-implementation-plan.md`; `docs/t12-verification.md`; `backend/tests/t12.test.mjs`; `backend/scripts/verify-t12-database.mjs`; `backend/scripts/verify-t12-security.mjs`; `frontend/scripts/verify-t12.mjs`; `frontend/scripts/t08-test-api.mjs` (test-only reconnect fix); `frontend/scripts/verify-t08.mjs` (wait for existing focus callback).

Evidence: `.tmp-t12/verification.json`, `crud-snapshot.json`, restart/hygiene JSON files, five dashboard screenshots, clean source/build trees and disposable cluster logs. Existing T07–T11 runners retain their ignored JSON/screenshot evidence. No secrets are included in this report.

## Completion decision / next task

All defined local V1 gates pass after the minimal verification fixes. **T12 is complete and V1 is ready for T13 — Documentation and handoff.** T13 remains unstarted and was not implemented. Production UI/business logic, migrations, privileges and architecture were unchanged. Verification-only services are stopped after evidence capture; disposable data/evidence stays ignored for review.

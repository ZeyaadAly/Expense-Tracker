# T58 — Full Frontend Regression

**Status: Completed locally, 2026-10-15 (Africa/Cairo).** Started on clean `main`, fetched and fast-forward synchronized with `origin/main` at `02b21742cf2052bc306b2160afbe3019497f191f`. T59 — Multi-User Security Acceptance remains unstarted. Hosted financial acceptance remains intentionally deferred.

The verified story is authenticated browser → session-bound T10 client → real Express V2 routers → limited-role disposable PostgreSQL → authoritative response rendering. Only the external Auth provider is synthetic. Financial reads, writes, constraints, cursor signing and recurring posting are real local operations.

## Environment and clean baseline

A new `git archive` snapshot under ignored `.tmp-v2-t58/source` installed both committed lockfiles using `npm ci --offline` and the existing npm cache. It contains no application `.env` files. Final application/test changes were copied into that snapshot before the final checks. PostgreSQL 17.11 was initialized as a new UTF-8 cluster at `.tmp-v2-t58/pgdata`, listening only on IPv4 loopback port 55451. Before each destructive test reset, the runner verifies the server's resolved data directory and absence of remaining database clients. Every domain starts with a fresh database and current ownership/occurrence constraints.

| Tool / gate | Result |
| --- | --- |
| Node / npm | 24.19.0 / 11.17.0 |
| Frontend | Next.js 16.3.8 / React 19.2.8 |
| Browser tools | Edge 155.0.4283.45; Playwright 1.64.0; axe-core 4.14.0 |
| Locked frontend/backend installs | Passed; application lockfiles unchanged |
| Frontend lint / typecheck / production build | Passed from isolated source; final root lint/typecheck also passed |
| Full frontend tests | **183 passed, zero failures/skips**; initial baseline was 182 |
| Backend support | Compiled services and explicit changed-script ESLint passed; real domain browser integrations passed |
| Browser integration | **3,521 counted checks**, plus Auth flows and the process-restart gate |
| Accessibility | **325 axe audits, zero WCAG A/AA violations** in audited scopes |
| Whitespace / credential review | Passed; final scan includes production server/browser output and source maps |

Install output retained the existing locked ESLint deprecation notice and npm's blocked-install-script notices for esbuild/unrs-resolver. Builds and verification succeeded without approving scripts or changing dependencies. Build output generated all 17 pages, including the dynamic account detail route, without application bundle or server/client boundary errors. The generated route listing does not imply financial route availability: actual production HTTP responses were separately verified.

## Evidence and route matrix

[Machine-readable browser results](assets/t58/browser-results.json) include each domain's assertions, Auth/profile results, the integrated walkthrough, recovery matrix and network failure classification. [Production/security results](assets/t58/safety.json), [final credential scan](assets/t58/final-secret-scan.json), [restart result](assets/t58/restart.json) and [navigation timing samples](assets/t58/performance.json) are separate. Representative fresh screenshots: [Dashboard at 1440](assets/t58/dashboard-1440.png), [Settings stress at 360](assets/t58/settings-stress-360.png).

| Route / surface | 360 | 768 | 1440 | Principal fresh coverage |
| --- | --- | --- | --- | --- |
| Login / Register / Forgot / Reset | Pass | Pass | Pass | Default, invalid, confirmation/recovery, provider failures, keyboard submission |
| Dashboard | Pass | Pass | Pass | Empty/populated/loading/stale/error, all five periods |
| Accounts | Pass | Pass | Pass | Real balances, lifecycle, transfers, pending and uncertain saves |
| Account detail | Pass | Pass | Pass | Direct reload, foreign/missing, summaries, locks, lifecycle/dialogs |
| Transactions | Pass | Pass | Pass | Empty/populated, all filters, pagination, forms, stress/error/recovery |
| Transfers within Accounts/detail | Pass | Pass | Pass | Forms/review/delete, scoped history, pending/lost acknowledgements |
| Recurring | Pass | Pass | Pass | List/upcoming, calendar boundaries, lifecycle, forms, generated activity |
| Analytics | Pass | Pass | Pass | Presets/custom ranges, charts and text, forecast/actuals, errors |
| Budgets | Pass | Pass | Pass | Month changes, progress/status extremes, forms/delete, stale data |
| Goals | Pass | Pass | Pass | Manual progress/lifecycle, archived metadata, responsive dialogs |
| Settings | Pass | Pass | Pass | Profile/preferences, categories, long content, section errors |

No page-level horizontal overflow was observed. The integrated walkthrough additionally audited every protected route populated at all three widths and B's empty main pages after switching accounts. Account-detail foreign/missing states have separate domain coverage. Dialog coverage includes narrow viewport fit/scroll, confirmations, transfer review and the mobile navigation drawer. Goal dialog bounds and internal widths were asserted separately at all three widths.

## Domain flow matrix

These are newly executed existing browser suites against the current snapshot, not historical results copied forward. The shared-boundary changes received additional Auth/profile/Accounts-detail/Dashboard/Analytics reruns and the new integrated gate. Counts represent assertions, not numbers of user clicks.

| Suite | Counted checks | Axe audits | Verified behavior |
| --- | ---: | ---: | --- |
| Auth | Flows passed | 30 | Login/register/confirmation, forgot/reset context, provider rejection/network failure, successful keyboard submit, sign-out |
| Profile bootstrap | 13 | — | Wait before financial mounting, loading, retry without polling, registration-name draft, identity change, 401 |
| Accounts detail | 46 | 13 | Direct protected route, authoritative opening/current/income/expense/transfer summaries, card debt/credit, locks, edit/archive/restore, stale/not-found/A-B |
| Transactions | 65 | 38 | CRUD, search, seven filters and AND composition, chips/Clear, real Next/Previous cursors, expiry/delete-last-row recovery, generated editing/deletion marker, archived references, uncertain/stale/auth failures |
| Transfers | 53 | 23 | Create/review/edit/delete, all-history and scoped cursors, source prefill, exact/card labels, pending, actual POST/PUT/DELETE lost acknowledgements, GET inspection, authoritative balances, A-B |
| Recurring | 77 | 45 | Filters/upcoming, create/edit/pause/resume/archive, past starts, month-end/leap day, exhausted null-next state, archived parents, processor-generated transaction and no Generate-now control |
| Dashboard | 447 | 20 | All five backend periods, exact DOM/API comparison, accounts/recent/upcoming, generated deletion marker, loading/empty/error/stale/races, isolation; deferred previews absent |
| Analytics | 894 | 20 | All approved presets, custom and 366-day limit, account scope, null rate/negative savings, cash-flow/savings chart text, categories/activity, transfer separation, forecast, races/isolation |
| Budgets | 655 | 24 | Month navigation/CRUD/duplicates, normal/near/exact-100/exceeded/>100/negative remaining/custom threshold, historical categories, actual/generated expense reconciliation, income/transfer exclusion, lost POST/PUT/DELETE, confirmed-save/read failure |
| Goals | 1,046 | 26 | Zero/below/exact/above target, no auto-complete, explicit complete/reopen PUT/archive, archived linked metadata, financial non-effect, lost create/update/lifecycle responses, confirmed-save/read failure, isolation |
| Goal dialog supplement | 60 | 3 | Viewport/internal fit, scrolling and focus return at all three widths |
| Settings | 100 | 19 | Real session email, shared displayName, fixed EGP/en/Cairo preferences, Accounts link, system/custom distinction, all category kinds/duplicates/kind lock/archive/restore, reset link/sign-out, independent stale sections and uncertain inspection |
| Settings stress supplement | 17 | 8 | Long email, 100-emoji name, Arabic/unbroken category strings, 40 categories, validation focus, Escape/focus return and reset link |
| T58 integrated application | 33 | 56 | Navigation, cross-page reconciliation, selectors, A-B every route, late write, expiry, reload/history, duplicate guards, semantics/reduced motion, network and many-category performance |
| T58 targeted recovery/protection | 15 | — | Actual transaction POST/PUT/DELETE lost acknowledgements, GET-only inspection, open-draft Back/Forward, nine signed-out protected redirects, external-next rejection and safe-next preservation |

## Cross-domain consistency and financial authority

A populated synthetic A owns accounts, a category, transactions, a transfer, a recurring schedule, a Budget and a Goal. A real transaction form creates exactly one 0.20 expense despite repeated click/form submission during a delayed save. Dashboard expenses become **0.20**, net position **79.80**, Analytics reflects the expense and the category Budget reaches **100.00%**.

A 0.10 asset-to-card transfer changes assets/debt to **99.70 / 19.90** while net position, income, expenses and savings remain unchanged. The local processor posts a 0.01 recurring expense; Transactions, Dashboard, Analytics and Budget all reflect it. At that checkpoint expenses are **0.21**, the Budget is **105.00%** with **-0.01** remaining. Manual Goal changes leave financial summaries unchanged. Category renaming updates historical transaction/Budget labels.

Settings category lifecycle checks exercise Transactions, Recurring and Budget choices by kind, preserve historical labels, pause linked recurring schedules on archive and require explicit resume after restoration. Account archive removes the account from new transaction choices and pauses schedules; restoration makes it selectable without auto-resume. Transfer and Goal suites independently verify their archived-account policy, including Goal metadata-only references.

DOM values are compared with authenticated backend responses. There is no added browser financial aggregation or recurrence calculation. Existing exact-string tests and real forms cover 0.01/0.10/0.20/0.30, 999999999.99, negative positions/remaining amounts, card overpayment and over-100% progress. Date-only transaction/recurring/range/month/target values preserve calendar days; calendar and Cairo-boundary tests remain intact.

## Session isolation, races and mutation recovery

The integrated gate switches A→B while reads are delayed on all nine protected routes. A's shell name, rows, summaries and financial choices disappear before B's data resolves; late A responses cannot restore them. Domain suites cover open dialog/draft teardown, cursor reset and foreign-resource safe states. A delayed real transaction write followed by a user switch cannot restore A's dialog or draft in B. Access-session expiry unmounts private content and redirects. All nine signed-out route/deep-link redirects preserve safe `next`; a synthetic real-SDK login rejects an external destination and retains an approved Analytics query.

Forced Dashboard period, Analytics range, transaction filter and Budget month changes verify that obsolete responses do not win. Client/store tests cover ignored aborts, cancellation, same-user token refresh and stopped writes. Duplicate protection is exercised by store tests across the eight requested mutation domains and browser pending states; the integrated browser gate explicitly repeats account, transaction, category and profile submits, and Recurring repeats submit during pending. Transfer/Budget/Goal suites verify disabled pending actions and their real mutation counts.

Actual committed transaction POST/PUT/DELETE acknowledgements are lost separately. Each sends exactly one write, retains its context, performs only GET during inspection and never automatically resubmits. Transfer and Budget suites cover all three methods; Goal/category/Recurring suites cover their supported uncertain flows. Confirmed-write/read failures remain successful with retained stale state and GET-only retry. Recovery checks intentionally inject 500/disconnected responses; aborted obsolete requests and foreign-account 404s are classified separately from unexpected failures. The integrated gate reports zero unexpected network failures, uncaught errors, hydration errors, React warnings or CORS errors.

## Accessibility, keyboard and semantics

The 325 audits use WCAG 2 A/AA and WCAG 2.1 AA tags; some Auth audits also include best practices. Scope is the V2 theme, route main region or active native dialog as recorded by the runner. Coverage includes populated/empty/error/stale/warning states, forms, confirmations and drawer at 360/768/1440. No known automated A/AA violation remained in those scopes.

Keyboard checks cover Enter submission, invalid-field focus, native dialog/drawer Tab containment, Escape, focus return, lifecycle confirmations and pagination/retry behavior. The drawer remains contained over 22 Tab presses and returns focus to its trigger. Heading/label/description/status/live-region/progress/chart-text contracts have programmatic and component coverage. Analytics has textual data-table equivalents; warning/progress meaning is not color-only. Reduced-motion emulation preserves usable dialogs, status/loading presentation and chart information. A physical screen-reader session was not available; these results do not claim full assistive-technology certification.

## Reload, browser history and process restart

All nine protected routes restore A's real session/profile/data after direct reload. Browser Back/Forward while a transaction draft is open removes the draft/dialog rather than resurrecting it. The full walkthrough additionally checks navigation after closing an account draft.

Frontend, backend and local JWKS processes are then stopped and recreated. The test-only signing identity is retained privately inside the ignored disposable directory, while application pools/services and browser context are new. Nine routes restore correctly; Accounts, Transactions and Dashboard summary match the previously saved durable baseline exactly. Financial rows do not depend on a browser fixture provider or an application process's memory. Raw sessions, signing keys, cursors and baseline snapshots are excluded from committed evidence.

## Fixture boundary, V1 and production gate

The new dependency traversal starts at every financial route plus Auth protection/shell and follows relative/alias source imports. It proves there is no transitive dependency on finance fixtures, prototype context or prototype page/editor modules. Design specimens and their isolated tests remain. Connected financial pages use the real domain stores and Express clients.

Production mode locally returns **404 for nine financial routes**, including account detail and Settings. Login/Register/Forgot/Reset remain **200** in their existing public route group. The existing production `/` policy remains **307 → public login with `/v2/release-check` as next**; it was not changed into a financial page. In development, V1 root still renders with its unchanged client/components/styles. V2 variables/styles do not apply to it, V1 requests carry no Authorization header, and the retired backend financial boundary returns **410**. V1 transport tests remain passing.

Browser financial traffic uses Express `/api/v2`; the synthetic Supabase host handles `/auth/v1` only. Production static chunks contain no local API base, and the production browser smoke observes no localhost API requests. Public synthetic URL/publishable build configuration is intentional. Vercel category management remains unavailable, Analytics/Budget/Goal production API registrations are unchanged and cron remains empty.

## Security and performance smoke

The bounded credential scanner covers frontend source, docs/examples, production static/server JavaScript, JSON and emitted source maps. It checks credential-bearing PostgreSQL URLs, private keys, secret-key literals, backend signing/cron/service-key assignments and bundled JWTs, withholding any matching value. The final [scan artifact](assets/t58/final-secret-scan.json) records its exact file/map counts and **zero recognized secret findings**; the administrative URL in `.env.example` is classified as a placeholder. Private environment files are never loaded or scanned into evidence. This is pattern-based review, not a claim to detect every possible secret representation or certify repository history.

| Local development navigation | Samples | Median | Range |
| --- | ---: | ---: | ---: |
| Dashboard | 8 | 1,010 ms | 906–1,719 ms |
| Transactions | 9 | 1,035 ms | 962–1,676 ms |
| Analytics | 6 | 1,051 ms | 968–1,867 ms |
| Settings, including 40 additional categories | 5 | 948 ms | 925–1,278 ms |

These are page-navigation-to-network-idle measurements and include Playwright's 500 ms idle window and possible development compilation. Search/cursor interaction and charts also passed their domain walkthroughs. No obvious rendering/request regression was established; no speculative optimization was introduced. These observations are not hosted latency guarantees.

## Findings and changes

1. Dashboard/Analytics still hid completed Planning navigation. The shared shell now exposes Budgets/Goals consistently; account detail correctly marks Accounts active. The integrated route matrix guards both behaviors.
2. Shared Auth/shell still imported the prototype finance module even when connected pages bypassed its provider. Both imports/provider wrapping were removed; a new transitive-dependency regression protects all financial routes. Session/profile keying is unchanged.
3. The old T25 browser seed predated T32 and inserted a generated transaction before reserving its occurrence. Its test-only seed now creates pending → generated transaction → posted marker atomically, with rollback/release. The full Transactions browser suite verifies generated editing/deletion under current constraints.
4. The historical Dashboard browser assertion scoped a deferred-content check across navigation. It now inspects the Dashboard main region, preserving the placeholder prohibition while allowing implemented navigation.

New local runners orchestrate isolated domain suites, integrated/recovery/restart checks and production/security verification. Verification adapters only select the supplied local browser/tool installation and initialize a clean CDP target; they do not replace financial API responses. Local harness corrections during construction included correct Auth host selection, a single-process Next launcher, required cursor signing configuration, and lost-ack handling for DELETE's 204 response. Those were verification setup corrections, not product defects or weakened database gates. No backend application/schema change was required.

## Reproduction, cleanup and boundaries

Use a new ignored `.tmp-v2-t58/source` git archive with both locked installs and a compiled backend. Initialize a fresh `.tmp-v2-t58/pgdata` PostgreSQL cluster on `127.0.0.1:55451/postgres`; never reuse retained data. Start dedicated headless Chromium CDP on loopback 9224. Supply `T58_DISPOSABLE_DATABASE_URL` only with that password-free administrative loopback connection, `T58_DATA_DIRECTORY` with the exact new cluster, and `T58_TOOLS_ROOT` with the existing optional Playwright/axe installation root. The current optional paths are `.tmp-v2-t20/node_modules/playwright/index.mjs` and `.npm-cache/t03-tools/node_modules/axe-core/axe.min.js`; these are test tools, not application dependencies. `T58_BROWSER_EXE` can select the executable.

Run `node backend/scripts/verify-v2-frontend-regression.mjs` from the snapshot. It orchestrates Auth/profile, fresh-database domain runs, system/restart and targeted recovery; `T58_SUITES` can select documented named stages. Keep final frontend lint/typecheck/build/tests separate. For the production gate, run the production build locally on localhost:3002 alongside the T58 API/dev frontend and execute `frontend/scripts/verify-v2-frontend-safety.mjs` with `T58_TOOLS_ROOT` and `T58_OUTPUT_DIRECTORY`. `T58_SCAN_ONLY=1` repeats only the source/build/docs review after documentation changes. All generated adapters/logs/raw snapshots stay in the ignored snapshot.

All local helpers are stopped after verification. No production credentials, hosted financial writes, remote Supabase operations, Vercel environment changes, manual deployment, gate removal or cron activation occurred. Git push is authorized separately and does not establish hosted acceptance. Optional T35/T41/T47/T50–T56 remain deferred. **Next core task: T59 — Multi-User Security Acceptance; not started automatically.**

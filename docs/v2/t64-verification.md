# T64 — Security Review

**Status: Completed locally, 2026-10-17 (Africa/Cairo).** Starting clean, synchronized `main`: `a9862a081fcc1e509ac90d9cc1023a462be804e6`. Two concrete security defects were fixed, with dedicated regressions. No unresolved P0 security blocker remains in the reviewed local scope. This is an application security review with local adversarial checks, not a formal penetration test or certification. T65 has not started.

## Scope and threat model

Assets are tenant financial records and aggregates, identity/profile, Auth sessions, database credentials, cursor and cron secrets, application integrity, and exactly-once recurring postings. Attackers include unauthenticated callers, malicious authenticated tenants who know foreign UUIDs, arbitrary browser clients, readers of public frontend configuration, holders of stale/leaked sessions, and operators who accidentally misconfigure deployment.

Trust boundaries are browser → explicitly authenticated Express API → limited shared PostgreSQL role; browser → Supabase Auth; operator configuration → server; and independent scheduler-secret → global recurring processor. Public Supabase configuration provides no private database authority. UUID knowledge and hidden UI controls provide no authorization.

The review covers current source, built code, validators/services/SQL, deployment entries, lockfiles, finite evidence/history scans, disposable database constraints, browser sessions and stored strings. It excludes production traffic/configuration/credentials changes, hosted Auth acceptance, destructive remote tests, provider infrastructure, dependency source-by-source certification, exhaustive concurrency schedules and quantitative side-channel proof. Required design/API/architecture/database documents and T09/T10/T11/T15/T16/T24/T33/T57–T63 reports were reviewed. Optional P1 work remains deferred.

## Findings and narrow fixes

| Finding | Before | Fix and evidence |
| --- | --- | --- |
| TLS configuration bypass | The pool rejected several URL TLS options but missed `ssl`. The installed `pg` parser lets `?ssl=0` override the explicit SSL object with plaintext, and `?ssl=no-verify` disables certificate verification. `?ssl=true` also discards the configured CA. | Reject decoded, case-insensitive `ssl*` and `uselibpqcompat` URL keys before pool creation. Keep explicit `rejectUnauthorized: true`, optional configured CA and pool max five. Fourteen malicious/ambiguous options fail before any connection; normal/application-name URLs preserve CA verification even with `PGSSLMODE=no-verify`. |
| Missing structural HTTP protections | Express and Next did not configure framing, MIME-sniffing or referrer protections. | Add `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and structural CSP to both applications, including errors, retirement and cron responses. Disable Next's powered-by header. Optimized Auth pages hydrate, financial routes stay gated, and an actual iframe cannot render the login form. |

[Before-fix proof](assets/t64/baseline.json) records driver booleans and absent headers, without credentials or a TLS network connection. [Dedicated backend tests](../../backend/tests/t64-security.test.mjs) execute the actual built pool/environment logic in isolated children without private dotenv loading. [Frontend tests](../../frontend/tests/t64-security.test.mjs) cover redirects and configuration; the browser runner verifies runtime compatibility. No schema, grants, financial semantics, dependency versions or lockfiles changed.

## Backend route and Auth inventory

Prefixes below are `/api/v2` unless stated. Every registered private path first uses `createRequireAuth` and a method allowlist. Unknown routes have no service handler. Category management and optional financial service registration are explicit factory options, never request-controlled.

| Class/domain | Paths and allowed methods |
| --- | --- |
| Public health | `GET /api/v1/health`, `GET /api/v2/health`; only reachability/status, no credentials |
| Profile | `GET/PUT /profile`; `POST /profile/bootstrap` |
| Categories | `GET /categories`; when management enabled: `POST /categories`, `PUT /categories/:id`, `POST /categories/:id/archive`, `POST /categories/:id/restore` |
| Accounts | `GET/POST /accounts`; `GET /accounts/summary`; `GET/PUT /accounts/:id`; `GET /accounts/:id/summary`; `POST /accounts/:id/archive`, `/restore` |
| Transactions | `GET/POST /transactions`; `GET/PUT/DELETE /transactions/:id` |
| Transfers | `GET/POST /transfers`; `GET/PUT/DELETE /transfers/:id` |
| Recurring | `GET/POST /recurring`; `GET /recurring/upcoming`; `GET/PUT /recurring/:id`; `POST /recurring/:id/pause`, `/resume`, `/archive` |
| Dashboard/Analytics | `GET /dashboard`; `GET /analytics/overview` |
| Budgets | `GET/POST /budgets`; `GET/PUT/DELETE /budgets/:id` |
| Goals | `GET/POST /goals`; `GET/PUT /goals/:id`; `POST /goals/:id/complete`, `/archive` |
| Independent cron | `GET /internal/recurring/process`, exact scheduler Bearer secret only; user JWT is insufficient |
| Retired V1 | Actual entries set `financialMode: "v2"`: all non-health `/api/v1/*` stop with 410 before legacy parsing/service access. Maintenance mode stops financial V1/V2 and cron with sanitized 503. |

`backend/server.mjs` registers core services and independent cron authentication, keeps category management off, and does not register Analytics/Budgets/Goals. `backend/vercel.json` retains `crons: []` and 60-second function duration. Test session/mode/processing endpoints exist only in separately launched ignored/local helpers; production entry imports none of them. The app factory's dependency injection and synthetic verifier options are programmatic test seams, not HTTP bypasses.

The optimized frontend returns 404 for Dashboard, Accounts/detail, Transactions, Recurring, Analytics, Budgets, Goals, Settings and design-system, including debug/bypass query probes. Public Auth works; release-check remains session protected in its separate route group. No gate or deployment configuration was relaxed.

## Authentication, sessions and recovery

The backend pins ES256, issuer, audience and authenticated role; requires expiration and UUID subject; validates future `nbf` when present; requires a key ID and rejects bad signatures, unsigned/alternate algorithms, malformed claims and missing configuration. Verified `sub` alone supplies normalized owner identity; profile metadata cannot override it. The real-crypto Auth suite tests these failures, provider outages and duplicate Authorization headers. JWKS resolver uses five-second timeout, ten-minute process-local cache and thirty-second cooldown; provider/configuration failures produce safe 503, without fallback identity.

Bearer scheme is case-insensitive by contract; exactly one Authorization header with one nonempty token is accepted. Missing/blank/extra parts/malformed tokens fail 401. A 14 KB invalid token fails safely; an 18 KB header hits Node's 431 limit before Express. Ambient cookies alone fail 401. Raw Node parser responses occur outside application-header middleware.

Frontend Auth uses the lazy singleton Supabase browser SDK; T10 gets the current token on demand, pins the mounted owner, omits ambient credentials and uses no-store/error-on-redirect transport. No app-owned token copy, custom Auth cookie, persisted React session or IndexedDB financial cache was found. The one app-owned sessionStorage item is a bounded, owner-bound registration **display-name draft**, containing UUID/name only; it is consumed/cleared by profile bootstrap. It is not a token/password/financial cache. SDK storage remains the expected browser session authority; localStorage can therefore contain SDK-managed tokens.

Session generations and protected subtree teardown suppress obsolete reads/writes on A→B changes. Fresh T58 browser coverage verifies eight domains, late A writes, expiry and reload/navigation. T64 separately verifies SDK-only localStorage keys, sign-out/back, API401 and expiry clearing with malicious stored strings present. Signing out clears browser state; already-issued JWTs can remain valid until expiration under offline JWT verification. Immediate server revocation is a separate design, not claimed here.

`safeNext` allowlists internal protected routes and rejects absolute/protocol-relative/scheme, encoded traversal/external and malformed variants. Preserved internal search strings cannot change origin. Encoded account-detail content still meets backend UUID validation. Password inputs use password type and email/current-password/new-password autocomplete. Reset is disabled without provider recovery context; reset-request success wording is neutral. Passwords are not put in URL, storage or logs. Provider recovery parameters are removed from browser history after handling. Provider signup error behavior/rate-limit/CAPTCHA settings were not remotely inspected; no stronger enumeration claim is made. Self-only profile endpoints expose no arbitrary-user lookup or email search/list API.

## Authorization, validation and SQL

The current repository/service inventory was compared to the 32 T59 ownership entries. All private domains bind the verified owner; shared system categories are the intentional exception. Foreign/missing resources retain identical safe envelopes. Recurring global scans use database-owned candidate identity, recheck under locks and propagate it to ledger/postings; clients cannot select processor owner/date/limits. Fresh T59 executes 156 route-authentication cases, 561 owner-injection cases, 275 mass-assignment cases, 192 alternating timing samples, cross-user concurrency, and the complete isolation suite. Foreign-versus-missing medians show no gross distinction; this is smoke evidence, not constant-time proof.

Profile/category/account/transaction/transfer/recurring/budget/goal validators reject unknown keys, repeated scalar query parameters, bracket coercion, malformed UUID/enums and invalid ranges. Owner IDs, timestamps, system/generated/derived fields and recurring linkage are rejected through actual write routes. Contractual fields remain legitimate: manual Goal saved amount and permitted active/completed editing are not blanket-rejected merely because they affect progress/status. Server-derived balances/spent/progress and lifecycle flags remain protected.

All user-supplied SQL values are bound. Reviewed dynamic SQL interpolations select fixed fragments, bound placeholders or controlled lock modes, not user text. Literal `%`, `_`, `!`, quotes, backslashes and Unicode searches are covered by rerun transaction suites; user wildcards do not expand query semantics. IDs never select filesystem paths. System-category immutability, archive restrictions, locked account opening/type and forbidden archived-resource activity are enforced by backend/service/database checks when a client bypasses the UI. Fresh matrix/concurrency/rollback suites confirm no cross-owner or partial financial write.

## Frontend injection and HTTP protections

The focused browser runner persists two inert script/image-handler payloads through real local APIs into account/category/profile/transaction/recurring/goal data, including category icon/color fields, plus a Budget linked to the malicious category. It checks actual domain content on all eight routes, absence of script/event-handler/javascript-link DOM sinks and absence of the execution sentinel. Profile/icon/color inputs retain literal values. React escaping is preserved; financial strings do not become arbitrary URLs. Category icon/color are input values, not executable HTML/style/link interpolation. No production `dangerouslySetInnerHTML`, assignment to innerHTML, document.write, eval or dynamic Function sink was found. No external target-blank links requiring rel remediation were found.

CORS returns only the configured exact origin, including for unrelated/null-origin requests; it never reflects an attacker or enables credentials. Preflight passes. CORS does not authorize direct clients. Private API mutations require an explicit Bearer header and do not trust ambient cookie credentials, so conventional ambient-cookie CSRF middleware is not applicable to this API. No blind CSRF middleware was added; XSS/token theft remains relevant.

| Header/policy | Result/disposition |
| --- | --- |
| X-Content-Type-Options | `nosniff` on both applications |
| Referrer-Policy | `no-referrer` on both applications |
| Framing | X-Frame-Options DENY plus CSP `frame-ancestors 'none'`; actual browser iframe blocked |
| CSP | `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` on both applications. Structural protections fixed; strict script/style nonce policy deferred. No wildcard/unsafe-inline/unsafe-eval allowance introduced. |
| HSTS | Not emitted by local HTTP application. Verify effective HTTPS redirect/HSTS at the platform/custom domain during the later controlled release; no hosted claim. |
| Permissions-Policy | Absent. No core geolocation/camera/microphone feature; optional explicit restriction is nonblocking hardening. |
| Cache-Control | Private success/error API responses use no-store, including representative profile/accounts/transactions/dashboard/analytics/budgets/goals reads and cron. T64 browser captures successful private responses; unit/focused suites cover errors. |

Next's installed local CSP/headers documentation was consulted. A strict nonce script policy would require changing rendering/asset behavior and broader Auth compatibility work; it was not improvised. Current structural CSP passes clean optimized build, Auth hydration and full local app/browser regression. Back/forward/logout checks ensure normal app navigation does not restore private rendered state; this is not forensic browser-memory erasure.

## Secrets, builds and evidence

| Configuration | Boundary |
| --- | --- |
| DATABASE_URL / database password | Server only; limited runtime credential. Privileged migration/backup credentials belong only in operator ignored configuration, never browser or runtime routes. |
| CURSOR_SIGNING_SECRET | Backend-only 32-byte hex HMAC key; no automatic public fallback |
| CRON_SECRET | Independent backend scheduler secret; never a user JWT or cursor key |
| Private/admin/service-role keys | Not required by the browser/core application and not present in reviewed tracked source/build evidence |
| DATABASE_SSL_CA_FILE / versioned CA | Operator-selected server file; public CA certificate is not a private key. No user-selected file access. |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Deliberately public Auth configuration; no service-role substitution |
| NEXT_PUBLIC_API_BASE_URL / CLIENT_ORIGIN | Public endpoint/exact-origin configuration, not authorization or secrets. Hosted release must use HTTPS; configurable API/origin parsers also support HTTP for development and do not alone enforce a production HTTPS allowlist. |

Real dotenv files and temporary fixtures remain ignored; example values are placeholders. No tracked database dump/backup/private key file was found. A bounded scan reads forty reachable HEAD snapshots, deduplicates text blobs, and tests recognizable private keys, full JWTs, private key formats, configured hex secrets and credential-bearing PostgreSQL URLs. It does not rewrite history. No historical credential match was found. The current scan additionally compares locally configured secret values in memory without printing them, and scans source, tests/scripts, manifests/config, backend build/maps, frontend static/server build, migrations, docs and evidence. No server configuration keys appear in browser chunks. Only sanitized counts/check names/options are committed; session/key/private-state files, raw calls and database fixtures stay ignored.

Backend/server build maps are operator artifacts and are scanned as text. Optimized frontend browser `.js.map` probes return 404; Next's production browser source maps remain at default off. Development maps are local tooling. Source-map absence is not used as a secret boundary. Old evidence images are not OCR-scanned; new T64 evidence is textual. Finite patterns/value checks cannot prove absence of every encoded or unknown secret. No historical credential requiring rotation was discovered.

## Database, cursor and cron security

[Explicit fresh role flags](assets/t64/runtime-role.json) and disposable-role/schema suites confirm runtime is neither superuser, CREATEDB, CREATEROLE nor replication/bypass admin; cannot DDL/TRUNCATE/disable constraints/escalate or access auth.users; and has only required table/sequence/function access. Browser anon/authenticated roles have no private financial-schema/table/function CRUD; PUBLIC private-function execution is revoked. Migration administration is separate from the runtime entry. The shared role can access multiple tenants by design: application owner predicates and composite FKs/triggers enforce isolation. This is **not** a per-tenant transaction-local RLS deployment or a defense against arbitrary stolen runtime credentials.

Ownership/invariant direct writes reject 58 invalid combinations and accept 68 intended checks in the fresh isolation suite, including transaction, transfer, recurring/occurrence, Budget, Goal and owner reassignment. Account/category archive races, overlapping multi-owner processors, rollback faults and killed-process recovery retain constraints and atomicity. No remote grants were read or changed.

TLS is explicit verified TLS in the real pool, using operator CA when supplied; URL SSL overrides now fail closed and PGSSLMODE cannot defeat the explicit object. Dedicated tests inspect the installed driver's effective parameters without network connections. Disposable loopback PG fixtures deliberately use password-free plaintext transport. No remote certificate/hostname/CA handshake, deployed pool configuration or session-pooler behavior was tested; those remain controlled-release checks. Malformed/non-PostgreSQL/empty database URLs fail configuration validation with a placeholder-only message, never the supplied URL. Ordinary SQL still shares one max-five pool with five-second connection timeout and safe idle error handling. Requests cannot choose connection configuration; tenant identity is passed as bound values, not mutable global database-session state.

Cursors are HMAC-SHA256 signed, not encrypted, canonical base64url with timing-safe signature comparison and strict payload shape. They bind version/resource/user/filter hash/page limit/order tuple/issued time and 24-hour expiry, reject future issuance/expiry/tamper/cross-resource/cross-tenant/filter mismatch, and fail 503 on missing/invalid signing configuration. Payload contains caller-owned UUID/order data, not descriptions, amounts, email or keys. Fresh T24/T26/T59 checks cover these properties; key rotation invalidates old cursors.

Cron uses one exact Authorization header, hashes fixed-size digests before timing-safe comparison, fails503 if unconfigured and401 for wrong/missing/user JWT credentials, and cannot authorize normal user APIs. Only GET, exact path, no query/body controls. Cairo reference date is server-derived. Caps are100 per definition/1000 global attempts with a 45-second cooperative budget inside a 60-second function; overlap/retry/ledger idempotency tests pass. A cooperative deadline cannot interrupt an already running statement/transaction. Runtime validation enforces secret format/length; operators must generate unpredictable independent keys with a cryptographic random generator, never reuse cursor/cron/database credentials. Entropy cannot be inferred from length alone. Cron remains unscheduled (`crons: []`), not remotely exercised.

## Errors, logging, abuse and execution boundaries

Validation/not-found/Auth/constraint/unavailable/unexpected failure tests return sanitized envelopes without SQL, stack, host/user/password, token or driver object. Fresh T59 foreign/missing envelopes remain equal. The four production-reachable logging locations are: startup localhost/port message; constant generic API error; constant idle PostgreSQL error; and explicitly projected cron request ID/time/reference date/outcome/counters. No request-body/header/env dumps, passwords, tokens, descriptions, names, emails or amounts are logged by application source. Third-party platform/provider retention was not inspected.

Bodies are limited to 16KiB after decompression, including gzip; invalid JSON/prototype keys fail 400 and do not mutate Object.prototype. Node oversized headers fail 431. Transaction/transfer pages cap at 100, query search at 200 code points, cursor at 2048 characters, Analytics and upcoming windows at 366 days. Text limits are account100, category80, icon64/color16, Goal120, profile100, transaction/recurring description200 code points, with resource-specific Unicode/control validation. Financial amounts/dates/enums are validated before unsafe work. Rejecting malformed filters/ranges occurs before SQL in focused tests.

Application per-identity/IP throttling is not a frozen P0 requirement and is not implemented. [Supabase documents provider Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits); actual hosted limit/CAPTCHA/email settings were not inspected. Auth forms use provider APIs without a local bypass. Existing bounds are acceptable for the current gated local P0 checkpoint, not evidence of comprehensive DoS resistance. Unpaginated category/Goal/recurring lists, total history size, repeated expensive authenticated requests and shared-pool pressure remain worthwhile quota/throttling/watch items. No new rate limiter was invented.

No core upload/export endpoint, arbitrary-user lookup, server fetch of user-selected URL, user-selected filesystem path or shell-execution feature was found. Server network access is configured database/JWKS; frontend API base is configuration controlled. CA/config paths are operator selected. Shell/process operations belong to local verification helpers and are absent from production imports. No core SSRF/upload/command/path-traversal surface was identified. Filesystem reads and `.from` hits were reviewed: Array.from conversions are not Supabase financial CRUD.

## Dependencies and supply chain

Official registry audits were refreshed on 2026-10-17; sanitized complete reports are linked below. Both runtime-only audits and the backend full audit report **zero** vulnerabilities. Frontend full audit reports **five high dev-tool packages**, one underlying advisory chain:

| Package | Direct? | Path/disposition |
| --- | --- | --- |
| eslint-config-next | Direct dev | via @next/eslint-plugin-next; dev tooling only |
| @next/eslint-plugin-next | Transitive dev | via fast-glob |
| fast-glob | Transitive dev | via micromatch |
| micromatch | Transitive dev | via braces |
| braces | Transitive dev | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): stack exhaustion on deeply nested attacker-controlled brace patterns, affected through 3.0.3; no patched version listed at review time |

The app does not feed remote/user globs into lint tooling; this is a genuine dev supply-chain exposure, not classified as a production runtime exploit. Do not run untrusted glob/config input in privileged lint contexts. npm suggests a semver-major downgrade to eslint-config-next14.2.35; no force fix/downgrade was applied. Track a compatible upstream patch; [maintainer discussion](https://github.com/micromatch/braces/issues/70) and the advisory support this disposition.

Outdated checks found Next16.3.8→16.4.2, React/ReactDOM19.2.8→19.3.1, Supabase JS2.117.2→2.118.0, Express5.2.1→5.3.0 and dotenv18.0.5→18.0.8. jose6.2.12 and pg8.23.1 were current in their check. No relevant audited runtime issue justified a version-only upgrade in T64. Both committed npm lockfiles remain unchanged; production build/start scripts do not execute security/test fixtures or dump secrets. No unusual install-script issue was flagged by this audit; exhaustive ecosystem source review is outside scope.

## Regression, quality and reproduction

See [quality/regression summary](assets/t64/quality.json), [backend focused evidence](assets/t64/security.json), [production browser](assets/t64/browser-production.json), [local app browser](assets/t64/browser-app.json), [performance smoke](assets/t64/performance.json), [backend full audit](assets/t64/backend-audit.json), [frontend full audit](assets/t64/frontend-audit.json), and runtime-only [backend](assets/t64/backend-runtime-audit.json)/[frontend](assets/t64/frontend-runtime-audit.json).

| Gate | Result |
| --- | --- |
| Backend lint/typecheck/build | Pass, including dedicated new-runner lint |
| Backend ordinary tests |106 pass,0 fail,28 guarded DB wrappers skipped; their fresh DB suites run below |
| Frontend lint/typecheck/clean optimized build | Pass |
| Frontend ordinary tests |185 pass,0 fail/skip |
| T64 dedicated unit groups |2 backend (TLS/headers),2 frontend (redirects/headers), included above |
| T64 focused backend |15 groups; bounded history/current artifacts/local configured-value scans; malformed input/CORS/errors/retirement |
| T57 |17 fresh matrix suites /57 tests, plus670 initial,103 recovery and56 terminal system checks |
| T58 |33 integrated checks,15 recovery checks,56 axe audits with zero violations |
| T64 browser |17 production +26 local-app checks,119 private successful no-store responses, no page errors |
| T59 | Fresh multi-user isolation/attack/privilege/concurrency/timing suite, zero failures |
| T60 |9445 initial +728 restart checks, zero failures |
| T61 |1689 initial +43 recovery checks, actual process kills/database restart, zero failures |
| T62 affected accessibility | T58's56 audits plus4 focused financial/Settings audits, zero violations; full T62 responsive matrix remains prior evidence, not falsely claimed rerun |
| T63 affected performance | Fresh normal/stress benchmark with signed APIs, query counts, five-connection concurrency and recurring throughput; no new P0 regression established |
| Repository | diff whitespace check and sanitized evidence scan pass; task committed directly to main and pushed without force |

Reproduction requires locked dependencies, built backend and installed Edge/Playwright/axe tooling. The focused backend runner `node backend/scripts/verify-t64-security.mjs` uses loopback synthetic JWKS/fake failing pool only and never loads dotenv or connects a remote DB. It requires existing clean build outputs for scans. Unit tests run using package scripts. Frontend runner needs T64_PLAYWRIGHT_PATH and optionally T64_BROWSER_EXE/T64_OUTPUT_DIRECTORY; production phase targets optimized localhost:3001. App phase additionally sets T64_PHASE=app and T64_AXE_PATH, targets localhost:3000 with the separately launched T58 disposable API on127.0.0.1:4000. All non-loopback browser traffic is aborted except in-memory fictional Auth responses; no hosted Auth request is sent.

Fresh database runners retain original basename/fresh-cluster guards in nested `.tmp-v2-t64/regression/.tmp-v2-t{57,58,59,60,61}/pgdata` directories. Initialize each separately with portable PG, UTF8/C locale and loopback55451; never run two on the port together. Set each runner's Txx_DISPOSABLE_DATABASE_URL/DATA_DIRECTORY/OUTPUT_DIRECTORY/PG_BIN as in its existing report. T58 system then recovery execute against its full local helper; T64 app checks follow. T63 runs from `.tmp-v2-t64/performance` with its own fresh `.tmp-v2-t63/pgdata` and T63_DISPOSABLE_DATABASE_URL, preserving its stricter cwd guard. These helpers intentionally avoid production dotenv and use plaintext password-free loopback only. T57's runner already stops its cluster; redundant wrapper stop can report missing PID after a successful suite. Result JSON and individual process statuses, not that cleanup notice, determine acceptance. Historical T45 timing artifacts regenerated by the suite were restored to the clean starting version.

Performance smoke repeated135 measurements: normal signed transaction/25 median15.32ms (T63:15.33), Dashboard this-month15.10ms (16.56), Analytics month15.40ms (14.25). Query counts are unchanged. Five/12 workers completed50/120 operations without errors while connections stayed capped at five. Three1000-post batches took6.41/8.00/7.60 seconds (median7.60; prior7.11), with zero processing failures. These local timing differences do not establish a new P0 regression; existing extreme-list watch items remain.

## Hardening disposition and limitations

**A — P0 blockers:** the TLS bypass and missing framing/header protections are fixed and covered. No unresolved local P0 blocker remains.

**B — Worthwhile pre-release work:** verify actual deployed HTTPS/HSTS/origin/JWKS/CA/pool configuration within the later authorized release; review provider Auth abuse and edge request budgets/rate protection; track the dev brace advisory; choose explicit Permissions-Policy where useful. These are nonblocking at the intentionally gated local checkpoint, not permission to skip controlled production acceptance.

**C — Post-V2 improvements:** evaluate strict nonce script/style CSP with rendering/Auth compatibility; app quota/rate controls and pagination for extreme unpaginated resources; stronger immediate session revocation; optional defense-in-depth transaction-local tenant RLS. None was silently implemented or represented as an existing guarantee.

Results use one local Edge/Chromium engine, synthetic JWT/Auth and fresh PostgreSQL, finite scans and bounded schedules. Production pool TLS was verified at driver-configuration level, not by a remote handshake. No hosted provider/WAF/cookie/security-setting certification or physical-device/screen-reader acceptance is implied. SDK-managed token storage remains exposed to same-origin script compromise. Shared-role isolation still depends on complete owner predicates and database relationship constraints. Performance measurements are local smokes, not hosted SLAs.

No remote database access/write, Supabase/Vercel environment or secret change, rotation, manual deployment, production security attack, gate removal, cron enablement or hosted financial acceptance occurred. Registry audit/documentation reads are the only external security research. T65 — V1→V2 Migration Dress Rehearsal is the exact next core task; it is not implemented here.

## Request coverage index

| Requested items | Evidence/disposition above |
| --- | --- |
|1–2 | Threat model; complete route/method/auth inventory |
|3–10 | Authentication, Bearer/oversized headers, token logging/storage/expiry, redirects/recovery, subject-only bootstrap |
|11–17 | Owner inventory, fresh T59 injection/mass assignment, all validators, literal SQL search, bound values and UUID/path checks |
|18–20 | Stored payloads on eight views and profile/icon/color inputs; safe rendering/link construction |
|21–27 | Bearer CSRF reasoning, exact CORS, headers/structural CSP/framing, no-store and logout/history checks |
|28–36 | Failure sanitization/log inventory; server/public config distinction; ignored env/history/build/public Auth checks |
|37–46 | Limited role/schema/constraints, driver TLS, signed cursor and independent bounded cron authentication |
|47–56 | Resource/method/body/query/search/page/analytics/text bounds, no blind rate limiter, provider abuse-control scope |
|57–66 | Encoded redirects, no core SSRF/upload/path/shell surfaces, dev artifacts/production gates, retired legacy routes |
|67–77 | Full/runtime audits and advisory disposition, outdated/lockfile/scripts, CSP/maps/external links, password autocomplete/type |
|78–86 | Backend immutable/lifecycle enforcement, concurrency/atomicity, timing smoke, UUID privacy, self-only identity/email, no export |
|87–98 | Focused runners/static hits, HTTPS deployment requirement, SDK cookies/storage/URL recovery handling, backup/evidence/docs boundaries |
|99–106 | Narrow fixes/dedicated tests, hardening classes, this report, checkpoint update, affected regressions/quality, local-only scope and main completion |

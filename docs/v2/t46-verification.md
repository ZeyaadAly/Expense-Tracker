# T46 — Build Goals Page

**Status: Completed locally, 2026-10-13 (Africa/Cairo).** Started on clean main synchronized with origin at `8e5823ebe0147018b4cbe61d86260fb5750ff933`. The approved T04 Goals composition now uses authenticated T45 data. T47 — Add Goal Projection remains optional/deferred and unstarted; T48 — Build Custom Category Backend is the next unstarted core task. Hosted financial acceptance remains **partial / intentionally deferred**.

## API and presentation

`/v2/goals` renders `GoalsPage`, outside the fixture provider. A typed Goal client uses the session-bound T10 transport, current Auth token and exact T45 routes: GET/POST goals, GET/PUT goal ID, POST complete and POST archive. Reopening is a full PUT with status active; no reopen/restore/DELETE route exists. Create payloads whitelist the five inputs; PUT additionally supplies status. Resource parsing validates fields, IDs, count/status scope, decimal strings, date-only values and timestamps. No owner, completionSuggested, linkedAccountName or lifecycle timestamp is invented.

The approved two-column desktop/tablet grid stacks at360. Existing GoalCard, money/progress display, dialogs and page shell are reused. Cards show name, saved, target, backend remaining/percentage, optional target date, status and real linked-account reference. Default GET lists all owned statuses, including read-only archived history. T04 supplied no Goal status-filter control, so none is added; the typed client supports the frozen optional status query. Loading and empty states contain no financial fixtures. Refresh failures retain explicitly stale values; initial failures display safe error/retry.

## Manual savings, progress and lifecycle

Target and saved inputs stay strings; new savedAmount defaults to0.00. Client validation follows T45 name/money/date bounds without floating-point arithmetic; backend field errors preserve drafts and focus the first invalid field. Date targets can be past/today/future in1900–9999. Account selection is optional and independent of savings.

Backend percentComplete and remainingAmount render directly. Text may exceed100%; the visual bar caps at100%, with actual percentage in aria-valuetext and name/target context in the card. Backend remaining clamps to0.00 above target. Exact string comparison of the documented target/saved values only decides whether to offer completion; it never computes financial totals or changes status. The rounded9999.99/10000.00 case displays100.00% while withholding Mark complete. Exact/above target remain Active until explicit completion.

Active goals offer edit/archive and funded completion. Completed goals offer edit/reopen/archive; their edit dialog can explicitly select Active before lowering savedAmount. Reopen submits all current editable fields with status active. Archive confirmation explains read-only preservation and financial non-effect; archived cards have no mutation controls. Before opening an existing action, a fresh GET checks the current resource; foreign/missing/unavailable resources expose safe errors. Invalid lifecycle responses remain safe domain failures.

## Linked accounts and financial non-effect

Active and archived owned accounts load independently of Goals. Account choices are deduplicated by ID, conservatively preserving the archived result if the two status reads straddle archival. Creation/new link choices include active accounts only. An existing archived reference remains named and retainable while editing that Goal, and can be cleared. Foreign accounts never enter A choices; B choices never contain A accounts. The helper explicitly says linked account is reference only and progress is updated manually.

Real browser mutations create/update/complete/reopen/archive Goals while independent complete financial snapshots, Dashboard summary and Analytics actual summary remain identical. A large real income transaction and transfer change the linked account's balance while the Goal resource, manual saved amount and timestamps remain unchanged. Archiving the linked account preserves its Goal link and readable name; editing the Goal retains that reference. Fresh backend account/card/balance/isolation regressions also pass.

## Mutation recovery and session safety

Confirmed mutations announce success, close the dialog, restore usable focus and refresh only Goal reads. A confirmed change followed by GET failure remains successful, retains stale rows and explicitly offers read-only refresh. No optimistic savings/progress calculation occurs.

Pending mutations block duplicate submission and cancellation. Lost acknowledgements preserve draft/action context, block resubmission and offer GET-only inspection. A separate acknowledgement is required before another deliberate attempt; failed inspection cannot unlock it. Browser tests commit then lose acknowledgements for create, update, complete, reopen and archive. The loss harness flushes response headers before losing the body, matching T44, so Chromium does not retransmit a pre-header connection loss below the application layer. This verifies application-level no-resubmission behavior rather than claiming transport-wide idempotency.

The successful full scenario records exactly **19 deliberate mutation requests:11 POST and8 PUT**, including one definite server-validation rejection. Inspection/refresh never automatically resends a mutation. No DELETE/reopen/restore route is requested. Unit tests separately cover network/cancellation/auth/validation/uncertain classifications.

The connected component is keyed to authenticated identity beneath the existing profile/session epoch boundary. Disposal aborts all reads/writes, clears rows/account choices/resource/inspection/notices and unmounts dialogs/drafts. Request/lifetime identity guards suppress ignored-abort old results and old401 failures. Browser A→B switching during an A draft and delayed A list immediately removes A state; B gets its own empty Goals and choices. Direct B→A GET returns404. Current401 clears the page and uses existing Auth invalidation/sign-out. The feature stores no token, credential or financial state in URL/localStorage.

## Browser, responsive and accessibility evidence

Browser → T10 → actual T09 ES256/JWKS → T45 limited-role services → disposable PostgreSQL → response → DOM. The harness accepts only the guarded password-free loopback PostgreSQL database, uses minimal synthetic Auth users and never loads application.env. Browser fetch interception supplies only synthetic Auth and blocks external destinations. Test-only setup/mode endpoints exist only in the loopback harness, outside application entry points.

Main suite: **1,046 checks,26 axe audits,zero violations**, covering loading/empty, validation focus, real CRUD/reload persistence, below/exact/above target, explicit completion/reopening, completed lowering, archive/read-only, archived account metadata, large/long content, uncertain outcomes, confirmed-write/read failure, initial/retained errors, resource404, pending safety, reduced motion, cross-user switching and401.

Focused dialog suite: **60 checks,three further axe audits,zero violations**. Native dialog viewport bounds and internal horizontal fit are explicitly asserted at360/768/1440; cancel restores Edit focus. Mobile dialog bounds were left18/right342 and top196/bottom804 inside360×1000, with no horizontal overflow. This focused capture uses viewport-only screenshots because full-page Chrome captures distort native top-layer dialog placement. Total: **1,106 browser checks and29 axe audits**, zero violations. Main page overflow checks pass at every width. Desktop, tablet, mobile and dialog evidence were visually inspected.

Evidence: [main result](assets/t46/browser-result.json), [dialog result](assets/t46/dialog-result.json), [desktop above target](assets/t46/above-target-1440.png), [tablet stress](assets/t46/stress-768.png), [mobile stress](assets/t46/stress-360.png), [mobile dialog](assets/t46/dialog-viewport-360.png), [mobile empty](assets/t46/empty-360.png).

## Quality and regressions

- Frontend lint, typecheck and production build passed.
- Full frontend suite: **172 passed**, zero failures/skips, including12 new Goal client/store/boundary groups. Existing V1 transport tests confirm no V2 Authorization leakage.
- Fresh T45: four tests passed with245 grouped checks,10 locking races,six rollback probes and25 Goal isolation checks. Existing T45 evidence files were preserved after this regression run.
- Fresh T18/shared: three tests passed; T16 foundation599, T17 accounts263, T18 balances285, transactions244, search263, filters3263, pagination6065, transfers917, recurring isolation31, Analytics isolation14, Budgets isolation15 and Goals isolation25. See [backend result](assets/t46/backend-result.json).
- React review confirmed keyed lifecycle, stable subscriptions, parallel independent reads, cancellation, derived completion eligibility without effect state, native focus/pending behavior and existing accessible primitives. No new dependency.
- Secret/artifact scan and git diff --check passed before commit.

## Scope and production boundary

Runtime Goal fixtures are removed from this route only. Isolated T03/T04 specimen/prototype fixtures remain available. Dashboard Goal preview stays deferred; Dashboard/Analytics financial rendering and calculations are unchanged. No automatic account-derived savings, projection, history, milestone notification or recommendation is added. V1 source, backend application/domain/schema, privileges and dependencies are unchanged; the new backend script is test-only.

Local production smoke returned404 for `/v2/goals`, `/v2/budgets`, `/v2/dashboard` and `/v2/analytics`, and200 for `/v2/login`. The frontend production financial gate, Vercel omission of Goal API registration and empty cron list remain unchanged. No remote DB, private Auth, environment or manual deployment change occurred. Pushing main may trigger the existing Git build with gates intact; this does not complete hosted financial acceptance.

All T46 HTTP/JWKS, Next development/production smoke, isolated Chrome and disposable PostgreSQL helpers were stopped. Synthetic data and generated logs remain ignored in `.tmp-v2-t46`; no production cleanup is needed. The retained T37 production restore/archive was not touched.

## Reproduction and changed files

Build backend; initialize a fresh synthetic-only PostgreSQL17 cluster at127.0.0.1:55451/postgres without existing app/Auth schemas or app/browser roles. Set only T46_DISPOSABLE_DATABASE_URL to its guarded admin connection and run `node scripts/t46-browser-api.mjs` from backend. Start frontend development with synthetic API base http://127.0.0.1:4000/api/v1, Supabase URL https://t37-fixture.supabase.co and publishable placeholder sb_publishable_t37_fixture_only. Start isolated Chrome/CDP9224; run `node scripts/verify-v2-goals.mjs` from frontend. It writes ignored evidence under `.tmp-v2-t46`. For the additional dialog-only suite, use a fresh harness database and set T46_DIALOG_ONLY=1 before running the same browser script. Never use retained data; stop helpers after testing.

Added `frontend/src/lib/api/goals.ts`, `frontend/src/lib/goals-store.ts`, `frontend/src/features/v2/goals-page.tsx`, `frontend/tests/v2-goals.test.mjs`, `frontend/scripts/verify-v2-goals.mjs` and `backend/scripts/t46-browser-api.mjs`. Updated the Goal route, protected fixture boundary, shell navigation, scoped styles, ignore rule, README, UX and implementation plan. Added this report, three JSON results and five screenshots.

No known T46 blocker remains. **T47 — Add Goal Projection — P1 Optional** remains deferred/unpromoted. Exact next core task: **T48 — Build Custom Category Backend**. Neither is started automatically.

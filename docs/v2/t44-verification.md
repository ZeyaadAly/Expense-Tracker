# T44 — Connected Budgets page verification

Date: 2026-10-13 (Africa/Cairo). **Status: Completed locally.** Starting main SHA: `f5b2db9fa8f61bb1834ec5b75f4134e0deb0161c`. T35/T41 remain optional/deferred; T45 remains unstarted. Hosted financial acceptance stays intentionally deferred.

## API, month and category controls

`/v2/budgets` now renders real authenticated T42/T43 resources through the existing session/profile boundary, without mounting the prototype fixture provider. A typed domain client uses T10 for list/get/create/update/delete, exact response parsing, current session tokens, cancellation and safe errors. It serializes only frozen fields: numeric year/month, optional categoryId for the typed list API, categoryId/amount/alertThresholdPercent on create, amount/alertThresholdPercent on PUT, and empty DELETE.

The approved UI provides a month selector and Add budget flow. It defaults to Cairo current month and supports1900-01 through9999-12, including past/future budgets. No undocumented previous/next buttons, category filter or URL synchronization was added. Month changes cancel obsolete list reads and preserve their last loaded scope while refreshing; create/edit/delete/refresh retain the selected month. Category filtering remains available in the typed client, without adding an unapproved control.

T12 supplies real owned/system active and archived expense/both categories. New-budget choices include active categories only; income-only and foreign choices are absent. Opening Create refreshes choices and disables saving until they load. Choices can be refreshed without losing the draft. Archived historical category names remain visible and marked; existing budgets stay editable for amount/threshold.

## Authoritative progress and approved presentation

The page reuses T04 BudgetRow/BudgetProgress/BudgetStatus and string-safe MoneyDisplay in the approved editorial planning-list layout. Backend allocated amount, spent, remaining, percentUsed, status and configured threshold render directly. No browser spending/remaining/percentage/status calculation occurs. Amount input stays a string; Number conversion is limited to calendar/threshold integers, and the existing progress primitive uses numeric conversion only to cap decorative bar geometry/ARIA value. Actual percentage text/aria-valuetext remains uncapped.

Default threshold90 and configurable1–100 are preserved. Exactly100.00% with near_limit renders **Near limit**, not Over budget. Custom75% with80% usage also renders Near limit. Exceeded rows retain negative remaining and usage above100%. Status text supplements color; long names and large derived values wrap. The page does not reinterpret a rounded percentage to classify status.

## Mutations and recovery

Create chooses an active expense/both category and selected month, exact amount and integer threshold. Full edit exposes only amount/threshold, with category/month read-only. Delete confirmation identifies category/month/amount and explicitly preserves historical expenses. Confirmed mutations announce success, close the dialog, refresh only the selected Budget list and restore usable focus, including fallback to Add budget after a deleted trigger disappears. No optimistic progress recalculation occurs.

Validation preserves drafts, labels errors and focuses the first invalid field. Duplicate409 maps to a clear category/month conflict message; stale/foreign404 stays generic. Initial failures show error/retry without financial fixtures. Failed refresh retains labelled old values; a confirmed write followed by failed GET explicitly says it was saved and offers only GET refresh.

Pending writes block duplicate submission and cancellation. An uncertain POST/PUT/DELETE preserves context/draft, blocks resubmission and offers GET-only inspection. Inspection displays the latest real resource/list (or safely absent resource); a separate acknowledgement enables a deliberate new attempt. No inspection or refresh automatically retries a mutation. The browser harness simulates actual committed response loss for all three methods, independently of mocked unit errors. The complete scenario records exactly **8 POST,4 PUT,2 DELETE** budget requests, matching14 deliberate mutations and excluding automatic resubmission.

## Session and stale-request isolation

ConnectedBudgets is keyed by authenticated user ID under the existing session/profile epoch boundary. Cleanup aborts reads/writes and clears rows, choices, resource/inspection snapshots and notices; component unmount removes dialogs/drafts. Lifetime/request identity guards suppress late old-user success/failure. A401 clears financial state and uses existing Auth invalidation/sign-out behavior, with no Budget-specific login mechanism.

Browser A→B switching while an A dialog contains a draft removes A budgets/dialog/draft/options immediately; B receives its own empty list and category choices. Unit tests separately verify ignored aborts and late A success/401 cannot affect B. Rapid browser month changes also suppress delayed obsolete responses. No feature financial state/token is persisted in localStorage or URL.

## Browser data-flow evidence

Browser → T10 → real T09 ES256/JWKS → T42/T43 services → limited-role PostgreSQL → response → DOM. Fresh synthetic-only PostgreSQL17.11 in ignored `.tmp-v2-t44/pgdata`; guarded local resets assert this exact new directory. Synthetic Auth/public frontend configuration is used; external browser fetches are blocked. Loopback setup endpoints are absent from application entry points. Synthetic test tokens use an extended test-only lifetime to tolerate long audit sessions, without changing production Auth.

Final browser suite: **655 checks,24 axe audits,zero violations** at **360/768/1440**, no page-level horizontal overflow. Audits include empty, validation, duplicate, exceeded, long/large/archived stress, uncertain create inspection, delete confirmation, retained stale, initial error, resource404, B-empty and reduced motion. Labels, keyboard month/validation focus, status/progress semantics, dialogs, pending controls and delete focus restoration pass. Audits wait for existing short nonessential color transitions to settle. Desktop/tablet/mobile evidence was visually inspected; exact large/negative values remain readable.

Browser coverage includes real Budget create/edit/delete and reload persistence; threshold boundary/exact100%/exceeded/custom75%; matching expense creation/amount edit/category move/month move/deletion; real transfer and both-category income exclusion; T31 expense generation/repeated processing; archived history and excluded new-category choices; past/future/extreme month selection; duplicate draft retention; committed-response loss for all mutations; confirmed-write/failed-refresh recovery; stale resource404; pending-write safety; rapid month changes; A/B dialog/draft clearing and401 redirect. DOM amounts/remaining/percent/status/threshold are compared against real API responses after each stage, not fabricated response overrides.

Evidence: [browser result](assets/t44/browser-result.json), [desktop exceeded](assets/t44/exceeded-1440.png), [tablet](assets/t44/exceeded-768.png), [mobile stress](assets/t44/stress-360.png), [mobile empty](assets/t44/empty-360.png).

## Quality and backend regressions

- Frontend lint/typecheck/production build passed.
- Full frontend suite: **160 passed**, zero failures/skips, including11 focused Budget client/store/boundary groups.
- Fresh T43: two tests,671 grouped checks,23 boundaries/six concurrent visibility scenarios.
- Fresh T42: four tests,194 checks,10 concurrency groups/three rollback probes.
- Fresh T31: three tests,403 checks,12 races/12 fault probes.
- Fresh T29: three tests,357 checks,10 races/11 faults.
- Fresh T18/shared: three tests; T16 599, accounts263, balances285, transactions244, search263, filters3263, pagination6065, transfers917, recurring isolation31, Analytics isolation14 and Budget isolation15; zero failures.
- Secret/artifact scan and git diff --check passed. React review confirmed stable stores/subscriptions, keyed lifecycle, parallel independent reads, explicit write safety and accessible shared primitives. No new dependency.

## Fixture, Dashboard/Analytics, V1 and production boundaries

Runtime Budget fixture rendering is removed from this route only. Existing prototype pages, budgetProps and design/specimen fixtures remain isolated and unchanged. No Dashboard Budget preview or Analytics target integration was added; T36/T37 deferred previews and T38–T40 actual analytics remain unchanged. Shared shell changes only enable the connected Budget page and its navigation; existing Dashboard/Analytics planning visibility is preserved.

V1 source is unchanged; existing V1 transport regressions pass with no V2 Authorization leakage. Backend application/services/schema/configuration are unchanged; the only added backend file is the synthetic browser harness. Local production smoke returned **404 /v2/budgets**, **404 /v2/analytics**, **404 /v2/dashboard**, **200 /v2/login**, **307 /**. Vercel Budget/Analytics registration, financial frontend gate and disabled cron remain unchanged. No remote DB/environment change, manual deployment or hosted financial acceptance occurred. Main Git integration may build the push with gates preserved.

Local T44 API, browser, Next development/production smoke and disposable PostgreSQL helpers are stopped after verification. Synthetic artifacts remain ignored; no production cleanup is needed.

## Reproduction and changed files

Build backend; initialize a fresh password-free loopback PostgreSQL17 cluster at127.0.0.1:55451/postgres, with no application/Auth schema or application/browser roles. Set T44_DISPOSABLE_DATABASE_URL only to its guarded admin connection and run `node scripts/t44-browser-api.mjs` from backend. Never use retained data. The harness uses fixed October2026 fixture dates; update its explicit clock/reference dates together for future reproduction.

Run frontend development with synthetic NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api/v1, NEXT_PUBLIC_SUPABASE_URL=https://t37-fixture.supabase.co and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_t37_fixture_only. Launch isolated local Chrome/CDP9224 and run `node scripts/verify-v2-budgets.mjs` from frontend against a fresh fixture database. It closes previous localhost targets in that dedicated browser to avoid stale audit-session interference. Results/screenshots write to ignored `.tmp-v2-t44`.

Added typed Budget client, session store, connected page,11 frontend test groups, browser runner, synthetic backend harness, this report/evidence. Updated Budget route, protected fixture boundary, shell, scoped styles, ignore rule, README/UX/implementation-plan/production-preview checkpoints. No backend application, dependency, schema or Vercel configuration changes.

## Remaining work

No known T44 blocker remains. Exact next task: **T45 — Build Goal Backend**, unstarted. T35/T41 remain optional/deferred. Do not start T45 or resume hosted production-preview acceptance automatically.

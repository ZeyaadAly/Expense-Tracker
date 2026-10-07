# T19 — Accounts page verification

**Status: completed locally, 2026-10-07.** Approved T04 presentation retained. No hosted database, migrations, production sessions, remote deployment, V2 transaction CRUD, transfer API or T20 work.

## Integration and contracts

`/v2/accounts` renders `AccountsPage` rather than the fixture page. The typed [Accounts client](../../frontend/src/lib/api/accounts.ts) uses the existing T10 transport and current T08 session; its token supplier requires the mounted owner's identity. Requests whitelist input fields, validate resource shapes/IDs/status/counts and preserve decimal strings. Create, full PUT, archive and restore use T17 routes. Lists use backend Active/Archived filtering. `currentBalance` is always returned by the T18 repository.

The sole backend contract addition is `GET /api/v2/accounts/summary`, using T18's existing owner-scoped `getNetPosition`; active and archived assets minus card debt are aggregated in PostgreSQL. Exact strings are unbounded for derived values. Strict no-query, GET-only, authentication, no-store and shared sanitized error policy apply. No database/schema/grant changes. See [API contract](06-api-design.md).

## States and mutation safety

The cancellable [Accounts store](../../frontend/src/lib/accounts-store.ts) loads list/summary concurrently with lifetime and request-generation guards. Initial data is null and shows skeletons; initial failure shows retry/unavailable summary, never an invented financial zero. Empty active lists show “No accounts yet.” and “Add your first account”. Failed refreshes retain successful sections and prior available values with stale feedback. Changing filters discards the old filter's list and suppresses obsolete success/error responses.

Create/edit validate names, account type and signed decimal syntax, preserve drafts on failure, map backend field errors and focus the first invalid field. EGP is read-only. No floating-point balance calculation, optimistic update or automatic write retry occurs. API `openingBalanceEditable` disables locked opening amounts and card/asset conversion; full server validation remains authoritative. Pending writes have synchronous guards and disabled controls; Escape cannot dismiss a pending dialog. Confirmed saves close only after write success, refreshing reads. A failed subsequent read announces “Saved, but accounts could not refresh.” Retrying refresh never repeats the write; successful recovery clears that notice.

Uncertain 500/network/invalid-success responses retain context and disable resubmission. “Refresh accounts and inspect” only reads and closes after a successful refresh. Safe 404/409 messages reveal no ownership. 401 removes account data immediately and delegates invalidation/signout/redirect to the existing T08 boundary.

Archive explains retained history and transactionally paused active recurring schedules. Real database inspection proved archive paused the linked fixture; restore left it paused. Filter selection persists across mutations. Positive credit-card balances display red “Amount owed”; negative balances display “Credit balance”. Large/negative values remain exact strings through request, API, database and string-only presentation.

## Real browser/API/PostgreSQL acceptance

The loopback-only [fixture API](../../backend/scripts/t19-browser-api.mjs) initializes an empty disposable PostgreSQL 17 cluster through the existing guards and migrations. It uses the actual Express routes, ES256 JWT/JWKS middleware, services and `expense_tracker_app` database role. Only synthetic users A/B and test data are created. Tokens remain in memory/browser session storage and are never included in logs or evidence. Failure modes wrap the real service for controlled read rejection, validation, delayed responses, definite rejection, confirmed-save/failed-read and a committed-but-uncertain write.

The [browser driver](../../backend/scripts/verify-t19-browser.mjs) verified real empty state → cash/card create → edit → archive → archived filter → restore → reload persistence. It also verified retained stale data, long backend validation with draft/focus, confirmed-save read recovery, committed uncertain-write read inspection, permanent activity locks, pending-write guards and rapid filter changes. Stress data included `National Bank Savings and Emergency Reserve Account`, `999999999.99`, `-999999999.99`, and card overpayment `-250.00`.

Switching A → B through the actual Supabase session event removed A's cards immediately during deliberately delayed B reads. B then saw the real empty state. Backend call records confirmed the final reads authenticated as B without printing tokens. Invalidating the browser token produced a real API 401 and the existing login redirect, with no protected account content retained.

## Responsive and accessibility

At **360, 768 and 1440px**, overview/cards, long names/large amounts, create/edit/archive dialogs and archived views had no horizontal page/dialog overflow. All dialogs had labelled controls, native accessible names/descriptions, first-invalid focus, focus containment/trapping and trigger focus return. Screenshots were visually inspected at mobile and desktop widths.

**12 axe-core 4.10.3 audits** (overview/create/edit/archive × three widths) found **zero WCAG 2 A/AA or 2.1 AA violations** in the tested surfaces. Keyboard/pending behavior was additionally asserted. Browser evidence and screenshots: [results](assets/t19/browser-results.json), [360px](assets/t19/accounts-360.png), [768px](assets/t19/accounts-768.png), [1440px](assets/t19/accounts-1440.png), [mobile create](assets/t19/add-360.png).

## Quality and regression results

- Frontend lint, TypeScript check and production build passed. Full suite: **78 passed, 0 failed, 0 skipped**, including nine T19 client/store tests and existing V1 regressions.
- Backend lint/typecheck/build passed. Full regular suite: **41 passed, 0 failed, 12 explicit disposable-integration skips**. The relevant account subset also passed after summary error coverage was added. Both T19 browser scripts passed ESLint.
- Fresh real JWT/API/database verifier: **599 T16 checks + 263 T17 lifecycle checks + 198 T18/T19 balance/summary checks**, no failures. Includes owner separation, strict summary query/method/auth rules, archived-inclusive exact summary, four concurrency races/two rollback faults, and the 5,000-transaction/2,000-transfer query-plan regression.
- Complete browser driver: **82 passed**, including twelve axe audits. Three supplemental initial read-error/read-recovery and definite 503 draft checks also passed (**85 total**); combined evidence is saved with the results and these checks are included in the reusable driver.
- Production preview: `/` **200**; `/v2/accounts`, `/v2/login`, `/v2/design-system` **404**. Existing development-only layout gate remains intact. V1 transport, components and routes were unchanged.

## Fixture boundary and files

Accounts runtime contains no account fixture imports or preview-state selector. The shared shell exposes the connected Accounts label. Other T04 routes/design-system specimens retain their isolated fixture data; the transfer panel is disabled and explains availability, without simulated success beside real accounts.

T19 changes: frontend route, connected page, shared shell option, typed client/store and tests; backend summary service/route and summary regression coverage; local fixture API/browser driver; helper issuer origin exposure for local tests; `.gitignore`; UX/API/implementation-plan documentation; this report and screenshot/results assets. Earlier T16–T18 working-tree changes are preserved.

## Reproduction

Use a **new empty** loopback PostgreSQL cluster on `127.0.0.1:55451`, password-free `postgres`/`postgres`. Never substitute a hosted connection. Build backend, then from `backend` run `T19_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55451/postgres node scripts/t19-browser-api.mjs` using shell-appropriate environment syntax. Start frontend dev with `NEXT_PUBLIC_SUPABASE_URL=https://t19-auth.invalid`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_localfixture`, `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api/v1`. The browser origin must be `http://localhost:3000`.

Set `AGENT_BROWSER_EXE` to the installed agent-browser executable and `T19_AXE_PATH` to a local public axe-core 4.10.3 script. Run `node backend/scripts/verify-t19-browser.mjs` from the repository. It seeds only the synthetic A browser session, runs against the real local API, and writes local evidence/screenshots. Fresh data is required; do not replay the create/stress sequence against an already populated cluster. Stop test servers and PostgreSQL after verification.

No T19 blockers remain. T20 is the named next account-detail task, remains unstarted, and retains its own optional P1/T21/T26 dependency requirements.


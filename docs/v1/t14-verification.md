# T14 — Deployment and final demo verification

Date: 2026-10-06 (Africa/Cairo). **Status: Completed. T01–T14 are complete.**

Frontend: https://expensetracker-inky-mu.vercel.app/

Backend: https://expense-tracker-api-green.vercel.app/

## Production configuration and access

Owning-team access is restored for `team_SC9MDLwu1DYKW3boTQle18dl` (Hobby). Frontend project `expense_tracker` and backend `expense-tracker-api` have READY production deployments from Git main commit `b7e0d9f`: `dpl_6PWAVqqtwcwEutgzK8GTYTWTCYtD` and `dpl_HXhBhf2imouqR1hXUfwpeg6BXVoM`. Build logs confirm Next.js frontend and Express backend using `server.mjs`; exact root-directory/production-branch settings were not exposed by the connector, though source/layout/build evidence matches frontend/backend.

Production frontend API base points to the hosted API. Backend DATABASE_URL is sensitive and was not decrypted; DATABASE_SSL_CA_FILE and CLIENT_ORIGIN are configured. Direct parameter-free health returns 200, {"data":{"api":"running","database":"reachable"}}, Cache-Control: no-store, exact frontend CORS origin and HSTS. Both production aliases are public. Existing deployment-alias authentication protection was preserved; no share bypass or _vercel_share acceptance was added. Supabase migration/limited-role evidence remains the earlier accepted baseline; this run did not inspect private credentials or repeat the database privilege/TLS identity audit.

## Hosted UI CRUD and cleanup

Baseline: 2 transactions; income **9500.00**, expenses **200.00**, balance **9300.00**, EGP. Original IDs were recorded privately; descriptions/data are omitted here.

Created one uniquely named T14 expense through the UI, date 2026-10-06 (Cairo), category other, amount 1.23. POST returned 201; dialog closed, added feedback appeared, list/summary refreshed, exact amount persisted. Count became 3, expenses 201.23, balance 9298.77. Reload retained it.

Edited the same record through the UI to 2.34 and an edited verification description. PUT returned 200; authoritative list/summary and reload retained the edited values. Expenses became 202.34, balance 9297.66; income stayed 9500.00.

Server-backed expense/other filter included the record; income/other excluded it without stale rows. Summary remained global. Captured filtered GETs returned 200.

UI delete confirmation identified the temporary record; DELETE returned 204, dialog closed, record disappeared and reads refreshed. Reload confirmed deletion. Final count, all totals and original ID set matched baseline exactly. Independent fresh Chrome session also showed restored baseline and successful summary/list GETs. No temporary record remains.

The completed UI pass captured exactly one POST, one PUT and one DELETE, with no duplicates. An earlier pass stopped on a harness recorder assertion after create/edit/filter checks; its finally cleanup deleted that temporary record through the API and verified full restoration before the completed pass. This was a monitoring failure, not an application failure.

## Production smoke checks

- 360/768/1440px: no horizontal overflow; cards below 768 and table from 768; usable filters; Add/Edit/Delete dialogs fit, receive focus and cancel without writes; keyboard focus stays in Add and returns to its trigger.
- **12 accessibility audits, zero violations**: dashboard and three dialogs at each width.
- Browser console/error capture: no errors, hydration issues or unhandled exceptions. No CORS failures observed.
- Browser HTTP traffic uses HTTPS; all Fetch requests target the hosted API. No localhost or direct Supabase requests. Data URLs used by browser controls/audit tooling were excluded from HTTP checks.
- Seven page-loaded JavaScript bundles and captured URLs/headers had no recognized database URI/private-key/service-role credential patterns. No secrets printed. This is a smoke scan, not proof against every secret format or a source-map/log audit.
- Unsupported health query returned sanitized structured 400 VALIDATION_ERROR and no-store, without SQL/stack/credential detail. Unrelated Origin received the exact frontend allow-origin, not a wildcard/reflected origin; HSTS present.

## Scope, limitations and documentation

T12/T13 were not rerun. No product code, feature, schema, environment variable or deployment was changed. Only temporary records explicitly requested for verification were written, and cleaned up. Existing records were preserved. The browser checks use Chrome viewport emulation; physical devices, other engines, forced provider restarts/cold starts and broad production error injection were not exercised. V1 remains unauthenticated and shared: retain sample data only.

README, implementation plan, handoff, historical deployment report and this report updated. Ignored local evidence/runners are under `.tmp-t12/t14-*`; CRUD evidence includes request methods/statuses and private baseline IDs. Documentation checks are lightweight.

## Historical blocked audit — 2026-10-05

The following audit is historical and superseded by the completed result above.


Date: 2026-10-05. **Status: Blocked on Vercel team access; hosted acceptance incomplete.** T01–T13 remain complete. T12 is the verified local baseline. No deployment, production environment mutation, database mutation, schema change, application change or expensive T12 rerun was performed.

## Starting audit

Read README, implementation plan, handoff, T12/T13 reports, historical deployment report, both package manifests/environment examples, frontend AGENTS/CLAUDE, linked project configuration, Next configuration, backend entry point/environment/pool and Git state. No backend AGENTS/CLAUDE or backend provider configuration was found. Existing uncommitted T13 documentation was preserved.

### Frontend

- Existing Vercel project: `expense_tracker`, ID `prj_NESamwRVpFVS31y1LiulTAnZMvkh`, owning team `team_SC9MDLwu1DYKW3boTQle18dl`, scope `zeyadali408-1717s-projects`. Local `frontend/.vercel/project.json` matches it.
- Public production alias: <https://expensetracker-inky-mu.vercel.app>.
- Current production deployment: `dpl_MtaeY1P7SqeRD8ysi3NV1iekf1E4`, state READY, Git `main` commit `087c78f1ebffb0165d8950a7dc38b472499b652a`, matching local HEAD. This is newer than the historical fixture deployment. T13 documentation remains uncommitted and is not in that deployment.
- Remote metadata confirms Next.js and Node.js 24.x. The historical repair set Root Directory to `frontend` and default build settings; the current metadata response did not expose those settings, so their current values were not independently confirmed.
- Unscoped environment listing returned `envs: []` and zero hidden production variables. `NEXT_PUBLIC_API_BASE_URL` is not configured. Browser evidence confirms the missing configuration.
- Deployment protection remains enabled on protected aliases; no protection settings were changed.

### Backend

No backend hosting config, linked project or production URL was found. The accessible Vercel project list contains only the frontend. This does not prove there are no services in inaccessible accounts.

Vercel is a candidate for a separate Express project using the existing provider/account: current [Express hosting documentation](https://vercel.com/docs/frameworks/backend/express) supports a `src/index.ts` port listener. Before proceeding, confirm account plan/cost limits, pool lifecycle/concurrency behavior, CA inclusion/path resolution and routing/entry-point detection. No provider resource was created, and no backend health result or final URL exists.

### Database

Supabase project `kpbyvbgcfwavcsgtcdws` is ACTIVE_HEALTHY in eu-central-1, PostgreSQL 17. Both authoritative migrations are recorded: `20261001144302` and `20261003163341`. Local project reference matches.

Read-only queries confirm zero transactions and an application role that can log in but has no superuser, create-database, create-role, replication or bypass-RLS privileges. This is a metadata audit, not proof of a deployed backend connection or a new complete privilege audit.

Production must preserve the limited-role Session Pooler URL on port 5432 and verified TLS using `DATABASE_SSL_CA_FILE`; no administrative DB role or browser Supabase client is acceptable. Local pool maximum is five per process. No credential values were read into this report or printed.

## Access blocker and minimal manual step

Team-scoped deployment/environment/team requests return **403 Forbidden**, explicitly requiring re-authentication to `zeyadali408-1717s-projects`. `list_teams` and Git deployment context return no teams. Unscoped metadata reads work, but they do not establish deployment rights to the owning team. A backend Git-project creation requires an explicit team; creating a project in a different account would not resolve that ownership issue.

**Manual step:** Reconnect/re-authenticate the Vercel app/plugin in the client with the Vercel account that owns or can deploy to `zeyadali408-1717s-projects`, and grant that team access. If the team is not available during authentication, an owner must grant the account deployment access first. Then resume T14. Do not paste tokens or database passwords into chat. No additional permission to deploy is being requested; deployment is already authorized by the T14 request.

## Public browser observations

Using the agent-browser skill and Chrome on the real HTTPS alias:

- Expense Tracker shell loads; summary and transactions display “The API connection is not configured. Please contact the application owner.”
- Add transaction dialog opens with the expected controls; no form was submitted.
- Recorded uncaught browser errors: zero. Recorded console messages: zero. These observations cover this read-only session, not a full production acceptance run.
- Resource entries show same-origin HTTPS frontend assets only; no API, Supabase, localhost or mixed-content resource requests were observed. Missing API configuration prevents requests, so CORS, API status codes and duplicate mutation behavior remain unverified.
- At the default 1262px viewport, no page-level horizontal overflow was observed. Required 360/768/1440 checks and accessibility audits remain unverified.
- Browser was closed. No test record was created or left behind.

The first sandboxed Chrome launch failed with a closed CDP channel; running this read-only inspection outside the process sandbox succeeded. Sandboxed curl/web fetch could not access the alias; this was not treated as evidence that the site was down.

## Production configuration still required

Backend private configuration: `DATABASE_URL` using `expense_tracker_app`, `DATABASE_SSL_CA_FILE` referencing the bundled trusted CA, `CLIENT_ORIGIN=https://expensetracker-inky-mu.vercel.app`, and provider-appropriate `PORT` behavior. Keep verified TLS and sanitized errors. Hosting environment values override ignored local dotenv files.

Frontend public production configuration: `NEXT_PUBLIC_API_BASE_URL=https://<verified-backend-host>/api/v1`. Set it before building/redeploying; do not use localhost. The origin value above is a proposed configuration, not an applied or verified CORS result.

## Historical remaining acceptance gates

1. Restore owning-team access; confirm current build settings, account plan/cost and compatible backend hosting.
2. Configure limited-role private backend environment and CA; deploy backend and verify HTTPS health 200, database reachability, sanitized JSON and `Cache-Control: no-store`.
3. Configure frontend API base before rebuilding; deploy and verify the new production deployment/source.
4. Verify hosted dashboard/summary/list, filters and Add/Edit/Delete dialogs, actual CORS and HTTPS API requests.
5. Perform identifiable-record create/edit/filter/delete with exact totals; confirm reload/new-session persistence and delete cleanup. Check cold-start/restart persistence where exposed by the provider.
6. Inspect production network/console, mutation duplication, sanitized failures, deployed bundle/source-map/log secret exposure and actual backend role/TLS.
7. Run lightweight responsive/focus/accessibility checks at 360/768/1440; record final URLs and gate outcomes before marking T14 complete.

## Repository validation

Only documentation was changed during this attempt. Existing T13 changes remain uncommitted. Passed `node .tmp-t12/verify-t13-docs.mjs`: 21 Markdown files, 101 relative links, 28 npm command references, six script references, 12 package scripts and five environment keys. Passed `node .tmp-t12/verify-t13-security.mjs`: 15 checks, zero failures; this is the T13 ignored copy with the increased Git-history buffer. Passed `git -c safe.directory=D:/Expense-Tracker -c core.autocrlf=false diff --check` and a separate whitespace check on the new report. Local functional/build suites were not rerun. Security-pattern results for local source/history and existing local chunks must not be represented as a production bundle/log security audit.

## Documentation updated

README, implementation plan, handoff and historical deployment report now point to this current audit. The historical October 3 deployment evidence remains preserved. T14 remains unchecked; T01–T14 are not all complete.

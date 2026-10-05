# T14 — Deployment and final demo verification

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

## Remaining acceptance gates

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

# Expense Tracker — Implementation Plan

> **Current local baseline:** T01–T13 are complete and V1 passed [T12 verification](t12-verification.md). See [handoff](07-handoff.md) for current setup and maintenance. Earlier task checkpoints below are historical; T14 hosted verification is complete as recorded in the current report.

**Version:** 1.0  
**Date:** 2026-10-01  
**Status:** T01-T14 complete; local V1, documentation and hosted acceptance verified. Historical Figma comparison limitation remains recorded in T07.
**Owner:** Zeyad Aly Elghazaly

## 1. Purpose

Build V1 in small, understandable steps using Next.js, TypeScript, Tailwind CSS, Express, and Supabase PostgreSQL. Express remains the application API, and V1 has no authentication. Each task should produce a working result and a clear completion check before dependent work begins.

Source documents:

- [Project brief](01-project-brief.md): scope and stack.
- [Requirements](02-requirements.md): behavior and acceptance criteria.
- [Database design](03-database-design.md): schema and data integrity.
- [API design](04-api-design.md): request/response contract.

This file plans the work. It does not create repositories, connect accounts, execute SQL, or deploy an application.

## 2. Build order and milestones

| Milestone | Tasks | Result |
| --- | --- | --- |
| M1 — Project ready | T01–T03 | Runnable frontend/backend skeletons and a simple interface design. |
| M2 — First complete flow | T04–T08 | Add a transaction through the browser, store it, and view it with correct totals. |
| M3 — V1 features complete | T09–T11 | Edit, delete, filtering, and recovery behavior work. |
| M4 — Local V1 verified | T12–T13 | Required checks pass and local setup is documented. |
| M5 — Sample-data demo | T14 | Frontend and backend deployment work with the selected database. |

Complete M4 before deployment. M5 is a separate hosting milestone; the unauthenticated demo uses sample data only.

## 3. Project organization

| Path | Purpose |
| --- | --- |
| `docs/` | The five planning documents and later decision notes. |
| `frontend/` | Next.js application, components, API client, and frontend checks. |
| `backend/` | Express application, validation, database access, and API checks. |
| `backend/src/config/` | Validated server-only environment configuration. |
| `backend/src/db/` | Reusable PostgreSQL pool and database health check. |
| `backend/src/routes/` | REST route handlers. |
| `backend/src/validators/` | Request and query validation. |
| `backend/src/services/` | Implemented database access with parameterized queries. |
| `backend/src/middleware/` | Error handling and API middleware. |
| `README.md` | Project explanation and reproducible local setup. |

The authoritative SQL migration history is in `supabase/migrations/`; retain its CLI-generated versions and avoid duplicate histories.

Use separate frontend and backend packages to keep the first project easy to understand. Start with a simple package manager workflow; a monorepo framework is unnecessary for V1.

## 4. Task backlog

### T01 — Prepare the project

**Depends on:** Existing planning documents.

- Confirm the V1 scope and read the validation/API decisions before coding.
- Inspect installed development tools and select compatible supported versions at setup time.
- Create the frontend/backend structure, initialize Git if needed, and add a sensible ignore file.
- Add a README outline and placeholder environment examples without secrets.
- Keep package lockfiles in version control.

**Done when:** Project structure and documentation are present; configuration examples contain only placeholders; the repository can track changes without generated dependencies or secrets.

### T02 — Start frontend and backend skeletons

**Depends on:** T01.

- Scaffold Next.js with TypeScript and Tailwind in `frontend/`.
- Set up Express with TypeScript in `backend/`.
- Add development, build, and type-check scripts; add linting appropriate to each package.
- Configure development ports: frontend 3000, backend 4000.
- Provide an initial frontend page and verify the Express process starts, without claiming application routes are complete.

**Done when:** Both development processes start; frontend renders; both packages type-check and build.

### T03 — Design the main interface using Figma

**Depends on:** T01; may be done before or after T02.

- Verify Figma plugin access and create the design through its supported workflow.
- Design the dashboard with three summary cards, filters, transaction list, and Add Transaction action.
- Design one reusable transaction form for add/edit and a delete confirmation.
- Include mobile and desktop arrangements, loading, empty, validation-error, and request-error states.
- Record the design link and basic typography, spacing, and color choices in documentation.

**Done when:** The design covers V1 flows and is clear enough to implement. Keep it small; an extensive component library is outside this project scope.

**Completed (2026-10-03):** Approved [Figma design](https://www.figma.com/design/GWgioRUOXX3XcaDLYWi8HA). The user confirmed T03 completion. Read-only inspection found Foundations, Components, and V1 Screens pages, with desktop/mobile dashboard, add/edit, delete and state frames plus tablet references. The implementation font remains Arial, Helvetica, sans-serif; Inter is a Figma fallback only. See [T03 specification](06-t03-ui-specification.md).

### T04 — Set up PostgreSQL

**Depends on:** T01–T02.

- Confirm the existing Supabase project link and compare the remote schema against the existing CLI-generated baseline. Do not use db pull or db push for the retained baseline or recreate the remote schema.
- Review the baseline against `03-database-design.md` and confirm remote migration history records it as already applied.
- Verify the limited application role and required function grants without exposing the private schema through the Data API.
- Configure one reusable Express `pg` connection pool using only server-only `DATABASE_URL`.
- Add a read-only PostgreSQL health check at `GET /api/v1/health` with the API error contract.
- Add repeatable sample seeding in `supabase/seed.sql`, separate from the baseline migration; do not seed the retained remote database during setup.

**Done when:** The CLI-generated baseline exists and is recorded as applied remotely; the linked project and database are reachable; a disposable database can apply the baseline and seed without errors; the application role has intended access; and no unintended Data API exposure exists. Lint, type checks, build, and both health success/failure cases pass. If required account/database access or disposable PostgreSQL verification is unavailable, leave T04 open and record the specific missing step. Docker is optional.

### T05 — Implement validation and API foundations

**Depends on:** T02; T04 is required before database integration checks.

- Add the `/api/v1` route prefix, JSON body limit, configured CORS, and no-store headers.
- Implement common error responses, unknown-route handling, and unsupported-method responses.
- Validate UUIDs, bodies, query parameters, category/type pairs, descriptions, and Cairo date boundaries.
- Normalize decimal strings without floating-point conversion and map database rows to API objects.
- Reject unknown body properties and unsupported query parameters.

**Done when:** Focused checks verify amount syntax/range, impossible/future dates, Unicode description length, malformed JSON, field errors, and metadata rejection. Unexpected errors do not expose internals.

**Verified:** Reusable validators, mapper, error middleware, request policy, and API router are implemented. Nine automated test groups, backend lint/type-check/build, live health success/failure, and disposable T04 database regression checks passed. See [T05 verification](t05-verification.md). No transaction CRUD endpoints were implemented at the T05 checkpoint.

### T06 — Build create, read, and summary endpoints

**Depends on:** T04–T05.

- Implement POST `/transactions`, GET `/transactions`, GET `/transactions/:id`, and GET `/summary`.
- Use parameterized SQL and deterministic date/creation/ID ordering.
- Generate IDs server-side and return saved records only after successful writes.
- Calculate all-transaction summary and count in one database statement.
- Follow the status codes, decimal strings, date-only strings, timestamps, and Location behavior in the API contract.

**Done when:** API checks can create and retrieve sample records, verify persistence, verify exact 0.10 + 0.20 totals, and distinguish empty data, invalid input, missing IDs, and database failures.

**Verified:** Create/list/single/summary endpoints, documented list filters, exact aggregates, response contracts, and centralized errors passed 12 automated test groups including limited-role disposable PostgreSQL integration. T04/T05 regressions and persistence after a database restart passed. See [T06 verification](t06-verification.md). PUT/DELETE and frontend integration were not yet implemented at the T06 checkpoint.

### T07 — Build the dashboard layout

**Depends on:** T02–T03.

- Implement summary cards, transaction rows/cards, filters, and accessible controls.
- Build the reusable form and confirmation UI following the Figma design.
- Use temporary fixtures only while layout is being built; clearly replace them during integration.
- Cover loading, empty, and error states in the components.

**Done when:** Main controls and forms work by keyboard and layouts are usable at 360px, 768px, and 1440px widths. The page does not hide actions or require page-level horizontal scrolling.

**✅ Completed (2026-10-03):** Dashboard, local fixture filtering/add/edit/delete, reusable dialogs, design tokens, loading/empty/error/success/stale states, and contract validation are implemented without API integration. Final frontend lint/type-check/build, domain checks, 69 browser checks including six zero-violation accessibility audits, and 16 supplemental dialog/specification checks passed. Corrected the amount field's missing EGP suffix and description textarea's 96px minimum height. Populated desktop/mobile/tablet Figma references were reviewed earlier. Retrying Add design context still returned the Starter-plan provider quota; unavailable additional dialog/state comparisons are a non-blocking external verification limitation under the user's explicit fallback instruction. Final verification used the approved T03 specification and existing reviewed references without claiming unavailable frame comparisons. Evidence is recorded in [T07 verification](t07-verification.md). T08 followed this checkpoint.

### T08 — Connect the first complete flow

**Depends on:** T06–T07.

- Add a small typed API client using `NEXT_PUBLIC_API_BASE_URL`.
- Load the transaction list and summary from Express.
- Connect Add Transaction to POST, display field errors, and prevent repeated submission while pending.
- Refresh list and summary after success; preserve inputs on rejection.
- Remove fixtures from the live dashboard.

**Done when:** A browser form saves a PostgreSQL row, the dashboard displays it, totals update correctly, and a refresh/restart preserves it. Record this as the first completed full-stack milestone.

**✅ Completed (2026-10-03):** The live dashboard now uses Express for list, unfiltered summary, supported filters, and creation. A typed client validates envelopes/meta and preserves exact decimal/date strings. Independent read states, scoped retries, stale-request cancellation, validation mapping, confirmed-success refetch, and read-only uncertain-write recovery are verified. Ten API-client test groups, 61 real browser/Express/disposable PostgreSQL checks, six live zero-violation accessibility audits, the 69-check T07 fixture regression suite, lint/type-check/build/domain checks, and persistence through frontend/Express/PostgreSQL restart passed. Remote data was not modified; CORS, production TLS, roles, schema, and backend source are unchanged. Edit/Delete were UI-only placeholders at that checkpoint; T09/T10 subsequently connected them. See [T08 verification](t08-verification.md). T09/T10 followed this checkpoint.

### T09 — Add editing

**Depends on:** T08.

- Implement PUT `/transactions/:id` with all five editable fields required.
- Prepopulate the reusable form and apply the same validation as creation.
- Preserve ID and creation time; refresh update time.
- Refresh the dashboard after success and recover clearly from missing records or request failures.

**Done when:** Editing changes the same record and summary correctly; cancel changes nothing; invalid or missing-record updates do not create rows.

**Completed (2026-10-03):** Full-body PUT validation, parameterized SQL and the existing timestamp trigger update the selected record. The prefilled form uses the typed client and authoritative filtered-list/global-summary refresh, preserving drafts on validation, missing-record and uncertain errors. Backend 16 groups, frontend 13 client groups, 58 T09 browser checks, 61 T08 and 69 T07 regression checks, lint/type-check/build, fresh migration/role/health checks and PostgreSQL restart persistence passed. See [T09 verification](t09-verification.md). T10 followed this checkpoint.

### T10 — Add deletion

**Depends on:** T08.

- Implement DELETE `/transactions/:id` with 204 success and 404 for absent records.
- Connect the confirmation UI; disable repeated confirmation while pending.
- Handle the empty 204 response without parsing JSON.
- Refresh list and totals after confirmed success.

**Done when:** Cancel preserves the row; confirm removes only the intended row; totals update; repeated deletion returns the documented not-found response.

**Completed (2026-10-05):** DELETE validates UUIDs before parameterized deletion through the shared limited-role service and returns empty 204 or structured 404. The existing confirmation dialog handles pending locks, definite rejection, missing records, uncertain outcomes and read-only recovery. Active filters survive authoritative list/global-summary refresh. Backend 20 groups, frontend 15 client groups, 34 T10 browser checks, T07/T08/T09 regressions, quality checks, fresh migration/security/health checks and PostgreSQL restart persistence passed. See [T10 verification](t10-verification.md). T11 followed this checkpoint.

### T11 — Finish filtering and request recovery

**Depends on:** T08–T10.

- Audit the existing validated type/category list filters and connected frontend selectors; harden only genuine gaps.
- Use AND logic, category choices per type, reset behavior, and Other across both types.
- Preserve active filters after writes and keep summary totals independent of them.
- Ignore/abort stale list responses after rapid filter changes.
- Separate empty database from no matching results using the summary's transaction count.
- Handle read retry, uncertain write outcomes, and successful writes followed by failed dashboard refreshes.

**Done when:** Filters behave as specified, hidden-by-filter saves remain valid, stale requests do not overwrite current results, and failures never falsely report success or trigger automatic write retries.

**Completed (2026-10-05):** Audited and reused T06/T08 filtering and T09/T10 mutation recovery. Hardened stable current-filter loaders, cancellable request generations, shared in-flight retries, mutation-superseded reads, All-reset updating/focus, query error associations, conflicting count snapshots, dynamic hidden-record feedback and recovery-warning cleanup. Reduced motion is explicitly verified. Backend 23 groups, frontend 22 groups, 86 T11 browser checks with nine zero-violation audits, T07/T08/T09/T10 regressions, lint/typecheck/build, fresh migration/security and configured TLS health checks passed. See [T11 verification](t11-verification.md). T12 followed this checkpoint.

### T12 — Verify local V1

**Depends on:** T09–T11.

- Run the meaningful verification cases in requirements, database design, and API design.
- Use focused validation tests and API integration tests against a disposable PostgreSQL database.
- Exercise the complete browser → Express → database → response flow.
- Check keyboard access, focus, loading/empty/error states, and responsive layouts.
- Run type checks, lint checks, and production builds.
- Fix failures and rerun affected checks. Record actual outcomes rather than checking boxes based on implementation alone.

**Done when:** All V1 acceptance criteria pass, required checks pass, and no unresolved issue prevents create/read/update/delete, exact totals, or filtering.

**Completed (2026-10-05):** T12's final acceptance gates passed: 24 backend groups, 22 frontend groups, 429 browser checks, 47 zero-violation accessibility audits, clean-source verification, fresh database constraints/permissions and exact restart persistence. See [T12 verification](t12-verification.md).

### T13 — Finish documentation and local handoff

**Depends on:** T12.

- Complete README instructions for prerequisites, dependency installation, environment variables, migrations, seeding, development, and builds.
- Explain the architecture, fixed currency, shared collection, and unauthenticated V1 limits.
- Update planning documents if implementation changed a contract; avoid conflicting descriptions.
- Reference T12's clean-source/disposable-database verification and validate documented commands without repeating expensive suites for documentation-only changes.
- Leave a coherent, reviewable documentation change for the selected Git workflow.

**Done when:** Another developer can run the local app using the README without receiving undocumented secrets or manually guessing setup steps.

### T14 — Deploy a sample-data demo

**Status:** Completed (2026-10-06). Hosted UI CRUD, exact totals, filters, reload/new-session persistence, cleanup, responsive/accessibility and security smoke checks passed. See [T14 verification](t14-verification.md).

**Depends on:** T13.

- Verify Vercel plugin capabilities and account access; use it for frontend deployment when suitable.
- Select and verify compatible Express hosting separately; do not assume frontend deployment also hosts the API.
- Confirm database provider connection mode, TLS, pool limits, and applicable costs before setup.
- Configure production API URL, allowed frontend origin, and server secrets through provider configuration.
- Use sample data only and document that the unauthenticated shared collection is accessible to anyone who can reach the API.
- Deploy the backend and frontend, then check complete CRUD, filters, totals, and persistence through deployed URLs.

**Done when:** The deployed sample-data flow works end to end, required environment settings are present, and the README records the demo URL and limitations. Local V1 remains complete even if deployment is blocked by unavailable hosting access.

## 5. Plugin checkpoints

| Plugin | Task | Action |
| --- | --- | --- |
| Figma | T03, T07 | Create the dashboard/form design and use it during frontend implementation. |
| Supabase | T04, T14 | Inspect existing PostgreSQL schema/history; verify access and connection settings. |
| Vercel | T14 | Configure and deploy the frontend using supported capabilities. |
| Notion | Optional throughout | Mirror task status and links if a planning workspace is requested. |

Verify each connection when needed. An available skill does not prove account access. If a plugin is unavailable, continue independent local tasks and record the specific blocked action. Markdown remains the source of project decisions.

## 6. Working method for each task

1. Read the task and related contract sections.
2. Implement only the task's required behavior.
3. Verify its completion criteria with the smallest meaningful checks.
4. Record what works, any decision changes, and remaining blockers.
5. Commit a coherent result before moving to dependent work.

Keep explanations simple enough to understand the flow, not just copy code. Do not introduce authentication, charts, budgets, or additional infrastructure to finish a V1 task.

## 7. Progress tracker

Mark tasks complete only when their completion criteria have been verified.

- [x] T01 — Prepare the project
- [x] T02 — Start frontend/backend skeletons
- [x] T03 — Figma interface design
- [x] T04 — PostgreSQL setup
- [x] T05 — Validation and API foundations
- [x] T06 — Create/read/summary endpoints
- [x] T07 — Dashboard layout
- [x] T08 — First complete flow
- [x] T09 — Editing
- [x] T10 — Deletion
- [x] T11 — Filtering and recovery
- [x] T12 — Local V1 verification
- [x] T13 — Documentation and handoff
- [x] T14 — Sample-data deployment

## 8. Decisions to resolve during setup

| Decision | Resolve by | Current position |
| --- | --- | --- |
| Runtime/package versions | T01–T02 | Verify compatible supported versions at implementation time. |
| Repository location | T01 | Use an existing repository if provided; otherwise initialize locally. |
| Database provider | T04 | Supabase PostgreSQL verified; baseline and limited-role migrations recorded as applied. |
| Authentication | V1 scope | None; hosted demos use sample data only. |
| Migration workflow | T04 | One authoritative history, matching the chosen setup. |
| Plugin account access | Relevant task | Verify individually; no connection assumed. |
| Express hosting and provider costs | T14 | Vercel Express project on the existing Hobby team; deployed in fra1. Operational usage/limits remain subject to provider policy. |

## 9. Immediate next action

T01-T14 are complete. [T12 verification](t12-verification.md) remains the local baseline; [T14 verification](t14-verification.md) records hosted acceptance and cleanup. No remaining implementation/deployment task in the V1 plan.

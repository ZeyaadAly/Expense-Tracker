# Expense Tracker — Implementation Plan

**Version:** 1.0  
**Date:** 2026-10-01  
**Status:** In progress; T04 remote baseline and database verification pending
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

## 3. Proposed project organization

| Path | Purpose |
| --- | --- |
| `docs/` | The five planning documents and later decision notes. |
| `frontend/` | Next.js application, components, API client, and frontend checks. |
| `backend/` | Express application, validation, database access, and API checks. |
| `backend/src/config/` | Validated server-only environment configuration. |
| `backend/src/db/` | Reusable PostgreSQL pool and database health check. |
| `backend/src/routes/` | REST route handlers. |
| `backend/src/validators/` | Request and query validation. |
| `backend/src/services/` | Future database access with parameterized queries. |
| `backend/src/middleware/` | Error handling and API middleware. |
| `README.md` | Project explanation and reproducible local setup. |

Choose one authoritative Supabase migration history when database setup begins. If Supabase CLI is selected, use its generated migration directory. Do not maintain duplicate migration histories.

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

### T04 — Set up PostgreSQL

**Depends on:** T01–T02.

- Link this repository to the existing Supabase project and pull the remote V1 schema into a CLI-generated baseline migration. Do not recreate the remote schema.
- Review the baseline against `03-database-design.md` and confirm remote migration history records it as already applied.
- Verify the limited application role and required function grants without exposing the private schema through the Data API.
- Configure one reusable Express `pg` connection pool using only server-only `DATABASE_URL`.
- Add a read-only PostgreSQL health check at `GET /api/v1/health` with the API error contract.
- Add repeatable sample seeding in `supabase/seed.sql`, separate from the baseline migration; do not seed the retained remote database during setup.

**Done when:** The CLI-generated baseline exists and is recorded as applied remotely; the linked project and database are reachable; a disposable database can apply the baseline and seed without errors; the application role has intended access; and no unintended Data API exposure exists. Lint, type checks, build, and both health success/failure cases pass. If CLI login, a database password, or Docker is missing, leave T04 open and record the manual step.

### T05 — Implement validation and API foundations

**Depends on:** T02; T04 is required before database integration checks.

- Add the `/api/v1` route prefix, JSON body limit, configured CORS, and no-store headers.
- Implement common error responses, unknown-route handling, and unsupported-method responses.
- Validate UUIDs, bodies, query parameters, category/type pairs, descriptions, and Cairo date boundaries.
- Normalize decimal strings without floating-point conversion and map database rows to API objects.
- Reject unknown body properties and unsupported query parameters.

**Done when:** Focused checks verify amount syntax/range, impossible/future dates, Unicode description length, malformed JSON, field errors, and metadata rejection. Unexpected errors do not expose internals.

### T06 — Build create, read, and summary endpoints

**Depends on:** T04–T05.

- Implement POST `/transactions`, GET `/transactions`, GET `/transactions/:id`, and GET `/summary`.
- Use parameterized SQL and deterministic date/creation/ID ordering.
- Generate IDs server-side and return saved records only after successful writes.
- Calculate all-transaction summary and count in one database statement.
- Follow the status codes, decimal strings, date-only strings, timestamps, and Location behavior in the API contract.

**Done when:** API checks can create and retrieve sample records, verify persistence, verify exact 0.10 + 0.20 totals, and distinguish empty data, invalid input, missing IDs, and database failures.

### T07 — Build the dashboard layout

**Depends on:** T02–T03.

- Implement summary cards, transaction rows/cards, filters, and accessible controls.
- Build the reusable form and confirmation UI following the Figma design.
- Use temporary fixtures only while layout is being built; clearly replace them during integration.
- Cover loading, empty, and error states in the components.

**Done when:** Main controls and forms work by keyboard and layouts are usable at 360px, 768px, and 1440px widths. The page does not hide actions or require page-level horizontal scrolling.

### T08 — Connect the first complete flow

**Depends on:** T06–T07.

- Add a small typed API client using `NEXT_PUBLIC_API_BASE_URL`.
- Load the transaction list and summary from Express.
- Connect Add Transaction to POST, display field errors, and prevent repeated submission while pending.
- Refresh list and summary after success; preserve inputs on rejection.
- Remove fixtures from the live dashboard.

**Done when:** A browser form saves a PostgreSQL row, the dashboard displays it, totals update correctly, and a refresh/restart preserves it. Record this as the first completed full-stack milestone.

### T09 — Add editing

**Depends on:** T08.

- Implement PUT `/transactions/:id` with all five editable fields required.
- Prepopulate the reusable form and apply the same validation as creation.
- Preserve ID and creation time; refresh update time.
- Refresh the dashboard after success and recover clearly from missing records or request failures.

**Done when:** Editing changes the same record and summary correctly; cancel changes nothing; invalid or missing-record updates do not create rows.

### T10 — Add deletion

**Depends on:** T08.

- Implement DELETE `/transactions/:id` with 204 success and 404 for absent records.
- Connect the confirmation UI; disable repeated confirmation while pending.
- Handle the empty 204 response without parsing JSON.
- Refresh list and totals after confirmed success.

**Done when:** Cancel preserves the row; confirm removes only the intended row; totals update; repeated deletion returns the documented not-found response.

### T11 — Finish filtering and request recovery

**Depends on:** T08–T10.

- Add validated type/category filters to the list endpoint and connect the frontend selectors.
- Use AND logic, category choices per type, reset behavior, and Other across both types.
- Preserve active filters after writes and keep summary totals independent of them.
- Ignore/abort stale list responses after rapid filter changes.
- Separate empty database from no matching results using the summary's transaction count.
- Handle read retry, uncertain write outcomes, and successful writes followed by failed dashboard refreshes.

**Done when:** Filters behave as specified, hidden-by-filter saves remain valid, stale requests do not overwrite current results, and failures never falsely report success or trigger automatic write retries.

### T12 — Verify local V1

**Depends on:** T09–T11.

- Run the meaningful verification cases in requirements, database design, and API design.
- Use focused validation tests and API integration tests against a disposable PostgreSQL database.
- Exercise the complete browser → Express → database → response flow.
- Check keyboard access, focus, loading/empty/error states, and responsive layouts.
- Run type checks, lint checks, and production builds.
- Fix failures and rerun affected checks. Record actual outcomes rather than checking boxes based on implementation alone.

**Done when:** All V1 acceptance criteria pass, required checks pass, and no unresolved issue prevents create/read/update/delete, exact totals, or filtering.

### T13 — Finish documentation and local handoff

**Depends on:** T12.

- Complete README instructions for prerequisites, dependency installation, environment variables, migrations, seeding, development, and builds.
- Explain the architecture, fixed currency, shared collection, and unauthenticated V1 limits.
- Update planning documents if implementation changed a contract; avoid conflicting descriptions.
- Verify setup from a clean checkout against a disposable database using the documented steps.
- Commit coherent changes and make the repository available through the selected Git workflow.

**Done when:** Another developer can run the local app using the README without receiving undocumented secrets or manually guessing setup steps.

### T14 — Deploy a sample-data demo

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
| Supabase | T04, T14 | Pull and inspect PostgreSQL schema; verify access and connection settings. |
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
- [ ] T03 — Figma interface design
- [ ] T04 — PostgreSQL setup
- [ ] T05 — Validation and API foundations
- [ ] T06 — Create/read/summary endpoints
- [ ] T07 — Dashboard layout
- [ ] T08 — First complete flow
- [ ] T09 — Editing
- [ ] T10 — Deletion
- [ ] T11 — Filtering and recovery
- [ ] T12 — Local V1 verification
- [ ] T13 — Documentation and handoff
- [ ] T14 — Sample-data deployment

## 8. Decisions to resolve during setup

| Decision | Resolve by | Current position |
| --- | --- | --- |
| Runtime/package versions | T01–T02 | Verify compatible supported versions at implementation time. |
| Repository location | T01 | Use an existing repository if provided; otherwise initialize locally. |
| Database provider | T04 | Supabase PostgreSQL selected; remote V1 schema reported applied. |
| Authentication | V1 scope | None; hosted demos use sample data only. |
| Migration workflow | T04 | One authoritative history, matching the chosen setup. |
| Plugin account access | Relevant task | Verify individually; no connection assumed. |
| Express hosting and provider costs | T14 | Undecided; must support the backend and database connection model. |

## 9. Immediate next action

Finish **T04 — Supabase PostgreSQL setup** by linking the CLI, pulling and verifying the remote baseline, and checking Express database connectivity. Do not start T05 until T04 is verified. T03 Figma design remains independent.

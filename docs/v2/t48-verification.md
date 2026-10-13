# T48 — Build Custom Category Backend

**Status: Completed locally, 2026-10-13 (Africa/Cairo).** Started from clean `main` synchronized with `origin/main` at `ab385cbabd8c4eca48c2255f6e6b692310850e78`. T47 stays optional/deferred; T49 — Build Core Settings Page is the next unstarted core task. Hosted financial acceptance remains **partial / intentionally deferred**.

## Frozen contract and registration

T48 adds these JWT-authenticated development routes under `/api/v2`:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/categories` | Existing T12 system + owned list; active by default, `status=archived` for archive management, existing kind filter/order |
| POST | `/categories` | Owned active category, 201 `{data}` and Location |
| PUT | `/categories/:id` | Full name/kind/icon/color update, 200 `{data}` |
| POST | `/categories/:id/archive` | Idempotent archive, 200 `{data,meta:{pausedRecurringCount}}` |
| POST | `/categories/:id/restore` | Idempotent restore, 200 `{data}` |

The frozen CategoryResource remains exactly `id`, `name`, `kind`, `icon`, `color`, `status`, `isSystem`. `userId`, owner and timestamps are not public fields. No GET single or DELETE route exists in API §62–67. The category management flag defaults off in `createApp`. Local `src/index.ts` enables it only outside production; the Vercel `server.mjs` entry point does not enable it. Production retains the T12 authenticated GET and rejects category POST with the GET-only method guard. No Settings/frontend route was changed.

## Validation, ownership and system rows

POST/full PUT require `name` and `kind`; nullable `icon`/`color` default to null. Name trims outer whitespace, preserves internal spaces and accepts 1–80 Unicode code points without truncation. NUL, unpaired surrogates, control-only/invisible-only names and invalid types fail400. `kind` is exactly `income`, `expense` or `both`; icon/color fit the existing 64/16-character columns. Unknown/owner/system/status/timestamp fields, lifecycle body fields, and management query parameters fail400 before SQL. UUIDs are canonicalized by the shared validator. Every write binds only the verified `req.auth.userId`; JWT user metadata cannot choose ownership.

The existing partial unique index enforces `(user_id, lower(name))` for custom rows across active and archived statuses. Case-only same-user duplicates return safe409 CONFLICT, including concurrent creates. Another user may use the same name. Custom `Food`, `Salary` or `Other` is allowed because system and user names have separate partial unique indexes. System categories remain immutable: visible system targets receive409 CATEGORY_IMMUTABLE on PUT/archive/restore; foreign and missing custom targets receive identical404 NOT_FOUND. No hard delete is exposed.

## Kind, history and lifecycle

Unreferenced custom kind can change. Once any transaction, recurring definition or budget references the category, kind is immutable and a change returns409 CATEGORY_KIND_LOCKED. The service locks the category row before checking references; existing T15 transaction/recurring/budget triggers take a category SHARE lock during reference writes and enforce kind/owner at the database boundary. Concurrent kind changes and creation serialize to one valid committed outcome. Existing transaction, recurring and budget reads join current category metadata, so renaming shows the new name without changing historical amounts, type, dates, ownership or totals.

Archive locks the category, then related definitions in ID order. The existing T15 trigger pauses active definitions in the same transaction; the service skips their unposted pending/failed occurrence reservations before commit. Posted history persists. New transaction/recurring/budget activity rejects archived categories through existing active-reference checks; existing transactions, budgets and definitions remain readable, and existing Budget amount/threshold may still be edited. Restore makes the category selectable again, with no automatic recurring resume. The user must explicitly resume a paused schedule. Repeated archive/restore and unchanged PUT avoid an UPDATE, preserving `updated_at`; real mutations use the existing timestamp trigger while `created_at` stays stable.

## Verification

- Fresh T48 UTF-8 PostgreSQL 17.11 cluster with V1/T11/T12/T15/T32 migrations, system seed and two synthetic Auth users: 2 tests passed; 95 counted API/database assertions, 7 concurrency groups, 4 injected post-write rollback probes. Real JWT and limited runtime role were used. User B could create the same custom name yet could not list or mutate A's category. No constraints, SQL, tokens or owner fields appeared in public errors/resources.
- Reference races covered category kind update against transaction, Budget and recurring creation. Concurrent duplicate create produced one201/one409 and one row; competing updates and lifecycle operations ended in valid states. Injected failures after create/update/archive/restore SQL rolled back rows, timestamps, recurring state and occurrence state.
- Historical transaction, recurring and Budget names followed a rename; financial transaction totals remained unchanged. Archive paused one active schedule and skipped its pending reservation. Archived new activity and resume failed safely; existing history remained readable. Restore permitted new compatible activity and explicit resume.
- A 1,000-additional-category local list completed in **24.59 ms** through the single existing parameterized list query. It sorted deterministically with system rows first; there is no N+1 loop. Existing category indexes sufficed; no speculative index was added. This is local evidence, not a hosted latency promise.
- Fresh expanded T16 isolation: 4 tests passed, **612 foundation checks** with real A/B custom-category create/list/update/archive/restore and foreign/missing equality; included T21 transaction 244, T17 account 263, T18 balance 285, search 263, filters 3,263, pagination 6,065, transfers 917, recurring 31, Budget 15, Goal 25 and Analytics 14 checks.
- Fresh T12 seed/read regression: 2 tests passed, including seed rerun, existing list filters/order, no-store, private privileges and V1 preservation. Fresh T29 regression: 3 tests, 357 checks, 10 races and 11 rollback faults passed. Fresh T42 regression: 4 tests, 194 checks on 30,012 transactions/777 budgets passed. Fresh T43 regression: 2 tests, 671 checks passed.
- Backend full suite without disposable integration variables: 132 tests, 104 passed, 28 intentionally environment-gated, 0 failed. Backend lint, typecheck and build passed. The final diff and secret scanner passed. All T48 disposable clusters were stopped.

## Boundaries and reproduction

No production database, hosted Auth account, environment, cron, manual deployment, schema migration, new privilege, dependency or frontend file changed. Production financial routes stay gated, V1 financial access remains retired and cron remains disabled. The private `expense_tracker` schema continues to deny anon/authenticated table access; the runtime role has only its existing DML privileges. RLS remains deferred under the frozen plan.

To reproduce the focused test, initialize a fresh password-free PostgreSQL cluster on `127.0.0.1:55451`, build the backend, set `T48_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55451/postgres` for that command only, and run `node --test backend/tests/v2-custom-categories.test.mjs`. The test helper applies the migrations/seed after checking the cluster is empty. `T16_DISPOSABLE_DATABASE_URL` runs the expanded cross-domain suite on a separate fresh cluster; T12/T29/T42/T43 each used another fresh cluster. None loads private `.env` files or accepts a remote host.

**Next core task:** T49 — Build Core Settings Page. T47 remains optional/deferred and was not started.

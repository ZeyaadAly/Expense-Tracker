# T12 — Default Category Seed and Early Category Reads

Verified locally on 2026-10-06 (Africa/Cairo). No remote database, production seed, profile provisioning, ownership backfill, accounts, transaction V2 CRUD or T13 work was performed. Frontend source/fixtures remain unchanged.

**Status: ✅ Completed.** T01–T12 complete; T13 is next and not started.

## Category seed

`supabase/seeds/v2-system-categories.sql` freezes nine categories: income Salary/Freelance/Gift; expense Food/Transport/Shopping/Bills/Entertainment; one Other with kind=both. Fixed UUID literals end in 001–009 under `c1200000-0000-4000-8000-000000000`; the exact mapping lives in the SQL and is independently asserted in tests. All rows have is_system=true, user_id=NULL, status=active and null icon/color.

The separate transactional reference seed uses ON CONFLICT (id) DO NOTHING. Rerunning preserves the entire row, including timestamps; custom rows remain untouched. A different-ID system-name conflict aborts through T11's unique index. It does not repair existing drift or reset edited data; inspect drift before later migration mapping. The unchanged supabase/seed.sql retains V1's three sample transactions and is never a production seed. Production reference seeding is deferred to the privileged maintenance workflow.

## Read API and isolation

GET /api/v2/categories uses T09 createRequireAuth, real ES256/JWKS verification and req.auth.userId. The parameterized query selects only system rows or the verified user's custom rows, without profiles/auth-schema reads. Both development and Vercel backend entry points wire the service. Public health and V1 financial contracts remain unchanged.

Response: `{data: [{id,name,kind,icon,color,status,isSystem}], meta: {count}}`, Cache-Control no-store. Default status=active; explicit archived selects archived only. Income/expense includes both; both selects both only; omitted kind includes all kinds. System rows precede custom rows, then name under C collation, then UUID. Unknown/empty/invalid/repeated/bracket filters and caller userId produce centralized 400 VALIDATION_ERROR. Missing/invalid tokens return 401; authenticated unsupported methods return 405. There are no category writes or archive handlers; T48 must enforce immutable system categories when it adds writes.

Real fixture requests showed User A receives nine system rows + A's active custom row, while User B receives nine system rows + B's active custom row. Neither sees the other's custom or archived rows. A's archived row is returned only with status=archived; B's archived response is empty. Reads work before any profile exists. Custom/auth fixture rows are removed afterward.

## Disposable database and V1 regression

A fresh PostgreSQL 17.11 cluster bound only to 127.0.0.1:55451 applied V1 migrations/seed, then all four unchanged T11 files through the existing fresh-cluster harness. All 339 T11 catalog, reversal, constraints and privilege checks passed. T12 inserted exactly nine expected UUIDs, reran without duplicates, reran again after adding custom fixtures, and preserved complete seeded/custom rows and timestamps.

Original V1 transaction rows, category strings, nullable ownership references and exact summary stayed unchanged during seed/API checks. The T11 representative five-row fixture totals remained income 1000000999.99, expenses 296.35, balance 1000000703.64. Full backend regression exercised real V1 CRUD/summary/persistence under the runtime role; legacy tests deliberately reset disposable transactions.

Runtime SELECT worked through the actual service connection. Existing T11 SELECT/INSERT/UPDATE/DELETE category grants remained present, with no grant changes. anon/authenticated had no schema usage or table CRUD permissions, and actual SELECT attempts failed with 42501. T11 also verified no DDL/admin/auth-schema access. Local Supabase configuration still excludes expense_tracker from exposed schemas. No hosted settings were inspected; these results certify local SQL/config boundaries, not remote state. This matches the [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api) on explicit grants and private schemas.

## Reproduction

Build backend from locked dependencies. Start a **fresh isolated** local PG17 cluster on 127.0.0.1:55451 with postgres database/admin and local trust authentication. Use no actual environment files or production URL.

1. Set T11_DISPOSABLE_DATABASE_URL to the password-free local admin URL; run `node --test backend/tests/v2-schema.test.mjs` from repository root. This applies V1/T11 and asserts empty V2 tables.
2. Unset T11_DISPOSABLE_DATABASE_URL. Set T12_DISPOSABLE_DATABASE_URL to the same disposable URL; run `node --test backend/tests/v2-categories.test.mjs`. This seeds/reseeds and exercises JWT/API/isolation/privileges.
3. Set T06_DISPOSABLE_DATABASE_URL to the same URL and run backend npm test serially with T12_DISPOSABLE_DATABASE_URL retained. The T11 fresh-cluster test is skipped because it already ran and cannot reapply.
4. Stop only this disposable cluster. Never point the fixture runners at retained or remote data.

The existing tests/scripts named t12 under backend and docs/t12-verification.md refer to **V1 T12**, not this V2 task. The new v2-categories.test.mjs and this report are the V2 evidence.

## Changes

Added separate reference SQL, category resource/filter types, query validator, read service/router and v2-categories.test.mjs. Wired app.ts/index.ts/server.mjs. Clarified database seed/API default contracts, updated README workflow/implementation checkpoint and ignored the new disposable artifacts. No migration, V1 seed, frontend source, dependency manifest/lockfile or Supabase config changed.

## Checks and next task

Backend build, lint and typecheck passed. Dedicated T12 tests: 2 passed, zero skipped/failed. Full backend suite: 35 passed, zero failed; only the previously executed fresh-cluster T11 test skipped.

Frontend lint, typecheck and production build passed; all 62 tests passed with zero skips/failures. Existing dependency installs lacked jose/backend and Supabase/frontend modules; npm ci restored the unchanged lockfiles. Owner-permission escalation was needed to replace generated/dependency files. The frontend install reported five high-severity dependency advisories; dependency upgrades were outside this task and no automatic audit fix was applied. Backend installation reported zero advisories. Selected tooling postinstall scripts remained blocked by the existing npm policy; requested builds/checks passed.

git diff --check passed. The disposable cluster was stopped and its log confirms shutdown. No visual browser rerun was needed for this backend-only change. No T12 blocker remains. Ready for **T13 — Provision Profiles**; T13 has not been implemented.

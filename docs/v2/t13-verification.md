# T13 — Provision Profiles

Verified 2026-10-06 (Africa/Cairo). Local/disposable only; no hosted Auth identities/emails, production database changes, deployment, financial ownership backfill, Main Account, account CRUD or T14 work.

**Status: ✅ Completed.** T01–T13 complete; T14 is next and not started.

## Provisioning and profile API

The frozen T02 contract is retained: POST /api/v2/profile/bootstrap (body exactly {}) explicitly provisions, while GET /profile reads without side effects and PUT /profile edits only displayName. GET/PUT missing profile returns 409 PROFILE_REQUIRED. Currency/locale/timezone are read-only, despite broader provisional fields in the task request. No schema or privileges changed.

createProfileService.ensureProfile inserts verified req.auth.userId with ON CONFLICT(user_id) DO NOTHING, then SELECTs in a fresh READ COMMITTED statement. This avoids the concurrent insert/select CTE snapshot gap and never touches an existing row. Twelve simultaneous first-bootstrap HTTP requests returned 200 and the same single row/timestamps. No unique errors leaked. Repeat bootstrap/GET and identical PUT preserve timestamps; actual changes use the existing T11 trigger. All output timestamps serialize UTC.

Defaults are exactly EGP/en/Africa/Cairo and displayName=null. Auth metadata is deliberately ignored, matching the frozen signup-draft contract; email remains authoritative in Supabase Auth and is not duplicated. PUT accepts required displayName=null or trimmed 1–100 Unicode code points, including supplementary characters. Empty names, control characters, lone surrogates, unknown fields and all query parameters are rejected. userId, email, preferences and timestamps cannot be submitted. No profile-ID route or financial writes exist.

All three routes use T09 ES256/JWKS requireAuth. Identity comes only from req.auth.userId. Profile response includes userId/displayName/preferredCurrency/locale/timezone/createdAt/updatedAt with no Auth internals. Database-unavailable errors return sanitized 503; absent auth.users FK or unexpected failures return generic 500 without SQL/details. Runtime never SELECTs auth.users or uses admin Auth credentials.

## Frontend boundary

A typed profile client uses T10 transport for bootstrap/getProfile/updateProfile, validates response/defaults/UTC dates and rejects foreign-owner responses. The bootstrap gate scopes token lookup to the expected current session user, aborts pending requests and suppresses late responses on unmount/user change. Protected children remain unmounted until bootstrap and any applicable registration draft finish. Loading, safe failure and keyboard-accessible explicit Retry reuse existing primitives. There is no automatic mutation retry. API 401 immediately invalidates the in-memory session, attempts local provider sign-out and redirects to login. Late startup session reads cannot undo invalidation. Same-user session refresh preserves fixture UI; user change unmounts it. Focus enters main only after preparation succeeds.

Registration stores only the validated display-name draft and signup UUID in tab-local sessionStorage after successful signup. The draft is applied via PUT only for the same verified UUID and only when the saved profile name is null. Another user's draft is neither used nor cleared. Existing saved names take precedence. Successful application clears the draft; failure preserves it for explicit retry. Storage-disabled/new-tab confirmation yields a valid null name. Passwords, email, tokens and provider metadata are not copied into the draft store.

Settings Profile edit UI and shell display-name integration remain T49; the shell keeps its Auth email identity. Financial pages remain approved fictional/development-only UI. Production V2 still returns 404 through the unchanged layout gate. No real financial client was integrated.

## Isolation, disposable database and V1

A fresh standalone PostgreSQL 17.11 cluster on IPv4 loopback 55451 applied unchanged V1 migrations/seed and all four T11 files through the existing 339-check fresh-cluster harness. T12 category SQL applied and its full read/isolation test passed. T13 created only disposable UUID FK fixtures, exercised real signed JWT requests against Express with the actual limited-role Pool, then cleaned Auth/profile fixtures.

User A/B bootstrap, GET and PUT returned only their own profile. A's bootstrap/update never changed B; userId injection/foreign path attempts were rejected. Tested concurrent bootstrap, null metadata fallback, Unicode updates, null clearing, unchanged/changed timestamps, missing-profile recovery path, missing Auth FK and safe DB errors. Defaults and single-row identity were exact.

V1 rows, category strings, timestamps, ownership nulls and exact totals were compared before/after T13 checks and stayed identical. No accounts were created. Full serial V1 CRUD/summary/persistence regression passed with unauthenticated V1 routes intact; those legacy tests intentionally reset disposable transactions. No V1 source, original SQL, seed or contract changed. The PostgreSQL cluster was stopped after verification.

## Security and verification

T11 SELECT/INSERT/UPDATE (and existing future DELETE) profile grants were retained. Actual profile operations worked under expense_tracker_app; SELECT auth.users failed with 42501. anon/authenticated lack schema usage and profile SELECT/INSERT/UPDATE/DELETE. T11's 339-check catalog/role/denied-DDL verification passed again. Local config keeps the private schema outside Data API exposure; no remote state is claimed.

Backend build/lint/typecheck passed. Dedicated T13 tests: three passed, no skips/failures. Full backend suite: 38 passed, no failures; the fresh-cluster T11 test alone skipped in the shared migrated suite because it had already passed separately.

Final frontend lint/typecheck/build passed and all 69 tests passed with zero skips/failures, including seven new profile/client/draft/gate/invalidation tests. React review confirmed the gate remains client-side, keyed by identity/session epoch, with external-store loading/error snapshots, cleanup aborts and no stale protected children. A bounded scan of 15 T13 source/test files found zero secret-key/private-key/credential-bearing database-URL or real JWT patterns; only the count was printed. Synthetic fixture tokens/names are explicitly marked. git diff --check passed; no real credentials or environment files were added. This is a scoped scan, not a repository-history certification.

Focused browser verification uses isolated Chrome with fictional SDK sessions and intercepted local profile responses, never hosted Auth. Thirteen checks passed: loading hides financial children; 360/768/1440px loading fits; successful preparation focuses main; same-user refresh preserves main; user switch removes/remounts it; failure offers Retry without automatic requests; Enter activates Retry; registration draft PUT/clear; 401 redirects with children absent; no page errors/overlays. This is UI verification, while real PostgreSQL/JWT/API behavior is separately covered by backend integration. The harness's DOM-serialization and keyboard-event issues were corrected before the passing run. Screenshot was visually inspected; browser/dev server were stopped. No complete unrelated browser/a11y suite was repeated.

## Reproduction

Build backend from existing locked dependencies. Start a fresh isolated PG17 cluster at 127.0.0.1:55451, postgres database/admin and local trust auth.

1. Set T11_DISPOSABLE_DATABASE_URL to its password-free local admin connection; run `node --test backend/tests/v2-schema.test.mjs` from repository root. Unset T11 variable afterward.
2. Set T06_DISPOSABLE_DATABASE_URL, T12_DISPOSABLE_DATABASE_URL and T13_DISPOSABLE_DATABASE_URL to that same disposable connection; run backend npm test serially. T12/T13 apply the separate reference seed themselves.
3. Run frontend lint/typecheck/test/build. Stop the disposable cluster.
4. For focused UI reproduction, run local frontend dev with synthetic NEXT_PUBLIC_SUPABASE_URL=https://t13-fixture.supabase.co, synthetic publishable key sb_publishable_t13fictional and NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1. Open localhost:3000/v2/login through an isolated agent-browser Chrome session, obtain its local CDP WebSocket URL, then run `node frontend/scripts/verify-v2-profiles.cjs <local-CDP-URL>` from repository root. The runner blocks external networking and mocks provider/profile responses. Stop browser/server afterward. No actual .env file needs modification.

Never use these fixture runners against retained or remote databases. Existing T12 workspace changes are preserved.

## Changes

Added backend profile resource/input types, strict validator, service/router and v2-profiles.test.mjs. Wired reusable app/development/Vercel entry points and V2 JSON parser. Added frontend typed client, draft/store, profile gate, registration draft callback and immediate session invalidation; added v2-profile tests and focused CDP browser runner. Updated API clarification, README, plan/report and disposable-artifact ignore. No migrations, dependency manifests/lockfiles, actual environments or Supabase config changed.

No T13 blocker remains. Ready for **T14 — Rehearse V1 Data Migration**; T14 has not been implemented.

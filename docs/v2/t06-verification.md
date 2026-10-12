# T06 — Frontend Auth Client

**Status:** ✅ Completed — 2026-10-06. T01–T06 complete; T07 next, not started. T04 approved UI and historical evidence are preserved.

## Implementation

Installed the official `@supabase/supabase-js` **2.117.2**, pinned exactly in frontend/package.json and package-lock.json. Supabase changelog and current MCP documentation were checked before implementation; the recent server-framework adapter deprecation does not affect this browser-only client. Next.js bundled environment and server/client boundary guides were read locally.

Modules under `frontend/src/lib/auth/`:

- `supabase-client.ts`: lazy browser-only singleton, with explicit public config validation. HTTPS URL without embedded credentials/path/query/hash and a modern `sb_publishable_` key are required. Placeholder, missing, private and legacy key inputs fail safely. Only hosted Auth is supported here, consistent with T05; local Supabase remains optional and disabled.
- `types.ts`: provider Session/User aliases and discriminated AuthResult plus safe error representation.
- `errors.ts`: normalized invalid credentials, registered email, weak password, confirmation required, network, invalid/expired recovery/session, rate limiting, configuration and unexpected failures. Raw provider text/stack is omitted; field hints support email/password handling.
- `auth-service.ts`: signup, signin, local-scope signout, recovery request, active-session password update, session/user reads, current access-token read and unsubscribe-capable auth-state subscription. Injectable provider boundary supports isolated tests.

No AuthProvider was added: helper modules are sufficient now; React state/loading integration is deferred to the page/route integration tasks. No existing route or fixture imports these modules. Missing Auth config cannot crash V1 or initialize Auth at module import time.

## Session and redirect contract

Supabase owns persistence, automatic refresh and URL-session detection. Browser-only implicit flow is explicit; no SSR cookies, callback endpoint or manual extra token storage is introduced. Signup confirmation goes to `/v2/login`; recovery goes to `/v2/reset-password`, using the current browser origin only when it exactly matches `http://localhost:3000` or `https://expensetracker-inky-mu.vercel.app`. Unsupported preview origins fail closed. These four exact destinations match T05; T07 must initialize/subscribe early on those pages to consume recovery state before navigating.

Signup returns nullable user/session and confirmationRequired; required confirmation is not mistaken for an authenticated session. Provider signup may intentionally obscure existing-account status, so a successful response does not prove a new identity was created. Display-name draft stays with the caller until later verified profile work; no user metadata is used for authorization and no profiles are provisioned.

getSession and getAccessToken read the provider-managed session. getUser asks the provider for the current user. Session reads are client state, not server authorization; T09 still owns authoritative JWT verification. No token copy is retained outside Supabase. Local-scope signout clears this browser's provider session; existing JWTs remain valid until expiry. Financial cleanup belongs to later route/session integration.

Subscriptions deliver all AuthChangeEvent values, including INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED and PASSWORD_RECOVERY. Delivery occurs outside the provider callback lock to avoid reentrant Auth deadlocks. Unsubscribe cancels queued deliveries and removes the provider subscription.

## Automated verification

Nine new tests cover invalid/missing config, lazy singleton/browser isolation, provider persistence options, actual SDK session restoration across client recreation using isolated in-memory fixture storage, signup confirmation and invocation, signin/user/session/token/signout, narrow recovery redirects/password update, deferred subscription events/cleanup, safe error normalization and failed provider requests.

The SDK restoration test verifies persistence behavior with a synthetic session and zero network calls; it does not certify a live JWT, live refresh or server identity. Mock tests create no real users and send no messages.

Frontend lint, type-check and production build pass. Full frontend tests: **36 passed** (27 previous plus nine T06 tests). No T04 browser suites were rerun because UI/source behavior was untouched. `git diff --check` passes. A bounded scan of four Auth source files and 15 generated static build files found no secret-key literals, private keys, credential-bearing PostgreSQL URLs or service-role JWTs; source scan confirms no financial/database methods or backend-secret imports. This does not certify repository history or future deployment values.

## Live verification limitation and manual check

No dedicated T05 credentials were supplied to this run. No live signin/signout, session refresh, registration or recovery request was executed by T06; earlier user-reported T05 provider verification remains separate evidence. Live testing is optional where safe in this task and does not block the verified reusable foundation.

When a private test environment is available, invoke the helpers from a temporary browser harness outside production UI: subscribe first, signin with the dedicated T05 account, assert a non-null session and nonempty access token without printing either, reload/recreate the client to check persistence, then signout and assert null session plus SIGNED_IN/SIGNED_OUT events. Unsubscribe afterward. Enter credentials privately; do not put them in repository files, URLs, console logs or chat. Do not enter real credentials into the fixture forms. Password-recovery consumption/page behavior is T07 work.

## Security and scope

Only `.auth` methods are used. No database/table/RPC calls or Express token attachment. Financial data remains Browser → Express → PostgreSQL. No backend source, migrations, ownership, profiles, financial schema, approved design, route guards or V1 behavior changed. Runtime modules reference only the two public Supabase variables. No admin/service-role key or database credential is introduced.

Online npm audit reports five high-severity findings through the existing eslint-config-next → fast-glob/micromatch/braces lint-tool dependency chain; none names a Supabase dependency. No unrelated downgrade or force-fix was attempted. These findings remain a separate tooling maintenance issue, not a T06 Auth blocker.

## Changes and handoff

Changed: four Auth modules, frontend dependency manifest/lockfile, nine-test auth suite, environment-example comment, README setup guidance, implementation plan and this report. Corrected stale T05 status labels to agree with the accepted manual completion evidence; no T05 provider checks were invented or rerun.

Architecture assumptions remain unchanged. T07 — Build Auth Pages with Real Supabase Auth is ready and not started. T08 route protection, T09 backend verification, T10 API token attachment and later profile/financial work remain separate.

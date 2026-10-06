# T09 — Backend Auth Middleware

**Status:** ✅ Completed — 2026-10-06. T01–T09 completed; T10 next, not started.

## Verification architecture

Pinned `jose` **6.2.12** supplies standards-based ES256 verification and remote JWKS discovery. `createRequireAuth(SUPABASE_URL)` creates reusable lazy middleware; `createTokenVerifier` owns one process-local resolver, not one per request. Backend configuration derives exact issuer `<SUPABASE_URL>/auth/v1` and its `/.well-known/jwks.json` endpoint. It accepts hosted HTTPS origins and development-only HTTP loopback; credentials, paths, query/fragment and placeholders are rejected without including their values in errors. Missing configuration does not break V1 startup or health; a protected request fails closed.

Verification pins ES256, exact project issuer and audience `authenticated`, requires expiration, UUID subject and authenticated role, and validates nbf when present with zero clock tolerance. These constraints come from the frozen T05 contract, including its user-reported 900-second hosted lifetime; no guessed audience or HS256 fallback. The backend enforces each token's actual expiration rather than inventing a fixed acceptance window. Nonempty kid is required. Email is optional convenience metadata; verified sub alone is authoritative. User metadata/body/query/path userId cannot establish identity.

Express request typing exposes optional `req.auth` with readonly userId/email. Middleware clears any pre-existing context, requires exactly one Bearer Authorization header, verifies the token and attaches only the minimal frozen context. It performs no SQL/profile/resource authorization. Future protected V2 routers must explicitly mount it; there are no financial V2 handlers yet.

## Safe failures, caching and exposure

- Missing/malformed Authorization: 401 `AUTH_REQUIRED`, `Sign in to continue.`
- Invalid/expired/signature/issuer/audience/subject/role/algorithm/unknown-key token: 401 `AUTH_INVALID`, `Your session is no longer valid. Sign in again.`
- Missing/invalid Auth configuration, JWKS HTTP/network/timeout or malformed key-set failure: 503 `AUTH_UNAVAILABLE`, `Authentication is temporarily unavailable. Please try again later.`

All use the existing JSON `{error:{code,message,details:[]}}` envelope and no-store. No Auth failure logs token/header/payload/email or raw provider errors. The new 503 code is recorded in API design.

Library defaults are explicit: 10-minute process-local key cache, 30-second fetch cooldown and five-second retrieval timeout. Unknown kid triggers refresh after cooldown; concurrent retrieval is deduplicated by jose. A valid cached public key remains usable until cache expiry during a provider outage; cache misses/retrieval failures never authenticate. Rotation may require propagation/cooldown time, and revoked keys may remain cached temporarily. Restart recreates the cache; no public keys are persisted by application code. Offline JWT verification does not immediately revoke an already-issued token after client signout; expiry remains the token boundary.

Added only the already-frozen public `GET /api/v2/health`, using the existing health router: API running/database reachable, no-store, 200/503, no Auth required. V1 health and financial routes remain unauthenticated and unchanged. No `/api/v2/auth/session` was added because it is absent from the frozen contract; a test-only Express router verifies downstream context without expanding the deployed API. CORS retains the exact configured frontend origin and permits Authorization preflight using the existing cors behavior; no wildcard or policy weakening.

## Tests and hosted evidence

- Backend lint, TypeScript check and build passed.
- Full backend suite: **32 groups, 28 passed, four existing disposable-PostgreSQL groups skipped**, zero failures. No disposable database was configured. Database/TLS/SQL code was untouched, so no live DB/TLS retest was needed or claimed.
- Eight new T09 groups cover safe URL configuration; actual local ES256 signing/verification; signature tampering/wrong project key; issuer/audience/expiration/nbf/subject/role; absent/optional email; none/HS256/RS256 rejection; kid selection/rotation/unknown kid; key caching; HTTP/malformed/network/timeout JWKS failure; strict headers including duplicate raw headers; exact JSON errors/no-store; body/query identity spoofing; public health/CORS and missing configuration.
- Existing V1 validation, CRUD service/HTTP, filtering and health regressions passed. Historical test names referring to T09/T10/T12 belong to V1 tasks, not new V2 work.
- T05 public hosted JWKS rechecked: HTTP 200, one EC/P-256 key advertising ES256. This confirms public discovery only, not live account-token acceptance.
- No dedicated-account credentials/access token were supplied. No live signed-in backend request was made; automated tests use generated ephemeral keys held in memory, never production signing secrets.

Optional private live check: in a local test-only Express harness mount `createRequireAuth(process.env.SUPABASE_URL)` before a minimal handler returning only `req.auth.userId`, followed by the existing error handler. Obtain the dedicated account's current access token privately through Supabase Auth; submit it to that local harness without terminal echo, history, repository storage or logging. Confirm 200 and the expected UUID, then missing/invalid credentials produce the documented 401. Do not add a deployed probe or send the token to V1 financial endpoints. Remove the temporary harness afterward. T10 will connect the real frontend transport separately.

## Configuration and security

`SUPABASE_URL` is nonsecret server-side metadata required only for protected V2 middleware. Existing `CLIENT_ORIGIN` is nonsecret CORS configuration. No publishable/service-role/admin key, signing secret or database credential is needed for verification. Existing `DATABASE_URL` remains secret and server-only for the unchanged database service; public health still uses its existing database reachability check. No real environment file was changed.

A bounded scan of **48 source/config/build/test files** found zero private-key, literal Bearer JWT, secret-key or non-placeholder credential-bearing database-URL patterns. Only counts were reported. No secrets were introduced or exposed; this does not certify repository history. npm installation reported zero vulnerabilities. The Supabase changelog was checked; recent framework-adapter deprecation does not affect this Express/jose integration. Official references: [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts) and [jose remote JWKS](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md).

## Changes and next task

Created `backend/src/config/auth.ts`, `middleware/auth.ts`, `types/auth.ts`, and `backend/tests/v2-auth.test.mjs`. Updated app public V2 health mounting, pinned backend dependency/lockfile, backend `.env.example`, API error documentation, implementation plan and README. The planned architecture is unchanged, so no architecture edit was needed.

No T09 blocker remains. **Next: T10 — Add Authenticated Frontend API Client. T10 has not started.** No frontend, profile, schema, financial ownership or migration work was performed.

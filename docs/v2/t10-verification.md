# T10 — Authenticated Frontend API Client

**Status:** ✅ Completed — 2026-10-06. T01–T10 completed; T11 next, not started.

## Architecture and token supply

`frontend/src/lib/api/v2-client.ts` is an isolated browser transport with GET/POST/PUT/DELETE methods. Each returns the data envelope plus optional list metadata, or undefined for 204. Generic payload types are caller contracts; later domain clients must validate domain shapes. Exact decimal strings pass through JSON unchanged. No fixture page imports the client and no financial endpoint or production probe was added.

Each request invokes the existing T06 `getAccessToken()`, reading Supabase's current managed session. No token snapshot, manual refresh, storage, logging, arbitrary per-request token/header or redirect argument exists. Factory token-supplier/fetch injection supports tests. T08 continues to own session state/navigation; this transport never signs out or redirects. Request headers use Bearer, JSON Accept and Content-Type only for a serialized body; cache is no-store, cookies omitted and redirects rejected.

## Errors, cancellation and retries

`V2ApiError` carries status, code, kind, field details and uncertain. Local failures use status 0 without fabricating HTTP responses. Missing token produces AUTH_REQUIRED without any fetch. Provider-helper failures produce safe AUTH_UNAVAILABLE. Backend 401 is auth; 503 AUTH_UNAVAILABLE is server availability with a retry-later message. Validation details are retained; raw backend top-level messages and provider errors are replaced by safe copy. Page consumers should map field details to appropriate UI copy, as in V1.

204 bypasses parsing. Other successful responses require a JSON data envelope; malformed/non-JSON/empty 200 responses produce INVALID_RESPONSE. Fetch failure is NETWORK_ERROR with safe copy. No request retries automatically, including GET. Interrupted dispatched writes, invalid write responses and non-503 server write failures carry uncertainty; callers must check saved data before retrying. Known 503 rejection is definite, matching V1.

AbortSignal is passed through and checked before and after token acquisition. Cancellation uses REQUEST_ABORTED / kind aborted, including body-read cancellation; it is distinct from network failure. A dispatched canceled write may still have committed. Tests attach rejection handlers before aborting and verify no unhandled rejection. Consumers must handle rejected promises and suppress cancellation UI when appropriate. Cancellation while awaiting the SDK token read is recognized once that read settles; this helper cannot cancel the provider's session operation. No new timeout/retry framework was introduced.

## Environment and URL contract

Keep the shared `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1` convention for V1 and existing production deployments. Only V2 converts a backend origin, `/api/v1` or `/api/v2` (optional trailing slash) to origin + `/api/v2`. Other paths, credentials, query/fragment, whitespace, backslashes and invalid schemes fail safely. Origin-only or V2-prefixed values are supported for V2-only use and must not replace V1 configuration while V1 remains active. No actual environment value changed.

Canonical relative endpoint paths cannot override the server or contain query fragments/traversal. URLSearchParams encodes scalar queries and omits null/undefined. Arrays and nonfinite numbers are rejected; no repeated-value contract was added.

## Integration and quality checks

`backend/tests/v2-client-integration.test.mjs` imports the actual frontend transport through its existing-style TypeScript test loader. A loopback test-only Express app mounts unchanged T09 middleware and error handling, with ephemeral in-memory ES256 signing keys and a local JWKS service. It proves GET/POST Bearer authentication and trusted UUID identity despite body/query/user-metadata spoofing, invalid and expired token 401 classification, zero requests for missing token, validation details, 204, JWKS 503 and actual connection-refused network failure. No production Supabase token or live user was required; no hosted signed-in end-to-end claim is made.

- Frontend lint, TypeScript check and production build passed.
- Full frontend suite: **62 passed**, including 10 new V2 transport tests and one explicit V1 Authorization/prefix regression. Existing Auth/session, fixture money, V1 CRUD and read-race tests passed.
- Backend build and lint passed. Relevant T09 and T10 integration tests: **9 passed**, zero failures/skips.
- `git diff --check` passed. No unrelated database suites were rerun; backend application source/SQL is unchanged.

## Security, isolation and changes

Source scans of the V2 transport/Auth/feature/routes found no financial Supabase table/RPC access, backend-secret imports, service-role/private-key literals or application token storage. Array.from fixture operations are not database calls. Existing Supabase provider persistence remains unchanged. Only ephemeral test keys/tokens are generated; none is written or logged. This bounded review does not certify repository history or future deployment configuration.

V1 client source and pages are untouched; the explicit test verifies its existing `/api/v1` URLs and absence of Authorization for reads/writes. V2 page/AuthProvider/UI/fixtures are untouched, so historical browser visual evidence remains applicable; no new browser visual or live provider check was claimed.

Added V2 client, frontend transport tests/test loader, backend test-only integration harness and this report. Updated V1 regression tests, frontend environment-example comments, API-design transport clarification, plan checkpoint and README. No dependencies or lockfiles changed by T10. Existing workspace changes from earlier tasks were preserved.

No T10 blocker remains. Ready for **T11 — Prepare V2 Additive Schema Migrations**; T11 was not implemented. Profiles, financial migrations/endpoints and replacement of fixtures remain deferred.

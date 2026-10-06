# T08 — Protect Frontend Routes

**Status:** ✅ Completed — 2026-10-06. T01–T08 completed; T09 next, not started.

## Session and route architecture

The V2 layout alone mounts the lightweight `AuthProvider`. Its external session store reuses T06 helpers, subscribes once per mounted lifecycle and cleans up subscriptions, expiry timers and page/visibility listeners. Startup reads cannot overwrite newer Auth events or update an unmounted store. The provider exposes session, user, loading, normalized errors, signOut and refreshSession. Supabase retains responsibility for token persistence and refresh; the application stores no second token copy.

One `ProtectedBoundary` gates `/v2/dashboard`, `/v2/transactions`, `/v2/accounts`, `/v2/recurring`, `/v2/analytics`, `/v2/budgets`, `/v2/goals` and `/v2/settings`. Unknown, missing or expired sessions render the existing styled skeleton/status pattern with financial children unmounted. Signed-out users are redirected to login. Fixture state is mounted only for a usable session and keyed by user identity plus session epoch: signout/user changes clear it, refresh and same-user updates preserve it.

Login, registration, forgot-password and reset-password remain public. Login/registration redirect an already-authenticated ordinary session to the validated return destination, defaulting to dashboard. Recovery sessions retain the reset flow. T07 now consumes the shared provider rather than creating a second subscription. Recovery permission remains in memory and is not inferred from an ordinary stored session.

`safeNext` accepts only the eight exact financial paths and their query strings. External URLs, protocol-relative URLs, other routes, backslashes, control characters and normalized traversal paths fall back to dashboard. Fragments are dropped. Successful login uses history replacement. The shell displays the Auth email, uses the existing signout helper with duplicate blocking and safely reports failures. Confirmed signout removes protected UI and returns to login; revisiting a protected URL without a session remains guarded.

An expiry timer removes content at access-session expiry if no newer refresh arrives. SIGNED_OUT also removes content immediately; TOKEN_REFRESHED resets the timer without remounting fixture UI or moving focus. USER_UPDATED preserves same-user UI; a different identity remounts it. Page-show/visibility checks cover session restoration after navigation or returning to a tab. Loading/expiry messages use accessible status announcements; authenticated entry focuses the main region.

## Temporary boundaries

Financial pages remain fictional prototype data, identified by the existing prototype presentation. Auth identity does not turn fixture records into personal finances. No financial fetches, Express Bearer headers, backend JWT verification, profiles, ownership migration or schema changes were introduced. Financial service access remains Browser → Express → PostgreSQL when later integrated.

The frozen development-only V2 layout remains intact: production V2 Auth and financial routes return 404. No deployment was performed. V1 is outside the provider and its API integration is unchanged. Missing V2 public configuration fails closed without affecting V1.

The plan's profile/bootstrap guard is explicitly deferred until T13 supplies that service. This completed T08 checkpoint covers the requested session gate over fixture-only UI; real financial rendering must additionally satisfy bootstrap before later integration. Backend 401 handling and financial request cancellation belong to the later authenticated transport/data tasks. None are claimed as implemented here.

## Verification

- Frontend lint, TypeScript check and production build passed.
- All **51 frontend tests passed**: nine T06 helper tests, eight T07 form tests, seven T08 session/redirect tests and existing V1/prototype tests.
- T08 browser runner exercised all eight signed-out routes, authenticated reload, initial loading with financial children absent, refresh without remount/focus loss, USER_UPDATED, identity change, signout and subsequent denied navigation, expiry, safe/malicious return destinations, authenticated login/registration redirect and recovery update.
- At **360/768/1440px**, dashboard, transactions, session-loading and post-expiry login states passed **12 representative axe audits**, with zero violations and no horizontal overflow. Four additional open-drawer audits passed; Escape dismissal restored focus to the navigation opener. Identity appears in the existing sidebar/drawer; signout remains a native keyboard-accessible button.
- T07's complete browser regression passed: **30 audits**, zero axe violations, validation/errors/pending/keyboard submission, confirmation, signup, recovery and signout. It caught and verified the fix for disabling reset mutation after an expired-recovery rejection. Historical T04/T07 evidence is preserved; current behavior supersedes their pre-guard Auth subscription and authenticated-registration notes. Use forgot-password or the shell to sign out an existing session; registration now redirects.
- V1 populated preview rendered its existing transaction content without a V2 theme. Production HTTP verification returned 200 for `/` and 404 for all four public V2 Auth routes and all eight financial routes.

See [sanitized T08 browser results](assets/t08/browser-verification.json). Browser runners use the installed SDK with intercepted **fictional** provider sessions in an isolated development source copy. No live account credentials were supplied, no real Auth emails were sent, and these checks do not assert hosted end-to-end authentication. T05's manual hosted evidence remains separate.

## Changes and next task

Created AuthProvider, session-store, redirect validator, shared protected boundary, seven unit tests and T08 browser runner/report. Updated V2 layout, Auth forms, shell identity/signout and minimal email wrapping/button styling; reused the T07 browser harness. Updated implementation-plan checkpoint and README. Approved composition and V1 implementation remain intact.

`git diff --check` passed. A bounded scan of 32 Auth/V2 source and browser-build files found zero secret-key/private-key/credential-bearing database-URL patterns. No real password, Auth token, reset link, signing key or database credential was introduced or exposed. This scan does not certify repository history or future deployments.

No T08 blocker remains. **Next: T09 — Add Backend Auth Middleware. T09 has not started.**

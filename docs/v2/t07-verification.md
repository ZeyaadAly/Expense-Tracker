# T07 — Auth Pages with Real Supabase Auth

**Status:** ✅ Completed — 2026-10-06. T01–T07 completed; T08 next and not started. Approved T04 layout, shared components, styling and historical evidence are preserved.

## Implementation

The existing `/v2/login`, `/v2/register`, `/v2/forgot-password` and `/v2/reset-password` pages now invoke the T06 Supabase helpers rather than fixture timers. `features/v2/auth.tsx` retains the approved story/form layout, labels, password visibility control, banners and navigation. Prototype state selectors, fake bootstrap retry and simulated resend behavior were removed. Auth copy now describes real authentication and the separate fictional financial pages.

`auth-form.ts` centralizes validation and typed mutation outcomes. Required fields, email format, creation-password minimum of eight characters and confirmation matching run before provider calls. Login accepts existing provider passwords without imposing the creation minimum. An immediate ref lock plus pending/disabled UI and a submitter lock prevent duplicate mutations. Email/name input survives rejection or network failure; password/confirmation values are cleared after success. Passwords remain only in component state and provider requests, never extra storage.

- Login calls signInWithEmail, requires a returned session and replaces history with `/v2/dashboard` on success. An existing session on initial login-page load also redirects there. Invalid credentials use a combined message; email-confirmation-required receives the existing warning banner. These are login-page behaviors, not global route guards.
- Registration calls signUpWithEmail and shows “Check your email to confirm your account.” with a login link. No immediate authentication is assumed. Provider duplicate-account obfuscation remains respected; successful signup response is not proof that a new identity was created. Display name is validated as a form draft; T06 does not send it as metadata and no profile row is created. Profile/name integration remains later work.
- Forgot password calls requestPasswordReset with the T05 exact reset destination and returns neutral account-existence wording.
- Reset initialization subscribes before reading the provider session. A PASSWORD_RECOVERY event carrying a session enables updatePassword; an ordinary signed-in session does not enable recovery. Invalid/expired contexts disable mutation and offer a fresh-link path. After successful update, the page shows confirmation, attempts local signout and provides a login link. Signout failure is shown safely rather than hidden.
- A development-only “Sign out test session” control on the Auth pages exercises the existing real signout helper without changing the financial shell. For an existing signed-in account, use `/v2/register` to access it because login redirects authenticated users.

Recovery permission is held only in memory for the current page lifecycle. Reloading after the SDK has consumed the recovery fragment requires a new recovery link; an arbitrary persisted session is not treated as recovery proof. Successful fragments are consumed by the SDK; failed Auth query/fragment parameters are removed after initialization. No raw link, token or provider error text is rendered/logged by application code. Production V2 routes remain development-only under the existing layout; this task does not deploy an authenticated application.

## Accessibility and responsive verification

Visible labels/autocomplete, associated field errors, password visibility buttons and keyboard submit reuse T03 primitives. First-invalid-field focus occurs after pending fields are re-enabled, including provider field errors. Forms expose aria-busy; pending, error and success states have accessible announcements. Mutation controls disable repeated submission.

Browser verification at **360, 768 and 1440 pixels**: four default Auth pages, three validation states and three successful registration/recovery states per width, **30 audits** total. Zero horizontal overflow and **zero axe violations**. Reset without recovery remains safely disabled. Labels, error references and focus passed. The submit-button contrast false positive from a background tab was resolved by foregrounding the browser test tab; no CSS change was made. Automated audits are not a full accessibility certification.

See [sanitized browser results](assets/t07/browser-verification.json) and [360px login screenshot](assets/t07/auth-login-360.png). Screenshot review confirms the approved mobile composition remains intact.

## Automated checks

- Frontend lint: pass.
- TypeScript type-check: pass.
- Production build: pass.
- Frontend tests: **44 passed**, including all nine T06 Auth tests, eight new T07 form tests, existing V1 tests and T04 money/period tests.
- T07 unit tests cover invalid login, valid invocation/redirect outcome, provider rejection/missing session, duplicate submit, signup mismatch/confirmation/error, forgot-password validation/success/failure and reset matching/context/error/success.
- Browser runner `frontend/scripts/verify-v2-auth.cjs` exercises actual pages and the installed SDK against intercepted fictional provider responses. It additionally verifies confirmation-required login, network errors, preserved email, pending state with one request, already-authenticated login redirect, keyboard Enter submission, signup field focus, exact recovery redirect, recovery fragment consumption, expired recovery, update success/local signout and development test signout with provider storage cleared.
- V1 populated preview still renders Grocery shopping with no V2 theme. Financial source/UI is untouched.
- Local production server: `/` returns **200**; all four Auth routes and `/v2/dashboard` return **404**, preserving the existing development-only layout boundary.
- Missing public config was checked on the original dev server: the Auth page shows a safe configuration banner and meaningful forms; V1 remains independent. No environment values appear in that banner.

Browser reproduction uses a disposable source copy, synthetic public Auth URL/key and an isolated foreground Chrome session started with agent-browser. Existing IPv4 development server/environment was preserved; the test copy bound IPv6 loopback with the exact localhost origin. The test intercepts only its fictional Supabase host and never calls real hosted Auth. The runner takes a local CDP WebSocket URL and expects the existing optional axe installation under `.npm-cache/t03-tools`; these are verification prerequisites, not application dependencies. No new dependency was installed for T07.

## Live verification and manual handoff

No dedicated-account password or live recovery link was supplied. **No live T07 signin, signout, signup, reset email or password update was executed.** T05's user-reported provider verification remains separate historical evidence. Browser mock results are not claimed as hosted email delivery or production end-to-end verification.

To perform the optional live check privately, configure the two public Supabase variables in the frontend local environment and restart development. Enter the dedicated T05 account only into the real Auth forms. Verify login/session/dashboard redirect, visit `/v2/register` and use the test signout control, then verify login no longer redirects. Request recovery for the controlled mailbox, follow its link privately, update the password, confirm success and sign in with the new password. Registration confirmation can be checked with a separate permitted disposable mailbox. Do not save passwords/tokens/links in repository files, logs or screenshots. Real confirmation/reset pages must be deployed in a later production stage before testing those production destinations.

## Security, changes and next task

Supabase calls remain Auth-only. No financial table/RPC query, Express Bearer header, backend JWT middleware, profile provisioning, ownership migration or financial schema change. Financial data still goes Browser → Express → PostgreSQL; the dashboard and other financial routes remain fictional and are not tied to the Auth user. No V1 Auth behavior was introduced. T08 financial-state cleanup/route protection and T09 verification remain separate.

Changed/created: auth.tsx, auth-form.ts, v2-auth-form.test.mjs, browser verification runner, sanitized T07 assets, UX behavior note, implementation-plan checkpoint, README status and this report. T06 helpers/dependency versions remain unchanged.

`git diff --check` passed. A bounded scan of **22 Auth source/build files** found no secret-key literals, private keys, credential-bearing PostgreSQL URLs, service-role JWTs or financial/backend-secret imports in the changed Auth pages. This does not certify repository history or future deployment configuration. The browser runner also blocks external fetches outside its fictional provider, preventing accidental live account/email requests during reproduction. No real credential or token was introduced. No remaining T07 implementation blocker; optional live verification is explicitly limited above. **Next: T08 — Protect Frontend Routes. T08 has not started.**

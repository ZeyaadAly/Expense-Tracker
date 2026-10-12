# T05 — Supabase Auth Foundation

**Status:** ✅ Completed — 2026-10-06. Completion includes the user's manual acceptance evidence below. Approved T04 visual design and verification evidence are preserved. T06 proceeds separately.

## Initial audit and findings (historical partial checkpoint)

Connected project: `expense-tracker`, ref `kpbyvbgcfwavcsgtcdws`, ACTIVE_HEALTHY. No hosted setting was changed. The connected Supabase tools provide project/database/public-key inspection, but no Auth configuration or signing-key management operations. No management access token was present in the execution environment. No dedicated test-account credentials were supplied.

- Public `/auth/v1/settings`: HTTP 200; email provider enabled, signup allowed, `mailer_autoconfirm=false` (email confirmation required), phone provider disabled. Other provider configuration was not fully audited.
- An active modern publishable key and active legacy anon key exist. Key values were not written to repository files or verification output. New frontend work must use the publishable key.
- Public `/auth/v1/.well-known/jwks.json`: HTTP 200, one EC/P-256 key advertising ES256. This demonstrates asymmetric public-key discovery, not proof of the currently active signing key or a newly issued token's algorithm.
- Hosted Site URL, redirect allowlist, JWT expiry, SMTP/email templates and session policies are not exposed by the available tools and remain unverified.
- Local config has Auth disabled, 3600-second JWT expiry, `http://127.0.0.1:3000` Site URL, an HTTPS loopback redirect and email confirmations disabled. These dormant local settings are not hosted settings and must not be treated as the V2 production policy.
- Existing financial migrations remain unchanged. Read-only hosted SQL confirms both `anon` and `authenticated` lack USAGE on `expense_tracker`. The hosted Data API exposed-schema list was not established by the SQL tool response; verify it in Dashboard. Locally only `public` and `graphql_public` are exposed.

## Verified hosted configuration

Email/password signup and required email confirmation already match the frozen architecture. Retain confirmation in hosted development as well as production. Do not add social providers.

Manually verified Site URL: `https://expensetracker-inky-mu.vercel.app`.

Manually verified exact redirect entries:

- `http://localhost:3000/v2/login`
- `http://localhost:3000/v2/reset-password`
- `https://expensetracker-inky-mu.vercel.app/v2/login`
- `https://expensetracker-inky-mu.vercel.app/v2/reset-password`

The user confirmed these hosted entries on 2026-10-06 after completing the remaining manual acceptance checks. Planned browser-only flow uses confirmation redirect to login and recovery redirect to reset-password. No separate callback route is required for the proposed direct browser session handling; confirm the actual client flow in T06 before adding any callback URL. Email templates must honor the requested redirect. Production V2 prototype routes currently return 404 by design; configuration readiness does not imply a working production recovery page.

The user manually verified access JWT lifetime of **900 seconds** and the documented **ES256/JWKS** signing contract. Do not revoke existing keys or rotate legacy API keys as part of this audit. If migration/rotation is needed, inspect existing consumers and follow the provider's standby/current-key procedure first.

## JWT contract for T09

Project URL: `https://kpbyvbgcfwavcsgtcdws.supabase.co`.
Expected issuer: `https://kpbyvbgcfwavcsgtcdws.supabase.co/auth/v1`.
Verified public JWKS endpoint: `https://kpbyvbgcfwavcsgtcdws.supabase.co/auth/v1/.well-known/jwks.json`.

T09 must use jose remote JWKS, pin ES256 and exact issuer/audience `authenticated`, validate expiration/nbf, authenticated role and UUID `sub`, and fail closed. No shared JWT secret or admin credential is needed. The user reports the dedicated authenticated test session matches the documented contract, including the verified 900-second lifetime. This completion evidence is user-reported manual verification; the agent did not independently inspect the token. Public JWKS discovery alone cannot establish those claims. Sign-out clears the client session and revokes refresh access according to scope; existing access JWTs may remain valid until expiry.

## Environment and local workflow

Frontend public values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, existing `NEXT_PUBLIC_API_BASE_URL`. Examples contain placeholders only. Backend `SUPABASE_URL` is nonsecret server configuration used later to derive issuer/JWKS; audience and algorithm remain pinned constants. `DATABASE_URL` is secret/backend-only; `DATABASE_SSL_CA_FILE` is a public certificate path. No new admin/service-role credentials, JWT signing secret or application dependency was introduced.

Use hosted Auth from local frontend `http://localhost:3000`; local Supabase Auth remains disabled and Docker is optional. Merely editing config.toml does not configure the hosted service. Current prototype uses fixtures and consumes none of these new values. T06 owns one browser client, session persistence, automatic refresh and auth-state handling; no client was implemented here.

Browser financial access remains Browser → Express → PostgreSQL. Browser Supabase usage is Auth only. Do not expose `expense_tracker` through Data API. Supabase `auth.users` holds identities; application `expense_tracker.profiles` is separate future T11/T13 work. No profile, ownership or financial migration was performed.

## Completed manual acceptance verification

Evidence source: the user's completion report supplied on 2026-10-06. These checks were performed manually with a dedicated V2 test account; they were not rerun by the agent during this documentation update. The earlier agent audit remains recorded above as historical evidence.

| Check | Result |
| --- | --- |
| Hosted Site URL and four redirect targets | Passed - manually confirmed |
| Email/password enabled | Passed - manually confirmed; consistent with initial public settings audit |
| Email confirmation required | Passed - manually confirmed; consistent with initial public settings audit |
| ES256/JWKS contract and 900-second JWT lifetime | Passed - manually verified |
| Dedicated-account signup | Passed |
| Email confirmation | Passed |
| Sign in and authenticated session | Passed |
| Sign out | Passed |
| Forgot-password request | Passed |
| Password-reset redirect | Passed |

Recovery evidence covers provider request acceptance and the reset redirect. Full application password-update UI, client session persistence/refresh integration and production authenticated pages remain later-task work; this report does not claim they were implemented or tested. The test account's mailbox, password, token contents and reset link are intentionally omitted.

T05 configuration/provider acceptance is satisfied by the initial read-only audit plus the user's completed manual checks. No remaining T05 manual actions or blockers. Hosted SMTP internals and the Data API schema list were not independently re-audited; the previously verified financial-schema privilege denial remains the security evidence, and no financial access configuration changed in this update.

Current checkpoint: T01 ✅ Completed; T02 ✅ Completed; T03 ✅ Completed; T04 ✅ Completed; T05 ✅ Completed; T06 ⬜ Not Started.

Next task: **T06 - Add Frontend Auth Client**. Ready to begin in a separate task; no T06 implementation was performed here.

## Changes and regression

Initial T05 changes: frontend/backend environment examples, local Auth workflow comment, README setup guidance, implementation-plan status and this report. Architecture assumptions remain valid and unchanged. No frontend/backend source, dependencies, financial schema, migration, V1 behavior or approved UI changed.

This completion update changes only this report, the implementation plan and the stale README status. No hosted configuration or application source changed.

Relevant validation: `git diff --check` passed; credential-pattern scan of changed examples/config/README/report passed (secret/publishable-key literals and JWT patterns). This bounded scan does not certify all repository history. Config changes are comments only; required variable names and documentation targets were checked. Application lint/type/build and T04 browser suites were not rerun for example/comment/document-only changes; no new runtime configuration source was added. Historical T04 evidence is retained, not re-executed.

## Provider references

Supabase changelog fetched successfully on 2026-10-06; recent framework-adapter deprecation does not affect this configuration-only task. Current [signing-key guidance](https://supabase.com/docs/guides/auth/signing-keys), [redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls) and [SMTP limitations](https://supabase.com/docs/guides/auth/auth-smtp) informed the completion steps. Initial hosted findings come from project read-only inspections; completion findings are explicitly attributed to the user's manual verification.

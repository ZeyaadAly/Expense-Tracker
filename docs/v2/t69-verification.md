# T69 — Production Auth Verification

**Status: Completed in the requested practical Auth scope.** Starts after completed T68 at `69debe9f55a27f2cdb65c15bd7d93f7d43fe0ea3`. Financial writes and cron remain disabled; only the two controlled acceptance subjects have backend read-only access. Original owner credentials/session were never requested or used.

T67/T68 already verified genuine hosted A/B ES256 sign-ins, profile bootstrap, eight protected routes, reload/session restoration and sign-out. T69 adds **10 real hosted browser checks**: a missing recovery context cannot submit; an actual provider recovery link establishes the reset context on the production page; the controlled account password changes; token/query material is removed from the visible URL; the old password is rejected; the new password signs in with verified issuer/audience/ES256/subject; normal login UI accepts it; reload restores the session; sign-out clears the protected app; a later protected URL redirects back to login. Zero browser page errors; no financial writes or original-owner changes.

## Provider configuration defect fixed

The initial supported recovery link unexpectedly targeted `http://localhost:3000/`. The installed SDK correctly supplied the production reset redirect; current provider configuration still had localhost Site URL and an empty redirect allowlist. Verification stopped at that broken boundary until fixed.

The existing Supabase CLI2.119 had a valid native credential-store login even though no process/local dotenv management token was present. It was reused without retrieving or printing the credential. Current configuration was pulled privately into an isolated ignored workdir. The reviewed [sparse URL artifact](../../supabase/operations/t69-auth-urls.toml) declares only Site URL and two exact trusted login/reset URLs. CLI diff showed exactly2 actionable changes; config push changed only those2 fields and explicitly preserved10 undeclared remote properties, including required confirmation, MFA and all unrelated services. No SMTP/password/signing-key/RLS/CORS change occurred.

After the repair, a fresh provider-generated recovery link targeted the correct production reset page and the complete browser reset flow passed. Email Auth remains enabled, signup enabled, `mailer_autoconfirm=false`. User tokens/passwords/recovery URLs stay in ignored private operator state; reports contain none.

## Signup/confirmation and practical limits

Both controlled identities were created/confirmed through the supported administrator API, rather than fabricated JWTs or direct Auth-table SQL. Public signup with the reserved synthetic `example.com` address returned400 `email_address_invalid`, issued no session and created no identity. It is not presented as a successful deliverable-mailbox signup. The confirmation policy remains required; actual signup/confirmation/reset **email delivery to a real controlled mailbox was not exercised**. Recovery/reset acceptance used a supported administrator-generated link, with genuine provider verification and normal production UI password update. This follows the request's “as practical” qualification and does not claim SMTP/delivery certification.

No application code changed for T69. The earlier114 backend/185 frontend tests remain their separately reported results; the new evidence is the provider configuration diff/push and10 hosted browser checks. The retained transaction/financial tables were not mutated. T70 production A/B isolation is next automatically. Controlled financial write-enable must be explicitly checkpointed before creating any T70/T71 financial fixtures; public access and cron remain closed.

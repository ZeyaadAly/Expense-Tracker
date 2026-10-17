# Production Deployment and Handoff

Production frontend: https://expensetracker-inky-mu.vercel.app/. Backend: https://expense-tracker-api-green.vercel.app/. Supabase project: `kpbyvbgcfwavcsgtcdws`, `expense-tracker`, eu-central-1. The final accepted Git and deployment IDs are in [T75](t75-verification.md). Work on main; commit/push source before deployment and verify the provider Git SHA, READY state and real application behavior.

## Environment contract

| Backend server only | Purpose |
| --- | --- |
| DATABASE_URL | Verified Session Pooler connection as expense_tracker_app, never postgres |
| DATABASE_SSL_CA_FILE | Packaged certs/supabase-ca.crt; keep certificate/hostname verification |
| CLIENT_ORIGIN | Exact production frontend origin |
| SUPABASE_URL | Expected hosted Auth issuer; ES256/audience pinned in backend |
| CURSOR_SIGNING_SECRET | Distinct random cursor key; rotation invalidates existing cursors |
| CRON_SECRET | Distinct private sensitive scheduler credential; never a user JWT |
| V2_RELEASE_STAGE | maintenance, read-only, controlled or public; production defaults maintenance |
| V2_ACCEPTANCE_USER_IDS | Exact verified controlled subjects for pre-public stages; no emails/metadata identity |
| V2_CRON_ENABLED | true only after T66-T71; scheduler acceptance completed at T72 |

| Frontend configuration | Purpose |
| --- | --- |
| NEXT_PUBLIC_API_BASE_URL | Hosted backend; V2 transport normalizes to /api/v2 |
| NEXT_PUBLIC_SUPABASE_URL | Hosted Auth project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser-safe publishable key, never an admin/service secret |
| V2_APP_ENABLED | Server-only true for production core routes |

Public browser configuration is embedded at build time. Environment changes require a new deployment from the committed Git source; redeploying an old deployment may inherit its old environment. Keep separate credentials for database, cursors and cron. Never print private environment files, Auth sessions, recovery URLs or credentials in reports/logs.

Supabase Auth site URL is the frontend origin. Exact allowed redirects include `/v2/login` and `/v2/reset-password`; email confirmation remains required. T69 verified actual recovery/reset using a controlled provider link. Mail delivery to a real mailbox remains unexercised. The temporary release Auth operator is retired at release closure; it is not a runtime application dependency.

## Verify a deployment

1. Run the changed package's lint/typecheck/build and appropriate tests. Verify clean synchronized main and deploy its exact SHA. Keep production aliases on accepted READY deployments.
2. Check `/api/v2/health` reports database reachable. Verify TLS with the limited runtime identity, exact frontend CORS, no-store/private responses and no browser financial Supabase traffic.
3. Without a token, private `/api/v2` endpoints return401. A real signed-in identity can bootstrap its profile and use only its own accounts/transactions/planning data. `/api/v1` financial routes remain410.
4. Verify the immutable backend deployment URLs and legacy aliases deny anonymous V1 financial access. Keep Vercel protection enabled for all deployment domains except intentional public application domains. Do not bypass protection to prove a denial.
5. Verify login/reload/sign-out, account creation, transaction CRUD and exact aggregate behavior with controlled users. Do not post financial acceptance data to the retained owner. Remove test transactions/transfers/budgets and archive test metadata after verification; retain occurrence markers.

## Recurring operations

The active Vercel schedule is `0 3 * * *` UTC, calling GET `/internal/recurring/process`. Provider scheduling precision applies; exact minute execution and automatic retry are not assumed. Correct CRON_SECRET authorization is required; no query/body/HEAD/POST is accepted. Processing uses Cairo today, limits100 per definition/1000 attempts and a45-second cooperative budget below the60-second function duration.

Inspect only request/timing/counter logs. Zero failed/failureRecordingErrors is healthy; backlog/limit/deadline flags require reviewed continuation. A deliberate invocation with the same private scheduler credential is duplicate-safe. Never recreate a deleted generated transaction by deleting its terminal marker. Archive/pause definitions to stop future generation; these do not remove posted history.

## Maintenance and recovery

Set backend V2_RELEASE_STAGE=maintenance and V2_CRON_ENABLED=false, deploy a fresh committed artifact and verify financial/cron503 before repair. The frontend may stay available for Auth; do not promise mutation success while maintenance is active. Keep V1 retired even during recovery. Controlled/read-only stages require the exact verified acceptance subject allowlist.

The user explicitly waived backup/independent restore while requiring the existing record preserved. No BACKUP_DATABASE_URL or tested restore artifact is part of this release. The original private inventory remains retained locally; the public preservation fingerprint is documented in T66/T70/T75. Financial writes have occurred: **Window B / forward-only applies.** Do not restore a historical snapshot, run V1 code against V2 grants, replay migration/backfill/seed or weaken ownership/durable-ledger triggers as an emergency shortcut. Inspect current state, preserve new activity and use a reviewed forward fix.

All eight production migrations were already applied and matched a fresh native schema chain. Migration, category seed, owner assignment and Main Account provisioning were verified and skipped rather than replayed. System categories remain nine active/unowned entries. The original one-row EGP9,500.00/Main Account baseline is preserved.

## Evidence and scope

[T66](t66-verification.md), [T67](t67-verification.md), [T68](t68-verification.md), [T69](t69-verification.md), [T70](t70-verification.md), [T71](t71-verification.md), [T72](t72-verification.md), [T73](t73-verification.md), [T74](t74-verification.md), [T75](t75-verification.md).

P1 T35/T41/T47/T50-T56 are deferred. Core release does not include insights, goal projections, reports/exports or the other unpromoted enhancements. Local broader regression evidence remains in T57-T65; hosted reports distinguish actual production checks from guarded local tests.

# Expense Tracker V2

Authenticated expense tracking in EGP, with accounts, credit cards, transactions, transfers, recurring entries, Dashboard, Analytics, budgets, manual savings goals and custom categories.

- [Production application](https://expensetracker-inky-mu.vercel.app/)
- [Backend health](https://expense-tracker-api-green.vercel.app/api/v2/health)
- [Deployment and operator handoff](docs/v2/production-deployment-runbook.md)
- [Implementation status](docs/v2/07-implementation-plan.md)
- [Migration and recovery runbook](docs/v2/production-migration-runbook.md)
- [Final release verification](docs/v2/t75-verification.md)
- [Current UI density and loading refinement](docs/v2/redesign/06-density-and-loading-refinement.md)
- [Historical Clear Ledger redesign evidence](docs/v2/redesign/05-redesign-verification.md)

**Core V2 is complete and ready for normal authenticated production use.** T66-T75 passed in their documented scope. The final public release checkpoint is recorded in T75; use that report for deployment/source evidence and verification limits. V1 financial endpoints are permanently retired with HTTP410. Optional P1 T35/T41/T47/T50-T56 remain deferred.

## Use the application

Register with a real email address and confirm it, or sign in to your existing account. Add an EGP account, then record income and expenses against its account and category. Use a transfer to move money or pay a credit card; a card payment is not another expense. Recurring definitions describe future entries; the daily job posts due occurrences. Goals track manual progress without moving account money.

Existing owner data is preserved: one EGP9,500.00 income transaction and its Main Account. Controlled acceptance transactions, transfers and budgets have been removed; test accounts/categories/goals/definitions are archived, and one terminal occurrence marker is intentionally retained. The owner workspace is not a test fixture.

## Develop locally

The packages use Next.js16/React19 and Express5/TypeScript with Supabase PostgreSQL/Auth. Install each committed lockfile with npm ci in backend and frontend. Copy each package's .env.example into its local ignored environment file and configure your own verified development project. Never paste server credentials into NEXT_PUBLIC variables. Read frontend/AGENTS.md and the installed Next.js documentation before Next changes.

Run npm run dev in backend and frontend in separate terminals. Backend defaults to port4000 and frontend to3000. Use /v2/login and /v2/dashboard. Local visual fixtures are development-only. Production V2 routes require V2_APP_ENABLED=true; production backend defaults to maintenance unless explicitly released. Financial SQL must run as the limited expense_tracker_app role over verified TLS.

Use npm run lint, npm run typecheck, npm run build and npm test in each package. Backend database integration scripts require their documented guarded disposable PostgreSQL targets; skipped guarded tests do not mean production tests ran. Production acceptance reports T70-T73 cover real hosted Auth/API/browser flows.

## Data and security

Browser financial traffic goes to the authenticated Express /api/v2 API. Supabase browser traffic is Auth only. The backend verifies ES256 issuer/audience/subject and scopes every financial operation to that identity. Amounts and totals are exact decimal strings calculated in PostgreSQL; calendar dates use Africa/Cairo. Direct browser financial grants are closed. Production errors are sanitized and private responses use no-store.

The user explicitly waived production backup and independent restore after disclosure of the retained transaction. **No tested recovery artifact was created. Recovery is forward-only after V2 writes.** Preserve the private original-row snapshot and never blindly replay a backfill or restore an old database over new activity. No BACKUP_DATABASE_URL is required for this authorized release.

Hosted login, session reload, sign-out and actual password reset passed. Delivery of signup/recovery mail to a real mailbox was not exercised; reserved synthetic signup was rejected without creating an identity. See T69 for this practical verification limit. The installed Edge/Chromium production accessibility smoke passed40 audits; broader cross-engine certification was not performed.

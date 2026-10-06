# Vercel deployment repair — 2026-10-03

> **Historical checkpoint:** This report preserves the results and task/deployment state at its recorded date. Later-task and fixture-only statements are historical. Current local V1 evidence is in [T12 verification](t12-verification.md); current setup/status is in [handoff](07-handoff.md). T14 is now complete; see the current hosted verification.


## Current hosted result — 2026-10-06

[T14 verification](t14-verification.md) supersedes the earlier blocker audit. Team access is restored. Both production deployments are READY from `b7e0d9f`, environment keys are configured, and hosted CRUD, persistence and cleanup passed.

Frontend: https://expensetracker-inky-mu.vercel.app/

Backend: https://expense-tracker-api-green.vercel.app/

Responsive/accessibility and production network/security smoke checks passed. Original records and totals were restored. No deployment or configuration was changed during this verification. Historical repair evidence below is retained.

## Historical repair evidence

Project: `expense_tracker` (`prj_NESamwRVpFVS31y1LiulTAnZMvkh`).

The failed deployment `dpl_FyEJ4zBDDC6Lb1fax6MZpaxLdxr7` built Git commit `99aef37` from the repository root. Next.js failed because it could not find a `pages` or `app` directory. The application lives in `frontend/src/app`.

Changed the remote project's Root Directory from the repository root to `frontend`. Retained the Next.js preset, Node.js 24.x, and default build settings. Vercel documents this setting under [Configure a build](https://vercel.com/docs/builds/configure-a-build).

Redeployed the existing Git source as preview `dpl_2qMQS245YJHJsXQx6Cgorob7yzfZ`, which reached Ready with a 28-second build. Preview page inspection was blocked by Vercel Authentication; protection was preserved. Promotion created production deployment `dpl_HYq9jCjsrwoDPptaFHDiratr7WQ2`, which reached Ready with a 27-second build.

Verified https://expensetracker-inky-mu.vercel.app returns HTTP 200 with Expense Tracker and Transactions content, without a Vercel login page. The team-scoped alias remains protected. Local `frontend` production build also passed.

Chrome verification confirmed the dashboard renders its summary, transaction rows and filters, and clicking Add transaction opens the required form. Documentation whitespace checks passed.

The redeployment uses the existing remote Git source, not uncommitted local changes. It serves the fixture frontend; this does not complete backend integration or the full-stack deployment milestone.

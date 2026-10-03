# Vercel deployment repair — 2026-10-03

Project: `expense_tracker` (`prj_NESamwRVpFVS31y1LiulTAnZMvkh`).

The failed deployment `dpl_FyEJ4zBDDC6Lb1fax6MZpaxLdxr7` built Git commit `99aef37` from the repository root. Next.js failed because it could not find a `pages` or `app` directory. The application lives in `frontend/src/app`.

Changed the remote project's Root Directory from the repository root to `frontend`. Retained the Next.js preset, Node.js 24.x, and default build settings. Vercel documents this setting under [Configure a build](https://vercel.com/docs/builds/configure-a-build).

Redeployed the existing Git source as preview `dpl_2qMQS245YJHJsXQx6Cgorob7yzfZ`, which reached Ready with a 28-second build. Preview page inspection was blocked by Vercel Authentication; protection was preserved. Promotion created production deployment `dpl_HYq9jCjsrwoDPptaFHDiratr7WQ2`, which reached Ready with a 27-second build.

Verified https://expensetracker-inky-mu.vercel.app returns HTTP 200 with Expense Tracker and Transactions content, without a Vercel login page. The team-scoped alias remains protected. Local `frontend` production build also passed.

Chrome verification confirmed the dashboard renders its summary, transaction rows and filters, and clicking Add transaction opens the required form. Documentation whitespace checks passed.

The redeployment uses the existing remote Git source, not uncommitted local changes. It serves the fixture frontend; this does not complete backend integration or the full-stack deployment milestone.

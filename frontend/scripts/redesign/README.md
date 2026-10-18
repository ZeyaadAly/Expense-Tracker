# Clear Ledger local acceptance

These are the actual browser/fixture drivers used for the redesign review. Run from the repository root with Node 26, PostgreSQL 17 binaries and an installed Chromium browser. They never load application environment files or contact hosted Auth. Provider responses alone are synthetic; financial requests use the real built backend services, verified ES256 identity, limited database role and isolated PostgreSQL.

Do not run mutation suites concurrently: `functional`, `extended`, `auth-qa` and `generated` share fixture owners and the fixture's global failure mode. The session-expiry check intentionally invalidates every concurrent financial session. Read-only captures may run together when failure injection is inactive.

## Disposable setup

Create a **new** `.tmp-v2-redesign/.tmp-v2-t62/pgdata` below this repository. Initialize with `initdb -D <absolute-data-path> -U postgres -A trust --encoding=UTF8 --locale=C`, then start with `pg_ctl -D <absolute-data-path> -l <local-log> -o "-h 127.0.0.1 -p 55451" start`. This password-free cluster must listen only on loopback. Do not reuse a normal development or production database. The existing isolation helper checks the exact loopback host/port/database/admin URL; the API checks the running data-directory suffix before setup and creates the current schema only on a fresh database. Application queries then use `expense_tracker_app`.

Build `backend` with its normal `npm run build`. In a separate shell:

```powershell
$env:T62_DISPOSABLE_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55451/postgres'
node frontend/scripts/redesign/api.mjs
```

This local-only harness owns ports 4000 and 4001. Its test endpoints and failure controls are never part of the deployed backend. Create the showcase owner once:

```powershell
node frontend/scripts/redesign/seed.mjs
```

The seed refuses an owner that already has accounts. Owner A is the untouched showcase; B is for mutation/stress checks; C is an empty-workspace identity created only inside the verified disposable cluster. Test money, keys and sessions stay under the ignored `.tmp-v2-redesign` directory.

## Frontend and browser tools

Set only the following public fictional configuration when starting/building the local frontend:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = 'https://t37-fixture.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_t37_fixture_only'
$env:NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:4000/api/v1'
$env:V2_APP_ENABLED = 'true'
# From frontend: npm run build, then npm start -- --hostname 127.0.0.1 --port 3000
```

Port/origin 3000 is required by the existing Auth redirect and API CORS policy. This is an optimized **local** build; do not deploy this fictional configuration.

Supply an existing Playwright/axe installation, or install those optional test tools into an ignored tools directory. No application dependency is added. This run used Playwright 1.64.1, axe-core 4.14.0 and Edge 155. Set `REDESIGN_PLAYWRIGHT_PATH` to the absolute `playwright-core/index.mjs` path, `REDESIGN_AXE_PATH` to `axe-core/axe.min.js` if unavailable under frontend/node_modules, and `REDESIGN_BROWSER_EXE` to Chromium's executable. Defaults reuse this Windows workspace's existing T62 tools and Edge. `qa-base` refuses an external application origin.

## Verification order

Run each mutation driver to completion before the next:

```powershell
node frontend/scripts/redesign/functional.mjs
node frontend/scripts/redesign/auth-qa.mjs
node frontend/scripts/redesign/extended-qa.mjs
node frontend/scripts/redesign/generated.mjs
node frontend/scripts/redesign/responsive.mjs
node frontend/scripts/redesign/states.mjs
node frontend/scripts/redesign/performance.mjs
node frontend/scripts/redesign/contrast.mjs
node frontend/scripts/redesign/bundle.mjs
node frontend/scripts/redesign/security.mjs
```

The fixed business date is 2026-10-18 in the API, seed and mutation drivers. Reproduction on another date requires adapting those fixture dates together with browser calendar assumptions; never change production time. The real interface still uses Cairo today normally.

`capture.mjs final` records all 13 routes at 1440/768/360; `contact.mjs final` creates portable relative-image galleries. `capture.mjs before` belongs on the starting revision, not on redesigned code. Original baseline and both critique contacts are retained in docs. Dialog screenshots use the viewport: native modal backdrops cover the viewport, and full-document captures can misrepresent the inert background.

Structured results stay under `.tmp-v2-redesign`; sanitized results for this acceptance are retained under `docs/v2/redesign/assets/verification`. The seven-width suite measures native radio touch targets using the associated clickable label. Axe runs WCAG2 A/AA and WCAG2.1 AA after fonts and short entry motion settle. Native dialog overlap ambiguities are retained as manual-review items, not silently counted as automated passes.

Stop only the frontend/API/PostgreSQL processes created for this fixture. No cluster deletion or production deployment is needed.

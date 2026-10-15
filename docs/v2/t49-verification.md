# T49 — Build Core Settings Page

**Status: Completed locally, 2026-10-15 (Africa/Cairo).** Work began on clean synchronized main at `dd412f48de38c899436d88959af2cf2878bae871`. Implementation was subsequently committed as `a6a083bcc031ed6283940ecea3ad6c5e9692a690`; the resumed verification found main synchronized and clean at that commit. The completion commit adds the fixes and evidence below. Hosted financial acceptance remains intentionally deferred.

## Frozen scope

Implementation-plan T49a/b/c, PRD P0 Settings, UX §17, T04, T13, T19 and T48 define the scope.

| Prototype section | T49 treatment |
| --- | --- |
| Profile | Real authenticated profile; displayName-only edit; real session email |
| Preferences | Read-only EGP / English (en) / Africa/Cairo |
| Accounts | Link to existing connected Accounts management; no duplicate CRUD or balance calculation |
| Categories | Real system/custom and active/archived lists; custom create/edit/archive/restore |
| Security placeholder | Replaced with existing password-reset flow link and shared sign-out |
| Export, notifications, user deletion, MFA/device/session management | Deferred; no fabricated controls |

## Profile and shared presentation

The route no longer imports `PrototypePage`. It uses the user-pinned T10/T13 client for GET `/profile` and PUT with exactly `{displayName}`. Unicode length/control validation follows T13; blank names become null. Email is read-only and comes from the active Auth session. Fixed preferences have no editable controls. Drafts survive rejected/uncertain writes, duplicate submissions are blocked, and a confirmed PUT response remains authoritative if the subsequent GET fails.

The existing profile bootstrap gate now provides a user-scoped profile context. Confirmed Settings saves update that context and the shell name without a reload. User/epoch changes unmount the context and Settings store. No new provider API, password store, provider/admin key or browser financial database access was added.

## Categories and dependent domains

The T48 client adds create, full update, archive and restore with whitelisted public fields, current session tokens, abort signals, strict IDs/statuses and archive metadata. List reads use actual `status=active` / `status=archived` filters. Names, income/expense/both kinds and nullable icon/color use the frozen public contract. Optional tokens are treated as text, never injected as markup or CSS.

System rows explicitly say “System · read-only” and show no edit/archive controls. Custom active and archived rows can be edited; lifecycle changes use confirmation dialogs. Custom `Food` can coexist with system `Food`. Same-user case-insensitive conflicts, including archived names, preserve the draft. `CATEGORY_KIND_LOCKED` explains that the existing kind must be retained to rename a referenced category; no reference metadata is invented.

Browser verification created all three kinds, a system-name collision, renamed a category, referenced it in a real transaction and recurring definition, observed kind-lock rejection, archived it, edited its optional metadata while archived and restored it. New-activity selectors in Transactions, Recurring and Budgets omit the archived category and include it again after restore. Historical transactions still resolve its name. The recurring definition pauses on archive and remains paused on restore. Financial snapshot comparisons cover account balances, transaction totals, Dashboard summary and Analytics summary; Settings mutations do not change those values.

## State, errors and isolation

Profile, active categories and archived categories load independently. Errors remain scoped, retain previously loaded values and label them stale. Confirmed saves remain confirmed when refresh fails; recovery repeats GET only. Uncertain writes block repeat submissions, preserve drafts, require fresh reads and deliberate acknowledgement. Category inspection requires both status lists and renders the confirmed custom rows inside the dialog. Closing a dialog does not bypass the uncertain guard.

Teardown aborts reads/writes, clears owned state and suppresses late responses even when transports ignore abort. A/B browser switching while an A category draft is open removes the dialog, A profile and A custom categories; B sees B plus system categories. Sign-out removes protected Settings content. Account navigation uses the real T19 page and its backend balance values.

## Responsive and accessibility

The approved single-column Settings sections remain intact at 360, 768 and 1440. System/custom and active/archived are text distinctions. Profile controls have labels/read-only semantics; validation errors are associated with controls and focus the invalid field. Success/errors are announced. Native dialogs retain pending protection, keyboard cancellation, focus restoration and scrolling.

The focused stress pass covers a 200+ character email, a 100-code-point emoji display name, long Arabic and accented category names, same-name system/custom rows and 40 additional custom categories. It found and fixed long unbroken dialog-heading overflow. Dialog viewport bounds/internal width, Escape/cancel focus restoration and reduced-motion behavior pass. See the JSON results and screenshots in [T49 assets](assets/t49/).

## Verification

- Frontend full suite: **182 passed**, zero failures/skips; includes ten T49 client/store tests.
- Frontend lint, typecheck and production build passed.
- Main browser suite: **100 checks / 19 axe audits**. Supplemental long-content/keyboard suite: **17 checks / 8 axe audits**. Total: **117 checks / 27 audits, zero violations**, on real local services with synthetic ES256/JWKS Auth and limited-role PostgreSQL. See [browser result](assets/t49/browser-result.json) and [stress result](assets/t49/stress-result.json).
- Focused backend: **19 test groups passed, zero skips** across T13 profiles (3), T12 category reads (2), T48 custom categories (2), T21 transactions (5), T29 recurring (3) and T42 budgets (4). See [backend result](assets/t49/backend-result.json).
- Each backend suite uses a fresh guarded loopback database. T12 uses its documented pre-T15 baseline so its historical delete-based cleanup remains valid; the newer suites use ownership/occurrence constraints as required.
- Local production smoke: `/` returns 200; `/v2/settings`, `/v2/accounts`, `/v2/transactions` and `/v2/recurring` return 404.
- V1 implementation is unchanged. Existing frontend V1 transport tests and backend category/profile/transaction regressions pass.
- Diff whitespace and secret/artifact review passed before commit.

## Reproduction and boundaries

Build backend, initialize a fresh UTF-8 PostgreSQL 17 cluster at `127.0.0.1:55451/postgres`, and set only `T49_DISPOSABLE_DATABASE_URL` to its password-free postgres administration connection. Run `node scripts/t49-browser-api.mjs` from backend. The harness rejects non-loopback/retained schemas, creates synthetic users/JWKS and binds API port 4000. It never loads application `.env`.

Start frontend development with API base `http://127.0.0.1:4000/api/v1`, Supabase URL `https://t37-fixture.supabase.co` and synthetic publishable placeholder `sb_publishable_t37_fixture_only`. Start an isolated Chromium profile with CDP on loopback port 9224. Run `node scripts/verify-v2-settings.mjs` from frontend, then run it again with `T49_STRESS_ONLY=1` against the resulting synthetic data. Results/screenshots go to ignored `.tmp-v2-t49`. The browser intercepts synthetic Auth and blocks non-loopback application requests. No credentials or tokens are written into committed evidence.

The development-only frontend gate is unchanged. The Vercel backend entry point still omits `categoryManagement`, so management remains disabled by default. `backend/vercel.json` still has an empty cron list. No remote database operation, manual deployment, hosted acceptance or cron activation occurred. Runtime Settings fixtures are excluded; isolated design/prototype specimens remain available in their existing source.

All local helpers are stopped after verification. Synthetic artifacts remain ignored. T50 — Build Notification Backend — P1 Optional remains unstarted and requires promotion; the next unstarted P0 task is T57 — Full Backend Regression. Neither task was started here.

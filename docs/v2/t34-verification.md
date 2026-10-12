# T34 — Build Recurring Page

Date: 2026-10-12. Status: **Completed locally. Production not applied.**

## Real data and approved UI

`/v2/recurring` now renders the connected RecurringPage instead of PrototypePage. Its protected route bypasses PrototypeProvider, and its shell labels it Development · connected recurring items. The approved flat schedule/timeline composition, typography, money/status badges, upcoming-item presentation and modal controls are reused. No fixture salaries, recurring rows, dates, forecast totals or simulated mutations render on this route. Fixture infrastructure remains available for T04/design-system and unrelated unintegrated pages.

The new domain client delegates authentication, token retrieval, error parsing, abort handling and uncertain-write classification to T10 through createSessionClient. It implements all eight T29 operations: list, get, create, update, pause, resume, archive and upcoming. Requests serialize only the eight editable definition fields. Responses validate exact decimal strings, canonical identities, public fields, lifecycle/null-date consistency, list counts and upcoming identity/date pairs. No userId, nextOccurrence or status can be supplied through the editor. Backend production code, recurrence calculator and occurrence persistence were not changed.

The unpaginated list supports exactly T29's status/type/accountId/categoryId/frequency filters. There is no recurring search, cursor or browser-only scheduling filter. Description, account, category, expected type/amount, frequency, next occurrence, optional end date and status come from server resources. Empty users see No recurring items yet. and Add recurring item; loading/error/retained stale states never fabricate rows.

## Upcoming and recurrence semantics

The independently loaded timeline calls GET `/api/v2/recurring/upcoming?days=30`. It renders the returned occurrenceDate values in server order and shows the backend from/to range. It is explicitly expected activity; list filters apply only to schedules. A failed timeline read retains its previous projection and does not remove a successful list, and vice versa. Each read has its own retry path.

The browser performs date-input validity checks only. It does not calculate recurrence dates or predict nextOccurrence. Amounts remain strings throughout forms, requests and returned resources; formatting reuses the existing exact-money component. Date-only strings remain unchanged. Cairo today is used only for the initial start-date draft. Past starts, shorter months and leap-day behavior are explained in text; server values supply all actual scheduling results. Active exhausted definitions show Schedule complete; paused/archived null dates show No future occurrence.

Real browser mutations confirmed a past-start daily definition selects Cairo today without historic transactions, a Jan 31 monthly definition returns 2026-10-31, a Feb 29 yearly definition returns 2027-02-28, and an ended monthly definition returns nextOccurrence=null. These are backend T30 results, not page calculations.

## Create, edit and lifecycle

Create uses real POST; edit first GETs the current resource, then uses PUT. Fields are type, active account, active compatible category, exact amount, description, frequency, start date and optional end date. Income accepts income/both categories, expense accepts expense/both. Archived historical references remain readable and appear as disabled historical choices when needed. Validation focuses the first invalid input and retains the draft. Server field errors map to form fields.

Pending writes lock duplicate submit and dismissal. Confirmed success closes the dialog after refreshing both views with filters preserved. A refresh failure reports Saved, but recurring items could not refresh. and offers GET-only recovery; it does not replay the mutation. Uncertain writes preserve context, lock resubmission in the dialog and offer Refresh and inspect recurring items. Create inspection reads the unfiltered list; existing-item inspection GETs that resource. Inspection does not infer an exact create identity or retry a write. The user can compare description, references, amount, frequency, dates and status before closing the context.

Active definitions offer Edit/Pause/Archive; paused definitions offer Edit/Resume/Archive; archived definitions are read-only. Confirmations explain that past transactions remain, paused history is skipped without backfill, and archive is permanent. Edit explains that past generated transactions are unchanged. No hard delete, restore, occurrence retry, cron status or Generate Now is exposed.

Real account archive automatically pauses the related definitions; restoring the account leaves them paused until an explicit successful Resume. Category archive retains visible definitions and produces safe resume errors until its active state is restored. Fresh option reads occur when opening an action; backend validation remains authoritative for subsequent races.

## Processor boundary and financial effects

Creating definitions produced zero financial transactions. The test harness then invoked the unchanged T31 internally from Node, outside the browser. Exactly one due daily occurrence posted; refreshing recurring showed the advanced server cursor, and the existing Transactions page showed that generated transaction. No local balance/transaction simulation occurred. The browser request audit contained no internal/cron/processing requests.

The existing T31/T32 regressions separately verify exactly-once posting, terminal history and T18 accounting. No frontend operation creates/deletes generated financial transactions.

## Session and stale-response isolation

The mounted domain is keyed by authenticated user ID; its transport checks the expected current user without caching tokens. User changes unmount the store, abort list/upcoming/options/resource/inspection/write requests, discard action drafts and initialize a new store. Request-controller identity and store lifetime suppress obsolete responses even if the transport ignores cancellation. A 401 clears all financial/options/action data and invalidates the session.

The real-browser A-to-B switch occurred with an edited A draft open. The dialog, draft, definitions, timeline and A account/category choices disappeared; B saw its own empty state. Direct access using B's signed token to A's recurring resource returned safe 404 NOT_FOUND. Unit tests additionally resolve obsolete reads/resources/writes after teardown and verify no old data republishes. Existing V1 clients remain unauthenticated and no V1 source code changed.

## Responsive, accessibility and browser evidence

Final local Chrome/CDP suite: **77 checks, 45 axe audits, zero audited violations**, no horizontal overflow at **360/768/1440**. Representative audited states include empty, create, populated, edit, pending, paused, archive confirmation, retained stale timeline, account/category resume errors, uncertain inspection, completed schedules, stress content, pause confirmation, B-empty and reduced motion.

Keyboard checks passed forward/reverse modal trapping, pending Escape protection and focus return to Add recurring item. Local validation focuses amount; dialogs, labels, error/status announcements, lifecycle controls and ordered timeline semantics passed the audited WCAG 2 A/AA and 2.1 AA rules. A pending-dialog scroll audit found no keyboard-focusable content while all form controls were disabled; adding a focusable progress-status message resolved it. Reduced-motion media preference is respected through the existing V2 styles.

Stress fixtures use a 200-character description, long account/category names, 999999999.99, archived references, null nextOccurrence, month-end and leap-day schedules. Screenshots were visually inspected. Machine-readable evidence and selected screenshots are under [assets/t34](assets/t34/browser-verification.json).

The test harness uses synthetic A/B Auth sessions, real local ES256/JWKS verification and actual production services over a fresh password-free PostgreSQL 17 cluster at `127.0.0.1:55451`. Financial/application operations run as limited expense_tracker_app; admin only prepares/observes fixtures and applies synthetic category-state probes because the later category mutation UI is out of scope. All operational test endpoints bind to loopback and are absent from application entry points. No hosted Auth, financial data or remote service was contacted.

## Quality and regressions

- Frontend lint, typecheck, production build: passed.
- Full frontend suite: **130 passed, zero failed/skipped**, including **14 focused T34 client/store/fixture-boundary tests**.
- Browser suite: **77 checks, 45 axe audits, zero violations**, as above. Real commit plus truncated HTTP response creates one definition; GET-only inspection finds it without another POST. Confirmed-save/read-failure, duplicate pending clicks, lifecycle persistence, parent archive interactions and foreign access passed.
- Backend lint, typecheck, build: passed.
- Fresh T29: **357 checks**, ten forced races and eleven rollback faults; all three tests pass.
- T30: **14 tests**, all pass.
- Fresh T31: **403 checks**, twelve forced races and twelve rollback/lost-ack probes; all three tests pass. The synthetic 1000-attempt workload completed in 28.34 seconds while frontend quality/build work ran concurrently; this is local evidence, not a hosted performance guarantee.
- Fresh T32: **103 checks**, both tests pass, including repeated/concurrent posting and lost COMMIT acknowledgement.
- Fresh T18/shared T16–T26 regression: passes T17 lifecycle and isolation, exact balance/reconciliation, transactions, search, pagination and transfers using the same existing suite.
- Production smoke: V1 root HTTP 200; `/v2/recurring` HTTP 404, preserving the development-only boundary.
- Source/docs/backend-build credential scan and git diff --check: passed. Frontend static chunks contain no CRON_SECRET, CURSOR_SIGNING_SECRET or DATABASE_URL. The Supabase SDK includes its literal sb_secret_ key-prefix detector; no actual secret key is bundled.

## Reproduction

Build backend first. Initialize a fresh isolated PostgreSQL 17 cluster on `127.0.0.1:55451`, database postgres, admin role postgres, password-free and without any application/Auth schema or application/browser roles. Never use retained development or remote data. Set `T34_DISPOSABLE_DATABASE_URL=postgresql://postgres@127.0.0.1:55451/postgres`, then run `node scripts/t34-browser-api.mjs` from backend. The guarded fixture setup applies only existing local migrations and starts the real API on loopback port 4000.

Start frontend dev with only synthetic public configuration: NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api/v1, NEXT_PUBLIC_SUPABASE_URL=https://t34-fixture.supabase.co and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_t34_fixture_only. Launch an isolated local Chrome profile with CDP port 9224, then run `node scripts/verify-v2-recurring.mjs` from frontend. The runner installs only synthetic local sessions and blocks external fetches. No real key/session is needed. The explicit calendar-result assertions record the 2026-10-12 test context; adapt those expected assertions for a different test reference date without altering application recurrence logic.

Run frontend `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`. Focused backend suites use T29/T31/T32/T18_DISPOSABLE_DATABASE_URL on separately fresh fixtures; T30 requires no database. Test resets assert the exact ignored `.tmp-v2-t34/pgdata` data directory before recreating the disposable database/roles. No destructive helper targets retained data.

## Files and boundaries

Added recurring domain client/store/page, focused frontend tests, loopback backend browser harness, browser runner and evidence. Updated the recurring route, connected shell flag, protected fixture boundary, UpcomingItem's minimal presentation props, scoped CSS and the existing Transactions boundary assertion. Updated UX and the implementation checkpoint. `.gitignore` excludes local T34 processes/database/scratch artifacts. Earlier uncommitted T33 changes were preserved.

No backend production service, database schema, environment file, dependency, remote deployment or hosted cron setting changed. V2 remains development-only. No local T34 blocker remains.

**Next numbered task: T35 — Add Recurring Suggestions (P1 Optional).** It remains deferred unless explicitly promoted. The next core task is T36 — Build Dashboard Aggregate API, with its documented dependencies. Neither was started.

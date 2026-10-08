# T25 — Connected Transactions verification

**Status: Completed locally on 2026-10-08 (Africa/Cairo).** T01–T25 are complete; T26 is next and unstarted. No remote access, deployment, production data, schema/seed/backfill change, transfer API or recurring backend implementation. Earlier uncommitted work is preserved.

## API integration and fixture boundary

`/v2/transactions` now renders `TransactionsPage`. Its transaction domain client uses T10's authenticated transport for GET list/detail, POST, PUT and DELETE. A small session-bound transport factory delegates current session access to T06 and refuses a different mounted owner; it neither caches tokens nor performs auth redirects. T08/T13 remain the auth/profile gate. Resource parsing validates exact decimal strings, date-only values, public fields, recurring linkage, resource IDs and bounded page metadata. Unknown resource/owner fields fail closed; mutation bodies whitelist only the six editable fields.

Real T17 account resources and T12 system/current-user category resources load independently of transaction rows. Active/archived account/category reads run in parallel, without summary waterfalls. Active compatible options are used for create/edit; archived choices remain available for historical filtering. No foreign choices are sourced from fixtures. The page displays no balances/totals, so mutations need no account-balance refetch; later Accounts screens fetch authoritative balances on mount.

The protected boundary bypasses `PrototypeProvider` for this route. The connected page imports neither transaction fixtures nor prototype state. The shared shell supports the live route without a fixture provider. Fixture components/pages remain available for other previews/design-system review. The existing development-only layout still returns not-found in production. API contracts/backend production code are unchanged by T25.

## Search, filters and pagination

Search follows frozen P0 explicit submission; typing is draft-only, with no debounce or client filtering. Blank submissions omit q. Type All/Income/Expense, real account/category UUIDs, inclusive date-only bounds and All/Manual/Generated recurring status pass directly to the backend, where AND composition remains authoritative. Chips remove each submitted filter; Clear filters resets the draft, submitted scope and cursor history. No URL synchronization or new page-size selector was added; the UI keeps limit=25, while the typed model/store support limit changes.

The store holds an opaque current cursor and a local stack of previous cursors, including null for page one. Next consumes only nextCursor; Previous pops the local stack. Every submitted q/filter/limit change resets both. No cursor decoding, cursor contents, total pages, offset or previousCursor is exposed. The page number is only the known local history depth.

Invalid/expired continuation validation resets to the first page with filters preserved and explicit feedback; the retry is bounded to one recovery. A first-page failure becomes a normal retryable read error. Create resets to page one. Edit/delete refresh the current cursor when valid, preserving filters; empty continuation pages walk backward through the finite history until a populated page or first page. This implements the explicit T25 task refinement of the earlier blanket mutation-reset UX statement. Pagination restores focus to the selected enabled control, its available counterpart, or the local pagination landmark.

## CRUD, exact money/dates and dependencies

Create/edit use the approved dialog primitives and server-backed records/options. Amount stays a string, including 0.01/0.10/0.30/999999999.99. Input validation is UX only; no financial calculation, Number/parseFloat/toFixed money conversion or fabricated server ID. Cairo today comes from Intl date parts. Date controls/read/write payloads retain exact YYYY-MM-DD; calendar validation never replaces the user's date with a timezone-shifted timestamp.

Changing type retains a selected category only if active and compatible; otherwise it clears the choice. Historical archived account/category values remain visible as disabled current options, with field feedback requiring active replacements or restore. Backend T21 still validates unchanged references. Generated posting edits expose no linkage fields, and deletion explains that the recurring schedule is retained.

Confirmed create/update/delete closes the dialog, restores focus and announces success. The list refresh is a separate read: refresh failure retains success and stale rows, with GET-only Retry. For filtered create/edit, a read-only traversal of the same server-filtered scope determines exact membership; the browser does not reproduce PostgreSQL search rules. A hidden record gets explicit feedback. Membership checking occurs only when filters are active and never computes totals.

## Recovery and session isolation

AbortControllers plus generation/lifetime identities suppress obsolete successes and errors, including transports that ignore abort. Initial loading uses a skeleton; subsequent reads retain known rows, identify loading/stale state and disable row actions until the current scope is confirmed. Initial failure never fabricates rows/zero totals or a first-use empty state. No-data and no-match states have distinct copy/actions.

Mutation pending guards prevent repeats and dismissal. Validation preserves the draft, maps field errors and focuses the first invalid control. Missing records preserve context with Refresh/Close and disable submission. Uncertain POST/PUT/DELETE retains context, disables resubmission and offers read-only inspection; there is no automatic write retry. Intentional Close is still available outside pending state.

Owner-keyed mounting and the existing profile/session epoch unmount A state before B rendering. Cleanup cancels reads/options/writes and invalidates their identities; rows, options, history and dialogs clear. Current-session pinning also prevents an old owner's new request from using B's token. 401 clears protected content and delegates to T08, without a Transactions-specific login redirect.

## Approved design and accessibility

Design plan: retain canvas **#f5f6f2**, ink **#161914**, secondary **#666b62**, action **#2457e6**, income **#116b49**, expense **#b82f38**; existing Arial/Helvetica title/body/helper roles and spacing. Keep the title/actions aligned with the search/filter panel, ledger and pagination. Desktop uses approved rows; mobile uses approved cards and a filter drawer. Add no new financial summary, decorative chart or transfer panel.

```text
Desktop: sidebar | title / actions
                  search + submitted filters / chips
                  approved ledger rows
                  Previous / known page / Next
Mobile: header → title/actions → search/Filters → chips
        approved cards → pagination; forms/filters in existing dialog/drawer
```

Critique/revision: reuse the approved hierarchy rather than introducing a new visual direction; reserve the primary action for Add/Save, keep recovery secondary, wrap chips and long descriptions, and preserve money scanability. Screenshot review caught a mobile Filters button surviving on desktop due to base-button CSS order; scoped specificity now hides it on desktop. Final screenshots use the corrected styling. No theme or typography redesign was performed.

Browser verification covers 360/768/1440 populated, empty, no-match, initial/retained loading/error, create/edit/delete, filters and pagination. Separate stress searches actually expose the maximum amount and a 200-character unbroken description at every width. No page/dialog horizontal overflow. Native dialog trapping, Shift+Tab/Tab boundaries, Escape/Cancel return, first invalid field, pending cancellation, visible labels, table/card semantics, announcements, pagination focus and reduced motion are verified. Axe WCAG 2 A/AA and 2.1 AA reports zero violations in the audited states. This is automated plus focused keyboard evidence, not a certification of all assistive technologies.

Evidence: [primary browser results](assets/t25/browser-results.json), [focused browser results](assets/t25/focused-results.json), [desktop ledger](assets/t25/ledger-1440.png), [mobile stress](assets/t25/stress-360.png), and other state/width PNGs under assets/t25.

## Verification results

- Frontend lint, typecheck, production build and **101 tests passed**, zero failures/skips; **15** new T25 client/state/boundary tests. Tests cover query serialization, CRUD/error/auth/uncertainty, exact money/Cairo dates, page scopes/history, stale reads, one-shot cursor recovery, options, teardown, filtered mutation feedback and deletion of a sole continuation row.
- Real local primary browser suite: **65 grouped checks passed**. Focused suite: **8 grouped checks passed**, including mobile navigation/focus, real drawer filters, search scope reset, overlapping stale reads and V1 compatibility. Counts describe check groups, not raw assertions or HTTP requests.
- Primary browser A flow starts with zero transactions, creates income/expense, searches and composes all filters, edits and moves accounts, deletes, reloads, pages without duplicates, exercises actual cursor expiry, retains generated occurrence identity, and verifies historical corrections. B sees only B after transition/reload; direct access to A's transaction is a generic 404. Controlled server wrappers exercise confirmed-save/read failure, retained field validation, pending operations and committed-but-uncertain mutations; actual browser network aborts exercise read failure.
- Backend lint, typecheck, build and ESLint of all three new test scripts pass. Full backend suite selected with only T24_DISPOSABLE_DATABASE_URL: **73 tests; 58 passed, zero failed, 15 environment-gated skips**. The fresh integration passes **599 T16**, **263 account**, **285 balance**, **244 T21 CRUD**, **263 T22 search**, **3,263 T23 filter** and **6,065 T24 pagination** grouped checks, including locking races/rollback faults and 10,023-row traversal over 101 pages. Standalone gated groups are not claimed as independently rerun.
- V1 implementation is untouched. The full frontend suite includes V1 transaction/client/stale-read tests and V2-header isolation. Real backend V1 compatibility reads/filter/summary and ownerless-write rejection run in the shared regression. The focused browser verifies the public V1 page and list, with no V2 Authorization header on V1 browser requests. No production V1 retirement occurs here.

## Local lifecycle and reproduction

Only an ignored `.tmp-v2-t25/pgdata-copy` copy of the stopped synthetic T24 cluster is used on **127.0.0.1:55451**. Its reset helper asserts exact data_directory before replacing only that copy's postgres database/test roles. Fresh initdb's existing Windows application-control limitation remains; original cluster directories are unchanged. Regression and browser fixtures each consume a separately reset empty database. Existing two V1/four T11 migrations, T12 seed and T15 constraints are applied only by the established disposable harness. Browser data/users are synthetic; no normal .env, hosted URL or production key is loaded.

1. Start that isolated password-free PostgreSQL copy; verify its data_directory and reset it. Build backend. Set only T24_DISPOSABLE_DATABASE_URL to `postgresql://postgres@127.0.0.1:55451/postgres`; run `npm --prefix backend test`.
2. Clear the regression URL and reset only the same verified copy again. Set T25_DISPOSABLE_DATABASE_URL to that loopback URL; run `node backend/scripts/t25-browser-api.mjs`.
3. Start frontend dev at `http://localhost:3000` with NEXT_PUBLIC_SUPABASE_URL=`https://t19-auth.invalid`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`sb_publishable_localfixture`, NEXT_PUBLIC_API_BASE_URL=`http://127.0.0.1:4000/api/v1`.
4. The browser scripts use the existing ignored T20 Playwright/axe tooling. Set PLAYWRIGHT_BROWSERS_PATH to the ignored test browser cache as appropriate. Run `node backend/scripts/verify-t25-browser.mjs`, then `node backend/scripts/verify-t25-focused.mjs` against the same fixture. The focused suite relies on the primary suite's synthetic final state.
5. Run frontend lint/typecheck/test/build and backend quality checks. Stop the local API, frontend and disposable cluster after verification. The task's servers/cluster were stopped before delivery.

Supabase session semantics were checked against [official getSession documentation](https://supabase.com/docs/reference/javascript/auth-getsession): browser session access supplies transport credentials, while T09 verifies authorization. The changelog markdown fetch was unavailable; no SDK upgrade/new Auth feature was introduced. Applied user-requested frontend-design/ui-ux-pro-max instructions alongside React/verification/Supabase skills. Python search execution was unavailable (Python aliases inaccessible and py absent); use the skill's bundled accessibility/interaction checklist without generating or persisting an unverified design system.

## T25 file inventory

Created:

- frontend/src/lib/api/session-client.ts
- frontend/src/lib/api/v2-transactions.ts
- frontend/src/lib/api/categories.ts
- frontend/src/lib/transactions-store.ts
- frontend/src/features/v2/transactions-page.tsx
- frontend/tests/v2-transactions.test.mjs
- backend/scripts/t25-browser-api.mjs
- backend/scripts/verify-t25-browser.mjs
- backend/scripts/verify-t25-focused.mjs
- docs/v2/t25-verification.md and docs/v2/assets/t25 results/screenshots

Updated:

- frontend/src/app/v2/transactions/page.tsx — real page route
- frontend/src/features/v2/protected-boundary.tsx, prototype-context.tsx, shell.tsx — bypass Transactions fixture initialization and support the connected shell
- frontend/src/components/v2/finance.tsx — optional generated identity on existing rows/cards
- frontend/src/app/v2/v2.css — scoped mobile filter visibility/chip wrapping
- docs/v2/03-ux-specification.md — integration state and pagination clarification
- docs/v2/07-implementation-plan.md — completion/checkpoint
- .gitignore — disposable T25 tooling/data

No genuine T25 blocker remains. Ready for **T26 — Build Transfer Backend**; T26 and T29 are not started. Nothing was applied remotely.

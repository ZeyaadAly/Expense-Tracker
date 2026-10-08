# T28 — Real transfer UI verification

**Status: Completed locally on 2026-10-08 (Africa/Cairo).** T01–T28 are complete locally. T29 — Build Recurring Backend is ready and unstarted. No backend implementation, schema, migration, grant, dependency, hosted configuration or deployment change. Earlier uncommitted work is preserved.

## Entry points and approved design

The existing Accounts transfer panel now provides New transfer, a paginated history and edit/delete actions. The same TransfersPanel runs on account detail with the backend accountId filter, labels rows To/From explicitly and prefills an active current account as source. Destination starts empty. An archived detail retains transfer history and deletion while new transfers from that detail stay disabled. No dedicated transfer route, new date-filter controls or unrelated management page was added.

The frozen UX already requires Accounts transfer list/edit/delete and cursor Next/Previous. T28 retains the approved canvas #f5f6f2, white surfaces, text #161914/#666b62, primary #2457e6 and transfer #5564c9 tokens, Arial/Helvetica typography, shared spacing, forms and native DialogShell. The visual plan was to keep the account grid unchanged and place neutral movement rows below it, with From/To controls followed by an explicit review. TransferForm gains a controlled live mode; its specimen remains isolated. TransferSummary is reused for review, deletion and inspection, adding date and optional note. No predicted balance is shown.

Applied the previously requested frontend-design and UI/UX Pro Max instructions, the React quality checklist and full-story verification guidance. The UI/UX search script's supporting files remained available but Windows Python aliases could not execute; its static accessibility/form/responsive rules were used as a declared fallback. No design-system replacement or package installation was needed.

## API integration and data flow

Story: Accounts/account detail → shared real transfer form/history → T10 authenticated client → T26 Express routes → PostgreSQL under expense_tracker_app → T18-authoritative account resources and net position → refreshed UI.

| Boundary | Evidence |
| --- | --- |
| UI → client | Actual browser POST/full PUT/DELETE; one dispatch for rapid duplicate create/delete clicks |
| Client → API | Typed domain client uses createSessionClient; GET/list/create/update/delete share T10 transport and existing current-session token handling |
| API → database | Actual T09 local ES256 JWT/JWKS middleware, T26 services, unchanged transactions/locks and limited runtime role |
| Database → response | All four asset/card directions, exact balances, edited references, archived deletion and reload persistence verified |
| Response → UI | Account cards, net position, detail summary and history use refreshed backend values; no browser deltas |

frontend/src/lib/api/transfers.ts validates exact public transfer/page shapes, rejects ownership fields, mismatched IDs, numeric amounts and malformed continuation metadata, and whitelists editable fields. List supports accountId/from/to/limit/cursor without inventing filter UI. Empty 204 is required for delete. Aborts, auth, safe errors and no-store retain T10 behavior. T26 remains the authoritative ownership/active-reference validator.

The history store keeps opaque cursor history for Previous, uses backend nextCursor for Next, resets to page one after mutations and recovers an invalid/expired cursor once. Empty continuations return to the prior page. Failed reads retain prior rows with a stale indicator; initial failures show unavailable state rather than fabricated history.

## Create, edit, delete and exact inputs

Create defaults to Cairo today as a date-only string, empty amount/destination/note, and an empty source unless opened from active account detail. The user selects real owned active accounts. Choosing a new source clears a now-identical destination; destination options exclude source. Changing destination does not change source. Client validation prevents missing/same endpoints and invalid amount/calendar/note syntax; backend validation remains authoritative.

Amount stays a string through draft, review and payload. No Number/parseFloat/toFixed, transfer effects, predicted balances or net-position arithmetic exists in the production transfer UI. Format-only validation accepts 0.01–999999999.99 with up to two decimals; optional notes allow up to 200 Unicode code points. Date validation uses real dates from 1900-01-01 through Cairo today. The backend normalizes accepted amount/note values.

Account choices use authoritative currentBalance. Card debt reads “EGP owed”; negative debt reads magnitude plus “EGP credit”; asset negative balances retain a minus sign. History uses Transfer badges and unsigned movement amounts, never income/expense semantics. Archived endpoint names/status remain visible. Existing archived references can be displayed in an edit draft as disabled choices; review requires both resulting refs active, with explicit selection or restoration. A concurrent archive rejection retains selected IDs and never silently switches accounts.

Create and edit require a review displaying From, To, amount, date and note before the write. Delete requires explicit confirmation displaying the same context. A synchronous submission guard plus store pending guard prevents duplicate dispatch. Controls and dismissal disable while pending. Drafts remain on failure; field errors appear beside controls and the first invalid field receives focus. No optimistic mutation or automatic mutation retry exists.

## Uncertain outcomes and recovery

T27 proved that DATABASE_UNAVAILABLE 503 can follow successful COMMIT. The transfer domain therefore converts that response into an uncertain write without changing the shared T10 contract used by existing domains. Network/aborted-after-send, invalid acknowledgement and existing uncertain server errors retain uncertainty. Validation/auth/archive/missing failures remain definite.

Uncertain create/edit/delete retain the draft and transfer context and block another submission. “Refresh accounts / Check activity” performs GETs only: create checks up to 100 latest transfers matching the draft date/source; edit/delete inspect the exact resource ID, treating missing as absent. Accounts/balances, choices and visible history also refresh. Inspection is contextual evidence, not idempotency or an inferred successful create: similar deliberate transfers may be separate entries. The UI explicitly warns another save can create another transfer. Failed reads do not unlock resubmission. Only after successful inspection and explicit “I checked activity; allow a deliberate retry” can the user choose another write. Closing and starting another deliberate flow remains user-controlled.

The local harness injects ECONNRESET **after the real SQL COMMIT** on the checked-out transfer client. Actual production error mapping returns 503. Browser tests prove POST leaves exactly one committed record, PUT leaves one record with its updated amount, and DELETE leaves no record. Each request count rises once; inspection never repeats any mutation. Synthetic pre-dispatch/validation/read-failure modes are separately identified; these do not substitute for the real committed-error check.

## Authoritative refresh and session isolation

After a confirmed write, refresh only the Accounts list/net-position or current detail resource/summary, transfer account choices and visible transfer history. The UI does not adjust either account, reverse deleted effects, calculate net position or refetch the whole application. Confirmed writes close even if later reads fail; the notice says the transfer was saved/updated/deleted but account balances or history could not refresh. Only reads are retried.

The independent browser fixture has bank 200.00, cash 100.00, card debt 100.00 and card credit -150.00. A real fixed income 1.10 and expense 0.20 produce net 350.90. Asset→asset, asset→card, card→asset and card→card then retain 350.90 while account values change appropriately. Full PUT and deletion recalculate both ends through T18; income/expense summary values stay unchanged. Test-only expected values are constants; production calculations remain PostgreSQL NUMERIC.

Connected Accounts/detail are keyed by owner (and detail ID). User change unmounts dialogs/drafts/history/options immediately. Store cleanup aborts reads/options/writes/inspection and increments lifetime/generations, suppressing stale responses even when abort is ignored. A focused unit test caught and fixed a late inspection that could otherwise launch follow-up reads after teardown. createSessionClient checks the mounted owner before supplying a token. Auth failures clear financial state and delegate invalidation to T08.

Actual Supabase session events with synthetic A/B identities verified A→B while B reads were delayed: A's draft/dialog and financial rows disappeared, B saw no A accounts/transfers, and B's direct GET for an A transfer returned generic 404.

## Browser, accessibility and responsive results

Main browser run: **53 checks**, including **23 axe-core WCAG 2 A/AA and 2.1 AA audits**. Supplemental focused run: **10 checks**, including **nine further audits**. Combined **63 checks, 32 audits, zero reported violations**, zero horizontal page/dialog overflow and zero browser runtime errors.

At **360, 768 and 1440px**, audited initial/populated history, long account names, maximum amount 999999999.99, 200 Unicode characters, form/review, edit draft/review and delete confirmation. Additional audits cover validation, stale balances/history, archived references, account detail and uncertain POST/PUT/DELETE. Reduced-motion keyboard checks verify native modal trap, Escape and focus return. Opening no longer disables its trigger during choice refresh. Successful deletion returns focus to a surviving Refresh transfers button when its row trigger has been removed.

Screenshots were visually inspected at mobile and desktop widths. Evidence: [main results](assets/t28/browser-results.json), [focused results](assets/t28/focused-results.json), [360px form](assets/t28/form-360.png), [360px review](assets/t28/review-360.png), [1440px Accounts](assets/t28/accounts-1440.png), [uncertain create](assets/t28/uncertain-create.png). Audits cover tested surfaces; they are not a claim of a complete application-wide manual accessibility certification.

## Fixture, V1 and production boundaries

The real Accounts/detail runtime imports no transfer fixtures or simulated success. Design-system TransferForm specimens and other deferred T04 pages remain isolated. The connected panel always uses real accounts and transfer endpoints. No recurring implementation was started.

Production backend source and migrations match pre-T28 hashes. Existing frontend files changed only in V2 forms, Accounts/detail and isolated V2 CSS; V1 sources and shared T10 transport are unchanged. Full frontend V1 regressions pass. Actual browser V1 requests carry no V2 Authorization header, and the legacy summary route remains available in the isolated compatibility fixture. Existing later maintenance/retirement gates remain unchanged.

Local production build preview returns `/` **200**, and Accounts, dynamic account detail, login and design-system V2 routes **404**, preserving the existing development-only layout gate. No production transfers or hosted calls were made. All local servers and disposable PostgreSQL were stopped after verification.

## Tests and quality

| Check | Result |
| --- | --- |
| Full frontend suite | 116 passed; zero failures/skips, including 15 focused T28 tests |
| Frontend lint / typecheck / production build | Passed |
| Main / focused browser | 53 / 10 checks; 32 total axe audits, zero violations |
| Full backend suite on a fresh guarded database | 81 tests; 64 passed; zero failed; 17 environment-gated standalone skips |
| T26 transfer regression | 917 grouped checks; 11 races; 11 rollback faults |
| T27 focused regression | 4,833 checks; 29 forced races; six rollback faults; 180 stress mutations; zero observed deadlocks |
| Shared T16 / T17 / T18 / T21 | 599 / 263 / 285 / 244 checks |
| Shared T22 / T23 / T24 | 263 / 3,263 / 6,065 checks |
| Explicit browser/harness script ESLint | Passed |
| Production backend/migration hash comparison | Zero changes |

The single fresh T27 integration entry runs the unchanged shared T16–T26 regression helpers plus focused concurrency coverage; standalone fresh-init entries are intentionally unset, explaining their gated skips. Backend implementation was not modified. Frontend tests cover typed CRUD/204/query scope, validation/auth/network/503 uncertainty, strict resources, pagination, confirmed/stale recovery, pending single dispatch, uncertain GET-only inspection, auth clearing and ignored-abort teardown/read suppression. Browser checks exercise rendered UI states and actual database persistence separately.

## Files and reproduction

Created frontend/src/lib/api/transfers.ts, frontend/src/lib/transfers-store.ts, frontend/src/features/v2/transfers-panel.tsx, frontend/tests/v2-transfers.test.mjs, backend/scripts/t28-browser-api.mjs, backend/scripts/verify-t28-browser.mjs, backend/scripts/verify-t28-focused.mjs, this report and local screenshot/results assets.

Updated frontend/src/components/v2/forms.tsx, frontend/src/features/v2/accounts-page.tsx, frontend/src/features/v2/account-detail-page.tsx, frontend/src/app/v2/v2.css, UX/implementation-plan documentation and .gitignore. No API contract correction was necessary.

Quality commands:

```powershell
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
```

Backend regression: build backend, set only T27_DISPOSABLE_DATABASE_URL to the established password-free `postgresql://postgres@127.0.0.1:55451/postgres` on a fresh guarded empty fixture, then run the backend suite. Use another fresh/reset exact disposable copy for the browser harness; existing guards reject remote, credential-bearing and initialized fixtures and load no application .env/DATABASE_URL fallback.

Set T28_DISPOSABLE_DATABASE_URL to that fresh loopback fixture and start backend/scripts/t28-browser-api.mjs. Start frontend dev on localhost:3000 with NEXT_PUBLIC_SUPABASE_URL=https://t19-auth.invalid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_localfixture and NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api/v1. Run backend/scripts/verify-t28-browser.mjs, then verify-t28-focused.mjs against its retained synthetic data. These drivers use the existing ignored .tmp-v2-t20 Playwright/axe tools and installed Windows Chrome; T28_CHROME_EXE overrides the executable. Tokens remain in local test/browser memory and are not written to evidence. Stop the test servers and copied database afterward.

No genuine T28 blocker remains. Ready for **T29 — Build Recurring Backend**, which is not implemented.

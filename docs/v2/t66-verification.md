# T66 — Production Migration and V1 Retirement

## Authorized resumption — backup waiver

**Current status: in progress.** Starting clean synchronized main for this resumption: `2a269d64e8ec9ad553fc263324ec772150706041`. The user authorized automatic completion of remaining P0 production tasks and explicitly answered **“Continue without backup; preserve the record”** after being told that production contains one EGP 9500.00 transaction and that no independently tested recovery artifact would exist. This supersedes the earlier backup/isolated-restore requirement and administrative-backup-connection blocker. No backup, restore test or certified recovery artifact is claimed. Every other integrity/security/acceptance gate still applies.

Fresh authorized read-only inspection verified project `kpbyvbgcfwavcsgtcdws`, database postgres, PostgreSQL17.11; all eight tracked migration versions; one confirmed designated Auth identity matching the retained transaction owner/profile; exactly one valid active cash Main Account with opening0.00 EGP and locked opening semantics; nine exact fixed category IDs/names/kinds; no missing/invalid references; zero transfers/definitions/occurrences/budgets/goals. Private identity/row contents stay in ignored local storage.

Fresh baseline: **1 transaction, income9500.00, expenses0.00, balance/Main Account9500.00**. A complete original-field/microsecond snapshot is retained privately; SHA-256 over that snapshot is `a68bce787e06a5bfbea93a60f2123b37cf173bc1c01c781871d68d3325b0fdaf`. The older T37 MD5 uses an unavailable original serialization contract and is not asserted equal to this new fingerprint. Subsequent preservation checks compare every fresh baseline field exactly; no original transaction will be edited or deleted.

Production catalog matches a separately initialized local PostgreSQL17 database applying the unchanged eight-file chain:92 columns/92 validated constraints/44 indexes/31 user triggers/11 functions/98 privilege rows plus schema ACLs. A CHECK formatting difference against the previously restored T65 copy disappears against the independently applied fresh chain; no production constraint was changed. All recorded migration SQL tokens match their tracked file, allowing only statement splitting, comments, whitespace and line endings; T15/T32 also match complete text. **Skip all existing migrations/backfill/provisioning/seed as already applied and freshly verified.** No blind replay or history repair.

Runtime is NOINHERIT, nonsuperuser, without elevated attributes or memberships; browser roles lack private schema usage/create. The existing limited connection verified the expected pooler/project/database/role with authorized TLS1.3 (`TLS_AES_256_GCM_SHA384`), hosted health200, exact frontend CORS and no-store. Current backend/frontend are READY from starting SHA, deployment IDs `dpl_8CiaDoE6VofCrTT1Xn9qdaZbRUiQ` / `dpl_AbEVKRLGwJmuJyBUmiU5oSjYWNhH`. All40 inventoried backend deployment URLs returned302 to Vercel protection for unauthenticated V1 summary; no bypass was used. Source/deployed financial gate acceptance remains separate.

Recovery policy is **conservatively Window B / forward-only**: previous V2 runtime write authority existed and there is no durable proof that no V2 write ever occurred, even though current financial tables contain only the retained baseline. Do not infer Window A from empty current auxiliary tables or attempt an old restore. The user waived an independently tested recovery artifact; retain exact snapshots and preserve all later controlled activity until deliberate cleanup. No blind restore or V1 reopening.

The reviewed maintenance artifact keeps V1 permanently410 before legacy services, V2 non-health access503 and processor503. Both health routes remain available subject to DB reachability; public Auth UI remains separate. Production/local entries agree; development V2 is unchanged. Backend lint/typecheck/build and111 ordinary tests pass (28 guarded database wrappers are not claimed as new integration runs); focused actual-entry tests prove the new retirement+maintenance dispatch. Cron configuration remains empty. **Next: deploy this committed maintenance artifact, verify hosted denial, suspend runtime financial DML, reconcile the unchanged baseline, then record the T66 handoff.** T66 is not yet marked complete and T67 has not started.

The initial blocked-at-input report below is historical and is superseded by this dated resumption and explicit waiver.

**Status: Blocked at the required-input gate, 2026-10-17 (Africa/Cairo).** T66 is incomplete. No production connection, SQL, provider inventory, HTTP probe, environment change, credential transition, manual deployment, financial write or cron invocation was performed. T67 and later tasks remain unstarted.

The T66 request authorizes the ordered production task subject to its prerequisites and STOP conditions. It does not supply the missing operational inputs. This checkpoint records the stop; it does not certify the historical preview or substitute local T65 evidence for production evidence.

## Main branch and source

Fetched origin, selected main and pulled with `--ff-only`. Starting HEAD and origin/main were both `beaf4a0839cdf5b7a3a03b3bbabb53ebd3298f64`; the working tree was clean. That is the verified repository checkpoint following T65, not a verified deployed release or an independently supplied maintenance-artifact SHA.

Only this report, README, the implementation-plan checkpoint and an operational checkpoint in the runbook change. The final documentation commit is identified by Git history. No application, migration, seed, dependency, environment, runtime entry, frontend gate or Vercel configuration changes are part of this checkpoint. A documentation push may cause existing Git-integrated deployment activity; such activity is neither a manual deployment performed here nor T67/T68 acceptance.

## STOP event and required inputs

Local prerequisite checks at approximately **2026-10-17 18:13 UTC** found:

| Required input | Evidence / disposition |
| --- | --- |
| Explicit production administrative/backup connection | Absent from the checked process configuration and ordinary application environment files. `backend/.env` contains only PORT, CLIENT_ORIGIN, DATABASE_URL and DATABASE_SSL_CA_FILE; its DB login is the limited application role. `backend/.env.local` is absent. Do not repurpose the runtime credential for administration. |
| Operator libpq configuration | PGSERVICEFILE, PGPASSFILE, PGSERVICE, PGHOST, PGUSER, PGDATABASE and PGPASSWORD are unset; the default Windows PostgreSQL service/password files are absent. No production management token is configured in the checked process. |
| Independently expected target and inspection configuration | CUTOVER_INSPECT_DATABASE_URL, CUTOVER_EXPECTED_HOST/DATABASE/USER and CUTOVER_SSL_CA_FILE are unset. Local connection/link metadata alone cannot prove a live target. |
| Explicit migration owner and recorded Main Account | No production owner/account UUIDs are supplied by this request or the checked operator variables. T37 records an earlier designation without publishing the identities. No Auth user was selected or inferred; T65 synthetic IDs are ineligible. |
| Available production recovery artifact | No PRE_V2_BACKUP_FILE is supplied. The historical T37 archive at its documented ignored location is absent. Its published checksum proves neither current availability nor a current recovery point. T65 archives contain synthetic data and cannot recover production. |
| Approved backup destination, isolated restore target and retention | Not supplied; isolated restore service/connection variables are unset. No production dump or restore was attempted. |
| Maintenance window and exact reviewed artifacts | No current window, maintenance-artifact SHA or independently expected release SHA is supplied. The current entries select V2 mode, not maintenance. The conditional T66 authorization does not identify these artifacts. |
| Stale deployment/session/credential strategy | Not supplied or freshly verified. Historical access protection cannot be treated as current denial proof. |
| Current baseline/history and rollback window | Must be obtained after the prerequisite gate is resolved; not collected in this attempt. |

**STOP:** production administrative recovery access and explicit ownership/recovery inputs are unavailable. No production operation was started to work around this gate, including provider SQL via a connected tool. Tool availability is not proof of a usable backup connection or successful restore. Missing values were not guessed and no secrets were requested in chat.

The request's explicit STOP rule controls this pause. No skill or automatic approval reviewer rejected a production operation; none was submitted. Subsequent local work only records the checkpoint and verifies the documentation changes.

## Production target identity

Historical intended project: **expense-tracker**, ref **kpbyvbgcfwavcsgtcdws**, region **eu-central-1**. The ignored local Supabase link matches that ref. Without connecting, local runtime URL metadata identifies **aws-1-eu-central-1.pooler.supabase.com:5432**, database **postgres**, with the expected limited `expense_tracker_app` project-qualified login. No password, full connection URL or private identity is recorded.

These are **local configuration observations**, not Phase 0 verification of a live database, current_user, schema fingerprint, project health or administrative identity. Production target status remains **UNKNOWN → STOP**.

The packaged public CA exists, is dated 2021-04-28 through 2031-04-26, and the configured URL has no prohibited TLS query override. Source pool configuration requires `rejectUnauthorized: true`, uses the configured CA and limits each process to five connections. No TLS handshake occurred; live hostname/certificate/client-hop verification remains pending.

## Prior-preview classification

The [T37 report](production-preview-t37-verification.md) contains successive historical stages; its later 2026-10-13 cutover section supersedes its earlier additive-only/blocked observations. It must not be read as a single current inventory.

| Earlier production-preview stage | T37 historical record | T66 classification |
| --- | --- | --- |
| Project/database/TLS | Intended project and client TLS previously verified | STALE / MUST REVERIFY; live identity UNKNOWN |
| Backup and application recovery | Archive/checksum and isolated logical application restore passed | STALE / MUST REVERIFY; archive unavailable here |
| Maintenance and old-role suspension | Maintenance deployed; financial DML suspended before cutover | STALE / MUST REVERIFY; no current maintenance proof |
| Additive schema/history | Four T11 additions pre-existed and were not replayed | STALE / MUST REVERIFY |
| Owner/profile/Main Account/category seed | Explicit owner, zero-opening cash account and nine defaults recorded | STALE / MUST REVERIFY; private owner/account mapping missing |
| Final backfill/reconciliation | Preserved historical fields/timestamps; ownership references reconciled | STALE / MUST REVERIFY |
| T15/T32 and complete history | All eight repository versions reported applied | STALE / MUST REVERIFY; no replay authorized by this report |
| Runtime/browser grants and Data API exclusion | Limited grants and browser denial reported | STALE / MUST REVERIFY |
| V1 retirement/current backend | V1 financial 410 recorded after V2-mode deployment | STALE / MUST REVERIFY |
| Old deployment protection | An earlier unguarded URL redirected to Vercel authentication | STALE / MUST REVERIFY; all stale deployment/session denial UNKNOWN |
| Frontend/Auth | Auth deployed; manual sign-in, persistence and sign-out reported successful | STALE / MUST REVERIFY; does not complete T69 |
| Financial UI gate / disabled cron | Financial routes gated; crons empty; acceptance intentionally deferred | STALE / MUST REVERIFY live; source gates remain present |

No historical stage is labeled VERIFIED CURRENT. No production stage is labeled NOT APPLIED without evidence. Nothing was skipped *because already verified*: production stages were **not attempted because the prerequisite gate failed**. The difference since T37 cannot be determined without fresh inventory.

## Current deployed artifacts and maintenance

Current deployed backend/frontend SHAs, immutable URLs, aliases, protection and active sessions were not queried. Historical backend acceptance SHA `43948ba70df63015cfe0923b15ac547b1c14ddd9` and frontend Auth SHA `dfe0dcd96f9530ee1f77f09717aefcdcb7e7d6f7` are reference points only. Neither is asserted to be current. READY status or an automatic documentation deployment cannot satisfy T67/T68.

Local source inspection establishes:

- Both backend runtime entries explicitly select `financialMode: "v2"`. The factory returns no-store 410 API_RETIRED for V1 financial paths before legacy service execution in that mode.
- The factory has a separate maintenance mode returning no-store 503 for non-health V1/V2 access and internal recurring processing. No current entry selects it and no environment maintenance switch is installed.
- V2 mode registers authenticated financial mutation handlers. A frontend 404 or missing JWT response is not proof that an authenticated financial write is blocked. **No current production all-financial maintenance or write-denial claim is made.**
- `frontend/src/app/v2/layout.tsx` still calls notFound outside development. Public Auth routing is separate. No gate was removed.
- `backend/vercel.json` still has `crons: []`; the prepared daily template remains inactive in source. The protected processor handler existing in the backend is separate from scheduled activation. Neither was invoked.

No hosted/current/direct/stale HTTP paths were tested after the STOP. All six V1 list/detail/summary/create/update/delete paths and all V2 financial access require actual hosted maintenance/retirement verification before progression.

## Fresh production baseline and rollback window

| Measure | Fresh T66 result |
| --- | --- |
| Transaction count / owned / unowned | Not collected |
| Income / expenses / balance | Not collected |
| Original-field fingerprint / microsecond timestamps | Not collected |
| Owner profile / Main Account / derived balance | Not collected |
| System category seed / quiet domains / recurring links | Not collected |
| Migration history / catalog / constraints / effective grants | Not collected |
| Post-migration financial activity / first-write checkpoint | Not collected |

For context only, T37's final 2026-10-13 reconciliation reported **1 transaction, income 9500.00, expenses 0.00, balance 9500.00**, with original MD5 fingerprint `434c087400fa7760625c24b75bfc4021`. Those are **historical values, not a T66 baseline or fresh reconciliation**. No sensitive row content or owner/account identifier is copied into this report.

**Rollback window: UNKNOWN → STOP.** Neither Window A nor Window B is proven. A still-gated frontend and an old report of no new writes cannot establish Window A. No restore, compatibility rollback, old-credential regrant or V1 reopening is authorized from this unknown checkpoint. Fresh database evidence must identify any V2 user/cron activity before recovery is classified.

## Backup / recovery and preservation

No production backup was created or freshly validated; there is no T66 archive checksum, restore result or retained new recovery artifact. Historical T37 metadata describes a 423,887-byte archive created 2026-10-12 11:58:46 UTC, SHA-256 `6fa8267d84be92c93ac7a413edec3aea536d3afb440706e7ca3f377eae27dba0`. Its previously tested scope was logical application/Auth/history recovery with separately handled privileges, not complete provider disaster recovery. The archive's absence here is not proof that another operator copy does not exist.

No production artifact was deleted. Existing synthetic T65 backups were not used as production evidence. Once access and a separate empty restore target are provided, obtain a fresh snapshot/archive (or freshly validate an operator-approved matching artifact), checksum it, independently restore and compare complete schema/rows/IDs/exact totals/timestamps and recovery dependencies. Role passwords/provider configuration/Storage bytes require separate handling. Stop on any discrepancy before production mutation.

If activity proves Window B, preserve a current complete artifact and use reviewed forward repair or explicit reconciliation/replay. A historical pre-cutover backup is recovery input, not permission for blind replacement. Until classification is possible, preserve the existing state and do not restore or re-enable V1.

## Tracked migrations and actions

The unchanged local migration inventory is below. Current production history/schema agreement is **unverified for every version**.

| Version | File purpose | T66 production action |
| --- | --- | --- |
| 20261001144302 | Initial V1 schema | None |
| 20261003163341 | Limited backend application role | None |
| 20261006132717 | V2 core tables | None |
| 20261006132719 | V2 transaction references | None |
| 20261006132721 | V2 indexes and triggers | None |
| 20261006132723 | V2 runtime privileges | None |
| 20261006171715 | T15 ownership constraints | None |
| 20261008135130 | T32 occurrence invariants | None |

Local file hashes were inspected; no migration content was changed. As documented in T65, Windows working-file line endings can differ from Git-canonical/historical hash bytes; raw hash differences alone do not justify a migration edit or history repair. Compare exact SQL content and actual catalog deliberately.

No schema/backfill/seed/profile/account/grant/role/session/credential change was executed. There is no fresh owner/profile/Main Account/category/ownership/T15/T32 validation or preserved-field reconciliation to report. No second identity or financial probe record was created. Applied stages must be freshly verified and skipped where proven complete; partial/conflicting state or history/catalog disagreement still requires a stop.

## Privileges, retirement, security and write gate

Runtime attributes, effective ordinary/occurrence grants, browser schema/table/function denial, Auth restrictions and old-session denial were **not freshly inspected**. T65 local role/security results remain local evidence. No credential was rotated, session terminated or privilege restored. Current V1 retirement and stale deployment denial are unverified.

No CORS configuration was widened. Source still uses one exact configured origin, certificate verification and sanitized errors. No secret values, full connection URLs, credentials, tokens, row contents or backups enter this report or Git. No production log stream was accessed. Live TLS/CORS/log/security acceptance remains pending rather than claimed passed.

Public V2 financial writes were not enabled by this task. **Their current production denial is unknown**; no all-financial maintenance checkpoint has been established. Scheduled cron remains disabled in unchanged source; the provider's current deployed schedule is unknown. The task performs no T69–T71 financial acceptance and no T72 activation.

## Phase disposition and actual changes

| Requested phase | Disposition |
| --- | --- |
| Required main workflow | Passed at starting SHA; documentation-only commit/push follows review |
| Phase 0 target verification | Incomplete; local intent only, live target UNKNOWN |
| Phase 1 required inputs | **BLOCKED / STOP** on missing administrative recovery and ownership inputs |
| Phases 2–40 production inventory, backup, classification, maintenance, migration, retirement and security gates | Not executed; no completion or fresh verification claimed |
| Phases 41–45 checkpoint/report/plan/README/diff and secret review | Documentation-only checkpoint; T66 remains incomplete |
| Phase 46 commit/push | Use `docs(v2): record production migration checkpoint`; final SHA/sync available in Git/final task response |

Production changes actually made: **none**. Changes skipped because already verified: **none**. Local-only findings: missing operator inputs; historical recovery artifact unavailable here; current source is V2 mode rather than a maintenance artifact. No production drift or new activity is asserted without inspection.

Validation for this documentation checkpoint: whitespace/diff review, local Markdown link checks, scoped recognizable-secret and configured-local-secret comparison, tracked-artifact review, and verification that application/migration/seed/configuration paths are unchanged. Link validation found twelve pre-existing README references to V1 files at their former locations; their targets now use the existing `docs/v1/` archive. Historical reports are unchanged. No application tests or historical local suites are presented as new production verification.

The scoped scan passed for all four changed documents: **184 local links, 3 anchors, 1 local environment file / 2 private values compared only in memory, 0 secret findings, 0 tracked private artifacts, 0 product/migration/configuration changes**. `git diff --check` passed. These checks made no network or production connection.

## Resume requirements and next task

Provide the following through private operator configuration, without sending credentials or archive contents in chat:

1. Independently verified production project/host/database/admin identity, administrative connection or libpq service/password files, approved CA and explicit expected inspection target. Preserve a separate limited runtime configuration.
2. The explicitly designated real migration-owner UUID and the previously recorded Main Account UUID, with a supported way to verify the intended Auth identity. Do not select the sole/first Auth user automatically.
3. Approved private backup destination/retention and a positively identified empty isolated restore target, or the approved recovery artifact and its accessible recovery reference for fresh validation.
4. The maintenance window, expected release/maintenance artifact SHAs and concrete stale-deployment/credential/session retirement strategy. Prepare/review any stage SQL only after actual inventory identifies missing work; do not build a guessed backfill against unknown data.

After these are resolved, resume **T66 at target verification**, then fresh read-only inventory/history/catalog/deployment inspection, rollback-window classification and backup/isolated recovery proof. Record verified/skipped/missing/contradictory stages before any production write. The existing T66 authorization remains conditional on all gates; no unrelated approval or new task is implied.

**Next task: resume blocked T66 — Execute Production Migration and V1 Retirement. T67 — Deploy Authenticated V2 Backend is not eligible until every mandatory T66 gate passes.** The [runbook](production-migration-runbook.md) retains its staged procedure; [T65](t65-verification.md) remains the local rehearsal evidence. Optional P1 tasks remain deferred.

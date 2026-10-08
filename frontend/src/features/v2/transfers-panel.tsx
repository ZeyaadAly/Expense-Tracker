"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { createAccountClient, type Account } from "../../lib/api/accounts";
import { createTransferClient, validateTransferInput, type Transfer, type TransferInput } from "../../lib/api/transfers";
import { cairoToday } from "../../lib/api/v2-transactions";
import { createTransfersStore } from "../../lib/transfers-store";
import { TransferForm, TransferSummary } from "../../components/v2/forms";
import { MoneyDisplay, TransferBadge } from "../../components/v2/finance";
import { Button, DialogShell, EmptyState, ErrorState, FeedbackBanner, Skeleton, StaleIndicator } from "../../components/v2/primitives";
type Action = { kind: "create" | "edit" | "delete"; transfer?: Transfer };
type Store = ReturnType<typeof createTransfersStore>;
export function TransfersPanel({ userId, account, refreshBalances, disabled = false }: { userId: string; account?: Account; refreshBalances: () => Promise<boolean>; disabled?: boolean }) {
  const refreshId = useId();
  const { invalidateSession, signOut } = useAuth();
  const [client] = useState(() => createTransferClient(userId));
  const [store] = useState(() => createTransfersStore({ transfers: client, accounts: createAccountClient(userId) }, refreshBalances, account?.id));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [action, setAction] = useState<Action | null>(null);
  useEffect(() => store.start(), [store]);
  useEffect(() => { if (state.authError) { invalidateSession(); void signOut(); } }, [state.authError, invalidateSession, signOut]);
  if (state.authError) return null;
  const open = (next: Action) => { store.clearMutation(); setAction(next); void store.loadOptions(); };
  const close = () => { if (!store.getSnapshot().pending && !store.getSnapshot().inspecting) { setAction(null); store.clearMutation(); setTimeout(() => { if (document.activeElement === document.body) document.getElementById(refreshId)?.focus(); }, 0); } };
  return <section className="p4-panel transfers-connected" aria-label="Transfers">
    <div className="v2-actions"><h2>Transfers</h2><Button disabled={disabled || state.pending || (state.optionsLoading && !state.accounts) || !!state.optionsError || (account?.status === "archived") || (state.accounts?.filter(row => row.status === "active").length ?? 0) < 2} onClick={() => open({ kind: "create" })}>New transfer</Button><Button id={refreshId} variant="secondary" disabled={disabled || state.pending || state.loading} onClick={() => { void store.refresh(); void store.loadOptions(); }}>Refresh transfers</Button></div>
    <p className="v2-helper">Account movement only. Card payments use transfers to avoid a second expense.</p>
    {account?.status === "archived" && <p className="v2-helper">Archived history remains available. Restore the account to use it in a new transfer.</p>}
    {state.notice && <FeedbackBanner tone={state.notice.includes("could not") ? "warning" : "success"} title={state.notice}/>}
    {state.optionsError && <ErrorState title="Account choices unavailable" description={state.optionsError} onRetry={() => void store.loadOptions()}/>}
    {state.error && <ErrorState title="Transfer history unavailable" description={state.error} onRetry={() => void store.refresh()}/>}
    {state.error && state.rows && <StaleIndicator/>}
    {state.loading && <p role="status">Loading transfers…</p>}
    {state.rows === null ? state.loading ? <Skeleton variant="transaction"/> : null : !state.rows.length ? <EmptyState title="No transfers yet." description="Move money between two active accounts. Transfers do not change income or expenses."/> : <div className="transfer-history">{state.rows.map(row => {
      const source = state.accounts?.find(a => a.id === row.sourceAccountId), destination = state.accounts?.find(a => a.id === row.destinationAccountId);
      const direction = account ? row.sourceAccountId === account.id ? `To ${row.destinationAccountName}` : `From ${row.sourceAccountName}` : `${row.sourceAccountName} → ${row.destinationAccountName}`;
      return <article className="v2-data-row transfer-history-row" key={row.id}>
        <div><TransferBadge/><h3>{direction}</h3><time dateTime={row.date}>{row.date}</time>{row.description && <p>{row.description}</p>}
          <p className="v2-helper">From {row.sourceAccountName}{source?.status === "archived" ? " (Archived)" : ""} · To {row.destinationAccountName}{destination?.status === "archived" ? " (Archived)" : ""}</p>
        </div><MoneyDisplay value={row.amount} kind="transfer"/><div className="v2-actions">
          <Button variant="text" disabled={disabled || state.pending} aria-label={`Edit transfer ${row.description || row.date}`} onClick={() => open({ kind: "edit", transfer: row })}>Edit</Button>
          <Button variant="text" disabled={disabled || state.pending} aria-label={`Delete transfer ${row.description || row.date}`} onClick={() => open({ kind: "delete", transfer: row })}>Delete</Button>
        </div>
      </article>;
    })}</div>}
    {state.rows && <div className="v2-actions" aria-label="Transfer pages"><Button variant="secondary" disabled={state.pending || state.loading || !state.history.length} onClick={() => store.previous()}>Previous transfers</Button><span className="v2-helper">Page {state.history.length + 1}</span><Button variant="secondary" disabled={state.pending || state.loading || !!state.error || !state.meta?.hasMore} onClick={() => store.next()}>Next transfers</Button></div>}
    {action && <TransferDialog key={action.kind + (action.transfer?.id ?? "")} action={action} source={account} state={state} store={store} client={client} close={close}/>}
  </section>;
}
function TransferDialog({ action, source, state, store, client, close }: { action: Action; source?: Account; state: ReturnType<Store["getSnapshot"]>; store: Store; client: ReturnType<typeof createTransferClient>; close: () => void }) {
  const prefix = useId(), row = action.transfer;
  const [draft, setDraft] = useState<TransferInput>(() => row ? { sourceAccountId: row.sourceAccountId, destinationAccountId: row.destinationAccountId, amount: row.amount, date: row.date, description: row.description } : { sourceAccountId: source?.status === "active" ? source.id : "", destinationAccountId: "", amount: "", date: cairoToday(), description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState(action.kind === "delete");
  const submitting = useRef(false), mounted = useRef(true), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const fields = { ...errors, ...state.mutationError?.fields }, uncertain = !!state.mutationError?.uncertain;
  const locked = state.pending || state.inspecting || uncertain;
  const accounts = state.accounts ?? [];
  const from = accounts.find(a => a.id === draft.sourceAccountId), to = accounts.find(a => a.id === draft.destinationAccountId);
  const focus = (validation: Record<string, string>) => { const field = ["sourceAccountId", "destinationAccountId", "amount", "date", "description"].find(name => validation[name]); if (field) setTimeout(() => document.getElementById(`${prefix}-${field}`)?.focus(), 0); };
  function validate() {
    const validation = validateTransferInput(draft);
    if (from?.status !== "active") validation.sourceAccountId = "Choose an active From account. Restore archived accounts on Accounts.";
    if (to?.status !== "active") validation.destinationAccountId = "Choose an active To account. Restore archived accounts on Accounts.";
    setErrors(validation); if (Object.keys(validation).length) { setReview(false); focus(validation); return false; } return true;
  }
  async function submit() {
    if (submitting.current || store.getSnapshot().pending || uncertain || state.optionsLoading || state.optionsError) return;
    if (action.kind !== "delete" && !validate()) return;
    submitting.current = true;
    const success = await store.mutate(options => action.kind === "create" ? client.createTransfer(draft, options) : action.kind === "edit" ? client.updateTransfer(row!.id, draft, options) : client.deleteTransfer(row!.id, options), action.kind);
    submitting.current = false; if (!mounted.current) return;
    if (success) close(); else if (!store.getSnapshot().mutationError?.uncertain && action.kind !== "delete") { setReview(false); focus(store.getSnapshot().mutationError?.fields ?? {}); }
  }
  const title = action.kind === "delete" ? "Delete transfer?" : action.kind === "edit" ? "Edit transfer" : "New transfer";
  return <DialogShell title={title} description={action.kind === "delete" ? "This permanently removes the transfer. Account balances will refresh from the latest activity." : "Move money between two different active accounts. Review both accounts before saving."} onClose={close} state={state.pending || state.inspecting ? "pending" : "default"}>
    {state.mutationError && <FeedbackBanner tone={uncertain ? "warning" : "error"} title={state.mutationError.message}/>}
    {uncertain && state.notice && <FeedbackBanner tone="warning" title={state.notice}/>}
    {state.optionsError && <FeedbackBanner tone="error" title={state.optionsError}/>}
    {state.optionsLoading && <p role="status">Refreshing account choices…</p>}
    {review ? <div className="transfer-review">
      <h3 ref={heading} tabIndex={-1}>{action.kind === "delete" ? "Transfer to delete" : "Review transfer"}</h3>
      <TransferSummary from={from?.name ?? row?.sourceAccountName ?? "From account"} to={to?.name ?? row?.destinationAccountName ?? "To account"} amount={draft.amount} date={draft.date} description={draft.description}/>
      <div className="v2-actions"><Button data-initial-focus variant="secondary" disabled={state.pending || state.inspecting} onClick={close}>Cancel</Button>{action.kind !== "delete" && <Button variant="secondary" disabled={locked} onClick={() => { setReview(false); setTimeout(() => document.getElementById(`${prefix}-sourceAccountId`)?.focus(), 0); }}>Back to form</Button>}<Button variant={action.kind === "delete" ? "danger" : "primary"} loading={state.pending} disabled={uncertain || state.inspecting || (action.kind !== "delete" && (state.optionsLoading || !!state.optionsError))} onClick={() => void submit()}>{action.kind === "delete" ? "Delete transfer" : "Save transfer"}</Button></div>
    </div> : <><TransferForm live={{ prefix, draft, accounts, fields, disabled: locked || state.optionsLoading || !!state.optionsError, onChange: next => { setDraft(next); setErrors({}); store.clearMutation(); } }} onSubmit={() => { if (validate()) { setReview(true); setTimeout(() => heading.current?.focus(), 0); } }}/><Button variant="secondary" disabled={state.pending || state.inspecting} onClick={close}>Cancel</Button></>}
    {(state.mutationError || state.optionsError) && <Button variant="secondary" disabled={state.pending || state.inspecting || state.optionsLoading} onClick={() => uncertain ? void store.inspect(action.kind, draft, row?.id) : void store.loadOptions() }>{uncertain ? "Refresh accounts / Check activity" : "Refresh account choices"}</Button>}
    {state.inspection && <section className="transfer-inspection" aria-label="Latest transfer activity"><h3>Latest activity</h3>{!state.inspection.length ? <p>This transfer is not present in the latest activity.</p> : state.inspection.map(current => <TransferSummary key={current.id} from={current.sourceAccountName} to={current.destinationAccountName} amount={current.amount} date={current.date} description={current.description}/>)}<p className="v2-helper">Check this activity against your draft. Similar transfers may be separate deliberate entries. Another save can create another transfer.</p></section>}
    {uncertain && state.inspected && <Button variant="secondary" onClick={() => store.acknowledgeInspection()}>I checked activity; allow a deliberate retry</Button>}
  </DialogShell>;
}

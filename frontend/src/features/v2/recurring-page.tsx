"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { createAccountClient } from "../../lib/api/accounts";
import { createCategoryClient } from "../../lib/api/categories";
import { createRecurringClient, frequencies, validateRecurringInput, type Recurring, type RecurringInput, type RecurringQuery } from "../../lib/api/recurring";
import { cairoToday } from "../../lib/api/v2-transactions";
import { createRecurringStore } from "../../lib/recurring-store";
import { PageHeader } from "../../components/v2/app-shell";
import { FrequencyBadge, MoneyDisplay, RecurringStatusBadge, UpcomingItem } from "../../components/v2/finance";
import { Button, DateInput, DialogShell, EmptyState, ErrorState, FeedbackBanner, FormField, MoneyInput, Select, Skeleton, StaleIndicator, Textarea } from "../../components/v2/primitives";
import { PrototypeShell } from "./shell";

type Store = ReturnType<typeof createRecurringStore>;
type State = ReturnType<Store["getSnapshot"]>;
type Action = { kind: "create" | "edit" | "pause" | "resume" | "archive"; id?: string };
const frequencyLabels = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" } as const;
const statusLabels = { active: "Active", paused: "Paused", archived: "Archived" } as const;
const messages = {
  create: "Plan expected income or expenses. Upcoming occurrences are separate from posted transactions.",
  edit: "Changes apply to the future schedule. Past generated transactions won't be changed.",
  pause: "Future generation stops. Past transactions remain. Paused dates won't be backfilled when you resume.",
  resume: "Resume from the next eligible schedule date on or after Cairo today. Paused history is skipped; missed dates won't be backfilled.",
  archive: "Archiving is permanent. Future generation stops; past generated transactions and schedule history remain. This item cannot be restored.",
};
export function RecurringPage() {
  const { user } = useAuth();
  return user ? <ConnectedRecurring key={user.id} userId={user.id} /> : null;
}
function ConnectedRecurring({ userId }: { userId: string }) {
  const { invalidateSession, signOut } = useAuth();
  const [clients] = useState(() => ({ recurring: createRecurringClient(userId), accounts: createAccountClient(userId), categories: createCategoryClient(userId) }));
  const [store] = useState(() => createRecurringStore(clients));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [action, setAction] = useState<Action | null>(null);
  const pageId = useId();
  useEffect(() => store.start(), [store]);
  useEffect(() => { if (state.authError) { invalidateSession(); void signOut(); } }, [state.authError, invalidateSession, signOut]);
  if (state.authError) return null;
  const open = (next: Action) => { store.clearAction(); setAction(next); void store.loadOptions(); if (next.id) void store.loadResource(next.id); };
  const close = () => {
    if (store.getSnapshot().pending || store.getSnapshot().inspecting) return;
    store.clearAction(); setAction(null);
    requestAnimationFrame(() => { if (document.activeElement === document.body) document.getElementById(`${pageId}-add`)?.focus(); });
  };
  const change = (key: keyof RecurringQuery, value: string) => store.setQuery({ [key]: value || undefined });
  const filtered = Object.values(state.query).some(Boolean);
  return <PrototypeShell liveRecurring>
    <PageHeader title="Recurring" description="Your schedules and the money ahead." actions={<>
      <Button variant="secondary" disabled={state.loading || state.upcomingLoading || state.pending} onClick={() => { void store.refresh(); void store.loadOptions(); }}>Refresh recurring items</Button>
      <Button id={`${pageId}-add`} disabled={state.pending} onClick={() => open({ kind: "create" })}>Add recurring item</Button>
    </>} />
    <p className="v2-helper">Expected schedules · posted transactions remain separate. Items due today are posted by scheduled processing.</p>
    {state.notice && <FeedbackBanner tone={state.error || state.upcomingError ? "warning" : "success"} title={state.notice} />}
    {state.optionsError && <ErrorState title="Choices could not load" description={state.optionsError} onRetry={() => void store.loadOptions()} />}
    <section className="p4-panel" aria-label="Recurring filters"><div className="v2-form-grid">
      <FormField id={`${pageId}-status`} label="Status"><Select id={`${pageId}-status`} value={state.query.status ?? ""} disabled={state.pending} onChange={e => change("status", e.target.value)}><option value="">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
      <FormField id={`${pageId}-type`} label="Type"><Select id={`${pageId}-type`} value={state.query.type ?? ""} disabled={state.pending} onChange={e => change("type", e.target.value)}><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option></Select></FormField>
      <FormField id={`${pageId}-account`} label="Account"><Select id={`${pageId}-account`} value={state.query.accountId ?? ""} disabled={state.pending || state.optionsLoading} onChange={e => change("accountId", e.target.value)}><option value="">All accounts</option>{state.accounts?.map(a => <option key={a.id} value={a.id}>{a.name}{a.status === "archived" ? " (Archived)" : ""}</option>)}</Select></FormField>
      <FormField id={`${pageId}-category`} label="Category"><Select id={`${pageId}-category`} value={state.query.categoryId ?? ""} disabled={state.pending || state.optionsLoading} onChange={e => change("categoryId", e.target.value)}><option value="">All categories</option>{state.categories?.map(c => <option key={c.id} value={c.id}>{c.name}{c.status === "archived" ? " (Archived)" : ""}</option>)}</Select></FormField>
      <FormField id={`${pageId}-frequency`} label="Frequency"><Select id={`${pageId}-frequency`} value={state.query.frequency ?? ""} disabled={state.pending} onChange={e => change("frequency", e.target.value)}><option value="">All frequencies</option>{frequencies.map(f => <option key={f} value={f}>{frequencyLabels[f]}</option>)}</Select></FormField>
    </div>{filtered && <Button variant="text" disabled={state.pending} onClick={() => store.clearFilters()}>Clear filters</Button>}</section>
    <div className="p4-overview t34-recurring">
      <section className="p4-panel" aria-labelledby={`${pageId}-schedules`}>
        <h2 id={`${pageId}-schedules`}>Schedules</h2>
        <p role="status" className="v2-helper">{state.loading ? "Loading recurring items…" : state.error ? "Recurring items could not refresh." : `${state.rows?.length ?? 0} recurring items.`}</p>
        {state.error && <ErrorState title="Recurring items could not refresh" description={state.error} onRetry={() => void store.refreshList()} />}
        {state.error && state.rows && <StaleIndicator />}
        {state.rows === null && state.loading && <Skeleton variant="transaction" />}
        {state.rows?.length === 0 && !state.loading && !state.error && <EmptyState title={filtered ? "No recurring items match these filters." : "No recurring items yet."} description={filtered ? "Clear your filters to see your schedules." : "Plan repeating income or expenses."} action={<Button onClick={() => filtered ? store.clearFilters() : open({ kind: "create" })}>{filtered ? "Clear filters" : "Add recurring item"}</Button>} />}
        {state.rows?.map(row => <article key={row.id} className="t34-schedule" data-status={row.status} aria-label={row.description}>
          <div className="v2-data-row"><div><strong>{row.description}</strong><p className="v2-helper">{row.accountName} · {row.categoryName}</p>
            <p className="v2-helper">{row.nextOccurrence ? <>Next <time dateTime={row.nextOccurrence}>{row.nextOccurrence}</time></> : row.exhausted ? "Schedule complete" : "No future occurrence"}</p>
            {row.endDate && <p className="v2-helper">Ends <time dateTime={row.endDate}>{row.endDate}</time></p>}
            <div className="v2-actions"><FrequencyBadge frequency={frequencyLabels[row.frequency]} /><RecurringStatusBadge status={statusLabels[row.status]} /><span className="v2-helper">Expected {row.type}</span></div>
          </div><MoneyDisplay value={row.amount} kind={row.type} /></div>
          {row.status !== "archived" && <div className="v2-actions">
            <Button variant="text" disabled={state.pending} onClick={() => open({ kind: "edit", id: row.id })}>Edit</Button>
            <Button variant="text" disabled={state.pending} onClick={() => open({ kind: row.status === "active" ? "pause" : "resume", id: row.id })}>{row.status === "active" ? "Pause" : "Resume"}</Button>
            <Button variant="text" disabled={state.pending} onClick={() => open({ kind: "archive", id: row.id })}>Archive</Button>
          </div>}
        </article>)}
      </section>
      <section className="p4-panel" aria-labelledby={`${pageId}-upcoming`}>
        <h2 id={`${pageId}-upcoming`}>Upcoming occurrences</h2><p className="v2-helper">Expected activity for the next 30 days. List filters apply to schedules only.</p>
        {state.upcoming && <p className="v2-helper">{state.upcoming.meta.from} – {state.upcoming.meta.to} · Africa/Cairo</p>}
        <p role="status" className="v2-sr-only">{state.upcomingLoading ? "Loading upcoming occurrences…" : state.upcomingError ? "Upcoming occurrences could not refresh." : `${state.upcoming?.data.length ?? 0} upcoming occurrences.`}</p>
        {state.upcomingError && <ErrorState title="Upcoming occurrences could not refresh" description={state.upcomingError} onRetry={() => void store.refreshUpcoming()} />}
        {state.upcomingError && state.upcoming && <StaleIndicator />}
        {!state.upcoming && state.upcomingLoading && <Skeleton variant="transaction" />}
        {state.upcoming?.data.length === 0 && !state.upcomingLoading && !state.upcomingError && <p>No upcoming recurring activity.</p>}
        <ol className="t34-timeline">{state.upcoming?.data.map(item => <li key={`${item.recurringTransactionId}:${item.occurrenceDate}`}><UpcomingItem item={{ name: item.description, account: item.accountName, amount: item.amount, type: item.type, date: item.occurrenceDate }} /></li>)}</ol>
        <p className="v2-helper">Paused, archived and completed schedules have no future occurrence.</p>
      </section>
    </div>
    {action && <RecurringDialog key={`${action.kind}:${action.id ?? "new"}`} action={action} state={state} store={store} client={clients.recurring} close={close} />}
  </PrototypeShell>;
}
function RecurringDialog({ action, state, store, client, close }: { action: Action; state: State; store: Store; client: ReturnType<typeof createRecurringClient>; close: () => void }) {
  const form = action.kind === "create" || action.kind === "edit";
  const title = action.kind === "create" ? "Add recurring item" : action.kind === "edit" ? "Edit recurring item" : `${action.kind[0].toUpperCase() + action.kind.slice(1)} schedule?`;
  return <DialogShell title={title} description={messages[action.kind]} onClose={close} state={state.pending || state.inspecting ? "pending" : "default"}>
    {(state.pending || state.inspecting) && <p role="status" tabIndex={0}>{state.pending ? "Saving recurring item…" : "Checking saved recurring items…"}</p>}
    {state.mutationError && <FeedbackBanner tone={state.mutationError.uncertain ? "warning" : "error"} title={state.mutationError.message} />}
    {state.optionsError && <ErrorState title="Choices could not load" description={state.optionsError} onRetry={() => void store.loadOptions()} />}
    {state.resourceLoading && <p role="status">Loading recurring item…</p>}
    {state.resourceError && <ErrorState title="Recurring item unavailable" description={state.resourceError} onRetry={() => void store.loadResource(action.id!)} />}
    {(action.kind === "create" || state.resource) && <RecurringEditor key={state.resource?.updatedAt ?? "new"} action={action} row={state.resource} state={state} store={store} client={client} close={close} form={form} />}
    {state.mutationError && <Button variant="secondary" disabled={state.pending || state.inspecting} onClick={() => void store.inspect(action.id)}>Refresh and inspect recurring items</Button>}
    {state.inspection && <section aria-label="Latest saved recurring items"><h3>Latest saved recurring items</h3><p className="v2-helper">Read-only results. Compare these with your draft. No change has been retried.</p>{!state.inspection.length && <p>No matching recurring item found.</p>}<ul>{state.inspection.map(row => <li key={row.id}>{row.description} · {row.accountName} · {row.categoryName} · {row.amount} EGP · {frequencyLabels[row.frequency]} · {row.startDate} · {row.endDate ?? "No end date"} · {statusLabels[row.status]} · {row.nextOccurrence ?? "No future occurrence"}</li>)}</ul></section>}
  </DialogShell>;
}
function RecurringEditor({ action, row, state, store, client, close, form }: { action: Action; row: Recurring | null; state: State; store: Store; client: ReturnType<typeof createRecurringClient>; close: () => void; form: boolean }) {
  const prefix = useId();
  const [draft, setDraft] = useState<RecurringInput>(() => row ? { type: row.type, accountId: row.accountId, categoryId: row.categoryId, amount: row.amount, description: row.description, frequency: row.frequency, startDate: row.startDate, endDate: row.endDate } : { type: "expense", accountId: "", categoryId: "", amount: "", description: "", frequency: "monthly", startDate: cairoToday(), endDate: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitting = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (form) document.getElementById(`${prefix}-type`)?.focus(); }, [form, prefix]);
  const accounts = state.accounts?.filter(a => a.status === "active") ?? [];
  const categories = state.categories?.filter(c => c.status === "active" && (c.kind === draft.type || c.kind === "both")) ?? [];
  const allErrors = { ...errors, ...state.mutationError?.fields };
  const forbidden = !!row && (row.status === "archived" || (action.kind === "pause" && row.status !== "active") || (action.kind === "resume" && row.status !== "paused"));
  const locked = state.pending || state.inspecting || !!state.mutationError?.uncertain || state.mutationError?.code === "NOT_FOUND" || forbidden;
  const focus = (fields: Record<string, string>) => { const name = ["type", "accountId", "categoryId", "amount", "description", "frequency", "startDate", "endDate"].find(k => fields[k]); if (name) setTimeout(() => { if (mounted.current) document.getElementById(`${prefix}-${name}`)?.focus(); }, 0); };
  async function submit() {
    if (submitting.current || locked || (form && (state.optionsLoading || state.optionsError))) return;
    const next = form ? validateRecurringInput(draft) : {};
    if (form && !accounts.some(a => a.id === draft.accountId)) next.accountId = "Choose an active account, or restore the historical account on Accounts.";
    if (form && !categories.some(c => c.id === draft.categoryId)) next.categoryId = "Choose an active compatible category.";
    setErrors(next); if (Object.keys(next).length) { focus(next); return; }
    submitting.current = true;
    const success = await store.mutate(options => action.kind === "create" ? client.createRecurring(draft, options) : action.kind === "edit" ? client.updateRecurring(row!.id, draft, options) : action.kind === "pause" ? client.pauseRecurring(row!.id, options) : action.kind === "resume" ? client.resumeRecurring(row!.id, options) : client.archiveRecurring(row!.id, options));
    submitting.current = false;
    if (!mounted.current) return;
    if (success) close(); else focus(store.getSnapshot().mutationError?.fields ?? {});
  }
  const props = (key: keyof RecurringInput) => ({ id: `${prefix}-${key}`, name: key, value: draft[key] ?? "", disabled: state.pending || state.inspecting, "aria-invalid": !!allErrors[key], "aria-describedby": allErrors[key] ? `${prefix}-${key}-error` : undefined, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDraft({ ...draft, [key]: key === "endDate" ? e.target.value || null : e.target.value }) });
  return <>
    {forbidden && <FeedbackBanner tone="warning" title="This schedule has changed or is archived. Close and refresh to see its current state." />}
    {form ? <form className="v2-form" noValidate onSubmit={e => { e.preventDefault(); void submit(); }}>
      <FormField id={`${prefix}-type`} label="Type" required error={allErrors.type}><Select {...props("type")} data-initial-focus onChange={e => { const type = e.target.value as RecurringInput["type"]; setDraft({ ...draft, type, categoryId: state.categories?.some(c => c.id === draft.categoryId && c.status === "active" && (c.kind === type || c.kind === "both")) ? draft.categoryId : "" }); }}><option value="expense">Expense</option><option value="income">Income</option></Select></FormField>
      <FormField id={`${prefix}-accountId`} label="Account" required error={allErrors.accountId}><Select {...props("accountId")}><option value="">Choose account</option>{row && !accounts.some(a => a.id === row.accountId) && <option value={row.accountId} disabled>{row.accountName} (Archived or unavailable)</option>}{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></FormField>
      {!accounts.length && !state.optionsLoading && <p>No active accounts. <Link href="/v2/accounts">Add or restore an account</Link> before saving.</p>}
      <FormField id={`${prefix}-categoryId`} label="Category" required error={allErrors.categoryId}><Select {...props("categoryId")}><option value="">Choose category</option>{row && draft.categoryId === row.categoryId && !categories.some(c => c.id === row.categoryId) && <option value={row.categoryId} disabled>{row.categoryName} (Archived or incompatible)</option>}{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField>
      <FormField id={`${prefix}-amount`} label="Amount" required error={allErrors.amount}><MoneyInput {...props("amount")} /></FormField>
      <FormField id={`${prefix}-description`} label="Description" required error={allErrors.description}><Textarea {...props("description")} rows={3} /></FormField>
      <FormField id={`${prefix}-frequency`} label="Frequency" required error={allErrors.frequency}><Select {...props("frequency")}>{frequencies.map(f => <option key={f} value={f}>{frequencyLabels[f]}</option>)}</Select></FormField>
      <FormField id={`${prefix}-startDate`} label="Start date" required error={allErrors.startDate}><DateInput {...props("startDate")} min="1900-01-01" max="9999-12-31" /></FormField>
      <FormField id={`${prefix}-endDate`} label="End date (optional)" error={allErrors.endDate}><DateInput {...props("endDate")} min={draft.startDate || "1900-01-01"} max="9999-12-31" /></FormField>
      <p className="v2-helper">Dates follow Africa/Cairo. Past dates won&apos;t be backfilled. The next eligible occurrence will be scheduled.</p>
      {draft.frequency === "monthly" && <p className="v2-helper">Month-end starts use the last valid day in shorter months, then return to the original day.</p>}
      {draft.frequency === "yearly" && <p className="v2-helper">A February 29 start uses February 28 in other years, returning to February 29 in leap years.</p>}
      <div className="v2-actions"><Button variant="secondary" disabled={state.pending || state.inspecting} onClick={close}>Cancel</Button><Button type="submit" loading={state.pending} disabled={locked || state.optionsLoading || !!state.optionsError}>Save recurring item</Button></div>
    </form> : <><p><strong>{row!.description}</strong></p><p>{row!.accountName} · {row!.categoryName} · {statusLabels[row!.status]}</p><MoneyDisplay value={row!.amount} kind={row!.type} /><div className="v2-actions"><Button data-initial-focus variant="secondary" disabled={state.pending || state.inspecting} onClick={close}>Cancel</Button><Button variant={action.kind === "archive" ? "danger" : "primary"} loading={state.pending} disabled={locked} onClick={() => void submit()}>{action.kind === "pause" ? "Pause schedule" : action.kind === "resume" ? "Resume schedule" : "Archive schedule"}</Button></div></>}
  </>;
}

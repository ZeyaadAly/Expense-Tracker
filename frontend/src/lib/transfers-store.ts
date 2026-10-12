import type { Account, createAccountClient } from "./api/accounts";
import type { Transfer, TransferInput, TransferPage, createTransferClient } from "./api/transfers";
type Kind = "create" | "edit" | "delete";
type Failure = { message: string; uncertain: boolean; fields: Record<string, string> };
type State = { rows: Transfer[] | null; accounts: Account[] | null; meta: TransferPage["meta"] | null; cursor: string | null; history: (string | null)[]; loading: boolean; optionsLoading: boolean; error: string | null; optionsError: string | null; authError: boolean; pending: boolean; mutationError: Failure | null; notice: string | null; inspection: Transfer[] | null; inspected: boolean; inspecting: boolean };
type Clients = { transfers: ReturnType<typeof createTransferClient>; accounts: ReturnType<typeof createAccountClient> };
const authFailure = (e: unknown) => { const error = e as { status?: number; code?: string }; return error.status === 401 || ["AUTH_REQUIRED", "AUTH_INVALID"].includes(error.code ?? ""); };
export function createTransfersStore(clients: Clients, refreshBalances: () => Promise<boolean>, accountId?: string) {
  const initial: State = { rows: null, accounts: null, meta: null, cursor: null, history: [], loading: true, optionsLoading: true, error: null, optionsError: null, authError: false, pending: false, mutationError: null, notice: null, inspection: null, inspected: false, inspecting: false };
  let state = initial, lifetime = 0, generation = 0, optionGeneration = 0, inspectionGeneration = 0;
  let read: AbortController | undefined, choices: AbortController | undefined, write: AbortController | undefined, inspectRead: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  function clearAuth() { lifetime++; read?.abort(); choices?.abort(); write?.abort(); inspectRead?.abort(); publish({ ...initial, loading: false, optionsLoading: false, authError: true }); }
  async function refresh(recover = true): Promise<boolean> {
    const life = lifetime, current = ++generation; read?.abort(); read = new AbortController(); publish({ loading: true, error: null });
    try {
      const page = await clients.transfers.listTransfers({ accountId, limit: 25, cursor: state.cursor ?? undefined }, { signal: read.signal });
      if (life !== lifetime || current !== generation) return false;
      if (!page.data.length && state.history.length) { publish({ cursor: state.history.at(-1) ?? null, history: state.history.slice(0, -1) }); return refresh(false); }
      publish({ rows: page.data, meta: page.meta, loading: false }); return true;
    } catch (error) {
      if (life !== lifetime || current !== generation) return false;
      if (authFailure(error)) { clearAuth(); return false; }
      const e = error as { code?: string; details?: { field: string }[] };
      if (recover && state.cursor && e.code === "VALIDATION_ERROR" && e.details?.some(d => d.field === "cursor")) { publish({ cursor: null, history: [], notice: "Pagination changed or expired. Showing the first transfer page." }); return refresh(false); }
      publish({ loading: false, error: "Transfer history could not refresh. Last loaded rows are retained where available." }); return false;
    }
  }
  async function loadOptions(): Promise<boolean> {
    const life = lifetime, current = ++optionGeneration; choices?.abort(); choices = new AbortController(); publish({ optionsLoading: true, optionsError: null });
    const options = { signal: choices.signal };
    const results = await Promise.allSettled([clients.accounts.listAccounts("active", options), clients.accounts.listAccounts("archived", options)]);
    if (life !== lifetime || current !== optionGeneration) return false;
    if (results.some(r => r.status === "rejected" && authFailure(r.reason))) { clearAuth(); return false; }
    if (results.some(r => r.status === "rejected")) { publish({ optionsLoading: false, optionsError: "Account choices could not refresh. Refresh choices before saving." }); return false; }
    // The two status reads can straddle an archive. Prefer the archived observation
    // for duplicate IDs instead of exposing conflicting choices or duplicate React keys.
    const accounts = new Map<string, Account>();
    for (const result of results) for (const account of (result as PromiseFulfilledResult<Account[]>).value) accounts.set(account.id, account);
    publish({ optionsLoading: false, accounts: [...accounts.values()] }); return true;
  }
  const store = {
    getSnapshot: () => state, getServerSnapshot: () => initial,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start() { void refresh(); void loadOptions(); return () => { lifetime++; generation++; optionGeneration++; inspectionGeneration++; read?.abort(); choices?.abort(); write?.abort(); inspectRead?.abort(); state = initial; }; },
    refresh, loadOptions,
    next() { if (state.pending || state.loading || state.error || !state.meta?.nextCursor) return; publish({ history: [...state.history, state.cursor], cursor: state.meta.nextCursor }); void refresh(); },
    previous() { if (state.pending || state.loading || !state.history.length) return; publish({ cursor: state.history.at(-1) ?? null, history: state.history.slice(0, -1) }); void refresh(); },
    clearMutation() { if (!state.pending && !state.inspecting) { inspectionGeneration++; inspectRead?.abort(); publish({ mutationError: null, inspection: null, inspected: false }); } },
    acknowledgeInspection() { if (state.inspected && !state.pending && !state.inspecting) publish({ mutationError: null }); },
    async inspect(kind: Kind, input: TransferInput, id?: string) {
      const life = lifetime, current = ++inspectionGeneration; inspectRead?.abort(); inspectRead = new AbortController(); const signal = inspectRead.signal;
      publish({ inspecting: true, inspected: false, inspection: null });
      try {
        let inspection: Transfer[];
        if (kind === "create") inspection = (await clients.transfers.listTransfers({ from: input.date, to: input.date, accountId: input.sourceAccountId, limit: 100 }, { signal })).data;
        else { try { inspection = [await clients.transfers.getTransfer(id!, { signal })]; } catch (e) { if ((e as { code?: string }).code !== "NOT_FOUND") throw e; inspection = []; } }
        if (life !== lifetime || current !== inspectionGeneration) return false;
        const results = await Promise.allSettled([refreshBalances(), loadOptions(), refresh()]);
        if (life !== lifetime || current !== inspectionGeneration) return false;
        const success = results.every(r => r.status === "fulfilled" && r.value);
        publish({ inspecting: false, inspection, inspected: success, ...(!success ? { notice: "Activity checked, but balances or choices could not refresh. Retry the reads." } : {}) }); return success;
      } catch (error) {
        if (life !== lifetime || current !== inspectionGeneration) return false;
        if (authFailure(error)) { clearAuth(); return false; }
        publish({ inspecting: false, notice: "The latest activity could not be checked. Retry the read before considering another change." }); return false;
      }
    },
    async mutate(operation: (options: { signal: AbortSignal }) => Promise<unknown>, kind: Kind): Promise<boolean> {
      if (state.pending || state.authError || state.mutationError?.uncertain || state.inspecting) return false;
      const life = lifetime; write = new AbortController(); publish({ pending: true, mutationError: null, notice: null, inspection: null, inspected: false });
      try { await operation({ signal: write.signal }); }
      catch (error) {
        if (life !== lifetime) return false;
        if (authFailure(error)) { clearAuth(); return false; }
        const e = error as { uncertain?: boolean; code?: string; message?: string; details?: { field: string; message: string }[] };
        const fields = Object.fromEntries((e.details ?? []).filter(d => ["sourceAccountId", "destinationAccountId", "amount", "date", "description"].includes(d.field)).map(d => [d.field, d.message]));
        const message = e.uncertain ? "We could not confirm whether this transfer change was saved. Check activity and refresh accounts before deciding to try again." : e.code === "ACCOUNT_ARCHIVED" ? "An account is now archived. Refresh choices and choose active accounts, or restore the account." : e.code === "NOT_FOUND" ? "This transfer or an account is unavailable. Refresh accounts and activity." : e.message ?? "The transfer could not be saved. Your draft is preserved.";
        publish({ pending: false, mutationError: { message, fields, uncertain: !!e.uncertain } }); return false;
      }
      if (life !== lifetime) return false;
      const notice = `Transfer ${kind === "create" ? "saved" : kind === "edit" ? "updated" : "deleted"}.`;
      publish({ notice, cursor: null, history: [] });
      const results = await Promise.allSettled([refreshBalances(), loadOptions(), refresh()]);
      if (life !== lifetime || state.authError) return false;
      const success = results.every(r => r.status === "fulfilled" && r.value);
      publish({ pending: false, notice: success ? notice : notice + " Account balances or history could not refresh. Retry only the reads." }); return true;
    },
  };
  return store;
}

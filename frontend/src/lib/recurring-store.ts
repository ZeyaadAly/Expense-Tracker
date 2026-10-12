import type { Account, createAccountClient } from "./api/accounts";
import type { Category, createCategoryClient } from "./api/categories";
import type { Recurring, RecurringQuery, Upcoming, createRecurringClient } from "./api/recurring";

type Failure = { message: string; fields: Record<string, string>; uncertain: boolean; code?: string };
type State = {
  query: RecurringQuery; rows: Recurring[] | null; upcoming: Upcoming | null;
  loading: boolean; upcomingLoading: boolean; error: string | null; upcomingError: string | null;
  accounts: Account[] | null; categories: Category[] | null; optionsLoading: boolean; optionsError: string | null;
  pending: boolean; authError: boolean; mutationError: Failure | null; notice: string | null;
  resource: Recurring | null; resourceLoading: boolean; resourceError: string | null;
  inspection: Recurring[] | null; inspecting: boolean;
};
type Clients = { recurring: ReturnType<typeof createRecurringClient>; accounts: ReturnType<typeof createAccountClient>; categories: ReturnType<typeof createCategoryClient> };
const authFailure = (e: unknown) => { const v = e as { status?: number; code?: string }; return v.status === 401 || ["AUTH_REQUIRED", "AUTH_INVALID"].includes(v.code ?? ""); };
export function createRecurringStore(clients: Clients) {
  const initial: State = { query: {}, rows: null, upcoming: null, loading: true, upcomingLoading: true, error: null, upcomingError: null, accounts: null, categories: null, optionsLoading: true, optionsError: null, pending: false, authError: false, mutationError: null, notice: null, resource: null, resourceLoading: false, resourceError: null, inspection: null, inspecting: false };
  let state = initial, lifetime = 0;
  const listeners = new Set<() => void>();
  const reads = new Map<string, AbortController>();
  let write: AbortController | undefined;
  const publish = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const cancel = () => { lifetime++; reads.forEach(c => c.abort()); reads.clear(); write?.abort(); };
  const clearAuth = () => { cancel(); publish({ ...initial, loading: false, upcomingLoading: false, optionsLoading: false, authError: true }); };
  async function read<T>(key: string, operation: (signal: AbortSignal) => Promise<T>, start: Partial<State>, success: (value: T) => Partial<State>, failure: Partial<State>): Promise<boolean> {
    if (state.authError) return false;
    const life = lifetime, controller = new AbortController();
    reads.get(key)?.abort(); reads.set(key, controller); publish(start);
    try {
      const value = await operation(controller.signal);
      if (life !== lifetime || reads.get(key) !== controller) return false;
      publish(success(value)); return true;
    } catch (error) {
      if (life !== lifetime || reads.get(key) !== controller) return false;
      if (authFailure(error)) clearAuth(); else publish(failure);
      return false;
    }
  }
  const refreshList = () => read("list", signal => clients.recurring.listRecurring({ ...state.query }, { signal }), { loading: true, error: null }, rows => ({ rows, loading: false }), { loading: false, error: "Recurring items could not refresh. Last loaded items are retained where available." });
  const refreshUpcoming = () => read("upcoming", signal => clients.recurring.getUpcomingRecurring(30, { signal }), { upcomingLoading: true, upcomingError: null }, upcoming => ({ upcoming, upcomingLoading: false }), { upcomingLoading: false, upcomingError: "Upcoming occurrences could not refresh. Retry this read." });
  const loadOptions = () => read("options", async signal => {
    const values = await Promise.allSettled([clients.accounts.listAccounts("active", { signal }), clients.accounts.listAccounts("archived", { signal }), clients.categories.listCategories("active", { signal }), clients.categories.listCategories("archived", { signal })]);
    const errors = values.filter(v => v.status === "rejected").map(v => (v as PromiseRejectedResult).reason);
    if (errors.length) throw errors.find(authFailure) ?? errors[0];
    const [active, archived, categories, historical] = values.map(v => (v as PromiseFulfilledResult<unknown>).value);
    return { accounts: [...new Map([...(active as Account[]), ...(archived as Account[])].map(r => [r.id, r])).values()], categories: [...new Map([...(categories as Category[]), ...(historical as Category[])].map(r => [r.id, r])).values()] };
  }, { optionsLoading: true, optionsError: null }, choices => ({ ...choices, optionsLoading: false }), { optionsLoading: false, optionsError: "Account and category choices could not refresh. Refresh choices before saving." });
  const refresh = async () => (await Promise.all([refreshList(), refreshUpcoming()])).every(Boolean);
  const store = {
    getSnapshot: () => state, getServerSnapshot: () => initial,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start() { void refresh(); void loadOptions(); return () => { cancel(); state = initial; }; },
    refresh, refreshList, refreshUpcoming, loadOptions,
    setQuery(patch: RecurringQuery) { if (state.pending || state.authError) return; publish({ query: { ...state.query, ...patch } }); void refreshList(); },
    clearFilters() { if (state.pending || state.authError) return; publish({ query: {} }); void refreshList(); },
    clearAction() { if (state.pending || state.inspecting) return; reads.get("resource")?.abort(); reads.delete("resource"); reads.get("inspection")?.abort(); reads.delete("inspection"); publish({ mutationError: null, resource: null, resourceError: null, resourceLoading: false, inspection: null }); },
    loadResource(id: string) { return read("resource", signal => clients.recurring.getRecurring(id, { signal }), { resource: null, resourceLoading: true, resourceError: null }, resource => ({ resource, resourceLoading: false }), { resourceLoading: false, resourceError: "This recurring item is unavailable or could not load. Refresh to check again." }); },
    async inspect(id?: string) {
      const checked = await read("inspection", async signal => {
        if (!id) return clients.recurring.listRecurring({}, { signal });
        try { return [await clients.recurring.getRecurring(id, { signal })]; }
        catch (error) { if ((error as { code?: string }).code === "NOT_FOUND") return []; throw error; }
      }, { inspecting: true, inspection: null }, inspection => ({ inspection, inspecting: false }), { inspecting: false, notice: "The latest recurring items could not be checked. Retry the read." });
      if (checked) await Promise.all([refresh(), loadOptions()]);
      return checked;
    },
    async mutate(operation: (options: { signal: AbortSignal }) => Promise<Recurring>): Promise<boolean> {
      if (state.pending || state.authError || state.mutationError?.uncertain || state.inspecting) return false;
      const life = lifetime; write = new AbortController(); publish({ pending: true, mutationError: null, notice: null });
      try { await operation({ signal: write.signal }); }
      catch (error) {
        if (life !== lifetime) return false;
        if (authFailure(error)) { clearAuth(); return false; }
        const e = error as { code?: string; message?: string; uncertain?: boolean; details?: { field: string; message: string }[] };
        const fields = Object.fromEntries((e.details ?? []).filter(d => ["type", "accountId", "categoryId", "amount", "description", "frequency", "startDate", "endDate"].includes(d.field)).map(d => [d.field, d.message]));
        const message = e.uncertain ? "We could not confirm whether this change was saved. Refresh and inspect recurring items before considering another change." :
          e.code === "ACCOUNT_ARCHIVED" ? "The account is archived. Restore it on Accounts or choose an active account when editing." :
          e.code === "CATEGORY_ARCHIVED" ? "The category is archived. Restore it or choose an active compatible category when editing." :
          e.code === "NOT_FOUND" ? "This recurring item or a referenced resource is unavailable. Refresh to check." :
          e.code === "CONFLICT" ? "This schedule has changed or is archived. Refresh to check its current status." : e.message ?? "The change could not be saved. Your draft is preserved.";
        publish({ pending: false, mutationError: { message, fields, uncertain: !!e.uncertain, code: e.code } }); return false;
      }
      if (life !== lifetime) return false;
      const refreshed = await refresh();
      if (life !== lifetime || state.authError) return false;
      publish({ pending: false, notice: refreshed ? "Recurring item saved." : "Saved, but recurring items could not refresh. Retry only the reads." }); return true;
    },
  };
  return store;
}

import type { Account, createAccountClient } from "./api/accounts";
import type { Category, createCategoryClient } from "./api/categories";
import type { Transaction, TransactionQuery, TransactionPage, createTransactionClient } from "./api/v2-transactions";

type Failure = { message: string; uncertain: boolean; fields: Record<string, string>; code?: string };
type State = {
  query: TransactionQuery;
  cursor: string | null;
  history: (string | null)[];
  rows: Transaction[] | null;
  meta: TransactionPage["meta"] | null;
  loading: boolean;
  error: string | null;
  fields: Record<string, string>;
  authError: boolean;
  accounts: Account[] | null;
  categories: Category[] | null;
  optionsLoading: boolean;
  optionsError: string | null;
  pending: boolean;
  mutationError: Failure | null;
  notice: string | null;
};
type Clients = {
  transactions: ReturnType<typeof createTransactionClient>;
  accounts: ReturnType<typeof createAccountClient>;
  categories: ReturnType<typeof createCategoryClient>;
};
const authFailure = (error: unknown) => {
  const e = error as { status?: number; code?: string };
  return e.status === 401 || ["AUTH_REQUIRED", "AUTH_INVALID"].includes(e.code ?? "");
};
const fields = (error: unknown) =>
  Object.fromEntries(
    ((error as { details?: { field: string; message: string }[] }).details ?? [])
      .filter((d) =>
        ["q", "type", "accountId", "categoryId", "amount", "date", "description", "from", "to", "recurring"].includes(
          d.field,
        ),
      )
      .map((d) => [d.field, d.message]),
  );
export const hasTransactionFilters = (query: TransactionQuery) =>
  Object.entries(query).some(([key, value]) => !["limit", "cursor"].includes(key) && !!value);

export function createTransactionsStore(clients: Clients, initialQuery: TransactionQuery = {}) {
  const initial: State = {
    query: { ...initialQuery, limit: 25, cursor: undefined },
    cursor: null,
    history: [],
    rows: null,
    meta: null,
    loading: true,
    error: null,
    fields: {},
    authError: false,
    accounts: null,
    categories: null,
    optionsLoading: true,
    optionsError: null,
    pending: false,
    mutationError: null,
    notice: null,
  };
  let state = initial,
    lifetime = 0,
    generation = 0,
    optionGeneration = 0;
  let read: AbortController | undefined, optionsRead: AbortController | undefined, write: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };
  const clearAuth = () => {
    generation++;
    optionGeneration++;
    read?.abort();
    optionsRead?.abort();
    write?.abort();
    publish({
      rows: null,
      meta: null,
      accounts: null,
      categories: null,
      cursor: null,
      history: [],
      loading: false,
      optionsLoading: false,
      pending: false,
      authError: true,
      mutationError: null,
    });
  };
  async function refresh(recoverCursor = true): Promise<boolean> {
    const life = lifetime,
      current = ++generation;
    read?.abort();
    const controller = new AbortController();
    read = controller;
    const query = { ...state.query, cursor: state.cursor ?? undefined };
    publish({ loading: true, error: null, fields: {} });
    try {
      const page = await clients.transactions.listTransactions(query, { signal: controller.signal });
      if (life !== lifetime || current !== generation) return false;
      // A mutation/concurrent delete may remove the last row of a continuation.
      if (!page.data.length && state.history.length) {
        const history = state.history.slice(0, -1);
        publish({ cursor: state.history.at(-1) ?? null, history });
        return refresh(false);
      }
      publish({ rows: page.data, meta: page.meta, loading: false, error: null });
      return true;
    } catch (error) {
      if (life !== lifetime || current !== generation) return false;
      if (authFailure(error)) {
        clearAuth();
        return false;
      }
      const e = error as { code?: string; details?: { field: string }[] };
      if (
        recoverCursor &&
        query.cursor &&
        e.code === "VALIDATION_ERROR" &&
        e.details?.some((d) => d.field === "cursor")
      ) {
        publish({
          cursor: null,
          history: [],
          notice: "Pagination expired or changed. Showing the first page with your filters preserved.",
        });
        return refresh(false);
      }
      publish({
        loading: false,
        error:
          "Transactions could not refresh. Last loaded rows are retained where available. Retry the read or adjust your filters.",
        fields: fields(error),
      });
      return false;
    }
  }
  async function loadOptions(): Promise<boolean> {
    const life = lifetime,
      current = ++optionGeneration;
    optionsRead?.abort();
    optionsRead = new AbortController();
    publish({ optionsLoading: true, optionsError: null });
    const options = { signal: optionsRead.signal };
    const results = await Promise.allSettled([
      clients.accounts.listAccounts("active", options),
      clients.accounts.listAccounts("archived", options),
      clients.categories.listCategories("active", options),
      clients.categories.listCategories("archived", options),
    ]);
    if (life !== lifetime || current !== optionGeneration) return false;
    if (results.some((r) => r.status === "rejected" && authFailure(r.reason))) {
      clearAuth();
      return false;
    }
    if (results.some((r) => r.status === "rejected")) {
      publish({
        optionsLoading: false,
        optionsError:
          "Account and category choices could not load. Retry choices before adding or editing a transaction.",
      });
      return false;
    }
    const [active, archived, categories, historical] = results.map((r) => (r as PromiseFulfilledResult<unknown>).value);
    publish({
      optionsLoading: false,
      accounts: [...(active as Account[]), ...(archived as Account[])],
      categories: [...(categories as Category[]), ...(historical as Category[])],
    });
    return true;
  }
  async function isVisible(id: string, signal: AbortSignal): Promise<boolean> {
    // Ask the authoritative filtered list; never recreate SQL search semantics in JS.
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await clients.transactions.listTransactions({ ...state.query, limit: 100, cursor }, { signal });
      if (page.data.some((row) => row.id === id)) return true;
      cursor = page.meta.nextCursor ?? undefined;
      if (cursor && seen.has(cursor)) throw new Error("Invalid continuation");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return false;
  }
  const store = {
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start: () => {
      void refresh();
      void loadOptions();
      return () => {
        lifetime++;
        generation++;
        optionGeneration++;
        read?.abort();
        optionsRead?.abort();
        write?.abort();
        state = initial;
      };
    },
    refresh,
    loadOptions,
    setQuery(patch: Partial<TransactionQuery>) {
      if (state.pending || state.authError) return;
      const query = { ...state.query, ...patch, cursor: undefined };
      if (query.q !== undefined) query.q = query.q.trim() || undefined;
      publish({ query, cursor: null, history: [], notice: null });
      void refresh();
    },
    clearFilters() {
      if (state.pending) return;
      publish({ query: { limit: state.query.limit ?? 25 }, cursor: null, history: [], notice: null });
      void refresh();
    },
    next() {
      if (state.loading || state.pending || state.error || !state.meta?.nextCursor) return;
      publish({ history: [...state.history, state.cursor], cursor: state.meta.nextCursor });
      void refresh();
    },
    previous() {
      if (state.loading || state.pending || !state.history.length) return;
      publish({ cursor: state.history.at(-1) ?? null, history: state.history.slice(0, -1) });
      void refresh();
    },
    clearMutation() {
      if (!state.pending) publish({ mutationError: null });
    },
    async mutate(
      operation: (options: { signal: AbortSignal }) => Promise<Transaction | void>,
      kind: "create" | "edit" | "delete",
    ): Promise<boolean> {
      if (state.pending || state.authError || state.mutationError?.uncertain) return false;
      const life = lifetime;
      write = new AbortController();
      publish({ pending: true, mutationError: null, notice: null });
      let result: Transaction | void;
      try {
        result = await operation({ signal: write.signal });
      } catch (error) {
        if (life !== lifetime) return false;
        if (authFailure(error)) {
          clearAuth();
          return false;
        }
        const e = error as { code?: string; uncertain?: boolean; message?: string };
        const message = e.uncertain
          ? "We could not confirm whether this change was saved. Keep your draft and refresh transactions to inspect the current state before trying again."
          : e.code === "NOT_FOUND"
            ? "This transaction or one of its choices is no longer available. Refresh transactions and choices, or close this dialog."
            : e.code === "ACCOUNT_ARCHIVED"
              ? "This account is archived. Choose an active account or restore it on Accounts."
              : e.code === "CATEGORY_ARCHIVED"
                ? "This category is archived. Choose an active category before saving."
                : (e.message ?? "The change could not be saved. Your draft is preserved.");
        publish({
          pending: false,
          mutationError: { message, uncertain: !!e.uncertain, fields: fields(error), code: e.code },
        });
        return false;
      }
      if (life !== lifetime) return false;
      const saved = `Transaction ${kind === "create" ? "created" : kind === "edit" ? "updated" : "deleted"}.`;
      publish({ notice: saved, ...(kind === "create" ? { cursor: null, history: [] } : {}) });
      const refreshed = await refresh();
      if (life !== lifetime || state.authError) return false;
      let notice = refreshed ? saved : saved + " The list could not refresh. Retry only the read.";
      if (refreshed && result && hasTransactionFilters(state.query)) {
        try {
          if (!(await isVisible(result.id, write.signal))) notice = saved + " It is hidden by the current filters.";
        } catch (error) {
          if (authFailure(error)) {
            clearAuth();
            return false;
          }
          notice = saved + " Visibility under the current filters could not be checked. Refresh transactions to check.";
        }
      }
      if (life !== lifetime || state.authError) return false;
      publish({ pending: false, notice });
      return true;
    },
  };
  return store;
}

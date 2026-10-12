"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { createAccountClient } from "../../lib/api/accounts";
import { createCategoryClient } from "../../lib/api/categories";
import {
  cairoToday,
  createTransactionClient,
  validateTransactionInput,
  type Transaction,
  type TransactionInput,
  type TransactionQuery,
} from "../../lib/api/v2-transactions";
import { createTransactionsStore, hasTransactionFilters } from "../../lib/transactions-store";
import { PageHeader } from "../../components/v2/app-shell";
import {
  MoneyDisplay,
  TransactionCard,
  TransactionRow,
  TransactionTableHeader,
  type TransactionFixture,
} from "../../components/v2/finance";
import {
  Button,
  DateInput,
  DialogShell,
  Drawer,
  EmptyState,
  ErrorState,
  FeedbackBanner,
  FormField,
  MoneyInput,
  Select,
  Skeleton,
  StaleIndicator,
  Textarea,
} from "../../components/v2/primitives";
import { ClearFilters, FilterChip, SearchBar } from "../../components/v2/forms";
import { PrototypeShell } from "./shell";

type Store = ReturnType<typeof createTransactionsStore>;
type State = ReturnType<Store["getSnapshot"]>;
type Action = { kind: "create" | "edit" | "delete"; row?: Transaction };
const labels: Record<string, string> = {
  income: "Income",
  expense: "Expense",
  manual: "Manual",
  generated: "Generated",
  accountId: "Account",
  categoryId: "Category",
  from: "From date",
  to: "To date",
  q: "Search",
  type: "Type",
  recurring: "Recurring",
};
export function TransactionsPage() {
  const { user } = useAuth();
  return user ? <ConnectedTransactions key={user.id} userId={user.id} /> : null;
}
function ConnectedTransactions({ userId }: { userId: string }) {
  const { invalidateSession, signOut } = useAuth();
  const [clients] = useState(() => ({
    transactions: createTransactionClient(userId),
    accounts: createAccountClient(userId),
    categories: createCategoryClient(userId),
  }));
  const [store] = useState(() => createTransactionsStore(clients));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [action, setAction] = useState<Action | null>(null),
    [search, setSearch] = useState(""),
    [filtersOpen, setFiltersOpen] = useState(false);
  const pageId = useId();
  const navigationFocus = useRef<"next" | "previous" | null>(null);
  useEffect(() => store.start(), [store]);
  useEffect(() => {
    if (state.authError) {
      invalidateSession();
      void signOut();
    }
  }, [state.authError, invalidateSession, signOut]);
  useEffect(() => {
    if (state.loading || state.pending || !navigationFocus.current) return;
    const direction = navigationFocus.current;
    navigationFocus.current = null;
    const target = document.getElementById(`${pageId}-${direction}`) as HTMLButtonElement | null;
    const fallback = document.getElementById(
      `${pageId}-${direction === "next" ? "previous" : "next"}`,
    ) as HTMLButtonElement | null;
    (target && !target.disabled
      ? target
      : fallback && !fallback.disabled
        ? fallback
        : document.getElementById(`${pageId}-pagination`)
    )?.focus();
  }, [state.loading, state.pending, pageId]);
  if (state.authError) return null;
  const open = (next: Action) => {
    store.clearMutation();
    setAction(next);
  };
  const close = () => {
    if (state.pending) return;
    setAction(null);
    store.clearMutation();
    requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body)
        document.getElementById(`${pageId}-add`)?.focus();
    });
  };
  const clear = () => {
    setSearch("");
    store.clearFilters();
  };
  const change = (key: keyof TransactionQuery, value: string) => store.setQuery({ [key]: value || undefined });
  const choiceName = (key: string, value: string) =>
    key === "accountId"
      ? (state.accounts?.find((r) => r.id === value)?.name ?? "Selected account")
      : key === "categoryId"
        ? (state.categories?.find((r) => r.id === value)?.name ?? "Selected category")
        : (labels[value] ?? value);
  const fixture = (row: Transaction): TransactionFixture => ({
    id: row.id,
    date: row.date,
    description: row.description,
    type: row.type,
    amount: row.amount,
    account: row.accountName,
    category: row.categoryName,
    generated: row.recurringTransactionId !== null,
    historical:
      state.accounts?.some((a) => a.id === row.accountId && a.status === "archived") ||
      state.categories?.some((c) => c.id === row.categoryId && c.status === "archived"),
  });
  const filtered = hasTransactionFilters(state.query);
  return (
    <PrototypeShell liveTransactions>
      <PageHeader
        title="Transactions"
        description="Every movement, with its place in the story."
        actions={
          <>
            <Button variant="secondary" disabled={state.loading || state.pending} onClick={() => void store.refresh()}>
              Refresh transactions
            </Button>
            <Button
              id={`${pageId}-add`}
              disabled={state.pending || state.optionsLoading || !!state.optionsError}
              onClick={() => open({ kind: "create" })}
            >
              Add transaction
            </Button>
          </>
        }
      />
      {state.notice && <FeedbackBanner tone={state.error ? "warning" : "success"} title={state.notice} />}
      {state.optionsError && (
        <ErrorState
          title="Choices could not load"
          description={state.optionsError}
          onRetry={() => void store.loadOptions()}
        />
      )}
      {state.error && (
        <ErrorState
          title="Transactions could not refresh"
          description={state.error}
          onRetry={() => void store.refresh()}
        />
      )}
      {state.error && state.rows && <StaleIndicator />}
      <section className="p4-panel transactions-connected">
        <SearchBar
          value={search}
          onChange={setSearch}
          onSearch={() => {
            if (!state.pending) store.setQuery({ q: search });
          }}
          pending={state.pending}
        />
        {state.fields.q && <p role="alert">{state.fields.q}</p>}
        <Button
          id={`${pageId}-filters`}
          className="t25-mobile-filters"
          variant="secondary"
          disabled={state.pending}
          onClick={() => setFiltersOpen(true)}
        >
          Filters
        </Button>
        <div className="t25-desktop-filters">
          <TransactionFilters state={state} change={change} />
        </div>
        <div className="v2-actions">
          {Object.entries(state.query)
            .filter(([key, value]) => !["limit", "cursor"].includes(key) && !!value)
            .map(([key, value]) => (
              <FilterChip
                key={key}
                label={`${labels[key]}: ${choiceName(key, String(value))}`}
                onRemove={() => {
                  if (state.pending) return;
                  if (key === "q") setSearch("");
                  store.setQuery({ [key]: undefined });
                }}
              />
            ))}
          {filtered && <ClearFilters onClick={clear} />}
        </div>
      </section>
      <p className="v2-sr-only" role="status" aria-live="polite">
        {state.loading
          ? "Loading transactions…"
          : state.error
            ? "Transactions could not refresh."
            : `${state.rows?.length ?? 0} transactions on this page.`}
      </p>
      {state.loading && (
        <p className="v2-helper">Loading transactions…{state.rows ? " Last loaded rows remain visible." : ""}</p>
      )}
      {state.rows === null ? (
        state.loading ? (
          <Skeleton variant="transaction" />
        ) : null
      ) : state.rows.length === 0 && !state.loading && !state.error ? (
        <EmptyState
          title={filtered ? "No transactions match these filters." : "No transactions yet."}
          description={
            filtered
              ? "Clear your filters to see recorded transactions."
              : "Record income or an expense to start your ledger."
          }
          action={
            filtered ? (
              <Button onClick={clear}>Clear filters</Button>
            ) : (
              <Button disabled={state.optionsLoading || !!state.optionsError} onClick={() => open({ kind: "create" })}>
                Add your first transaction
              </Button>
            )
          }
        />
      ) : (
        <div inert={state.loading || state.pending || !!state.error} aria-busy={state.loading}>
          <div className="v2-ledger-desktop">
            <table className="v2-ledger">
              <caption>Recorded income and expenses</caption>
              <TransactionTableHeader />
              <tbody>
                {state.rows.map((row) => (
                  <TransactionRow
                    key={row.id}
                    transaction={fixture(row)}
                    onEdit={() => open({ kind: "edit", row })}
                    onDelete={() => open({ kind: "delete", row })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="v2-ledger-mobile">
            {state.rows.map((row) => (
              <TransactionCard
                key={row.id}
                transaction={fixture(row)}
                onEdit={() => open({ kind: "edit", row })}
                onDelete={() => open({ kind: "delete", row })}
              />
            ))}
          </div>
        </div>
      )}
      <nav id={`${pageId}-pagination`} tabIndex={-1} className="v2-pagination" aria-label="Transaction pagination">
        <Button
          id={`${pageId}-previous`}
          variant="secondary"
          disabled={state.loading || state.pending || !state.history.length}
          onClick={() => {
            navigationFocus.current = "previous";
            store.previous();
          }}
        >
          Previous
        </Button>
        <span>Page {state.history.length + 1}</span>
        <Button
          id={`${pageId}-next`}
          variant="secondary"
          disabled={state.loading || state.pending || !!state.error || !state.meta?.hasMore}
          onClick={() => {
            navigationFocus.current = "next";
            store.next();
          }}
        >
          Next
        </Button>
      </nav>
      {filtersOpen && (
        <Drawer
          title="Transaction filters"
          description="Combine filters to narrow recorded income and expenses."
          onClose={() => {
            setFiltersOpen(false);
            requestAnimationFrame(() => document.getElementById(`${pageId}-filters`)?.focus());
          }}
        >
          <TransactionFilters state={state} change={change} />
          <Button onClick={() => setFiltersOpen(false)}>Done</Button>
        </Drawer>
      )}
      {action && (
        <TransactionDialog
          key={action.kind + action.row?.id}
          action={action}
          state={state}
          store={store}
          client={clients.transactions}
          close={close}
        />
      )}
    </PrototypeShell>
  );
}
function TransactionFilters({
  state,
  change,
}: {
  state: State;
  change: (key: keyof TransactionQuery, value: string) => void;
}) {
  const prefix = useId();
  const options: {
    key: "type" | "accountId" | "categoryId" | "recurring";
    items: { value: string; label: string }[];
  }[] = [
    {
      key: "type",
      items: [
        { value: "income", label: "Income" },
        { value: "expense", label: "Expense" },
      ],
    },
    {
      key: "accountId",
      items: (state.accounts ?? []).map((a) => ({
        value: a.id,
        label: a.name + (a.status === "archived" ? " (Archived)" : ""),
      })),
    },
    {
      key: "categoryId",
      items: (state.categories ?? []).map((c) => ({
        value: c.id,
        label: c.name + (c.status === "archived" ? " (Archived)" : ""),
      })),
    },
    {
      key: "recurring",
      items: [
        { value: "manual", label: "Manual" },
        { value: "generated", label: "Generated" },
      ],
    },
  ];
  return (
    <div className="p4-filters">
      {options.map(({ key, items }) => (
        <FormField key={key} id={`${prefix}-${key}`} label={labels[key]} error={state.fields[key]}>
          <Select
            id={`${prefix}-${key}`}
            value={state.query[key] ?? ""}
            disabled={
              state.pending ||
              (["accountId", "categoryId"].includes(key) && (state.optionsLoading || !!state.optionsError))
            }
            aria-invalid={!!state.fields[key]}
            aria-describedby={state.fields[key] ? `${prefix}-${key}-error` : undefined}
            onChange={(e) => change(key, e.target.value)}
          >
            <option value="">All</option>
            {items.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
        </FormField>
      ))}
      {(["from", "to"] as const).map((key) => (
        <FormField key={key} id={`${prefix}-${key}`} label={labels[key]} error={state.fields[key]}>
          <DateInput
            id={`${prefix}-${key}`}
            value={state.query[key] ?? ""}
            disabled={state.pending}
            aria-invalid={!!state.fields[key]}
            aria-describedby={state.fields[key] ? `${prefix}-${key}-error` : undefined}
            onChange={(e) => change(key, e.target.value)}
          />
        </FormField>
      ))}
    </div>
  );
}
function TransactionDialog({
  action,
  state,
  store,
  client,
  close,
}: {
  action: Action;
  state: State;
  store: Store;
  client: ReturnType<typeof createTransactionClient>;
  close: () => void;
}) {
  const prefix = useId(),
    row = action.row,
    form = action.kind !== "delete";
  const [draft, setDraft] = useState<TransactionInput>(() => ({
    type: row?.type ?? "expense",
    accountId: row?.accountId ?? state.accounts?.find((a) => a.status === "active")?.id ?? "",
    categoryId: row?.categoryId ?? "",
    amount: row?.amount ?? "",
    date: row?.date ?? cairoToday(),
    description: row?.description ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitting = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const accounts = (state.accounts ?? []).filter((a) => a.status === "active"),
    categories = (state.categories ?? []).filter(
      (c) => c.status === "active" && (c.kind === draft.type || c.kind === "both"),
    );
  const allErrors = { ...errors, ...state.mutationError?.fields };
  const focus = (fields: Record<string, string>) => {
    const name = ["type", "accountId", "amount", "categoryId", "date", "description"].find((k) => fields[k]);
    if (name)
      setTimeout(() => {
        if (mounted.current) document.getElementById(`${prefix}-${name}`)?.focus();
      }, 0);
  };
  const locked = state.pending || state.mutationError?.uncertain || state.mutationError?.code === "NOT_FOUND";
  async function submit() {
    if (submitting.current || locked || (form && (state.optionsLoading || !!state.optionsError))) return;
    const next = form ? validateTransactionInput(draft) : {};
    if (form && !accounts.some((a) => a.id === draft.accountId))
      next.accountId = "Choose an active account. Restore the historical account on Accounts if needed.";
    if (form && !categories.some((c) => c.id === draft.categoryId))
      next.categoryId = "Choose an active category compatible with this type.";
    setErrors(next);
    if (Object.keys(next).length) {
      focus(next);
      return;
    }
    submitting.current = true;
    const success = await store.mutate(
      (options) =>
        action.kind === "create"
          ? client.createTransaction(draft, options)
          : action.kind === "edit"
            ? client.updateTransaction(row!.id, draft, options)
            : client.deleteTransaction(row!.id, options),
      action.kind,
    );
    submitting.current = false;
    if (!mounted.current) return;
    if (success) close();
    else focus(store.getSnapshot().mutationError?.fields ?? {});
  }
  const title =
    action.kind === "create" ? "Add transaction" : action.kind === "edit" ? "Edit transaction" : "Delete transaction?";
  const props = (key: keyof TransactionInput) => ({
    id: `${prefix}-${key}`,
    name: key,
    value: draft[key],
    disabled: state.pending,
    "aria-invalid": !!allErrors[key],
    "aria-describedby": allErrors[key] ? `${prefix}-${key}-error` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setDraft({ ...draft, [key]: e.target.value }),
  });
  return (
    <DialogShell
      title={title}
      description={
        form
          ? "Record posted income or expenses in EGP. Dates follow Africa/Cairo."
          : "This removes the recorded transaction and updates its account balance. A generated transaction's schedule is kept."
      }
      state={state.pending ? "pending" : "default"}
      onClose={close}
    >
      {state.mutationError && (
        <FeedbackBanner
          tone={state.mutationError.uncertain ? "warning" : "error"}
          title={state.mutationError.message}
        />
      )}
      {form ? (
        <form
          className="v2-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FormField id={`${prefix}-type`} label="Type" required error={allErrors.type}>
            <Select
              {...props("type")}
              data-initial-focus
              onChange={(e) => {
                const type = e.target.value as TransactionInput["type"];
                setDraft({
                  ...draft,
                  type,
                  categoryId: state.categories?.some(
                    (c) => c.id === draft.categoryId && c.status === "active" && (c.kind === type || c.kind === "both"),
                  )
                    ? draft.categoryId
                    : "",
                });
              }}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </FormField>
          <FormField id={`${prefix}-accountId`} label="Account" required error={allErrors.accountId}>
            <Select {...props("accountId")}>
              <option value="">Choose account</option>
              {row && !accounts.some((a) => a.id === row.accountId) && (
                <option value={row.accountId} disabled>
                  {row.accountName} (Archived or unavailable)
                </option>
              )}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </FormField>
          {!accounts.length && (
            <p>
              No active accounts. <Link href="/v2/accounts">Add or restore an account</Link> before saving.
            </p>
          )}
          <FormField id={`${prefix}-amount`} label="Amount" required error={allErrors.amount}>
            <MoneyInput {...props("amount")} />
          </FormField>
          <FormField id={`${prefix}-categoryId`} label="Category" required error={allErrors.categoryId}>
            <Select {...props("categoryId")}>
              <option value="">Choose category</option>
              {row && draft.categoryId === row.categoryId && !categories.some((c) => c.id === row.categoryId) && (
                <option value={row.categoryId} disabled>
                  {row.categoryName} (Archived or incompatible)
                </option>
              )}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id={`${prefix}-date`} label="Date" required error={allErrors.date}>
            <DateInput {...props("date")} min="1900-01-01" max={cairoToday()} />
          </FormField>
          <FormField id={`${prefix}-description`} label="Description" required error={allErrors.description}>
            <Textarea {...props("description")} rows={3} />
          </FormField>
          {row?.recurringTransactionId && (
            <p className="v2-helper">
              Generated transaction. Editing this posting keeps its recurring identity and schedule.
            </p>
          )}
          <div className="v2-actions">
            <Button variant="secondary" disabled={state.pending} onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={state.pending}
              disabled={!!locked || state.optionsLoading || !!state.optionsError}
            >
              Save transaction
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p>
            <strong>{row!.description}</strong>
          </p>
          <p>
            {row!.date} · {row!.accountName} · {row!.categoryName} · {labels[row!.type]}
          </p>
          <MoneyDisplay value={row!.amount} kind={row!.type} />
          <div className="v2-actions">
            <Button data-initial-focus variant="secondary" disabled={state.pending} onClick={close}>
              Cancel
            </Button>
            <Button variant="danger" loading={state.pending} disabled={!!locked} onClick={() => void submit()}>
              Delete transaction
            </Button>
          </div>
        </>
      )}
      {state.mutationError && (
        <Button
          variant="secondary"
          disabled={state.loading || state.pending}
          onClick={async () => {
            await store.refresh();
            if (state.mutationError?.code === "NOT_FOUND") await store.loadOptions();
          }}
        >
          Refresh transactions and inspect
        </Button>
      )}
    </DialogShell>
  );
}

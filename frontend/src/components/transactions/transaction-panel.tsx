import type { Filters, Transaction } from "@/lib/transactions";
import { Button } from "../ui/button";
import { EmptyState, ErrorState, LoadingState } from "../ui/feedback";
import { FilterBar } from "./filter-bar";
import { TransactionList } from "./transaction-list";

export function TransactionPanel({ transactions, count, overallCount, filters, loading, updating, queryErrors, error, errorMessage, onFilterChange, onAdd, onEdit, onDelete, onRetry }: { transactions: Transaction[]; count?: number; overallCount?: number; filters: Filters; loading: boolean; updating?: boolean; queryErrors?: string[]; error: boolean; errorMessage?: string; onFilterChange: (filters: Filters) => void; onAdd: () => void; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void; onRetry: () => void }) {
  const activeFilters = filters.type !== "all" || filters.category !== "all";
  const noMatches = activeFilters && overallCount !== undefined && overallCount > 0;
  return <section aria-labelledby="transactions-heading" className="min-w-0 space-y-4 bg-surface">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="transactions-heading" tabIndex={-1} className="text-xl leading-7 font-semibold">Transactions</h2>{!loading && !error ? <p className="text-sm text-muted">{count ?? transactions.length} {(count ?? transactions.length) === 1 ? "transaction" : "transactions"}</p> : null}</div>
    <p className="text-sm leading-5 text-muted">Newest transaction dates first</p>
    <FilterBar queryErrors={queryErrors} filters={filters} onChange={onFilterChange} />
    <div aria-busy={loading}>
      {loading ? <LoadingState updating={updating ?? activeFilters} /> : error ? <ErrorState title="Transactions could not load" message={errorMessage} onRetry={onRetry} /> : transactions.length ? <TransactionList transactions={transactions} onEdit={onEdit} onDelete={onDelete} /> : <EmptyState
        title={noMatches ? "No transactions match these filters" : overallCount === 0 ? "No transactions yet" : "No transactions to display"}
        message={noMatches ? "Try another type or category." : overallCount === 0 ? "Add your first income or expense to get started." : overallCount === undefined ? "The overall summary is unavailable." : "The list and summary may be out of date. Refresh to check your transactions."}
        action={noMatches ? <Button variant="secondary" onClick={() => { onFilterChange({ type: "all", category: "all" }); document.getElementById("filter-type")?.focus(); }}>Reset Filters</Button> : overallCount === 0 ? <Button onClick={onAdd}>Add transaction</Button> : <Button variant="secondary" onClick={onRetry}>Refresh transactions</Button>}
      />}
    </div>
  </section>;
}

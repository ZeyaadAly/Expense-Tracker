import { categoriesFor, CATEGORY_LABELS, DEFAULT_FILTERS, type Category, type Filters, type TransactionType } from "@/lib/transactions";
import { Button } from "../ui/button";

export function FilterBar({ filters, onChange, queryErrors = [] }: { filters: Filters; queryErrors?: string[]; onChange: (filters: Filters) => void }) {
  return <div className="space-y-3">
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      <div className="flex min-w-0 flex-col gap-2 md:w-48">
        <label htmlFor="filter-type" className="text-sm font-medium">Type</label>
        <select id="filter-type" aria-invalid={queryErrors.includes("type") || undefined} aria-describedby={queryErrors.includes("type") ? "filter-query-error" : undefined} className="form-control" value={filters.type} onChange={(event) => {
          const type = event.target.value as TransactionType | "all";
          const category = filters.category === "all" || categoriesFor(type).includes(filters.category) ? filters.category : "all";
          onChange({ type, category });
        }}>
          <option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option>
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-2 md:w-56">
        <label htmlFor="filter-category" className="text-sm font-medium">Category</label>
        <select id="filter-category" aria-invalid={queryErrors.includes("category") || undefined} aria-describedby={queryErrors.includes("category") ? "filter-query-error" : undefined} className="form-control" value={filters.category} onChange={(event) => onChange({ ...filters, category: event.target.value as Category | "all" })}>
          <option value="all">All categories</option>{categoriesFor(filters.type).map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
        </select>
      </div>
      <Button variant="secondary" disabled={filters.type === "all" && filters.category === "all"} onClick={() => { onChange(DEFAULT_FILTERS); document.getElementById("filter-type")?.focus(); }}>Reset Filters</Button>
    </div>
    {queryErrors.length ? <p id="filter-query-error" className="text-sm text-danger">Choose a supported type and category, or reset filters.</p> : null}
    <p className="text-sm leading-5 text-muted">Filters apply to the transaction list only.</p>
  </div>;
}

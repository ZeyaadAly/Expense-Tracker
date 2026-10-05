import type { Summary } from "@/lib/transactions";
import { formatMoney } from "@/lib/transactions";
import { ErrorState, LoadingState } from "../ui/feedback";

const roleStyles = { balance: "text-foreground", income: "text-income", expense: "text-expense" };

export function SummaryCard({ label, value, role, loading = false }: { label: string; value: string; role: keyof typeof roleStyles; loading?: boolean }) {
  return <div className="flex min-h-32 min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-4 md:p-6">
    <h3 className="text-sm leading-5 font-medium text-muted">{label}</h3>
    {loading ? <LoadingState variant="value" /> : <p className={`text-[28px] leading-9 font-semibold tabular-nums wrap-anywhere ${value.startsWith("-") ? "text-danger" : roleStyles[role]}`}>{formatMoney(value)}</p>}
    <p className="text-sm leading-5 text-muted">EGP</p>
  </div>;
}

export function SummarySection({ summary, loading = false, error = false, stale = false, updating = false, staleMessage, errorMessage, onRetry }: { summary?: Summary; loading?: boolean; error?: boolean; stale?: boolean; updating?: boolean; staleMessage?: string; errorMessage?: string; onRetry: () => void }) {
  return <section aria-labelledby="summary-heading" aria-busy={loading} className="space-y-4 bg-surface">
    <h2 id="summary-heading" className="text-xl leading-7 font-semibold">Financial summary</h2>
    <p className="text-sm leading-5 text-muted">All transactions</p>
    {loading ? <p role="status" className="sr-only">Loading financial summary…</p> : null}
    {updating ? <p role="status" className="text-sm text-info">Updating…</p> : null}
    {stale ? <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm text-warning">{staleMessage ?? "Previously loaded totals; could not refresh."}</p><button className="min-h-11 rounded-control px-3 text-primary underline" onClick={onRetry}>Retry summary</button></div> : null}
    {error ? <ErrorState title="Summary unavailable" message={errorMessage} onRetry={onRetry} /> : <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3 md:gap-4 lg:gap-6">
      <SummaryCard label="Current Balance" value={summary?.balance ?? ""} role="balance" loading={loading || !summary} />
      <SummaryCard label="Total Income" value={summary?.totalIncome ?? ""} role="income" loading={loading || !summary} />
      <SummaryCard label="Total Expenses" value={summary?.totalExpenses ?? ""} role="expense" loading={loading || !summary} />
    </div>}
  </section>;
}

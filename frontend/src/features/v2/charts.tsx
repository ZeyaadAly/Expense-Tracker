import { ChartShell, MoneyDisplay } from "../../components/v2/finance";
import { analytics } from "./fixtures";
import { cents, decimal, percent } from "./money";
import type { TransactionFixture } from "../../components/v2/finance";
export function FlowChart({
  data = analytics,
  savings = false,
  title = "Income vs expenses",
}: {
  data?: typeof analytics;
  savings?: boolean;
  title?: string;
}) {
  const max = data.reduce(
    (largest, row) =>
      [
        cents(row.income),
        cents(row.expense),
        cents(row.savings) < BigInt(0)
          ? -cents(row.savings)
          : cents(row.savings),
      ].reduce(
        (maximum, value) => (value > maximum ? value : maximum),
        largest,
      ),
    BigInt(1),
  );
  return (
    <ChartShell
      title={title}
      period={`${data[0]?.label ?? ""} – ${data.at(-1)?.label ?? ""} 2026`}
      state={data.length ? "loaded" : "empty"}
      legend={
        savings
          ? [{ label: "Net savings", tone: "income" }]
          : [
              { label: "Income", tone: "income" },
              { label: "Expenses", tone: "expense" },
            ]
      }
      summary={data
        .map(
          (row) =>
            `${row.label}: income ${row.income} EGP, expenses ${row.expense} EGP, saved ${row.savings} EGP.`,
        )
        .join(" ")}
    >
      <div className="p4-bars" aria-hidden="true">
        {data.map((row) => (
          <div className="p4-bar-group" key={row.label}>
            <div className="p4-bar-pair">
              <i
                className={
                  savings && cents(row.savings) < BigInt(0)
                    ? "p4-expense-bar"
                    : undefined
                }
                style={{
                  height: `${Number(((savings && cents(row.savings) < BigInt(0) ? -cents(row.savings) : cents(savings ? row.savings : row.income)) * BigInt(100)) / max)}%`,
                }}
              />
              {!savings && (
                <i
                  className="p4-expense-bar"
                  style={{
                    height: `${Number((cents(row.expense) * BigInt(100)) / max)}%`,
                  }}
                />
              )}
            </div>
            <span>{row.label}</span>
          </div>
        ))}
      </div>
    </ChartShell>
  );
}
export function CategoryChart({
  rows: transactions,
  period,
}: {
  rows: TransactionFixture[];
  period: string;
}) {
  const expenses = transactions.filter((t) => t.type === "expense");
  const total = decimal(
    expenses.reduce((s, t) => s + cents(t.amount), BigInt(0)),
  );
  const rows = Array.from(new Set(expenses.map((t) => t.category))).map(
    (name) => {
      const amount = decimal(
        expenses
          .filter((t) => t.category === name)
          .reduce((s, t) => s + cents(t.amount), BigInt(0)),
      );
      return { name, amount, width: `${percent(amount, total)}%` };
    },
  );
  return (
    <ChartShell
      title="Spending by category"
      period={period}
      state={rows.length ? "loaded" : "empty"}
      summary={
        rows.map((r) => `${r.name}: ${r.amount} EGP (${r.width}).`).join(" ") ||
        "No recorded expenses in this period."
      }
    >
      {rows.map((row) => (
        <div className="p4-category-bar" key={row.name}>
          <div>
            <span>{row.name}</span>
            <MoneyDisplay value={row.amount} />
          </div>
          <div aria-hidden="true">
            <i style={{ width: row.width }} />
          </div>
        </div>
      ))}
    </ChartShell>
  );
}

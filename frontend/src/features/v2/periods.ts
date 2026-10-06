import type { TransactionFixture } from "../../components/v2/finance";
import { cents, decimal } from "./money";
export function periodBounds(
  range: string,
  custom: { from: string; to: string },
) {
  const starts: Record<string, string> = {
    "7 days": "2026-09-30",
    "30 days": "2026-09-07",
    "3 months": "2026-08-01",
    "6 months": "2026-05-01",
    "1 year": "2025-11-01",
  };
  return range === "Custom"
    ? custom
    : { from: starts[range] ?? starts["30 days"], to: "2026-10-06" };
}
export function periodRows(
  rows: TransactionFixture[],
  bounds: { from: string; to: string },
) {
  return rows.filter((row) => row.date >= bounds.from && row.date <= bounds.to);
}
export function totals(rows: TransactionFixture[]) {
  const income = rows
    .filter((r) => r.type === "income")
    .reduce((s, r) => s + cents(r.amount), BigInt(0));
  const expense = rows
    .filter((r) => r.type === "expense")
    .reduce((s, r) => s + cents(r.amount), BigInt(0));
  return {
    income: decimal(income),
    expense: decimal(expense),
    savings: decimal(income - expense),
  };
}

import type { Summary, Transaction } from "./transactions";

/** T07 only: in-memory sample data. Replace during T08 integration. */
export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "8d090605-20b3-4f87-a513-f487b705b7a2", type: "expense", amount: "250.50", currency: "EGP", description: "Grocery shopping", category: "food", date: "2026-09-30", createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-01T12:00:00.000Z" },
  { id: "73d0ca0b-5545-463c-a6ba-98429a7b429a", type: "income", amount: "1000.00", currency: "EGP", description: "Freelance payment", category: "freelance", date: "2026-09-29", createdAt: "2026-10-01T11:00:00.000Z", updatedAt: "2026-10-01T11:00:00.000Z" },
];

export const MOCK_SUMMARY: Summary = { totalIncome: "1000.00", totalExpenses: "250.50", balance: "749.50", currency: "EGP", transactionCount: 2, scope: "all" };

export const PREVIEW_SCENES = ["populated", "loading", "empty", "no-results", "error", "summary-error", "list-error", "success", "stale", "negative", "stress", "submitting", "validation", "save-error", "uncertain", "edit-missing", "delete-pending", "delete-error"] as const;
export type PreviewScene = (typeof PREVIEW_SCENES)[number];

export function previewScene(value: string | string[] | undefined): PreviewScene {
  return PREVIEW_SCENES.find((scene) => scene === value) ?? "populated";
}

export function fixtureTransactions(scene: PreviewScene): Transaction[] {
  if (scene === "empty") return [];
  if (scene === "negative") return MOCK_TRANSACTIONS.map((item) => item.type === "income" ? { ...item, amount: "100.00" } : item);
  if (scene === "stress") return [
    { ...MOCK_TRANSACTIONS[0], amount: "999999999.99", category: "entertainment", description: "X".repeat(200) },
    { ...MOCK_TRANSACTIONS[1], description: "<script>alert('plain text only')</script>" },
  ];
  return MOCK_TRANSACTIONS;
}

/** Exact integer minor-unit arithmetic ONLY for the local fixture demo.
 * T08 must use GET /summary totals rather than deriving persisted totals here.
 */
export function fixtureSummary(transactions: Transaction[]): Summary {
  let income = BigInt(0);
  let expenses = BigInt(0);
  for (const transaction of transactions) {
    const cents = BigInt(transaction.amount.replace(".", ""));
    if (transaction.type === "income") income += cents;
    else expenses += cents;
  }
  const decimal = (cents: bigint) => {
    const negative = cents < BigInt(0);
    const digits = (negative ? -cents : cents).toString().padStart(3, "0");
    return `${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
  };
  return { totalIncome: decimal(income), totalExpenses: decimal(expenses), balance: decimal(income - expenses), currency: "EGP", transactionCount: transactions.length, scope: "all" };
}

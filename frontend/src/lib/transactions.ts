export type TransactionType = "income" | "expense";
export type Category = "salary" | "freelance" | "gift" | "food" | "transport" | "shopping" | "bills" | "entertainment" | "other";
export type TransactionInput = {
  type: TransactionType;
  amount: string;
  category: Category | "";
  date: string;
  description: string;
};
export type Transaction = TransactionInput & {
  category: Category;
  id: string;
  currency: "EGP";
  createdAt: string;
  updatedAt: string;
};
export type Summary = {
  totalIncome: string;
  totalExpenses: string;
  balance: string;
  currency: "EGP";
  transactionCount: number;
  scope: "all";
};
export type Filters = { type: TransactionType | "all"; category: Category | "all" };
export type FieldErrors = Partial<Record<keyof TransactionInput, string>>;

export const CATEGORY_LABELS: Record<Category, string> = {
  salary: "Salary", freelance: "Freelance", gift: "Gift", food: "Food",
  transport: "Transport", shopping: "Shopping", bills: "Bills",
  entertainment: "Entertainment", other: "Other",
};
export const CATEGORIES: Record<TransactionType, readonly Category[]> = {
  income: ["salary", "freelance", "gift", "other"],
  expense: ["food", "transport", "shopping", "bills", "entertainment", "other"],
};
export const ALL_CATEGORIES: readonly Category[] = ["salary", "freelance", "gift", "food", "transport", "shopping", "bills", "entertainment", "other"];
export const DEFAULT_FILTERS: Filters = { type: "all", category: "all" };
export const DESCRIPTION_LIMIT = 200;

export function categoriesFor(type: Filters["type"]): readonly Category[] {
  return type === "all" ? ALL_CATEGORIES : CATEGORIES[type];
}

/** Format decimal text without floating-point conversion, including unbounded totals. */
export function formatMoney(value: string): string {
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  return `${negative ? "−" : ""}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}

export function normalizeAmount(value: string): string {
  const [integer, fraction = ""] = value.split(".");
  return `${integer}.${fraction.padEnd(2, "0")}`;
}

export function displayDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function cairoToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function validateTransaction(values: TransactionInput, today: string): FieldErrors {
  const errors: FieldErrors = {};
  if (values.type !== "income" && values.type !== "expense") errors.type = "Choose Income or Expense.";
  if (!/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$/.test(values.amount) || /^0(?:\.0{1,2})?$/.test(values.amount)) {
    errors.amount = "Enter 0.01–999,999,999.99 with up to 2 decimal places, without separators or symbols.";
  }
  if (!values.category || !CATEGORIES[values.type]?.includes(values.category)) errors.category = "Choose a category valid for the selected type.";
  if (!isCalendarDate(values.date) || values.date < "1900-01-01" || values.date > today) errors.date = "Enter a valid date from 01/01/1900 through today in Cairo.";
  const length = Array.from(values.description.trim()).length;
  if (length < 1 || length > DESCRIPTION_LIMIT) errors.description = "Enter 1–200 characters after trimming.";
  return errors;
}

export function matchesFilters(transaction: Transaction, filters: Filters): boolean {
  return (filters.type === "all" || filters.type === transaction.type) && (filters.category === "all" || filters.category === transaction.category);
}

export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

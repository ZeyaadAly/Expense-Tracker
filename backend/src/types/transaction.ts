export const categories = {
  income: ["salary", "freelance", "gift", "other"],
  expense: ["food", "transport", "shopping", "bills", "entertainment", "other"],
} as const;
export type TransactionType = keyof typeof categories;
export type Category = (typeof categories)[TransactionType][number];
export interface TransactionInput {
  type: TransactionType;
  amount: string;
  description: string;
  category: Category;
  date: string;
}
export interface Transaction extends TransactionInput {
  id: string;
  currency: "EGP";
  createdAt: string;
  updatedAt: string;
}
export interface TransactionRow {
  id: string;
  type: TransactionType;
  amount: string;
  description: string;
  category: Category;
  // Queries must format PostgreSQL date as YYYY-MM-DD, rather than pg's Date parser.
  transaction_date: string;
  created_at: Date | string;
  updated_at: Date | string;
}

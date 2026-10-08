import type {TransactionType} from "./transaction.js";

export interface V2TransactionFilters {
  q?: string;
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  recurring?: "manual" | "generated";
}

export interface V2TransactionInput {
  accountId: string;
  categoryId: string;
  type: TransactionType;
  amount: string;
  description: string;
  date: string;
}
export interface V2TransactionListQuery extends V2TransactionFilters {limit?:number;cursor?:string}
export interface V2TransactionPage {data:V2TransactionResource[];meta:{limit:number;nextCursor:string|null;hasMore:boolean}}
export interface V2TransactionResource extends V2TransactionInput {
  id: string;
  accountName: string;
  categoryName: string;
  currency: "EGP";
  recurringTransactionId: string | null;
  recurringOccurrenceDate: string | null;
  createdAt: string;
  updatedAt: string;
}
export type V2TransactionRow = Omit<V2TransactionResource,"currency"|"createdAt"|"updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
  cursorCreatedAt?: string;
};

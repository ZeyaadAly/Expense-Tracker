"use client";
import { createSessionClient } from "./session-client";
import { V2ApiError, type V2RequestOptions } from "./v2-client";

export type TransactionInput = {
  type: "income" | "expense";
  accountId: string;
  categoryId: string;
  amount: string;
  date: string;
  description: string;
};
export type Transaction = TransactionInput & {
  id: string;
  accountName: string;
  categoryName: string;
  currency: "EGP";
  recurringTransactionId: string | null;
  recurringOccurrenceDate: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TransactionQuery = {
  q?: string;
  type?: TransactionInput["type"];
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  recurring?: "manual" | "generated";
  limit?: number;
  cursor?: string;
};
export type TransactionPage = {
  data: Transaction[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const invalid = (write = false) => new V2ApiError(200, "INVALID_RESPONSE", "unexpected", [], write);
export function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9999-12-31") return false;
  const date = new Date(value + "T00:00:00Z");
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function cairoToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function validateTransactionInput(input: TransactionInput, today = cairoToday()): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!["income", "expense"].includes(input.type)) errors.type = "Choose Income or Expense.";
  if (!uuid.test(input.accountId)) errors.accountId = "Choose an active account.";
  if (!uuid.test(input.categoryId)) errors.categoryId = "Choose an active compatible category.";
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(input.amount) || /^0(?:\.0{1,2})?$/.test(input.amount))
    errors.amount = "Enter an amount from 0.01 to 999999999.99 with up to two decimals.";
  if (!validCalendarDate(input.date) || input.date > today)
    errors.date = "Choose a date from 1900-01-01 through today in Cairo.";
  if (!input.description.trim() || Array.from(input.description.trim()).length > 200)
    errors.description = "Enter a description of 1–200 characters.";
  return errors;
}
function parseTransaction(value: unknown, write = false, id?: string): Transaction {
  const keys = [
    "id",
    "accountId",
    "categoryId",
    "type",
    "amount",
    "date",
    "description",
    "accountName",
    "categoryName",
    "currency",
    "recurringTransactionId",
    "recurringOccurrenceDate",
    "createdAt",
    "updatedAt",
  ];
  if (
    !object(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
    [value.id, value.accountId, value.categoryId].some((v) => typeof v !== "string" || !uuid.test(v)) ||
    (id && value.id !== id) ||
    !["income", "expense"].includes(value.type as string) ||
    value.currency !== "EGP" ||
    typeof value.amount !== "string" ||
    !/^(0|[1-9]\d{0,8})\.\d{2}$/.test(value.amount) ||
    value.amount === "0.00" ||
    typeof value.date !== "string" ||
    !validCalendarDate(value.date) ||
    [value.description, value.accountName, value.categoryName].some((v) => typeof v !== "string" || !v.trim()) ||
    Array.from(value.description as string).length > 200 ||
    !(
      (value.recurringTransactionId === null && value.recurringOccurrenceDate === null) ||
      (typeof value.recurringTransactionId === "string" &&
        uuid.test(value.recurringTransactionId) &&
        typeof value.recurringOccurrenceDate === "string" &&
        validCalendarDate(value.recurringOccurrenceDate))
    ) ||
    [value.createdAt, value.updatedAt].some(
      (v) => typeof v !== "string" || !/^\d{4}-\d\d-\d\dT.*Z$/.test(v) || isNaN(Date.parse(v)),
    )
  )
    throw invalid(write);
  return value as Transaction;
}
const editable = (i: TransactionInput): TransactionInput => ({
  type: i.type,
  accountId: i.accountId,
  categoryId: i.categoryId,
  amount: i.amount,
  date: i.date,
  description: i.description.trim(),
});
export function transactionQuery(query: TransactionQuery) {
  return {
    q: query.q?.trim() || undefined,
    type: query.type,
    accountId: query.accountId,
    categoryId: query.categoryId,
    from: query.from || undefined,
    to: query.to || undefined,
    recurring: query.recurring,
    limit: query.limit,
    cursor: query.cursor,
  };
}
export function createTransactionClient(userId: string, transport = createSessionClient(userId)) {
  const path = (id: string) => {
    if (!uuid.test(id)) throw new V2ApiError(0, "INVALID_REQUEST", "unexpected");
    return "/transactions/" + id;
  };
  return {
    async listTransactions(query: TransactionQuery = {}, options?: V2RequestOptions): Promise<TransactionPage> {
      const page = await transport.get<unknown, TransactionPage["meta"]>("/transactions", {
        ...options,
        query: transactionQuery(query),
      });
      const meta = page?.meta;
      if (
        !Array.isArray(page?.data) ||
        !object(meta) ||
        Object.keys(meta).length !== 3 ||
        !Number.isInteger(meta.limit) ||
        meta.limit < 1 ||
        meta.limit > 100 ||
        meta.limit !== (query.limit ?? 25) ||
        typeof meta.hasMore !== "boolean" ||
        !(
          meta.nextCursor === null ||
          (typeof meta.nextCursor === "string" && meta.nextCursor.length > 0 && meta.nextCursor.length <= 2048)
        ) ||
        meta.hasMore !== (meta.nextCursor !== null) ||
        page.data.length > meta.limit ||
        (meta.hasMore && page.data.length !== meta.limit)
      )
        throw invalid();
      const data = page.data.map((row) => parseTransaction(row));
      if (new Set(data.map((r) => r.id)).size !== data.length) throw invalid();
      return { data, meta };
    },
    async getTransaction(id: string, options?: V2RequestOptions) {
      return parseTransaction((await transport.get(path(id), options))?.data, false, id);
    },
    async createTransaction(input: TransactionInput, options?: V2RequestOptions) {
      return parseTransaction((await transport.post("/transactions", editable(input), options))?.data, true);
    },
    async updateTransaction(id: string, input: TransactionInput, options?: V2RequestOptions) {
      return parseTransaction((await transport.put(path(id), editable(input), options))?.data, true, id);
    },
    async deleteTransaction(id: string, options?: V2RequestOptions) {
      if ((await transport.delete(path(id), options)) !== undefined) throw invalid(true);
    },
  };
}

"use client";
import { createSessionClient } from "./session-client";
import { V2ApiError, type V2RequestOptions } from "./v2-client";
import { validCalendarDate } from "./v2-transactions";

export const frequencies = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurringInput = {
  type: "income" | "expense"; accountId: string; categoryId: string; amount: string;
  description: string; frequency: typeof frequencies[number]; startDate: string; endDate: string | null;
};
export type Recurring = RecurringInput & {
  id: string; accountName: string; categoryName: string; currency: "EGP";
  nextOccurrence: string | null; status: "active" | "paused" | "archived"; exhausted: boolean;
  createdAt: string; updatedAt: string;
};
export type RecurringQuery = Partial<Pick<Recurring, "status" | "type" | "accountId" | "categoryId" | "frequency">>;
export type UpcomingOccurrence = Pick<Recurring, "description" | "type" | "amount" | "currency" | "accountName"> & {
  recurringTransactionId: string; occurrenceDate: string;
};
export type Upcoming = { data: UpcomingOccurrence[]; meta: { from: string; to: string } };
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const invalid = (write = false) => new V2ApiError(200, "INVALID_RESPONSE", "unexpected", [], write);
const exactAmount = (v: unknown) => typeof v === "string" && /^(0|[1-9]\d{0,8})\.\d{2}$/.test(v) && v !== "0.00";
const date = (v: unknown): v is string => typeof v === "string" && validCalendarDate(v);
const text = (v: unknown, max: number) => typeof v === "string" && !!v.trim() && Array.from(v).length <= max && !/[\p{Cc}\p{Cs}]/u.test(v);
const keys = ["id", "accountId", "categoryId", "accountName", "categoryName", "type", "amount", "description", "frequency", "startDate", "endDate", "currency", "nextOccurrence", "status", "exhausted", "createdAt", "updatedAt"];
function parse(value: unknown, write = false, id?: string): Recurring {
  if (!object(value) || Object.keys(value).some(k => !keys.includes(k)) ||
    ![value.id, value.accountId, value.categoryId].every(v => typeof v === "string" && uuid.test(v)) || (id && value.id !== id) ||
    !text(value.accountName, 100) || !text(value.categoryName, 80) || !text(value.description, 200) ||
    !["income", "expense"].includes(value.type as string) || !exactAmount(value.amount) || value.currency !== "EGP" ||
    !frequencies.includes(value.frequency as Recurring["frequency"]) || !date(value.startDate) ||
    !(value.endDate === null || (date(value.endDate) && value.endDate >= value.startDate)) ||
    !(value.nextOccurrence === null || (date(value.nextOccurrence) && value.nextOccurrence >= value.startDate && (value.endDate === null || value.nextOccurrence <= (value.endDate as string)))) ||
    !["active", "paused", "archived"].includes(value.status as string) ||
    value.exhausted !== (value.status === "active" && value.nextOccurrence === null) ||
    (value.status !== "active" && value.nextOccurrence !== null) ||
    ![value.createdAt, value.updatedAt].every(v => typeof v === "string" && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) && !isNaN(Date.parse(v)))) throw invalid(write);
  return value as Recurring;
}
export function validateRecurringInput(input: RecurringInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!["income", "expense"].includes(input.type)) errors.type = "Choose Income or Expense.";
  if (!uuid.test(input.accountId)) errors.accountId = "Choose an active account.";
  if (!uuid.test(input.categoryId)) errors.categoryId = "Choose an active compatible category.";
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(input.amount) || /^0(?:\.0{1,2})?$/.test(input.amount)) errors.amount = "Enter 0.01 to 999999999.99 with up to two decimals.";
  if (!text(input.description.trim(), 200)) errors.description = "Enter 1–200 characters without control characters.";
  if (!frequencies.includes(input.frequency)) errors.frequency = "Choose a frequency.";
  if (!date(input.startDate)) errors.startDate = "Choose a valid date from 1900-01-01 through 9999-12-31.";
  if (input.endDate !== null && (!date(input.endDate) || input.endDate < input.startDate)) errors.endDate = "Choose a valid end date on or after the start date, or leave it empty.";
  return errors;
}
function editable(input: RecurringInput): RecurringInput {
  const { type, accountId, categoryId, amount, description, frequency, startDate, endDate } = input;
  return { type, accountId, categoryId, amount, description, frequency, startDate, endDate };
}
export function createRecurringClient(userId: string, transport = createSessionClient(userId)) {
  const path = (id: string) => { if (!uuid.test(id)) throw new V2ApiError(0, "INVALID_REQUEST", "unexpected"); return "/recurring/" + id; };
  return {
    async listRecurring(query: RecurringQuery = {}, options?: V2RequestOptions) {
      const { status, type, accountId, categoryId, frequency } = query;
      const result = await transport.get<unknown, { count: number }>("/recurring", { ...options, query: { status, type, accountId, categoryId, frequency } });
      if (!Array.isArray(result?.data) || result.meta?.count !== result.data.length) throw invalid();
      const rows = result.data.map(v => parse(v));
      if (new Set(rows.map(r => r.id)).size !== rows.length) throw invalid();
      return rows;
    },
    getRecurring: async (id: string, options?: V2RequestOptions) => parse((await transport.get(path(id), options))?.data, false, id),
    createRecurring: async (input: RecurringInput, options?: V2RequestOptions) => parse((await transport.post("/recurring", editable(input), options))?.data, true),
    updateRecurring: async (id: string, input: RecurringInput, options?: V2RequestOptions) => parse((await transport.put(path(id), editable(input), options))?.data, true, id),
    pauseRecurring: async (id: string, options?: V2RequestOptions) => parse((await transport.post(path(id) + "/pause", {}, options))?.data, true, id),
    resumeRecurring: async (id: string, options?: V2RequestOptions) => parse((await transport.post(path(id) + "/resume", {}, options))?.data, true, id),
    archiveRecurring: async (id: string, options?: V2RequestOptions) => parse((await transport.post(path(id) + "/archive", {}, options))?.data, true, id),
    async getUpcomingRecurring(days = 30, options?: V2RequestOptions): Promise<Upcoming> {
      const result = await transport.get<unknown, { from: string; to: string }>("/recurring/upcoming", { ...options, query: { days } });
      if (!Array.isArray(result?.data) || !date(result.meta?.from) || !date(result.meta?.to) || result.meta!.from > result.meta!.to) throw invalid();
      const rows = result.data;
      if (rows.some(v => !object(v) || Object.keys(v).some(k => !["recurringTransactionId", "description", "type", "amount", "currency", "occurrenceDate", "accountName"].includes(k)) ||
        typeof v.recurringTransactionId !== "string" || !uuid.test(v.recurringTransactionId) || !text(v.description, 200) || !text(v.accountName, 100) ||
        !["income", "expense"].includes(v.type as string) || !exactAmount(v.amount) || v.currency !== "EGP" || !date(v.occurrenceDate) || v.occurrenceDate < result.meta!.from || v.occurrenceDate > result.meta!.to)) throw invalid();
      if (new Set(rows.map(r => `${r.recurringTransactionId}:${r.occurrenceDate}`)).size !== rows.length) throw invalid();
      return { data: rows as UpcomingOccurrence[], meta: result.meta! };
    },
  };
}

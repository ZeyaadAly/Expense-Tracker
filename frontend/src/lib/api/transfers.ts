"use client";
import { createSessionClient } from "./session-client";
import { V2ApiError, type V2RequestOptions } from "./v2-client";
import { cairoToday, validCalendarDate } from "./v2-transactions";

export type TransferInput = { sourceAccountId: string; destinationAccountId: string; amount: string; date: string; description?: string | null };
export type Transfer = TransferInput & { id: string; sourceAccountName: string; destinationAccountName: string; description: string | null; currency: "EGP"; createdAt: string; updatedAt: string };
export type TransferQuery = { accountId?: string; from?: string; to?: string; limit?: number; cursor?: string };
export type TransferPage = { data: Transfer[]; meta: { limit: number; nextCursor: string | null; hasMore: boolean } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const invalid = (write = false) => new V2ApiError(200, "INVALID_RESPONSE", "unexpected", [], write);
export function validateTransferInput(input: TransferInput, today = cairoToday()): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!uuid.test(input.sourceAccountId)) fields.sourceAccountId = "Choose an active From account.";
  if (!uuid.test(input.destinationAccountId)) fields.destinationAccountId = "Choose an active To account.";
  if (input.sourceAccountId && input.sourceAccountId.toLowerCase() === input.destinationAccountId.toLowerCase()) fields.destinationAccountId = "Choose a different To account.";
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(input.amount) || /^0(?:\.0{1,2})?$/.test(input.amount)) fields.amount = "Enter 0.01 to 999999999.99 with up to two decimals.";
  if (!validCalendarDate(input.date) || input.date > today) fields.date = "Choose a date from 1900-01-01 through today in Cairo.";
  const note = input.description?.trim() ?? "";
  if (Array.from(note).length > 200 || /[\u0000\p{Cs}]/u.test(note)) fields.description = "Use up to 200 characters, without invalid Unicode or null characters.";
  return fields;
}
function parse(value: unknown, write = false, id?: string): Transfer {
  const keys = ["id", "sourceAccountId", "destinationAccountId", "sourceAccountName", "destinationAccountName", "amount", "date", "description", "currency", "createdAt", "updatedAt"];
  if (!object(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k)) ||
    [value.id, value.sourceAccountId, value.destinationAccountId].some(v => typeof v !== "string" || !uuid.test(v)) ||
    (id && value.id !== id) || value.sourceAccountId === value.destinationAccountId || value.currency !== "EGP" ||
    typeof value.amount !== "string" || !/^(0|[1-9]\d{0,8})\.\d{2}$/.test(value.amount) || value.amount === "0.00" ||
    typeof value.date !== "string" || !validCalendarDate(value.date) ||
    [value.sourceAccountName, value.destinationAccountName].some(v => typeof v !== "string" || !v.trim() || Array.from(v).length > 100) ||
    !(value.description === null || (typeof value.description === "string" && Array.from(value.description).length <= 200)) ||
    [value.createdAt, value.updatedAt].some(v => typeof v !== "string" || !/^\d{4}-\d\d-\d\dT.*Z$/.test(v) || isNaN(Date.parse(v)))) throw invalid(write);
  return value as Transfer;
}
const editable = (i: TransferInput): TransferInput => ({ sourceAccountId: i.sourceAccountId, destinationAccountId: i.destinationAccountId, amount: i.amount, date: i.date, description: i.description?.trim() || null });
export function createTransferClient(userId: string, transport = createSessionClient(userId)) {
  const path = (id: string) => { if (!uuid.test(id)) throw new V2ApiError(0, "INVALID_REQUEST", "unexpected"); return "/transfers/" + id; };
  async function write<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      // T27 proves this exact 503 can follow a successful COMMIT. Keep T10/V1 contracts
      // intact while making transfer recovery conservative; never dispatch a second write.
      if (error instanceof V2ApiError && error.status === 503 && error.code === "DATABASE_UNAVAILABLE")
        throw new V2ApiError(error.status, error.code, error.kind, error.details, true);
      throw error;
    }
  }
  return {
    async listTransfers(query: TransferQuery = {}, options?: V2RequestOptions): Promise<TransferPage> {
      const page = await transport.get<unknown, TransferPage["meta"]>("/transfers", { ...options, query: { accountId: query.accountId, from: query.from, to: query.to, limit: query.limit, cursor: query.cursor } });
      const meta = page?.meta;
      if (!Array.isArray(page?.data) || !object(meta) || Object.keys(meta).length !== 3 || !Number.isInteger(meta.limit) || meta.limit !== (query.limit ?? 25) || meta.limit < 1 || meta.limit > 100 ||
        typeof meta.hasMore !== "boolean" || !(meta.nextCursor === null || (typeof meta.nextCursor === "string" && !!meta.nextCursor && meta.nextCursor.length <= 2048)) ||
        meta.hasMore !== (meta.nextCursor !== null) || page.data.length > meta.limit || (meta.hasMore && page.data.length !== meta.limit)) throw invalid();
      const data = page.data.map(row => parse(row));
      if (new Set(data.map(row => row.id)).size !== data.length || (query.accountId && data.some(row => row.sourceAccountId !== query.accountId && row.destinationAccountId !== query.accountId))) throw invalid();
      return { data, meta };
    },
    async getTransfer(id: string, options?: V2RequestOptions) { return parse((await transport.get(path(id), options))?.data, false, id); },
    createTransfer: (input: TransferInput, options?: V2RequestOptions) => write(async () => parse((await transport.post("/transfers", editable(input), options))?.data, true)),
    updateTransfer: (id: string, input: TransferInput, options?: V2RequestOptions) => write(async () => parse((await transport.put(path(id), editable(input), options))?.data, true, id)),
    deleteTransfer: (id: string, options?: V2RequestOptions) => write(async () => { if (await transport.delete(path(id), options) !== undefined) throw invalid(true); }),
  };
}

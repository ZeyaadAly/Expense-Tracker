import { CATEGORIES, isCalendarDate, type Category, type FieldErrors, type Filters, type Summary, type Transaction, type TransactionInput, type TransactionType } from "../transactions";

export type ApiDetail = { field: string; message: string };
export type TransactionList = { data: Transaction[]; meta: { count: number; filters: { type: TransactionType | null; category: Category | null } } };
export class ApiError extends Error {
  constructor(public code: string, public status: number, public details: ApiDetail[] = [], public uncertain = false) {
    super(uncertain ? "We could not confirm whether this transaction was saved. Refresh and check your transactions before trying again." : code === "CONFIGURATION_ERROR" ? "The API connection is not configured. Please contact the application owner." : code === "VALIDATION_ERROR" ? "Check the highlighted fields." : code === "DATABASE_UNAVAILABLE" ? "Database is unavailable. Please try again later." : "The request could not be completed. Please try again.");
    this.name = "ApiError";
  }
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const money = (v: unknown, signed = false): v is string => typeof v === "string" && (signed ? /^-?(0|[1-9]\d*)\.\d{2}$/ : /^(0|[1-9]\d*)\.\d{2}$/).test(v);
function transaction(v: unknown): v is Transaction {
  if (!object(v) || (v.type !== "income" && v.type !== "expense")) return false;
  return typeof v.id === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v.id) && money(v.amount) && v.amount !== "0.00" && v.amount.split(".")[0].length <= 9 && v.currency === "EGP" && typeof v.description === "string" && Array.from(v.description).length >= 1 && Array.from(v.description).length <= 200 && typeof v.category === "string" && CATEGORIES[v.type].includes(v.category as Transaction["category"]) && typeof v.date === "string" && isCalendarDate(v.date) && [v.createdAt,v.updatedAt].every(t => typeof t === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t));
}
function summary(v: unknown): v is Summary {
  return object(v) && money(v.totalIncome) && money(v.totalExpenses) && money(v.balance,true) && v.currency === "EGP" && v.scope === "all" && Number.isSafeInteger(v.transactionCount) && (v.transactionCount as number) >= 0;
}
const fieldMessages: Record<keyof TransactionInput,string> = {
  type: "Choose Income or Expense.", amount: "Enter 0.01–999,999,999.99 with up to 2 decimal places, without separators or symbols.", category: "Choose a category valid for the selected type.", date: "Enter a valid date from 01/01/1900 through today in Cairo.", description: "Enter 1–200 characters after trimming.",
};
export function apiFieldErrors(error: ApiError): FieldErrors {
  const fields: FieldErrors = {};
  if (error.code === "VALIDATION_ERROR") for (const detail of error.details) if (Object.hasOwn(fieldMessages,detail.field)) fields[detail.field as keyof TransactionInput] = fieldMessages[detail.field as keyof TransactionInput];
  return fields;
}

export function createApiClient(base = process.env.NEXT_PUBLIC_API_BASE_URL, fetcher: typeof fetch = fetch, timeoutMs = 15000) {
  function baseUrl() {
    try { const u = new URL(base ?? ""); if (!["http:","https:"].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error(); return u.toString().replace(/\/$/,""); }
    catch { throw new ApiError("CONFIGURATION_ERROR",0); }
  }
  async function request(path: string, init: RequestInit, valid: (v: unknown) => boolean, expected: number): Promise<unknown> {
    const url = baseUrl() + path;
    const write = init.method === "POST" || init.method === "PUT";
    const controller = new AbortController();
    const abort = () => controller.abort();
    init.signal?.addEventListener("abort",abort,{once:true});
    if (init.signal?.aborted) controller.abort();
    const timer = setTimeout(abort,timeoutMs);
    try {
      const response = await fetcher(url,{...init,signal:controller.signal,cache:"no-store",credentials:"omit",headers:{Accept:"application/json",...init.headers}});
      let body: unknown;
      try { body = await response.json(); } catch { throw new ApiError("INVALID_RESPONSE",response.status,[],write); }
      if (!response.ok) {
        if (object(body) && object(body.error) && typeof body.error.code === "string" && typeof body.error.message === "string" && Array.isArray(body.error.details) && body.error.details.every(d => object(d) && typeof d.field === "string" && typeof d.message === "string")) {
          throw new ApiError(body.error.code,response.status,body.error.details as ApiDetail[],write && response.status >= 500 && response.status !== 503);
        }
        throw new ApiError("INVALID_RESPONSE",response.status,[],write);
      }
      if (response.status !== expected || !valid(body)) throw new ApiError("INVALID_RESPONSE",response.status,[],write);
      return body;
    } catch(error) {
      if (error instanceof ApiError) throw error;
      if (init.signal?.aborted) throw new DOMException("Read canceled","AbortError");
      throw new ApiError(controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",0,[],write);
    } finally { clearTimeout(timer); init.signal?.removeEventListener("abort",abort); }
  }
  return {
    async updateTransaction(id: string, values: TransactionInput): Promise<Transaction> {
      const {type,amount,category,date,description} = values;
      const body = await request(`/transactions/${encodeURIComponent(id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,amount,category,date,description})},v => object(v) && transaction(v.data) && v.data.id === id,200);
      return (body as {data:Transaction}).data;
    },
    async list(filters: Filters, signal?: AbortSignal): Promise<TransactionList> {
      const q = new URLSearchParams(); if(filters.type !== "all") q.set("type",filters.type); if(filters.category !== "all") q.set("category",filters.category);
      const body = await request(`/transactions${q.size ? `?${q}` : ""}`,{signal},v => object(v) && Array.isArray(v.data) && v.data.every(transaction) && object(v.meta) && v.meta.count === v.data.length && object(v.meta.filters) && v.meta.filters.type === (filters.type === "all" ? null : filters.type) && v.meta.filters.category === (filters.category === "all" ? null : filters.category),200);
      return body as TransactionList;
    },
    async summary(signal?: AbortSignal): Promise<Summary> { const body = await request("/summary",{signal},v => object(v) && summary(v.data),200); return (body as {data:Summary}).data; },
    async create(values: TransactionInput): Promise<Transaction> {
      const {type,amount,category,date,description} = values;
      const body = await request("/transactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,amount,category,date,description})},v => object(v) && transaction(v.data),201);
      return (body as {data:Transaction}).data;
    },
  };
}

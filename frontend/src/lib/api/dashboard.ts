"use client";
import { createSessionClient } from "./session-client";
import { V2ApiError, type V2RequestOptions } from "./v2-client";
import { parseAccount, type Account } from "./accounts";
import { parseTransaction, validCalendarDate, type Transaction } from "./v2-transactions";
import type { UpcomingOccurrence } from "./recurring";

export const dashboardPeriods = ["this_month", "last_month", "3_months", "6_months", "1_year"] as const;
export type DashboardPeriod = typeof dashboardPeriods[number];
export const periodLabels: Record<DashboardPeriod, string> = { this_month: "This month", last_month: "Last month", "3_months": "3 months", "6_months": "6 months", "1_year": "1 year" };
export type Dashboard = {
  data: {
    period: { key: DashboardPeriod; from: string; to: string; timezone: "Africa/Cairo" };
    summary: { totalBalance: string; assets: string; cardDebt: string; income: string; expenses: string; netSavings: string; currency: "EGP" };
    accounts: Account[]; recentTransactions: Transaction[]; upcomingRecurring: UpcomingOccurrence[];
  };
  meta: { stage: "core"; deferred: string[]; upcoming: { from: string; to: string; limit: 5 }; recentTransactions: { limit: 5; scope: "all_history" } };
};
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: unknown): v is string => typeof v === "string" && /^-?(0|[1-9]\d*)\.\d{2}$/.test(v) && v !== "-0.00";
const date = (v: unknown): v is string => typeof v === "string" && validCalendarDate(v);
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && Object.keys(v).every(k => names.includes(k));
const text = (v: unknown, max: number) => typeof v === "string" && !!v.trim() && Array.from(v).length <= max;
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const invalid = () => new V2ApiError(200, "INVALID_RESPONSE", "unexpected");
function parse(value: unknown, period: DashboardPeriod): Dashboard {
  if (!object(value) || !object(value.data) || !object(value.meta)) throw invalid();
  const { data, meta } = value;
  if (!keys(data, ["period", "summary", "accounts", "recentTransactions", "upcomingRecurring"]) || !object(data.period) ||
    !keys(data.period, ["key", "from", "to", "timezone"]) || data.period.key !== period || data.period.timezone !== "Africa/Cairo" ||
    !date(data.period.from) || !date(data.period.to) || data.period.from > data.period.to || !object(data.summary) ||
    !keys(data.summary, ["totalBalance", "assets", "cardDebt", "income", "expenses", "netSavings", "currency"]) || data.summary.currency !== "EGP" ||
    !["totalBalance", "assets", "cardDebt", "income", "expenses", "netSavings"].every(k => exact(data.summary && (data.summary as Record<string, unknown>)[k])) ||
    !Array.isArray(data.accounts) || !Array.isArray(data.recentTransactions) || data.recentTransactions.length > 5 || !Array.isArray(data.upcomingRecurring) || data.upcomingRecurring.length > 5 ||
    meta.stage !== "core" || !Array.isArray(meta.deferred) || meta.deferred.length !== 3 || !["incomeVsExpenses", "budgets", "goals"].every(k => (meta.deferred as unknown[]).includes(k)) ||
    !object(meta.upcoming) || !date(meta.upcoming.from) || !date(meta.upcoming.to) || meta.upcoming.from > meta.upcoming.to || meta.upcoming.limit !== 5 ||
    !object(meta.recentTransactions) || meta.recentTransactions.limit !== 5 || meta.recentTransactions.scope !== "all_history") throw invalid();
  const accounts = data.accounts.map(v => parseAccount(v)), recentTransactions = data.recentTransactions.map(v => parseTransaction(v));
  if (new Set(accounts.map(a => a.id)).size !== accounts.length || new Set(recentTransactions.map(t => t.id)).size !== recentTransactions.length) throw invalid();
  const upcoming = meta.upcoming;
  for (const item of data.upcomingRecurring) {
    if (!object(item) || !keys(item, ["recurringTransactionId", "description", "type", "amount", "currency", "occurrenceDate", "accountName"]) ||
      !uuid(item.recurringTransactionId) || !text(item.description, 200) || !text(item.accountName, 100) || !["income", "expense"].includes(item.type as string) ||
      !exact(item.amount) || (item.amount as string).startsWith("-") || item.amount === "0.00" || item.currency !== "EGP" || !date(item.occurrenceDate) || item.occurrenceDate < (upcoming.from as string) || item.occurrenceDate > (upcoming.to as string)) throw invalid();
  }
  if (new Set(data.upcomingRecurring.map(r => `${r.recurringTransactionId}:${r.occurrenceDate}`)).size !== data.upcomingRecurring.length) throw invalid();
  // Validate structure only. Never reconcile or recompute financial values in the browser.
  return { data: { ...data, accounts, recentTransactions } as Dashboard["data"], meta: meta as Dashboard["meta"] };
}
export function createDashboardClient(userId: string, transport = createSessionClient(userId)) {
  return {
    async getDashboard(period: DashboardPeriod = "this_month", options?: V2RequestOptions): Promise<Dashboard> {
      if (!dashboardPeriods.includes(period)) throw new V2ApiError(0, "INVALID_REQUEST", "unexpected");
      return parse(await transport.get("/dashboard", { ...options, query: { period } }), period);
    },
  };
}

import { cairoToday, validCalendarDate } from "./api/v2-transactions";

export const analyticsPeriods = ["7_days", "30_days", "3_months", "6_months", "1_year", "custom"] as const;
export type AnalyticsPeriod = typeof analyticsPeriods[number];
export type AnalyticsRange = { from: string; to: string; accountId?: string };
export const analyticsLabels: Record<AnalyticsPeriod,string> = {"7_days":"7 days","30_days":"30 days","3_months":"3 months","6_months":"6 months","1_year":"1 year",custom:"Custom"};
const parts = (date:string) => date.split("-").map(Number);
const utc = (date:string) => { const [y,m,d]=parts(date);return Date.UTC(y,m-1,d); };
const calendar = (date:Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
export function analyticsRangeError(range:AnalyticsRange): string | null {
  if (![range.from,range.to].every(v=>validCalendarDate(v))) return "Enter both dates as real calendar dates from 1900-01-01 through 9999-12-31.";
  if (range.from>range.to) return "End date must be on or after start date.";
  if ((utc(range.to)-utc(range.from))/86400000+1>366) return "Choose at most 366 inclusive calendar days.";
  return null;
}
export function resolveAnalyticsPeriod(period:Exclude<AnalyticsPeriod,"custom">,now=new Date()):AnalyticsRange {
  const to=cairoToday(now),[year,month]=parts(to);
  const from=period==="7_days"||period==="30_days"
    ? calendar(new Date(utc(to)-(period==="7_days"?6:29)*86400000))
    : calendar(new Date(Date.UTC(year,month-1-({"3_months":2,"6_months":5,"1_year":11}[period]),1)));
  return {from,to};
}

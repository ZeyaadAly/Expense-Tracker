"use client";
import { createSessionClient } from "./session-client";
import { V2ApiError, type V2RequestOptions } from "./v2-client";
import { analyticsRangeError, type AnalyticsRange } from "../analytics-range";
import { validCalendarDate } from "./v2-transactions";
import { accountTypes, type AccountType } from "./accounts";

type Totals = {income:string;expenses:string;netSavings:string};
export type AnalyticsMonth = Totals & {period:string;from:string;to:string};
export type AnalyticsCategory = {categoryId:string;categoryName:string;amount:string;percentage:string|null};
export type AnalyticsOverview = {
  period:{from:string;to:string;timezone:"Africa/Cairo";calendarDays:number};
  summary:Totals & {savingsRatePercent:string|null;averageDailyExpense:string};
  incomeVsExpenses:AnalyticsMonth[];
  expenseByCategory:AnalyticsCategory[];incomeByCategory:AnalyticsCategory[];
  accountActivity:(Totals & {accountId:string;accountName:string;type:AccountType;incomingTransfers:string;outgoingTransfers:string})[];
  recurring:{income:string;expenses:string;netCashFlow:string;basis:"projected_occurrences";from:string;to:string};
};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).length===names.length&&Object.keys(v).every(k=>names.includes(k));
const exact=(v:unknown):v is string=>typeof v==="string"&&/^-?(0|[1-9]\d*)\.\d{2}$/.test(v)&&v!=="-0.00";
const unsigned=(v:unknown)=>exact(v)&&!v.startsWith("-");
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown,max:number)=>typeof v==="string"&&!!v.trim()&&Array.from(v).length<=max;
const date=(v:unknown):v is string=>typeof v==="string"&&validCalendarDate(v);
const totals=(v:Record<string,unknown>)=>unsigned(v.income)&&unsigned(v.expenses)&&exact(v.netSavings);
const invalid=()=>new V2ApiError(200,"INVALID_RESPONSE","unexpected");
export function parseAnalytics(value:unknown,range:AnalyticsRange):AnalyticsOverview {
  if(!object(value)||!keys(value,["data"])||!object(value.data))throw invalid();
  const d=value.data,p=d.period,s=d.summary,r=d.recurring;
  if(!keys(d,["period","summary","incomeVsExpenses","expenseByCategory","incomeByCategory","accountActivity","recurring"])||!object(p)||!keys(p,["from","to","timezone","calendarDays"])||p.from!==range.from||p.to!==range.to||p.timezone!=="Africa/Cairo"||!Number.isSafeInteger(p.calendarDays)|| (p.calendarDays as number)<1||(p.calendarDays as number)>366||
    !object(s)||!keys(s,["income","expenses","netSavings","savingsRatePercent","averageDailyExpense"])||!totals(s)||!unsigned(s.averageDailyExpense)||(s.savingsRatePercent!==null&&!exact(s.savingsRatePercent))||
    !object(r)||!keys(r,["income","expenses","netCashFlow","basis","from","to"])||!unsigned(r.income)||!unsigned(r.expenses)||!exact(r.netCashFlow)||r.basis!=="projected_occurrences"||r.from!==range.from||r.to!==range.to)throw invalid();
  if(!Array.isArray(d.incomeVsExpenses)||d.incomeVsExpenses.length<1||d.incomeVsExpenses.length>13)throw invalid();
  let previous="";
  for(const row of d.incomeVsExpenses){
    if(!object(row)||!keys(row,["period","from","to","income","expenses","netSavings"])||!text(row.period,7)||!/^\d{4}-\d{2}$/.test(row.period as string)||!date(row.from)||!date(row.to)||row.from>row.to||row.from<range.from||row.to>range.to||row.from.slice(0,7)!==row.period||row.to.slice(0,7)!==row.period||row.from<=previous||!totals(row))throw invalid();
    previous=row.to;
  }
  for(const field of ["expenseByCategory","incomeByCategory"]){
    const rows=d[field];if(!Array.isArray(rows))throw invalid();
    for(const row of rows)if(!object(row)||!keys(row,["categoryId","categoryName","amount","percentage"])||!uuid(row.categoryId)||!text(row.categoryName,80)||!unsigned(row.amount)||(row.percentage!==null&&!unsigned(row.percentage)))throw invalid();
    if(new Set(rows.map(row=>row.categoryId)).size!==rows.length)throw invalid();
  }
  if(!Array.isArray(d.accountActivity))throw invalid();
  for(const row of d.accountActivity)if(!object(row)||!keys(row,["accountId","accountName","type","income","expenses","netSavings","incomingTransfers","outgoingTransfers"])||!uuid(row.accountId)||!text(row.accountName,100)||!accountTypes.includes(row.type as AccountType)||!totals(row)||!unsigned(row.incomingTransfers)||!unsigned(row.outgoingTransfers)||(range.accountId&&row.accountId!==range.accountId))throw invalid();
  if(new Set(d.accountActivity.map(row=>row.accountId)).size!==d.accountActivity.length)throw invalid();
  // Validate structure only: no financial reconciliation or response transformation.
  return d as AnalyticsOverview;
}
export function createAnalyticsClient(userId:string,transport=createSessionClient(userId)) {
  return {async getAnalyticsOverview(range:AnalyticsRange,options?:V2RequestOptions):Promise<AnalyticsOverview>{
    if(analyticsRangeError(range)||(range.accountId!==undefined&&!uuid(range.accountId)))throw new V2ApiError(0,"INVALID_REQUEST","unexpected");
    return parseAnalytics(await transport.get("/analytics/overview",{...options,query:{from:range.from,to:range.to,...(range.accountId?{accountId:range.accountId}:{})}}),range);
  }};
}

"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { createAnalyticsClient } from "../../lib/api/analytics";
import { createAccountClient } from "../../lib/api/accounts";
import { createAnalyticsStore } from "../../lib/analytics-store";
import { analyticsLabels, analyticsPeriods, analyticsRangeError, resolveAnalyticsPeriod, type AnalyticsPeriod } from "../../lib/analytics-range";
import { PageHeader } from "../../components/v2/app-shell";
import { MoneyDisplay, SummaryCard } from "../../components/v2/finance";
import { Button, Disclosure, EmptyState, ErrorState, FormField, Select, Skeleton, StaleIndicator } from "../../components/v2/primitives";
import { PrototypeShell } from "./shell";
import { AnalyticsCategories, AnalyticsFlow, AnalyticsSavings } from "./analytics-charts";
export function AnalyticsPage(){const {user}=useAuth();return user?<ConnectedAnalytics key={user.id} userId={user.id}/>:null;}
function ConnectedAnalytics({userId}:{userId:string}){
  const {invalidateSession,signOut}=useAuth();
  const [store]=useState(()=>createAnalyticsStore(createAnalyticsClient(userId),createAccountClient(userId),resolveAnalyticsPeriod("30_days")));
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
  const [period,setPeriod]=useState<AnalyticsPeriod>("30_days"),[from,setFrom]=useState(state.range.from),[to,setTo]=useState(state.range.to),[error,setError]=useState("");
  const id=useId(),fromRef=useRef<HTMLInputElement>(null);
  useEffect(()=>store.start(),[store]);
  useEffect(()=>{if(state.authError){invalidateSession();void signOut();}},[state.authError,invalidateSession,signOut]);
  if(state.authError)return null;
  const scope=state.loadedRange?.accountId?state.overview?.accountActivity[0]?.accountName??"Selected account":"All accounts";
  const data=state.overview,range=data?`${data.period.from} – ${data.period.to}`:"";
  function choose(value:AnalyticsPeriod){setPeriod(value);setError("");if(value!=="custom"){const r=resolveAnalyticsPeriod(value);setFrom(r.from);setTo(r.to);store.setRange({...r,...(state.range.accountId?{accountId:state.range.accountId}:{})});}}
  return <PrototypeShell liveAnalytics>
    <PageHeader title="Analytics"/>
    <form className="t40-controls" onSubmit={e=>{e.preventDefault();const range={from,to,...(state.range.accountId?{accountId:state.range.accountId}:{})};const message=analyticsRangeError(range);setError(message??"");if(message)fromRef.current?.focus();else store.setRange(range);}}>
      <FormField id={`${id}-period`} label="Analytics range"><Select id={`${id}-period`} value={period} onChange={e=>choose(e.target.value as AnalyticsPeriod)}>{analyticsPeriods.map(p=><option key={p} value={p}>{analyticsLabels[p]}</option>)}</Select></FormField>
      <FormField id={`${id}-account`} label="Account"><Select id={`${id}-account`} value={state.range.accountId??""} onChange={e=>store.setRange({from:state.range.from,to:state.range.to,...(e.target.value?{accountId:e.target.value}:{})})}><option value="">All accounts</option>{state.accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.status==="archived"?" (Archived)":""}</option>)}</Select></FormField>
      {period==="custom"&&<><FormField id={`${id}-from`} label="From (inclusive)"><input ref={fromRef} className="v2-input" id={`${id}-from`} type="date" min="1900-01-01" max="9999-12-31" value={from} onChange={e=>setFrom(e.target.value)} aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined}/></FormField><FormField id={`${id}-to`} label="To (inclusive)"><input className="v2-input" id={`${id}-to`} type="date" min="1900-01-01" max="9999-12-31" value={to} onChange={e=>setTo(e.target.value)} aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined}/></FormField><Button type="submit">Apply range</Button></>}
      <Button type="button" variant="secondary" disabled={state.loading} onClick={()=>void store.refresh()}>Refresh<span className="v2-sr-only"> analytics</span></Button>
      {error&&<p id={`${id}-error`} role="alert" className="t40-range-error">{error}</p>}
    </form>
    <p role="status" className={state.loading||state.error?"v2-helper":"v2-sr-only"}>{state.loading?data?`Refreshing analytics… Showing last loaded ${range} (${scope}).`:"Loading your analytics…":state.error?"Analytics refresh failed.":"Analytics is up to date."}</p>
    {state.error&&<ErrorState title="Analytics unavailable" description={state.error} onRetry={()=>void store.refresh()}/>}
    {data&&state.error&&<StaleIndicator>Last loaded {range} · {scope} · refresh failed</StaleIndicator>}
    {!data&&state.loading&&<div role="group" aria-label="Loading analytics" aria-busy="true"><Skeleton variant="metric"/><Skeleton variant="chart"/></div>}
    {data&&<div className="t40-content" aria-busy={state.loading}>
      <section className="p4-panel t40-narrative" aria-labelledby={`${id}-actuals`}><p className="v2-eyebrow">Posted actuals · {range} · Africa/Cairo</p><h2 id={`${id}-actuals`} className="v2-sr-only">Period overview</h2><SummaryCard label="Net savings" value={data.summary.netSavings} emphasis caption={data.summary.netSavings.startsWith("-")?"Expenses exceed income":"Income less expenses"}/><div className="v2-metric-strip"><SummaryCard label="Income" value={data.summary.income} kind="income"/><SummaryCard label="Expenses" value={data.summary.expenses} kind="expense"/></div><Disclosure title="Period details"><dl className="t40-derived"><div><dt>Savings rate</dt><dd>{data.summary.savingsRatePercent===null?"Not applicable":`${data.summary.savingsRatePercent}%`}</dd></div><div><dt>Average daily spend</dt><dd><MoneyDisplay value={data.summary.averageDailyExpense}/></dd></div></dl><p className="v2-helper">{data.period.calendarDays} inclusive days. Transfers excluded. {scope}.</p></Disclosure></section>
      <section className="p4-panel" aria-labelledby={`${id}-forecast`}><Disclosure title="Expected recurring commitments"><p className="v2-eyebrow">Expected · separate from actuals</p><h2 id={`${id}-forecast`}>Recurring commitments</h2><p className="v2-helper">Projected occurrences for {data.recurring.from} – {data.recurring.to}, using current active schedules. These values are not posted income or spending.</p><SummaryCard label="Projected income" value={data.recurring.income} kind="income"/><SummaryCard label="Projected expenses" value={data.recurring.expenses} kind="expense"/><SummaryCard label="Projected net cash flow" value={data.recurring.netCashFlow}/></Disclosure></section>
      <section className="p4-panel t40-trends" aria-labelledby={`${id}-trends`}><h2 id={`${id}-trends`}>Monthly actuals</h2>{data.summary.income==="0.00"&&data.summary.expenses==="0.00"&&<EmptyState title="Build your financial picture" description="More transaction history is needed to understand your trends. Choose another range or record a transaction."/>}<div className="t40-trend-grid"><AnalyticsFlow rows={data.incomeVsExpenses} period={range}/><Disclosure title="Savings trend"><AnalyticsSavings rows={data.incomeVsExpenses} period={range}/></Disclosure></div><Disclosure title="Monthly data"><div className="t40-table-scroll" tabIndex={0} role="region" aria-label="Monthly actuals data"><table className="t40-table"><caption>Monthly income, expenses and savings</caption><thead><tr><th scope="col">Inclusive dates</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Net savings</th></tr></thead><tbody>{data.incomeVsExpenses.map(r=><tr key={r.period}><th scope="row">{r.from} – {r.to}</th><td><MoneyDisplay value={r.income}/></td><td><MoneyDisplay value={r.expenses}/></td><td><MoneyDisplay value={r.netSavings}/></td></tr>)}</tbody></table></div></Disclosure></section>
      <section className="p4-panel" aria-label="Category breakdowns"><AnalyticsCategories rows={data.expenseByCategory} title="Spending by category" period={range}/><Disclosure title="Income sources"><AnalyticsCategories rows={data.incomeByCategory} title="Income sources" period={range}/></Disclosure></section>
      <section className="p4-panel t40-accounts" aria-labelledby={`${id}-accounts`}><Disclosure title="Account activity details"><h2 id={`${id}-accounts`}>Account activity</h2><p className="v2-helper">Historical actuals, including archived accounts. Transfers are separate movements.</p>{data.accountActivity.length===0?<EmptyState title="No account activity" description="Your accounts and their period activity will appear here."/>:data.accountActivity.map(a=><article className="t40-account" key={a.accountId}><h3>{a.accountName}</h3><dl>{([["Income",a.income],["Expenses",a.expenses],["Net savings",a.netSavings],["Transferred in",a.incomingTransfers],["Transferred out",a.outgoingTransfers]] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd><MoneyDisplay value={value}/></dd></div>)}</dl></article>)}</Disclosure></section>
    </div>}
  </PrototypeShell>;
}

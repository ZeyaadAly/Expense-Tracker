"use client";
import Link from "next/link";
import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { createDashboardClient, dashboardPeriods, periodLabels, type DashboardPeriod } from "../../lib/api/dashboard";
import { createDashboardStore } from "../../lib/dashboard-store";
import { PageHeader } from "../../components/v2/app-shell";
import { AccountRow, MoneyDisplay, SummaryCard, TypeBadge, UpcomingItem } from "../../components/v2/finance";
import { Button, EmptyState, ErrorState, FormField, Select, Skeleton, StaleIndicator } from "../../components/v2/primitives";
import { PrototypeShell } from "./shell";

export function DashboardPage() {
  const { user } = useAuth();
  return user ? <ConnectedDashboard key={user.id} userId={user.id} /> : null;
}
function Panel({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  const id = useId();
  return <section className="p4-panel" aria-labelledby={id}><div className="t37-panel-heading"><h2 id={id}>{title}</h2><Link href={href}>View all<span className="v2-sr-only"> {title}</span></Link></div>{children}</section>;
}
function ConnectedDashboard({ userId }: { userId: string }) {
  const { invalidateSession, signOut } = useAuth();
  const [store] = useState(() => createDashboardStore(createDashboardClient(userId)));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const id = useId();
  useEffect(() => store.start(), [store]);
  useEffect(() => { if (state.authError) { invalidateSession(); void signOut(); } }, [state.authError, invalidateSession, signOut]);
  if (state.authError) return null;
  const response = state.dashboard, data = response?.data;
  return <PrototypeShell liveDashboard>
    <PageHeader title="Your money, in perspective" description="A clear view of today. A thoughtful plan for tomorrow." actions={<div className="t37-controls">
      <FormField id={`${id}-period`} label="Dashboard period"><Select id={`${id}-period`} value={state.period} onChange={e => store.setPeriod(e.target.value as DashboardPeriod)}>{dashboardPeriods.map(p => <option key={p} value={p}>{periodLabels[p]}</option>)}</Select></FormField>
      <Button variant="secondary" disabled={state.loading} onClick={() => void store.refresh()}>Refresh dashboard</Button>
    </div>} />
    <p role="status" className="v2-helper">{state.loading ? data ? `Refreshing ${periodLabels[state.period].toLowerCase()}… Showing last loaded ${periodLabels[data.period.key].toLowerCase()} values.` : "Loading your dashboard…" : state.error ? "Dashboard refresh failed." : "Dashboard is up to date."}</p>
    {state.error && <ErrorState title="Dashboard unavailable" description={state.error} onRetry={() => void store.refresh()} />}
    {state.error && data && <StaleIndicator>Last loaded {periodLabels[data.period.key].toLowerCase()} values · refresh failed</StaleIndicator>}
    {!data && state.loading && <div role="group" className="p4-overview" aria-label="Loading dashboard" aria-busy="true"><div><Skeleton variant="metric" /><Skeleton variant="chart" /></div><Skeleton variant="transaction" /></div>}
    {data && <>
      <div className="p4-overview t37-overview" aria-busy={state.loading}>
        <div>
          <p className="v2-eyebrow">Financial position · all history</p>
          <SummaryCard label="Net position" value={data.summary.totalBalance} emphasis caption="Assets less signed card debt · archived balances included" />
          <div className="t37-position">
            <section aria-label="Total assets"><h2>Total assets</h2><MoneyDisplay value={data.summary.assets} /><p className="v2-helper">Signed non-card balances</p></section>
            <section aria-label="Signed card debt"><h2>Signed card debt</h2><MoneyDisplay value={data.summary.cardDebt} kind="debt" /><p className="v2-helper">{data.summary.cardDebt.startsWith("-") ? "Overpayment · credit owed to you" : "Amount owed across cards"}</p></section>
          </div>
          <div className="v2-metric-strip">
            <SummaryCard label="Income" value={data.summary.income} kind="income" />
            <SummaryCard label="Expenses" value={data.summary.expenses} kind="expense" />
            <SummaryCard label="Net savings" value={data.summary.netSavings} caption={data.summary.netSavings.startsWith("-") ? "Expenses exceed income" : "Income less expenses"} />
          </div>
          <p className="v2-helper" data-testid="dashboard-range">Posted actuals · {periodLabels[data.period.key]} · <time dateTime={data.period.from}>{data.period.from}</time> – <time dateTime={data.period.to}>{data.period.to}</time> · {data.period.timezone}. Transfers excluded.</p>
        </div>
        <Panel title="Your accounts" href="/v2/accounts">
          <p className="v2-helper">Current balances · active and archived accounts</p>
          {data.accounts.length === 0 ? <EmptyState title="Start with an account" description="Add where you keep your money to begin your financial overview." action={<Link className="v2-button v2-button--primary" href="/v2/accounts">Add account</Link>} /> : data.accounts.map(a => <Link key={a.id} href={`/v2/accounts/${a.id}`} className="t37-account"><AccountRow account={{ id: a.id, name: a.name, type: a.type, balance: a.currentBalance, archived: a.status === "archived" }} /></Link>)}
        </Panel>
      </div>
      <div className="p4-columns t37-activity">
        <Panel title="Recent activity" href="/v2/transactions">
          <p className="v2-helper">Latest posted transactions · all history</p>
          {data.recentTransactions.length === 0 ? <EmptyState title="No transactions yet" description="Your latest income and expenses will appear here." action={<Link className="v2-button v2-button--secondary" href="/v2/transactions">Add transaction</Link>} /> : <ol className="t37-list">{data.recentTransactions.map(t => <li key={t.id} className="v2-data-row"><div><strong>{t.description}</strong><p className="v2-helper">{t.accountName} · {t.categoryName} · <time dateTime={t.date}>{t.date}</time></p><TypeBadge type={t.type} />{t.recurringTransactionId && <span className="v2-badge">Generated</span>}</div><MoneyDisplay value={t.amount} kind={t.type} /></li>)}</ol>}
        </Panel>
        <Panel title="Coming up" href="/v2/recurring">
          <p className="v2-helper">Expected activity · separate from posted actuals</p>
          <p className="v2-helper">{response.meta.upcoming.from} – {response.meta.upcoming.to} · Africa/Cairo</p>
          {data.upcomingRecurring.length === 0 ? <EmptyState title="No upcoming recurring activity" description="Plan repeating income or expenses when you’re ready." action={<Link className="v2-button v2-button--secondary" href="/v2/recurring">Add recurring item</Link>} /> : <ol className="t37-list">{data.upcomingRecurring.map(item => <li key={`${item.recurringTransactionId}:${item.occurrenceDate}`}><UpcomingItem item={{ name: item.description, account: item.accountName, amount: item.amount, type: item.type, date: item.occurrenceDate }} /></li>)}</ol>}
        </Panel>
      </div>
    </>}
  </PrototypeShell>;
}

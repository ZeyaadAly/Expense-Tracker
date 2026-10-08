"use client";
import Link from "next/link";
import {useEffect,useState,useSyncExternalStore} from "react";
import {useAuth} from "../../lib/auth/auth-provider";
import {createAccountClient} from "../../lib/api/accounts";
import {createAccountsStore} from "../../lib/accounts-store";
import {PrototypeShell} from "./shell";
import {TransfersPanel} from "./transfers-panel";
import {AccountDialog,accountTypeLabels,type AccountAction} from "./accounts-page";
import {PageHeader} from "../../components/v2/app-shell";
import {SummaryCard} from "../../components/v2/finance";
import {Button,EmptyState,ErrorState,FeedbackBanner,Skeleton,StaleIndicator} from "../../components/v2/primitives";

export function AccountDetailPage({id}:{id:string}) {
  const {user}=useAuth();
  return user?<ConnectedAccountDetail key={`${user.id}:${id}`} userId={user.id} id={id}/>:null;
}
function ConnectedAccountDetail({userId,id}:{userId:string;id:string}) {
  const {invalidateSession,signOut}=useAuth();
  const [client]=useState(()=>createAccountClient(userId));
  const [store]=useState(()=>createAccountsStore(client,id));
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
  const [action,setAction]=useState<AccountAction|null>(null);
  useEffect(()=>store.start(),[store]);
  useEffect(()=>{if(state.authError){invalidateSession();void signOut();}},[state.authError,invalidateSession,signOut]);
  if(state.authError)return null;
  const account=state.accounts?.[0],summary=state.detailSummary;
  const open=(next:AccountAction)=>{store.clearMutation();setAction(next);};
  const close=()=>{if(!state.pending){setAction(null);store.clearMutation();}};
  const card=account?.type==='credit_card';
  const balanceLabel=card?(account.currentBalance.startsWith('-')?'Credit / overpayment':'Amount owed'):'Current balance';
  return <PrototypeShell liveAccounts>
    <div className="account-detail">
      <Link href="/v2/accounts">Back to accounts</Link>
      <PageHeader title={account?.name??(state.notFound?'Account not found':'Account details')} description={account?`${accountTypeLabels[account.type]} · ${account.status==='archived'?'Archived':'Active'} · EGP`:'Your account information.'} actions={account?<>
        <Button variant="secondary" disabled={state.pending} onClick={()=>open({kind:'edit',account})}>Edit account</Button>
        <Button variant={account.status==='active'?'danger':'primary'} disabled={state.pending} onClick={()=>open({kind:account.status==='active'?'archive':'restore',account})}>{account.status==='active'?'Archive account':'Restore account'}</Button>
      </>:undefined}/>
      {state.loading&&<><p role="status">Loading account details…</p>{!account&&<Skeleton variant="account"/>}</>}
      {state.notFound?<EmptyState title="Account not found" description="This account is unavailable."/>:<>
        {state.notice&&<FeedbackBanner tone={state.error?'warning':'success'} title={state.notice}/>}
        {state.error&&<ErrorState title="Account could not refresh" description={state.error} onRetry={()=>void store.refresh()}/>}
        {state.error&&account&&<StaleIndicator/>}
        {account&&summary&&<>
          {account.status==='archived'&&<FeedbackBanner tone="warning" title="Archived account">Historical balances remain available. Restore this account to make it active; recurring schedules remain paused.</FeedbackBanner>}
          <section aria-labelledby="account-financial-summary"><h2 id="account-financial-summary">Financial summary</h2>
            <div className="account-detail-summary">
              <SummaryCard label={balanceLabel} value={summary.currentBalance} kind={card?'debt':'balance'} emphasis caption={card?'Positive means debt; negative means credit / overpayment. Currency: EGP.':'Authoritative balance · EGP'}/>
              <SummaryCard label="Opening balance" value={summary.openingBalance} caption="EGP"/>
              <SummaryCard label="Total income" value={summary.totalIncome} caption="All posted income · EGP"/>
              <SummaryCard label="Total expenses" value={summary.totalExpenses} caption="All posted expenses · EGP"/>
              <SummaryCard label="Incoming transfers" value={summary.incomingTransfers} caption="All posted transfers in · EGP"/>
              <SummaryCard label="Outgoing transfers" value={summary.outgoingTransfers} caption="All posted transfers out · EGP"/>
            </div>
          </section>
          <section className="p4-panel" aria-labelledby="account-metadata"><h2 id="account-metadata">Account information</h2><dl className="account-detail-metadata">
            <div><dt>Created</dt><dd>{new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'Africa/Cairo'}).format(new Date(account.createdAt))}</dd></div>
            <div><dt>Account type</dt><dd>{accountTypeLabels[account.type]}</dd></div>
            <div><dt>Status</dt><dd>{account.status==='archived'?'Archived':'Active'}</dd></div>
            <div><dt>Opening balance</dt><dd>{account.openingBalance} EGP{!account.openingBalanceEditable?' · Locked after posted activity':''}</dd></div>
          </dl></section>
          <TransfersPanel key={account.id} userId={userId} account={account} refreshBalances={()=>store.refresh()} disabled={state.pending}/>
          <Button variant="secondary" disabled={state.loading||state.pending} onClick={()=>void store.refresh()}>Refresh account</Button>
        </>}
      </>}
      {action&&<AccountDialog key={action.kind+action.account?.id} action={action} state={state} store={store} client={client} close={close}/>}
    </div>
  </PrototypeShell>;
}

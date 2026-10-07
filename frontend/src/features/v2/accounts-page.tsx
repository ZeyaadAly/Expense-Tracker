"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { createAccountClient, validateAccountInput, accountTypes, type Account, type AccountInput, type AccountStatus } from "../../lib/api/accounts";
import { createAccountsStore } from "../../lib/accounts-store";
import { PrototypeShell } from "./shell";
import { PageHeader } from "../../components/v2/app-shell";
import { AccountCard, SummaryCard } from "../../components/v2/finance";
import { Button, DialogShell, EmptyState, ErrorState, FeedbackBanner, FormField, MoneyInput, SegmentedControl, Select, Skeleton, StaleIndicator, TextInput } from "../../components/v2/primitives";

const labels={cash:'Cash',bank:'Bank',savings:'Savings',credit_card:'Credit card',mobile_wallet:'Mobile wallet',other:'Other'};
type Action={kind:'create'|'edit'|'archive'|'restore';account?:Account};
export function AccountsPage() {
  const {user}=useAuth();return user?<ConnectedAccounts key={user.id} userId={user.id}/>:null;
}
function ConnectedAccounts({userId}:{userId:string}) {
  const {invalidateSession,signOut}=useAuth();
  const [client]=useState(()=>createAccountClient(userId));
  const [store]=useState(()=>createAccountsStore(client));
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
  const [action,setAction]=useState<Action|null>(null);
  useEffect(()=>store.start(),[store]);
  useEffect(()=>{if(state.authError){invalidateSession();void signOut();}},[state.authError,invalidateSession,signOut]);
  if(state.authError)return null;
  const open=(next:Action)=>{store.clearMutation();setAction(next);};
  const close=()=>{if(!state.pending){setAction(null);store.clearMutation();}};
  return <PrototypeShell liveAccounts>
    <PageHeader title="Accounts" description="Where your money lives — and what you owe." actions={<><Button variant="secondary" disabled={state.loading||state.pending} onClick={()=>void store.refresh()}>Refresh accounts</Button><Button disabled={state.pending} onClick={()=>open({kind:'create'})}>Add account</Button></>}/>
    {state.notice&&<FeedbackBanner tone={state.error?'warning':'success'} title={state.notice}/>}
    {state.error&&<ErrorState title="Accounts could not refresh" description={state.error} onRetry={()=>void store.refresh()}/>}
    {state.error&&(state.accounts||state.summary)&&<StaleIndicator/>}
    <h2 className="v2-sr-only">Accounts overview</h2>
    {state.summary?<SummaryCard label="Net position" value={state.summary.netPosition} emphasis caption="Includes archived accounts. Positive credit-card balance is debt; negative card balance is a credit."/>:state.loading?<Skeleton variant="metric"/>:<p className="v2-helper">Net position is unavailable.</p>}
    <SegmentedControl label="Account status" options={['Active','Archived']} value={state.status==='active'?'Active':'Archived'} onChange={value=>{if(!state.pending)void store.refresh(value.toLowerCase() as AccountStatus);}}/>
    {state.loading&&<p role="status">Loading accounts…</p>}
    {state.accounts===null?state.loading?<div className="p4-account-grid"><Skeleton variant="account"/><Skeleton variant="account"/></div>:null:state.accounts.length===0?<EmptyState title={state.status==='active'?'No accounts yet.':'No archived accounts.'} description={state.status==='active'?'Add an account to start your financial picture.':'Archived accounts remain in history and net position.'} action={state.status==='active'?<Button onClick={()=>open({kind:'create'})}>Add your first account</Button>:undefined}/>:<div className="p4-account-grid">{state.accounts.map(account=><div key={account.id}><AccountCard account={{id:account.id,name:account.name,type:account.type,balance:account.currentBalance,archived:account.status==='archived'}}/><div className="v2-actions"><Button variant="text" disabled={state.pending} onClick={()=>open({kind:'edit',account})}>Edit<span className="v2-sr-only"> {account.name}</span></Button><Button variant="text" disabled={state.pending} onClick={()=>open({kind:account.status==='active'?'archive':'restore',account})}>{account.status==='active'?'Archive':'Restore'}<span className="v2-sr-only"> {account.name}</span></Button></div></div>)}</div>}
    <section className="p4-panel"><h2>Transfers</h2><Button disabled>New transfer</Button><p className="v2-helper">Transfers are not available yet. Account balances reflect posted activity only.</p></section>
    {action&&<AccountDialog key={action.kind+action.account?.id} action={action} state={state} store={store} client={client} close={close}/>}
  </PrototypeShell>;
}
function AccountDialog({action,state,store,client,close}:{action:Action;state:ReturnType<ReturnType<typeof createAccountsStore>['getSnapshot']>;store:ReturnType<typeof createAccountsStore>;client:ReturnType<typeof createAccountClient>;close:()=>void}) {
  const prefix=useId(),account=action.account,editing=action.kind==='edit',form=editing||action.kind==='create';
  const [draft,setDraft]=useState<AccountInput>({name:account?.name??'',type:account?.type??'cash',openingBalance:account?.openingBalance??'0.00'});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const submitting=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const title=form?(editing?'Edit account':'Add account'):`${action.kind==='archive'?'Archive':'Restore'} ${account?.name}?`;
  const locked=editing&&!account?.openingBalanceEditable;
  const fieldErrors={...errors,...state.mutationError?.fields};
  const focus=(fields:Record<string,string>)=>{const name=Object.keys(fields).find(key=>['name','type','openingBalance'].includes(key));if(name)setTimeout(()=>document.getElementById(`${prefix}-${name}`)?.focus(),0);};
  async function submit() {
    if(submitting.current||state.pending||state.mutationError?.uncertain)return;
    const validation=form?validateAccountInput(draft):{};setErrors(validation);if(Object.keys(validation).length){focus(validation);return;}
    submitting.current=true;
    const result=await store.mutate(options=>action.kind==='create'?client.createAccount({...draft,name:draft.name.trim()},options):action.kind==='edit'?client.updateAccount(account!.id,{...draft,name:draft.name.trim()},options):action.kind==='archive'?client.archiveAccount(account!.id,options):client.restoreAccount(account!.id,options),action.kind==='archive'?'Account archived. Linked active recurring schedules were paused.':action.kind==='restore'?'Account restored. Recurring schedules remain paused until resumed separately.':'Account saved.');
    submitting.current=false;if(!mounted.current)return;
    if(result)close();else focus(store.getSnapshot().mutationError?.fields??{});
  }
  return <DialogShell title={title} description={form?'Currency is EGP. Positive credit-card opening balance is debt; negative is an overpayment.':action.kind==='archive'?'Account history remains. Linked active recurring schedules will be paused. Restoring this account will not resume them.':'The account will become active. Paused recurring schedules must be resumed separately.'} onClose={close} state={state.pending?'pending':'default'}>
    {state.mutationError&&<FeedbackBanner tone={state.mutationError.uncertain?'warning':'error'} title={state.mutationError.message}/>}
    {form&&<form onSubmit={event=>{event.preventDefault();void submit();}}>
      <FormField id={`${prefix}-name`} label="Account name" required error={fieldErrors.name}><TextInput id={`${prefix}-name`} data-initial-focus value={draft.name} disabled={state.pending} aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name?`${prefix}-name-error`:undefined} onChange={e=>setDraft({...draft,name:e.target.value})}/></FormField>
      <FormField id={`${prefix}-type`} label="Account type" required error={fieldErrors.type} hint={locked?'Posted activity locks conversion between credit cards and asset accounts.':undefined}><Select id={`${prefix}-type`} value={draft.type} disabled={state.pending} aria-invalid={!!fieldErrors.type} aria-describedby={[locked?`${prefix}-type-hint`:'',fieldErrors.type?`${prefix}-type-error`:''].filter(Boolean).join(' ')||undefined} onChange={e=>setDraft({...draft,type:e.target.value as AccountInput['type']})}>{accountTypes.map(type=><option key={type} value={type} disabled={locked&&((account!.type==='credit_card')!==(type==='credit_card'))}>{labels[type]}</option>)}</Select></FormField>
      <FormField id={`${prefix}-openingBalance`} label="Opening balance" required error={fieldErrors.openingBalance} hint={locked?'Opening balance is locked after posted activity.':'Use a decimal amount. Negative asset balances and card overpayments are allowed.'}><MoneyInput id={`${prefix}-openingBalance`} value={draft.openingBalance} disabled={state.pending||locked} aria-invalid={!!fieldErrors.openingBalance} aria-describedby={[`${prefix}-openingBalance-hint`,fieldErrors.openingBalance?`${prefix}-openingBalance-error`:''].filter(Boolean).join(' ')} onChange={e=>setDraft({...draft,openingBalance:e.target.value})}/></FormField>
      <FormField id={`${prefix}-currency`} label="Currency"><TextInput id={`${prefix}-currency`} value="EGP" readOnly/></FormField>
      <div className="v2-actions"><Button variant="secondary" disabled={state.pending} onClick={close}>Cancel</Button><Button type="submit" loading={state.pending} disabled={state.mutationError?.uncertain}>Save account</Button></div>
    </form>}
    {!form&&<div className="v2-actions"><Button data-initial-focus variant="secondary" disabled={state.pending} onClick={close}>Cancel</Button><Button variant={action.kind==='archive'?'danger':'primary'} loading={state.pending} disabled={state.mutationError?.uncertain} onClick={()=>void submit()}>{action.kind==='archive'?'Archive account':'Restore account'}</Button></div>}
    {state.mutationError&&<Button variant="secondary" disabled={state.loading||state.pending} onClick={async()=>{if(await store.refresh())close();}}>Refresh accounts and inspect</Button>}
  </DialogShell>;
}

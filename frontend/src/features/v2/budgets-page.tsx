"use client";
import {useEffect,useId,useRef,useState,useSyncExternalStore} from "react";
import {useAuth} from "../../lib/auth/auth-provider";
import {createBudgetClient,validateBudgetDraft,type Budget,type BudgetPeriod} from "../../lib/api/budgets";
import {createCategoryClient} from "../../lib/api/categories";
import {cairoToday} from "../../lib/api/v2-transactions";
import {createBudgetsStore} from "../../lib/budgets-store";
import {PageHeader} from "../../components/v2/app-shell";
import {BudgetRow,MoneyDisplay} from "../../components/v2/finance";
import {Button,DialogShell,EmptyState,ErrorState,FeedbackBanner,FormField,MoneyInput,Select,Skeleton,StaleIndicator,TextInput} from "../../components/v2/primitives";
import {PrototypeShell} from "./shell";
const periodText=(p:BudgetPeriod)=>`${p.year}-${String(p.month).padStart(2,'0')}`;
const currentPeriod=()=>{const [year,month]=cairoToday().split('-').map(Number);return {year,month};};
type Action={kind:'create'|'edit'|'delete';id?:string};
type Store=ReturnType<typeof createBudgetsStore>;
export function BudgetsPage(){const {user}=useAuth();return user?<ConnectedBudgets key={user.id} userId={user.id}/>:null;}
function ConnectedBudgets({userId}:{userId:string}){
  const {invalidateSession,signOut}=useAuth();
  const [client]=useState(()=>createBudgetClient(userId));
  const [store]=useState(()=>createBudgetsStore(client,createCategoryClient(userId),currentPeriod()));
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
  const [month,setMonth]=useState(periodText(state.period)),[action,setAction]=useState<Action|null>(null);const id=useId();
  useEffect(()=>store.start(),[store]);
  useEffect(()=>{if(state.authError){invalidateSession();void signOut();}},[state.authError,invalidateSession,signOut]);
  if(state.authError)return null;
  const validMonth=/^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(month);
  const loaded=state.loadedPeriod?periodText(state.loadedPeriod):'',different=loaded!==periodText(state.period);
  const open=(next:Action)=>{store.clearAction();setAction(next);if(next.id)void store.loadResource(next.id);else void store.loadOptions();};
  const close=()=>{if(!state.pending&&!state.inspecting){setAction(null);store.clearAction();setTimeout(()=>{if(document.activeElement===document.body)document.getElementById(`${id}-add`)?.focus();},0);}};
  return <PrototypeShell liveBudgets>
    <PageHeader title="Budgets" description="Thoughtful limits. A clearer view of your spending." actions={<><Button variant="secondary" disabled={state.loading||state.pending} onClick={()=>{void store.refresh();void store.loadOptions();}}>Refresh budgets</Button><Button id={`${id}-add`} disabled={state.pending||!validMonth} onClick={()=>open({kind:'create'})}>Add budget</Button></>}/>
    <FormField id={`${id}-month`} label="Budget month" error={validMonth?undefined:'Choose a month from 1900-01 through 9999-12.'}><TextInput id={`${id}-month`} className="t44-month" type="month" min="1900-01" max="9999-12" value={month} disabled={state.pending} aria-invalid={!validMonth} aria-describedby={!validMonth?`${id}-month-error`:undefined} onChange={e=>{const value=e.target.value;setMonth(value);if(/^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value)){close();const [year,month]=value.split('-').map(Number);store.setPeriod({year,month});}}}/></FormField>
    <p role="status" className="v2-helper">{state.loading?state.rows?`Refreshing budgets… Showing last loaded ${loaded}.`:'Loading your budgets…':state.error?'Budget refresh failed.':`Budgets are up to date for ${loaded}.`}</p>
    {state.notice&&<FeedbackBanner tone={state.error?'warning':'success'} title={state.notice}/>}
    {state.error&&<ErrorState title="Budgets unavailable" description={state.error} onRetry={()=>void store.refresh()}/>}
    {state.error&&state.rows&&<StaleIndicator>Last loaded {loaded} · refresh failed</StaleIndicator>}
    <h2 className="v2-sr-only">Monthly category budgets</h2>
    {state.rows===null?state.loading?<div aria-busy="true" aria-label="Loading budgets"><Skeleton variant="metric"/><Skeleton variant="transaction"/></div>:null:state.rows.length===0?<EmptyState title="No budgets for this month." description={`Plan category spending for ${loaded}. Your expenses remain independent of these limits.`} action={<Button disabled={state.pending||!validMonth} onClick={()=>open({kind:'create'})}>Add budget</Button>}/>:<div className="p4-planning-list t44-list" aria-busy={state.loading}>{state.rows.map(b=><div className="t44-budget" data-budget-id={b.id} key={b.id}><BudgetRow name={b.categoryName} allocated={b.amount} spent={b.spent} remaining={b.remaining} percent={b.percentUsed} status={b.status}/><p className="v2-helper">{loaded} · Alert at {b.alertThresholdPercent}% {state.categories.find(c=>c.id===b.categoryId)?.status==='archived'&&<span className="v2-badge">Archived category</span>}</p><div className="v2-actions"><Button variant="text" disabled={state.pending||different} onClick={()=>open({kind:'edit',id:b.id})}>Edit<span className="v2-sr-only"> {b.categoryName}</span></Button><Button variant="text" disabled={state.pending||different} onClick={()=>open({kind:'delete',id:b.id})}>Delete<span className="v2-sr-only"> {b.categoryName}</span></Button></div></div>)}</div>}
    {action&&(action.kind!=='create'&&(!state.resource||state.resourceLoading)?<DialogShell title={action.kind==='edit'?'Edit budget':'Delete budget'} description="Checking the current budget." onClose={close}>{state.resourceLoading?<Skeleton variant="metric"/>:<ErrorState title="Budget unavailable" description={state.resourceError??'This budget is unavailable.'} onRetry={()=>void store.loadResource(action.id!)}/>}</DialogShell>:<BudgetDialog key={action.kind+action.id} action={action} budget={state.resource??undefined} state={state} store={store} client={client} close={close}/>)}
  </PrototypeShell>;
}
function BudgetDialog({action,budget,state,store,client,close}:{action:Action;budget?:Budget;state:ReturnType<Store['getSnapshot']>;store:Store;client:ReturnType<typeof createBudgetClient>;close:()=>void}){
  const create=action.kind==='create',form=action.kind!=='delete',id=useId();
  const [draft,setDraft]=useState({categoryId:budget?.categoryId??'',amount:budget?.amount??'',threshold:String(budget?.alertThresholdPercent??90)}),[errors,setErrors]=useState<Record<string,string>>({});
  const submitting=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const fields={...errors,...state.mutationError?.fields},period=budget?{year:budget.year,month:budget.month}:state.period;
  const focus=(values:Record<string,string>)=>{const first=['categoryId','amount','alertThresholdPercent'].find(k=>values[k]);if(first)setTimeout(()=>document.getElementById(`${id}-${first}`)?.focus(),0);};
  async function submit(){
    if(submitting.current||state.pending||state.mutationError?.uncertain)return;
    const validation=form?validateBudgetDraft(draft,create):{};if(create&&!state.categories.some(c=>c.id===draft.categoryId&&c.status==='active'))validation.categoryId="Choose an active expense category.";setErrors(validation);if(Object.keys(validation).length){focus(validation);return;}
    submitting.current=true;const update={amount:draft.amount,alertThresholdPercent:Number(draft.threshold)};
    const saved=await store.mutate(options=>create?client.createBudget({...update,...period,categoryId:draft.categoryId},options):form?client.updateBudget(budget!.id,update,options):client.deleteBudget(budget!.id,options),form?'Budget saved.':'Budget deleted. Expenses are unchanged.');
    submitting.current=false;if(!mounted.current)return;if(saved)close();else focus(store.getSnapshot().mutationError?.fields??{});
  }
  return <DialogShell title={create?'Add budget':form?'Edit budget':`Delete ${budget?.categoryName} budget?`} description={form?`Monthly limit for ${periodText(period)}. Category and period cannot change after creation.`:`Delete the ${budget?.amount} EGP limit for ${periodText(period)}. Historical expenses will remain unchanged.`} onClose={close} state={state.pending?'pending':'default'}>
    {state.mutationError&&<FeedbackBanner tone={state.mutationError.uncertain?'warning':'error'} title={state.mutationError.message}/>}
    {form&&<form noValidate onSubmit={e=>{e.preventDefault();void submit();}}>
      {create?<><FormField id={`${id}-categoryId`} label="Category" required error={fields.categoryId}><Select data-initial-focus id={`${id}-categoryId`} value={draft.categoryId} disabled={state.pending||state.optionsLoading||!!state.optionsError} aria-invalid={!!fields.categoryId} aria-describedby={fields.categoryId?`${id}-categoryId-error`:undefined} onChange={e=>setDraft({...draft,categoryId:e.target.value})}><option value="">Choose a category</option>{state.categories.filter(c=>c.status==='active').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField>{state.optionsLoading&&<p role="status">Loading categories…</p>}{state.optionsError&&<ErrorState title="Categories unavailable" description={state.optionsError} onRetry={()=>void store.loadOptions()}/>}</>:<p>Category: <strong>{budget?.categoryName}</strong> · {periodText(period)}</p>}
      {create&&<Button variant="text" disabled={state.pending||state.optionsLoading} onClick={()=>void store.loadOptions()}>Refresh category choices</Button>}
      <FormField id={`${id}-amount`} label="Budget amount" required error={fields.amount}><MoneyInput data-initial-focus={!create||undefined} id={`${id}-amount`} value={draft.amount} disabled={state.pending} aria-invalid={!!fields.amount} aria-describedby={fields.amount?`${id}-amount-error`:undefined} onChange={e=>setDraft({...draft,amount:e.target.value})}/></FormField>
      <FormField id={`${id}-alertThresholdPercent`} label="Alert threshold (%)" required error={fields.alertThresholdPercent} hint="Integer from 1 to 100; new budgets default to 90."><TextInput id={`${id}-alertThresholdPercent`} inputMode="numeric" value={draft.threshold} disabled={state.pending} aria-invalid={!!fields.alertThresholdPercent} aria-describedby={`${id}-alertThresholdPercent-${fields.alertThresholdPercent?'error':'hint'}`} onChange={e=>setDraft({...draft,threshold:e.target.value})}/></FormField>
      <div className="v2-actions"><Button variant="secondary" disabled={state.pending||state.inspecting} onClick={close}>Cancel</Button><Button type="submit" loading={state.pending} disabled={state.mutationError?.uncertain||state.inspecting||(create&&(state.optionsLoading||!!state.optionsError))}>Save budget</Button></div>
    </form>}
    {!form&&<div className="v2-actions"><Button data-initial-focus variant="secondary" disabled={state.pending||state.inspecting} onClick={close}>Cancel</Button><Button variant="danger" loading={state.pending} disabled={state.mutationError?.uncertain||state.inspecting} onClick={()=>void submit()}>Delete budget</Button></div>}
    {state.mutationError&&<>{state.notice&&<FeedbackBanner tone="warning" title={state.notice}/>}<Button variant="secondary" disabled={state.pending||state.inspecting} onClick={()=>void store.inspect(action.id)}>Inspect current budgets</Button>{state.inspection!==null&&<section aria-label="Latest budget inspection"><p>Latest confirmed server state:</p>{state.inspection.length?state.inspection.map(b=><p key={b.id}>{b.categoryName} · {periodText(b)} · limit <MoneyDisplay value={b.amount}/> · threshold {b.alertThresholdPercent}%</p>):<p>No matching budget is currently available.</p>}<Button variant="secondary" onClick={()=>store.allowRetry()}>I checked the current state; allow another attempt</Button></section>}</>}
  </DialogShell>;
}

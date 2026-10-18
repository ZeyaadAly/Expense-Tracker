"use client";
import {useEffect,useId,useRef,useState,useSyncExternalStore} from "react";
import {useAuth} from "../../lib/auth/auth-provider";
import {createGoalClient,goalIsFunded,goalUpdate,validateGoalDraft,type Goal,type GoalUpdate} from "../../lib/api/goals";
import {createAccountClient} from "../../lib/api/accounts";
import {createGoalsStore} from "../../lib/goals-store";
import {PageHeader} from "../../components/v2/app-shell";
import {GoalCard,MoneyDisplay} from "../../components/v2/finance";
import {Button,DialogShell,EmptyState,ErrorState,FeedbackBanner,FormField,MoneyInput,Select,Skeleton,StaleIndicator,TextInput} from "../../components/v2/primitives";
import {PrototypeShell} from "./shell";
type Action={kind:'create'|'edit'|'complete'|'reopen'|'archive';id?:string};
type Store=ReturnType<typeof createGoalsStore>;
const statusLabel=(status:Goal['status'])=>status==='active'?'Active':status==='completed'?'Completed':'Archived';
export function GoalsPage(){const {user}=useAuth();return user?<ConnectedGoals key={user.id} userId={user.id}/>:null;}
function ConnectedGoals({userId}:{userId:string}){
  const {invalidateSession,signOut}=useAuth();
  const [client]=useState(()=>createGoalClient(userId));
  const [store]=useState(()=>createGoalsStore(client,createAccountClient(userId)));
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
  const [action,setAction]=useState<Action|null>(null),id=useId();
  useEffect(()=>store.start(),[store]);
  useEffect(()=>{if(state.authError){invalidateSession();void signOut();}},[state.authError,invalidateSession,signOut]);
  if(state.authError)return null;
  const open=(next:Action)=>{store.clearAction();setAction(next);void store.loadOptions();if(next.id)void store.loadResource(next.id);};
  const close=()=>{if(!state.pending&&!state.inspecting){setAction(null);store.clearAction();setTimeout(()=>{if(document.activeElement===document.body)document.getElementById(`${id}-add`)?.focus();},0);}};
  return <PrototypeShell liveGoals>
    <PageHeader title="Goals" description="Make steady progress toward what matters." actions={<><Button variant="secondary" disabled={state.loading||state.pending} onClick={()=>{void store.refresh();void store.loadOptions();}}>Refresh goals</Button><Button id={`${id}-add`} disabled={state.pending} onClick={()=>open({kind:'create'})}>Create goal</Button></>}/>
    <p role="status" className="v2-helper">{state.loading?state.rows?'Refreshing goals… Showing last loaded values.':'Loading your goals…':state.error?'Goal refresh failed.':'Goals are up to date.'}</p>
    {state.notice&&<FeedbackBanner tone={state.error?'warning':'success'} title={state.notice}/>}
    {state.error&&<ErrorState title="Goals unavailable" description={state.error} onRetry={()=>void store.refresh()}/>}
    {state.error&&state.rows&&<StaleIndicator>Last loaded goals · refresh failed</StaleIndicator>}
    <h2 className="v2-sr-only">Your savings goals</h2>
    {state.rows===null?state.loading?<div role="group" aria-busy="true" aria-label="Loading goals"><Skeleton variant="metric"/><Skeleton variant="transaction"/></div>:null:state.rows.length===0?<EmptyState title="No goals yet." description="Set a target and update your savings manually. Your accounts remain independent." action={<Button disabled={state.pending} onClick={()=>open({kind:'create'})}>Create goal</Button>}/>:<div className="p4-columns t46-goals" aria-busy={state.loading}>{state.rows.map(g=>{
      const account=state.accounts.find(a=>a.id===g.linkedAccountId);
      return <section data-goal-id={g.id} data-status={g.status} key={g.id} aria-label={g.name}>
        <GoalCard name={g.name} saved={g.savedAmount} target={g.targetAmount} percent={g.percentComplete} date={g.targetDate??undefined} status={statusLabel(g.status)}/>
        <p className="v2-helper">Remaining <MoneyDisplay value={g.remainingAmount}/></p>
        <p className="v2-helper">Linked account: {g.linkedAccountId?account?`${account.name}${account.status==='archived'?' (Archived)':''}`:state.optionsLoading?'Loading reference…':'Reference unavailable':'None'}</p>
        {g.status==='active'&&goalIsFunded(g)&&<p className="v2-helper">Target reached. Mark complete when you are ready.</p>}
        {g.status!=='archived'&&<div className="v2-actions">
          <Button variant="text" disabled={state.pending} onClick={()=>open({kind:'edit',id:g.id})}>Edit<span className="v2-sr-only"> {g.name}</span></Button>
          {g.status==='active'&&goalIsFunded(g)&&<Button variant="secondary" disabled={state.pending} onClick={()=>open({kind:'complete',id:g.id})}>Mark complete<span className="v2-sr-only"> {g.name}</span></Button>}
          {g.status==='completed'&&<Button variant="secondary" disabled={state.pending} onClick={()=>open({kind:'reopen',id:g.id})}>Reopen<span className="v2-sr-only"> {g.name}</span></Button>}
          <Button variant="text" disabled={state.pending} onClick={()=>open({kind:'archive',id:g.id})}>Archive<span className="v2-sr-only"> {g.name}</span></Button>
        </div>}
      </section>;
    })}</div>}
    {action&&(action.kind!=='create'&&(!state.resource||state.resourceLoading)?<DialogShell title="Check goal" description="Loading the current goal before making a change." onClose={close}>{state.resourceLoading?<Skeleton variant="metric"/>:<ErrorState title="Goal unavailable" description={state.resourceError??'This goal is unavailable.'} onRetry={()=>void store.loadResource(action.id!)}/>}</DialogShell>:<GoalDialog key={action.kind+action.id} action={action} goal={state.resource??undefined} state={state} store={store} client={client} close={close}/>)}
  </PrototypeShell>;
}
function GoalDialog({action,goal,state,store,client,close}:{action:Action;goal?:Goal;state:ReturnType<Store['getSnapshot']>;store:Store;client:ReturnType<typeof createGoalClient>;close:()=>void}){
  const create=action.kind==='create',form=create||action.kind==='edit',id=useId();
  const [draft,setDraft]=useState<GoalUpdate>(goal?goalUpdate(goal):{name:'',targetAmount:'',savedAmount:'0.00',targetDate:null,linkedAccountId:null,status:'active'}),[errors,setErrors]=useState<Record<string,string>>({});
  const submitting=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const fields={...errors,...state.mutationError?.fields};
  const focus=(values:Record<string,string>)=>{const first=['name','targetAmount','savedAmount','targetDate','linkedAccountId','status'].find(k=>values[k]);if(first)setTimeout(()=>document.getElementById(`${id}-${first}`)?.focus(),0);};
  const invalidLifecycle=!!goal&&(goal.status==='archived'||action.kind==='reopen'&&goal.status!=='completed'||action.kind==='complete'&&(goal.status!=='active'||!goalIsFunded(goal)));
  async function submit(){
    if(submitting.current||state.pending||state.mutationError?.uncertain||invalidLifecycle)return;
    const validation=form?validateGoalDraft(draft):{};
    if(form&&draft.linkedAccountId&&draft.linkedAccountId!==goal?.linkedAccountId&&!state.accounts.some(a=>a.id===draft.linkedAccountId&&a.status==='active'))validation.linkedAccountId='Choose an active account or no linked account.';
    setErrors(validation);if(Object.keys(validation).length){focus(validation);return;}
    submitting.current=true;
    const saved=await store.mutate(options=>create?client.createGoal(draft,options):action.kind==='edit'?client.updateGoal(goal!.id,draft,options):action.kind==='complete'?client.completeGoal(goal!.id,options):action.kind==='reopen'?client.updateGoal(goal!.id,{...goalUpdate(goal!),status:'active'},options):client.archiveGoal(goal!.id,options),form?'Goal saved.':action.kind==='complete'?'Goal completed.':action.kind==='reopen'?'Goal reopened.':'Goal archived. Values are preserved.');
    submitting.current=false;if(!mounted.current)return;if(saved)close();else focus(store.getSnapshot().mutationError?.fields??{});
  }
  const title=create?'Create goal':action.kind==='edit'?'Edit goal':action.kind==='complete'?'Mark goal complete?':action.kind==='reopen'?'Reopen goal?':'Archive goal?';
  const confirm=action.kind==='complete'?'Mark complete':action.kind==='reopen'?'Reopen goal':'Archive goal';
  const description=form?'Set your target and update savings manually. Linked account is for reference only.':action.kind==='archive'?'This goal becomes read-only. Its values are preserved. Accounts and transactions are unaffected.':action.kind==='reopen'?'Return this goal to Active. Saved amounts and account balances are unchanged.':'Completion is explicit. Your saved amount and account balances are unchanged.';
  const inputProps=(field:string)=>({id:`${id}-${field}`,disabled:state.pending,'aria-invalid':!!fields[field],'aria-describedby':fields[field]?`${id}-${field}-error`:undefined});
  return <DialogShell title={title} description={description} onClose={close} state={state.pending?'pending':'default'}>
    {invalidLifecycle&&<FeedbackBanner tone="warning" title="This goal cannot make that change. Close and refresh its current state."/>}
    {state.mutationError&&<FeedbackBanner tone={state.mutationError.uncertain?'warning':'error'} title={state.mutationError.message}/>}
    {form&&<form noValidate onSubmit={e=>{e.preventDefault();void submit();}}>
      <FormField id={`${id}-name`} label="Goal name" required error={fields.name}><TextInput data-initial-focus {...inputProps('name')} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></FormField>
      <FormField id={`${id}-targetAmount`} label="Target amount" required error={fields.targetAmount}><MoneyInput {...inputProps('targetAmount')} value={draft.targetAmount} onChange={e=>setDraft({...draft,targetAmount:e.target.value})}/></FormField>
      <FormField id={`${id}-savedAmount`} label="Saved amount (manual)" required error={fields.savedAmount}><MoneyInput {...inputProps('savedAmount')} value={draft.savedAmount} onChange={e=>setDraft({...draft,savedAmount:e.target.value})}/></FormField>
      <FormField id={`${id}-targetDate`} label="Target date (optional)" error={fields.targetDate}><TextInput {...inputProps('targetDate')} type="date" min="1900-01-01" max="9999-12-31" value={draft.targetDate??''} onChange={e=>setDraft({...draft,targetDate:e.target.value||null})}/></FormField>
      <FormField id={`${id}-linkedAccountId`} label="Linked account (optional)" error={fields.linkedAccountId} hint="Linked account is for reference only. Goal progress is updated manually."><Select {...inputProps('linkedAccountId')} disabled={state.pending||state.optionsLoading||!!state.optionsError} aria-describedby={`${id}-linkedAccountId-hint${fields.linkedAccountId?` ${id}-linkedAccountId-error`:''}`} value={draft.linkedAccountId??''} onChange={e=>setDraft({...draft,linkedAccountId:e.target.value||null})}><option value="">None</option>{state.accounts.filter(a=>a.status==='active'||a.id===goal?.linkedAccountId).map(a=><option key={a.id} value={a.id}>{a.name}{a.status==='archived'?' (Archived · keep existing reference)':''}</option>)}</Select></FormField>
      {state.optionsLoading&&<p role="status">Loading accounts…</p>}{state.optionsError&&<ErrorState title="Accounts unavailable" description={state.optionsError} onRetry={()=>void store.loadOptions()}/>}
      {goal?.status==='completed'&&<FormField id={`${id}-status`} label="Goal status" error={fields.status}><Select {...inputProps('status')} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as GoalUpdate['status']})}><option value="completed">Completed</option><option value="active">Active (reopen)</option></Select></FormField>}
      <div className="v2-actions"><Button variant="secondary" disabled={state.pending||state.inspecting} onClick={close}>Cancel</Button><Button type="submit" loading={state.pending} disabled={invalidLifecycle||state.mutationError?.uncertain||state.inspecting}>Save goal</Button></div>
    </form>}
    {!form&&<><p><strong>{goal?.name}</strong></p><div className="v2-actions"><Button data-initial-focus variant="secondary" disabled={state.pending||state.inspecting} onClick={close}>Cancel</Button><Button variant={action.kind==='archive'?'danger':'primary'} loading={state.pending} disabled={invalidLifecycle||state.mutationError?.uncertain||state.inspecting} onClick={()=>void submit()}>{confirm}</Button></div></>}
    {state.mutationError&&<>{state.notice&&<FeedbackBanner tone="warning" title={state.notice}/>}<Button variant="secondary" disabled={state.pending||state.inspecting} onClick={()=>void store.inspect(action.id)}>Inspect current goals</Button>{state.inspection!==null&&<section aria-label="Latest goal inspection"><p>Latest confirmed server state:</p>{state.inspection.length?state.inspection.map(g=><p key={g.id}>{g.name} · {statusLabel(g.status)} · saved <MoneyDisplay value={g.savedAmount}/> of <MoneyDisplay value={g.targetAmount}/></p>):<p>No matching goal is currently available.</p>}<Button variant="secondary" onClick={()=>store.allowRetry()}>I checked the current state; allow another attempt</Button></section>}</>}
  </DialogShell>;
}

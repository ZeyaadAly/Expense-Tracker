import type {Goal,createGoalClient} from "./api/goals";
import type {Account,createAccountClient} from "./api/accounts";
type Failure={message:string;uncertain:boolean;fields:Record<string,string>};
type State={rows:Goal[]|null;accounts:Account[];loading:boolean;optionsLoading:boolean;error:string|null;optionsError:string|null;authError:boolean;pending:boolean;mutationError:Failure|null;notice:string|null;resource:Goal|null;resourceLoading:boolean;resourceError:string|null;inspection:Goal[]|null;inspecting:boolean};
export function createGoalsStore(client:ReturnType<typeof createGoalClient>,accounts:ReturnType<typeof createAccountClient>){
  const initial:State={rows:null,accounts:[],loading:true,optionsLoading:true,error:null,optionsError:null,authError:false,pending:false,mutationError:null,notice:null,resource:null,resourceLoading:false,resourceError:null,inspection:null,inspecting:false};
  let state=initial,lifetime=0,write:AbortController|undefined;const reads=new Map<string,AbortController>(),listeners=new Set<()=>void>();
  const publish=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const cancel=()=>{lifetime++;reads.forEach(c=>c.abort());reads.clear();write?.abort();};
  const isAuth=(e:unknown)=>{const v=e as {status?:number;code?:string};return v.status===401||["AUTH_REQUIRED","AUTH_INVALID"].includes(v.code??"");};
  const clearAuth=()=>{cancel();publish({...initial,loading:false,optionsLoading:false,authError:true});};
  async function read<T>(key:string,operation:(signal:AbortSignal)=>Promise<T>,start:Partial<State>,success:(value:T)=>Partial<State>,failure:Partial<State>){
    if(state.authError)return false;const life=lifetime,c=new AbortController();reads.get(key)?.abort();reads.set(key,c);publish(start);
    try{const value=await operation(c.signal);if(life!==lifetime||reads.get(key)!==c)return false;publish(success(value));return true;}
    catch(e){if(life!==lifetime||reads.get(key)!==c)return false;if(isAuth(e))clearAuth();else publish(failure);return false;}
  }
  const refresh=()=>read('list',signal=>client.listGoals(undefined,{signal}),{loading:true,error:null},rows=>({rows,loading:false}),{loading:false,error:"Goals could not refresh. Last loaded values are retained where available."});
  const loadOptions=()=>read('options',async signal=>{
    const values=await Promise.allSettled([accounts.listAccounts('active',{signal}),accounts.listAccounts('archived',{signal})]);const failures=values.filter(v=>v.status==='rejected') as PromiseRejectedResult[];if(failures.length)throw failures.find(v=>isAuth(v.reason))?.reason??failures[0].reason;
    return [...new Map(values.flatMap(v=>v.status==='fulfilled'?v.value:[]).map(a=>[a.id,a])).values()];
  },{optionsLoading:true,optionsError:null},choices=>({accounts:choices,optionsLoading:false}),{optionsLoading:false,optionsError:"Account choices could not refresh. Retry to choose a linked account."});
  return {
    subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},getSnapshot:()=>state,getServerSnapshot:()=>initial,
    start(){void refresh();void loadOptions();return()=>{cancel();state=initial;};},refresh,loadOptions,
    clearAction(){if(state.pending||state.inspecting)return;for(const key of ['resource','inspection']){reads.get(key)?.abort();reads.delete(key);}publish({mutationError:null,resource:null,resourceError:null,resourceLoading:false,inspection:null});},
    loadResource(id:string){return read('resource',signal=>client.getGoal(id,{signal}),{resource:null,resourceLoading:true,resourceError:null},resource=>({resource,resourceLoading:false}),{resourceLoading:false,resourceError:"This goal is unavailable or could not load. Refresh to check again."});},
    async inspect(id?:string){return read('inspection',async signal=>{if(!id)return client.listGoals(undefined,{signal});try{return [await client.getGoal(id,{signal})];}catch(e){if((e as {code?:string}).code==='NOT_FOUND')return [];throw e;}},{inspecting:true,inspection:null},inspection=>({inspection,inspecting:false}),{inspecting:false,notice:"Current goals could not be checked. Retry the inspection read."});},
    allowRetry(){if(state.inspection!==null&&!state.pending&&!state.inspecting)publish({mutationError:null,inspection:null});},
    async mutate(operation:(options:{signal:AbortSignal})=>Promise<unknown>,message:string){
      if(state.pending||state.authError||state.mutationError?.uncertain||state.inspecting)return false;
      const life=lifetime;write=new AbortController();publish({pending:true,mutationError:null,notice:null,inspection:null});
      try{await operation({signal:write.signal});}
      catch(error){if(life!==lifetime)return false;if(isAuth(error)){clearAuth();return false;}const e=error as {code?:string;message?:string;uncertain?:boolean;details?:{field:string;message:string}[]};
        const message=e.uncertain?"We could not confirm this change. Inspect current goals before deliberately trying again.":e.code==='NOT_FOUND'?"This goal or linked account is unavailable. Refresh to check the current state.":e.code==='ACCOUNT_ARCHIVED'?"This account is archived. Choose an active account or keep the existing reference.":e.code==='GOAL_INVALID_STATE'?"This goal cannot make that change. Archived goals are read-only; completed goals must meet their target. Refresh to check its current state.":e.message??"The change could not be saved. Your draft is preserved.";
        publish({pending:false,mutationError:{message,uncertain:!!e.uncertain,fields:Object.fromEntries((e.details??[]).filter(d=>['name','targetAmount','savedAmount','targetDate','linkedAccountId','status'].includes(d.field)).map(d=>[d.field,d.message]))}});return false;
      }
      if(life!==lifetime)return false;const refreshed=await refresh();if(life!==lifetime||state.authError)return false;
      publish({pending:false,notice:refreshed?message:`${message} The list could not refresh. Retry only the GET refresh.`});return true;
    },
  };
}

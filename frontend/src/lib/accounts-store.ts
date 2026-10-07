import type { Account, AccountStatus, AccountSummary, createAccountClient } from "./api/accounts";
type Failure = {message:string; uncertain:boolean; fields:Record<string,string>; code?:string};
type State = {status:AccountStatus; accounts:Account[]|null; summary:AccountSummary|null; loading:boolean; error:string|null; authError:boolean; pending:boolean; mutationError:Failure|null; notice:string|null};
type Client = ReturnType<typeof createAccountClient>;
export function createAccountsStore(client:Client) {
  const initial:State={status:'active',accounts:null,summary:null,loading:true,error:null,authError:false,pending:false,mutationError:null,notice:null};
  let state=initial,generation=0,lifetime=0,read:AbortController|undefined,write:AbortController|undefined;
  const listeners=new Set<()=>void>();
  const publish=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const authFailure=(e:unknown)=>{const error=e as {status?:number;code?:string};return error.status===401||error.code==='AUTH_REQUIRED'||error.code==='AUTH_INVALID';};
  async function refresh(status=state.status):Promise<boolean> {
    const life=lifetime,current=++generation;read?.abort();read=new AbortController();
    publish({status,loading:true,error:null,...(status!==state.status?{accounts:null}:{})});
    const [list,summary]=await Promise.allSettled([client.listAccounts(status,{signal:read.signal}),client.getSummary({signal:read.signal})]);
    if(life!==lifetime||current!==generation)return false;
    if([list,summary].some(result=>result.status==='rejected'&&authFailure(result.reason))) {publish({accounts:null,summary:null,loading:false,authError:true});return false;}
    const success=list.status==='fulfilled'&&summary.status==='fulfilled';
    publish({loading:false,error:success?null:'Accounts could not refresh. Last loaded values are retained where available.',...(success&&state.notice?.startsWith('Saved, but')?{notice:'Accounts refreshed.'}:{}),...(list.status==='fulfilled'?{accounts:list.value}:{}),...(summary.status==='fulfilled'?{summary:summary.value}:{})});return success;
  }
  return {
    getSnapshot:()=>state,getServerSnapshot:()=>initial,
    subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
    start:()=>{void refresh();return()=>{lifetime++;generation++;read?.abort();write?.abort();state=initial;};},
    refresh,
    clearMutation:()=>{if(!state.pending)publish({mutationError:null});},
    async mutate(operation:(options:{signal:AbortSignal})=>Promise<unknown>,message:string):Promise<boolean> {
      if(state.pending||state.mutationError?.uncertain)return false;
      const life=lifetime;write=new AbortController();publish({pending:true,mutationError:null,notice:null});
      try {
        await operation({signal:write.signal});if(life!==lifetime)return false;
        publish({notice:message});const refreshed=await refresh();
        if(life!==lifetime)return false;
        publish({pending:false,...(!refreshed&&!state.authError?{notice:'Saved, but accounts could not refresh. Retry only the refresh.'}:{})});return true;
      } catch(e) {
        if(life!==lifetime)return false;
        if(authFailure(e)){publish({accounts:null,summary:null,pending:false,authError:true});return false;}
        const error=e as {code?:string;message?:string;uncertain?:boolean;details?:{field:string;message:string}[]};
        const fields:Record<string,string>={};for(const detail of error.details??[])if(['name','type','openingBalance','currency'].includes(detail.field))fields[detail.field]=detail.message;
        const message=error.uncertain?'We could not confirm whether this change was saved. Refresh accounts and inspect the current state before trying again.':error.code==='NOT_FOUND'?'This account is no longer available. Refresh accounts to check the current list.':error.code==='ACCOUNT_CONFLICT'?'This account could not be changed. Its name may already be used, or posted activity may have locked its opening balance and credit-card conversion.':error.message??'The change could not be saved. Your draft is preserved.';
        publish({pending:false,mutationError:{message,uncertain:!!error.uncertain,fields,code:error.code}});return false;
      }
    },
  };
}

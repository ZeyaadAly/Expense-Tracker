import type { AnalyticsOverview, createAnalyticsClient } from "./api/analytics";
import type { Account, createAccountClient } from "./api/accounts";
import { analyticsRangeError, type AnalyticsRange } from "./analytics-range";

type State={range:AnalyticsRange;loadedRange:AnalyticsRange|null;overview:AnalyticsOverview|null;accounts:Account[];loading:boolean;error:string|null;authError:boolean};
export function createAnalyticsStore(client:ReturnType<typeof createAnalyticsClient>,accounts:Pick<ReturnType<typeof createAccountClient>,"listAccounts">,range:AnalyticsRange){
  const initial:State={range,loadedRange:null,overview:null,accounts:[],loading:true,error:null,authError:false};
  let state=initial,lifetime=0,request:AbortController|undefined;
  const listeners=new Set<()=>void>();
  const publish=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const cancel=()=>{lifetime++;request?.abort();request=undefined;};
  async function refresh(){
    if(state.authError)return;
    const life=lifetime,selected=state.range,controller=new AbortController();request?.abort();request=controller;publish({loading:true,error:null});
    try{
      const [overview,active,archived]=await Promise.all([client.getAnalyticsOverview(selected,{signal:controller.signal}),accounts.listAccounts("active",{signal:controller.signal}),accounts.listAccounts("archived",{signal:controller.signal})]);
      if(life!==lifetime||request!==controller)return;
      publish({overview,loadedRange:{...selected},accounts:[...active,...archived],loading:false});
    }catch(error){
      if(life!==lifetime||request!==controller)return;
      const e=error as {status?:number;code?:string;details?:{field:string;message:string}[]};
      if(e.status===401||["AUTH_REQUIRED","AUTH_INVALID"].includes(e.code??"")){cancel();publish({...initial,loading:false,authError:true});}
      else publish({loading:false,error:e.status===400?`Check the selected range and account. ${(e.details??[]).filter(d=>["from","to","accountId"].includes(d.field)).map(d=>d.message).join(" ")}`:e.status===404?"This account is unavailable. Choose All accounts or another account and retry.":"Analytics could not refresh. Retry to load the latest values."});
    }
  }
  return {subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},getSnapshot:()=>state,getServerSnapshot:()=>initial,
    start(){void refresh();return()=>{cancel();state=initial;};},refresh,
    setRange(next:AnalyticsRange){if(state.authError||analyticsRangeError(next))return;publish({range:{...next}});void refresh();},
  };
}

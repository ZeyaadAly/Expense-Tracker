import type { createProfileClient, Profile } from "../api/profile";
import type { createProfileDrafts } from "./profile-draft";
type State = { profile: Profile | null; loading: boolean; error: { message: string; auth: boolean } | null };

export function createProfileStore(userId: string, client: ReturnType<typeof createProfileClient>, drafts: ReturnType<typeof createProfileDrafts>) {
  const initial: State = { profile:null, loading:true, error:null };
  let state=initial, generation=0, controller: AbortController | undefined;
  const listeners=new Set<()=>void>();
  const publish=(value: State)=>{state=value;listeners.forEach(f=>f());};
  async function prepare() {
    controller?.abort();controller=new AbortController();const signal=controller.signal,current=++generation;
    publish(initial);
    try {
      let profile=await client.bootstrap({signal});
      if(current!==generation)return;
      const draft=drafts.read(userId);
      if(draft && profile.displayName===null) profile=await client.updateProfile({displayName:draft},{signal});
      if(current!==generation)return;
      drafts.clear(userId);
      publish({profile,loading:false,error:null});
    } catch(error) {
      if(current!==generation)return;
      const e=error as {status?:number;code?:string;uncertain?:boolean};
      publish({profile:null,loading:false,error:{auth:e.status===401||e.code==='AUTH_REQUIRED'||e.code==='AUTH_INVALID',message:e.uncertain ? "We could not confirm your profile update. Retry to check your saved profile." : "We could not prepare your profile. Please try again."}});
    }
  }
  return {
    getSnapshot:()=>state,getServerSnapshot:()=>initial,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    start:()=>{void prepare();return()=>{generation++;controller?.abort();};},
    retry:()=>{if(!state.loading)void prepare();},
  };
}

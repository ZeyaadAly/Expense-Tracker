import {createClient} from 'npm:@supabase/supabase-js@2.117.2';

const TOKEN_HASH='c279db79dd516449e2760c2e8f86ead2cf1b9a2a52e2bb206f30c0fb14eb1b63';
const EXPIRES_AT=1792277570480;
const RUN_ID='release-mvcr7t0v-815226a9';
const EMAILS=Object.freeze({a:'release-mvcr7t0v-815226a9-a@example.com',b:'release-mvcr7t0v-815226a9-b@example.com'});
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function handler(request) {
 if(Date.now()>EXPIRES_AT)return reply({error:'OPERATOR_RETIRED'},410);
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9_-]{64}$/.test(authorization))return reply({error:'UNAUTHORIZED'},401);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(authorization.slice(7))))).map(x=>x.toString(16).padStart(2,'0')).join('');
 let difference=hash.length^TOKEN_HASH.length;for(let i=0;i<hash.length;i++)difference|=hash.charCodeAt(i)^TOKEN_HASH.charCodeAt(i);
 if(difference)return reply({error:'UNAUTHORIZED'},401);
 if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 try {
  if(Number(request.headers.get('content-length')||0)>8192)return reply({error:'TOO_LARGE'},413);
  const raw=await request.text();if(raw.length>8192)return reply({error:'TOO_LARGE'},413);
  const body=JSON.parse(raw);
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','label'].includes(k)))return reply({error:'INVALID_REQUEST'},400);
  if(body.action!=='retire-user'||!Object.hasOwn(EMAILS,body.label))return reply({error:'INVALID_ACTION'},400);
  const url=Deno.env.get('SUPABASE_URL');if(new URL(url).hostname!=='kpbyvbgcfwavcsgtcdws.supabase.co')return reply({error:'WRONG_PROJECT'},503);
  const dictionary=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'),key=dictionary.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!key)return reply({error:'ADMIN_AUTH_UNAVAILABLE'},503);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).auth.admin;
  const listed=await admin.listUsers({page:1,perPage:1000});if(listed.error)return reply({error:'AUTH_PROVIDER_UNAVAILABLE'},503);
  const user=listed.data.users.find(u=>u.email===EMAILS[body.label]);if(!user||user.user_metadata?.release_run!==RUN_ID)return reply({error:'IDENTITY_COLLISION'},409);
  const result=await admin.updateUserById(user.id,{ban_duration:'876000h'});
  if(result.error||!result.data.user?.banned_until)return reply({error:'RETIREMENT_FAILED'},503);
  return reply({retired:true});
 }catch{return reply({error:'OPERATOR_FAILED'},503);}
}
Deno.serve(handler);

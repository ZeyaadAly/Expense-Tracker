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
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','label','password'].includes(k)))return reply({error:'INVALID_REQUEST'},400);
  if(!['probe','provision','recovery'].includes(body.action))return reply({error:'INVALID_ACTION'},400);
  if(body.action!=='probe'&&!Object.hasOwn(EMAILS,body.label))return reply({error:'INVALID_LABEL'},400);
  const url=Deno.env.get('SUPABASE_URL');
  if(new URL(url).hostname!=='kpbyvbgcfwavcsgtcdws.supabase.co')return reply({error:'WRONG_PROJECT'},503);
  const dictionary=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
  const key=dictionary.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!key)return reply({error:'ADMIN_AUTH_UNAVAILABLE'},503);
  if(body.action==='probe')return reply({ready:true});
  if(body.action==='provision'&&(typeof body.password!=='string'||body.password.length<32||body.password.length>128))return reply({error:'INVALID_PASSWORD'},400);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).auth.admin;
  const email=EMAILS[body.label];
  if(body.action==='provision') {
   const listed=await admin.listUsers({page:1,perPage:1000});if(listed.error)return reply({error:'AUTH_PROVIDER_UNAVAILABLE'},503);
   const existing=listed.data.users.find(user=>user.email===email);
   if(existing){if(existing.user_metadata?.release_run!==RUN_ID)return reply({error:'IDENTITY_COLLISION'},409);return reply({id:existing.id,confirmed:!!existing.email_confirmed_at,reused:true});}
   const result=await admin.createUser({email,password:body.password,email_confirm:true,user_metadata:{release_run:RUN_ID,display_name:'Release Acceptance '+body.label.toUpperCase()}});
   if(result.error||!result.data.user)return reply({error:'AUTH_PROVISIONING_FAILED'},503);
   return reply({id:result.data.user.id,confirmed:!!result.data.user.email_confirmed_at,reused:false});
  }
  const result=await admin.generateLink({type:'recovery',email,options:{redirectTo:'https://expensetracker-inky-mu.vercel.app/v2/reset-password'}});
  if(result.error||!result.data.properties?.action_link)return reply({error:'RECOVERY_LINK_UNAVAILABLE'},503);
  return reply({actionLink:result.data.properties.action_link});
 }catch{return reply({error:'OPERATOR_FAILED'},503);}
}

Deno.serve(handler);

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadV2Client} from './v2-client-loader.mjs';
async function load(path,replacements={}) {
  let source=readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
  for(const [from,to] of Object.entries(replacements))source=source.replace(from,to);
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const {createV2ApiClient}=await loadV2Client();
const clientSource=readFileSync(new URL('../src/lib/api/v2-client.ts',import.meta.url),'utf8').replace('import { getAccessToken } from "../auth/auth-service";','const getAccessToken=async()=>({data:null,error:null});');
const clientUrl='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(clientSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const {createProfileClient}=await load('lib/api/profile.ts',{
  'from "./v2-client"':`from "${clientUrl}"`,
  'import { getSession } from "../auth/auth-service";':'const getSession=async()=>({data:null,error:null});',
});
const {createProfileStore}=await load('lib/auth/profile-store.ts');
const {createProfileDrafts}=await load('lib/auth/profile-draft.ts');
const {createAuthFormSubmitter,validateAuthForm}=await load('features/v2/auth-form.ts');
const {createSessionStore}=await load('lib/auth/session-store.ts');
const a='a1300000-0000-4000-8000-000000000001',b='b1300000-0000-4000-8000-000000000001';
const profile={userId:a,displayName:null,preferredCurrency:'EGP',locale:'en',timezone:'Africa/Cairo',createdAt:'2026-10-06T12:00:00.000Z',updatedAt:'2026-10-06T12:00:00.000Z'};
function drafts(){const values=new Map();return createProfileDrafts(()=>({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}));}
async function settled(store){if(!store.getSnapshot().loading)return;await new Promise(resolve=>{const off=store.subscribe(()=>{if(!store.getSnapshot().loading){off();resolve();}});});}
test('T13 profile client authenticated routes, typed response and editable-only request',async()=>{
  const calls=[];
  const transport=createV2ApiClient({baseUrl:'https://api.example.invalid/api/v1',tokenSupplier:async()=>({data:'fixture-token',error:null}),fetcher:async(url,options)=>{calls.push({url,options});return Response.json({data:profile});}});
  const client=createProfileClient(a,transport);
  assert.deepEqual(await client.bootstrap(),profile);assert.deepEqual(await client.getProfile(),profile);
  await client.updateProfile({displayName:'A',userId:b,locale:'ar'});
  assert.deepEqual(calls.map(c=>[new URL(c.url).pathname,c.options.method,c.options.body]),[['/api/v2/profile/bootstrap','POST','{}'],['/api/v2/profile','GET',undefined],['/api/v2/profile','PUT','{"displayName":"A"}']]);
  assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer fixture-token'&&c.options.cache==='no-store'));
});
test('T13 profile client rejects foreign/malformed resources and preserves validation/401 failures',async()=>{
  for(const data of [{...profile,userId:b},{...profile,preferredCurrency:'USD'},{...profile,displayName:4},{...profile,createdAt:'bad'}]) {
    const transport={get:async()=>({data})};await assert.rejects(createProfileClient(a,transport).getProfile(),e=>e.code==='INVALID_RESPONSE');
  }
  for(const [status,code] of [[400,'VALIDATION_ERROR'],[401,'AUTH_INVALID'],[409,'PROFILE_REQUIRED']]) {
    let calls=0;
    const transport=createV2ApiClient({baseUrl:'https://api.example.invalid',tokenSupplier:async()=>({data:'fixture',error:null}),fetcher:async()=>{calls++;return Response.json({error:{code,message:'safe',details:status===400?[{field:'displayName',message:'Check name'}]:[]}},{status});}});
    await assert.rejects(createProfileClient(a,transport).updateProfile({displayName:'A'}),e=>e.status===status&&e.code===code);
    assert.equal(calls,1);
  }
});
test('T13 drafts are user-bound and registration name is saved only after successful signup',async()=>{
  const draft=drafts();draft.save(a,'  القاهرة 😀 ');assert.equal(draft.read(a),'القاهرة 😀');assert.equal(draft.read(b),null);draft.clear(b);assert.equal(draft.read(a),'القاهرة 😀');
  const values={name:'  😀'.repeat(1),email:'fixture@example.invalid',password:'fixture-password',confirm:'fixture-password'};
  const submit=createAuthFormSubmitter({signUpWithEmail:async()=>({data:{user:{id:a},session:null},error:null})},draft.save);
  assert.equal((await submit('register',values)).kind,'success');assert.equal(draft.read(a),'😀');
  assert.ok(!validateAuthForm('register',{...values,name:'😀'.repeat(100)}).name);assert.ok(validateAuthForm('register',{...values,name:'😀'.repeat(101)}).name);
  const failed=createAuthFormSubmitter({signUpWithEmail:async()=>({data:null,error:{code:'network'}})},draft.save);await failed('register',{...values,name:'Changed'});assert.equal(draft.read(a),'😀');
});
test('T13 gate stays loading until bootstrap/draft save, retains draft on failure and retries explicitly',async()=>{
  const draft=drafts();draft.save(a,'A');let puts=0,fail=true;
  const client={bootstrap:async()=>profile,updateProfile:async input=>{puts++;if(fail)throw {uncertain:true};return {...profile,...input};}};
  const store=createProfileStore(a,client,draft);assert.equal(store.getSnapshot().profile,null);const stop=store.start();await settled(store);
  assert.equal(store.getSnapshot().profile,null);assert.equal(puts,1);assert.equal(draft.read(a),'A');assert.match(store.getSnapshot().error.message,/confirm/);
  fail=false;store.retry();await settled(store);assert.equal(store.getSnapshot().profile.displayName,'A');assert.equal(draft.read(a),null);assert.equal(puts,2);stop();
});
test('T13 canceled prior-user bootstrap and late update cannot publish or clear another draft',async()=>{
  const draft=drafts();draft.save(a,'A');let resolve;
  const store=createProfileStore(a,{bootstrap:()=>new Promise(r=>{resolve=r;}),updateProfile:async()=>{throw new Error('must not run');}},draft);
  const stop=store.start();stop();resolve(profile);await Promise.resolve();await Promise.resolve();assert.equal(store.getSnapshot().profile,null);assert.equal(draft.read(a),'A');
  const bs=createProfileStore(b,{bootstrap:async()=>({...profile,userId:b}),updateProfile:async()=>{throw new Error('must not run');}},draft);const end=bs.start();await settled(bs);assert.equal(bs.getSnapshot().profile.userId,b);assert.equal(draft.read(a),'A');end();
});
test('T13 existing name survives registration draft and authentication failure blocks the gate',async()=>{
  const draft=drafts();draft.save(a,'Draft');
  const store=createProfileStore(a,{bootstrap:async()=>({...profile,displayName:'Saved'}),updateProfile:async()=>{throw new Error('must not run');}},draft);const stop=store.start();await settled(store);assert.equal(store.getSnapshot().profile.displayName,'Saved');assert.equal(draft.read(a),null);stop();
  const denied=createProfileStore(a,{bootstrap:async()=>{throw {status:401};}},draft);const end=denied.start();await settled(denied);assert.equal(denied.getSnapshot().profile,null);assert.equal(denied.getSnapshot().error.auth,true);end();
});
test('T13 API auth invalidation clears session immediately and suppresses a late startup read',async()=>{
  let resolve;
  const store=createSessionStore({subscribe:()=>({data:()=>{},error:null}),getSession:()=>new Promise(r=>{resolve=r;})});
  const stop=store.start();store.invalidateSession();
  resolve({data:{access_token:'fictional',user:{id:a},expires_at:Date.now()/1000+900},error:null});await Promise.resolve();
  assert.equal(store.getSnapshot().session,null);assert.equal(store.getSnapshot().expired,true);stop();
});

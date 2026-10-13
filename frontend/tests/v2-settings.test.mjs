import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadV2Client } from './v2-client-loader.mjs';

const read = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const compile = s => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64');
const transport = await loadV2Client();
globalThis.__t49transport = transport;
const categorySource = read('lib/api/categories.ts').replace('import { createSessionClient } from "./session-client";', 'const createSessionClient=()=>{throw Error("inject");};').replace('import { V2ApiError, type V2RequestOptions } from "./v2-client";', 'const {V2ApiError}=globalThis.__t49transport;');
const { createCategoryClient, validateCategoryInput } = await import(compile(categorySource));
const { createSettingsStore } = await import(compile(read('lib/settings-store.ts')));
const { createV2ApiClient, V2ApiError } = transport;
const a = 'a4900000-0000-4000-8000-000000000001', b = 'b4900000-0000-4000-8000-000000000001';
const now = '2026-10-13T00:00:00.000Z';
const profile = { userId:a, displayName:'Original', preferredCurrency:'EGP', locale:'en', timezone:'Africa/Cairo', createdAt:now, updatedAt:now };
const row = { id:'c4900000-0000-4000-8000-000000000001', name:'Food', kind:'expense', icon:null, color:null, status:'active', isSystem:false };
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const tick = () => new Promise(r => setTimeout(r, 0));

test('T49 category client exact routes, write shapes, archived filter and response checks', async () => {
  const calls = [], token = () => ({data:'synthetic',error:null});
  const client = createCategoryClient(a, createV2ApiClient({baseUrl:'http://localhost:4000/api/v1', tokenSupplier:token, fetcher:async (url, options) => {
    calls.push({url,options});
    if (url.endsWith('/archive')) return Response.json({data:{...row,status:'archived'},meta:{pausedRecurringCount:2}});
    if (url.endsWith('/restore')) return Response.json({data:row});
    if (options.method === 'GET') {const status = new URL(url).searchParams.get('status'); return Response.json({data:status === 'archived' ? [{...row,status:'archived'}] : [row],meta:{count:1}});}
    return Response.json({data:row});
  }}));
  assert.deepEqual(await client.listCategories(),[row]);
  assert.equal((await client.listCategories('archived'))[0].status,'archived');
  const input = {name:'  Food  ',kind:'expense',icon:null,color:null};
  await client.createCategory(input); await client.updateCategory(row.id,input);
  assert.equal((await client.archiveCategory(row.id)).pausedRecurringCount,2);
  assert.equal((await client.restoreCategory(row.id)).status,'active');
  assert.deepEqual(calls.map(c => [new URL(c.url).pathname,c.options.method]),[['/api/v2/categories','GET'],['/api/v2/categories','GET'],['/api/v2/categories','POST'],['/api/v2/categories/'+row.id,'PUT'],['/api/v2/categories/'+row.id+'/archive','POST'],['/api/v2/categories/'+row.id+'/restore','POST']]);
  assert.equal(new URL(calls[1].url).search,'?status=archived');
  assert.deepEqual(JSON.parse(calls[2].options.body),input);
  assert.ok(calls.every(c => c.options.headers.Authorization === 'Bearer synthetic' && c.options.cache === 'no-store'));
});

test('T49 category input preserves Unicode/system collisions and rejects invalid fields', () => {
  for (const name of ['Food','غذاء','Éducation','😀'.repeat(80)]) assert.deepEqual(validateCategoryInput({name,kind:'both',icon:null,color:null}),{});
  for (const name of ['','  ','x\u0000','😀'.repeat(81)]) assert.ok(validateCategoryInput({name,kind:'both',icon:null,color:null}).name);
  assert.ok(validateCategoryInput({name:'Valid',kind:'wrong',icon:null,color:null}).kind);
  assert.ok(validateCategoryInput({name:'Valid',kind:'income',icon:'😀'.repeat(65),color:null}).icon);
});

test('T49 category responses reject extra owner/foreign fields and malformed archive metadata', async () => {
  for (const invalid of [{...row,userId:a},{...row,id:b},{...row,isSystem:'false'}]) {
    const client = createCategoryClient(a,{get:async()=>({data:[invalid],meta:{count:1}})});
    if (invalid.id === b) assert.equal((await client.listCategories())[0].id,b); else await assert.rejects(client.listCategories(),e=>e.code==='INVALID_RESPONSE');
  }
  const client = createCategoryClient(a,{post:async()=>({data:{...row,status:'archived'},meta:{pausedRecurringCount:-1}})});
  await assert.rejects(client.archiveCategory(row.id),e=>e.code==='INVALID_RESPONSE'&&e.uncertain);
});

test('T49 Settings store independent reads, stale retention, confirmed writes and auth clearing', async () => {
  let categoryFail = false, name='Original', saved=0, status='active';
  const profiles={getProfile:async()=>({...profile,displayName:name}),updateProfile:async input=>{name=input.displayName;saved++;return {...profile,displayName:name};}};
  const categories={listCategories:async s=>{if (s==='archived'&&categoryFail) throw Error('offline');return s===status?[{...row,status}]:[];}};
  const store=createSettingsStore(profiles,categories); const stop=store.start();await tick();
  assert.equal(store.getSnapshot().profile.data.displayName,'Original');assert.equal(store.getSnapshot().active.data.length,1);
  assert.deepEqual(store.getSnapshot().archived.data,[]);
  categoryFail=true;await store.refreshCategories('archived');assert.equal(store.getSnapshot().archived.stale,true);assert.deepEqual(store.getSnapshot().archived.data,[]);
  assert.equal(await store.saveProfile('Updated'),true);assert.equal(saved,1);assert.equal(store.getSnapshot().profile.data.displayName,'Updated');
  assert.equal(await store.mutateCategory(async()=>{status='archived';},'Archived.'),true);
  assert.match(store.getSnapshot().categoryNotice,/refresh/i);assert.equal(store.getSnapshot().active.data.length,0);
  stop();assert.equal(store.getSnapshot().profile.data,null);assert.equal(store.getSnapshot().active.data,null);
  const denied=createSettingsStore({getProfile:async()=>{throw new V2ApiError(401,'AUTH_INVALID','auth');}},{listCategories:async()=>[row]});denied.start();await tick();assert.equal(denied.getSnapshot().authError,true);assert.equal(denied.getSnapshot().active.data,null);
});

test('T49 uncertain write requires fresh GET inspection and deliberate acknowledgement', async () => {
  let writes=0;const profiles={getProfile:async()=>profile,updateProfile:async()=>{writes++;throw new V2ApiError(0,'NETWORK_ERROR','network',[],true);}};
  const store=createSettingsStore(profiles,{listCategories:async()=>[]});await store.refreshProfile();
  await store.saveProfile('Draft');await store.saveProfile('Draft');assert.equal(writes,1);assert.equal(store.getSnapshot().profileInspectionReady,false);
  store.inspected('profile');assert.ok(store.getSnapshot().profileFailure);
  await store.refreshProfile();assert.equal(store.getSnapshot().profileInspectionReady,true);
  store.inspected('profile');await store.saveProfile('Draft');assert.equal(writes,2);
  let categoryWrites=0;const category=createSettingsStore(profiles,{listCategories:async()=>[],createCategory:async()=>{categoryWrites++;throw new V2ApiError(0,'NETWORK_ERROR','network',[],true);}});
  const operation=async()=>{categoryWrites++;throw new V2ApiError(0,'NETWORK_ERROR','network',[],true);};
  await category.mutateCategory(operation,'Saved');
  await category.mutateCategory(operation,'Saved');assert.equal(categoryWrites,1);
  await Promise.all([category.refreshCategories('active'),category.refreshCategories('archived')]);
  assert.equal(category.getSnapshot().categoryInspectionReady,true);category.inspected('category');
  await category.mutateCategory(operation,'Saved');assert.equal(categoryWrites,2);
});

test('T49 Settings teardown aborts in-flight reads and suppresses late prior-user results', async () => {
  const late=defer();let signal;
  const aStore=createSettingsStore({getProfile:o=>{signal=o.signal;return late.promise;}},{listCategories:async()=>[]});
  const stop=aStore.start();stop();assert.equal(signal.aborted,true);
  late.resolve(profile);await tick();assert.equal(aStore.getSnapshot().profile.data,null);
  const bStore=createSettingsStore({getProfile:async()=>({...profile,userId:b})},{listCategories:async()=>[]});bStore.start();await tick();assert.equal(bStore.getSnapshot().profile.data.userId,b);
});

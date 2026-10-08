import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadV2Client} from './v2-client-loader.mjs';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const transportModule=await loadV2Client();
const {V2ApiError,createV2ApiClient}=transportModule;
globalThis.__t25transport=transportModule;
const source=readFileSync(new URL('../src/lib/api/v2-transactions.ts',import.meta.url),'utf8').replace('import { createSessionClient } from "./session-client";','const createSessionClient=()=>{throw new Error("inject transport");};').replace('import { V2ApiError, type V2RequestOptions } from "./v2-client";','const {V2ApiError}=globalThis.__t25transport;');
const {createTransactionClient,validateTransactionInput,cairoToday}=await import(compile(source));
const {createTransactionsStore}=await import(compile(readFileSync(new URL('../src/lib/transactions-store.ts',import.meta.url),'utf8')));
const user='a2500000-0000-4000-8000-000000000001',id='a2500000-0000-4000-8000-000000000002';
const input={type:'expense',accountId:user,categoryId:user,amount:'0.30',date:'2026-10-01',description:'A posting'};
const row={...input,id,accountName:'Cash',categoryName:'Food',currency:'EGP',recurringTransactionId:null,recurringOccurrenceDate:null,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'};
const page=(data=[row],cursor=null,limit=25)=>({data,meta:{limit,nextCursor:cursor,hasMore:cursor!==null}});
const tick=()=>new Promise(r=>setTimeout(r,0));
const defer=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {resolve,reject,promise};};
const fake=(list=async()=>page())=>({transactions:{listTransactions:list},accounts:{listAccounts:async status=>[{id:user,name:'Cash',status}]},categories:{listCategories:async status=>[{id:user,name:'Food',status,kind:'expense'}]}});

test('T25 domain uses T10 auth, query serialization and all CRUD methods without metadata injection',async()=>{
  const calls=[];
  const transport=createV2ApiClient({baseUrl:'https://api.example.invalid/api/v1',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async(url,options)=>{calls.push({url,options});if(options.method==='DELETE')return new Response(null,{status:204});return Response.json(options.method==='GET'&&new URL(url).pathname.endsWith('/transactions')?page([row],null,50):{data:row},{status:options.method==='POST'?201:200});}});
  const client=createTransactionClient(user,transport),signal=new AbortController().signal;
  const query={q:'  literal %_!  ',type:'expense',accountId:user,categoryId:user,from:'2026-10-01',to:'2026-10-08',recurring:'manual',limit:50,cursor:'opaque'};
  await client.listTransactions(query,{signal});await client.getTransaction(id);await client.createTransaction({...input,userId:id,recurringTransactionId:id});await client.updateTransaction(id,{...input,createdAt:'bad'});await client.deleteTransaction(id);
  assert.deepEqual(Object.fromEntries(new URL(calls[0].url).searchParams),{...query,q:'literal %_!',limit:'50'});
  assert.deepEqual(calls.map(c=>c.options.method),['GET','GET','POST','PUT','DELETE']);assert.equal(calls[0].options.signal,signal);
  for(const call of calls){assert.equal(call.options.headers.Authorization,'Bearer synthetic');assert.equal(call.options.cache,'no-store');}
  assert.deepEqual(JSON.parse(calls[2].options.body),input);assert.deepEqual(JSON.parse(calls[3].options.body),input);
  const omitted=createTransactionClient(user,{get:async(_path,options)=>{assert.equal(options.query.q,undefined);assert.equal(options.query.type,undefined);return page();}});await omitted.listTransactions({q:' '});
  await assert.rejects(client.getTransaction('../bad'),e=>e.code==='INVALID_REQUEST');
});
test('T25 invalid financial resources/page metadata and owner leakage fail closed',async()=>{
  for(const bad of [{...row,amount:0.3},{...row,amount:'1.230'},{...row,userId:user},{...row,date:'2026-02-29'},{...row,recurringTransactionId:id},{...row,currency:'USD'}])await assert.rejects(createTransactionClient(user,{get:async()=>page([bad])}).listTransactions(),e=>e.code==='INVALID_RESPONSE');
  for(const meta of [{limit:25,nextCursor:null,hasMore:true},{limit:25,nextCursor:'x',hasMore:false},{limit:0,nextCursor:null,hasMore:false},{limit:50,nextCursor:null,hasMore:false}])await assert.rejects(createTransactionClient(user,{get:async()=>({...page(),meta})}).listTransactions());
  await assert.rejects(createTransactionClient(user,{put:async()=>({data:{...row,id:user}})}).updateTransaction(id,input),e=>e.uncertain);
  await assert.rejects(createTransactionClient(user,{delete:async()=>({data:row})}).deleteTransaction(id),e=>e.uncertain);
});
test('T25 validation/auth/server and network uncertainty preserve T10 semantics',async()=>{
  for(const [status,code] of [[400,'VALIDATION_ERROR'],[401,'AUTH_INVALID'],[404,'NOT_FOUND'],[503,'DATABASE_UNAVAILABLE']]){
    const transport=createV2ApiClient({baseUrl:'https://api.example.invalid',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async()=>Response.json({error:{code,message:'private',details:[{field:'amount',message:'Plain amount required'}]}},{status})});
    await assert.rejects(createTransactionClient(user,transport).createTransaction(input),e=>e.status===status&&e.code===code&&!e.uncertain&&e.details[0].field==='amount');
  }
  const client=createTransactionClient(user,createV2ApiClient({baseUrl:'https://api.example.invalid',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async()=>{throw new Error('offline');}}));
  await assert.rejects(client.listTransactions(),e=>!e.uncertain);for(const call of [()=>client.createTransaction(input),()=>client.updateTransaction(id,input),()=>client.deleteTransaction(id)])await assert.rejects(call(),e=>e.uncertain);
});
test('T25 exact money strings, Unicode descriptions and Cairo calendar day',()=>{
  for(const amount of ['0.01','0.10','0.30','999999999.99'])assert.deepEqual(validateTransactionInput({...input,amount},'2026-10-08'),{});
  for(const amount of ['0','0.00','1e2','+1',' 1','01','1.230','1000000000','-1'])assert.ok(validateTransactionInput({...input,amount},'2026-10-08').amount);
  assert.equal(cairoToday(new Date('2026-10-07T22:30:00Z')),'2026-10-08');
  assert.ok(validateTransactionInput({...input,date:'2026-02-29'},'2026-10-08').date);assert.ok(validateTransactionInput({...input,date:'2026-10-09'},'2026-10-08').date);
  assert.deepEqual(validateTransactionInput({...input,description:'😀'.repeat(200)},'2026-10-08'),{});assert.ok(validateTransactionInput({...input,description:'😀'.repeat(201)},'2026-10-08').description);
  assert.deepEqual(validateTransactionInput({...input,description:'Two lines\nof description'},'2026-10-08'),{});
});
test('T25 history Next/Previous and every filter/page-size reset use scoped server queries',async()=>{
  const calls=[],store=createTransactionsStore(fake(async query=>{calls.push(query);return query.cursor?page([{...row,id:user}]):page([row],'next');}));
  await store.refresh();store.next();await tick();assert.deepEqual(store.getSnapshot().history,[null]);assert.equal(store.getSnapshot().cursor,'next');store.previous();await tick();assert.equal(store.getSnapshot().cursor,null);assert.deepEqual(store.getSnapshot().history,[]);
  for(const [key,value] of Object.entries({q:'search',type:'income',accountId:user,categoryId:user,from:'2026-01-01',to:'2026-10-01',recurring:'manual',limit:50})){store.next();await tick();store.setQuery({[key]:value});await tick();assert.equal(store.getSnapshot().cursor,null);assert.deepEqual(store.getSnapshot().history,[]);assert.equal(calls.at(-1)[key],value);}
  store.clearFilters();await tick();assert.deepEqual(store.getSnapshot().query,{limit:50});
});
test('T25 stale ignored-abort responses/errors cannot replace latest read',async()=>{
  const old=defer(),fresh=defer();let signal;const store=createTransactionsStore(fake((query,options)=>{if(!query.q){signal=options.signal;return old.promise;}return fresh.promise;}));const first=store.refresh();store.setQuery({q:'new'});assert.equal(signal.aborted,true);fresh.resolve(page([{...row,description:'New'}]));await tick();old.resolve(page());await first;assert.equal(store.getSnapshot().rows[0].description,'New');assert.equal(store.getSnapshot().error,null);
});
test('T25 invalid continuation recovers once at first page, preserves filters, never loops',async()=>{
  const calls=[];let invalid=false;const store=createTransactionsStore(fake(async query=>{calls.push(query);if(query.cursor||invalid)throw new V2ApiError(400,'VALIDATION_ERROR','validation',[{field:'cursor',message:'Invalid cursor'}]);return page([row],'opaque');}),{q:'kept'});
  await store.refresh();invalid=true;store.next();await tick();await tick();assert.equal(calls.length,3);assert.equal(calls[2].cursor,undefined);assert.equal(calls[2].q,'kept');assert.equal(store.getSnapshot().cursor,null);assert.match(store.getSnapshot().notice,/first page/);assert.ok(store.getSnapshot().error);
});
test('T25 options and rows clear on user/unmount; auth failures invalidate protected content',async()=>{
  const waiting=defer(),option=defer();let signal;const clients=fake((_q,o)=>{signal=o.signal;return waiting.promise;});clients.accounts.listAccounts=()=>option.promise;const store=createTransactionsStore(clients);const stop=store.start();stop();waiting.resolve(page());option.resolve([]);await tick();assert.equal(signal.aborted,true);assert.equal(store.getSnapshot().rows,null);assert.equal(store.getSnapshot().accounts,null);assert.deepEqual(store.getSnapshot().history,[]);
  const auth=createTransactionsStore(fake(async()=>{throw new V2ApiError(401,'AUTH_INVALID','auth');}));await auth.refresh();assert.equal(auth.getSnapshot().authError,true);assert.equal(auth.getSnapshot().rows,null);
});
test('T25 successful mutations preserve filters; hidden feedback uses server membership and refresh failures retry GET only',async()=>{
  let fail=false,writes=0;const store=createTransactionsStore(fake(async query=>{if(fail)throw new Error('read');return page(query.limit===100?[]:[row]);}),{type:'expense'});await store.refresh();
  assert.equal(await store.mutate(async()=>{writes++;return row;},'create'),true);assert.match(store.getSnapshot().notice,/hidden by the current filters/);assert.equal(store.getSnapshot().query.type,'expense');
  fail=true;assert.equal(await store.mutate(async()=>{writes++;return row;},'edit'),true);assert.match(store.getSnapshot().notice,/updated.*Retry only the read/);assert.deepEqual(store.getSnapshot().rows,[row]);fail=false;await store.refresh();assert.equal(writes,2);
});
test('T25 pending/uncertain/404 mutations retain errors and cannot auto-retry; late writes cannot update new lifetime',async()=>{
  let writes=0;const waiting=defer(),store=createTransactionsStore(fake());const call=()=>{writes++;return waiting.promise;};const first=store.mutate(call,'delete');assert.equal(await store.mutate(call,'delete'),false);waiting.reject(new V2ApiError(0,'NETWORK_ERROR','network',[],true));assert.equal(await first,false);await store.refresh();assert.equal(await store.mutate(call,'delete'),false);assert.equal(writes,1);assert.ok(store.getSnapshot().mutationError.uncertain);
  store.clearMutation();await store.mutate(async()=>{throw new V2ApiError(404,'NOT_FOUND','unexpected');},'edit');assert.equal(store.getSnapshot().mutationError.code,'NOT_FOUND');
  const late=defer(),other=createTransactionsStore(fake()),stop=other.start();const mutation=other.mutate(()=>late.promise,'create');stop();late.resolve(row);assert.equal(await mutation,false);assert.equal(other.getSnapshot().rows,null);
});
test('T25 deletion of sole continuation row moves safely back through cursor history',async()=>{
  let deleted=false;const store=createTransactionsStore(fake(async query=>query.cursor?page(deleted?[]:[{...row,id:user}]):page([row],deleted?null:'next')));await store.refresh();store.next();await tick();assert.equal(store.getSnapshot().history.length,1);
  assert.equal(await store.mutate(async()=>{deleted=true;},'delete'),true);assert.deepEqual(store.getSnapshot().rows,[row]);assert.equal(store.getSnapshot().cursor,null);assert.deepEqual(store.getSnapshot().history,[]);
});
test('T25 runtime route excludes transaction fixtures and production guard remains',()=>{
  const route=readFileSync(new URL('../src/app/v2/transactions/page.tsx',import.meta.url),'utf8'),pageSource=readFileSync(new URL('../src/features/v2/transactions-page.tsx',import.meta.url),'utf8');
  assert.match(route,/TransactionsPage/);assert.doesNotMatch(route,/PrototypePage/);assert.doesNotMatch(pageSource,/usePrototype|from .*fixtures|parseFloat|toFixed/);
  assert.match(readFileSync(new URL('../src/features/v2/protected-boundary.tsx',import.meta.url),'utf8'),/path === '\/v2\/transactions' \? children/);
  assert.match(readFileSync(new URL('../src/app/v2/layout.tsx',import.meta.url),'utf8'),/NODE_ENV !== "development"/);
});
test('T25 session-bound transport reads current T06 session and refuses a changed owner',async()=>{
  let current={data:{access_token:'first',user:{id:user}},error:null};
  globalThis.__t25session=()=>Promise.resolve(current);
  const sessionSource=readFileSync(new URL('../src/lib/api/session-client.ts',import.meta.url),'utf8').replace('import { getSession } from "../auth/auth-service";','const getSession=globalThis.__t25session;').replace('import { createV2ApiClient } from "./v2-client";','const createV2ApiClient=config=>config;');
  const {createSessionClient}=await import(compile(sessionSource));const client=createSessionClient(user);
  assert.equal((await client.tokenSupplier()).data,'first');current={data:{access_token:'new',user:{id:user}},error:null};assert.equal((await client.tokenSupplier()).data,'new');
  current={data:{access_token:'foreign',user:{id:id}},error:null};assert.equal((await client.tokenSupplier()).data,null);
  current={data:null,error:{code:'unavailable'}};assert.deepEqual(await client.tokenSupplier(),current);
});
test('T25 categories validate system/owned active and archived choices without owner fields',async()=>{
  const categorySource=readFileSync(new URL('../src/lib/api/categories.ts',import.meta.url),'utf8').replace('import { createSessionClient } from "./session-client";','const createSessionClient=()=>{throw new Error("inject");};').replace('import { V2ApiError, type V2RequestOptions } from "./v2-client";','const {V2ApiError}=globalThis.__t25transport;');
  const {createCategoryClient}=await import(compile(categorySource));
  const category={id:user,name:'Food',kind:'expense',icon:null,color:null,isSystem:true,status:'active'};
  assert.deepEqual(await createCategoryClient(user,{get:async()=>({data:[category],meta:{count:1}})}).listCategories(),[category]);
  const archived={...category,status:'archived',isSystem:false};assert.deepEqual(await createCategoryClient(user,{get:async(_p,o)=>{assert.equal(o.query.status,'archived');return {data:[archived],meta:{count:1}};}}).listCategories('archived'),[archived]);
  for(const value of [{...category,userId:id},{...category,status:'archived'},{...category,kind:'bad'},{...category,id:'bad'}])await assert.rejects(createCategoryClient(user,{get:async()=>({data:[value],meta:{count:1}})}).listCategories(),e=>e.code==='INVALID_RESPONSE');
});
test('T25 edit into filters refreshes server membership, and option failures retry only choices',async()=>{
  let bad=true,lists=0;const clients=fake(async()=>{lists++;return page();});clients.categories.listCategories=async status=>{if(bad)throw new Error('choices unavailable');return [{id:user,name:'Food',status}];};
  const store=createTransactionsStore(clients,{type:'expense'});await store.refresh();await store.loadOptions();assert.ok(store.getSnapshot().optionsError);assert.equal(store.getSnapshot().categories,null);bad=false;await store.loadOptions();assert.equal(lists,1);assert.equal(store.getSnapshot().categories.length,2);
  assert.equal(await store.mutate(async()=>row,'edit'),true);assert.equal(store.getSnapshot().notice,'Transaction updated.');assert.deepEqual(store.getSnapshot().rows,[row]);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadV2Client} from './v2-client-loader.mjs';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const transport=await loadV2Client();globalThis.__t34transport=transport;
const dates=compile(readFileSync(new URL('../src/lib/api/v2-transactions.ts',import.meta.url),'utf8').replace('import { createSessionClient } from "./session-client";','const createSessionClient=()=>{};').replace('import { V2ApiError, type V2RequestOptions } from "./v2-client";','const {V2ApiError}=globalThis.__t34transport;'));
const source=readFileSync(new URL('../src/lib/api/recurring.ts',import.meta.url),'utf8').replace('import { createSessionClient } from "./session-client";','const createSessionClient=()=>{throw Error("inject");};').replace('import { V2ApiError, type V2RequestOptions } from "./v2-client";','const {V2ApiError}=globalThis.__t34transport;').replace('from "./v2-transactions"',`from "${dates}"`);
const {createRecurringClient,validateRecurringInput}=await import(compile(source));
const {createRecurringStore}=await import(compile(readFileSync(new URL('../src/lib/recurring-store.ts',import.meta.url),'utf8')));
const {V2ApiError,createV2ApiClient}=transport;
const id='a3400000-0000-4000-8000-000000000001',accountId='a3400000-0000-4000-8000-000000000002',categoryId='a3400000-0000-4000-8000-000000000003';
const input={type:'income',accountId,categoryId,amount:'0.10',description:'Exact salary',frequency:'monthly',startDate:'2024-01-31',endDate:null};
const row={...input,id,accountName:'Cash',categoryName:'Salary',currency:'EGP',status:'active',nextOccurrence:'2026-10-31',exhausted:false,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'};
const upcoming={data:[{recurringTransactionId:id,description:row.description,type:row.type,amount:row.amount,currency:'EGP',occurrenceDate:'2026-10-31',accountName:'Cash'}],meta:{from:'2026-10-12',to:'2026-11-10'}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const fake=(recurring={})=>({recurring:{listRecurring:async()=>[row],getUpcomingRecurring:async()=>upcoming,getRecurring:async()=>row,...recurring},accounts:{listAccounts:async status=>status==='active'?[{id:accountId,name:'Cash',status}]:[]},categories:{listCategories:async status=>status==='active'?[{id:categoryId,name:'Salary',kind:'income',status}]:[]}});

test('T34 eight domain operations reuse T10 methods, typed payloads, query and cancellation',async()=>{
  const calls=[],controller=new AbortController();
  const api=createV2ApiClient({baseUrl:'http://localhost:4000/api/v1',tokenSupplier:async()=>({data:'isolated-token',error:null}),fetcher:async(url,options)=>{
    calls.push({url,options});const data=url.includes('/upcoming')?upcoming:url.endsWith('/recurring?status=active&type=income&accountId='+accountId+'&categoryId='+categoryId+'&frequency=monthly')?{data:[row],meta:{count:1}}:{data:row};return Response.json(data);
  }});
  const client=createRecurringClient('owner',api),options={signal:controller.signal};
  assert.equal((await client.listRecurring({status:'active',type:'income',accountId,categoryId,frequency:'monthly'},options))[0].nextOccurrence,row.nextOccurrence);
  await client.getUpcomingRecurring(30,options);await client.getRecurring(id,options);
  await client.createRecurring({...input,status:'active',nextOccurrence:'2000-01-01',userId:'foreign'},options);await client.updateRecurring(id,input,options);
  await client.pauseRecurring(id,options);await client.resumeRecurring(id,options);await client.archiveRecurring(id,options);
  assert.deepEqual(calls.map(c=>c.options.method),['GET','GET','GET','POST','PUT','POST','POST','POST']);
  assert.deepEqual(JSON.parse(calls[3].options.body),input);assert.deepEqual(JSON.parse(calls[5].options.body),{});
  assert.ok(calls.every(c=>c.url.startsWith('http://localhost:4000/api/v2/recurring')&&c.options.signal===controller.signal&&c.options.headers.Authorization==='Bearer isolated-token'));
});
test('T34 exact drafts and calendar validity without recurrence calculation',()=>{
  assert.deepEqual(validateRecurringInput(input),{});
  for(const amount of ['0','0.00','01','1.230','1e2',' 1','+1','1000000000','-1'])assert.ok(validateRecurringInput({...input,amount}).amount);
  for(const amount of ['0.01','0.10','999999999.99'])assert.equal(validateRecurringInput({...input,amount}).amount,undefined);
  assert.equal(validateRecurringInput({...input,startDate:'2024-02-29',frequency:'yearly'}).startDate,undefined);
  assert.ok(validateRecurringInput({...input,startDate:'2025-02-29'}).startDate);
  assert.ok(validateRecurringInput({...input,endDate:'2023-01-01'}).endDate);
  assert.ok(validateRecurringInput({...input,description:'x'.repeat(201)}).description);
  assert.ok(validateRecurringInput({...input,description:'a\nb'}).description);
});
test('T34 malformed resources and private fields fail closed; write parse errors stay uncertain',async()=>{
  for(const change of [{amount:0.1},{amount:'1.230'},{userId:'foreign'},{nextOccurrence:'2025-02-29'},{status:'paused'},{exhausted:true},{id:'bad'}]){
    const client=createRecurringClient('owner',{get:async()=>({data:{...row,...change}}),post:async()=>({data:{...row,...change}})});
    await assert.rejects(client.getRecurring(id),e=>e.code==='INVALID_RESPONSE'&&!e.uncertain);
    await assert.rejects(client.createRecurring(input),e=>e.code==='INVALID_RESPONSE'&&e.uncertain);
  }
  const exhausted={...row,nextOccurrence:null,exhausted:true};assert.equal((await createRecurringClient('owner',{get:async()=>({data:exhausted})}).getRecurring(id)).nextOccurrence,null);
  for(const bad of [{...upcoming,meta:{from:'bad',to:'2026-11-10'}},{...upcoming,data:[...upcoming.data,...upcoming.data]},{...upcoming,data:[{...upcoming.data[0],occurrenceDate:'1900-01-01'}]}])await assert.rejects(createRecurringClient('owner',{get:async()=>bad}).getUpcomingRecurring(),e=>e.code==='INVALID_RESPONSE');
});
test('T34 auth, field errors and uncertain network writes retain T10 classification',async()=>{
  for(const [status,code,kind] of [[401,'AUTH_INVALID','auth'],[400,'VALIDATION_ERROR','validation']]){
    const client=createRecurringClient('owner',createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'test',error:null}),fetcher:async()=>Response.json({error:{code,message:'Safe',details:[{field:'amount',message:'Check amount.'}]}},{status})}));
    await assert.rejects(client.createRecurring(input),e=>e.code===code&&e.kind===kind&&e.details[0].field==='amount'&&!e.uncertain);
  }
  let calls=0;const client=createRecurringClient('owner',createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'test',error:null}),fetcher:async()=>{calls++;throw new Error('lost');}}));
  await assert.rejects(client.createRecurring(input),e=>e.uncertain);assert.equal(calls,1);
});
test('T34 independent loading, empty, stale and upcoming read recovery',async()=>{
  let failList=false,failUpcoming=false;const store=createRecurringStore(fake({listRecurring:async()=>{if(failList)throw Error();return [];},getUpcomingRecurring:async()=>{if(failUpcoming)throw Error();return upcoming;}}));
  assert.equal(store.getSnapshot().loading,true);await store.refresh();assert.deepEqual(store.getSnapshot().rows,[]);assert.deepEqual(store.getSnapshot().upcoming,upcoming);
  failList=true;await store.refreshList();assert.deepEqual(store.getSnapshot().rows,[]);assert.ok(store.getSnapshot().error);assert.deepEqual(store.getSnapshot().upcoming,upcoming);
  failUpcoming=true;await store.refreshUpcoming();assert.ok(store.getSnapshot().upcomingError);assert.deepEqual(store.getSnapshot().upcoming,upcoming);
  failList=false;failUpcoming=false;assert.equal(await store.refresh(),true);
});
test('T34 filters cancel obsolete reads even when the transport ignores abort',async()=>{
  const old=defer();let count=0,signal;const queries=[];
  const store=createRecurringStore(fake({listRecurring:(query,options)=>{queries.push(query);if(!count++){signal=options.signal;return old.promise;}return Promise.resolve([{...row,description:'Current'}]);}}));
  const pending=store.refreshList();store.setQuery({status:'paused',type:'income'});await tick();assert.equal(signal.aborted,true);old.resolve([row]);await pending;assert.equal(store.getSnapshot().rows[0].description,'Current');assert.deepEqual(queries.at(-1),{status:'paused',type:'income'});
  store.clearFilters();await tick();assert.deepEqual(store.getSnapshot().query,{});
});
test('T34 all confirmed mutation kinds refresh both views, preserve filters and prevent duplicate calls',async()=>{
  for(const kind of ['create','edit','pause','resume','archive']){
    const saved=defer();let calls=0,list=0,timeline=0;const store=createRecurringStore(fake({listRecurring:async()=>{list++;return [row];},getUpcomingRecurring:async()=>{timeline++;return upcoming;}}));
    store.setQuery({frequency:'monthly'});await tick();const before=list;
    const run=store.mutate(async()=>{calls++;return saved.promise;});assert.equal(await store.mutate(async()=>{calls++;return row;}),false);saved.resolve(row);assert.equal(await run,true,kind);assert.equal(calls,1);assert.equal(list,before+1);assert.equal(timeline,1);assert.deepEqual(store.getSnapshot().query,{frequency:'monthly'});
  }
});
test('T34 confirmed save with read failure closes safely without repeating mutation',async()=>{
  const store=createRecurringStore(fake({listRecurring:async()=>{throw Error();}}));let calls=0;
  assert.equal(await store.mutate(async()=>{calls++;return row;}),true);assert.equal(calls,1);assert.match(store.getSnapshot().notice,/Saved, but recurring items could not refresh/);assert.equal(store.getSnapshot().pending,false);
});
test('T34 uncertain mutation locks resubmission and inspection uses unfiltered GET only',async()=>{
  const queries=[];const store=createRecurringStore(fake({listRecurring:async q=>{queries.push(q);return [row];}}));let writes=0;
  await store.mutate(async()=>{writes++;throw new V2ApiError(0,'NETWORK_ERROR','network',[],true);});
  assert.equal(await store.mutate(async()=>{writes++;return row;}),false);assert.equal(writes,1);await store.inspect();assert.deepEqual(queries[0],{});assert.deepEqual(store.getSnapshot().inspection,[row]);assert.equal(store.getSnapshot().mutationError.uncertain,true);
  await store.inspect(id);assert.deepEqual(store.getSnapshot().inspection,[row]);
});
test('T34 server validation, archive races and not-found keep safe action context',async()=>{
  for(const code of ['ACCOUNT_ARCHIVED','CATEGORY_ARCHIVED','NOT_FOUND','CONFLICT','VALIDATION_ERROR']){
    const store=createRecurringStore(fake());await store.loadResource(id);await store.mutate(async()=>{throw new V2ApiError(409,code,'unexpected',[{field:'amount',message:'Use a valid amount.'}]);});assert.equal(store.getSnapshot().resource.id,id);assert.equal(store.getSnapshot().mutationError.code,code);assert.equal(store.getSnapshot().mutationError.fields.amount,'Use a valid amount.');
  }
});
test('T34 auth clears definitions, timeline, options, inspection, resource and in-flight writes',async()=>{
  let denied=false;const store=createRecurringStore(fake({listRecurring:async()=>{if(denied)throw new V2ApiError(401,'AUTH_INVALID','auth');return [row];}}));await store.refresh();await store.loadOptions();await store.loadResource(id);await store.inspect();denied=true;await store.refreshList();const state=store.getSnapshot();assert.equal(state.authError,true);for(const key of ['rows','upcoming','accounts','categories','resource','inspection'])assert.equal(state[key],null);
});
test('T34 session disposal suppresses late resources, reads, options and mutations',async()=>{
  const late=defer(),store=createRecurringStore(fake({listRecurring:()=>late.promise,getRecurring:()=>late.promise.then(()=>row)}));const stop=store.start();const resource=store.loadResource(id),mutation=store.mutate(()=>late.promise.then(()=>row));stop();late.resolve([row]);await Promise.all([resource,mutation]);await tick();for(const key of ['rows','upcoming','accounts','categories','resource'])assert.equal(store.getSnapshot()[key],null);
});
test('T34 choices straddling archive retain one historical disabled option',async()=>{
  const clients=fake();clients.accounts.listAccounts=async status=>[{id:accountId,status,name:'Cash'}];clients.categories.listCategories=async status=>[{id:categoryId,status,name:'Salary',kind:'income'}];const store=createRecurringStore(clients);await store.loadOptions();assert.equal(store.getSnapshot().accounts.length,1);assert.equal(store.getSnapshot().accounts[0].status,'archived');assert.equal(store.getSnapshot().categories[0].status,'archived');
});
test('T34 route bypasses recurring fixture runtime and offers no scheduler controls',()=>{
  const read=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  assert.match(read('app/v2/recurring/page.tsx'),/RecurringPage/);assert.ok(!read('app/v2/recurring/page.tsx').includes('PrototypePage'));
  assert.doesNotMatch(read('features/v2/protected-boundary.tsx'),/PrototypeProvider|prototype-context/);
  const page=read('features/v2/recurring-page.tsx');for(const forbidden of ['CRON_SECRET','processDueRecurring','Generate now','getNextOccurrence','setRecurring','usePrototype'])assert.ok(!page.includes(forbidden));
});

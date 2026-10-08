import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadV2Client} from './v2-client-loader.mjs';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const transport=await loadV2Client();globalThis.__t28transport=transport;
const dateSource=readFileSync(new URL('../src/lib/api/v2-transactions.ts',import.meta.url),'utf8').replace('import { createSessionClient } from "./session-client";','const createSessionClient=()=>{};').replace('import { V2ApiError, type V2RequestOptions } from "./v2-client";','const {V2ApiError}=globalThis.__t28transport;');
const datesUrl=compile(dateSource);
const source=readFileSync(new URL('../src/lib/api/transfers.ts',import.meta.url),'utf8').replace('import { createSessionClient } from "./session-client";','const createSessionClient=()=>{throw Error("inject");};').replace('import { V2ApiError, type V2RequestOptions } from "./v2-client";','const {V2ApiError}=globalThis.__t28transport;').replace('from "./v2-transactions"',`from "${datesUrl}"`);
const {createTransferClient,validateTransferInput}=await import(compile(source));
const {createTransfersStore}=await import(compile(readFileSync(new URL('../src/lib/transfers-store.ts',import.meta.url),'utf8')));
const {V2ApiError,createV2ApiClient}=transport;
const id='a2800000-0000-4000-8000-000000000001',from='a2800000-0000-4000-8000-000000000002',to='a2800000-0000-4000-8000-000000000003';
const input={sourceAccountId:from,destinationAccountId:to,amount:'0.30',date:'2026-10-01',description:'Card payment'};
const row={...input,id,sourceAccountName:'Bank',destinationAccountName:'Card',currency:'EGP',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'};
const page=(data=[row],cursor=null,limit=25)=>({data,meta:{limit,nextCursor:cursor,hasMore:cursor!==null}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const defer=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
const fake=(overrides={})=>({transfers:{listTransfers:async()=>page(),getTransfer:async()=>row,...overrides},accounts:{listAccounts:async status=>status==='active'?[{id:from,status},{id:to,status}]:[]}});

test('T28 typed client binds T10 auth, scoped date/cursor queries and strips server fields on every mutation',async()=>{
  const calls=[],client=createTransferClient('owner',createV2ApiClient({baseUrl:'https://api.example.invalid/api/v1',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async(url,options)=>{calls.push({url,options});return options.method==='DELETE'?new Response(null,{status:204}):Response.json(options.method==='GET'&&new URL(url).pathname.endsWith('/transfers')?page([row],null,100):{data:row},{status:options.method==='POST'?201:200});}}));
  const signal=new AbortController().signal;await client.listTransfers({accountId:from,from:'2026-01-01',to:'2026-10-08',limit:100,cursor:'opaque'},{signal});await client.getTransfer(id);await client.createTransfer({...input,userId:'foreign',amount:'0.30'});await client.updateTransfer(id,{...input,id:'foreign'});await client.deleteTransfer(id);
  assert.deepEqual(calls.map(c=>c.options.method),['GET','GET','POST','PUT','DELETE']);assert.deepEqual(Object.fromEntries(new URL(calls[0].url).searchParams),{accountId:from,from:'2026-01-01',to:'2026-10-08',limit:'100',cursor:'opaque'});assert.equal(calls[0].options.signal,signal);
  for(const call of calls){assert.equal(call.options.headers.Authorization,'Bearer synthetic');assert.equal(call.options.cache,'no-store');assert.equal(call.options.credentials,'omit');}
  assert.deepEqual(JSON.parse(calls[2].options.body),input);assert.deepEqual(JSON.parse(calls[3].options.body),input);await assert.rejects(client.getTransfer('../bad'));
});
test('T28 exact money, same-account, optional note and Cairo calendar validation',()=>{
  for(const amount of ['0.01','0.1','1','999999999.99'])assert.deepEqual(validateTransferInput({...input,amount},'2026-10-08'),{});
  for(const amount of ['0','0.00','-1','+1','1e2','01',' 1','1.230','1000000000'])assert.ok(validateTransferInput({...input,amount},'2026-10-08').amount);
  assert.ok(validateTransferInput({...input,destinationAccountId:from.toUpperCase()}).destinationAccountId);
  for(const date of ['2026-02-29','1899-12-31','2026-10-09'])assert.ok(validateTransferInput({...input,date},'2026-10-08').date);
  for(const description of [undefined,null,'','  ','😀'.repeat(200)])assert.deepEqual(validateTransferInput({...input,description},'2026-10-08'),{});
  for(const description of ['😀'.repeat(201),'bad\u0000','bad\ud800'])assert.ok(validateTransferInput({...input,description},'2026-10-08').description);
});
test('T28 malformed resources, mismatched IDs, foreign row scope and pagination fail closed',async()=>{
  for(const bad of [{...row,amount:0.3},{...row,amount:'0.00'},{...row,userId:id},{...row,date:'2026-02-29'},{...row,destinationAccountId:from},{...row,description:undefined}])await assert.rejects(createTransferClient('owner',{get:async()=>page([bad])}).listTransfers());
  await assert.rejects(createTransferClient('owner',{get:async()=>page()}).listTransfers({accountId:id}));
  await assert.rejects(createTransferClient('owner',{put:async()=>({data:{...row,id:from}})}).updateTransfer(id,input),e=>e.uncertain);
  await assert.rejects(createTransferClient('owner',{delete:async()=>({data:row})}).deleteTransfer(id),e=>e.uncertain);
  for(const meta of [{limit:25,nextCursor:null,hasMore:true},{limit:25,nextCursor:'x',hasMore:false},{limit:100,nextCursor:null,hasMore:false}])await assert.rejects(createTransferClient('owner',{get:async()=>({...page(),meta})}).listTransfers());
});
test('T28 validation/auth errors stay definite; database 503, network and bad acknowledgements are uncertain for all writes',async()=>{
  for(const [status,code,uncertain] of [[400,'VALIDATION_ERROR',false],[401,'AUTH_INVALID',false],[409,'ACCOUNT_ARCHIVED',false],[503,'DATABASE_UNAVAILABLE',true],[500,'INTERNAL_ERROR',true]]){
    let calls=0;const client=createTransferClient('owner',createV2ApiClient({baseUrl:'https://api.example.invalid',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async()=>{calls++;return Response.json({error:{code,message:'safe',details:[{field:'amount',message:'Check amount'}]}},{status});}}));
    for(const operation of [()=>client.createTransfer(input),()=>client.updateTransfer(id,input),()=>client.deleteTransfer(id)])await assert.rejects(operation(),e=>e.code===code&&e.uncertain===uncertain);
    assert.equal(calls,3);await assert.rejects(client.listTransfers(),e=>!e.uncertain);
  }
  let calls=0;const client=createTransferClient('owner',createV2ApiClient({baseUrl:'https://api.example.invalid',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async()=>{calls++;throw Error('offline');}}));
  for(const operation of [()=>client.createTransfer(input),()=>client.updateTransfer(id,input),()=>client.deleteTransfer(id)])await assert.rejects(operation(),e=>e.uncertain);assert.equal(calls,3);
});
test('T28 history uses backend account scope and opaque cursor history; expired cursor recovers once',async()=>{
  const calls=[];let expired=false;const store=createTransfersStore(fake({listTransfers:async query=>{calls.push(query);if(query.cursor&&expired)throw new V2ApiError(400,'VALIDATION_ERROR','validation',[{field:'cursor',message:'expired'}]);return query.cursor?page([{...row,id:to}]):page(Array.from({length:25},(_,i)=>({...row,id:`a2800000-0000-4000-8000-${String(i).padStart(12,'0')}`})),'opaque');}}),async()=>true,from);
  await store.refresh();store.next();await tick();assert.equal(store.getSnapshot().cursor,'opaque');assert.deepEqual(store.getSnapshot().history,[null]);store.previous();await tick();assert.equal(store.getSnapshot().cursor,null);store.next();await tick();expired=true;await store.refresh();assert.equal(store.getSnapshot().cursor,null);assert.deepEqual(store.getSnapshot().history,[]);assert.ok(calls.every(q=>q.accountId===from));assert.equal(calls.at(-1).cursor,undefined);
});
test('T28 create/edit/delete success refresh only authoritative GET data without browser deltas',async()=>{
  let balances=0,reads=0;const store=createTransfersStore(fake({listTransfers:async()=>{reads++;return page();}}),async()=>{balances++;return true;});await store.loadOptions();
  for(const kind of ['create','edit','delete']){let writes=0;assert.equal(await store.mutate(async()=>{writes++;return row;},kind),true);assert.equal(writes,1);assert.equal(store.getSnapshot().pending,false);assert.equal(store.getSnapshot().rows[0].amount,'0.30');}
  assert.equal(balances,3);assert.equal(reads,3);
});
test('T28 pending mutations dispatch once and uncommitted UI is not optimistic',async()=>{
  const delayed=defer();let count=0;const store=createTransfersStore(fake(),async()=>true);await store.refresh();const before=store.getSnapshot().rows;const saving=store.mutate(()=>{count++;return delayed.promise;},'create');assert.equal(store.getSnapshot().rows,before);assert.equal(await store.mutate(async()=>{count++;},'create'),false);assert.equal(count,1);delayed.resolve(row);assert.equal(await saving,true);
});
test('T28 definite field/archive/missing failures preserve rows and allow deliberate correction',async()=>{
  const store=createTransfersStore(fake(),async()=>true);await store.refresh();
  for(const [code,status] of [['VALIDATION_ERROR',400],['ACCOUNT_ARCHIVED',409],['NOT_FOUND',404]]){assert.equal(await store.mutate(async()=>{throw new V2ApiError(status,code,'validation',[{field:'amount',message:'Check amount'}]);},'edit'),false);assert.equal(store.getSnapshot().mutationError.fields.amount,'Check amount');assert.equal(store.getSnapshot().mutationError.uncertain,false);assert.deepEqual(store.getSnapshot().rows,[row]);store.clearMutation();}
});
test('T28 uncertain create/edit/delete block repeats and inspect with GET only before deliberate retry',async()=>{
  for(const kind of ['create','edit','delete']){
    let writes=0,reads=0;const store=createTransfersStore(fake({listTransfers:async()=>{reads++;return page([row],null,100);},getTransfer:async()=>{reads++;if(kind==='delete')throw new V2ApiError(404,'NOT_FOUND','unexpected');return row;}}),async()=>true);
    const operation=async()=>{writes++;throw new V2ApiError(503,'DATABASE_UNAVAILABLE','server',[],true);};await store.mutate(operation,kind);assert.equal(await store.mutate(operation,kind),false);store.acknowledgeInspection();assert.ok(store.getSnapshot().mutationError);
    assert.equal(await store.inspect(kind,input,id),true);assert.equal(writes,1);assert.ok(reads>=2);assert.equal(store.getSnapshot().inspection.length,kind==='delete'?0:1);assert.ok(store.getSnapshot().mutationError);store.acknowledgeInspection();assert.equal(store.getSnapshot().mutationError,null);
  }
});
test('T28 committed mutation with failed balance/history read remains successful and refresh never repeats write',async()=>{
  let writes=0,fail=true;const store=createTransfersStore(fake({listTransfers:async()=>{if(fail)throw Error('offline');return page();}}),async()=>!fail);
  assert.equal(await store.mutate(async()=>{writes++;},'create'),true);assert.match(store.getSnapshot().notice,/Account balances or history could not refresh/);fail=false;await store.refresh();assert.equal(writes,1);
});
test('T28 failed inspection cannot unlock uncertain write',async()=>{
  const store=createTransfersStore(fake(),async()=>false);await store.mutate(async()=>{throw new V2ApiError(0,'NETWORK_ERROR','network',[],true);},'edit');assert.equal(await store.inspect('edit',input,id),false);store.acknowledgeInspection();assert.ok(store.getSnapshot().mutationError);assert.equal(store.getSnapshot().inspected,false);
});
test('T28 session teardown cancels reads, options, writes and inspections; ignored aborts cannot publish owner A',async()=>{
  for(const phase of ['read','options','write','inspect']){
    const delayed=defer();let signal;const clients=fake();
    if(phase==='read')clients.transfers.listTransfers=(_q,o)=>{signal=o.signal;return delayed.promise;};
    if(phase==='options')clients.accounts.listAccounts=(_status,o)=>{signal=o.signal;return delayed.promise;};
    if(phase==='inspect')clients.transfers.getTransfer=(_id,o)=>{signal=o.signal;return delayed.promise;};
    const store=createTransfersStore(clients,async()=>true),stop=store.start();await tick();
    const pending=phase==='write'?store.mutate(o=>{signal=o.signal;return delayed.promise;},'create'):phase==='inspect'?store.inspect('edit',input,id):null;
    stop();assert.equal(signal.aborted,true);delayed.resolve(phase==='read'?page():phase==='options'?[]:row);if(pending)await pending;await tick();assert.equal(store.getSnapshot().rows,null);assert.equal(store.getSnapshot().accounts,null);assert.equal(store.getSnapshot().inspection,null);
  }
});
test('T28 auth failure removes transfer/options/inspection state immediately',async()=>{
  let invalid=false;const store=createTransfersStore(fake({listTransfers:async()=>{if(invalid)throw new V2ApiError(401,'AUTH_INVALID','auth');return page();}}),async()=>true);await store.refresh();await store.loadOptions();invalid=true;await store.refresh();assert.equal(store.getSnapshot().authError,true);assert.equal(store.getSnapshot().rows,null);assert.equal(store.getSnapshot().accounts,null);
});
test('T28 obsolete ignored-abort history responses never overwrite fresh reads',async()=>{
  const old=defer();let count=0,signal;const store=createTransfersStore(fake({listTransfers:(_q,o)=>{if(!count++){signal=o.signal;return old.promise;}return Promise.resolve(page([{...row,description:'Fresh'}]));}}),async()=>true);const first=store.refresh();await store.refresh();assert.equal(signal.aborted,true);old.resolve(page());await first;assert.equal(store.getSnapshot().rows[0].description,'Fresh');
});
test('T28 account status reads straddling archive produce one disabled historical choice',async()=>{
  const clients=fake();clients.accounts.listAccounts=async status=>[{id:from,status,name:'Bank'}];
  const store=createTransfersStore(clients,async()=>true);assert.equal(await store.loadOptions(),true);assert.deepEqual(store.getSnapshot().accounts,[{id:from,status:'archived',name:'Bank'}]);
});

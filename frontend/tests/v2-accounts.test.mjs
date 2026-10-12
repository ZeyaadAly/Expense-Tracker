import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const transportSource=readFileSync(new URL('../src/lib/api/v2-client.ts',import.meta.url),'utf8').replace('import { getAccessToken } from "../auth/auth-service";','const getAccessToken=async()=>({data:null,error:null});');
const transportUrl=compile(transportSource),{createV2ApiClient,V2ApiError}=await import(transportUrl);
const domainSource=readFileSync(new URL('../src/lib/api/accounts.ts',import.meta.url),'utf8').replace('from "./v2-client"',`from "${transportUrl}"`).replace('import { getSession } from "../auth/auth-service";','const getSession=async()=>({data:null,error:null});');
const {createAccountClient,validateAccountInput}=await import(compile(domainSource));
const {createAccountsStore}=await import(compile(readFileSync(new URL('../src/lib/accounts-store.ts',import.meta.url),'utf8')));
const id='a1900000-0000-4000-8000-000000000001',other='b1900000-0000-4000-8000-000000000001';
const account={id,name:'Bank',type:'bank',openingBalance:'0.00',currentBalance:'0.30',currency:'EGP',status:'active',openingBalanceEditable:true,createdAt:'2026-10-07T12:00:00.000Z',updatedAt:'2026-10-07T12:00:00.000Z'};
const input={name:'Bank',type:'bank',openingBalance:'0.00'},summary={netPosition:'0.30',currency:'EGP'};
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
const fake=(overrides={})=>({listAccounts:async()=>[account],getSummary:async()=>summary,...overrides});
const tick=()=>new Promise(r=>setTimeout(r,0));

test('T19 domain client sends authenticated strict contracts for every lifecycle operation',async()=>{
  const calls=[];
  const transport=createV2ApiClient({baseUrl:'https://api.example.invalid/api/v1',tokenSupplier:async()=>({data:'test-token',error:null}),fetcher:async(url,options)=>{
    calls.push({url,options});const path=new URL(url).pathname;
    return Response.json(path.endsWith('/summary')?{data:summary}:path.endsWith('/archive')?{data:{...account,status:'archived'},meta:{pausedRecurringCount:2}}:path.endsWith('/accounts')&&options.method==='GET'?{data:[{...account,status:new URL(url).searchParams.get('status')}],meta:{count:1}}:{data:account});
  }});
  const client=createAccountClient(id,transport);await client.listAccounts();await client.listAccounts('archived');assert.deepEqual(await client.getSummary(),summary);
  await client.createAccount({...input,userId:other});await client.updateAccount(id,{...input,status:'archived'});assert.equal((await client.archiveAccount(id)).pausedRecurringCount,2);await client.restoreAccount(id);
  assert.deepEqual(calls.map(c=>[new URL(c.url).pathname,c.options.method,c.options.body]),[['/api/v2/accounts','GET',undefined],['/api/v2/accounts','GET',undefined],['/api/v2/accounts/summary','GET',undefined],['/api/v2/accounts','POST',JSON.stringify({...input,currency:'EGP'})],['/api/v2/accounts/'+id,'PUT',JSON.stringify(input)],['/api/v2/accounts/'+id+'/archive','POST','{}'],['/api/v2/accounts/'+id+'/restore','POST','{}']]);
  assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer test-token'&&c.options.cache==='no-store'));
  assert.deepEqual(calls.slice(0,2).map(c=>new URL(c.url).searchParams.get('status')),['active','archived']);
  for(const method of ['archiveAccount','restoreAccount'])await assert.rejects(client[method]('../foreign'),e=>e.code==='INVALID_REQUEST');
});
test('T19 resource validation rejects malformed money, owner leakage, wrong IDs/status/count and invalid write responses',async()=>{
  for(const value of [{...account,currentBalance:0.3},{...account,currentBalance:'1e9'},{...account,userId:other},{...account,currency:'USD'},{...account,openingBalanceEditable:undefined},{...account,createdAt:'bad'}])await assert.rejects(createAccountClient(id,{get:async()=>({data:[value],meta:{count:1}})}).listAccounts(),e=>e.code==='INVALID_RESPONSE');
  await assert.rejects(createAccountClient(id,{get:async()=>({data:[{...account,status:'archived'}],meta:{count:1}})}).listAccounts());
  await assert.rejects(createAccountClient(id,{get:async()=>({data:[account],meta:{count:2}})}).listAccounts());
  await assert.rejects(createAccountClient(id,{put:async()=>({data:{...account,id:other}})}).updateAccount(id,input),e=>e.uncertain);
  await assert.rejects(createAccountClient(id,{post:async()=>undefined}).createAccount(input),e=>e.uncertain);
  await assert.rejects(createAccountClient(id,{post:async()=>({data:{...account,status:'archived'},meta:{pausedRecurringCount:-1}})}).archiveAccount(id),e=>e.uncertain);
});
test('T19 domain preserves 404/validation/auth/503 and uncertain network semantics from T10',async()=>{
  for(const [status,code] of [[404,'NOT_FOUND'],[400,'VALIDATION_ERROR'],[401,'AUTH_INVALID'],[503,'DATABASE_UNAVAILABLE']]) {
    const transport=createV2ApiClient({baseUrl:'https://api.example.invalid',tokenSupplier:async()=>({data:'test-token',error:null}),fetcher:async()=>Response.json({error:{code,message:'private backend details',details:[{field:'name',message:'A long validation message'}]}},{status})});
    await assert.rejects(createAccountClient(id,transport).createAccount(input),e=>e.code===code&&!e.message.includes('private')&&!e.uncertain);
  }
  const client=createAccountClient(id,createV2ApiClient({baseUrl:'https://api.example.invalid',tokenSupplier:async()=>({data:'test-token',error:null}),fetcher:async()=>{throw new TypeError('network');}}));
  await assert.rejects(client.createAccount(input),e=>e.uncertain&&e.kind==='network');
  await assert.rejects(client.listAccounts(),e=>!e.uncertain&&e.kind==='network');
});
test('T19 local validation preserves signed decimal strings and Unicode bounds',()=>{
  for(const money of ['0','0.00','5000.00','-250.00','999999999.99','-999999999.99'])assert.deepEqual(validateAccountInput({...input,openingBalance:money}),{});
  for(const money of ['-0.00','1.230','1e2','1000000000',' 1','+1'])assert.ok(validateAccountInput({...input,openingBalance:money}).openingBalance);
  assert.deepEqual(validateAccountInput({...input,name:'😀'.repeat(100)}),{});assert.ok(validateAccountInput({...input,name:'😀'.repeat(101)}).name);
});
test('T19 store loading, empty, error and retained stale states',async()=>{
  const waiting=deferred(),store=createAccountsStore(fake({listAccounts:()=>waiting.promise}));const loading=store.refresh();assert.equal(store.getSnapshot().accounts,null);assert.equal(store.getSnapshot().summary,null);assert.equal(store.getSnapshot().loading,true);waiting.resolve([]);await loading;assert.deepEqual(store.getSnapshot().accounts,[]);
  let fail=false;const retained=createAccountsStore(fake({listAccounts:async()=>{if(fail)throw new V2ApiError(503,'DATABASE_UNAVAILABLE','server');return [account];}}));await retained.refresh();fail=true;await retained.refresh();assert.deepEqual(retained.getSnapshot().accounts,[account]);assert.ok(retained.getSnapshot().error);assert.deepEqual(retained.getSnapshot().summary,summary);
});
test('T19 rapid filter changes suppress obsolete success and failure even when transport ignores abort',async()=>{
  const old=deferred(),latest=deferred();const store=createAccountsStore(fake({listAccounts:status=>status==='active'?old.promise:latest.promise}));const first=store.refresh();const second=store.refresh('archived');latest.resolve([{...account,status:'archived'}]);await second;old.reject(new Error('late'));await first;assert.equal(store.getSnapshot().status,'archived');assert.equal(store.getSnapshot().accounts[0].status,'archived');assert.equal(store.getSnapshot().error,null);
});
test('T19 lifecycle mutation succeeds once and preserves selected filter; failed post-save refresh retries reads only',async()=>{
  let fail=false,writes=0,reads=0;const store=createAccountsStore(fake({listAccounts:async()=>{reads++;if(fail)throw new Error('read failed');return [];}}));await store.refresh('archived');
  assert.equal(await store.mutate(async()=>{writes++;fail=true;},'Saved'),true);assert.equal(writes,1);assert.equal(store.getSnapshot().status,'archived');assert.match(store.getSnapshot().notice,/Saved, but/);fail=false;await store.refresh();assert.equal(writes,1);assert.equal(reads,3);
});
test('T19 pending and uncertain mutations cannot duplicate; fields/404/409 remain safe',async()=>{
  const pending=deferred(),store=createAccountsStore(fake());let writes=0;const operation=()=>{writes++;return pending.promise;};const first=store.mutate(operation,'Saved');assert.equal(await store.mutate(operation,'Saved'),false);pending.reject(new V2ApiError(0,'NETWORK_ERROR','network',[],true));assert.equal(await first,false);assert.equal(await store.mutate(operation,'Saved'),false);assert.equal(writes,1);assert.equal(store.getSnapshot().mutationError.uncertain,true);
  for(const [status,code,details] of [[404,'NOT_FOUND',[]],[409,'ACCOUNT_CONFLICT',[]],[400,'VALIDATION_ERROR',[{field:'name',message:'Use another name'}]]]){store.clearMutation();await store.mutate(async()=>{throw new V2ApiError(status,code,'unexpected',details);},'Saved');assert.equal(store.getSnapshot().mutationError.code,code);if(details.length)assert.equal(store.getSnapshot().mutationError.fields.name,details[0].message);}
});
test('T19 user change/unmount cancels requests, ignores late writes and clears data; 401 clears protected content',async()=>{
  const old=deferred();let signal;const store=createAccountsStore(fake({listAccounts:(_status,options)=>{signal=options.signal;return old.promise;}}));const stop=store.start();stop();assert.equal(signal.aborted,true);old.resolve([account]);await tick();assert.equal(store.getSnapshot().accounts,null);
  const expired=createAccountsStore(fake({listAccounts:async()=>{throw new V2ApiError(401,'AUTH_INVALID','auth');}}));await expired.refresh();assert.equal(expired.getSnapshot().authError,true);assert.equal(expired.getSnapshot().accounts,null);assert.equal(expired.getSnapshot().summary,null);
  const write=deferred(),writer=createAccountsStore(fake());const cleanup=writer.start();await tick();const mutation=writer.mutate(()=>write.promise,'Saved');cleanup();write.resolve(account);assert.equal(await mutation,false);assert.equal(writer.getSnapshot().accounts,null);
});

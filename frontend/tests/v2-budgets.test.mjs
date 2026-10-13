import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadV2Client} from './v2-client-loader.mjs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const transport=await loadV2Client();globalThis.__t44transport=transport;
const source=read('lib/api/budgets.ts').replace('import {createSessionClient} from "./session-client";','const createSessionClient=()=>{throw Error("inject");};').replace('import {V2ApiError,type V2RequestOptions} from "./v2-client";','const {V2ApiError}=globalThis.__t44transport;');
const {createBudgetClient,parseBudget,validateBudgetDraft}=await import(compile(source));
const {createBudgetsStore}=await import(compile(read('lib/budgets-store.ts')));
const {createV2ApiClient,V2ApiError}=transport;
const id='a4400000-0000-4000-8000-000000000001',categoryId='c4400000-0000-4000-8000-000000000001',period={year:2026,month:10};
const row={id,categoryId,categoryName:'Food',...period,amount:'1000.00',alertThresholdPercent:90,spent:'1000.01',remaining:'-0.01',percentUsed:'100.00',status:'exceeded',createdAt:'2026-10-13T00:00:00.000Z',updatedAt:'2026-10-13T00:00:00.000Z'};
const options={listCategories:async status=>[{id:categoryId,status,kind:'expense'},{id:id,status,kind:'income'}]};
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setTimeout(r,0));

test('T44 real T10 Budget CRUD contract, query, current token and abort propagation',async()=>{
  const calls=[],controller=new AbortController();let token='first';
  const client=createBudgetClient(id,createV2ApiClient({baseUrl:'http://localhost:4000/api/v1',tokenSupplier:async()=>({data:token,error:null}),fetcher:async(url,o)=>{calls.push({url,o});return o.method==='DELETE'?new Response(null,{status:204}):Response.json({data:o.method==='GET'&&new URL(url).pathname.endsWith('/budgets')?[row]:row,meta:{count:1}});}}));
  assert.deepEqual(await client.listBudgets(period,{signal:controller.signal}),[row]);token='fresh';await client.listBudgets({...period,categoryId});await client.getBudget(id);await client.createBudget({...period,categoryId,amount:'1000.00',alertThresholdPercent:90});await client.updateBudget(id,{amount:'1000.00',alertThresholdPercent:90});await client.deleteBudget(id);
  assert.equal(new URL(calls[0].url).search,'?year=2026&month=10');assert.equal(new URL(calls[1].url).searchParams.get('categoryId'),categoryId);assert.equal(calls[0].o.signal,controller.signal);assert.equal(calls[0].o.headers.Authorization,'Bearer first');assert.equal(calls[1].o.headers.Authorization,'Bearer fresh');
  assert.deepEqual(JSON.parse(calls[4].o.body),{amount:'1000.00',alertThresholdPercent:90});assert.equal(calls[5].o.body,undefined);assert.equal(new URL(calls[5].url).pathname,'/api/v2/budgets/'+id);
});
test('T44 status and rounded percentage remain independent; malformed responses fail closed',()=>{
  for(const status of ['normal','near_limit','exceeded'])assert.equal(parseBudget({...row,status}).status,status);
  for(const patch of [{amount:1000},{spent:1.1},{percentUsed:100},{status:'at_limit'},{userId:id},{month:'10'},{alertThresholdPercent:0},{remaining:'-0.001'}])assert.throws(()=>parseBudget({...row,...patch}),e=>e.code==='INVALID_RESPONSE');
  assert.equal(parseBudget({...row,spent:'1999999999.98',remaining:'-999999999.99',percentUsed:'200.00'}).remaining,'-999999999.99');
});
test('T44 string amount/integer threshold draft validation without coercion or clamping',()=>{
  assert.deepEqual(validateBudgetDraft({categoryId,amount:'0.10',threshold:'90'},true),{});
  for(const amount of ['','0','-1','1.001','1e3','1000000000.00',' 1'])assert.ok(validateBudgetDraft({categoryId,amount,threshold:'90'},true).amount);
  for(const threshold of ['0','101','75.5',' 90','090'])assert.ok(validateBudgetDraft({categoryId,amount:'1.00',threshold},true).alertThresholdPercent);
  assert.deepEqual(validateBudgetDraft({categoryId:'',amount:'1.00',threshold:'75'},false),{});
});
test('T44 conflict/auth/validation/network/abort classifications stay in T10; writes become uncertain',async()=>{
  for(const [status,code]of [[409,'CONFLICT'],[401,'AUTH_INVALID'],[400,'VALIDATION_ERROR']]){
    const client=createBudgetClient(id,createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async()=>Response.json({error:{code,message:'safe',details:[]}},{status})}));await assert.rejects(client.createBudget({...row}),e=>e.code===code&&!e.uncertain);
  }
  for(const method of ['createBudget','updateBudget','deleteBudget']){
    const client=createBudgetClient(id,createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async()=>{throw Error('lost response');}}));
    await assert.rejects(method==='createBudget'?client[method](row):method==='updateBudget'?client[method](id,row):client[method](id),e=>e.uncertain&&e.kind==='network');
  }
  const controller=new AbortController();controller.abort();await assert.rejects(createBudgetClient(id,createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'synthetic',error:null})})).getBudget(id,{signal:controller.signal}),e=>e.kind==='aborted');
});
test('T44 loading/empty/options, month switching and stale response suppression',async()=>{
  const late=defer();let first=true,signal;const store=createBudgetsStore({listBudgets:async(p,o)=>{if(first){first=false;signal=o.signal;return late.promise;}return [{...row,...p}];}},options,period);
  assert.equal(store.getSnapshot().rows,null);store.start();store.setPeriod({year:2026,month:9});await tick();late.resolve([row]);await tick();assert.equal(signal.aborted,true);assert.equal(store.getSnapshot().rows[0].month,9);assert.ok(store.getSnapshot().categories.every(c=>c.kind==='expense'));
  const empty=createBudgetsStore({listBudgets:async()=>[]},options,period);await empty.refresh();assert.deepEqual(empty.getSnapshot().rows,[]);
});
test('T44 mutations refresh list only, preserve month and keep confirmed writes distinct from read failure',async()=>{
  let fail=false,lists=0,choices=0,writes=0;const client={listBudgets:async()=>{lists++;if(fail)throw Error('offline');return [row];}};
  const store=createBudgetsStore(client,{listCategories:async()=>{choices++;return [];}},period);await store.refresh();
  for(const message of ['Budget saved.','Budget saved.','Budget deleted. Expenses are unchanged.'])assert.equal(await store.mutate(async()=>{writes++;},message),true);
  assert.equal(writes,3);assert.equal(lists,4);assert.equal(choices,0);assert.deepEqual(store.getSnapshot().period,period);
  fail=true;assert.equal(await store.mutate(async()=>{writes++;},'Budget saved.'),true);assert.ok(store.getSnapshot().rows);assert.match(store.getSnapshot().notice,/GET refresh/);assert.ok(store.getSnapshot().error);
});
test('T44 uncertain writes block resubmission until successful GET inspection plus deliberate acknowledgement',async()=>{
  let writes=0;const store=createBudgetsStore({listBudgets:async()=>[row]},options,period);
  const operation=async()=>{writes++;throw new V2ApiError(0,'NETWORK_ERROR','network',[],true);};
  assert.equal(await store.mutate(operation,'Saved'),false);await store.mutate(operation,'Saved');assert.equal(writes,1);store.allowRetry();assert.ok(store.getSnapshot().mutationError);
  await store.inspect();assert.deepEqual(store.getSnapshot().inspection,[row]);await store.mutate(operation,'Saved');assert.equal(writes,1);store.allowRetry();await store.mutate(operation,'Saved');assert.equal(writes,2);
});
test('T44 pending mutation blocks double submit and switching month; unavailable resources remain safe',async()=>{
  const pending=defer(),store=createBudgetsStore({listBudgets:async()=>[],getBudget:async()=>{throw new V2ApiError(404,'NOT_FOUND','unexpected');}},options,period);let calls=0;
  const first=store.mutate(()=>{calls++;return pending.promise;},'Saved');assert.equal(await store.mutate(async()=>{calls++;},'Saved'),false);store.setPeriod({year:2025,month:1});assert.deepEqual(store.getSnapshot().period,period);pending.resolve();await first;assert.equal(calls,1);
  await store.loadResource(id);assert.equal(store.getSnapshot().resource,null);assert.ok(store.getSnapshot().resourceError);await store.inspect(id);assert.deepEqual(store.getSnapshot().inspection,[]);
});
test('T44 session teardown clears rows/options/resource/drafts and suppresses late success/failure',async()=>{
  for(const reject of [false,true]){
    const late=defer();let signal;const a=createBudgetsStore({listBudgets:(_p,o)=>{signal=o.signal;return late.promise;}},options,period),stop=a.start();stop();assert.equal(signal.aborted,true);assert.equal(a.getSnapshot().rows,null);assert.deepEqual(a.getSnapshot().categories,[]);
    const b=createBudgetsStore({listBudgets:async()=>[]},options,period);await b.refresh();if(reject)late.reject(new V2ApiError(401,'AUTH_INVALID','auth'));else late.resolve([row]);await tick();assert.equal(a.getSnapshot().rows,null);assert.equal(b.getSnapshot().authError,false);
  }
});
test('T44 current 401 clears financial data and forbids new reads/writes',async()=>{
  let fail=false;const store=createBudgetsStore({listBudgets:async()=>{if(fail)throw new V2ApiError(401,'AUTH_INVALID','auth');return [row];}},options,period);await store.refresh();fail=true;await store.refresh();assert.equal(store.getSnapshot().rows,null);assert.deepEqual(store.getSnapshot().categories,[]);assert.equal(store.getSnapshot().authError,true);assert.equal(await store.mutate(async()=>{},'Saved'),false);
});
test('T44 runtime fixture, status authority, mutation safety and production boundaries',()=>{
  const page=read('features/v2/budgets-page.tsx');assert.match(read('app/v2/budgets/page.tsx'),/BudgetsPage/);assert.doesNotMatch(read('app/v2/budgets/page.tsx'),/PrototypePage/);assert.match(page,/key=\{user.id\}/);
  assert.match(page,/status=\{b.status\}/);assert.match(page,/percent=\{b.percentUsed\}/);assert.match(page,/remaining=\{b.remaining\}/);assert.doesNotMatch(page,/parseFloat|toFixed|budgetProps|usePrototype|from .*fixtures/);assert.match(page,/Number\(draft.threshold\)/);assert.match(read('app/v2/layout.tsx'),/NODE_ENV !== "development"\) notFound/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadV2Client} from './v2-client-loader.mjs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const transport=await loadV2Client();globalThis.__t46transport=transport;
const source=read('lib/api/goals.ts').replace('import {createSessionClient} from "./session-client";','const createSessionClient=()=>{throw Error("inject");};').replace('import {V2ApiError,type V2RequestOptions} from "./v2-client";','const {V2ApiError}=globalThis.__t46transport;');
const {createGoalClient,parseGoal,validateGoalDraft,goalIsFunded,goalUpdate}=await import(compile(source));
const {createGoalsStore}=await import(compile(read('lib/goals-store.ts')));
const {createV2ApiClient,V2ApiError}=transport;
const id='a4600000-0000-4000-8000-000000000001',accountId='c4600000-0000-4000-8000-000000000001';
const row={id,name:'Manual goal',targetAmount:'0.30',savedAmount:'0.10',remainingAmount:'0.20',percentComplete:'33.33',targetDate:null,linkedAccountId:accountId,status:'active',createdAt:'2026-10-13T00:00:00.000Z',updatedAt:'2026-10-13T00:00:00.000Z'};
const options={listAccounts:async status=>[{id:accountId,status,name:status+' reference'}]};
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setTimeout(r,0));

test('T46 six T10 Goal routes, status queries, payload whitelists, fresh tokens and signals',async()=>{
  const calls=[],controller=new AbortController();let token='first';
  const client=createGoalClient(id,createV2ApiClient({baseUrl:'http://localhost:4000/api/v1',tokenSupplier:async()=>({data:token,error:null}),fetcher:async(url,o)=>{calls.push({url,o});const status=new URL(url).searchParams.get('status');return Response.json({data:o.method==='GET'&&new URL(url).pathname.endsWith('/goals')?[{...row,status:status??'active',savedAmount:status==='completed'?'0.30':'0.10'}]:row,meta:{count:1}});}}));
  assert.deepEqual(await client.listGoals(undefined,{signal:controller.signal}),[row]);token='fresh';await client.listGoals('archived');await client.getGoal(id);await client.createGoal({...row,userId:'ignored'});await client.updateGoal(id,{...goalUpdate(row),status:'active',userId:'ignored'});await client.completeGoal(id);await client.archiveGoal(id);
  assert.equal(new URL(calls[0].url).search,'');assert.equal(new URL(calls[1].url).search,'?status=archived');assert.equal(calls[0].o.signal,controller.signal);assert.equal(calls[0].o.headers.Authorization,'Bearer first');assert.equal(calls[1].o.headers.Authorization,'Bearer fresh');
  assert.deepEqual(Object.keys(JSON.parse(calls[3].o.body)).sort(),['name','targetAmount','savedAmount','targetDate','linkedAccountId'].sort());assert.deepEqual(JSON.parse(calls[4].o.body),goalUpdate(row));assert.equal(new URL(calls[4].url).pathname,'/api/v2/goals/'+id);assert.deepEqual(JSON.parse(calls[5].o.body),{});assert.equal(new URL(calls[5].url).pathname,'/api/v2/goals/'+id+'/complete');assert.equal(new URL(calls[6].url).pathname,'/api/v2/goals/'+id+'/archive');
});
test('T46 manual resource validation, large unbounded percentage, no invented fields',()=>{
  for(const patch of [{savedAmount:0.1},{percentComplete:100},{remainingAmount:'-0.01'},{status:'reopened'},{userId:id},{completionSuggested:true},{linkedAccountName:'x'},{completedAt:row.createdAt},{targetAmount:'0.00'},{targetDate:'2026-02-30'},{targetAmount:'1000000000.00'},{savedAmount:'1000000000.00'}])assert.throws(()=>parseGoal({...row,...patch}),e=>e.code==='INVALID_RESPONSE');
  assert.equal(parseGoal({...row,targetAmount:'0.01',savedAmount:'999999999.99',remainingAmount:'0.00',percentComplete:'9999999999900.00'}).percentComplete,'9999999999900.00');
  for(const status of ['active','completed','archived'])assert.equal(parseGoal({...row,status,savedAmount:'0.30'}).status,status);
});
test('T46 completion comparison uses exact strings rather than displayed rounded percentages',()=>{
  for(const [targetAmount,savedAmount,expected]of [['0.30','0.00',false],['0.30','0.10',false],['0.30','0.30',true],['0.30','0.40',true],['10000.00','9999.99',false],['9.00','10.00',true],['999999999.99','999999999.98',false],['999999999.99','999999999.99',true]])assert.equal(goalIsFunded({...row,targetAmount,savedAmount}),expected);
  assert.equal(goalUpdate({...row,status:'completed'}).status,'completed');
});
test('T46 draft validation: Unicode, exact strings, date-only, completed lowering requires explicit reopen',()=>{
  assert.deepEqual(validateGoalDraft({...goalUpdate(row),name:'😀'.repeat(120)}),{});
  for(const name of ['','  ','😀'.repeat(121),'x\u0000','\ud800'])assert.ok(validateGoalDraft({...row,name}).name);
  for(const targetAmount of ['0','-1','1e2','1.001','1000000000','01',' 1'])assert.ok(validateGoalDraft({...row,targetAmount}).targetAmount);
  for(const savedAmount of ['0','0.0','0.00','999999999.99'])assert.ok(!validateGoalDraft({...row,savedAmount}).savedAmount);
  for(const targetDate of [null,'1900-01-01','2000-02-29','9999-12-31'])assert.ok(!validateGoalDraft({...row,targetDate}).targetDate);
  for(const targetDate of ['1900-02-29','2026-02-30','2026-04-31','2026-01-01T00:00:00Z'])assert.ok(validateGoalDraft({...row,targetDate}).targetDate);
  assert.ok(validateGoalDraft({...goalUpdate(row),status:'completed'}).savedAmount);assert.deepEqual(validateGoalDraft({...goalUpdate(row),status:'active'}),{});
});
test('T46 auth/validation/domain/network/cancel errors use T10 and all mutations preserve uncertainty',async()=>{
  for(const [status,code]of [[409,'GOAL_INVALID_STATE'],[409,'ACCOUNT_ARCHIVED'],[404,'NOT_FOUND'],[401,'AUTH_INVALID'],[400,'VALIDATION_ERROR']]){
    const client=createGoalClient(id,createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async()=>Response.json({error:{code,message:'safe',details:[]}},{status})}));await assert.rejects(client.createGoal(row),e=>e.code===code&&!e.uncertain);
  }
  for(const method of ['createGoal','updateGoal','completeGoal','archiveGoal']){const client=createGoalClient(id,createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'synthetic',error:null}),fetcher:async()=>{throw Error('lost response');}}));await assert.rejects(method==='createGoal'?client[method](row):method==='updateGoal'?client[method](id,goalUpdate(row)):client[method](id),e=>e.uncertain&&e.kind==='network');}
  const controller=new AbortController();controller.abort();await assert.rejects(createGoalClient(id,createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'synthetic',error:null})})).getGoal(id,{signal:controller.signal}),e=>e.kind==='aborted');
});
test('T46 initial/empty/populated and aborted stale refresh suppression; active and archived references',async()=>{
  const late=defer();let first=true,signal;const store=createGoalsStore({listGoals:async(_status,o)=>{if(first){first=false;signal=o.signal;return late.promise;}return [row];}},options);const stop=store.start();assert.equal(store.getSnapshot().rows,null);await store.refresh();late.resolve([{...row,name:'obsolete'}]);await tick();assert.equal(signal.aborted,true);assert.deepEqual(store.getSnapshot().rows,[row]);assert.equal(store.getSnapshot().accounts.length,1);assert.equal(store.getSnapshot().accounts[0].status,'archived');stop();
  const empty=createGoalsStore({listGoals:async()=>[]},options);await empty.refresh();assert.deepEqual(empty.getSnapshot().rows,[]);
});
test('T46 create/edit/complete/reopen/archive refresh only reads, confirmed changes survive refresh failure',async()=>{
  let fail=false,lists=0,choices=0,writes=0;const store=createGoalsStore({listGoals:async()=>{lists++;if(fail)throw Error('offline');return [row];}},{listAccounts:async()=>{choices++;return [];}});await store.refresh();
  for(const message of ['Goal saved.','Goal saved.','Goal completed.','Goal reopened.','Goal archived.'])assert.equal(await store.mutate(async()=>{writes++;},message),true);
  assert.equal(writes,5);assert.equal(lists,6);assert.equal(choices,0);fail=true;assert.equal(await store.mutate(async()=>{writes++;},'Goal saved.'),true);assert.deepEqual(store.getSnapshot().rows,[row]);assert.match(store.getSnapshot().notice,/GET refresh/);assert.ok(store.getSnapshot().error);
});
test('T46 uncertain mutation requires GET inspection and separate deliberate acknowledgement',async()=>{
  let writes=0;const store=createGoalsStore({listGoals:async()=>[row]},options),operation=async()=>{writes++;throw new V2ApiError(0,'NETWORK_ERROR','network',[],true);};
  await store.mutate(operation,'Saved');await store.mutate(operation,'Saved');assert.equal(writes,1);store.allowRetry();assert.ok(store.getSnapshot().mutationError);await store.inspect();assert.deepEqual(store.getSnapshot().inspection,[row]);await store.mutate(operation,'Saved');assert.equal(writes,1);store.allowRetry();await store.mutate(operation,'Saved');assert.equal(writes,2);
});
test('T46 pending guards, safe foreign/missing404, unavailable choices and domain failures',async()=>{
  const pending=defer(),store=createGoalsStore({listGoals:async()=>[],getGoal:async()=>{throw new V2ApiError(404,'NOT_FOUND','unexpected');}},{listAccounts:async()=>{throw Error('offline');}});let writes=0;
  const first=store.mutate(()=>{writes++;return pending.promise;},'Saved');await store.mutate(async()=>{writes++;},'Saved');pending.resolve();await first;assert.equal(writes,1);await store.loadResource(id);assert.equal(store.getSnapshot().resource,null);assert.ok(store.getSnapshot().resourceError);await store.inspect(id);assert.deepEqual(store.getSnapshot().inspection,[]);await store.loadOptions();assert.ok(store.getSnapshot().optionsError);assert.deepEqual(store.getSnapshot().accounts,[]);
  for(const code of ['ACCOUNT_ARCHIVED','GOAL_INVALID_STATE']){await store.mutate(async()=>{throw new V2ApiError(409,code,'unexpected');},'Saved');assert.ok(store.getSnapshot().mutationError);assert.equal(store.getSnapshot().mutationError.uncertain,false);}
});
test('T46 teardown clears owned rows/options/resource and blocks old read/write success or401',async()=>{
  for(const reject of [false,true]){const late=defer();let signal;const a=createGoalsStore({listGoals:(_p,o)=>{signal=o.signal;return late.promise;}},options),stop=a.start();stop();assert.equal(signal.aborted,true);const b=createGoalsStore({listGoals:async()=>[]},options);await b.refresh();if(reject)late.reject(new V2ApiError(401,'AUTH_INVALID','auth'));else late.resolve([row]);await tick();assert.equal(a.getSnapshot().rows,null);assert.deepEqual(a.getSnapshot().accounts,[]);assert.equal(b.getSnapshot().authError,false);}
  const late=defer(),store=createGoalsStore({listGoals:async()=>[row]},options),stop=store.start();const writing=store.mutate(()=>late.promise,'Saved');stop();late.resolve();assert.equal(await writing,false);assert.equal(store.getSnapshot().rows,null);
});
test('T46 current401 clears all owned state and prevents further domain operations',async()=>{
  let fail=false;const store=createGoalsStore({listGoals:async()=>{if(fail)throw new V2ApiError(401,'AUTH_INVALID','auth');return [row];}},options);await store.refresh();fail=true;await store.refresh();assert.equal(store.getSnapshot().rows,null);assert.deepEqual(store.getSnapshot().accounts,[]);assert.equal(store.getSnapshot().authError,true);assert.equal(await store.mutate(async()=>{},'Saved'),false);
});
test('T46 real page, exact response progress, fixture/P1/production boundaries',()=>{
  const page=read('features/v2/goals-page.tsx');assert.match(read('app/v2/goals/page.tsx'),/GoalsPage/);assert.doesNotMatch(read('app/v2/goals/page.tsx'),/PrototypePage/);assert.match(page,/key=\{user.id\}/);assert.match(page,/percent=\{g.percentComplete\}/);assert.match(page,/value=\{g.remainingAmount\}/);assert.doesNotMatch(page,/parseFloat|toFixed|Number\(|usePrototype|from .*fixtures|\/reopen|projection|history/);assert.match(page,/status:'active'/);assert.match(read('app/v2/layout.tsx'),/NODE_ENV !== "development"\) notFound/);
});

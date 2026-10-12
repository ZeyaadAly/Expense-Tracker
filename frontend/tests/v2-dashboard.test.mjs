import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadV2Client} from './v2-client-loader.mjs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const transport=await loadV2Client();globalThis.__t37transport=transport;
const common=s=>s.replace(/import \{ createSessionClient \} from "\.\/session-client";/,'const createSessionClient=()=>{throw Error("inject");};').replace(/import \{ V2ApiError, type V2RequestOptions \} from "\.\/v2-client";/,'const {V2ApiError}=globalThis.__t37transport;');
const account=compile(read('lib/api/accounts.ts').replace(/import \{ createV2ApiClient, V2ApiError, type V2Envelope, type V2RequestOptions \} from "\.\/v2-client";/,'const {createV2ApiClient,V2ApiError}=globalThis.__t37transport;').replace('import { getSession } from "../auth/auth-service";','const getSession=()=>{};'));
const transaction=compile(common(read('lib/api/v2-transactions.ts')));
const source=common(read('lib/api/dashboard.ts')).replace('from "./accounts"',`from "${account}"`).replace('from "./v2-transactions"',`from "${transaction}"`);
const {createDashboardClient,dashboardPeriods}=await import(compile(source));
const {createDashboardStore}=await import(compile(read('lib/dashboard-store.ts')));
const {createV2ApiClient,V2ApiError}=transport;
const uuid='a3700000-0000-4000-8000-000000000001';
const summary={totalBalance:'-1999999999.98',assets:'-999999999.99',cardDebt:'999999999.99',income:'0.30',expenses:'0.40',netSavings:'-0.10',currency:'EGP'};
const payload=period=>({data:{period:{key:period,from:'2026-10-01',to:'2026-10-12',timezone:'Africa/Cairo'},summary,accounts:[],recentTransactions:[],upcomingRecurring:[]},meta:{stage:'core',deferred:['incomeVsExpenses','budgets','goals'],upcoming:{from:'2026-10-12',to:'2026-11-10',limit:5},recentTransactions:{limit:5,scope:'all_history'}}});
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setTimeout(r,0));

test('T37 all five periods use T10 GET, current token and cancellation without financial conversion',async()=>{
  let token='first';const calls=[],controller=new AbortController();
  const client=createDashboardClient(uuid,createV2ApiClient({baseUrl:'http://localhost:4000/api/v1',tokenSupplier:async()=>({data:token,error:null}),fetcher:async(url,options)=>{calls.push({url,options});return Response.json(payload(new URL(url).searchParams.get('period')));}}));
  for(const period of dashboardPeriods){const response=await client.getDashboard(period,{signal:controller.signal});assert.deepEqual(response.data.summary,summary);token='refreshed';}
  assert.equal(calls.length,5);assert.equal(calls[0].options.headers.Authorization,'Bearer first');
  for(const c of calls){assert.equal(c.options.method,'GET');assert.equal(c.options.signal,controller.signal);assert.equal(c.options.cache,'no-store');assert.ok(c.url.startsWith('http://localhost:4000/api/v2/dashboard?period='));assert.equal(c.options.body,undefined);}
  await assert.rejects(client.getDashboard('all_time'),e=>e.code==='INVALID_REQUEST');assert.equal(calls.length,5);
});

test('T37 response parser accepts real resources and preserves exact strings/date-only fields',async()=>{
  const result=payload('this_month');
  result.data.accounts=[{id:uuid,name:'Archived credit',type:'credit_card',openingBalance:'-0.10',currentBalance:'-0.30',openingBalanceEditable:true,currency:'EGP',status:'archived',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'}];
  result.data.recentTransactions=[{id:uuid,accountId:uuid,categoryId:uuid,accountName:'Cash',categoryName:'Salary',type:'income',amount:'0.10',description:'Actual',date:'2026-10-12',currency:'EGP',recurringTransactionId:uuid,recurringOccurrenceDate:'2026-10-12',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'}];
  result.data.upcomingRecurring=[{recurringTransactionId:uuid,description:'Expected',type:'income',amount:'0.20',currency:'EGP',occurrenceDate:'2026-10-13',accountName:'Cash'}];
  assert.deepEqual(await createDashboardClient(uuid,{get:async()=>result}).getDashboard(),result);
});

test('T37 malformed/private/period-mismatched values fail closed',async()=>{
  const changes=[r=>r.data.summary.income=0.3,r=>r.data.summary.totalBalance='1e9',r=>r.data.summary.assets='-0.00',r=>r.data.userId=uuid,r=>r.data.budgets=[],r=>r.data.period.key='last_month',r=>r.data.period.from='2026-02-29',r=>r.data.period.timezone='UTC',r=>r.meta.deferred=[],r=>r.meta.upcoming.limit=100,r=>r.meta.recentTransactions.scope='period',r=>r.data.upcomingRecurring=[{userId:uuid}],r=>r.data.accounts=[{id:uuid}],r=>r.data.recentTransactions=new Array(6).fill({})];
  for(const change of changes){const result=structuredClone(payload('this_month'));change(result);await assert.rejects(createDashboardClient(uuid,{get:async()=>result}).getDashboard(),e=>e.code==='INVALID_RESPONSE'&&!e.uncertain);}
});

test('T37 auth, network and cancellation keep T10 safe error classification',async()=>{
  for(const [status,code] of [[401,'AUTH_INVALID'],[503,'DATABASE_UNAVAILABLE']]){
    const client=createDashboardClient(uuid,createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'test',error:null}),fetcher:async()=>Response.json({error:{code,message:'Safe',details:[]}},{status})}));
    await assert.rejects(client.getDashboard(),e=>e.code===code&&!e.uncertain);
  }
  const client=createDashboardClient(uuid,createV2ApiClient({baseUrl:'http://localhost:4000',tokenSupplier:async()=>({data:'test',error:null}),fetcher:async()=>{throw Error('private network');}}));
  await assert.rejects(client.getDashboard(),e=>e.kind==='network'&&!e.uncertain&&!e.message.includes('private'));
  const controller=new AbortController();controller.abort();await assert.rejects(client.getDashboard('this_month',{signal:controller.signal}),e=>e.kind==='aborted');
});

test('T37 initial loading, empty and partial-empty domains preserve one authoritative response',async()=>{
  const wait=defer(),store=createDashboardStore({getDashboard:()=>wait.promise});assert.equal(store.getSnapshot().dashboard,null);assert.equal(store.getSnapshot().loading,true);
  const refresh=store.refresh();wait.resolve(payload('this_month'));await refresh;assert.deepEqual(store.getSnapshot().dashboard,payload('this_month'));assert.equal(store.getSnapshot().loading,false);
});

test('T37 rapid period changes cancel obsolete reads and suppress late responses',async()=>{
  const old=defer();let first=true,signal;const store=createDashboardStore({getDashboard:(period,options)=>{if(first){first=false;signal=options.signal;return old.promise;}return Promise.resolve(payload(period));}});
  const pending=store.refresh();store.setPeriod('last_month');store.setPeriod('1_year');await tick();assert.equal(signal.aborted,true);assert.equal(store.getSnapshot().dashboard.data.period.key,'1_year');old.resolve(payload('this_month'));await pending;assert.equal(store.getSnapshot().dashboard.data.period.key,'1_year');
});

test('T37 failed period refresh retains old period identity and retries only GET',async()=>{
  let fail=false;const seen=[],store=createDashboardStore({getDashboard:async period=>{seen.push(period);if(fail)throw Error();return payload(period);}});
  await store.refresh();fail=true;store.setPeriod('6_months');await tick();assert.equal(store.getSnapshot().period,'6_months');assert.equal(store.getSnapshot().dashboard.data.period.key,'this_month');assert.ok(store.getSnapshot().error);
  fail=false;await store.refresh();assert.equal(store.getSnapshot().dashboard.data.period.key,'6_months');assert.equal(store.getSnapshot().error,null);assert.deepEqual(seen,['this_month','6_months','6_months']);
});

test('T37 teardown clears A and prevents late success or failure from publishing to B',async()=>{
  for(const reject of [false,true]){const late=defer();let signal;const a=createDashboardStore({getDashboard:(_p,o)=>{signal=o.signal;return late.promise;}}),stop=a.start();stop();assert.equal(signal.aborted,true);assert.equal(a.getSnapshot().dashboard,null);
    const b=createDashboardStore({getDashboard:async p=>payload(p)});await b.refresh();if(reject)late.reject(new V2ApiError(401,'AUTH_INVALID','auth'));else late.resolve(payload('1_year'));await tick();assert.equal(a.getSnapshot().dashboard,null);assert.equal(b.getSnapshot().dashboard.data.period.key,'this_month');assert.equal(b.getSnapshot().authError,false);
  }
});

test('T37 401 clears all financial data and disables further reads',async()=>{
  let fail=false,calls=0;const store=createDashboardStore({getDashboard:async p=>{calls++;if(fail)throw new V2ApiError(401,'AUTH_INVALID','auth');return payload(p);}});await store.refresh();fail=true;await store.refresh();assert.equal(store.getSnapshot().dashboard,null);assert.equal(store.getSnapshot().authError,true);await store.refresh();store.setPeriod('last_month');assert.equal(calls,2);
});

test('T37 runtime fixture/deferred/production and session-key boundaries',()=>{
  const page=read('features/v2/dashboard-page.tsx'),route=read('app/v2/dashboard/page.tsx');assert.match(route,/DashboardPage/);assert.doesNotMatch(route,/PrototypePage/);
  assert.match(page,/key=\{user.id\}/);assert.match(page,/summary.totalBalance/);assert.match(page,/data.period.from/);
  for(const forbidden of ['usePrototype','FlowChart','BudgetRow','GoalCard','parseFloat','Number(','processDueRecurring','getNextOccurrence','reduce('])assert.ok(!page.includes(forbidden));
  assert.match(read('features/v2/protected-boundary.tsx'),/'\/v2\/dashboard'\]\.includes\(path\) \? children/);
  assert.match(read('app/v2/layout.tsx'),/NODE_ENV !== "development"\) notFound/);
});

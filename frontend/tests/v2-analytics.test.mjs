import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadV2Client} from './v2-client-loader.mjs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const transport=await loadV2Client();globalThis.__t40transport=transport;
const common=s=>s.replace(/import \{ createSessionClient \} from "\.\/session-client";/,'const createSessionClient=()=>{throw Error("inject");};').replace(/import \{ V2ApiError, type V2RequestOptions \} from "\.\/v2-client";/,'const {V2ApiError}=globalThis.__t40transport;');
const transaction=compile(common(read('lib/api/v2-transactions.ts')));
const rangeModule=compile(read('lib/analytics-range.ts').replace('from "./api/v2-transactions"',`from "${transaction}"`));
const source=common(read('lib/api/analytics.ts')).replace('from "../analytics-range"',`from "${rangeModule}"`).replace('from "./v2-transactions"',`from "${transaction}"`).replace(/import \{ accountTypes, type AccountType \} from "\.\/accounts";/,'const accountTypes=["cash","bank","savings","credit_card","mobile_wallet","other"];');
const {createAnalyticsClient,parseAnalytics}=await import(compile(source));
const {resolveAnalyticsPeriod,analyticsRangeError}=await import(rangeModule);
const {createAnalyticsStore}=await import(compile(read('lib/analytics-store.ts').replace('from "./analytics-range"',`from "${rangeModule}"`)));
const {createV2ApiClient,V2ApiError}=transport;
const user='a4000000-0000-4000-8000-000000000001',range={from:'2026-10-01',to:'2026-10-13'};
const payload=(r=range)=>({data:{period:{...r,timezone:'Africa/Cairo',calendarDays:13},summary:{income:'0.30',expenses:'0.40',netSavings:'-0.10',savingsRatePercent:'-33.33',averageDailyExpense:'0.03'},incomeVsExpenses:[{period:r.from.slice(0,7),from:r.from,to:r.to,income:'0.30',expenses:'0.40',netSavings:'-0.10'}],expenseByCategory:[],incomeByCategory:[],accountActivity:[],recurring:{income:'999999999.99',expenses:'0.00',netCashFlow:'999999999.99',basis:'projected_occurrences',...r}}});
const accounts={listAccounts:async()=>[]};
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setTimeout(r,0));

test('T40 all approved presets use inclusive Cairo calendar dates, leap and year boundaries',()=>{
  const now=new Date('2026-09-30T21:00:00Z');
  for(const [key,from] of [['7_days','2026-09-25'],['30_days','2026-09-02'],['3_months','2026-08-01'],['6_months','2026-05-01'],['1_year','2025-11-01']])assert.deepEqual(resolveAnalyticsPeriod(key,now),{from,to:'2026-10-01'});
  assert.equal(resolveAnalyticsPeriod('7_days',new Date('2026-09-30T20:59:59Z')).to,'2026-09-30');
  assert.deepEqual(resolveAnalyticsPeriod('7_days',new Date('2024-03-01T09:00:00Z')),{from:'2024-02-24',to:'2024-03-01'});
  assert.equal(resolveAnalyticsPeriod('3_months',new Date('2026-01-01T09:00:00Z')).from,'2025-11-01');
  assert.equal(analyticsRangeError({from:'2024-01-01',to:'2024-12-31'}),null);
  for(const r of [{from:'',to:''},{from:'2025-02-29',to:'2025-03-01'},{from:'2024-01-01',to:'2025-01-01'},{from:'2026-01-02',to:'2026-01-01'}])assert.ok(analyticsRangeError(r));
});
test('T40 T10 exact query/auth/abort and response preservation',async()=>{
  let token='first';const calls=[],controller=new AbortController();
  const client=createAnalyticsClient(user,createV2ApiClient({baseUrl:'http://localhost:4000/api/v1',tokenSupplier:async()=>({data:token,error:null}),fetcher:async(url,options)=>{calls.push({url,options});return Response.json(payload());}}));
  assert.deepEqual(await client.getAnalyticsOverview(range,{signal:controller.signal}),payload().data);token='refreshed';await client.getAnalyticsOverview({...range,accountId:user});
  assert.equal(new URL(calls[0].url).pathname,'/api/v2/analytics/overview');assert.equal(new URL(calls[0].url).search,'?from=2026-10-01&to=2026-10-13');assert.equal(new URL(calls[1].url).searchParams.get('accountId'),user);
  assert.equal(calls[0].options.headers.Authorization,'Bearer first');assert.equal(calls[1].options.headers.Authorization,'Bearer refreshed');assert.equal(calls[0].options.signal,controller.signal);
});
test('T40 rejects malformed API shapes, numeric money and wrong ranges; null stays null',()=>{
  const value=payload();value.data.summary.savingsRatePercent=null;assert.equal(parseAnalytics(value,range).summary.savingsRatePercent,null);
  for(const mutate of [v=>v.data.summary.income=0.3,v=>v.data.period.from='2026-10-02',v=>v.data.summary.savingsRatePercent=0,v=>v.data.recurring.basis='actual',v=>v.data.extra='private',v=>v.data.incomeVsExpenses[0].income='0.3']){const v=payload();mutate(v);assert.throws(()=>parseAnalytics(v,range),e=>e.code==='INVALID_RESPONSE');}
});
test('T40 preserves transport validation, auth, network and cancellation errors',async()=>{
  for(const error of [new V2ApiError(401,'AUTH_INVALID','auth'),new V2ApiError(400,'VALIDATION_ERROR','validation',[{field:'to',message:'Bad range'}]),new V2ApiError(0,'NETWORK_ERROR','network'),new DOMException('Aborted','AbortError')]){
    const client=createAnalyticsClient(user,{get:async()=>{throw error;}});await assert.rejects(client.getAnalyticsOverview(range),e=>e===error);
  }
});
test('T40 store loading/success/refresh/account selection and retained stale failure',async()=>{
  let fail=false;const calls=[],store=createAnalyticsStore({getAnalyticsOverview:async r=>{calls.push(r);if(fail)throw Error('private');return payload(r).data;}},accounts,range);
  assert.equal(store.getSnapshot().overview,null);await store.refresh();assert.equal(store.getSnapshot().overview.summary.netSavings,'-0.10');
  store.setRange({...range,accountId:user});await tick();assert.equal(calls.at(-1).accountId,user);fail=true;await store.refresh();assert.ok(store.getSnapshot().overview);assert.ok(store.getSnapshot().error);assert.equal(store.getSnapshot().loading,false);
});
test('T40 late requests cannot overwrite new filters or a replacement session',async()=>{
  const late=defer();let first=true,signal;const store=createAnalyticsStore({getAnalyticsOverview:async(r,o)=>{if(first){first=false;signal=o.signal;return late.promise;}return payload(r).data;}},accounts,range);
  const stop=store.start();store.setRange({...range,to:'2026-10-12'});await tick();late.resolve(payload().data);await tick();assert.equal(signal.aborted,true);assert.equal(store.getSnapshot().overview.period.to,'2026-10-12');stop();assert.equal(store.getSnapshot().overview,null);assert.deepEqual(store.getSnapshot().accounts,[]);
});
test('T40 401 clears metrics/options and safe 404 preserves scope without switching owner',async()=>{
  let status=0;const store=createAnalyticsStore({getAnalyticsOverview:async()=>{if(status)throw new V2ApiError(status,status===401?'AUTH_INVALID':'NOT_FOUND','safe');return payload().data;}},accounts,range);await store.refresh();status=404;await store.refresh();assert.match(store.getSnapshot().error,/account is unavailable/);assert.ok(store.getSnapshot().overview);status=401;await store.refresh();assert.equal(store.getSnapshot().overview,null);assert.deepEqual(store.getSnapshot().accounts,[]);assert.equal(store.getSnapshot().authError,true);
});
test('T40 runtime fixture, authority, session and production boundaries',()=>{
  const route=read('app/v2/analytics/page.tsx'),page=read('features/v2/analytics-page.tsx');assert.doesNotMatch(route,/PrototypePage|state=/);assert.match(page,/key=\{user.id\}/);
  for(const p of [page,read('features/v2/analytics-charts.tsx')])assert.doesNotMatch(p,/from ["'].*fixtures|parseFloat|Number\(|getNextOccurrence|processDueRecurring/);
  assert.match(read('features/v2/protected-boundary.tsx'),/\/v2\/analytics/);assert.match(read('app/v2/layout.tsx'),/NODE_ENV !== "development"\) notFound/);assert.match(page,/Transferred in/);assert.match(page,/Projected income/);assert.match(page,/Not applicable/);
});
test('T40 session teardown rejects late A results/failures and backend validation retains inputs',async()=>{
  for(const reject of [false,true]){
    const late=defer(),a=createAnalyticsStore({getAnalyticsOverview:()=>late.promise},accounts,range),stop=a.start();stop();
    const b=createAnalyticsStore({getAnalyticsOverview:async()=>payload().data},accounts,range);await b.refresh();
    if(reject)late.reject(new V2ApiError(401,'AUTH_INVALID','auth'));else late.resolve(payload().data);await tick();assert.equal(a.getSnapshot().overview,null);assert.equal(a.getSnapshot().authError,false);assert.ok(b.getSnapshot().overview);
  }
  const store=createAnalyticsStore({getAnalyticsOverview:async()=>{throw new V2ApiError(400,'VALIDATION_ERROR','validation',[{field:'to',message:'Choose a shorter range.'}]);}},accounts,range);await store.refresh();assert.deepEqual(store.getSnapshot().range,range);assert.match(store.getSnapshot().error,/shorter range/);
});

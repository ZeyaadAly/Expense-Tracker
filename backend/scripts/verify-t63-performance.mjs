// Local-only benchmark. No dotenv, hosted Auth, or remote database fallback.
/* global process, console, Buffer, URL, setInterval, clearInterval */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,basename,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {cpus,totalmem,platform,release} from 'node:os';
import {randomBytes} from 'node:crypto';
import {Client,Pool} from 'pg';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createTestAuthHarness} from '../tests/helpers/v2-isolation.mjs';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createAccountBalanceRepository} from '../dist/services/account-balances.js';
import {createDashboardService} from '../dist/services/dashboard.js';
import {createAnalyticsService,createAnalyticsRepository} from '../dist/services/analytics.js';
import {createBudgetService} from '../dist/services/budgets.js';
import {createGoalService} from '../dist/services/goals.js';
import {createCategoryService} from '../dist/services/categories.js';
import {createRecurringService} from '../dist/services/recurring.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';

const url=disposableIsolationUrl(process.env.T63_DISPOSABLE_DATABASE_URL);
const root=resolve('.tmp-v2-t63'),out=resolve(root,'evidence');mkdirSync(out,{recursive:true});
const admin=new Client({connectionString:url.href});await admin.connect();
const directory=realpathSync((await admin.query('SHOW data_directory')).rows[0].data_directory);
assert.equal(basename(directory),'pgdata');assert.equal(basename(dirname(directory)),'.tmp-v2-t63');
assert.equal(directory,realpathSync(resolve(root,'pgdata')));
await prepareIsolationDatabase(admin); // refuses a populated database
const runtime=new URL(url);runtime.username='expense_tracker_app';
const pool=new Pool({connectionString:runtime.href,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
const observer=new Pool({connectionString:url.href,max:1});
const queryLog=[],waits=[];let capture=true;
async function query(target,sql,values){const start=performance.now();try{return await target.query(sql,values);}finally{if(capture)queryLog.push({sql,values,ms:performance.now()-start});}}
const db={query:(sql,values)=>query(pool,sql,values),connect:async()=>{const start=performance.now(),c=await pool.connect();waits.push(performance.now()-start);return {query:(sql,values)=>query(c,sql,values),release:discard=>c.release(discard)};}};
const secret=randomBytes(32).toString('hex'),now=()=>new Date('2026-10-17T09:00:00Z');
const result={environment:{node:process.version,platform:platform(),release:release(),cpu:cpus()[0].model,logicalCpus:cpus().length,memoryBytes:totalmem(),postgres:(await admin.query('SELECT version()')).rows[0].version,poolMax:5,tls:false},datasets:[],measurements:[],plans:[],concurrency:[],processor:[],remoteTouched:false};
const sorted=a=>[...a].sort((a,b)=>a-b),round=n=>Math.round(n*1000)/1000;
const stats=a=>({medianMs:round(sorted(a)[Math.floor(a.length/2)]),p95Ms:round(sorted(a)[Math.min(a.length-1,Math.ceil(a.length*.95)-1)]),maxMs:round(Math.max(...a))});
function save(){writeFileSync(resolve(out,'backend.json'),JSON.stringify(result,null,2)+'\n');}
async function measure(name,work,{iterations=9,plan=false}={}){
 for(let i=0;i<2;i++)await work();const times=[],counts=[],sizes=[];let last;
 for(let i=0;i<iterations;i++){queryLog.length=0;const start=performance.now();last=await work();times.push(performance.now()-start);counts.push(queryLog.length);sizes.push(Buffer.byteLength(JSON.stringify(last)??''));}
 const entry={name,iterations,warmups:2,...stats(times),queryCount:[Math.min(...counts),Math.max(...counts)],jsonBytes:Math.max(...sizes)};result.measurements.push(entry);
 if(plan){const statements=queryLog.filter(q=>/^\s*(SELECT|WITH)/i.test(q.sql));for(const statement of statements){const plans=[];for(let i=0;i<5;i++)plans.push((await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+statement.sql,statement.values)).rows[0]['QUERY PLAN'][0]);result.plans.push({name,sql:statement.sql,parameters:statement.values,execution:stats(plans.map(p=>p['Execution Time'])),plan:plans[2]});}}
 console.log(name,entry.medianMs+' ms',entry.queryCount);save();return last;
}
const owners={normal:{userId:'a6300000-0000-4000-8000-000000000001'},stress:{userId:'b6300000-0000-4000-8000-000000000001'}};
const auth=await createTestAuthHarness(db,{categoryManagement:true,cursorSigningSecret:secret,dashboardOptions:{now}});
const tokens={};const fixtures={};
async function http(who,path,method='GET',body,status=200){const r=await auth.rawRequest(tokens[who],path,method,body);assert.equal(r.status,status,method+' '+path+' '+JSON.stringify(r.body));return r.body;}
try{
 for(const [who,counts] of Object.entries({normal:{accounts:6,categories:12,transactions:1200,transfers:80,recurring:24,budgets:12,goals:8},stress:{accounts:32,categories:1000,transactions:32000,transfers:2200,recurring:1200,budgets:720,goals:2200}})){
  const u=owners[who].userId;await createTestUser(admin,owners[who]);tokens[who]=await auth.createTestAuthToken(owners[who],{expiration:'2h'});await http(who,'/profile/bootstrap','POST',{});
  await admin.query("INSERT INTO expense_tracker.accounts(user_id,name,type,opening_balance) SELECT $1,'Account '||i,CASE WHEN i%6=0 THEN 'credit_card' ELSE 'cash' END,100.00 FROM generate_series(1,$2) i",[u,counts.accounts]);
  await admin.query("INSERT INTO expense_tracker.categories(user_id,name,kind) SELECT $1,'Category '||i,'both' FROM generate_series(1,$2) i",[u,counts.categories]);
  const accounts=(await admin.query('SELECT id FROM expense_tracker.accounts WHERE user_id=$1 ORDER BY name',[u])).rows.map(r=>r.id),categories=(await admin.query('SELECT id FROM expense_tracker.categories WHERE user_id=$1 ORDER BY name',[u])).rows.map(r=>r.id);fixtures[who]={accounts,categories};
  await admin.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,category,transaction_date)
   SELECT gen_random_uuid(),$1,($2::uuid[])[1+(i%$4)],($3::uuid[])[1+(i%$5)],CASE WHEN i%4=0 THEN 'income' ELSE 'expense' END,round((1+(i%10000))::numeric/100,2),
   CASE WHEN i%997=0 THEN 'RareNeedle café العربية' ELSE 'Weekly groceries purchase '||i END,'other',DATE '2026-10-17'-(i%730) FROM generate_series(1,$6) i`,[u,accounts,categories,accounts.length,categories.length,counts.transactions]);
  await admin.query(`INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date,description) SELECT $1,($2::uuid[])[1+(i%$3)],($2::uuid[])[1+((i+1)%$3)],1.25,DATE '2026-10-17'-(i%365),'Local movement' FROM generate_series(1,$4) i`,[u,accounts,accounts.length,counts.transfers]);
  await admin.query(`INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence)
   SELECT $1,($2::uuid[])[1+(i%$4)],($3::uuid[])[1+(i%$5)],'expense',5.00,'Monthly subscription '||i,'monthly','2025-01-17','2026-11-17' FROM generate_series(1,$6) i`,[u,accounts,categories,accounts.length,categories.length,counts.recurring]);
  await admin.query("INSERT INTO expense_tracker.budgets(user_id,category_id,year,month,amount) SELECT $1,($2::uuid[])[i],2026,10,200.00 FROM generate_series(1,$3) i",[u,categories,counts.budgets]);
  await admin.query("INSERT INTO expense_tracker.goals(user_id,name,target_amount,saved_amount,linked_account_id) SELECT $1,'Goal '||i,1000.00,25.00,($2::uuid[])[1+(i%$3)] FROM generate_series(1,$4) i",[u,accounts,accounts.length,counts.goals]);
  result.datasets.push({who,...counts});
 }
 await admin.query('ANALYZE');
 result.indexes=(await admin.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='expense_tracker' ORDER BY tablename,indexname")).rows;
 const first=performance.now();await pool.query('SELECT 1');result.postSeedPoolPingMs=round(performance.now()-first);
 for(const who of Object.keys(owners)){
  const user=owners[who].userId,f=fixtures[who],prefix=who+'/',tx=createV2TransactionService(db,{cursorSigningSecret:secret});
  for(const [name,path] of [['profile','/profile'],['bootstrap','/profile/bootstrap'],['categories','/categories'],['categories/expense','/categories?kind=expense'],['accounts','/accounts'],['account-detail','/accounts/'+f.accounts[0]],['account-summary','/accounts/summary'],['transactions/25','/transactions'],['transactions/100','/transactions?limit=100'],['transfers','/transfers'],['transfers/account','/transfers?accountId='+f.accounts[0]],['transfers/date','/transfers?from=2026-10-01&to=2026-10-17'],['recurring','/recurring'],['recurring/filtered','/recurring?status=active&type=expense&accountId='+f.accounts[0]],['recurring/upcoming','/recurring/upcoming?days=30'],['budgets','/budgets?year=2026&month=10'],['goals','/goals']])await measure(prefix+'HTTP '+name,()=>http(who,path,name==='bootstrap'?'POST':'GET',name==='bootstrap'?{}:undefined));
  await measure(prefix+'HTTP profile PUT',()=>http(who,'/profile','PUT',{displayName:'Local '+Math.random().toString(36).slice(2)}));
  for(const period of ['this_month','last_month','3_months','6_months','1_year']){
   await measure(prefix+'dashboard service '+period,()=>createDashboardService(db,{now}).getDashboard(user,period),{plan:period==='1_year'});
   await measure(prefix+'HTTP dashboard '+period,()=>http(who,'/dashboard?period='+period));
  }
  for(const from of ['2026-10-01','2026-08-01','2026-05-01','2025-10-17']){
   const range={from,to:'2026-10-17'};await measure(prefix+'analytics service '+from,()=>createAnalyticsService(db).getOverview(user,range));await measure(prefix+'HTTP analytics '+from,()=>http(who,`/analytics/overview?from=${from}&to=2026-10-17`));
  }
  await measure(prefix+'HTTP analytics account',()=>http(who,`/analytics/overview?from=2025-10-17&to=2026-10-17&accountId=${f.accounts[0]}`));
  for(const q of ['groceries','RareNeedle','no-match-zzzz','العربية','Account 1','Category 1'])await measure(prefix+'search '+q,()=>tx.listTransactions(user,{q,limit:25}),{plan:who==='stress'});
  for(const [name,filter] of Object.entries({account:{accountId:f.accounts[0]},category:{categoryId:f.categories[0]},date:{from:'2026-10-01',to:'2026-10-17'},type:{type:'expense'},recurring:{recurring:'generated'},combined:{q:'groceries',type:'expense',accountId:f.accounts[0],from:'2026-01-01'}})){
   await measure(prefix+'filter '+name,()=>tx.listTransactions(user,filter),{plan:who==='stress'});
  }
  for(const target of [0,Math.floor((who==='stress'?32000:1200)/200),Math.floor((who==='stress'?32000:1200)/100)-1]){
   let cursor;for(let i=0;i<target;i++)cursor=(await tx.listTransactions(user,{limit:100,...(cursor?{cursor}:{})})).meta.nextCursor;
   await measure(prefix+'cursor page '+target,()=>tx.listTransactions(user,{limit:100,...(cursor?{cursor}:{})}),{plan:who==='stress'});
   await measure(prefix+'HTTP cursor page '+target,()=>http(who,'/transactions?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):'')));
  }
  await measure(prefix+'accounts repository',()=>createAccountBalanceRepository(db).getAccountBalances(user),{plan:who==='stress'});
  await measure(prefix+'budgets service',()=>createBudgetService(db).listBudgets(user,{year:2026,month:10}),{plan:who==='stress'});
  await measure(prefix+'goals service',()=>createGoalService(db).listGoals(user),{plan:who==='stress'});
  await measure(prefix+'category service',()=>createCategoryService(db).list(user,{status:'active'}),{plan:who==='stress'});
  await measure(prefix+'recurring service',()=>createRecurringService(db).listRecurring(user,{}),{plan:who==='stress'});
  const repo=createAnalyticsRepository(db),range={from:'2025-10-17',to:'2026-10-17'};
  for(const method of ['getSummary','getCashFlowSeries','getCategoryBreakdown','getAccountActivity','getRecurringCommitments'])await measure(prefix+'analytics breakdown '+method,()=>repo[method](user,range),{plan:who==='stress'});
  const input={accountId:f.accounts[0],categoryId:f.categories[0],type:'expense',amount:'0.10',description:'Benchmark round trip',date:'2026-10-17'};
  let id;
  await measure(prefix+'HTTP transaction POST PUT DELETE cycle',async()=>{const created=await http(who,'/transactions','POST',input,201);id=created.data.id;await http(who,'/transactions/'+id,'PUT',{...input,amount:'0.20'});await http(who,'/transactions/'+id,'DELETE',undefined,204);return {completed:true};});
  const transfer={sourceAccountId:f.accounts[0],destinationAccountId:f.accounts[1],amount:'0.10',date:'2026-10-17',description:'Benchmark movement'};
  await measure(prefix+'HTTP transfer POST PUT DELETE cycle',async()=>{const c=await http(who,'/transfers','POST',transfer,201);await http(who,'/transfers/'+c.data.id,'PUT',{...transfer,amount:'0.20'});await http(who,'/transfers/'+c.data.id,'DELETE',undefined,204);return {completed:true};});
 }
 const baselineMemory=process.memoryUsage(),deadlocks=Number((await admin.query("SELECT deadlocks FROM pg_stat_database WHERE datname=current_database()")).rows[0].deadlocks);
 for(const width of [5,12]){
  const times=[];let peakWaiting=0,peakConnections=0,locks=0;const start=performance.now();capture=false;
  const sample=setInterval(()=>{peakWaiting=Math.max(peakWaiting,pool.waitingCount);peakConnections=Math.max(peakConnections,pool.totalCount);},5);
  await Promise.all(Array.from({length:width},async(_,worker)=>{for(let i=0;i<10;i++){const who=worker%2?'normal':'stress',f=fixtures[who],t=performance.now();if(i<8)await http(who,['/dashboard','/analytics/overview?from=2026-10-01&to=2026-10-17','/transactions','/budgets?year=2026&month=10'][i%4]);else{const c=await http(who,i===8?'/transactions':'/transfers','POST',i===8?{accountId:f.accounts[0],categoryId:f.categories[0],type:'expense',amount:'0.01',description:'Load',date:'2026-10-17'}:{sourceAccountId:f.accounts[0],destinationAccountId:f.accounts[1],amount:'0.01',date:'2026-10-17'},201);await http(who,(i===8?'/transactions/':'/transfers/')+c.data.id,'DELETE',undefined,204);}times.push(performance.now()-t);const observed=await observer.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");locks=Math.max(locks,observed.rows[0].n);}}));clearInterval(sample);capture=true;
  result.concurrency.push({workers:width,operations:times.length,errors:0,elapsedMs:round(performance.now()-start),...stats(times),peakWaiting,peakConnections,observedLockWaiters:locks});
 }
 result.deadlockDelta=Number((await admin.query("SELECT deadlocks FROM pg_stat_database WHERE datname=current_database()")).rows[0].deadlocks)-deadlocks;assert.equal(result.deadlockDelta,0);
 result.memory={before:baselineMemory,after:process.memoryUsage(),note:'RSS snapshots without forced GC; not a heap leak proof'};
 // Isolate processor users so foreground monthly definitions cannot alter the workload.
 const processorOwners=[];for(let i=0;i<40;i++){const userId='c6300000-0000-4000-8000-'+String(i+1).padStart(12,'0');processorOwners.push(userId);await createTestUser(admin,{userId});await admin.query("INSERT INTO expense_tracker.accounts(user_id,name,type) VALUES($1,'Processor cash','cash')",[userId]);}
 const cat=(await admin.query("SELECT id FROM expense_tracker.categories WHERE is_system AND kind='income' LIMIT 1")).rows[0].id;
 await admin.query(`INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,end_date,next_occurrence)
  SELECT a.user_id,a.id,$2,'income',0.10,'Processor scale','daily',CASE WHEN i<=30 THEN DATE '2026-10-17' ELSE DATE '2026-11-17' END,CASE WHEN i<=30 THEN DATE '2026-10-17' ELSE DATE '2026-11-17' END,CASE WHEN i<=30 THEN DATE '2026-10-17' ELSE DATE '2026-11-17' END FROM expense_tracker.accounts a CROSS JOIN generate_series(1,50) i WHERE a.user_id=ANY($1::uuid[])`,[processorOwners,cat]);
 await admin.query('ANALYZE expense_tracker.recurring_transactions');
 const processor=createRecurringProcessor(db);
 // EXPLAIN the real candidate query before posting changes selectivity.
 await measure('processor due discovery',()=>db.query("SELECT id,user_id FROM expense_tracker.recurring_transactions WHERE status='active' AND next_occurrence IS NOT NULL AND next_occurrence <= $1::date AND ($2::uuid IS NULL OR user_id=$2) AND ($3::uuid IS NULL OR id=$3) ORDER BY next_occurrence,id LIMIT $4",['2026-10-17',null,null,1000]),{plan:true});
 for(let repeat=0;repeat<3;repeat++){
  // New definition identities for each measured batch; terminal markers are never reset.
  if(repeat)await admin.query(`INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,end_date,next_occurrence) SELECT a.user_id,a.id,$2,'income',0.10,'Processor repeat','daily','2026-10-17','2026-10-17','2026-10-17' FROM expense_tracker.accounts a CROSS JOIN generate_series(1,30) i WHERE a.user_id=ANY($1::uuid[])`,[processorOwners,cat]);
  for(let invocation=0;invocation<2;invocation++){queryLog.length=0;const start=performance.now(),r=await processor.processDueRecurring({referenceDate:'2026-10-17'}),ms=performance.now()-start;assert.equal(r.posted,invocation?200:1000);assert.equal(r.failed,0);result.processor.push({repeat,invocation,elapsedMs:round(ms),postsPerSecond:round(r.posted*1000/ms),attemptsPerSecond:round(r.attempts*1000/ms),queries:queryLog.length,...r});save();}
 }
 result.processorMedian1000Ms=stats(result.processor.filter(r=>r.posted===1000).map(r=>r.elapsedMs));
 const backlogOwner='d6300000-0000-4000-8000-000000000001';await createTestUser(admin,{userId:backlogOwner});
 const backlogAccount=(await admin.query("INSERT INTO expense_tracker.accounts(user_id,name,type) VALUES($1,'Backlog cash','cash') RETURNING id",[backlogOwner])).rows[0].id;
 await admin.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,end_date,next_occurrence) SELECT $1,$2,$3,'income',0.10,'101-date backlog','daily','2026-07-09','2026-10-17','2026-07-09' FROM generate_series(1,31)",[backlogOwner,backlogAccount,cat]);
 result.backlog=[];for(let invocation=0;invocation<10;invocation++){const start=performance.now(),r=await processor.processDueRecurring({referenceDate:'2026-10-17',userId:backlogOwner});assert.equal(r.failed,0);result.backlog.push({invocation,elapsedMs:round(performance.now()-start),...r});if(!r.hasRemaining)break;}
 assert.equal(result.backlog.reduce((n,r)=>n+r.posted,0),3131);assert.equal(result.backlog.at(-1).hasRemaining,false);
 result.backlogReconciliation=(await admin.query("SELECT count(*)::int rows,count(DISTINCT (recurring_transaction_id,recurring_occurrence_date))::int pairs,sum(amount)::text amount FROM expense_tracker.transactions WHERE user_id=$1",[backlogOwner])).rows[0];assert.equal(result.backlogReconciliation.rows,3131);assert.equal(result.backlogReconciliation.pairs,3131);assert.equal(result.backlogReconciliation.amount,'313.10');
 result.poolCheckout=stats(waits);result.finalPool={total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount};
 save();console.log('T63 local backend benchmark complete');
}finally{await auth.close();await pool.end();await observer.end();await admin.end();}

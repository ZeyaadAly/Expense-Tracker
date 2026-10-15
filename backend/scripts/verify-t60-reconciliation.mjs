// Local financial acceptance. Never loads dotenv or a hosted database fallback.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,basename,dirname} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {Client,Pool} from 'pg';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createTestAuthHarness} from '../tests/helpers/v2-isolation.mjs';
import {createAccountBalanceRepository} from '../dist/services/account-balances.js';
import {createDashboardService} from '../dist/services/dashboard.js';
import {createAnalyticsService} from '../dist/services/analytics.js';
import {createBudgetService} from '../dist/services/budgets.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createTransferService} from '../dist/services/transfers.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {cairoToday} from '../dist/validators/transaction.js';

// Independent decimal oracle: no production money, balance, aggregate or recurrence helper.
export function cents(value){assert.match(value,/^-?\d+(?:\.\d{1,2})?$/);const negative=value.startsWith('-');const [whole,fraction='']=value.replace('-','').split('.');return (negative?-1n:1n)*(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));}
export function money(value){return (value<0n?'-':'')+(value<0n?-value:value)/100n+'.'+String((value<0n?-value:value)%100n).padStart(2,'0');}
const sum=(rows,field)=>rows.reduce((total,row)=>total+cents(row[field]),0n);
const divideRounded=(numerator,denominator)=>{assert.ok(denominator>0n);const sign=numerator<0n?-1n:1n,value=numerator<0n?-numerator:numerator;return sign*((value+denominator/2n)/denominator);};
const within=(row,from,to)=>row.date>=from&&row.date<=to;
const periods={this_month:['2026-10-01','2026-10-15'],last_month:['2026-09-01','2026-09-30'],'3_months':['2026-08-01','2026-10-15'],'6_months':['2026-05-01','2026-10-15'],'1_year':['2025-11-01','2026-10-15']};
const fixedNow=()=>new Date('2026-10-15T09:00:00Z');
// Hand-summed constants for the immutable manual fixture, declared before app queries.
const manualExpected={position:{assets:'155.26',cardDebt:'20.04',totalBalance:'135.22'},allHistory:{income:'14.94',expenses:'6.72',netSavings:'8.22'},october:{income:'10.51',expenses:'1.83',netSavings:'8.68'}};
const url=disposableIsolationUrl(process.env.T60_DISPOSABLE_DATABASE_URL);
const data=realpathSync(process.env.T60_DATA_DIRECTORY),output=resolve(process.env.T60_OUTPUT_DIRECTORY);
assert.equal(basename(data),'pgdata');assert.equal(basename(dirname(data)),'.tmp-v2-t60');
assert.ok(output.replaceAll('\\','/').includes('/.tmp-v2-t60/'));mkdirSync(output,{recursive:true});
const phase=process.argv[2]??'all';assert.ok(['all','initial','restarted'].includes(phase));
const statePath=resolve(output,'private-state.json');
if(phase==='all'){
  const template=new URL(url);template.pathname='/template1';const admin=new Client({connectionString:template.href});await admin.connect();
  try{assert.equal(realpathSync((await admin.query('SHOW data_directory')).rows[0].data_directory),data);assert.equal((await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname='postgres'")).rows[0].n,0);await admin.query('DROP DATABASE postgres');for(const role of ['expense_tracker_app','anon','authenticated'])await admin.query('DROP ROLE IF EXISTS '+role);await admin.query('CREATE DATABASE postgres TEMPLATE template0');}finally{await admin.end();}
  const run=part=>{const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),part],{env:process.env,encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:4*1024*1024});writeFileSync(resolve(output,part+'.log'),result.stdout+result.stderr);assert.equal(result.status,0,part+' failed; inspect its local log');console.log(result.stdout.trim());};
  run('initial');
  const bin=realpathSync(process.env.T60_PG_BIN);
  const restart=spawnSync(resolve(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-l',resolve(output,'postgres-restart.log'),'restart'],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(restart.status,0,'Disposable PostgreSQL restart failed');
  run('restarted');
  const initial=JSON.parse(readFileSync(resolve(output,'initial.json'),'utf8')),restarted=JSON.parse(readFileSync(resolve(output,'restarted.json'),'utf8'));
  writeFileSync(resolve(output,'result.json'),JSON.stringify({initial,restarted,databaseRestart:true,backendProcessRestart:true,failures:0,remoteTouched:false},null,2)+'\n');
  process.exit(0);
}
const admin=new Client({connectionString:url.href});await admin.connect();
assert.equal(realpathSync((await admin.query('SHOW data_directory')).rows[0].data_directory),data);
if(phase==='initial')await prepareIsolationDatabase(admin);
const runtime=new URL(url);runtime.username='expense_tracker_app';const pool=new Pool({connectionString:runtime.href,max:5});
const owners={a:{userId:'a6000000-0000-4000-8000-000000000001'},b:{userId:'b6000000-0000-4000-8000-000000000001'}};
const auth=await createTestAuthHarness(pool,{categoryManagement:true,cursorSigningSecret:'60'.repeat(32),now:fixedNow,dashboardOptions:{now:fixedNow}});
const tokens={a:await auth.createTestAuthToken(owners.a,{expiration:'1h'}),b:await auth.createTestAuthToken(owners.b,{expiration:'1h'})};
let model={accounts:[],transactions:[],transfers:[],budgets:[],forecasts:[]};
const groups=[],timings=[],checkpoints=[];let assertions=0;
function equal(actual,expected,label){assert.deepEqual(actual,expected,label);assertions++;}
async function group(name,work){const start=performance.now(),before=assertions;await work();groups.push({name,checks:assertions-before,durationMs:Math.round(performance.now()-start)});console.log('PASS '+name+' '+(assertions-before));}
async function request(who,path,method='GET',body,status=200){const result=await auth.rawRequest(tokens[who],path,method,body);equal(result.status,status,method+' '+path+' '+JSON.stringify(result.body?.error));return result.body?.data;}
const create=(who,path,body)=>request(who,path,'POST',body,201);
const action=(who,path)=>request(who,path,'POST',{});
function rows(who,from='1900-01-01',to='9999-12-31',accountId){return model.transactions.filter(row=>row.who===who&&within(row,from,to)&&(!accountId||row.accountId===accountId));}
function totals(who,from,to,accountId){const selected=rows(who,from,to,accountId),income=sum(selected.filter(row=>row.type==='income'),'amount'),expenses=sum(selected.filter(row=>row.type==='expense'),'amount');return {income:money(income),expenses:money(expenses),netSavings:money(income-expenses)};}
function balance(account){const selected=rows(account.who,undefined,undefined,account.id),incoming=sum(model.transfers.filter(row=>row.who===account.who&&row.destinationAccountId===account.id),'amount'),outgoing=sum(model.transfers.filter(row=>row.who===account.who&&row.sourceAccountId===account.id),'amount');const delta=sum(selected.filter(row=>row.type==='income'),'amount')-sum(selected.filter(row=>row.type==='expense'),'amount')+incoming-outgoing;return cents(account.opening)+(account.type==='credit_card'?-delta:delta);}
function position(who){const accounts=model.accounts.filter(row=>row.who===who);const assets=accounts.filter(a=>a.type!=='credit_card').reduce((n,a)=>n+balance(a),0n),cardDebt=accounts.filter(a=>a.type==='credit_card').reduce((n,a)=>n+balance(a),0n);return {assets:money(assets),cardDebt:money(cardDebt),totalBalance:money(assets-cardDebt)};}
function checkpoint(label){checkpoints.push({label,accounts:model.accounts.filter(a=>a.who==='a').map(a=>({key:a.key,balance:money(balance(a))})),position:position('a'),allHistory:totals('a'),october:totals('a','2026-10-01','2026-10-15')});}
const repo=createAccountBalanceRepository(pool),analytics=createAnalyticsService(pool),dashboard=createDashboardService(pool,{now:fixedNow}),budgets=createBudgetService(pool),processor=createRecurringProcessor(pool);
async function rawCheck(who){
  // Independent correlated read-only SQL, structurally separate from production CTEs.
  const accountRows=(await pool.query(`SELECT a.id,(a.opening_balance+CASE WHEN a.type='credit_card' THEN -1 ELSE 1 END*(
    COALESCE((SELECT sum(CASE WHEN t.type='income' THEN t.amount ELSE -t.amount END) FROM expense_tracker.transactions t WHERE t.user_id=a.user_id AND t.account_id=a.id),0)
    +COALESCE((SELECT sum(f.amount) FROM expense_tracker.transfers f WHERE f.user_id=a.user_id AND f.destination_account_id=a.id),0)
    -COALESCE((SELECT sum(f.amount) FROM expense_tracker.transfers f WHERE f.user_id=a.user_id AND f.source_account_id=a.id),0)))::text balance
    FROM expense_tracker.accounts a WHERE a.user_id=$1 ORDER BY a.id`,[owners[who].userId])).rows;
  for(const row of accountRows)equal(cents(row.balance),balance(model.accounts.find(a=>a.id===row.id)),'raw account math');
  const raw=(await pool.query("SELECT count(*)::int count,COALESCE(sum(amount) FILTER(WHERE type='income'),0)::text income,COALESCE(sum(amount) FILTER(WHERE type='expense'),0)::text expenses FROM expense_tracker.transactions WHERE user_id=$1",[owners[who].userId])).rows[0];
  equal(raw.count,rows(who).length,'posted ledger cardinality');
  const expected=totals(who);equal([money(cents(raw.income)),money(cents(raw.expenses))],[expected.income,expected.expenses],'raw totals');
  const net=accountRows.reduce((n,row)=>n+(model.accounts.find(a=>a.id===row.id).type==='credit_card'?-cents(row.balance):cents(row.balance)),0n);equal(money(net),position(who).totalBalance,'raw net');
}
async function analyticsCheck(who,from,to,accountId){
  const result=await request(who,`/analytics/overview?from=${from}&to=${to}`+(accountId?'&accountId='+accountId:''));
  const expected=totals(who,from,to,accountId);for(const key of Object.keys(expected))equal(result.summary[key],expected[key],'analytics '+key);
  const days=(BigInt(Date.parse(to+'T00:00:00Z'))-BigInt(Date.parse(from+'T00:00:00Z')))/86400000n+1n;
  equal(result.summary.averageDailyExpense,money(divideRounded(cents(expected.expenses),days)),'inclusive daily average');
  equal(result.summary.savingsRatePercent,cents(expected.income)===0n?null:money(divideRounded(cents(expected.netSavings)*10000n,cents(expected.income))),'exact rounded savings rate');
  equal(money(sum(result.incomeVsExpenses,'income')),expected.income,'series income');equal(money(sum(result.incomeVsExpenses,'expenses')),expected.expenses,'series expense');
  for(const bucket of result.incomeVsExpenses){const value=totals(who,bucket.from,bucket.to,accountId);equal([bucket.income,bucket.expenses,bucket.netSavings],[value.income,value.expenses,value.netSavings],'monthly bucket');}
  for(const type of ['income','expense']){
    const items=result[type==='income'?'incomeByCategory':'expenseByCategory'];
    equal(money(sum(items,'amount')),expected[type==='income'?'income':'expenses'],'category sum');
    const expectedCategories=new Map();for(const row of rows(who,from,to,accountId).filter(r=>r.type===type))expectedCategories.set(row.categoryId,(expectedCategories.get(row.categoryId)??0n)+cents(row.amount));
    equal(items.map(row=>[row.categoryId,row.amount]).sort(),[...expectedCategories].map(([id,amount])=>[id,money(amount)]).sort(),'category allocations');
  }
  for(const account of model.accounts.filter(a=>a.who===who&&(!accountId||a.id===accountId))){
    const activity=result.accountActivity.find(a=>a.accountId===account.id),actual=totals(who,from,to,account.id);
    assert.ok(activity);assertions++;
    equal([activity.income,activity.expenses,activity.netSavings],[actual.income,actual.expenses,actual.netSavings],'account actuals');
    for(const [field,key] of [['incomingTransfers','destinationAccountId'],['outgoingTransfers','sourceAccountId']])equal(activity[field],money(sum(model.transfers.filter(t=>t.who===who&&t[key]===account.id&&within(t,from,to)),'amount')),'account transfer '+field);
  }
  const projected={income:0n,expense:0n};
  for(const definition of model.forecasts.filter(f=>f.who===who&&f.active&&(!accountId||f.accountId===accountId)))for(const date of definition.dates)if(date>=from&&date<=to)projected[definition.type]+=cents(definition.amount);
  equal([result.recurring.income,result.recurring.expenses,result.recurring.netCashFlow],[money(projected.income),money(projected.expense),money(projected.income-projected.expense)],'forecast independent dated oracle');
  return result;
}
async function reconcile(label,who='a',full=true){
  await rawCheck(who);
  const accounts=await repo.getAccountBalances(owners[who].userId);
  equal(accounts.length,model.accounts.filter(a=>a.who===who).length,'account cardinality');
  for(const account of accounts){equal(account.currentBalance,money(balance(model.accounts.find(a=>a.id===account.id))),label+' balance');const detail=await request(who,'/accounts/'+account.id);equal(detail.currentBalance,account.currentBalance,'HTTP balance');}
  equal(await repo.getFinancialPosition(owners[who].userId),position(who),'position');equal((await request(who,'/accounts/summary')).netPosition,position(who).totalBalance,'HTTP net');
  for(const key of full?Object.keys(periods):['this_month']){
    const d=await request(who,'/dashboard?period='+key),[from,to]=periods[key];equal([d.period.from,d.period.to],[from,to],'frozen period');
    const expected=totals(who,from,to);for(const field of Object.keys(expected))equal(d.summary[field],expected[field],label+' dashboard '+field);
    for(const field of ['assets','cardDebt','totalBalance'])equal(d.summary[field],position(who)[field],'dashboard all-history position');
    const a=await analyticsCheck(who,from,to);for(const field of Object.keys(expected))equal(d.summary[field],a.summary[field],'dashboard/analytics equality');
    equal(d.accounts.map(a=>[a.id,a.currentBalance]).sort(),accounts.map(a=>[a.id,a.currentBalance]).sort(),'dashboard account snapshot');
  }
  for(const budget of model.budgets.filter(b=>b.who===who)){
    const result=await request(who,'/budgets/'+budget.id),from=`${budget.year}-${String(budget.month).padStart(2,'0')}-01`,to=from.slice(0,7)+'-31';
    const spent=sum(rows(who,from,to).filter(t=>t.type==='expense'&&t.categoryId===budget.categoryId),'amount'),allocated=cents(budget.amount);
    equal([result.spent,result.remaining],[money(spent),money(allocated-spent)],'budget sum');
    equal(result.status,spent>allocated?'exceeded':spent>0n&&spent*100n>=BigInt(budget.threshold)*allocated?'near_limit':'normal','exact budget status');
    equal(result.percentUsed,money(divideRounded(spent*10000n,allocated)),'rounded budget percent');
    const raw=(await pool.query("SELECT COALESCE(sum(amount),0)::text spent FROM expense_tracker.transactions WHERE user_id=$1 AND category_id=$2 AND type='expense' AND extract(year FROM transaction_date)=$3 AND extract(month FROM transaction_date)=$4",[owners[who].userId,budget.categoryId,budget.year,budget.month])).rows[0];equal(money(cents(raw.spent)),result.spent,'raw budget sum');
  }
}
async function addTransaction(who,input){const result=await create(who,'/transactions',input);model.transactions.push({who,id:result.id,...input});return result.id;}
async function updateTransaction(who,id,patch){const row=model.transactions.find(t=>t.id===id),input={accountId:row.accountId,categoryId:row.categoryId,type:row.type,amount:row.amount,description:row.description,date:row.date,...patch};await request(who,'/transactions/'+id,'PUT',input);Object.assign(row,input);}
async function removeTransaction(who,id){await request(who,'/transactions/'+id,'DELETE',undefined,204);model.transactions=model.transactions.filter(t=>t.id!==id);}
async function addTransfer(who,input){const result=await create(who,'/transfers',input);model.transfers.push({who,id:result.id,...input});return result.id;}
async function snapshot(who){const p=await repo.getFinancialPosition(owners[who].userId),accounts=(await repo.getAccountBalances(owners[who].userId)).map(a=>({id:a.id,balance:a.currentBalance}));const d=(await dashboard.getDashboard(owners[who].userId,'this_month')).data;const a=await analytics.getOverview(owners[who].userId,{from:'2026-09-01',to:'2026-10-15'});const b=[];for(const budget of model.budgets.filter(b=>b.who===who))b.push(await budgets.getBudget(owners[who].userId,budget.id));return {position:p,accounts,dashboard:d.summary,analytics:a,budgets:b};}
function financialOnly(value){const clone=JSON.parse(JSON.stringify(value));delete clone.analytics.recurring;for(const row of clone.analytics.accountActivity)delete row.accountName;for(const key of ['expenseByCategory','incomeByCategory'])for(const row of clone.analytics[key])delete row.categoryName;for(const row of clone.budgets){delete row.categoryName;delete row.createdAt;delete row.updatedAt;}return clone;}
function faultPool(match,{afterCommit=false}={}){let fired=false;return {query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,params)=>{const result=await client.query(sql,params);if(!fired&&match(sql,result)){fired=true;throw Object.assign(new Error('Synthetic local T60 failure'),{code:afterCommit?'ECONNRESET':'23503'});}return result;},release:()=>client.release()};},fired:()=>fired};}
try{
 if(phase==='restarted'){
  const saved=JSON.parse(readFileSync(statePath,'utf8'));model=saved.model;
  await group('PostgreSQL and backend process restart exact equality',async()=>{for(const who of ['a','b']){equal(await snapshot(who),saved.snapshots[who],'durable financial snapshot');await reconcile('restart',who,false);}});
 }else{
  const f={a:{},b:{}};
  await group('predeclared ledger and opening positions',async()=>{
   // Expected inputs declared before any account/aggregate query.
   const openings=[['cash','cash','100.00'],['savings','savings','50.00'],['negative','bank','-5.00'],['card','credit_card','20.00'],['credit','credit_card','-2.00']];
   equal(money(10000n+5000n-500n-2000n+200n),'127.00','manual opening position');
   for(const who of ['a','b']){
    await createTestUser(admin,owners[who]);await action(who,'/profile/bootstrap');
    for(const [key,type,openingA] of openings){const opening=who==='b'&&key==='cash'?'999999999.99':openingA;const result=await create(who,'/accounts',{name:who+' T60 '+key,type,openingBalance:opening,currency:'EGP'});f[who][key]=result.id;model.accounts.push({who,id:result.id,key,type,opening,status:'active'});}
    for(const [key,kind] of [['food','both'],['bills','expense']])f[who][key]=(await create(who,'/categories',{name:who+' T60 '+key,kind,icon:null,color:null})).id;
    f[who].salary=(await request(who,'/categories')).find(c=>c.isSystem&&c.name==='Salary').id;
    for(const [year,month] of [[2026,10],[2026,9],[2026,1],[2024,2]])for(const key of ['food','bills']){const body={categoryId:f[who][key],year,month,amount:'10.00',alertThresholdPercent:90},result=await create(who,'/budgets',body);model.budgets.push({who,id:result.id,...body,threshold:90});}
   }
   equal(position('a'),{assets:'145.00',cardDebt:'18.00',totalBalance:'127.00'});checkpoint('openings');await reconcile('openings','a');
  });
  const tx=(who,key,type,amount,date,category='food')=>({accountId:f[who][key],categoryId:f[who][category],type,amount,date,description:who+' T60 '+key+' '+date+' '+amount});
  let editId,generatedExpense;
  await group('manual income expenses decimals and month/year/leap boundaries',async()=>{
   const fixture=[['cash','income','10.00','2026-10-01','salary'],['cash','expense','1.23','2026-10-15'],['card','expense','2.34','2026-09-30'],['card','income','0.30','2026-10-01'],['negative','expense','0.20','2026-10-01'],['cash','expense','0.10','2026-10-01'],['cash','income','0.20','2026-10-01','salary'],['cash','expense','0.30','2026-10-01'],['savings','income','3.00','2025-12-31','salary'],['savings','expense','0.01','2026-01-01'],['savings','income','0.10','2024-02-29','salary'],['savings','expense','0.20','2024-02-29'],['savings','income','1.23','2026-09-01','salary'],['savings','expense','2.34','2026-09-30'],['savings','income','0.01','2026-10-01','salary'],['savings','income','0.10','2025-10-31','salary']];
   for(const [index,item] of fixture.entries()){const id=await addTransaction('a',tx('a',...item));if(index===1)editId=id;}
   equal(position('a'),manualExpected.position,'hand-summed fixture position');equal(totals('a'),manualExpected.allHistory,'hand-summed fixture actuals');equal(totals('a','2026-10-01','2026-10-15'),manualExpected.october,'hand-summed October actuals');checkpoint('manual ledger');await reconcile('manual');
   await analyticsCheck('a','2024-02-01','2024-02-29');await analyticsCheck('a','2025-12-31','2026-01-01');
   for(const accountId of [f.a.cash,f.a.card])await analyticsCheck('a','2026-09-01','2026-10-15',accountId);
  });
  await group('four transfer directions neutral in every financial domain',async()=>{
   for(const [source,destination,amount] of [['cash','savings','1.23'],['cash','card','30.00'],['card','cash','2.34'],['card','credit','1.23']]){
    const before=financialOnly(await snapshot('a')),prior=position('a');await addTransfer('a',{sourceAccountId:f.a[source],destinationAccountId:f.a[destination],amount,date:'2026-10-01',description:'T60 neutral'});
    equal(position('a').totalBalance,prior.totalBalance,'independent neutrality');const after=financialOnly(await snapshot('a'));
    for(const field of ['income','expenses','netSavings','totalBalance'])equal(after.dashboard[field],before.dashboard[field],'transfer dashboard '+field);equal(after.analytics.summary,before.analytics.summary,'transfer actuals neutral');equal(after.budgets,before.budgets,'transfer budgets neutral');await reconcile('transfer');
   }
   equal(money(balance(model.accounts.find(a=>a.id===f.a.card))),'-4.39','manual overpayment');equal(money(balance(model.accounts.find(a=>a.id===f.a.credit))),'-3.23','manual second card');
   checkpoint('four transfers');
  });
  await group('forecast separation generated income expense concurrent exactly once',async()=>{
   const before=financialOnly(await snapshot('a'));
   for(const [type,key,category,amount] of [['income','savings','salary','0.10'],['expense','card','food','0.20']]){
    const input={accountId:f.a[key],categoryId:f.a[category],type,amount,description:'T60 generated '+type,frequency:'monthly',startDate:'2026-10-15',endDate:'2026-12-15'};
    const r=await create('a','/recurring',input);f.a['recurring'+type]=r.id;model.forecasts.push({who:'a',id:r.id,...input,active:true,dates:['2026-10-15','2026-11-15','2026-12-15']});
   }
   equal(financialOnly(await snapshot('a')),before,'definitions have no actual effect');await reconcile('forecast');await analyticsCheck('a','2026-10-01','2026-12-31');
   await Promise.all([processor.processDueRecurring({referenceDate:'2026-10-15'}),processor.processDueRecurring({referenceDate:'2026-10-15'})]);
   const generated=(await pool.query('SELECT id,type,recurring_transaction_id definition FROM expense_tracker.transactions WHERE user_id=$1 AND recurring_transaction_id IS NOT NULL',[owners.a.userId])).rows;equal(generated.length,2);
   for(const row of generated){const definition=model.forecasts.find(d=>d.id===row.definition);model.transactions.push({who:'a',id:row.id,accountId:definition.accountId,categoryId:definition.categoryId,type:definition.type,amount:definition.amount,date:'2026-10-15',description:definition.description});if(row.type==='expense')generatedExpense=row.id;}
   equal((await pool.query("SELECT count(*)::int n FROM expense_tracker.recurring_occurrences WHERE status='posted'")).rows[0].n,2);
   checkpoint('generated income and expense');await reconcile('generated');const posted=await snapshot('a');await processor.processDueRecurring({referenceDate:'2026-10-15'});equal(await snapshot('a'),posted,'repeat has no effect');
  });
  await group('generated deletion reverses actuals keeps terminal marker and forecast',async()=>{
   await removeTransaction('a',generatedExpense);await reconcile('generated deletion');
   const marker=(await pool.query('SELECT status,generated_transaction_id FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1',[f.a.recurringexpense])).rows;
   equal(marker,[{status:'posted',generated_transaction_id:null}]);checkpoint('generated expense deleted');const before=await snapshot('a');await processor.processDueRecurring({referenceDate:'2026-10-15'});equal(await snapshot('a'),before,'never regenerate deleted occurrence');
  });
  await group('transaction amount account category date edits and manual deletion',async()=>{
   for(const patch of [{amount:'2.34'},{accountId:f.a.card},{categoryId:f.a.bills},{date:'2026-09-30'}]){await updateTransaction('a',editId,patch);await reconcile('transaction edit');}
   await removeTransaction('a',editId);checkpoint('edited manual expense deleted');await reconcile('manual deletion');equal((await request('a','/dashboard')).recentTransactions.some(t=>t.id===editId),false,'recent deletion');
  });
  await group('budget exact thresholds and negative remaining',async()=>{
   const id=await addTransaction('a',tx('a','cash','expense','8.99','2026-10-01','bills'));
   const b=model.budgets.find(b=>b.who==='a'&&b.month===10&&b.categoryId===f.a.bills);
   for(const [amount,status] of [['8.99','normal'],['9.00','near_limit'],['10.00','near_limit'],['10.01','exceeded']]){await updateTransaction('a',id,{amount});await reconcile('budget threshold','a',false);equal((await request('a','/budgets/'+b.id)).status,status);}
   await removeTransaction('a',id);await reconcile('budget threshold restored','a',false);
  });
  await group('goals create update complete reopen archive have no financial effect',async()=>{
   const before=await snapshot('a'),input={name:'T60 manual goal',targetAmount:'0.30',savedAmount:'0.40',targetDate:null,linkedAccountId:f.a.cash};const g=await create('a','/goals',input);f.a.goal=g.id;
   await request('a','/goals/'+g.id,'PUT',{...input,savedAmount:'0.50',status:'active'});await action('a','/goals/'+g.id+'/complete');await request('a','/goals/'+g.id,'PUT',{...input,status:'active'});await action('a','/goals/'+g.id+'/archive');equal(await snapshot('a'),before);await reconcile('goals','a',false);
  });
  await group('category rename/archive and account archive preserve historical money',async()=>{
   const before=financialOnly(await snapshot('a'));
   await request('a','/categories/'+f.a.food,'PUT',{name:'T60 renamed history',kind:'both',icon:null,color:null});equal(financialOnly(await snapshot('a')),before,'rename non-effect');
   const overview=await analytics.getOverview(owners.a.userId,{from:'2026-09-01',to:'2026-10-15'});equal(overview.expenseByCategory.find(c=>c.categoryId===f.a.food).categoryName,'T60 renamed history');equal((await request('a','/budgets/'+model.budgets.find(b=>b.who==='a'&&b.categoryId===f.a.food).id)).categoryName,'T60 renamed history');
   equal((await request('a','/transactions/'+model.transactions.find(t=>t.who==='a'&&t.categoryId===f.a.food).id)).categoryName,'T60 renamed history');
   await action('a','/categories/'+f.a.food+'/archive');model.forecasts.find(d=>d.id===f.a.recurringexpense).active=false;equal((await request('a','/recurring/'+f.a.recurringexpense)).status,'paused');equal(financialOnly(await snapshot('a')),before,'archive category');await reconcile('archived category');
   await action('a','/categories/'+f.a.food+'/restore');
   const linked=await create('a','/goals',{name:'T60 retained link',targetAmount:'1.00',savedAmount:'0.00',targetDate:null,linkedAccountId:f.a.savings});
   const beforeAccount=financialOnly(await snapshot('a'));await action('a','/accounts/'+f.a.savings+'/archive');model.accounts.find(a=>a.id===f.a.savings).status='archived';model.forecasts.find(d=>d.id===f.a.recurringincome).active=false;equal((await request('a','/recurring/'+f.a.recurringincome)).status,'paused');equal((await request('a','/goals/'+linked.id)).linkedAccountId,f.a.savings);equal(financialOnly(await snapshot('a')),beforeAccount,'archive account and historical transfers');await reconcile('archived account');
   await action('a','/accounts/'+f.a.savings+'/restore');model.accounts.find(a=>a.id===f.a.savings).status='active';
   await request('a','/accounts/'+f.a.cash,'PUT',{name:'a T60 cash',type:'cash',openingBalance:'100.01'},409);await reconcile('opening locked','a',false);
  });
  await group('distinct B ledger and reciprocal aggregate separation',async()=>{
   const beforeA=await snapshot('a');await addTransaction('b',tx('b','cash','income','999999999.99','2026-10-01','salary'));await addTransaction('b',tx('b','card','expense','999999999.99','2026-09-30'));await reconcile('B distinctive','b');equal(await snapshot('a'),beforeA);
   const beforeB=await snapshot('b');const id=await addTransaction('a',tx('a','cash','expense','0.01','2026-10-01'));await reconcile('A changed','a',false);equal(await snapshot('b'),beforeB);await removeTransaction('a',id);
  });
  await group('concurrent transactions and transfers reconcile committed ledger',async()=>{
   await Promise.all(Array.from({length:24},(_,i)=>addTransaction(i%2?'a':'b',tx(i%2?'a':'b','cash',i%3?'expense':'income','0.01','2026-10-01',i%3?'food':'salary'))));
   const prior=position('a');await Promise.all(Array.from({length:20},(_,i)=>addTransfer('a',{sourceAccountId:f.a[i%2?'cash':'card'],destinationAccountId:f.a[i%2?'card':'cash'],amount:'0.10',date:'2026-10-01',description:'T60 concurrent'})));equal(position('a'),prior);await reconcile('concurrent A');await reconcile('concurrent B','b',false);
  });
  await group('transaction transfer recurring post-write rollback and lost acknowledgement',async()=>{
   for(const [kind,make,operation] of [
    ['transactions',db=>createV2TransactionService(db),service=>service.createTransaction(owners.a.userId,tx('a','cash','expense','0.01','2026-10-01'))],
    ['transfers',db=>createTransferService(db),service=>service.createTransfer(owners.a.userId,{sourceAccountId:f.a.cash,destinationAccountId:f.a.card,amount:'0.01',date:'2026-10-01',description:null})]
   ]){const before=await snapshot('a'),db=faultPool(sql=>sql.startsWith('INSERT INTO expense_tracker.'+kind));await assert.rejects(()=>operation(make(db)));equal(db.fired(),true);equal(await snapshot('a'),before,kind+' actual post-write rollback');await reconcile('rollback '+kind,'a',false);}
   const definition=await create('a','/recurring',{accountId:f.a.cash,categoryId:f.a.food,type:'expense',amount:'0.01',description:'T60 rollback posting',frequency:'monthly',startDate:'2026-10-15',endDate:'2026-10-15'});model.forecasts.push({who:'a',id:definition.id,accountId:f.a.cash,type:'expense',amount:'0.01',active:true,dates:['2026-10-15']});
   const before=await snapshot('a'),db=faultPool(sql=>sql.startsWith('INSERT INTO expense_tracker.transactions'));
   await createRecurringProcessor(db).processDueRecurring({referenceDate:'2026-10-15',definitionId:definition.id});equal(db.fired(),true);equal(await snapshot('a'),before,'recurring generated INSERT rollback');await reconcile('rollback recurring','a',false);
   await action('a','/recurring/'+definition.id+'/archive');model.forecasts.find(d=>d.id===definition.id).active=false;
   const uncertain=faultPool(sql=>sql==='COMMIT',{afterCommit:true}),service=createTransferService(uncertain),input={sourceAccountId:f.a.cash,destinationAccountId:f.a.card,amount:'0.01',date:'2026-10-01',description:'T60 uncertain once'};
   await assert.rejects(()=>service.createTransfer(owners.a.userId,input));equal(uncertain.fired(),true);const committed=(await pool.query("SELECT id FROM expense_tracker.transfers WHERE user_id=$1 AND description='T60 uncertain once'",[owners.a.userId])).rows;equal(committed.length,1);model.transfers.push({who:'a',id:committed[0].id,...input});await reconcile('lost transfer acknowledgement');
   const recurring=await create('a','/recurring',{accountId:f.a.cash,categoryId:f.a.food,type:'expense',amount:'0.01',description:'T60 uncertain recurring once',frequency:'monthly',startDate:'2026-10-15',endDate:'2026-10-15'});
   model.forecasts.push({who:'a',id:recurring.id,accountId:f.a.cash,type:'expense',amount:'0.01',active:true,dates:['2026-10-15']});
   let inserted=false;const uncertainRecurring=faultPool(sql=>{if(sql.startsWith('INSERT INTO expense_tracker.transactions'))inserted=true;return inserted&&sql==='COMMIT';},{afterCommit:true});
   await createRecurringProcessor(uncertainRecurring).processDueRecurring({referenceDate:'2026-10-15',definitionId:recurring.id});equal(uncertainRecurring.fired(),true);
   const posted=(await pool.query('SELECT id FROM expense_tracker.transactions WHERE recurring_transaction_id=$1',[recurring.id])).rows;equal(posted.length,1);
   model.transactions.push({who:'a',id:posted[0].id,accountId:f.a.cash,categoryId:f.a.food,type:'expense',amount:'0.01',date:'2026-10-15',description:'T60 uncertain recurring once'});
   const committedSnapshot=await snapshot('a');await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:recurring.id});equal(await snapshot('a'),committedSnapshot,'inspect/reprocess uncertain post exactly once');await reconcile('lost recurring acknowledgement');
  });
  await group('large exact aggregates exceed input maximum without overflow',async()=>{
   for(const type of ['income','expense'])for(let i=0;i<2;i++)await addTransaction('a',tx('a','cash',type,'999999999.99','2026-10-01',type==='income'?'salary':'food'));
   await reconcile('large');assert.ok(cents(totals('a','2026-10-01','2026-10-15').income)>99999999999n);assertions++;
  });
  await group('Cairo midnight day-only inclusion without UTC shifts',async()=>{
   equal(cairoToday(new Date('2026-09-30T20:59:59Z')),'2026-09-30');equal(cairoToday(new Date('2026-09-30T21:00:00Z')),'2026-10-01');
   for(const [instant,from,to] of [['2026-09-30T20:59:59Z','2026-09-01','2026-09-30'],['2026-09-30T21:00:00Z','2026-10-01','2026-10-01']]){
    const result=(await createDashboardService(pool,{now:()=>new Date(instant)}).getDashboard(owners.a.userId,'this_month')).data;equal([result.period.from,result.period.to],[from,to]);const actual=totals('a',from,to);equal([result.summary.income,result.summary.expenses,result.summary.netSavings],[actual.income,actual.expenses,actual.netSavings]);await analyticsCheck('a',from,to);
   }
  });
  await group('catalog source of truth no mutable derived totals',async()=>{
   const columns=(await pool.query("SELECT table_name,column_name,data_type,numeric_precision FROM information_schema.columns WHERE table_schema='expense_tracker'")).rows;
   for(const [table,names] of [['accounts',['balance','current_balance','net_position']],['budgets',['spent','remaining','percent_used']],['goals',['balance','account_balance']]])equal(columns.filter(c=>c.table_name===table&&names.includes(c.column_name)),[],'no cached '+table+' totals');
   const amounts=columns.filter(c=>['amount','opening_balance','target_amount','saved_amount'].includes(c.column_name));assert.ok(amounts.length>=7);assertions++;for(const column of amounts)equal([column.data_type,column.numeric_precision],['numeric',null],'unrestricted exact numeric '+column.table_name);
  });
  await group('scale 30000 transactions 2000 transfers many budgets exact reconciliation',async()=>{
   const planned=Array.from({length:30000},(_,index)=>{const type=index%2?'income':'expense';return {who:'a',id:randomUUID(),accountId:f.a.cash,categoryId:type==='income'?f.a.salary:f.a.food,type,amount:type==='income'?'0.10':'0.01',date:'2026-10-01',description:'T60 bulk'};});
   const result=await pool.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date)
     SELECT fixture.id,$1,$2,CASE WHEN fixture.type='income' THEN $3::uuid ELSE $4::uuid END,fixture.type,CASE WHEN fixture.type='income' THEN 0.10 ELSE 0.01 END,'T60 bulk','2026-10-01' FROM unnest($5::uuid[],$6::text[]) AS fixture(id,type)`,[owners.a.userId,f.a.cash,f.a.salary,f.a.food,planned.map(row=>row.id),planned.map(row=>row.type)]);
   model.transactions.push(...planned);
   const transfers=await pool.query("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date,description) SELECT $1,$2,$3,0.01,'2026-10-01','T60 bulk' FROM generate_series(1,2000) RETURNING id",[owners.a.userId,f.a.cash,f.a.savings]);
   for(const row of transfers.rows)model.transfers.push({who:'a',id:row.id,sourceAccountId:f.a.cash,destinationAccountId:f.a.savings,amount:'0.01',date:'2026-10-01'});
   for(let i=0;i<100;i++){const year=2000+Math.floor(i/12),month=i%12+1,body={categoryId:f.a.food,year,month,amount:'1.00',alertThresholdPercent:90},budget=await create('a','/budgets',body);model.budgets.push({who:'a',id:budget.id,...body,threshold:90});}
   equal(result.rowCount,30000);equal(transfers.rowCount,2000);checkpoint('scale');await reconcile('scale');await reconcile('scale B','b',false);
   for(const [name,read] of [['account balances',()=>repo.getAccountBalances(owners.a.userId)],['net position',()=>repo.getFinancialPosition(owners.a.userId)],['Dashboard',()=>dashboard.getDashboard(owners.a.userId,'this_month')],['Analytics',()=>analytics.getOverview(owners.a.userId,{from:'2026-09-01',to:'2026-10-15'})],['Budget list',()=>budgets.listBudgets(owners.a.userId,{year:2026,month:10})]]){const samples=[];for(let i=0;i<3;i++){const start=performance.now();await read();samples.push(performance.now()-start);}timings.push({name,medianMs:Math.round(samples.sort((a,b)=>a-b)[1]*100)/100});}
  });
  const snapshots={a:await snapshot('a'),b:await snapshot('b')};
  writeFileSync(statePath,JSON.stringify({model,snapshots}));
 }
 const result={phase,groups,checks:assertions,timings,checkpoints,fixture:{accounts:model.accounts.length,transactions:model.transactions.length,transfers:model.transfers.length,budgets:model.budgets.length,forecasts:model.forecasts.length},final:{a:position('a'),b:position('b'),aOctober:totals('a','2026-10-01','2026-10-15')},failures:0,remoteTouched:false};
 writeFileSync(resolve(output,phase+'.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({phase,checks:assertions,groups:groups.length,failures:0}));
}finally{await auth.close();await pool.end();await admin.end();}

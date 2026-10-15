// T61 local-only durable recurring acceptance. No dotenv or hosted fallback.
/* global fetch */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,basename,dirname} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout,clearTimeout} from 'node:timers';
import {Client,Pool} from 'pg';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createTestAuthHarness} from '../tests/helpers/v2-isolation.mjs';
import {createRecurringService} from '../dist/services/recurring.js';
import {createRecurringOccurrenceService} from '../dist/services/recurring-occurrences.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createAccountBalanceRepository} from '../dist/services/account-balances.js';
import {getFirstOccurrenceOnOrAfter,getNextOccurrenceAfter} from '../dist/domain/recurrence.js';

const url=disposableIsolationUrl(process.env.T61_DISPOSABLE_DATABASE_URL),data=realpathSync(process.env.T61_DATA_DIRECTORY),output=resolve(process.env.T61_OUTPUT_DIRECTORY);
assert.equal(basename(data),'pgdata');assert.equal(basename(dirname(data)),'.tmp-v2-t61');assert.ok(output.replaceAll('\\','/').includes('/.tmp-v2-t61/'));mkdirSync(output,{recursive:true});
const stateFile=resolve(output,'private-state.json'),mode=process.argv[2]??'all',self=fileURLToPath(import.meta.url);
assert.ok(['all','initial','crash-reserve','crash-post','recover'].includes(mode));
if(mode==='all'){
 const template=new URL(url);template.pathname='/template1';const c=new Client({connectionString:template.href});await c.connect();
 try{assert.equal(realpathSync((await c.query('SHOW data_directory')).rows[0].data_directory),data);assert.equal((await c.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname='postgres'")).rows[0].n,0);await c.query('DROP DATABASE postgres');for(const role of ['expense_tracker_app','anon','authenticated'])await c.query('DROP ROLE IF EXISTS '+role);await c.query('CREATE DATABASE postgres TEMPLATE template0');}finally{await c.end();}
 const run=phase=>{const r=spawnSync(process.execPath,[self,phase],{env:process.env,encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:4*1024*1024});writeFileSync(resolve(output,phase+'.log'),r.stdout+r.stderr);assert.equal(r.status,0,phase+' failed; inspect the local log');console.log(r.stdout.trim());};
 run('initial');const crashes=[];
 for(const phase of ['crash-reserve','crash-post']){
  const child=spawn(process.execPath,[self,phase],{env:process.env,windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
  let timer;const ready=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Crash checkpoint timed out')),15000);child.once('message',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('Worker exited before checkpoint: '+errors)));}).finally(()=>clearTimeout(timer));
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;crashes.push({phase,checkpoint:ready.checkpoint,killed:true});if(phase==='crash-reserve'){const saved=JSON.parse(readFileSync(stateFile,'utf8'));saved.crashReserveOccurrenceId=ready.occurrenceId;writeFileSync(stateFile,JSON.stringify(saved));}
 }
 const bin=realpathSync(process.env.T61_PG_BIN),restart=spawnSync(resolve(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-l',resolve(output,'postgres-restart.log'),'restart'],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(restart.status,0,'Local PostgreSQL restart failed');
 run('recover');writeFileSync(resolve(output,'result.json'),JSON.stringify({initial:JSON.parse(readFileSync(resolve(output,'initial.json'),'utf8')),recovery:JSON.parse(readFileSync(resolve(output,'recover.json'),'utf8')),crashes,databaseRestart:true,newBackendProcess:true,failures:0,remoteTouched:false},null,2)+'\n');process.exit(0);
}
const admin=new Client({connectionString:url.href});await admin.connect();assert.equal(realpathSync((await admin.query('SHOW data_directory')).rows[0].data_directory),data);
if(mode==='initial')await prepareIsolationDatabase(admin);
const runtime=new URL(url);runtime.username='expense_tracker_app';const pool=new Pool({connectionString:runtime.href,max:12});pool.on('error',()=>{});
const now=()=>new Date('2026-10-15T09:00:00Z'),early=()=>new Date('1900-01-01T12:00:00Z');
const users={a:{userId:'a6100000-0000-4000-8000-000000000001'},b:{userId:'b6100000-0000-4000-8000-000000000001'}};
const ledger=createRecurringOccurrenceService(pool),processor=createRecurringProcessor(pool),lifecycle=createRecurringService(pool,{now}),oldLifecycle=createRecurringService(pool,{now:early}),accounts=createAccountService(pool),balances=createAccountBalanceRepository(pool);
if(mode.startsWith('crash-')){
 const state=JSON.parse(readFileSync(stateFile,'utf8')),def=state[mode==='crash-reserve'?'crashReserve':'crashPost'];
 if(mode==='crash-reserve'){const occurrence=await ledger.reserveOccurrence(users.a.userId,def.id,'2026-10-15');process.send({checkpoint:'reservation committed',occurrenceId:occurrence.id});await new Promise(()=>{});}
 else{
  const database={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,params)=>{const result=await client.query(sql,params);if(sql.startsWith("UPDATE expense_tracker.recurring_occurrences SET status='posted'")){process.send({checkpoint:'generated insert and posted link uncommitted'});await new Promise(()=>{});}return result;},release:discard=>client.release(discard)};}};
  await createRecurringOccurrenceService(database).postOccurrence(users.a.userId,def.id,'2026-10-15');throw Error('Crash worker must be killed before COMMIT');
 }
}
const counts=[],timings=[],logs=[];let checks=0;const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const group=async(name,work)=>{const before=checks,start=performance.now();await work();counts.push({name,checks:checks-before,durationMs:Math.round(performance.now()-start)});console.log('PASS '+name+' '+(checks-before));};
const cronSecret=randomBytes(32).toString('hex');
const auth=await createTestAuthHarness(pool,{categoryManagement:true,cursorSigningSecret:randomBytes(32).toString('hex'),now,dashboardOptions:{now},recurringCron:{processor,secret:()=>cronSecret,now,log:entry=>logs.push(entry)}});
const tokens={a:await auth.createTestAuthToken(users.a),b:await auth.createTestAuthToken(users.b)};
async function request(who,path,method='GET',body,status=200){const r=await auth.rawRequest(tokens[who],path,method,body);equal(r.status,status,path+' '+JSON.stringify(r.body?.error));return r.body?.data;}
const dates=(start,count)=>Array.from({length:count},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
const cents=value=>{const [a,b='']=value.split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
const money=value=>(value<0n?'-':'')+String((value<0n?-value:value)/100n)+'.'+String((value<0n?-value:value)%100n).padStart(2,'0');
let state={parents:{},oracle:[],deleted:[]};
async function define(who='a',patch={},current=false){const f=state.parents[who],input={accountId:f.cash,categoryId:f.salary,type:'income',amount:'0.10',description:'T61 synthetic schedule',frequency:'daily',startDate:'2026-10-15',endDate:'2026-10-15',...patch};const def=await(current?lifecycle:oldLifecycle).createRecurring(users[who].userId,input);state.oracle.push({id:def.id,who,input,postedDates:[]});return def;}
const defRow=async id=>(await pool.query("SELECT status,to_char(next_occurrence,'YYYY-MM-DD') next FROM expense_tracker.recurring_transactions WHERE id=$1",[id])).rows[0];
const txRows=async id=>(await pool.query("SELECT id,user_id,account_id,category_id,type,amount::text amount,description,to_char(transaction_date,'YYYY-MM-DD') date,to_char(recurring_occurrence_date,'YYYY-MM-DD') occurrence FROM expense_tracker.transactions WHERE recurring_transaction_id=$1 ORDER BY transaction_date",[id])).rows;
async function expectPosting(def,expected,next){const oracle=state.oracle.find(d=>d.id===def.id);oracle.postedDates=expected;const rows=await txRows(def.id);equal(rows.map(t=>t.date),expected.filter(date=>!state.deleted.includes(def.id+':'+date)),'exact dates/cardinality');for(const row of rows){const input=oracle.inputsByDate?.[row.date]??oracle.input;equal([row.user_id,row.account_id,row.category_id,row.type,row.amount,row.description,row.occurrence],[users[oracle.who].userId,input.accountId,input.categoryId,input.type,input.amount,input.description,row.date],'coherent owned generated row');}equal((await defRow(def.id)).next,next,'durable next cursor');}
async function reconcile(who='a'){
 const events=state.oracle.filter(d=>d.who===who).flatMap(d=>d.postedDates.filter(date=>!state.deleted.includes(d.id+':'+date)).map(date=>({...d.inputsByDate?.[date]??d.input,date}))),owned=await balances.getAccountBalances(users[who].userId);
 for(const account of owned){const delta=events.filter(e=>e.accountId===account.id).reduce((n,e)=>n+(e.type==='income'?1n:-1n)*cents(e.amount),0n);equal(account.currentBalance,money(account.type==='credit_card'?-delta:delta),'independent generated balance');}
 const sum=(type,from,to)=>events.filter(e=>e.type===type&&e.date>=from&&e.date<=to).reduce((n,e)=>n+cents(e.amount),0n);
 const d=await request(who,'/dashboard'),a=await request(who,'/analytics/overview?from=2026-10-01&to=2026-10-15');
 const income=sum('income','2026-10-01','2026-10-15'),expense=sum('expense','2026-10-01','2026-10-15');for(const v of [d.summary,a.summary])equal([v.income,v.expenses,v.netSavings],[money(income),money(expense),money(income-expense)]);
 equal(d.summary.totalBalance,money(events.reduce((n,e)=>n+(e.type==='income'?1n:-1n)*cents(e.amount),0n)));
 const budget=await request(who,'/budgets/'+state.parents[who].budget);equal(budget.spent,money(events.filter(e=>e.type==='expense'&&e.categoryId===state.parents[who].food&&e.date.startsWith('2026-10')).reduce((n,e)=>n+cents(e.amount),0n)));
 equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions WHERE user_id=$1',[users[who].userId])).rows[0].n,events.length);
}
try{
 if(mode==='recover'){
  state=JSON.parse(readFileSync(stateFile,'utf8'));
  await group('killed processes plus PostgreSQL restart recover pending units exactly once',async()=>{
   const reserve=await ledger.getOccurrence(users.a.userId,state.crashReserve.id,'2026-10-15'),post=await ledger.getOccurrence(users.a.userId,state.crashPost.id,'2026-10-15');equal(reserve.status,'pending');equal(reserve.id,state.crashReserveOccurrenceId);equal(post.status,'pending');equal(post.id,state.crashPostOccurrence.id);equal((await txRows(state.crashPost.id)).length,0,'killed uncommitted generated insert rolled back');
   for(const def of [state.crashReserve,state.crashPost]){const prior=await ledger.getOccurrence(users.a.userId,def.id,'2026-10-15');equal((await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id})).posted,1);equal((await ledger.getOccurrence(users.a.userId,def.id,'2026-10-15')).id,prior.id);await expectPosting(def,['2026-10-15'],null);equal((await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id})).posted,0);}
   await reconcile();await reconcile('b');
  });
 }else{
  await group('fresh owned fixtures and no historical create backfill',async()=>{
   for(const who of ['a','b']){await createTestUser(admin,users[who]);await request(who,'/profile/bootstrap','POST',{});const f=state.parents[who]={};for(const [key,type] of [['cash','cash'],['card','credit_card']])f[key]=(await accounts.createAccount(users[who].userId,{name:who+' T61 '+key,type,openingBalance:'0.00'})).id;const cats=await request(who,'/categories');f.salary=cats.find(c=>c.name==='Salary').id;f.food=(await request(who,'/categories','POST',{name:who+' T61 custom',kind:'both',icon:null,color:null},201)).id;f.budget=(await request(who,'/budgets','POST',{categoryId:f.food,amount:'1.00',year:2026,month:10},201)).id;}
   for(const [frequency,startDate,next] of [['daily','2020-01-01','2026-10-15'],['weekly','2026-10-01','2026-10-15'],['monthly','2020-01-31','2026-10-31'],['yearly','2020-02-29','2027-02-28']]){const def=await define('a',{frequency,startDate,endDate:null},true);equal(def.nextOccurrence,next);equal((await txRows(def.id)).length,0);equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1',[def.id])).rows[0].n,0);await lifecycle.archiveRecurring(users.a.userId,def.id);}
   for(let i=0;i<120;i++){const frequency=['daily','weekly','monthly','yearly'][i%4],def=await define('a',{frequency,startDate:'1900-01-01',endDate:null,description:'T61 old-start scale'},true);await lifecycle.archiveRecurring(users.a.userId,def.id);}
   equal((await pool.query('SELECT (SELECT count(*)::int FROM expense_tracker.transactions) transactions,(SELECT count(*)::int FROM expense_tracker.recurring_occurrences) occurrences')).rows[0],{transactions:0,occurrences:0},'120 service-created old-start schedules generate no historical/future ledger');
  });
  await group('exact due early run calendar anchors inclusive exhaustion and money',async()=>{
   const matrix=[
    [{},['2026-10-15'],'2026-10-15'],
    [{frequency:'weekly',startDate:'2025-04-17',endDate:'2025-05-01'},['2025-04-17','2025-04-24','2025-05-01'],'2025-05-01'],
    [{frequency:'monthly',startDate:'2024-01-31',endDate:'2024-05-31'},['2024-01-31','2024-02-29','2024-03-31','2024-04-30','2024-05-31'],'2024-05-31'],
    [{frequency:'yearly',startDate:'2020-02-29',endDate:'2024-02-29'},['2020-02-29','2021-02-28','2022-02-28','2023-02-28','2024-02-29'],'2024-02-29'],
    [{startDate:'2025-04-24',endDate:'2025-04-27'},['2025-04-24','2025-04-25','2025-04-26','2025-04-27'],'2025-04-27'],
    [{type:'expense',accountId:state.parents.a.card,categoryId:state.parents.a.food,amount:'0.20'},['2026-10-15'],'2026-10-15'],
    [{accountId:state.parents.a.card,categoryId:state.parents.a.food,amount:'0.10'},['2026-10-15'],'2026-10-15'],
    [{amount:'999999999.99'},['2026-10-15'],'2026-10-15']];
   for(const [patch,expected,reference] of matrix){const def=await define('a',patch);const before=await processor.processDueRecurring({referenceDate:'1900-01-01',definitionId:def.id});equal(before.attempts,0);equal(await ledger.getOccurrence(users.a.userId,def.id,def.startDate),null);const result=await processor.processDueRecurring({referenceDate:reference,definitionId:def.id});equal([result.posted,result.attempts,result.failed,result.hasRemaining],[expected.length,expected.length,0,false]);await expectPosting(def,expected,null);equal((await processor.processDueRecurring({referenceDate:reference,definitionId:def.id})).attempts,0);}
   equal(getNextOccurrenceAfter({startDate:'2024-02-29',frequency:'yearly'},'2027-02-28'),'2028-02-29');equal(getFirstOccurrenceOnOrAfter({startDate:'2000-02-29',frequency:'yearly'},'2100-01-01'),'2100-02-28');await reconcile();
  });
  await group('generated deletion terminal marker future continuation and forecast separation',async()=>{
   const previous=await request('a','/analytics/overview?from=2026-10-15&to=2026-10-16');const def=await define('a',{type:'expense',categoryId:state.parents.a.food,amount:'0.20',endDate:'2026-10-16'});const before=await request('a','/analytics/overview?from=2026-10-15&to=2026-10-16');equal(cents(before.recurring.expenses)-cents(previous.recurring.expenses),40n);equal((await request('a','/dashboard')).upcomingRecurring.filter(r=>r.recurringTransactionId===def.id).map(r=>r.occurrenceDate),['2026-10-15','2026-10-16']);
   equal((await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id})).posted,1);await expectPosting(def,['2026-10-15'],'2026-10-16');await reconcile();
   const tx=(await txRows(def.id))[0];await request('a','/transactions/'+tx.id,'DELETE',undefined,204);state.deleted.push(def.id+':2026-10-15');const marker=await ledger.getOccurrence(users.a.userId,def.id,'2026-10-15');equal([marker.status,marker.generatedTransactionId],['posted',null]);equal((await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id})).posted,0);await reconcile();
   equal((await request('a','/analytics/overview?from=2026-10-15&to=2026-10-16')).recurring.expenses,before.recurring.expenses);equal((await request('a','/dashboard')).upcomingRecurring.filter(r=>r.recurringTransactionId===def.id).map(r=>r.occurrenceDate),['2026-10-16']);await lifecycle.archiveRecurring(users.a.userId,def.id);equal((await request('a','/dashboard')).upcomingRecurring.some(r=>r.recurringTransactionId===def.id),false);
   // Future financial dates remain DB-rejected; use historical dates for actual continuation.
   const old=await define('a',{startDate:'2025-10-01',endDate:'2025-10-02'});await processor.processDueRecurring({referenceDate:'2025-10-01',definitionId:old.id});await expectPosting(old,['2025-10-01'],'2025-10-02');const original=(await txRows(old.id))[0];await request('a','/transactions/'+original.id,'DELETE',undefined,204);state.deleted.push(old.id+':2025-10-01');await processor.processDueRecurring({referenceDate:'2025-10-02',definitionId:old.id});await expectPosting(old,['2025-10-01','2025-10-02'],null);
  });
  await group('posted history survives coherent edits and parent restore requires explicit resume',async()=>{
   const def=await define('a',{startDate:'2026-10-14',endDate:'2026-10-15'});await processor.processDueRecurring({referenceDate:'2026-10-14',definitionId:def.id});await expectPosting(def,['2026-10-14'],'2026-10-15');const old=await txRows(def.id),marker=await ledger.getOccurrence(users.a.userId,def.id,'2026-10-14'),oracle=state.oracle.find(d=>d.id===def.id);oracle.inputsByDate={'2026-10-14':{...oracle.input}};
   const edited={...oracle.input,accountId:state.parents.a.card,categoryId:state.parents.a.food,type:'expense',amount:'0.20',description:'T61 edited coherent snapshot'};await lifecycle.updateRecurring(users.a.userId,def.id,edited);oracle.input=edited;equal(await txRows(def.id),old);equal(await ledger.getOccurrence(users.a.userId,def.id,'2026-10-14'),marker);await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id});await expectPosting(def,['2026-10-14','2026-10-15'],null);await reconcile();
   const parent=await accounts.createAccount(users.a.userId,{name:'T61 lifecycle parent',type:'cash',openingBalance:'0.00'}),category=(await request('a','/categories','POST',{name:'T61 lifecycle category',kind:'income',icon:null,color:null},201)).id;
   for(const kind of ['account','category']){const r=await define('a',{accountId:parent.id,categoryId:category,endDate:null});await ledger.reserveOccurrence(users.a.userId,r.id,'2026-10-15');if(kind==='account')await accounts.archiveAccount(users.a.userId,parent.id);else await request('a','/categories/'+category+'/archive','POST',{});equal((await defRow(r.id)).status,'paused');equal((await ledger.getOccurrence(users.a.userId,r.id,'2026-10-15')).status,'skipped');if(kind==='account')await accounts.restoreAccount(users.a.userId,parent.id);else await request('a','/categories/'+category+'/restore','POST',{});equal((await defRow(r.id)).status,'paused');equal((await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:r.id})).posted,0);equal((await lifecycle.resumeRecurring(users.a.userId,r.id)).nextOccurrence,'2026-10-16');await lifecycle.archiveRecurring(users.a.userId,r.id);}
   const repeated=await define('a',{endDate:null});const paused=await Promise.all([lifecycle.pauseRecurring(users.a.userId,repeated.id),lifecycle.pauseRecurring(users.a.userId,repeated.id)]);equal(paused[0],paused[1]);const resumed=await Promise.all([lifecycle.resumeRecurring(users.a.userId,repeated.id),lifecycle.resumeRecurring(users.a.userId,repeated.id)]);equal(resumed[0],resumed[1]);equal(resumed[0].nextOccurrence,'2026-10-15');const archived=await lifecycle.archiveRecurring(users.a.userId,repeated.id);equal(await lifecycle.archiveRecurring(users.a.userId,repeated.id),archived);
  });
  await group('100-per-definition continuation and cooperative committed/pending deadlines',async()=>{
   const def=await define('a',{startDate:'2025-01-01',endDate:'2025-04-12'});const first=await processor.processDueRecurring({referenceDate:'2025-04-12',definitionId:def.id});equal([first.attempts,first.posted,first.hasRemaining,first.limitReached],[100,100,true,true]);await expectPosting(def,dates('2025-01-01',100),'2025-04-11');const second=await processor.processDueRecurring({referenceDate:'2025-04-12',definitionId:def.id});equal([second.attempts,second.posted,second.hasRemaining],[2,2,false]);await expectPosting(def,dates('2025-01-01',102),null);
   const pending=await define();let claimed=false;const db={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();let reserve=false;return {query:async(sql,params)=>{const result=await client.query(sql,params);if(sql.startsWith('INSERT INTO expense_tracker.recurring_occurrences'))reserve=true;if(sql==='COMMIT'&&reserve)claimed=true;return result;},release:discard=>client.release(discard)};}};
   const stopped=await createRecurringProcessor(db).processDueRecurring({referenceDate:'2026-10-15',definitionId:pending.id,shouldStop:()=>claimed});equal([stopped.posted,stopped.deadlineReached,stopped.hasRemaining],[0,true,true]);equal((await ledger.getOccurrence(users.a.userId,pending.id,'2026-10-15')).status,'pending');await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:pending.id});await expectPosting(pending,['2026-10-15'],null);
   const partial=await define('a',{startDate:'2026-10-10',endDate:'2026-10-14'});let committedPosts=0;const partialDb={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();let posting=false;return {query:async(sql,params)=>{const result=await client.query(sql,params);if(sql.startsWith('INSERT INTO expense_tracker.transactions'))posting=true;if(sql==='COMMIT'&&posting)committedPosts++;return result;},release:discard=>client.release(discard)};}};
   const deadline=await createRecurringProcessor(partialDb).processDueRecurring({referenceDate:'2026-10-14',definitionId:partial.id,shouldStop:()=>committedPosts>=2});equal([deadline.posted,deadline.deadlineReached,deadline.hasRemaining],[2,true,true]);await expectPosting(partial,['2026-10-10','2026-10-11'],'2026-10-12');equal((await processor.processDueRecurring({referenceDate:'2026-10-14',definitionId:partial.id})).posted,3);await expectPosting(partial,dates('2026-10-10',5),null);
  });
  await group('pending edit pause archive skip and long-pause on-or-after resume',async()=>{
   for(const action of ['updateRecurring','pauseRecurring','archiveRecurring']){const def=await define('a',{endDate:null});const occurrence=await ledger.reserveOccurrence(users.a.userId,def.id,'2026-10-15');if(action==='updateRecurring')await lifecycle.updateRecurring(users.a.userId,def.id,{...state.oracle.find(d=>d.id===def.id).input,amount:'0.20',description:'T61 coherent edit'});else await lifecycle[action](users.a.userId,def.id);const marker=await ledger.getOccurrence(users.a.userId,def.id,'2026-10-15');equal([marker.id,marker.status],[occurrence.id,'skipped']);equal((await txRows(def.id)).length,0);await lifecycle.archiveRecurring(users.a.userId,def.id);}
   const paused=await define('a',{startDate:'2020-01-01',endDate:null});await oldLifecycle.pauseRecurring(users.a.userId,paused.id);const resumed=await lifecycle.resumeRecurring(users.a.userId,paused.id);equal(resumed.nextOccurrence,'2026-10-15');equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1',[paused.id])).rows[0].n,0);await lifecycle.archiveRecurring(users.a.userId,paused.id);
   const future=await define('a',{startDate:'2026-10-16',endDate:'2026-10-16'},true);equal((await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:future.id})).attempts,0);equal(await ledger.getOccurrence(users.a.userId,future.id,'2026-10-16'),null);await lifecycle.archiveRecurring(users.a.userId,future.id);
  });
  await group('real database connection termination and explicit failed recovery',async()=>{
   const def=await define();let terminated=false;const database={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();client.on('error',()=>{});return {query:async(sql,params)=>{const result=await client.query(sql,params);if(!terminated&&sql.startsWith('INSERT INTO expense_tracker.transactions')){terminated=true;await admin.query('SELECT pg_terminate_backend($1)',[client.processID]);}return result;},release:discard=>client.release(discard||terminated)};}};
   const result=await createRecurringProcessor(database).processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id});equal(terminated,true);equal(result.posted,0);equal((await txRows(def.id)).length,0);equal((await defRow(def.id)).next,'2026-10-15');const failed=await ledger.getOccurrence(users.a.userId,def.id,'2026-10-15');equal(failed.status,'failed');equal((await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id})).failed,1);await assert.rejects(()=>ledger.transitionOccurrence(users.b.userId,def.id,'2026-10-15','retry'),error=>error.status===404);checks++;await ledger.transitionOccurrence(users.a.userId,def.id,'2026-10-15','retry');equal((await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id})).posted,1);await expectPosting(def,['2026-10-15'],null);await reconcile();
  });
  await group('lock timeout fails safely and explicit recovery posts once',async()=>{
   const def=await define(),locker=await pool.connect();await locker.query('BEGIN');await locker.query('SELECT id FROM expense_tracker.accounts WHERE id=$1 FOR UPDATE',[state.parents.a.cash]);
   const database={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,params)=>{const result=await client.query(sql,params);if(sql==='BEGIN')await client.query("SET LOCAL lock_timeout='100ms'");return result;},release:discard=>client.release(discard)};}};
   try{const result=await createRecurringProcessor(database).processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id});equal([result.posted,result.failed],[0,1]);equal((await txRows(def.id)).length,0);}finally{await locker.query('ROLLBACK');locker.release();}
   await ledger.transitionOccurrence(users.a.userId,def.id,'2026-10-15','retry');await processor.processDueRecurring({referenceDate:'2026-10-15',definitionId:def.id});await expectPosting(def,['2026-10-15'],null);
  });
  await group('mixed-frequency backlog obeys oldest-due ordering without resurrecting exhaustion',async()=>{
   const definitions=[];for(const [patch,expected] of [[{startDate:'2026-10-13'},['2026-10-13','2026-10-14','2026-10-15']],[{frequency:'weekly',startDate:'2026-10-08'},['2026-10-08','2026-10-15']],[{frequency:'monthly',startDate:'2026-09-15'},['2026-09-15','2026-10-15']],[{frequency:'yearly',startDate:'2026-10-15'},['2026-10-15']]])definitions.push({def:await define('b',patch),expected});
   const exhausted=await define('b',{startDate:'2024-01-01',endDate:'2024-01-01'},true);equal(exhausted.nextOccurrence,null);let discovered;
   const database={connect:pool.connect.bind(pool),query:async(sql,params)=>{const result=await pool.query(sql,params);if(sql.startsWith('SELECT id,user_id AS'))discovered=result.rows.map(r=>r.id);return result;}};
   const result=await createRecurringProcessor(database).processDueRecurring({referenceDate:'2026-10-15',userId:users.b.userId});equal(discovered,[definitions[2].def.id,definitions[1].def.id,definitions[0].def.id,definitions[3].def.id]);equal([result.definitionsVisited,result.attempts,result.posted,result.hasRemaining],[4,8,8,false]);for(const {def,expected} of definitions)await expectPosting(def,expected,null);equal((await txRows(exhausted.id)).length,0);await reconcile('b');
  });
  await group('eight overlapping processors across dozens of owners and coherent cursors',async()=>{
   const definitions=[];for(let i=0;i<32;i++){const user={userId:`e6100000-0000-4000-8000-${String(i+1).padStart(12,'0')}`};await createTestUser(admin,user);const account=await accounts.createAccount(user.userId,{name:'T61 overlap',type:'cash',openingBalance:'0.00'});for(let j=0;j<4;j++)definitions.push(await oldLifecycle.createRecurring(user.userId,{accountId:account.id,categoryId:state.parents.a.salary,type:'income',amount:'0.01',description:'T61 overlap',frequency:'daily',startDate:'2026-10-15',endDate:'2026-10-15'}));}
   const before=(await admin.query("SELECT deadlocks::int n FROM pg_stat_database WHERE datname='postgres'")).rows[0].n;
   const results=await Promise.all(Array.from({length:8},()=>createRecurringProcessor(pool).processDueRecurring({referenceDate:'2026-10-15'})));
   equal(results.reduce((n,r)=>n+r.posted,0),128);for(const result of results){equal(result.failed,0);assert.ok(result.attempts>=result.posted&&result.attempts<=1000);checks++;}
   const ids=definitions.map(d=>d.id);equal((await pool.query('SELECT count(*)::int n,count(DISTINCT (recurring_transaction_id,recurring_occurrence_date))::int distinct_rows FROM expense_tracker.transactions WHERE recurring_transaction_id=ANY($1::uuid[])',[ids])).rows[0],{n:128,distinct_rows:128});equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.recurring_transactions WHERE id=ANY($1::uuid[]) AND next_occurrence IS NOT NULL',[ids])).rows[0].n,0);equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions t JOIN expense_tracker.recurring_transactions r ON r.id=t.recurring_transaction_id WHERE t.user_id<>r.user_id')).rows[0].n,0);equal((await admin.query("SELECT deadlocks::int n FROM pg_stat_database WHERE datname='postgres'")).rows[0].n,before);
  });
  await group('protected cron 1000-global backlog 100-per-definition overlap and retry',async()=>{
   const definitions=[];for(let i=0;i<11;i++)definitions.push(await define(i%2?'a':'b',{startDate:'2026-07-01',endDate:'2026-10-09',amount:'0.01'}));
   for(const credential of [null,'wrong-test-secret',tokens.a]){const r=await fetch(auth.apiOrigin+'/internal/recurring/process',{headers:credential?{Authorization:'Bearer '+credential}:{}});equal(r.status,401);}
   const invoke=async()=>{const r=await fetch(auth.apiOrigin+'/internal/recurring/process',{headers:{Authorization:'Bearer '+cronSecret}});equal(r.status,200);return(await r.json()).data;};
   const start=performance.now(),first=await invoke();timings.push({name:'cron 1000 posts',durationMs:Math.round(performance.now()-start)});equal([first.attempts,first.posted,first.hasRemaining,first.limitReached],[1000,1000,true,true]);
   const overlap=await Promise.all([invoke(),invoke()]);let remainingPosted=overlap.reduce((n,r)=>n+r.posted,0);for(let i=0;i<4;i++){const continuation=await invoke();remainingPosted+=continuation.posted;if(!continuation.hasRemaining)break;}equal(remainingPosted,111);equal((await invoke()).posted,0);
   for(const def of definitions)await expectPosting(def,dates('2026-07-01',101),null);
   // Each definition has 101 due dates, forcing both invocation ceilings to participate.
   equal((await pool.query("SELECT count(*)::int n FROM expense_tracker.recurring_occurrences WHERE occurrence_date>'2026-10-15'")).rows[0].n,0);await reconcile();await reconcile('b');
  });
  await group('restart fixture contains durable pending rows without financial effects',async()=>{
   state.crashReserve=await define();state.crashPost=await define();state.crashPostOccurrence=await ledger.reserveOccurrence(users.a.userId,state.crashPost.id,'2026-10-15');await reconcile();await reconcile('b');writeFileSync(stateFile,JSON.stringify(state));
  });
 }
 const log=JSON.stringify(logs);for(const secret of [cronSecret,tokens.a,tokens.b,url.href,'T61 synthetic schedule'])equal(log.includes(secret),false,'safe logs');
 writeFileSync(resolve(output,(mode==='initial'?'initial':'recover')+'.json'),JSON.stringify({groups:counts,checks,timings,safeCronLogEntries:logs.length,failures:0,remoteTouched:false},null,2)+'\n');console.log(JSON.stringify({phase:mode,groups:counts.length,checks,failures:0}));
}finally{await auth.close();await pool.end();await admin.end();}

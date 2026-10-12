import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {Client,Pool} from 'pg';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {createRecurringOccurrenceService} from '../dist/services/recurring-occurrences.js';
import {createRecurringService} from '../dist/services/recurring.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createAccountBalanceRepository} from '../dist/services/account-balances.js';
import {validateRecurringBody} from '../dist/validators/recurring.js';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,financialSnapshot,createTestAuthHarness} from './helpers/v2-isolation.mjs';

test('T31 validates date, scopes, mandatory ceilings and deadline predicate before connecting',async()=>{
  const processor=createRecurringProcessor({query:()=>assert.fail('query'),connect:()=>assert.fail('connect')});
  for(const input of [null,[],{}, {referenceDate:'2025-02-29'}, {referenceDate:'2025-10-09',userId:'bad'}, {referenceDate:'2025-10-09',definitionId:'bad'}, ...[0,-1,101,1.1,'1'].map(maxPerDefinition=>({referenceDate:'2025-10-09',maxPerDefinition})), ...[0,1001,NaN].map(maxAttempts=>({referenceDate:'2025-10-09',maxAttempts})), {referenceDate:'2025-10-09',shouldStop:true},{referenceDate:'2025-10-09',user:'bad'}])await assert.rejects(processor.processDueRecurring(input));
});

test('T31 failed rollback discards the client and never replaces the original failure',async()=>{
  let released;const failure=new Error('first failure'),calls=[];
  const database={query:async sql=>sql.startsWith('SELECT EXISTS')?{rows:[{remaining:true}]}:{rows:[{id:randomUUID(),userId:randomUUID()}]},connect:async()=>({query:async sql=>{calls.push(sql);if(sql==='BEGIN')throw failure;throw new Error('rollback failure');},release:value=>released=value})};
  const result=await createRecurringProcessor(database).processDueRecurring({referenceDate:'2025-10-09'});
  assert.equal(result.failed,1);assert.equal(result.hasRemaining,true);assert.equal(released,true);assert.deepEqual(calls,['BEGIN','ROLLBACK']);
});

test('T31 disposable runtime processor, calendar, money, recovery, contention and bounded workload',{
  skip:!process.env.T31_DISPOSABLE_DATABASE_URL&&'Requires a fresh explicitly guarded loopback PostgreSQL cluster',
},async()=>{
  const url=disposableIsolationUrl(process.env.T31_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();
  let pool,auth,checks=0,races=0,faults=0;
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  try{
    await prepareIsolationDatabase(admin);const a={userId:randomUUID()},b={userId:randomUUID()};for(const user of [a,b])await createTestUser(admin,user);
    url.username='expense_tracker_app';pool=new Pool({connectionString:url.href,max:12});
    const processor=()=>createRecurringProcessor(pool),ledger=()=>createRecurringOccurrenceService(pool),balances=()=>createAccountBalanceRepository(pool),accounts=()=>createAccountService(pool);
    const account=await accounts().createAccount(a.userId,{name:'T31 cash',type:'cash',openingBalance:'0.00'}),accountB=await accounts().createAccount(b.userId,{name:'T31 B cash',type:'cash',openingBalance:'0.00'});
    const category='c1200000-0000-4000-8000-000000000001',expenseCategory='c1200000-0000-4000-8000-000000000004';
    const input=(overrides={})=>({accountId:account.id,categoryId:category,type:'income',amount:'0.10',description:'T31 recurring',frequency:'daily',startDate:'2025-10-07',endDate:null,...overrides});
    const definitions=()=>createRecurringService(pool,{now:()=>new Date('1900-01-01T12:00:00Z')});
    const define=async(overrides={},user=a)=>definitions().createRecurring(user.userId,validateRecurringBody(input(overrides)));
    const run=(id,referenceDate='2025-10-10',extra={})=>processor().processDueRecurring({referenceDate,definitionId:id,...extra});
    const row=async id=>(await pool.query("SELECT status,to_char(next_occurrence,'YYYY-MM-DD') date FROM expense_tracker.recurring_transactions WHERE id=$1",[id])).rows[0];
    const transactions=async id=>(await pool.query(`SELECT user_id,account_id,category_id,type,amount::text amount,description,to_char(transaction_date,'YYYY-MM-DD') date,
      recurring_transaction_id,to_char(recurring_occurrence_date,'YYYY-MM-DD') occurrence FROM expense_tracker.transactions WHERE recurring_transaction_id=$1 ORDER BY transaction_date`,[id])).rows;
    const terminalSnapshot=async id=>(await pool.query("SELECT to_jsonb(o) row FROM expense_tracker.recurring_occurrences o WHERE recurring_transaction_id=$1 ORDER BY occurrence_date",[id])).rows;
    const daily=await define({endDate:'2025-10-10'});const single=await run(daily.id,'2025-10-07');equal(single.posted,1);equal(single.attempts,1);equal((await row(daily.id)).date,'2025-10-08');
    const catchup=await run(daily.id);equal(catchup.posted,3);equal(catchup.attempts,3);equal(catchup.hasRemaining,false);equal((await row(daily.id)).date,null);
    const dailyRows=await transactions(daily.id);equal(dailyRows.map(t=>t.date),['2025-10-07','2025-10-08','2025-10-09','2025-10-10']);
    for(const t of dailyRows){equal(t.occurrence,t.date);equal(t.user_id,a.userId);equal(t.account_id,account.id);equal(t.category_id,category);equal(t.amount,'0.10');equal(t.description,'T31 recurring');equal(t.type,'income');equal(t.recurring_transaction_id,daily.id);}
    const immutable=await financialSnapshot(pool);equal((await run(daily.id)).attempts,0);equal(await financialSnapshot(pool),immutable);
    equal((await balances().getAccountSummary(a.userId,account.id)).totalIncome,'0.40');equal((await balances().getNetPosition(a.userId)).netPosition,'0.40');
    for(const [overrides,reference,dates] of [
      [{frequency:'weekly',startDate:'2025-09-25',endDate:'2025-10-10'},'2025-10-10',['2025-09-25','2025-10-02','2025-10-09']],
      [{frequency:'monthly',startDate:'2025-01-31',endDate:'2025-04-30'},'2025-05-01',['2025-01-31','2025-02-28','2025-03-31','2025-04-30']],
      [{frequency:'yearly',startDate:'2020-02-29',endDate:'2024-02-29'},'2024-03-01',['2020-02-29','2021-02-28','2022-02-28','2023-02-28','2024-02-29']],
    ]){const def=await define(overrides);equal((await run(def.id,reference)).posted,dates.length);equal((await transactions(def.id)).map(t=>t.date),dates);equal((await row(def.id)).date,null);}
    // Exact financial effects are computed exclusively by T18/PostgreSQL.
    const moneyAccount=await accounts().createAccount(a.userId,{name:'T31 precise',type:'cash',openingBalance:'0.00'});
    for(const amount of ['0.10','0.20','999999999.99']){const def=await define({accountId:moneyAccount.id,amount,endDate:'2025-10-07'});equal((await run(def.id)).posted,1);equal((await transactions(def.id))[0].amount,amount);equal((await run(def.id)).posted,0);}
    const exp=await define({accountId:moneyAccount.id,type:'expense',categoryId:expenseCategory,amount:'0.20',endDate:'2025-10-07'});equal((await run(exp.id)).posted,1);
    equal(await balances().getAccountSummary(a.userId,moneyAccount.id),{currentBalance:'1000000000.09',openingBalance:'0.00',totalIncome:'1000000000.29',totalExpenses:'0.20',incomingTransfers:'0.00',outgoingTransfers:'0.00',currency:'EGP'});
    // Pre-existing posted/skipped, deleted financial row, pending and explicit failed recovery.
    const history=await define({endDate:'2025-10-10'});await ledger().reserveOccurrence(a.userId,history.id,'2025-10-07');const posted=await ledger().postOccurrence(a.userId,history.id,'2025-10-07');
    auth=await createTestAuthHarness(pool);const token=await auth.createTestAuthToken(a);equal((await auth.rawRequest(token,'/transactions/'+posted.generatedTransactionId,'DELETE')).status,204);
    await ledger().reserveOccurrence(a.userId,history.id,'2025-10-08');await ledger().transitionOccurrence(a.userId,history.id,'2025-10-08','skip');
    await ledger().reserveOccurrence(a.userId,history.id,'2025-10-09');await ledger().transitionOccurrence(a.userId,history.id,'2025-10-09','fail','POSTING_FAILED');
    const oldTerminals=(await terminalSnapshot(history.id)).slice(0,2),handled=await run(history.id);equal(handled.alreadyTerminal,1);equal(handled.posted,0);equal(handled.failed,1);equal((await row(history.id)).date,'2025-10-09');equal((await transactions(history.id)).length,0);equal((await terminalSnapshot(history.id)).slice(0,2),oldTerminals);
    equal((await run(history.id)).failed,1);await ledger().transitionOccurrence(a.userId,history.id,'2025-10-09','retry');equal((await run(history.id)).posted,2);equal((await terminalSnapshot(history.id)).slice(0,2),oldTerminals);
    const skippedOnly=await define({endDate:'2025-10-07'});await ledger().reserveOccurrence(a.userId,skippedOnly.id,'2025-10-07');await ledger().transitionOccurrence(a.userId,skippedOnly.id,'2025-10-07','skip');const skipStats=await run(skippedOnly.id);equal(skipStats.skipped,1);equal(skipStats.alreadyTerminal,1);equal((await row(skippedOnly.id)).date,null);
    const pending=await define({endDate:'2025-10-07'});const reservation=await ledger().reserveOccurrence(a.userId,pending.id,'2025-10-07');await auth.close();auth=null;await pool.end();pool=new Pool({connectionString:url.href,max:12});
    equal((await run(pending.id)).posted,1);equal((await ledger().getOccurrence(a.userId,pending.id,'2025-10-07')).id,reservation.id);
    // Paused/archived/exhausted and future definitions are ignored; restored parents do not resume.
    for(const action of ['pauseRecurring','archiveRecurring']){const def=await define();await definitions()[action](a.userId,def.id);equal((await run(def.id)).attempts,0);equal((await transactions(def.id)).length,0);}
    const future=await define({startDate:'2025-10-11'});equal((await run(future.id)).attempts,0);
    const pauseGap=await define();await definitions().pauseRecurring(a.userId,pauseGap.id);const laterLifecycle=createRecurringService(pool,{now:()=>new Date('2025-10-09T12:00:00Z')});await laterLifecycle.resumeRecurring(a.userId,pauseGap.id);equal((await run(pauseGap.id)).posted,2);equal((await transactions(pauseGap.id)).map(t=>t.date),['2025-10-09','2025-10-10']);
    const lateCreation=await laterLifecycle.createRecurring(a.userId,validateRecurringBody(input({startDate:'1900-01-01'})));equal((await run(lateCreation.id)).posted,2);equal((await transactions(lateCreation.id)).map(t=>t.date),['2025-10-09','2025-10-10']);
    // Optional owner scope cannot select another user's definition. Global discovery trusts stored owner.
    const ownedB=await define({accountId:accountB.id,endDate:'2025-10-07'},b);equal((await run(ownedB.id,'2025-10-10',{userId:a.userId})).attempts,0);equal((await run(ownedB.id)).posted,1);equal((await transactions(ownedB.id))[0].user_id,b.userId);equal((await balances().getNetPosition(b.userId)).netPosition,'0.10');
    const concurrentA=await define({endDate:'2025-10-07'}),concurrentB=await define({accountId:accountB.id,endDate:'2025-10-07'},b);
    const concurrentOwners=await Promise.all([run(concurrentA.id),run(concurrentB.id)]);equal(concurrentOwners.map(r=>r.posted),[1,1]);equal((await transactions(concurrentA.id))[0].user_id,a.userId);equal((await transactions(concurrentB.id))[0].user_id,b.userId);
    for(const date of ['2025-04-24','2025-04-25','2025-10-30','2025-10-31']){const def=await define({startDate:date,endDate:date});equal((await run(def.id,date)).posted,1);equal((await transactions(def.id))[0].date,date);}
    // Failed state does not starve another due definition in the same invocation.
    const failureUser={userId:randomUUID()};await createTestUser(admin,failureUser);const failureAccount=await accounts().createAccount(failureUser.userId,{name:'Failure continuation',type:'cash',openingBalance:'0.00'});
    const blocked=await define({accountId:failureAccount.id,endDate:'2025-10-07'},failureUser),healthy=await define({accountId:failureAccount.id,startDate:'2025-10-08',endDate:'2025-10-08'},failureUser);
    await ledger().reserveOccurrence(failureUser.userId,blocked.id,'2025-10-07');await ledger().transitionOccurrence(failureUser.userId,blocked.id,'2025-10-07','fail','POSTING_FAILED');
    const continued=await processor().processDueRecurring({referenceDate:'2025-10-10',userId:failureUser.userId});equal(continued.posted,1);equal(continued.failed,1);equal(continued.hasRemaining,true);equal((await transactions(healthy.id)).length,1);
    // Deadline interruption after two commits is durable across pool/process reconstruction.
    const crash=await define({startDate:'2025-10-01',endDate:'2025-10-05'});let commits=0;
    const countCommit={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,args)=>{const result=await client.query(sql,args);if(sql==='COMMIT')commits++;return result;},release:client.release.bind(client)};}};
    const firstCrash=await createRecurringProcessor(countCommit).processDueRecurring({referenceDate:'2025-10-05',definitionId:crash.id,shouldStop:()=>commits>=4});equal(firstCrash.posted,2);equal(firstCrash.deadlineReached,true);equal((await row(crash.id)).date,'2025-10-03');
    await pool.end();pool=new Pool({connectionString:url.href,max:12});equal((await run(crash.id,'2025-10-05')).posted,3);equal((await transactions(crash.id)).length,5);
    const stoppedClaim=await define({endDate:'2025-10-07'}),beforeStop=await financialSnapshot(pool);
    const stoppedBefore=await run(stoppedClaim.id,'2025-10-10',{shouldStop:()=>true});equal(stoppedBefore.attempts,0);equal(stoppedBefore.hasRemaining,true);equal(await financialSnapshot(pool),beforeStop);
    let claimCommits=0;const stopClaimDatabase={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,args)=>{const result=await client.query(sql,args);if(sql==='COMMIT')claimCommits++;return result;},release:client.release.bind(client)};}};
    const stoppedAfter=await createRecurringProcessor(stopClaimDatabase).processDueRecurring({referenceDate:'2025-10-10',definitionId:stoppedClaim.id,shouldStop:()=>claimCommits>=1});equal(stoppedAfter.deadlineReached,true);equal(stoppedAfter.posted,0);equal((await ledger().getOccurrence(a.userId,stoppedClaim.id,'2025-10-07')).status,'pending');equal((await run(stoppedClaim.id)).posted,1);
    // Explicit references choose dates; the existing database still rejects future financial writes.
    // Fault injection covers both reservation and posting transactions, plus uncertain commit.
    const faultDatabase=(pattern,{after=true,commitNumber,code}={})=>({query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();let fired=false;return {query:async(sql,args)=>{
      const match=!fired&&pattern.test(sql)&&(!commitNumber||++commitNumber.seen===commitNumber.target);
      if(match&&!after){fired=true;throw Object.assign(new Error('T31 private injected failure'),{code});}
      const result=await client.query(sql,args);if(match){fired=true;throw Object.assign(new Error('T31 private injected failure'),{code});}return result;
    },release:client.release.bind(client)};}});
    for(const [label,pattern,after,phase] of [
      ['definition lock',/FROM expense_tracker.recurring_transactions WHERE id=\$1 AND user_id=\$2 FOR UPDATE/,true,'claim'],
      ['reservation',/INSERT INTO expense_tracker.recurring_occurrences/,true,'claim'],
      ['transaction insert',/INSERT INTO expense_tracker.transactions/,true,'post'],
      ['post before advance',/UPDATE expense_tracker.recurring_occurrences SET status='posted'/,true,'post'],
      ['cursor update',/UPDATE expense_tracker.recurring_transactions SET next_occurrence=\$3/,true,'post'],
      ['before cursor update',/UPDATE expense_tracker.recurring_transactions SET next_occurrence=\$3/,false,'post'],
    ]){
      const def=await define({endDate:'2025-10-07'}),beforeFinancial=await balances().getNetPosition(a.userId),beforeDef=await row(def.id),beforeState=await financialSnapshot(pool);
      const stats=await createRecurringProcessor(faultDatabase(pattern,{after})).processDueRecurring({referenceDate:'2025-10-10',definitionId:def.id});equal(stats.failed,1);equal((await transactions(def.id)).length,0);equal(await row(def.id),beforeDef);equal(await balances().getNetPosition(a.userId),beforeFinancial);
      const afterState=await financialSnapshot(pool);for(const table of ['accounts','transactions','transfers','recurring_transactions'])equal(afterState[table],beforeState[table]);
      const occurrence=await ledger().getOccurrence(a.userId,def.id,'2025-10-07');equal(occurrence?.status??null,phase==='claim'?null:'failed');
      if(occurrence?.status==='failed')await ledger().transitionOccurrence(a.userId,def.id,'2025-10-07','retry');
      equal((await run(def.id)).posted,1);equal((await transactions(def.id)).length,1);equal((await run(def.id)).posted,0);faults++;assert.ok(label);
    }
    for(const [target,after] of [[1,false],[2,false],[1,true],[2,true]]){
      const def=await define({endDate:'2025-10-07'}),commitNumber={seen:0,target};
      const stats=await createRecurringProcessor(faultDatabase(/^COMMIT$/,{after,commitNumber})).processDueRecurring({referenceDate:'2025-10-10',definitionId:def.id});equal(stats.failed,1);
      const occurrence=await ledger().getOccurrence(a.userId,def.id,'2025-10-07');equal(occurrence?.status??null,after?(target===1?'pending':'posted'):(target===1?null:'failed'));
      if(occurrence?.status==='failed')await ledger().transitionOccurrence(a.userId,def.id,'2025-10-07','retry');
      await run(def.id);equal((await transactions(def.id)).length,1);equal((await row(def.id)).date,null);equal((await run(def.id)).attempts,0);faults++;
    }
    const databaseAbort=await define({endDate:'2025-10-07'}),abortBefore=await balances().getNetPosition(a.userId);
    const abortDatabase={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,args)=>{const result=await client.query(sql,args);if(sql.startsWith('INSERT INTO expense_tracker.transactions'))await client.query('SELECT 1/0');return result;},release:client.release.bind(client)};}};
    const aborted=await createRecurringProcessor(abortDatabase).processDueRecurring({referenceDate:'2025-10-10',definitionId:databaseAbort.id});equal(aborted.recordedFailures,1);equal((await transactions(databaseAbort.id)).length,0);equal(await balances().getNetPosition(a.userId),abortBefore);equal((await ledger().getOccurrence(a.userId,databaseAbort.id,'2025-10-07')).failureCode,'POSTING_FAILED');
    await ledger().transitionOccurrence(a.userId,databaseAbort.id,'2025-10-07','retry');equal((await run(databaseAbort.id)).posted,1);faults++;
    const recordingOutage=await define({endDate:'2025-10-07'});let postingFailed=false,recordingFailed=false;
    const outageDatabase={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,args)=>{
      if(!postingFailed&&sql.startsWith('INSERT INTO expense_tracker.transactions')){postingFailed=true;throw new Error('sanitized posting failure');}
      if(postingFailed&&!recordingFailed&&sql.includes('FROM expense_tracker.recurring_occurrences')&&sql.endsWith('FOR UPDATE')){recordingFailed=true;throw Object.assign(new Error('private database URL'),{code:'ECONNRESET'});}
      return client.query(sql,args);
    },release:client.release.bind(client)};}};
    const outageStats=await createRecurringProcessor(outageDatabase).processDueRecurring({referenceDate:'2025-10-10',definitionId:recordingOutage.id});equal(outageStats.failed,1);equal(outageStats.recordedFailures,0);equal(outageStats.failureRecordingErrors,1);equal((await ledger().getOccurrence(a.userId,recordingOutage.id,'2025-10-07')).status,'pending');equal((await run(recordingOutage.id)).posted,1);faults++;
    // Invalid parent outcomes are failed only while still active; archival pause wins over failure recording.
    const bad=await define({endDate:'2025-10-07'});
    const invalidParent={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,args)=>{
      const result=await client.query(sql,args);if(sql.startsWith('SELECT status FROM expense_tracker.accounts'))return {rows:[{status:'archived'}]};return result;
    },release:client.release.bind(client)};}};
    const invalidStats=await createRecurringProcessor(invalidParent).processDueRecurring({referenceDate:'2025-10-10',definitionId:bad.id});equal(invalidStats.failed,1);equal(invalidStats.recordedFailures,1);equal((await ledger().getOccurrence(a.userId,bad.id,'2025-10-07')).failureCode,'INVALID_REFERENCE');equal((await transactions(bad.id)).length,0);
    for(const invalidKind of ['archived','incompatible','foreign']){
      const def=await define({endDate:'2025-10-07'});
      const categoryFault={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,args)=>{const result=await client.query(sql,args);if(sql.startsWith('SELECT status,kind FROM expense_tracker.categories'))return {rows:invalidKind==='foreign'?[]:[{status:invalidKind==='archived'?'archived':'active',kind:invalidKind==='incompatible'?'expense':'income'}]};return result;},release:client.release.bind(client)};}};
      const stats=await createRecurringProcessor(categoryFault).processDueRecurring({referenceDate:'2025-10-10',definitionId:def.id});equal(stats.recordedFailures,1);equal((await transactions(def.id)).length,0);equal((await ledger().getOccurrence(a.userId,def.id,'2025-10-07')).failureCode,'INVALID_REFERENCE');assert.doesNotMatch(JSON.stringify(stats),/private|SQL|injected|postgresql/);
    }
    // Real row waits: processors serialize, and lifecycle winners determine financial outcome.
    async function contend(first,second,pattern){
      let signal,release,firstPid,secondPid;const ready=new Promise(resolve=>signal=resolve),gate=new Promise(resolve=>release=resolve);
      const wrap=isFirst=>({query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();if(isFirst)firstPid=client.processID;else secondPid=client.processID;let gated=false;return {query:async(sql,args)=>{const result=await client.query(sql,args);if(isFirst&&!gated&&pattern.test(sql)){gated=true;signal();await gate;}return result;},release:client.release.bind(client)};}});
      const one=first(wrap(true));await ready;const two=second(wrap(false));const results=Promise.allSettled([one,two]);
      try{let observed=false;for(let attempt=0;attempt<300;attempt++){if(secondPid&&(await admin.query('SELECT $1::int=ANY(pg_blocking_pids($2)) AS blocked',[firstPid,secondPid])).rows[0].blocked){observed=true;break;}await delay(10);}equal(observed,true);}finally{release();}
      const outcomes=await results;for(const result of outcomes)equal(result.status,'fulfilled');races++;return outcomes;
    }
    const claimLock=/FROM expense_tracker.recurring_transactions WHERE id=\$1 AND user_id=\$2 FOR UPDATE/;
    const double=await define({endDate:'2025-10-07'});const processDouble=db=>createRecurringProcessor(db).processDueRecurring({referenceDate:'2025-10-10',definitionId:double.id});
    await contend(processDouble,processDouble,claimLock);equal((await transactions(double.id)).length,1);equal((await terminalSnapshot(double.id)).length,1);equal((await row(double.id)).date,null);
    const one=await define({endDate:'2025-10-07'}),two=await define({endDate:'2025-10-07'});
    await contend(db=>createRecurringProcessor(db).processDueRecurring({referenceDate:'2025-10-10',definitionId:one.id}),db=>createRecurringProcessor(db).processDueRecurring({referenceDate:'2025-10-10',definitionId:two.id}),/INSERT INTO expense_tracker.transactions/);equal((await transactions(one.id)).length,1);equal((await transactions(two.id)).length,1);
    for(const action of ['pauseRecurring','archiveRecurring','updateRecurring'])for(const processFirst of [false,true]){
      const def=await define({endDate:'2025-10-07'});await ledger().reserveOccurrence(a.userId,def.id,'2025-10-07');
      const processOperation=db=>createRecurringProcessor(db).processDueRecurring({referenceDate:'2025-10-10',definitionId:def.id});
      const lifecycle=db=>createRecurringService(db,{now:()=>new Date('2025-10-07T12:00:00Z')})[action](a.userId,def.id,...(action==='updateRecurring'?[validateRecurringBody(input({amount:'0.20',categoryId:'c1200000-0000-4000-8000-000000000002',description:'New coherent state',endDate:'2025-10-07'}))]:[]));
      await contend(processFirst?processOperation:lifecycle,processFirst?lifecycle:processOperation,processFirst?/INSERT INTO expense_tracker.transactions/:/FOR UPDATE OF r/);
      const tx=await transactions(def.id);equal(tx.length,processFirst?1:0);if(tx.length){equal(tx[0].amount,'0.10');equal(tx[0].category_id,category);equal(tx[0].description,'T31 recurring');}
      if(action!=='updateRecurring')equal((await row(def.id)).status,action==='pauseRecurring'?'paused':'archived');else equal((await row(def.id)).date,null);
    }
    for(const processFirst of [false,true]){
      const parent=await accounts().createAccount(a.userId,{name:'Processor archive race '+processFirst,type:'cash',openingBalance:'0.00'}),def=await define({accountId:parent.id,endDate:'2025-10-07'});await ledger().reserveOccurrence(a.userId,def.id,'2025-10-07');
      const processOperation=db=>createRecurringProcessor(db).processDueRecurring({referenceDate:'2025-10-10',definitionId:def.id}),archive=db=>createAccountService(db).archiveAccount(a.userId,parent.id);
      await contend(processFirst?processOperation:archive,processFirst?archive:processOperation,processFirst?/INSERT INTO expense_tracker.transactions/:/SELECT opening_balance,opening_balance_locked,type,status/);equal((await transactions(def.id)).length,processFirst?1:0);equal((await row(def.id)).status,'paused');
    }
    for(const processFirst of [false,true]){
      const custom=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,$2,'income') RETURNING id",[a.userId,'T31 category race '+processFirst])).rows[0].id;
      const def=await define({categoryId:custom,endDate:'2025-10-07'});await ledger().reserveOccurrence(a.userId,def.id,'2025-10-07');
      const processOperation=db=>createRecurringProcessor(db).processDueRecurring({referenceDate:'2025-10-10',definitionId:def.id});
      const archive=async db=>{const client=await db.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM expense_tracker.categories WHERE id=$1 FOR UPDATE',[custom]);await client.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[custom]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
      await contend(processFirst?processOperation:archive,processFirst?archive:processOperation,processFirst?/INSERT INTO expense_tracker.transactions/:/SELECT id FROM expense_tracker.categories/);equal((await transactions(def.id)).length,processFirst?1:0);equal((await row(def.id)).status,'paused');
    }
    // Per-definition ceiling leaves durable backlog; custom smaller budgets do the same.
    const long=await define({startDate:'2025-01-01',endDate:'2025-12-31'}),first=await run(long.id,'2025-12-31');equal(first.posted,100);equal(first.attempts,100);equal(first.limitReached,true);equal(first.hasRemaining,true);equal((await row(long.id)).date,'2025-04-11');
    const second=await run(long.id,'2025-12-31',{maxPerDefinition:2});equal(second.posted,2);equal(second.limitReached,true);equal((await row(long.id)).date,'2025-04-13');
    // Representative global scan: 40 users, 2,000 schedules, a mixed indexed due set.
    const scaleStart=performance.now();const scaleUsers=[];
    for(let i=0;i<40;i++){const user={userId:randomUUID()};await createTestUser(admin,user);const parent=await accounts().createAccount(user.userId,{name:'T31 scale '+i,type:'cash',openingBalance:'0.00'});scaleUsers.push({...user,accountId:parent.id});
      await pool.query(`INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence,end_date)
        SELECT $1,$2,$3,'income',0.10,'T31 scale','daily','2025-10-07',CASE WHEN n<=30 THEN DATE '2025-10-07' ELSE DATE '2025-11-01' END,DATE '2025-11-01' FROM generate_series(1,50) n`,[user.userId,parent.id,category]);}
    // Isolate the representative global workload by making earlier A/B fixtures inactive through T29.
    const active=(await pool.query("SELECT id,user_id FROM expense_tracker.recurring_transactions WHERE status='active' AND user_id=ANY($1::uuid[])",[[a.userId,b.userId,failureUser.userId]])).rows;
    for(const r of active)await definitions().archiveRecurring(r.user_id,r.id);
    await admin.query('ANALYZE expense_tracker.recurring_transactions');const plan=await pool.query("EXPLAIN (ANALYZE,FORMAT JSON) SELECT id,user_id FROM expense_tracker.recurring_transactions WHERE status='active' AND next_occurrence IS NOT NULL AND next_occurrence <= '2025-10-07' ORDER BY next_occurrence,id LIMIT 1000");
    const started=performance.now(),global=await processor().processDueRecurring({referenceDate:'2025-10-07'}),elapsedMs=performance.now()-started;
    equal(global.attempts,1000);equal(global.posted,1000);equal(global.limitReached,true);equal(global.hasRemaining,true);
    const continuedGlobal=await processor().processDueRecurring({referenceDate:'2025-10-07'});equal(continuedGlobal.posted,200);equal(continuedGlobal.hasRemaining,false);equal(continuedGlobal.limitReached,false);equal((await processor().processDueRecurring({referenceDate:'2025-10-07'})).posted,0);
    equal((await pool.query("SELECT count(*)::int count,sum(amount)::text amount FROM expense_tracker.transactions WHERE description='T31 scale'")).rows[0],{count:1200,amount:'120.00'});
    for(const user of scaleUsers){equal((await balances().getAccountSummary(user.userId,user.accountId)).totalIncome,'3.00');equal((await balances().getNetPosition(user.userId)).netPosition,'3.00');}
    equal((await pool.query('SELECT count(*)::int count FROM expense_tracker.transfers')).rows[0].count,0);
    equal((await pool.query("SELECT count(*)::int count FROM expense_tracker.transactions t JOIN expense_tracker.recurring_transactions r ON r.id=t.recurring_transaction_id WHERE t.user_id<>r.user_id OR t.transaction_date<>t.recurring_occurrence_date")).rows[0].count,0);
    process.stdout.write(`T31 integration: ${checks} checks; ${races} forced races; ${faults} rollback/lost-ack probes. Scale: 40 users, 2000 definitions, 1200 due/800 future; 1000 attempts in ${elapsedMs.toFixed(1)} ms; fixture+verification ${(performance.now()-scaleStart).toFixed(1)} ms; due scan ${plan.rows[0]['QUERY PLAN'][0]['Execution Time']} ms.\n`);
  }finally{if(auth)await auth.close();if(pool)await pool.end();await admin.end();}
});

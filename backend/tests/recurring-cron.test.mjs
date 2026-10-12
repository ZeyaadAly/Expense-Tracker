import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import process from 'node:process';
import {setTimeout} from 'node:timers';
import {performance} from 'node:perf_hooks';
import console from 'node:console';
import {Client,Pool} from 'pg';
import {createApp} from '../dist/app.js';
import {RECURRING_CRON_PATH,RECURRING_CRON_BUDGET_MS} from '../dist/routes/recurring-cron.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {createRecurringService} from '../dist/services/recurring.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createAccountBalanceRepository} from '../dist/services/account-balances.js';
import {createRecurringOccurrenceService} from '../dist/services/recurring-occurrences.js';
import {validateRecurringBody} from '../dist/validators/recurring.js';
import {formatDecimal} from '../dist/utils/money.js';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,financialSnapshot,createTestAuthHarness} from './helpers/v2-isolation.mjs';

const secret=randomBytes(32).toString('base64url');
const empty={definitionsVisited:0,attempts:0,posted:0,skipped:0,alreadyTerminal:0,failed:0,conflicts:0,recordedFailures:0,failureRecordingErrors:0,limitReached:false,deadlineReached:false,hasRemaining:false};
async function serve(options){
  const server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,recurringCron:{secret:()=>secret,log:()=>{},...options}}).listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  return {server,origin,run:options=>call(origin,options),close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
async function call(origin,{method='GET',path=RECURRING_CRON_PATH,authorization=`Bearer ${secret}`,body,headers={}}={}){
  // node:http permits GET bodies and duplicate headers, unlike fetch.
  return new Promise((resolve,reject)=>{
    const request=httpRequest(origin,{path,method,headers:{...(authorization===null?{}:{Authorization:authorization}),...(body===undefined||headers['Transfer-Encoding']?{}:{'Content-Length':Buffer.byteLength(body)}),...headers}},response=>{
      let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:text?JSON.parse(text):null}));
    });request.on('error',reject);request.end(body);
  });
}

test('T33 real HTTP rejects credentials, methods, query/body controls and lazy bad configuration',async()=>{
  let calls=0;const logs=[];const app=await serve({processor:{processDueRecurring:async()=>{calls++;return empty;}},log:entry=>logs.push(entry)});
  try{
    for(const authorization of [null,'',`Bearer ${secret}x`,'Bearer user.jwt.token',`Basic ${secret}`,secret]){
      const response=await app.run({authorization});assert.equal(response.status,401);assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.headers.location,undefined);assert.equal(response.body.error.code,'UNAUTHORIZED');assert.ok(!JSON.stringify(response).includes(secret));
    }
    assert.equal((await app.run({headers:{Authorization:[`Bearer ${secret}`,`Bearer ${secret}`]}})).status,401);
    for(const method of ['HEAD','POST','PUT','PATCH','DELETE','OPTIONS']){const response=await app.run({method});assert.equal(response.status,405);assert.equal(response.headers.allow,'GET');assert.equal(response.headers['cache-control'],'no-store');}
    for(const path of [RECURRING_CRON_PATH+'?userId='+randomUUID(),RECURRING_CRON_PATH+'?referenceDate=1900-01-01',RECURRING_CRON_PATH+'?maxAttempts=1',RECURRING_CRON_PATH+'?',RECURRING_CRON_PATH+'/'])assert.equal((await app.run({path})).status,400);
    for(const headers of [{},{'Transfer-Encoding':'chunked','Content-Length':undefined}])assert.equal((await app.run({body:'{"userId":"ignored"}',headers:Object.fromEntries(Object.entries(headers).filter(([,v])=>v!==undefined))})).status,400);
    assert.equal(calls,0);assert.equal(logs.length,0);
    const valid=await app.run({headers:{Origin:'https://untrusted.invalid','X-Request-ID':'untrusted-id','X-Vercel-Cron-Schedule':'anything'}});assert.equal(valid.status,200);assert.equal(valid.headers['access-control-allow-origin'],undefined);assert.match(valid.body.data.requestId,/^[0-9a-f-]{36}$/);assert.equal(valid.headers['x-request-id'],valid.body.data.requestId);assert.equal(calls,1);
  }finally{await app.close();}
  for(const config of [undefined,'','short',' '.repeat(40),'x'.repeat(32)+'\n']){
    const unconfigured=await serve({secret:()=>config,processor:{processDueRecurring:async()=>{throw new Error('must not run');}}});
    try{assert.equal((await unconfigured.run()).status,503);for(const path of ['/api/v1/health','/api/v2/health'])assert.equal((await unconfigured.run({path,authorization:null})).status,200);}finally{await unconfigured.close();}
  }
});

test('T33 Cairo boundary, fixed limits, deadline, projected counters and sanitized failures over HTTP',async()=>{
  for(const [instant,date] of [['2025-10-08T20:59:59Z','2025-10-08'],['2025-10-08T21:00:00Z','2025-10-09'],['2025-01-08T21:59:59Z','2025-01-08'],['2025-01-08T22:00:00Z','2025-01-09']]){
    let clock=0;const logs=[];const app=await serve({now:()=>new Date(instant),monotonicNow:()=>clock,log:entry=>logs.push(entry),processor:{processDueRecurring:async input=>{
      assert.deepEqual(Object.keys(input).sort(),['maxAttempts','maxPerDefinition','referenceDate','shouldStop']);assert.equal(input.referenceDate,date);assert.equal(input.maxAttempts,1000);assert.equal(input.maxPerDefinition,100);assert.equal(input.shouldStop(),false);clock=RECURRING_CRON_BUDGET_MS;assert.equal(input.shouldStop(),true);return {...empty,deadlineReached:true,hasRemaining:true,privateDescription:'DO_NOT_EXPOSE'};
    }}});
    try{const response=await app.run();assert.equal(response.status,200);assert.equal(response.body.data.referenceDate,date);assert.equal(response.body.data.deadlineReached,true);assert.equal(response.body.data.hasRemaining,true);assert.ok(!JSON.stringify([response,logs]).includes('DO_NOT_EXPOSE'));assert.equal(logs.length,1);}finally{await app.close();}
  }
  for(const [error,status,code,outcome] of [[Object.assign(new Error('secret SQL postgres://private'),{code:'ECONNREFUSED'}),503,'DATABASE_UNAVAILABLE','database_unavailable'],[new Error('secret SQL postgres://private'),500,'INTERNAL_ERROR','internal_error']]){
    const logs=[];const app=await serve({log:entry=>logs.push(entry),processor:{processDueRecurring:async()=>{throw error;}}});
    try{const response=await app.run();assert.equal(response.status,status);assert.equal(response.body.error.code,code);assert.equal(response.headers['cache-control'],'no-store');assert.equal(logs[0].outcome,outcome);assert.ok(!JSON.stringify([response,logs]).includes('private'));}finally{await app.close();}
  }
  const app=await serve({processor:{processDueRecurring:async()=>({...empty,failed:1,failureRecordingErrors:1,hasRemaining:true})}});
  try{const response=await app.run();assert.equal(response.status,500);assert.equal(response.body.error.code,'PROCESSING_FAILED');assert.equal(response.body.meta.processed,false);assert.equal(response.body.meta.failed,1);}finally{await app.close();}
});

test('T33 Vercel release gate, schedule, entry-point and runtime contract',()=>{
  const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const active=JSON.parse(read('vercel.json')),ready=JSON.parse(read('vercel.cron-ready.json'));
  assert.deepEqual(active.crons,[]);assert.deepEqual(ready.crons,[{path:RECURRING_CRON_PATH,schedule:'0 3 * * *'}]);
  for(const config of [active,ready]){assert.equal(config.framework,'express');assert.equal(config.buildCommand,'npm run build');assert.equal(config.functions['server.mjs'].maxDuration,60);assert.ok(RECURRING_CRON_BUDGET_MS<config.functions['server.mjs'].maxDuration*1000);assert.equal(config.functions['server.mjs'].includeFiles,'certs/supabase-ca.crt');}
  assert.match(read('server.mjs'),/export default createApp/);assert.match(read('server.mjs'),/recurringCron: \{processor: createRecurringProcessor\(pool\)\}/);assert.match(read('src/index.ts'),/recurringCron:\{processor:createRecurringProcessor\(pool\)\}/);assert.match(read('.env.example'),/^CRON_SECRET=$/m);
});

test('T33 limited-role real HTTP repeated/overlapping/cold/lost-response/bounded processing and T18 reconciliation',{
  skip:!process.env.T33_DISPOSABLE_DATABASE_URL&&'Requires a fresh explicitly guarded loopback PostgreSQL cluster',
},async()=>{
  const url=disposableIsolationUrl(process.env.T33_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();
  let pool,app,auth;let checks=0;const logs=[];const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  try{
    await prepareIsolationDatabase(admin);url.username='expense_tracker_app';pool=new Pool({connectionString:url.href,max:12});
    equal((await pool.query('SELECT current_user name')).rows[0].name,'expense_tracker_app');
    const a={userId:randomUUID()},b={userId:randomUUID()};for(const user of [a,b])await createTestUser(admin,user);
    const accounts=createAccountService(pool),accountA=await accounts.createAccount(a.userId,{name:'private A cash',type:'cash',openingBalance:'0.00'}),accountB=await accounts.createAccount(b.userId,{name:'private B cash',type:'cash',openingBalance:'0.00'});
    const salary='c1200000-0000-4000-8000-000000000001',food='c1200000-0000-4000-8000-000000000004';
    const define=(overrides={},user=a)=>createRecurringService(pool,{now:()=>new Date('1900-01-01T12:00:00Z')}).createRecurring(user.userId,validateRecurringBody({accountId:user===a?accountA.id:accountB.id,categoryId:salary,type:'income',amount:'0.10',description:'private recurring description',frequency:'daily',startDate:'2025-10-07',endDate:'2025-10-10',...overrides}));
    const open=async options=>{app=await serve({now:()=>new Date('2025-10-10T03:00:00Z'),processor:createRecurringProcessor(pool),log:entry=>logs.push(entry),...options});};
    const count=async id=>(await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions WHERE recurring_transaction_id=$1',[id])).rows[0].n;
    const cursor=async id=>(await pool.query("SELECT to_char(next_occurrence,'YYYY-MM-DD') date FROM expense_tracker.recurring_transactions WHERE id=$1",[id])).rows[0].date;
    const income=await define(),expense=await define({type:'expense',categoryId:food,amount:'0.20'},b);
    const paused=await define(),archived=await define(),exhausted=await define();await createRecurringService(pool).pauseRecurring(a.userId,paused.id);await createRecurringService(pool).archiveRecurring(a.userId,archived.id);await pool.query('UPDATE expense_tracker.recurring_transactions SET next_occurrence=NULL WHERE id=$1',[exhausted.id]);
    await open();const beforeDenied=await financialSnapshot(pool);equal((await app.run({authorization:null})).status,401);equal((await app.run({path:RECURRING_CRON_PATH+'?userId='+a.userId})).status,400);equal(await financialSnapshot(pool),beforeDenied);
    const first=await app.run();equal(first.status,200);equal(first.body.data.posted,8);equal(first.body.data.hasRemaining,false);equal(await count(income.id),4);equal(await count(expense.id),4);for(const definition of [paused,archived,exhausted])equal(await count(definition.id),0);
    const balances=createAccountBalanceRepository(pool);equal(await balances.getAccountSummary(a.userId,accountA.id),{currentBalance:'0.40',openingBalance:'0.00',totalIncome:'0.40',totalExpenses:'0.00',incomingTransfers:'0.00',outgoingTransfers:'0.00',currency:'EGP'});equal(await balances.getNetPosition(b.userId),{netPosition:'-0.80',currency:'EGP'});
    equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions WHERE user_id IS NULL')).rows[0].n,0);equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions t JOIN expense_tracker.recurring_transactions r ON r.id=t.recurring_transaction_id WHERE t.user_id<>r.user_id OR t.account_id<>r.account_id')).rows[0].n,0);
    const snapshot=await financialSnapshot(pool);equal((await app.run()).body.data.posted,0);equal(await financialSnapshot(pool),snapshot);
    await app.close();app=null;await pool.end();pool=new Pool({connectionString:url.href,max:12});await open();equal((await app.run()).body.data.posted,0);equal(await financialSnapshot(pool),snapshot);
    // Force both HTTP invocations to wait behind the same parent lock.
    const overlap=await define({endDate:'2025-10-07'}),locker=await pool.connect();await locker.query('BEGIN');await locker.query('SELECT id FROM expense_tracker.accounts WHERE id=$1 FOR UPDATE',[accountA.id]);
    const waitForBlocked=async minimum=>{for(let i=0;i<200;i++){const n=(await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE usename='expense_tracker_app' AND cardinality(pg_blocking_pids(pid))>0")).rows[0].n;if(n>=minimum)return n;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Expected genuine DB contention');};
    let runs;try{runs=[app.run(),app.run()];assert.ok(await waitForBlocked(2)>=2);checks++;}finally{await locker.query('COMMIT');locker.release();}
    const overlapping=await Promise.all(runs);equal(overlapping.map(r=>r.status),[200,200]);equal(await count(overlap.id),1);equal(await cursor(overlap.id),null);
    // Destroy the client connection after the processor has committed, before HTTP acknowledgement.
    await app.close();app=null;const lost=await define({endDate:'2025-10-07'});let committed;const committedPromise=new Promise(resolve=>committed=resolve);
    await open({processor:{processDueRecurring:async input=>{const result=await createRecurringProcessor(pool).processDueRecurring(input);app.server.closeAllConnections();committed();return result;}}});
    await assert.rejects(app.run());await committedPromise;equal(await count(lost.id),1);await app.close();app=null;await open();equal((await app.run()).body.data.posted,0);equal(await count(lost.id),1);
    // Cooperative deadline immediately after durable reservation; no financial write.
    await app.close();app=null;const deadline=await define({endDate:'2025-10-07'});let commits=0;
    const database={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,args)=>{const result=await client.query(sql,args);if(sql==='COMMIT')commits++;return result;},release:client.release.bind(client)};}};
    await open({processor:createRecurringProcessor(database),monotonicNow:()=>commits?RECURRING_CRON_BUDGET_MS:0});const stopped=await app.run();equal(stopped.status,200);equal(stopped.body.data.deadlineReached,true);equal(stopped.body.data.posted,0);equal(stopped.body.data.hasRemaining,true);equal((await createRecurringOccurrenceService(pool).getOccurrence(a.userId,deadline.id,'2025-10-07')).status,'pending');equal(await cursor(deadline.id),'2025-10-07');await app.close();app=null;await open();equal((await app.run()).body.data.posted,1);
    const perDefinition=await define({startDate:'2025-01-01',endDate:'2025-05-01'});const limited=await app.run();equal(limited.body.data.posted,100);equal(limited.body.data.limitReached,true);equal(limited.body.data.hasRemaining,true);equal(await cursor(perDefinition.id),'2025-04-11');equal((await app.run()).body.data.posted,21);equal(await count(perDefinition.id),121);
    const backlog=[];for(let i=0;i<11;i++)backlog.push(await define({startDate:'2025-01-01',endDate:'2025-04-11'},i%2?a:b));
    const start=performance.now(),batch=await app.run();equal(batch.status,200);equal(batch.body.data.attempts,1000);equal(batch.body.data.posted,1000);equal(batch.body.data.limitReached,true);equal(batch.body.data.hasRemaining,true);for(const definition of backlog)assert.ok(await count(definition.id)<=100);
    const continuation=await app.run();equal(continuation.status,200);equal(continuation.body.data.posted,110);equal(continuation.body.data.hasRemaining,true);const finalBatch=await app.run();equal(finalBatch.body.data.posted,1);equal(finalBatch.body.data.hasRemaining,false);for(const definition of backlog)equal(await count(definition.id),101);
    equal((await pool.query('SELECT count(*)::int n FROM (SELECT recurring_transaction_id,recurring_occurrence_date FROM expense_tracker.transactions GROUP BY 1,2 HAVING count(*)>1) d')).rows[0].n,0);
    const drained=await financialSnapshot(pool);equal((await app.run()).body.data.posted,0);equal(await financialSnapshot(pool),drained);
    // Parent archive wins while the HTTP processor is blocked acquiring its parent lock.
    for(const parent of ['account','category']){
      const account=await createAccountService(pool).createAccount(a.userId,{name:'private race '+parent,type:'cash',openingBalance:'0.00'}),category=randomUUID();await pool.query("INSERT INTO expense_tracker.categories(id,user_id,name,kind) VALUES($1,$2,$3,'income')",[category,a.userId,'private race '+parent]);const definition=await define({accountId:account.id,categoryId:category,endDate:'2025-10-07'});
      const lock=await pool.connect();await lock.query('BEGIN');const table=parent==='account'?'accounts':'categories',id=parent==='account'?account.id:category;await lock.query(`SELECT id FROM expense_tracker.${table} WHERE id=$1 FOR UPDATE`,[id]);const run=app.run();try{assert.ok(await waitForBlocked(1)>=1);checks++;await lock.query(`UPDATE expense_tracker.${table} SET status='archived' WHERE id=$1`,[id]);}finally{await lock.query('COMMIT');lock.release();}const raced=await run;equal(raced.status,500);equal(raced.body.meta.failed,1);equal(await count(definition.id),0);equal(await cursor(definition.id),null);
    }
    // Durable failed records are visible as failed runs; recovery stays explicit T32 work.
    const failure=await define({endDate:'2025-10-07'}),ledger=createRecurringOccurrenceService(pool);await ledger.reserveOccurrence(a.userId,failure.id,'2025-10-07');await ledger.transitionOccurrence(a.userId,failure.id,'2025-10-07','fail','POSTING_FAILED');const failed=await app.run();equal(failed.status,500);equal(failed.body.meta.failed,1);equal(failed.body.meta.hasRemaining,true);equal(await count(failure.id),0);await ledger.transitionOccurrence(a.userId,failure.id,'2025-10-07','retry');equal((await app.run()).body.data.posted,1);
    // Exact SQL accounting comparison with the unchanged T18 repository after all runs.
    for(const [user,account] of [[a,accountA],[b,accountB]]){
      const actual=(await pool.query("SELECT sum(CASE WHEN type='income' THEN amount ELSE -amount END)::text balance,sum(CASE WHEN type='income' THEN amount ELSE 0 END)::text income,sum(CASE WHEN type='expense' THEN amount ELSE 0 END)::text expenses FROM expense_tracker.transactions WHERE user_id=$1 AND account_id=$2",[user.userId,account.id])).rows[0],summary=await createAccountBalanceRepository(pool).getAccountSummary(user.userId,account.id);
      equal(summary.currentBalance,formatDecimal(actual.balance));equal(summary.totalIncome,formatDecimal(actual.income));equal(summary.totalExpenses,formatDecimal(actual.expenses));equal((await createAccountBalanceRepository(pool).getNetPosition(user.userId)).netPosition,formatDecimal(actual.balance));
    }
    // Real refused local connection is 503; no financial state changes.
    const unavailableUrl=new URL(url.href);unavailableUrl.port='55452';const unavailablePool=new Pool({connectionString:unavailableUrl.href,connectionTimeoutMillis:250,max:1});const unavailableApp=await serve({processor:createRecurringProcessor(unavailablePool)});const beforeUnavailable=await financialSnapshot(pool);
    try{const unavailable=await unavailableApp.run();equal(unavailable.status,503);equal(unavailable.body.error.code,'DATABASE_UNAVAILABLE');equal(await financialSnapshot(pool),beforeUnavailable);}finally{await unavailableApp.close();await unavailablePool.end();}
    // A final-query disconnect after committed posting must not be reported successful.
    await app.close();app=null;const interrupted=await define({endDate:'2025-10-07'});const finalQueryFailure={connect:pool.connect.bind(pool),query:async(sql,args)=>{const result=await pool.query(sql,args);if(sql.startsWith('SELECT EXISTS'))throw Object.assign(new Error('private driver payload'),{code:'ECONNRESET'});return result;}};
    await open({processor:createRecurringProcessor(finalQueryFailure)});equal((await app.run()).status,503);equal(await count(interrupted.id),1);await app.close();app=null;await open();equal((await app.run()).body.data.posted,0);equal(await count(interrupted.id),1);
    auth=await createTestAuthHarness(pool,{cursorSigningSecret:randomBytes(32).toString('hex'),recurringCron:{secret:()=>secret,now:()=>new Date('2025-10-10T03:00:00Z'),processor:createRecurringProcessor(pool),log:()=>{}}});const tokenA=await auth.createTestAuthToken(a),tokenB=await auth.createTestAuthToken(b);
    for(const path of ['/api/v1/health','/api/v2/health'])equal((await call(auth.apiOrigin,{path,authorization:null})).status,200);equal((await auth.request(null,'/accounts')).status,401);equal((await auth.request(tokenA,'/accounts')).status,200);equal((await auth.request(tokenB,'/accounts/'+accountA.id)).status,404);equal((await call(auth.apiOrigin,{authorization:'Bearer '+tokenA})).status,401);equal((await call(auth.apiOrigin)).status,200);
    assert.ok(!JSON.stringify(logs).includes(secret));assert.ok(!JSON.stringify(logs).includes('private'));assert.ok(!JSON.stringify(logs).includes(a.userId));checks+=3;
    console.log(JSON.stringify({task:'T33',checks,forcedRaces:3,lostHttpAcknowledgements:1,globalPosts:1111,perDefinitionPosts:121,backlogAndRemainingChecksDurationMs:Math.round(performance.now()-start)}));
  }finally{if(auth)await auth.close();if(app)await app.close();if(pool)await pool.end();await admin.end();}
});

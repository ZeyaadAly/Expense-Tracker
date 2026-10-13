import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {URL,URLSearchParams} from 'node:url';
import {Client,Pool} from 'pg';
import {normalizeAnalyticsRange} from '../dist/domain/analytics-range.js';
import {createAnalyticsService,createAnalyticsRepository} from '../dist/services/analytics.js';
import {createDashboardService} from '../dist/services/dashboard.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {getTransactionTotals} from '../dist/services/transaction-totals.js';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,financialSnapshot,createTestAuthHarness} from './helpers/v2-isolation.mjs';
import {createGeneratedFixture} from './helpers/generated-fixture.mjs';

test('T38 normalized internal ranges are bounded calendar dates; invalid inputs never connect',async()=>{
  const user=randomUUID();let calls=0;const service=createAnalyticsService({connect:async()=>{calls++;throw Error('unexpected');}});
  for(const input of [null,{}, {from:'2025-02-29',to:'2025-03-01'},{from:'2024-01-01',to:'2025-01-01'},{from:'2026-10-02',to:'2026-10-01'},{from:'1899-12-31',to:'1900-01-01'},{from:'2026-01-01',to:'2026-01-01',accountId:'bad'},{from:'2026-01-01',to:'2026-01-01',categoryId:randomUUID()}])await assert.rejects(service.getOverview(user,input),RangeError);
  assert.equal(calls,0);
  for(const [from,to,days] of [['2024-01-01','2024-12-31',366],['1900-02-28','1900-03-01',2],['2000-02-28','2000-03-01',3],['9999-12-31','9999-12-31',1],['2025-12-31','2026-01-01',2]])assert.equal(normalizeAnalyticsRange(user,{from,to}).calendarDays,days);
  assert.throws(()=>normalizeAnalyticsRange('not-a-user',{from:'2026-01-01',to:'2026-01-01'}),RangeError);
});

test('T38 sanitizes connection/query failures, rolls back once and discards broken clients',async()=>{
  const range={from:'2026-01-01',to:'2026-01-01'},user=randomUUID();
  await assert.rejects(createAnalyticsService({connect:async()=>{throw Object.assign(Error('private database password'),{code:'ECONNREFUSED'});}}).getOverview(user,range),e=>e.status===503&&!e.message.includes('private'));
  let released,calls=0;
  const client={query:async sql=>{calls++;if(sql.startsWith('BEGIN'))return {rows:[]};throw Error('private SQL detail');},release:discard=>{released=discard;}};
  await assert.rejects(createAnalyticsService({connect:async()=>client}).getOverview(user,range),e=>e.status===500&&!e.message.includes('private'));
  assert.equal(released,true);assert.equal(calls,3);
});

test('T38 fresh runtime analytics matrix, forecast, snapshot consistency and 30k performance',{
  skip:!process.env.T38_DISPOSABLE_DATABASE_URL&&'Requires a fresh guarded disposable PostgreSQL cluster',
},async context=>{
  const url=disposableIsolationUrl(process.env.T38_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();
  let pool,auth,checks=0;const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  try{
    await prepareIsolationDatabase(admin);url.username='expense_tracker_app';pool=new Pool({connectionString:url.href,max:5});
    const a={userId:randomUUID()},b={userId:randomUUID()},empty={userId:randomUUID()};for(const user of [a,b,empty])await createTestUser(admin,user);
    const direct=createAnalyticsService(pool);
    let httpNow=new Date('2026-10-12T09:00:00Z');
    if(process.env.T39_ANALYTICS_HTTP)auth=await createTestAuthHarness(pool,{dashboardOptions:{now:()=>httpNow}});
    const service=auth?{getOverview:async(userId,range)=>{
      const token=await auth.createTestAuthToken({userId});
      const result=await auth.rawRequest(token,'/analytics/overview?'+new URLSearchParams(range));
      assert.equal(result.cache,'no-store');
      if(result.status!==200)throw Object.assign(new Error(result.body.error.message),{status:result.status,...result.body.error});
      assert.deepEqual(Object.keys(result.body),['data']);return result.body.data;
    }}:direct;
    const accounts=createAccountService(pool),tx=createV2TransactionService(pool);
    const range={from:'2026-01-15',to:'2026-03-10'},zero={income:'0.00',expenses:'0.00',netSavings:'0.00',savingsRatePercent:null,averageDailyExpense:'0.00'};
    const noData=await service.getOverview(empty.userId,range);equal(noData.summary,zero);equal(noData.period.calendarDays,55);equal(noData.incomeByCategory,[]);equal(noData.expenseByCategory,[]);equal(noData.accountActivity,[]);
    equal(noData.incomeVsExpenses.map(r=>[r.period,r.from,r.to]),[['2026-01','2026-01-15','2026-01-31'],['2026-02','2026-02-01','2026-02-28'],['2026-03','2026-03-01','2026-03-10']]);
    for(const month of noData.incomeVsExpenses)equal([month.income,month.expenses,month.netSavings],['0.00','0.00','0.00']);
    const bank=await accounts.createAccount(a.userId,{name:'A bank',type:'bank',openingBalance:'999.00'}),card=await accounts.createAccount(a.userId,{name:'A card',type:'credit_card',openingBalance:'-40.00'}),foreign=await accounts.createAccount(b.userId,{name:'B private',type:'cash',openingBalance:'0.00'});
    const income='c1200000-0000-4000-8000-000000000001',food='c1200000-0000-4000-8000-000000000004',both='c1200000-0000-4000-8000-000000000009',custom=randomUUID(),foreignCat=randomUUID();
    await pool.query("INSERT INTO expense_tracker.categories(id,user_id,name,kind) VALUES($1,$2,'A custom','expense'),($3,$4,'B private category','both')",[custom,a.userId,foreignCat,b.userId]);
    const insert=async(owner,account,type,amount,date,category=type==='income'?income:food)=>{
      const id=randomUUID();await pool.query('INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,owner,account,category,type,amount,'Analytics actual',date]);return id;
    };
    await insert(a.userId,bank.id,'income','0.10','2026-01-15');await insert(a.userId,bank.id,'income','0.20','2026-03-10');
    equal((await service.getOverview(a.userId,range)).summary,{...zero,income:'0.30',netSavings:'0.30',savingsRatePercent:'100.00'});
    await insert(a.userId,bank.id,'income','999999999.99','2026-01-14');await insert(a.userId,bank.id,'expense','999999999.99','2026-03-11');
    equal((await service.getOverview(a.userId,range)).summary.income,'0.30');equal((await service.getOverview(a.userId,range)).summary.expenses,'0.00');
    await insert(a.userId,card.id,'expense','0.40','2026-02-28',custom);await insert(a.userId,bank.id,'expense','0.10','2026-03-10',both);await insert(a.userId,bank.id,'income','0.10','2026-03-10',both);
    await insert(b.userId,foreign.id,'income','999999999.99','2026-02-01',foreignCat);
    let result=await service.getOverview(a.userId,range);equal(result.summary,{income:'0.40',expenses:'0.50',netSavings:'-0.10',savingsRatePercent:'-25.00',averageDailyExpense:'0.01'});
    equal(result.expenseByCategory.map(r=>[r.categoryId,r.amount,r.percentage]),[[custom,'0.40','80.00'],[both,'0.10','20.00']]);equal(result.incomeByCategory.map(r=>[r.categoryId,r.amount,r.percentage]),[[income,'0.30','75.00'],[both,'0.10','25.00']]);
    const stable=result.summary;await pool.query("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,10.00,'2026-02-01')",[a.userId,bank.id,card.id]);result=await service.getOverview(a.userId,range);equal(result.summary,stable);equal(result.accountActivity.map(r=>[r.incomingTransfers,r.outgoingTransfers]),[['0.00','10.00'],['10.00','0.00']]);
    equal((await service.getOverview(a.userId,{...range,accountId:card.id})).summary,{...zero,expenses:'0.40',netSavings:'-0.40',averageDailyExpense:'0.01'});
    for(const id of [foreign.id,randomUUID()])await assert.rejects(service.getOverview(a.userId,{...range,accountId:id}),e=>e.status===404&&e.message==='Account not found.');checks+=2;
    const bResult=await service.getOverview(b.userId,range);equal(bResult.summary.income,'999999999.99');equal(bResult.accountActivity.map(r=>r.accountId),[foreign.id]);assert.ok(!JSON.stringify(bResult).includes('A custom'));checks++;
    await accounts.archiveAccount(a.userId,card.id);await pool.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[custom]);equal((await service.getOverview(a.userId,range)).summary,stable);equal((await service.getOverview(a.userId,{...range,accountId:card.id})).expenseByCategory[0].categoryId,custom);
    await accounts.restoreAccount(a.userId,card.id);
    // Half-cent averages, thirds, negative savings rates, minimum/maximum calendar boundaries.
    await insert(a.userId,bank.id,'expense','0.01','2024-02-29');equal((await service.getOverview(a.userId,{from:'2024-02-28',to:'2024-02-29'})).summary.averageDailyExpense,'0.01');
    for(const date of ['1900-01-01','2025-12-31','2026-01-01'])await insert(a.userId,bank.id,'income','0.01',date);
    equal((await service.getOverview(a.userId,{from:'2025-12-31',to:'2026-01-01'})).incomeVsExpenses.map(r=>r.period),['2025-12','2026-01']);
    equal((await service.getOverview(a.userId,{from:'1900-01-01',to:'1900-01-01'})).summary.income,'0.01');
    equal((await service.getOverview(a.userId,{from:'9999-12-31',to:'9999-12-31'})).incomeVsExpenses[0].to,'9999-12-31');
    const rounding=(await pool.query("SELECT round(0.005::numeric,2)::text positive,round(-0.005::numeric,2)::text negative,round(100::numeric/3,2)::text thirds,round(1::numeric/NULLIF(0,0),2) AS zero")).rows[0];equal(rounding,{positive:'0.01',negative:'-0.01',thirds:'33.33',zero:null});
    const large={userId:randomUUID()},rounded={userId:randomUUID()};for(const user of [large,rounded])await createTestUser(admin,user);
    const largeAccount=await accounts.createAccount(large.userId,{name:'Large totals',type:'cash',openingBalance:'0.00'}),roundedAccount=await accounts.createAccount(rounded.userId,{name:'Rounding',type:'cash',openingBalance:'0.00'});
    await insert(large.userId,largeAccount.id,'income','999999999.99','2026-06-01');await insert(large.userId,largeAccount.id,'income','999999999.99','2026-06-01');
    await insert(large.userId,largeAccount.id,'expense','0.10','2026-06-01');equal((await service.getOverview(large.userId,{from:'2026-06-01',to:'2026-06-01'})).summary,{income:'1999999999.98',expenses:'0.10',netSavings:'1999999999.88',savingsRatePercent:'100.00',averageDailyExpense:'0.10'});
    await insert(rounded.userId,roundedAccount.id,'income','8.00','2026-07-01');await insert(rounded.userId,roundedAccount.id,'expense','8.01','2026-07-01');
    equal((await service.getOverview(rounded.userId,{from:'2026-07-01',to:'2026-07-02'})).summary,{income:'8.00',expenses:'8.01',netSavings:'-0.01',savingsRatePercent:'-0.13',averageDailyExpense:'4.01'});
    const freelance='c1200000-0000-4000-8000-000000000002';
    for(const [category,amount]of [[income,'1000.00'],[freelance,'999.99'],[both,'1000.00']])await insert(rounded.userId,roundedAccount.id,'income',amount,'2026-08-01',category);
    equal((await service.getOverview(rounded.userId,{from:'2026-08-01',to:'2026-08-01'})).incomeByCategory.map(r=>[r.categoryId,r.percentage]),[[income,'33.33'],[both,'33.33'],[freelance,'33.33']]);
    // Calendar buckets must be independent of the connection's session timezone.
    const zoneClient=await pool.connect();try{await zoneClient.query("SET TIME ZONE 'Pacific/Auckland'");equal(await createAnalyticsRepository(zoneClient).getCashFlowSeries(a.userId,range),(await service.getOverview(a.userId,range)).incomeVsExpenses);}finally{await zoneClient.query("SET TIME ZONE 'UTC'");zoneClient.release();}
    // Forecast uses current active schedules and full anchored ranges, not persisted cursors.
    const definition=async(type,amount,frequency,startDate,endDate=null,accountId=bank.id)=>{
      const id=randomUUID();await pool.query('INSERT INTO expense_tracker.recurring_transactions(id,user_id,account_id,category_id,type,amount,description,frequency,start_date,end_date,next_occurrence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9)',[id,a.userId,accountId,type==='income'?income:food,type,amount,'Projected',frequency,startDate,endDate]);return id;
    };
    const daily=await definition('income','0.10','daily','2024-01-01','2024-01-31'),weekly=await definition('expense','0.20','weekly','2024-01-01','2024-01-31');
    const monthly=await definition('expense','1.00','monthly','2024-01-31','2024-03-31');await definition('income','2.00','yearly','2020-02-29','2024-02-29');
    await pool.query("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date,status,processed_at) VALUES($1,$2,'2024-01-02','skipped',statement_timestamp())",[a.userId,daily]);
    const client=await pool.connect();let generated;try{generated=await createGeneratedFixture(client,{userId:a.userId,definitionId:daily,occurrenceDate:'2024-01-03',accountId:bank.id,categoryId:income,type:'income',amount:'0.10',description:'Generated actual',date:'2024-01-03'});}finally{client.release();}
    const jan={from:'2024-01-01',to:'2024-01-31'};equal((await service.getOverview(a.userId,jan)).recurring,{income:'3.00',expenses:'2.00',netCashFlow:'1.00',basis:'projected_occurrences',...jan});equal((await service.getOverview(a.userId,jan)).summary.income,'0.10');
    equal((await service.getOverview(b.userId,jan)).recurring,{income:'0.00',expenses:'0.00',netCashFlow:'0.00',basis:'projected_occurrences',...jan});
    equal((await service.getOverview(a.userId,{...jan,accountId:card.id})).recurring.income,'0.00');
    await tx.deleteTransaction(a.userId,generated.id);equal((await service.getOverview(a.userId,jan)).summary.income,'0.00');equal((await service.getOverview(a.userId,jan)).recurring.income,'3.00');
    equal((await pool.query('SELECT status,generated_transaction_id FROM expense_tracker.recurring_occurrences WHERE id=$1',[generated.occurrenceId])).rows[0],{status:'posted',generated_transaction_id:null});
    equal((await service.getOverview(a.userId,{from:'2024-02-01',to:'2024-02-29'})).recurring.expenses,'1.00');equal((await service.getOverview(a.userId,{from:'2024-02-01',to:'2024-02-29'})).recurring.income,'2.00');equal((await service.getOverview(a.userId,{from:'2024-03-01',to:'2024-03-31'})).recurring.expenses,'1.00');
    await pool.query("UPDATE expense_tracker.recurring_transactions SET status='paused',next_occurrence=NULL WHERE id=$1",[weekly]);equal((await service.getOverview(a.userId,jan)).recurring.expenses,'1.00');
    await pool.query("UPDATE expense_tracker.recurring_transactions SET status='archived',next_occurrence=NULL WHERE id=$1",[monthly]);equal((await service.getOverview(a.userId,jan)).recurring.expenses,'0.00');
    // Actual processor posting and deletion reconcile with T36 under equivalent Cairo periods.
    const due=await definition('income','0.20','daily','2026-10-01','2026-10-01');await pool.query("UPDATE expense_tracker.recurring_transactions SET next_occurrence='2026-10-01' WHERE id=$1",[due]);
    equal((await createRecurringProcessor(pool).processDueRecurring({referenceDate:'2026-10-01',definitionId:due,userId:a.userId})).posted,1);
    const dashboard=createDashboardService(pool,{now:()=>new Date('2026-10-12T09:00:00Z')});
    for(const period of ['this_month','last_month','3_months','6_months','1_year']){
      const d=auth?(await auth.rawRequest(await auth.createTestAuthToken(a),'/dashboard?period='+period)).body.data:(await dashboard.getDashboard(a.userId,period)).data,r=await service.getOverview(a.userId,{from:d.period.from,to:d.period.to});for(const k of ['income','expenses','netSavings'])equal(r.summary[k],d.summary[k]);
    }
    for(const instant of ['2026-09-30T20:59:59Z','2026-09-30T21:00:00Z']){
      httpNow=new Date(instant);
      const d=auth?(await auth.rawRequest(await auth.createTestAuthToken(a),'/dashboard?period=this_month')).body.data:(await createDashboardService(pool,{now:()=>new Date(instant)}).getDashboard(a.userId,'this_month')).data;
      const r=await service.getOverview(a.userId,{from:d.period.from,to:d.period.to});equal(r.summary.income,d.summary.income);equal(r.summary.expenses,d.summary.expenses);
    }
    const before=await financialSnapshot(admin);await service.getOverview(a.userId,range);equal(await financialSnapshot(admin),before);
    // Force a concurrent commit after snapshot acquisition; every section keeps the old view.
    let injected=false;
    const snapshotService=createAnalyticsService({connect:async()=>{
      const c=await pool.connect();return {query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('BEGIN')){equal((await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');equal((await c.query('SHOW transaction_isolation')).rows[0].transaction_isolation,'repeatable read');}if(!injected&&sql.includes('savingsRatePercent')){injected=true;await insert(a.userId,bank.id,'income','1.00','2026-03-01');}return r;},release:c.release.bind(c)};
    }});
    const old=await service.getOverview(a.userId,range);equal(await snapshotService.getOverview(a.userId,range),old);equal((await service.getOverview(a.userId,range)).summary.income,'1.40');
    // Sum series through PostgreSQL, never financial JS arithmetic.
    const current=await service.getOverview(a.userId,range);const sum=(await pool.query(`SELECT sum((v->>'income')::numeric)::text income,sum((v->>'expenses')::numeric)::text expenses FROM jsonb_array_elements($1::jsonb) v`,[JSON.stringify(current.incomeVsExpenses)])).rows[0];equal(sum,{income:current.summary.income,expenses:current.summary.expenses});
    for(const [rows,total] of [[current.incomeByCategory,current.summary.income],[current.expenseByCategory,current.summary.expenses]]){
      equal((await pool.query("SELECT COALESCE(sum((v->>'amount')::numeric),0)::text amount FROM jsonb_array_elements($1::jsonb) v",[JSON.stringify(rows)])).rows[0].amount,total);
    }
    // Independent multi-account/category scale with both tenants and generated rows already present.
    await admin.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date)
      SELECT gen_random_uuid(),CASE WHEN n%2=0 THEN $1::uuid ELSE $2::uuid END,
        CASE WHEN n%2=0 THEN CASE WHEN n%4=0 THEN $3::uuid ELSE $4::uuid END ELSE $5::uuid END,
        CASE WHEN n%3=0 THEN $6::uuid ELSE $7::uuid END,CASE WHEN n%3=0 THEN 'income' ELSE 'expense' END,
        0.10,'Scale actual',DATE '2025-01-01'+(n%365) FROM generate_series(1,30000) n`,[a.userId,b.userId,bank.id,card.id,foreign.id,income,food]);
    await admin.query(`INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date)
      SELECT $1,$2,$3,0.10,DATE '2025-01-01'+(n%365) FROM generate_series(1,2000) n`,[a.userId,bank.id,card.id]);
    const scaleDefinition=await definition('income','0.20','daily','2025-05-01','2025-05-01');
    equal((await createRecurringProcessor(pool).processDueRecurring({referenceDate:'2025-05-01',definitionId:scaleDefinition,userId:a.userId})).posted,1);
    await admin.query('ANALYZE expense_tracker.transactions; ANALYZE expense_tracker.transfers; ANALYZE expense_tracker.accounts; ANALYZE expense_tracker.categories;');
    const scaleRange={from:'2025-01-01',to:'2025-12-31'},captured=[];
    const traced=createAnalyticsRepository({query:async(sql,args)=>{captured.push({sql,args});return pool.query(sql,args);}});
    await traced.getSummary(a.userId,scaleRange);await traced.getCashFlowSeries(a.userId,scaleRange);await traced.getCategoryBreakdown(a.userId,scaleRange);await traced.getAccountActivity(a.userId,scaleRange);await traced.getRecurringCommitments(a.userId,scaleRange);
    const plans=[];for(const [index,{sql,args}]of captured.entries()){
      const plan=(await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,args)).rows[0]['QUERY PLAN'][0];plans.push({query:index,executionMs:plan['Execution Time'],planningMs:plan['Planning Time'],plan:plan.Plan});
    }
    const times=[];for(let i=0;i<8;i++){const start=performance.now();await service.getOverview(a.userId,scaleRange);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
    const directTimes=[];if(auth)for(let i=0;i<8;i++){const start=performance.now();await direct.getOverview(a.userId,scaleRange);directTimes.push(performance.now()-start);}directTimes.sort((a,b)=>a-b);
    equal((await service.getOverview(a.userId,scaleRange)).summary.income,(await getTransactionTotals(pool,a.userId,scaleRange.from,scaleRange.to)).income);
    assert.equal((await pool.query('SELECT current_user role')).rows[0].role,'expense_tracker_app');checks++;
    const evidence={checks,transactions:(await admin.query('SELECT count(*)::int n FROM expense_tracker.transactions')).rows[0].n,transfers:(await admin.query('SELECT count(*)::int n FROM expense_tracker.transfers')).rows[0].n,generatedTransactions:(await admin.query('SELECT count(*)::int n FROM expense_tracker.transactions WHERE recurring_transaction_id IS NOT NULL')).rows[0].n,latencyMs:{min:times[0],median:times[4],max:times.at(-1)},plans,indexAdded:false,remoteTouched:false};
    if(auth)evidence.httpComparison={directMedianMs:directTimes[4],httpMedianMs:times[4],includes:'loopback HTTP, local ES256 signing/verification, JSON serialization'};
    writeFileSync(new URL(process.env.T39_ANALYTICS_HTTP?'../../.tmp-v2-t39/performance.json':'../../.tmp-v2-t38/performance.json',import.meta.url),JSON.stringify(evidence,null,2));
    context.diagnostic(JSON.stringify({...evidence,plans:plans.map(({query,executionMs,planningMs})=>({query,executionMs,planningMs}))}));
  }finally{await auth?.close();await pool?.end();await admin.end();}
});

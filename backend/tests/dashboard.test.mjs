import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Client,Pool} from 'pg';
import {validateDashboardQuery,dashboardPeriods} from '../dist/validators/dashboard.js';
import {createDashboardService} from '../dist/services/dashboard.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createAccountBalanceRepository} from '../dist/services/account-balances.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createRecurringService} from '../dist/services/recurring.js';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createTestAuthHarness,financialSnapshot,expectApiError} from './helpers/v2-isolation.mjs';
import {createGeneratedFixture} from './helpers/generated-fixture.mjs';

test('T36 strict frozen period validation',()=>{
  assert.equal(validateDashboardQuery('/dashboard'),'this_month');
  for(const period of dashboardPeriods)assert.equal(validateDashboardQuery('/dashboard?period='+period),period);
  for(const query of ['period=','period=all_time','period=this_year','period=this_month&period=this_month','period[]=this_month','from=2026-01-01','userId=x','limit=5','period=This_month','period=%20this_month'])assert.throws(()=>validateDashboardQuery('/dashboard?'+query),e=>e.code==='VALIDATION_ERROR');
});

test('T36 JWT, unsupported methods, no-store, validation before SQL and safe unavailable errors',async()=>{
  let calls=0;
  const db={query:async()=>{throw Error('unexpected query');},connect:async()=>{calls++;throw Object.assign(new Error('private connection credentials'),{code:'ECONNREFUSED'});}};
  const auth=await createTestAuthHarness(db);
  try {
    const user={userId:randomUUID()},token=await auth.createTestAuthToken(user);
    for(const credential of [null,'bad.token',await auth.createTestAuthToken(user,{wrongKey:true}),await auth.createTestAuthToken(user,{expiration:'-1s'})])expectApiError(await auth.rawRequest(credential,'/dashboard'),401,credential===null?'AUTH_REQUIRED':'AUTH_INVALID');
    for(const query of ['period=no','userId=x','period=this_month&period=last_month'])expectApiError(await auth.rawRequest(token,'/dashboard?'+query),400,'VALIDATION_ERROR');
    for(const method of ['POST','PUT','DELETE','PATCH']){const r=await auth.rawRequest(token,'/dashboard',method,method==='DELETE'?undefined:{});assert.equal(r.status,405);assert.equal(r.allow,'GET');assert.equal(r.cache,'no-store');}
    assert.equal(calls,0);
    const result=await auth.rawRequest(token,'/dashboard');expectApiError(result,503,'DATABASE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(result.body),/private|credentials/);
  } finally {await auth.close();}
});

test('T36 failures roll back and discard a broken connection without retry',async()=>{
  const calls=[],failure=Object.assign(new Error('read failed'),{code:'08006'});let released;
  const client={query:async sql=>{calls.push(sql);if(sql.startsWith('BEGIN'))return {rows:[]};if(sql.startsWith('ROLLBACK'))throw Error('rollback failed');if(sql.includes('make_interval'))return {rows:[{from:'2026-10-01',to:'2026-10-12'}]};throw failure;},release:discard=>{released=discard;}};
  await assert.rejects(createDashboardService({connect:async()=>client}).getDashboard(randomUUID(),'this_month'),e=>e===failure);
  assert.equal(calls.at(-1),'ROLLBACK');assert.equal(released,true);assert.equal(calls.filter(sql=>sql.startsWith('BEGIN')).length,1);
});

test('T36 fresh limited-role authoritative aggregates, periods, concurrency, isolation and scale',{
  skip:!process.env.T36_DISPOSABLE_DATABASE_URL&&'Requires a fresh isolated loopback PostgreSQL cluster',
},async context=>{
  const url=disposableIsolationUrl(process.env.T36_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();
  let pool,auth,checks=0;
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  let clock=new Date('2026-10-12T09:00:00Z');const now=()=>clock;
  try {
    await prepareIsolationDatabase(admin);url.username='expense_tracker_app';pool=new Pool({connectionString:url.href,max:8});
    const a={userId:randomUUID()},b={userId:randomUUID()};for(const u of [a,b])await createTestUser(admin,u);
    auth=await createTestAuthHarness(pool,{dashboardOptions:{now}});
    const token=await auth.createTestAuthToken(a),tokenB=await auth.createTestAuthToken(b);
    const service=createDashboardService(pool,{now}),balances=createAccountBalanceRepository(pool),accounts=createAccountService(pool);
    const tx=createV2TransactionService(pool,{cursorSigningSecret:'test-only-signing-secret-32-characters'}),recurring=createRecurringService(pool,{now});
    const get=async(period='this_month',credential=token)=>{const r=await auth.rawRequest(credential,'/dashboard?period='+period);equal(r.status,200);equal(r.cache,'no-store');return r.body;};
    const zero={totalBalance:'0.00',assets:'0.00',cardDebt:'0.00',income:'0.00',expenses:'0.00',netSavings:'0.00',currency:'EGP'};
    equal((await get()).data.summary,zero);equal((await get()).data.accounts,[]);equal((await get()).data.recentTransactions,[]);equal((await get()).data.upcomingRecurring,[]);
    const expected={this_month:['2026-10-01','2026-10-12'],last_month:['2026-09-01','2026-09-30'],'3_months':['2026-08-01','2026-10-12'],'6_months':['2026-05-01','2026-10-12'],'1_year':['2025-11-01','2026-10-12']};
    for(const [key,[from,to]] of Object.entries(expected))equal((await get(key)).data.period,{key,from,to,timezone:'Africa/Cairo'});
    for(const [instant,key,from,to] of [
      ['2026-01-01T00:00:00Z','last_month','2025-12-01','2025-12-31'],
      ['2024-03-01T00:00:00Z','last_month','2024-02-01','2024-02-29'],
      ['2026-09-30T20:59:59Z','this_month','2026-09-01','2026-09-30'],
      ['2026-09-30T21:00:00Z','this_month','2026-10-01','2026-10-01'],
      ['2026-01-01T00:00:00Z','1_year','2025-02-01','2026-01-01'],
    ]){clock=new Date(instant);equal((await get(key)).data.period,{key,from,to,timezone:'Africa/Cairo'});}
    clock=new Date('2026-10-12T09:00:00Z');
    const bank=await accounts.createAccount(a.userId,{name:'A bank',type:'bank',openingBalance:'100.00'});
    equal((await get()).data.summary,{...zero,totalBalance:'100.00',assets:'100.00'});
    const debt=await accounts.createAccount(a.userId,{name:'Debt',type:'credit_card',openingBalance:'40.00'});
    const credit=await accounts.createAccount(a.userId,{name:'Credit',type:'credit_card',openingBalance:'-10.00'});
    const negative=await accounts.createAccount(a.userId,{name:'Negative cash',type:'cash',openingBalance:'-20.00'});
    equal((await get()).data.summary,{...zero,totalBalance:'50.00',assets:'80.00',cardDebt:'30.00'});
    await accounts.archiveAccount(a.userId,negative.id);equal((await get()).data.accounts.find(r=>r.id===negative.id).status,'archived');
    const foreign=await accounts.createAccount(b.userId,{name:'Private B',type:'credit_card',openingBalance:'999999999.99'});
    equal((await get('this_month',tokenB)).data.summary,{...zero,totalBalance:'-999999999.99',cardDebt:'999999999.99'});
    const incomeCat='c1200000-0000-4000-8000-000000000001',expenseCat='c1200000-0000-4000-8000-000000000004';
    const insert=async(type,amount,date='2026-10-01',accountId=bank.id,owner=a.userId)=>{
      const id=randomUUID();await pool.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'other')`,[id,owner,accountId,type==='income'?incomeCat:expenseCat,type,amount,owner===a.userId?'A actual':'B private',date]);return id;
    };
    await insert('income','0.10');await insert('income','0.20');equal((await get()).data.summary.income,'0.30');
    await insert('expense','0.40','2026-10-12');equal((await get()).data.summary.netSavings,'-0.10');
    await insert('income','999999999.99','2026-09-30');await insert('income','999999999.99','2026-09-01');
    equal((await get('last_month')).data.summary.income,'1999999999.98');equal((await get()).data.summary.income,'0.30');
    await insert('expense','1.00','2026-08-31');await insert('income','0.01','2025-10-31');await insert('income','0.02','2025-11-01');
    await insert('income','7.00','2026-10-12',foreign.id,b.userId);
    assert.doesNotMatch(JSON.stringify(await get()),/Private B|B private/);checks++;
    const expenseOwner={userId:randomUUID()};await createTestUser(admin,expenseOwner);
    const expenseAccount=await accounts.createAccount(expenseOwner.userId,{name:'Only archived account',type:'cash',openingBalance:'0.00'});
    await insert('expense','0.20','2026-10-12',expenseAccount.id,expenseOwner.userId);
    await accounts.archiveAccount(expenseOwner.userId,expenseAccount.id);
    const expenseToken=await auth.createTestAuthToken(expenseOwner);
    equal((await get('this_month',expenseToken)).data.summary,{...zero,totalBalance:'-0.20',assets:'-0.20',expenses:'0.20',netSavings:'-0.20'});
    for(const key of dashboardPeriods){const response=await get(key),{from,to}=response.data.period;
      const independent=(await pool.query(`SELECT COALESCE(sum(amount) FILTER(WHERE type='income'),0)::numeric(30,2)::text income,COALESCE(sum(amount) FILTER(WHERE type='expense'),0)::numeric(30,2)::text expenses,COALESCE(sum(CASE WHEN type='income' THEN amount ELSE -amount END),0)::numeric(30,2)::text savings FROM expense_tracker.transactions WHERE user_id=$1 AND transaction_date >= $2 AND transaction_date <= $3`,[a.userId,from,to])).rows[0];
      equal(response.data.summary.income,independent.income);equal(response.data.summary.expenses,independent.expenses);equal(response.data.summary.netSavings,independent.savings);
      equal(response.data.summary.totalBalance,(await balances.getNetPosition(a.userId)).netPosition);equal(response.data.accounts,await balances.getAccountBalances(a.userId));
    }
    const beforeTransfer=(await get()).data.summary;
    for(const [source,destination] of [[bank,debt],[debt,bank],[debt,credit],[credit,bank]])await pool.query("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,100.00,'2026-10-12')",[a.userId,source.id,destination.id]);
    equal((await get()).data.summary.income,beforeTransfer.income);equal((await get()).data.summary.expenses,beforeTransfer.expenses);equal((await get()).data.summary.totalBalance,beforeTransfer.totalBalance);
    equal((await get('last_month')).data.recentTransactions,(await get()).data.recentTransactions);
    await pool.query("UPDATE expense_tracker.transactions SET created_at='2026-10-12T08:00:00.123456Z' WHERE user_id=$1 AND transaction_date='2026-10-12'",[a.userId]);
    for(let i=0;i<8;i++)await insert('income','0.01','2026-10-12');
    await pool.query("UPDATE expense_tracker.transactions SET created_at='2026-10-12T08:00:00.123456Z' WHERE user_id=$1 AND transaction_date='2026-10-12'",[a.userId]);
    const actualRecent=(await get()).data.recentTransactions;
    equal(actualRecent.map(r=>r.id),(await pool.query('SELECT id FROM expense_tracker.transactions WHERE user_id=$1 ORDER BY transaction_date DESC,created_at DESC,id DESC LIMIT 5',[a.userId])).rows.map(r=>r.id));
    for(const row of actualRecent)equal(row,await tx.getTransaction(a.userId,row.id));
    const def=await recurring.createRecurring(a.userId,{accountId:bank.id,categoryId:incomeCat,type:'income',amount:'0.10',description:'A forecast',frequency:'daily',startDate:'2026-10-01',endDate:null});
    const fixtureClient=await pool.connect();let generated;
    try {generated=await createGeneratedFixture(fixtureClient,{userId:a.userId,definitionId:def.id,occurrenceDate:'2026-10-12',accountId:bank.id,categoryId:incomeCat,type:'income',amount:'0.10',description:'Generated',date:'2026-10-12'});}finally{fixtureClient.release();}
    equal((await get()).data.summary.income,'0.48');
    await tx.deleteTransaction(a.userId,generated.id);equal((await get()).data.summary.income,'0.38');
    equal((await pool.query('SELECT status,generated_transaction_id FROM expense_tracker.recurring_occurrences WHERE id=$1',[generated.occurrenceId])).rows[0],{status:'posted',generated_transaction_id:null});
    await pool.query("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date,status,processed_at) VALUES($1,$2,'2026-10-13','skipped',statement_timestamp())",[a.userId,def.id]);
    equal((await get()).data.upcomingRecurring,(await recurring.upcomingRecurring(a.userId,30)).data.slice(0,5));
    equal((await get()).data.upcomingRecurring[0].occurrenceDate,'2026-10-14');
    await recurring.pauseRecurring(a.userId,def.id);equal((await get()).data.upcomingRecurring,[]);await recurring.resumeRecurring(a.userId,def.id);
    const far=await recurring.createRecurring(a.userId,{accountId:bank.id,categoryId:incomeCat,type:'income',amount:'1.00',description:'Beyond horizon',frequency:'monthly',startDate:'2026-11-11',endDate:null});
    assert.ok(!(await get()).data.upcomingRecurring.some(r=>r.recurringTransactionId===far.id));checks++;
    await recurring.pauseRecurring(a.userId,def.id);
    const edge=await recurring.createRecurring(a.userId,{accountId:bank.id,categoryId:incomeCat,type:'income',amount:'1.00',description:'Inclusive horizon',frequency:'monthly',startDate:'2026-11-10',endDate:'2026-11-10'});
    equal((await get()).data.upcomingRecurring.map(r=>r.recurringTransactionId),[edge.id]);
    await recurring.archiveRecurring(a.userId,edge.id);equal((await get()).data.upcomingRecurring,[]);
    const custom=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,'Archived category probe','income') RETURNING id",[a.userId])).rows[0].id;
    const archivedCategoryDef=await recurring.createRecurring(a.userId,{accountId:bank.id,categoryId:custom,type:'income',amount:'1.00',description:'Inactive parent',frequency:'daily',startDate:'2026-10-12',endDate:null});
    await pool.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[custom]);
    assert.ok(!(await get()).data.upcomingRecurring.some(r=>r.recurringTransactionId===archivedCategoryDef.id));checks++;
    await recurring.resumeRecurring(a.userId,def.id);
    const foreignDef=await recurring.createRecurring(b.userId,{accountId:foreign.id,categoryId:incomeCat,type:'income',amount:'7.00',description:'B secret schedule',frequency:'daily',startDate:'2026-10-12',endDate:null});
    assert.ok(!(await get()).data.upcomingRecurring.some(r=>r.recurringTransactionId===foreignDef.id));checks++;
    await accounts.archiveAccount(a.userId,bank.id);equal((await get()).data.upcomingRecurring,[]);await accounts.restoreAccount(a.userId,bank.id);await recurring.resumeRecurring(a.userId,def.id);
    const unchanged=await financialSnapshot(pool);await get();equal(await financialSnapshot(pool),unchanged);
    for(const field of ['incomeVsExpenses','budgets','goals'])assert.ok(!Object.hasOwn((await get()).data,field));
    equal((await get()).meta.deferred,['incomeVsExpenses','budgets','goals']);

    // Commit between snapshot acquisition and aggregate reads: all sections must retain the old state.
    const old=await get();let injected=false,seenIsolation;
    const wrapped={connect:async()=>{const client=await pool.connect();return {release:discard=>client.release(discard),query:async(sql,params)=>{
      const result=await client.query(sql,params);
      if(sql.includes('make_interval')&&!injected){injected=true;seenIsolation=(await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation;equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');await insert('income','5.00','2026-10-12');await pool.query("UPDATE expense_tracker.accounts SET name='Committed new name' WHERE id=$1",[bank.id]);await recurring.pauseRecurring(a.userId,def.id);}
      return result;
    }};}};
    equal(await createDashboardService(wrapped,{now}).getDashboard(a.userId,'this_month'),old);equal(seenIsolation,'repeatable read');
    const changed=await get();equal(changed.data.summary.income,'5.38');equal(changed.data.accounts.find(r=>r.id===bank.id).name,'Committed new name');equal(changed.data.upcomingRecurring,[]);
    const writer=await pool.connect();try{await writer.query('BEGIN');await writer.query("UPDATE expense_tracker.transactions SET amount=amount+1 WHERE user_id=$1 AND amount<1",[a.userId]);equal(await get(),changed);await writer.query('ROLLBACK');}finally{writer.release();}

    // Mixed scale: many owners, 30k actuals, 2k transfers and 1k schedules. Capture exact production SELECT plans.
    const scaleUsers=[];
    for(let i=0;i<20;i++){const u={userId:randomUUID()};await createTestUser(admin,u);const account=await accounts.createAccount(u.userId,{name:'Scale bank',type:'bank',openingBalance:'100.00'});const card=await accounts.createAccount(u.userId,{name:'Scale card',type:'credit_card',openingBalance:'20.00'});scaleUsers.push({u,account,card});
      await pool.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date,category)
        SELECT gen_random_uuid(),$1,$2,CASE WHEN n%2=0 THEN $3::uuid ELSE $4::uuid END,CASE WHEN n%2=0 THEN 'income' ELSE 'expense' END,0.10,'Scale actual',DATE '2026-10-12'-(n%365),'other' FROM generate_series(1,1500) n`,[u.userId,account.id,incomeCat,expenseCat]);
      await pool.query("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) SELECT $1,$2,$3,0.20,'2026-10-12' FROM generate_series(1,100)",[u.userId,account.id,card.id]);
      await pool.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence) SELECT $1,$2,$3,'income',0.10,'Scale forecast','daily','2026-10-12','2026-10-12' FROM generate_series(1,50)",[u.userId,account.id,incomeCat]);
    }
    await admin.query('ANALYZE');
    const plans=[],observed={connect:async()=>{const client=await pool.connect();return {release:discard=>client.release(discard),query:async(sql,params)=>{
      if((sql.startsWith('WITH')||sql.startsWith('SELECT'))&&!sql.includes('make_interval')&&!sql.includes('LEAST')){
        const plan=(await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql,params)).rows[0]['QUERY PLAN'][0];
        const label=sql.includes('netPosition')?'position':sql.includes('currentBalance')?'accounts':sql.includes('WITH totals')?'period':sql.includes('LIMIT 5')?'recent':sql.includes('recurring_occurrences')?'markers':'upcoming';
        plans.push({label,executionMs:plan['Execution Time'],plan:plan.Plan});
      }return client.query(sql,params);
    }};}};
    const owner=scaleUsers[0].u.userId;await createDashboardService(observed,{now}).getDashboard(owner,'this_month');
    const times=[];for(let i=0;i<12;i++){const start=performance.now();const response=await service.getDashboard(owner,'this_month');times.push(performance.now()-start);equal(response.data.summary.totalBalance,(await balances.getNetPosition(owner)).netPosition);equal(response.data.upcomingRecurring.length,5);}
    times.sort((a,b)=>a-b);
    context.diagnostic(JSON.stringify({checks,scale:{owners:20,transactions:30000,transfers:2000,definitions:1000},latencyMs:{min:times[0],median:times[6],max:times.at(-1)},plans}));
  } finally {await auth?.close();await pool?.end();await admin.end();}
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {once} from 'node:events';
import {URL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';
import {Client,Pool} from 'pg';
import {createApp} from '../dist/app.js';
import {createBudgetService,budgetProgressQuery} from '../dist/services/budgets.js';
import {validateBudgetBody,validateBudgetQuery} from '../dist/validators/budget.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createRecurringService} from '../dist/services/recurring.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {createTransferService} from '../dist/services/transfers.js';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createTestAuthHarness,expectApiError} from './helpers/v2-isolation.mjs';

const food='c1200000-0000-4000-8000-000000000004',salary='c1200000-0000-4000-8000-000000000001',both='c1200000-0000-4000-8000-000000000009';
const body={categoryId:food,year:2026,month:10,amount:'0.30'};
test('T42 frozen year/month, immutable category/period PUT, exact amounts and strict query validation',()=>{
  assert.deepEqual(validateBudgetBody(body,true),{...body,alertThresholdPercent:90});
  assert.deepEqual(validateBudgetBody({amount:'1',alertThresholdPercent:100}),{amount:'1.00',alertThresholdPercent:100});
  for(const input of [null,[],{},...['0','-1','1e3','1.001','1000000000.00',' 1','+1','01',0.3].map(amount=>({...body,amount})),...['2026',1899,10000,2026.5].map(year=>({...body,year})),...[0,13,'10',10.1].map(month=>({...body,month})),...[null,0,101,'90',90.5].map(alertThresholdPercent=>({...body,alertThresholdPercent})),...['userId','ownerId','createdBy','spent'].map(k=>({...body,[k]:'x'})),{...body,categoryId:'bad'}])assert.throws(()=>validateBudgetBody(input,true),e=>e.code==='VALIDATION_ERROR');
  for(const input of [{amount:'1'}, {...body,alertThresholdPercent:90},{amount:'1',alertThresholdPercent:90,userId:'x'}])assert.throws(()=>validateBudgetBody(input),e=>e.code==='VALIDATION_ERROR');
  for(const now of ['2026-09-30T20:59:59Z','2026-09-30T21:00:00Z'])assert.equal(validateBudgetQuery('/budgets',new Date(now)).month,now.includes('20:59')?9:10);
  for(const query of ['year=2026','month=10','year=2026&month=0','year=2026&month=13','year=2026&month=10&month=10','year=2026&month=10&year=2026','year=2026&month=10&categoryId=x','year=2026&month=10&categoryId='+food+'&categoryId='+food,'month=2026-10','year=2026&month=%2010','userId=x','ownerId=x','categoryId[]=x','limit=1'])assert.throws(()=>validateBudgetQuery('/budgets?'+query),e=>e.code==='VALIDATION_ERROR');
});

test('T42 real JWT guards, pre-SQL validation, no-store, methods and safe DB errors',async()=>{
  let calls=0;const db={query:async()=>{calls++;throw Object.assign(Error('secret SQL constraint'),{code:'ECONNREFUSED'});},connect:async()=>{calls++;throw Object.assign(Error('private connection'),{code:'ECONNREFUSED'});}};
  const auth=await createTestAuthHarness(db);try{
    const user={userId:randomUUID()},token=await auth.createTestAuthToken(user);
    for(const credential of [null,'bad.token',await auth.createTestAuthToken(user,{wrongKey:true}),await auth.createTestAuthToken(user,{expiration:'-1s'})])for(const [path,method,input]of [['/budgets','GET'],['/budgets','POST',body],['/budgets/'+food,'GET'],['/budgets/'+food,'PUT',{amount:'1',alertThresholdPercent:90}],['/budgets/'+food,'DELETE']])expectApiError(await auth.rawRequest(credential,path,method,input),401,credential===null?'AUTH_REQUIRED':'AUTH_INVALID');
    for(const [path,method,input]of [['/budgets?ownerId=x','GET'],['/budgets?year=2026','GET'],['/budgets','POST',{...body,userId:'x'}],['/budgets/'+food,'PUT',{...body,alertThresholdPercent:90}],['/budgets/not-id','DELETE'],['/budgets/'+food+'?ownerId=x','GET']])expectApiError(await auth.rawRequest(token,path,method,input),400,'VALIDATION_ERROR');
    for(const [path,method,allow]of [['/budgets','PUT','GET, POST'],['/budgets/'+food,'POST','GET, PUT, DELETE'],['/budgets/'+food,'PATCH','GET, PUT, DELETE']]){const r=await auth.rawRequest(token,path,method,{});assert.equal(r.status,405);assert.equal(r.allow,allow);assert.equal(r.cache,'no-store');}
    assert.equal(calls,0);
    for(const [path,method,input]of [['/budgets','GET'],['/budgets','POST',body],['/budgets/'+food,'GET'],['/budgets/'+food,'PUT',{amount:'1',alertThresholdPercent:90}],['/budgets/'+food,'DELETE']]){const r=await auth.rawRequest(token,path,method,input);expectApiError(r,503,'DATABASE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(r.body),/secret|SQL|private|constraint|stack/);}
  }finally{await auth.close();}
});

test('T42 broken rollback discards connection, no retry; T67 production Budgets use the release guard',async()=>{
  let released,calls=0;const service=createBudgetService({connect:async()=>({query:async sql=>{calls++;if(sql==='BEGIN')return {rows:[]};throw Error('private');},release:d=>{released=d;}})});
  await assert.rejects(service.createBudget(randomUUID(),validateBudgetBody(body,true)));assert.equal(released,true);assert.equal(calls,3);
  assert.match(readFileSync(new URL('../server.mjs',import.meta.url),'utf8'),/budgets:\s*createBudgetService/);
  assert.match(readFileSync(new URL('../server.mjs',import.meta.url),'utf8'),/releaseAccess:\s*release/);
  assert.match(readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'),/budgets:createBudgetService/);
  const server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,financialMode:'v2'}).listen(0,'127.0.0.1');await once(server,'listening');
  try{const r=await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api/v2/budgets`);assert.equal(r.status,404);assert.equal(r.headers.get('Cache-Control'),'no-store');}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('T42 fresh real API CRUD, progress, ownership, mutations, races, faults and 30k query plans',{
  skip:!process.env.T42_DISPOSABLE_DATABASE_URL&&'Requires a fresh guarded loopback PostgreSQL cluster',
},async context=>{
  const url=disposableIsolationUrl(process.env.T42_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();let pool,auth,checks=0;
  const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
  try{
    await prepareIsolationDatabase(admin);url.username='expense_tracker_app';pool=new Pool({connectionString:url.href,max:8});
    const a={userId:randomUUID()},b={userId:randomUUID()};for(const user of [a,b])await createTestUser(admin,user);
    let clock=new Date('2026-10-13T09:00:00Z');
    auth=await createTestAuthHarness(pool,{budgetOptions:{now:()=>clock}});const ta=await auth.createTestAuthToken(a),tb=await auth.createTestAuthToken(b);
    const request=(path='',method='GET',input,token=ta)=>auth.rawRequest(token,'/budgets'+path,method,input);
    const create=async input=>{const r=await request('','POST',input);equal(r.status,201);equal(r.location,'/api/v2/budgets/'+r.body.data.id);return r.body.data;};
    const get=async id=>{const r=await request('/'+id);equal(r.status,200);return r.body.data;};
    const progress=async(id,spent,remaining,percentUsed,status)=>{const r=await get(id);equal([r.spent,r.remaining,r.percentUsed,r.status],[spent,remaining,percentUsed,status]);return r;};
    equal((await request()).body,{data:[],meta:{count:0}});
    const plan=await create(body);equal(plan.alertThresholdPercent,90);equal(Object.keys(plan).sort(),['id','categoryId','categoryName','amount','spent','remaining','percentUsed','year','month','alertThresholdPercent','status','createdAt','updatedAt'].sort());
    await progress(plan.id,'0.00','0.30','0.00','normal');equal((await request('?year=2026&month=10')).body.data,[plan]);
    expectApiError(await request('','POST',body),409,'CONFLICT');checks++;
    const foreignCategory=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,'B private','both') RETURNING id",[b.userId])).rows[0].id;
    for(const categoryId of [foreignCategory,randomUUID()]){expectApiError(await request('','POST',{...body,categoryId}),404,'NOT_FOUND');expectApiError(await request('?categoryId='+categoryId),404,'NOT_FOUND');checks+=2;}
    expectApiError(await request('','POST',{...body,categoryId:salary}),400,'VALIDATION_ERROR');checks++;
    const accounts=createAccountService(pool),tx=createV2TransactionService(pool),account=await accounts.createAccount(a.userId,{name:'A cash',type:'cash',openingBalance:'0.00'}),second=await accounts.createAccount(a.userId,{name:'A bank',type:'bank',openingBalance:'0.00'}),foreignAccount=await accounts.createAccount(b.userId,{name:'B cash',type:'cash',openingBalance:'0.00'});
    const input=(amount,date='2026-10-01',categoryId=food,type='expense')=>({amount,date,categoryId,type,accountId:account.id,description:'Budget actual'});
    const t1=await tx.createTransaction(a.userId,input('0.10'));const t2=await tx.createTransaction(a.userId,input('0.20','2026-10-13'));await progress(plan.id,'0.30','0.00','100.00','near_limit');
    await tx.createTransaction(a.userId,input('10.00','2026-09-30'));await tx.createTransaction(a.userId,input('10.00','2026-08-31'));
    await tx.createTransaction(b.userId,{...input('999999999.99'),accountId:foreignAccount.id});await progress(plan.id,'0.30','0.00','100.00','near_limit');
    await tx.updateTransaction(a.userId,t1.id,input('0.20'));await progress(plan.id,'0.40','-0.10','133.33','exceeded');
    const shared=await create({...body,categoryId:both,amount:'1.00'});await tx.updateTransaction(a.userId,t1.id,input('0.20','2026-10-01',both));await progress(plan.id,'0.20','0.10','66.67','normal');await progress(shared.id,'0.20','0.80','20.00','normal');
    await tx.createTransaction(a.userId,input('999999999.99','2026-10-01',both,'income'));await progress(shared.id,'0.20','0.80','20.00','normal');
    const september=await create({...body,month:9,amount:'20.00'});await tx.updateTransaction(a.userId,t1.id,input('0.20','2026-09-01'));await progress(shared.id,'0.00','1.00','0.00','normal');await progress(september.id,'10.20','9.80','51.00','normal');
    await tx.deleteTransaction(a.userId,t2.id);await progress(plan.id,'0.00','0.30','0.00','normal');
    await createTransferService(pool).createTransfer(a.userId,{sourceAccountId:account.id,destinationAccountId:second.id,amount:'999999999.99',date:'2026-10-01',description:'Not spending'});await progress(plan.id,'0.00','0.30','0.00','normal');
    const recurring=await createRecurringService(pool,{now:()=>new Date('2026-10-13T09:00:00Z')}).createRecurring(a.userId,{accountId:account.id,categoryId:food,type:'expense',amount:'0.10',description:'Generated budget expense',frequency:'daily',startDate:'2026-10-13',endDate:'2026-10-13'});
    const processor=createRecurringProcessor(pool);await progress(plan.id,'0.00','0.30','0.00','normal');equal((await processor.processDueRecurring({referenceDate:'2026-10-13',definitionId:recurring.id,userId:a.userId})).posted,1);await progress(plan.id,'0.10','0.20','33.33','normal');equal((await processor.processDueRecurring({referenceDate:'2026-10-13',definitionId:recurring.id,userId:a.userId})).posted,0);
    const generated=(await pool.query('SELECT id FROM expense_tracker.transactions WHERE recurring_transaction_id=$1',[recurring.id])).rows[0].id;await tx.deleteTransaction(a.userId,generated);await progress(plan.id,'0.00','0.30','0.00','normal');equal((await pool.query('SELECT status,generated_transaction_id FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1',[recurring.id])).rows[0],{status:'posted',generated_transaction_id:null});
    // Exact threshold classification must ignore display rounding.
    const boundary=await create({...body,year:2024,month:2,amount:'10000.00'});const spend=await tx.createTransaction(a.userId,input('8999.99','2024-02-01'));
    await progress(boundary.id,'8999.99','1000.01','90.00','normal');await tx.updateTransaction(a.userId,spend.id,input('9000.00','2024-02-29'));await progress(boundary.id,'9000.00','1000.00','90.00','near_limit');
    await tx.updateTransaction(a.userId,spend.id,input('10000.00','2024-02-29'));await progress(boundary.id,'10000.00','0.00','100.00','near_limit');await tx.updateTransaction(a.userId,spend.id,input('10000.01','2024-02-29'));await progress(boundary.id,'10000.01','-0.01','100.00','exceeded');
    await tx.updateTransaction(a.userId,spend.id,input('9000.01','2024-02-29'));await progress(boundary.id,'9000.01','999.99','90.00','near_limit');await tx.updateTransaction(a.userId,spend.id,input('10000.01','2024-02-29'));
    await tx.createTransaction(a.userId,input('10.00','2024-01-31'));await tx.createTransaction(a.userId,input('10.00','2024-03-01'));await progress(boundary.id,'10000.01','-0.01','100.00','exceeded');
    const large=await create({...body,categoryId:both,year:2025,month:12,amount:'999999999.99'});for(let i=0;i<2;i++)await tx.createTransaction(a.userId,input('999999999.99','2025-12-31',both));await progress(large.id,'1999999999.98','-999999999.99','200.00','exceeded');
    const future=await create({...body,year:9999,month:12});await progress(future.id,'0.00','0.30','0.00','normal');
    const rounding=await create({...body,categoryId:both,year:2024,month:6,amount:'32.00'});await tx.createTransaction(a.userId,input('0.04','2024-06-01',both));await progress(rounding.id,'0.04','31.96','0.13','normal');
    clock=new Date('2026-09-30T20:59:59Z');equal((await request()).body.data.map(r=>r.id),[september.id]);clock=new Date('2026-09-30T21:00:00Z');assert.ok((await request()).body.data.some(r=>r.id===plan.id));checks++;clock=new Date('2026-10-13T09:00:00Z');
    const custom=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,'Historical budget','expense') RETURNING id",[a.userId])).rows[0].id;
    const historic=await create({...body,categoryId:custom,amount:'1.00'});await tx.createTransaction(a.userId,input('0.10','2026-10-01',custom));await pool.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[custom]);
    await progress(historic.id,'0.10','0.90','10.00','normal');expectApiError(await request('','POST',{...body,categoryId:custom,year:2027}),409,'CATEGORY_ARCHIVED');checks++;
    const edited=await request('/'+historic.id,'PUT',{amount:'2.00',alertThresholdPercent:75});equal(edited.status,200);equal(edited.body.data.createdAt,historic.createdAt);equal(edited.body.data.categoryId,custom);assert.ok(edited.body.data.updatedAt>historic.updatedAt);checks++;
    equal((await request('/'+historic.id,'PUT',{amount:'2.00',alertThresholdPercent:75})).body.data,edited.body.data);
    expectApiError(await request('/'+historic.id,'PUT',{...body,categoryId:food,alertThresholdPercent:90}),400,'VALIDATION_ERROR');checks++;equal((await get(historic.id)).amount,'2.00');
    // Real A/B CRUD privacy, including identical foreign and missing resource responses.
    equal((await request('?year=2026&month=10','GET',undefined,tb)).body.data,[]);
    for(const [method,input]of [['GET',undefined],['PUT',{amount:'1.00',alertThresholdPercent:90}],['DELETE',undefined]]){const foreign=await request('/'+plan.id,method,input,tb),missing=await request('/'+randomUUID(),method,input,tb);expectApiError(foreign,404,'NOT_FOUND');equal(foreign.body,missing.body);}
    const bPlan=await request('','POST',{...body,categoryId:both},tb);equal(bPlan.status,201);equal(bPlan.body.data.spent,'0.00');
    // Database uniqueness serializes competing creates.
    const raceInput={...body,year:2027,month:1};equal((await Promise.all([request('','POST',raceInput),request('','POST',raceInput)])).map(r=>r.status).sort(),[201,409]);
    equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.budgets WHERE user_id=$1 AND category_id=$2 AND year=2027 AND month=1',[a.userId,food])).rows[0].n,1);
    const racingCategory=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,'Archive race','expense') RETURNING id",[a.userId])).rows[0].id;
    const archiver=await pool.connect();try{
      await archiver.query('BEGIN');await archiver.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[racingCategory]);
      const pending=request('','POST',{...body,categoryId:racingCategory,year:2029});let waiting=false;
      for(let i=0;i<50;i++){waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT status,kind FROM expense_tracker.categories%') AS waiting")).rows[0].waiting;if(waiting)break;await pause(10);}
      assert.ok(waiting);checks++;await archiver.query('COMMIT');expectApiError(await pending,409,'CATEGORY_ARCHIVED');checks++;
    }finally{await archiver.query('ROLLBACK');archiver.release();}
    for(let i=0;i<4;i++){
      const race=await create({...body,year:2027,month:i+2});const results=await Promise.all([request('/'+race.id,'PUT',{amount:'1.00',alertThresholdPercent:50}),request('/'+race.id,'PUT',{amount:'2.00',alertThresholdPercent:60})]);equal(results.map(r=>r.status),[200,200]);const final=await get(race.id);assert.ok([['1.00',50],['2.00',60]].some(([amount,threshold])=>final.amount===amount&&final.alertThresholdPercent===threshold));checks++;
      const deletion=await Promise.all([request('/'+race.id,'PUT',{amount:'3.00',alertThresholdPercent:70}),request('/'+race.id,'DELETE')]);assert.ok([200,404].includes(deletion[0].status));equal(deletion[1].status,204);expectApiError(await request('/'+race.id),404,'NOT_FOUND');checks+=2;
    }
    // Uncommitted/rolled-back expenses stay invisible; committed writes appear on next read.
    const writer=await pool.connect();try{await writer.query('BEGIN');await writer.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES(gen_random_uuid(),$1,$2,$3,'expense',0.10,'Rollback expense','2026-10-01')",[a.userId,second.id,food]);await progress(plan.id,'0.00','0.30','0.00','normal');await writer.query('ROLLBACK');await progress(plan.id,'0.00','0.30','0.00','normal');}finally{writer.release();}
    // Runtime faults after writes must roll back rows and timestamps.
    const original=await get(plan.id),count=(await pool.query('SELECT count(*)::int n FROM expense_tracker.budgets')).rows[0].n;
    for(const operation of ['create','update','delete']){
      const faulty=createBudgetService({query:pool.query.bind(pool),connect:async()=>{const c=await pool.connect();return {query:async(sql,args)=>{if((operation==='delete'&&sql==='COMMIT')||(operation!=='delete'&&sql===budgetProgressQuery))throw Error('private SQL fault');return c.query(sql,args);},release:c.release.bind(c)};}});
      const faultAuth=await createTestAuthHarness(pool,{budgets:faulty});try{
        const token=await faultAuth.createTestAuthToken(a),r=await faultAuth.rawRequest(token,operation==='create'?'/budgets':'/budgets/'+plan.id,operation==='create'?'POST':operation==='update'?'PUT':'DELETE',operation==='create'?{...body,year:2028}:operation==='update'?{amount:'9.00',alertThresholdPercent:1}:undefined);expectApiError(r,500,'INTERNAL_ERROR');assert.doesNotMatch(JSON.stringify(r.body),/private|SQL|stack/);checks++;
      }finally{await faultAuth.close();}
      equal(await get(plan.id),original);equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.budgets')).rows[0].n,count);
    }
    const txCount=(await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions')).rows[0].n;equal((await request('/'+historic.id,'DELETE')).status,204);equal((await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions')).rows[0].n,txCount);
    // Scale: 32 categories, 24 months, 768 budgets and 30k+ transactions across owners.
    const categories=[];for(const user of [a,b])for(let i=0;i<16;i++)categories.push({owner:user.userId,id:(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,$2,'expense') RETURNING id",[user.userId,'Scale category '+i])).rows[0].id});
    for(const c of categories)await pool.query("INSERT INTO expense_tracker.budgets(user_id,category_id,year,month,amount) SELECT $1,$2,2023+n/12,1+n%12,100.00 FROM generate_series(0,23) n",[c.owner,c.id]);
    await admin.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date)
      SELECT gen_random_uuid(),CASE WHEN n%2=0 THEN $1::uuid ELSE $2::uuid END,CASE WHEN n%2=0 THEN $3::uuid ELSE $4::uuid END,
      ($5::uuid[])[1+(n%32)],'expense',0.10,'Scale actual',DATE '2023-01-01'+n%731 FROM generate_series(1,30000) n`,[a.userId,b.userId,account.id,foreignAccount.id,categories.flatMap((_,i)=>i<16?[categories[i].id,categories[i+16].id]:[])]);
    await admin.query('ANALYZE expense_tracker.transactions; ANALYZE expense_tracker.budgets; ANALYZE expense_tracker.categories;');
    const explain=(await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+budgetProgressQuery,[a.userId,2024,2,null,null])).rows[0]['QUERY PLAN'][0];
    const times=[];for(let i=0;i<8;i++){const start=performance.now();const r=await request('?year=2024&month=2');equal(r.status,200);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
    const list=(await request('?year=2024&month=2')).body.data;for(const item of list)equal(await get(item.id),item);
    equal((await pool.query('SELECT current_user role')).rows[0].role,'expense_tracker_app');for(const sql of ['TRUNCATE expense_tracker.budgets','ALTER TABLE expense_tracker.budgets ADD COLUMN unsafe int'])await assert.rejects(pool.query(sql),e=>e.code==='42501');checks+=2;
    const evidence={checks,transactions:(await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions')).rows[0].n,budgets:(await pool.query('SELECT count(*)::int n FROM expense_tracker.budgets')).rows[0].n,categories:32,months:24,latencyMs:{min:times[0],median:times[4],max:times.at(-1)},executionMs:explain['Execution Time'],planningMs:explain['Planning Time'],plan:explain.Plan,newIndex:false,remoteTouched:false};
    mkdirSync(new URL('../../.tmp-v2-t42/',import.meta.url),{recursive:true});writeFileSync(new URL('../../.tmp-v2-t42/performance.json',import.meta.url),JSON.stringify(evidence,null,2));context.diagnostic(JSON.stringify({...evidence,plan:undefined}));
  }finally{await auth?.close();await pool?.end();await admin.end();}
});

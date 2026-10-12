import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Client,Pool} from 'pg';
import {validateRecurringBody,validateRecurringQuery,validateUpcomingQuery} from '../dist/validators/recurring.js';
import {createRecurringService} from '../dist/services/recurring.js';
import {createRecurringOccurrenceService} from '../dist/services/recurring-occurrences.js';
import {createAccountService} from '../dist/services/accounts.js';
import {getFirstOccurrenceOnOrAfter} from '../dist/domain/recurrence.js';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createTestAuthHarness,financialSnapshot,expectApiError} from './helpers/v2-isolation.mjs';

const ids={account:randomUUID(),category:randomUUID()};
const base={accountId:ids.account,categoryId:ids.category,type:'income',amount:'0.10',description:'Salary',frequency:'monthly',startDate:'2026-01-31',endDate:null};
test('T29 strict public input, exact money, Unicode, T30 date validation and filters',()=>{
  assert.deepEqual(validateRecurringBody({...base,description:'  😀 salary  ',amount:'1'}),{...base,description:'😀 salary',amount:'1.00'});
  const omitted={...base};delete omitted.endDate;assert.deepEqual(validateRecurringBody(omitted),base);
  for(const field of ['userId','ownerId','status','nextOccurrence','weekday','dayOfMonth','occurrenceDate','generatedTransactionId','currency','unknown'])assert.throws(()=>validateRecurringBody({...base,[field]:ids.account}),e=>e.code==='VALIDATION_ERROR');
  for(const amount of [0.1,'0','0.00','0.001','1.230','1000000000','01','1e2','+1',' 1','-1','NaN',null])assert.throws(()=>validateRecurringBody({...base,amount}));
  for(const amount of ['0.01','0.1','0.20','999999999.99'])assert.equal(typeof validateRecurringBody({...base,amount}).amount,'string');
  for(const description of ['', ' '.repeat(4),'😀'.repeat(201),'a\u0000b','\ud800'])assert.throws(()=>validateRecurringBody({...base,description}));
  assert.equal(Array.from(validateRecurringBody({...base,description:'😀'.repeat(200)}).description).length,200);
  for(const input of [null,[],true,{}, {...base,type:'transfer'},{...base,frequency:'quarterly'},{...base,startDate:'2026-02-29'},{...base,startDate:'1899-12-31'},{...base,startDate:'10000-01-01'},{...base,endDate:'2026-01-30'},{...base,endDate:7},{...base,accountId:'x'}])assert.throws(()=>validateRecurringBody(input));
  assert.deepEqual(validateRecurringQuery('/recurring?status=paused&type=income&frequency=yearly&accountId='+ids.account+'&categoryId='+ids.category),{status:'paused',type:'income',frequency:'yearly',accountId:ids.account,categoryId:ids.category});
  assert.deepEqual(validateRecurringQuery('/recurring'),{});
  for(const query of ['q=a','limit=1','cursor=x','status=all','type=transfer','frequency=quarterly','accountId=x','categoryId[]=x','status=active&status=active','status='])assert.throws(()=>validateRecurringQuery('/recurring?'+query));
  assert.equal(validateUpcomingQuery('/recurring/upcoming'),30);assert.equal(validateUpcomingQuery('/recurring/upcoming?days=366'),366);
  for(const query of ['days=0','days=367','days=01','days=1&days=2','unknown=x'])assert.throws(()=>validateUpcomingQuery('/recurring/upcoming?'+query));
});

test('T29 real JWT routing rejects unsafe inputs before SQL and sanitizes failures',async()=>{
  let queries=0;const failure=Object.assign(new Error('private SQL credentials'),{code:'ECONNREFUSED'});
  const database={query:async()=>{queries++;throw failure;},connect:async()=>{queries++;throw failure;}};
  const auth=await createTestAuthHarness(database),id=randomUUID();
  const endpoints=[['/recurring','GET'],['/recurring','POST',base],['/recurring/'+id,'GET'],['/recurring/'+id,'PUT',base],...['pause','resume','archive'].map(action=>['/recurring/'+id+'/'+action,'POST',{}]),['/recurring/upcoming','GET']];
  try {
    const token=await auth.createTestAuthToken({userId:randomUUID()});
    for(const [path,method,body] of endpoints)for(const credential of [null,'invalid.token'])assert.equal((await auth.rawRequest(credential,path,method,body)).status,401);
    for(const [path,method,body] of [['/recurring?status=active&status=paused','GET'],['/recurring/no-uuid','GET'],['/recurring','POST',{...base,userId:id}],['/recurring/'+id,'PUT',{...base,status:'active'}],['/recurring/'+id+'/pause','POST',{nextOccurrence:'2026-01-01'}],['/recurring/'+id+'/resume?userId='+id,'POST',{}],['/recurring/upcoming?days=367','GET']])assert.equal((await auth.rawRequest(token,path,method,body)).status,400);
    assert.equal(queries,0);
    for(const [path,method,body,allow] of [['/recurring','DELETE',undefined,'GET, POST'],['/recurring/'+id,'DELETE',undefined,'GET, PUT'],['/recurring/'+id+'/pause','GET',undefined,'POST'],['/recurring/upcoming','POST',{},'GET']]){
      const result=await auth.rawRequest(token,path,method,body);assert.equal(result.status,405);assert.equal(result.allow,allow);
    }
    assert.equal((await auth.rawRequest(token,'/recurring/'+id+'/restore','POST',{})).status,404);
    for(const [path,method,body] of endpoints){const result=await auth.rawRequest(token,path,method,body);expectApiError(result,503,'DATABASE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(result.body),/private|SQL|credentials/);}
  }finally{await auth.close();}
});

test('T29 fresh limited-role API lifecycle, history, isolation, races and rollback',{
  skip:!process.env.T29_DISPOSABLE_DATABASE_URL&&'Requires a fresh isolated loopback PostgreSQL cluster',
},async()=>{
  const url=disposableIsolationUrl(process.env.T29_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();
  let pool,auth,checks=0,races=0,faults=0;
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const error=(result,status,code)=>{expectApiError(result,status,code);checks++;};
  const rejects=async(operation,predicate)=>{await assert.rejects(operation,predicate);checks++;};
  let clock=new Date('2026-10-09T09:00:00Z');const now=()=>clock;
  try{
    await prepareIsolationDatabase(admin);const a={userId:randomUUID()},b={userId:randomUUID()};
    for(const user of [a,b])await createTestUser(admin,user);
    url.username='expense_tracker_app';pool=new Pool({connectionString:url.href,max:10});
    auth=await createTestAuthHarness(pool,{now});const tokenA=await auth.createTestAuthToken(a),tokenB=await auth.createTestAuthToken(b);
    const request=auth.rawRequest,ledger=createRecurringOccurrenceService(pool),accounts=createAccountService(pool);
    const account=await accounts.createAccount(a.userId,{name:'T29 Bank',type:'bank',openingBalance:'250.00'});
    const foreignAccount=await accounts.createAccount(b.userId,{name:'T29 Bank',type:'bank',openingBalance:'7.00'});
    const category='c1200000-0000-4000-8000-000000000001';
    const custom=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,'A custom','income') RETURNING id",[a.userId])).rows[0].id;
    const foreignCategory=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,'B custom','income') RETURNING id",[b.userId])).rows[0].id;
    const body=(overrides={})=>({...base,accountId:account.id,categoryId:category,...overrides});
    async function create(input=body(),token=tokenA){const result=await request(token,'/recurring','POST',input);equal(result.status,201);equal(result.cache,'no-store');equal(result.location,'/api/v2/recurring/'+result.body.data.id);return result.body.data;}
    async function action(id,name,token=tokenA){const result=await request(token,'/recurring/'+id+'/'+name,'POST',{});equal(result.status,200);return result.body.data;}
    async function update(id,input=body()){const result=await request(tokenA,'/recurring/'+id,'PUT',input);equal(result.status,200);return result.body.data;}
    const get=async id=>{const result=await request(tokenA,'/recurring/'+id);equal(result.status,200);return result.body.data;};
    const financial=async()=>({summary:await accounts.getAccountSummary(a.userId,account.id),net:await accounts.getSummary(a.userId),transactions:(await pool.query('SELECT to_jsonb(t) row FROM expense_tracker.transactions t ORDER BY id')).rows,transfers:(await pool.query('SELECT to_jsonb(t) row FROM expense_tracker.transfers t ORDER BY id')).rows});
    const noFinance=await financial();
    equal((await pool.query('SELECT current_user')).rows[0].current_user,'expense_tracker_app');
    const original=await create();equal(original.nextOccurrence,'2026-10-31');equal(original.exhausted,false);equal(original.amount,'0.10');equal(original.accountName,'T29 Bank');equal(original.categoryName,'Salary');
    equal(Object.keys(original).sort(),['id','accountId','accountName','categoryId','categoryName','type','amount','currency','description','frequency','startDate','nextOccurrence','endDate','status','exhausted','createdAt','updatedAt'].sort());
    equal(await get(original.id),original);
    equal(await update(original.id),original);
    const updated=await update(original.id,body({amount:'999999999.99',description:' 😀 updated ',frequency:'weekly'}));equal(updated.amount,'999999999.99');equal(updated.description,'😀 updated');equal(updated.nextOccurrence,'2026-10-10');
    const paused=await action(original.id,'pause');equal(paused.status,'paused');equal(paused.nextOccurrence,null);equal(paused.exhausted,false);equal(await action(original.id,'pause'),paused);
    const pausedEdit=await update(original.id,body({frequency:'daily'}));equal(pausedEdit.status,'paused');equal(pausedEdit.nextOccurrence,null);
    const active=await action(original.id,'resume');equal(active.nextOccurrence,'2026-10-09');equal(await action(original.id,'resume'),active);
    const archived=await action(original.id,'archive');equal(archived.status,'archived');equal(archived.nextOccurrence,null);equal(await action(original.id,'archive'),archived);
    for(const [suffix,method,input] of [['','PUT',body()],['/pause','POST',{}],['/resume','POST',{}]])error(await request(tokenA,'/recurring/'+original.id+suffix,method,input),409,'CONFLICT');
    for(const [field,value,code] of [['accountId',foreignAccount.id,'NOT_FOUND'],['categoryId',foreignCategory,'NOT_FOUND'],['accountId',randomUUID(),'NOT_FOUND'],['categoryId',randomUUID(),'NOT_FOUND']])error(await request(tokenA,'/recurring','POST',body({[field]:value})),404,code);
    error(await request(tokenA,'/recurring','POST',body({type:'expense'})),400,'VALIDATION_ERROR');
    const visible=await create(body({categoryId:custom}));
    for(const [suffix,method,input] of [['','GET',undefined],['','PUT',body({accountId:foreignAccount.id})],['/pause','POST',{}],['/resume','POST',{}],['/archive','POST',{}]]){
      const foreign=await request(tokenB,'/recurring/'+visible.id+suffix,method,input),missing=await request(tokenB,'/recurring/'+randomUUID()+suffix,method,input);
      error(foreign,404,'NOT_FOUND');error(missing,404,'NOT_FOUND');equal(foreign.body,missing.body);
    }
    equal((await request(tokenB,'/recurring')).body,{data:[],meta:{count:0}});
    error(await request(tokenB,'/recurring','POST',body()),404,'NOT_FOUND');
    error(await request(tokenB,'/recurring','POST',body({accountId:foreignAccount.id,categoryId:custom})),404,'NOT_FOUND');
    const ownB=await create(body({accountId:foreignAccount.id,categoryId:foreignCategory}),tokenB);equal((await request(tokenB,'/recurring')).body.data.map(r=>r.id),[ownB.id]);
    equal((await request(tokenA,'/recurring?accountId='+foreignAccount.id)).body.data,[]);equal((await request(tokenA,'/recurring?categoryId='+foreignCategory)).body.data,[]);
    for(const [query,predicate] of [['status=active',r=>r.status==='active'],['type=income',r=>r.type==='income'],['accountId='+account.id,r=>r.accountId===account.id],['categoryId='+custom,r=>r.categoryId===custom],['frequency=monthly',r=>r.frequency==='monthly'],['status=active&type=income&frequency=monthly&categoryId='+custom,r=>r.id===visible.id]]){
      const result=await request(tokenA,'/recurring?'+query);equal(result.status,200);equal(result.body.meta.count,result.body.data.length);equal(result.body.data.every(predicate),true);
    }
    for(const frequency of ['daily','weekly','monthly','yearly']){
      const input=body({frequency,startDate:'1900-01-31'}),row=await create(input);equal(row.nextOccurrence,getFirstOccurrenceOnOrAfter({frequency,startDate:input.startDate,endDate:null},'2026-10-09'));
      equal((await pool.query('SELECT count(*)::int count FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1',[row.id])).rows[0].count,0);
    }
    const today=await create(body({frequency:'daily',startDate:'2026-10-09',endDate:'2026-10-09'}));equal(today.nextOccurrence,'2026-10-09');
    const future=await create(body({frequency:'daily',startDate:'2027-01-01'}));equal(future.nextOccurrence,'2027-01-01');
    const exhausted=await create(body({endDate:'2026-02-28'}));equal(exhausted.status,'active');equal(exhausted.nextOccurrence,null);equal(exhausted.exhausted,true);
    await action(today.id,'pause');clock=new Date('2026-10-10T09:00:00Z');const ended=await action(today.id,'resume');equal(ended.nextOccurrence,null);equal(ended.exhausted,true);
    const editExhausted=await update(future.id,body({endDate:'2026-02-28'}));equal(editExhausted.exhausted,true);
    clock=new Date('2027-02-28T09:00:00Z');const month=await create(body({startDate:'2027-01-31',endDate:'2027-03-31'}));equal(month.nextOccurrence,'2027-02-28');
    await action(month.id,'pause');clock=new Date('2027-03-01T09:00:00Z');equal((await action(month.id,'resume')).nextOccurrence,'2027-03-31');
    equal((await update(month.id,body({startDate:'2027-01-31',endDate:'2027-03-30'}))).nextOccurrence,null);
    clock=new Date('2025-02-28T09:00:00Z');const leap=await create(body({startDate:'2024-02-29',frequency:'yearly',endDate:'2028-02-29'}));equal(leap.nextOccurrence,'2025-02-28');
    await action(leap.id,'pause');clock=new Date('2028-02-28T09:00:00Z');equal((await action(leap.id,'resume')).nextOccurrence,'2028-02-29');
    equal((await update(leap.id,body({startDate:'2024-02-29',frequency:'yearly',endDate:'2028-02-28'}))).nextOccurrence,null);
    clock=new Date('2026-10-09T09:00:00Z');
    const gap=await create(body({frequency:'daily',startDate:'1900-01-01'}));await action(gap.id,'pause');clock=new Date('2026-11-20T09:00:00Z');equal((await action(gap.id,'resume')).nextOccurrence,'2026-11-20');
    equal((await pool.query('SELECT count(*)::int count FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1',[gap.id])).rows[0].count,0);
    clock=new Date('2026-10-09T09:00:00Z');
    const ledgerRow=await create(body({frequency:'daily',startDate:'1900-01-01'}));
    // A terminal marker is created by T32, never by a parallel ledger writer.
    await ledger.reserveOccurrence(a.userId,ledgerRow.id,'2026-10-09');await ledger.transitionOccurrence(a.userId,ledgerRow.id,'2026-10-09','skip');
    const skipped=await ledger.getOccurrence(a.userId,ledgerRow.id,'2026-10-09');
    equal((await update(ledgerRow.id,body({frequency:'daily',startDate:'1900-01-01'}))).nextOccurrence,'2026-10-10');
    await action(ledgerRow.id,'pause');equal((await action(ledgerRow.id,'resume')).nextOccurrence,'2026-10-10');equal(await ledger.getOccurrence(a.userId,ledgerRow.id,'2026-10-09'),skipped);
    await ledger.reserveOccurrence(a.userId,ledgerRow.id,'2026-10-10');await ledger.transitionOccurrence(a.userId,ledgerRow.id,'2026-10-10','fail','POSTING_FAILED');
    const failed=await ledger.getOccurrence(a.userId,ledgerRow.id,'2026-10-10');
    equal((await update(ledgerRow.id,body({frequency:'daily',startDate:'1900-01-01'}))).nextOccurrence,'2026-10-11');
    const failedSkip=await ledger.getOccurrence(a.userId,ledgerRow.id,'2026-10-10');equal(failedSkip.status,'skipped');equal(failedSkip.createdAt,failed.createdAt);equal(failedSkip.occurrenceDate,failed.occurrenceDate);equal(failedSkip.failureCode,null);
    equal(await financial(),noFinance);
    // Synthetic historical posting is solely T32 verification; lifecycle never posts.
    await ledger.reserveOccurrence(a.userId,ledgerRow.id,'1900-01-01');const posted=await ledger.postOccurrence(a.userId,ledgerRow.id,'1900-01-01');
    const postedFinance=await financial();await update(ledgerRow.id,body({frequency:'weekly',startDate:'1900-01-01',amount:'0.20'}));await action(ledgerRow.id,'pause');await action(ledgerRow.id,'resume');
    equal(await ledger.getOccurrence(a.userId,ledgerRow.id,'1900-01-01'),posted);equal(await ledger.getOccurrence(a.userId,ledgerRow.id,'2026-10-09'),skipped);equal(await financial(),postedFinance);
    await action(ledgerRow.id,'archive');equal(await ledger.getOccurrence(a.userId,ledgerRow.id,'1900-01-01'),posted);equal(await ledger.getOccurrence(a.userId,ledgerRow.id,'2026-10-09'),skipped);equal(await ledger.getOccurrence(a.userId,ledgerRow.id,'2026-10-10'),failedSkip);equal(await financial(),postedFinance);
    // A posted-today date also cannot replay, even after its generated transaction is deleted.
    const current=await create(body({frequency:'daily',startDate:'1900-01-01'}));await ledger.reserveOccurrence(a.userId,current.id,'2026-10-09');const currentPosted=await ledger.postOccurrence(a.userId,current.id,'2026-10-09');
    equal((await request(tokenA,'/transactions/'+currentPosted.generatedTransactionId,'DELETE')).status,204);
    const deleted=await ledger.getOccurrence(a.userId,current.id,'2026-10-09');equal(deleted.status,'posted');equal(deleted.generatedTransactionId,null);
    equal((await update(current.id,body({frequency:'daily',startDate:'1900-01-01'}))).nextOccurrence,'2026-10-10');await action(current.id,'pause');equal((await action(current.id,'resume')).nextOccurrence,'2026-10-10');equal(await ledger.getOccurrence(a.userId,current.id,'2026-10-09'),deleted);
    // Actual account API archive/restore keeps definitions paused until explicit resume.
    const archiveAccount=await accounts.createAccount(a.userId,{name:'Archive interaction',type:'cash',openingBalance:'0.00'});
    const accountSchedule=await create(body({accountId:archiveAccount.id,frequency:'daily',startDate:'1900-01-01'}));await ledger.reserveOccurrence(a.userId,accountSchedule.id,'2026-10-09');
    equal((await request(tokenA,'/accounts/'+archiveAccount.id+'/archive','POST',{})).status,200);equal((await get(accountSchedule.id)).status,'paused');equal((await ledger.getOccurrence(a.userId,accountSchedule.id,'2026-10-09')).status,'skipped');
    error(await request(tokenA,'/recurring/'+accountSchedule.id+'/resume','POST',{}),409,'ACCOUNT_ARCHIVED');error(await request(tokenA,'/recurring','POST',body({accountId:archiveAccount.id})),409,'ACCOUNT_ARCHIVED');
    equal((await request(tokenA,'/accounts/'+archiveAccount.id+'/restore','POST',{})).status,200);equal((await get(accountSchedule.id)).status,'paused');equal((await action(accountSchedule.id,'resume')).nextOccurrence,'2026-10-10');
    const categorySchedule=await create(body({categoryId:custom}));await pool.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[custom]);
    equal((await get(categorySchedule.id)).status,'paused');equal((await get(categorySchedule.id)).categoryName,'A custom');
    error(await request(tokenA,'/recurring','POST',body({categoryId:custom})),409,'CATEGORY_ARCHIVED');error(await request(tokenA,'/recurring/'+categorySchedule.id,'PUT',body({categoryId:custom})),409,'CATEGORY_ARCHIVED');error(await request(tokenA,'/recurring/'+categorySchedule.id+'/resume','POST',{}),409,'CATEGORY_ARCHIVED');
    await pool.query("UPDATE expense_tracker.categories SET status='active' WHERE id=$1",[custom]);equal((await get(categorySchedule.id)).status,'paused');equal((await action(categorySchedule.id,'resume')).status,'active');
    // Read-only bounded projection, filters, stable order and terminal exclusions.
    const beforeRead=await financialSnapshot(pool),upcoming=await request(tokenA,'/recurring/upcoming?days=3');equal(upcoming.status,200);equal(upcoming.body.meta,{from:'2026-10-09',to:'2026-10-11'});equal(await financialSnapshot(pool),beforeRead);
    equal(upcoming.body.data.some(r=>r.recurringTransactionId===current.id&&r.occurrenceDate==='2026-10-09'),false);equal(upcoming.body.data.every(r=>!Object.hasOwn(r,'userId')&&r.occurrenceDate>='2026-10-09'&&r.occurrenceDate<='2026-10-11'),true);
    equal(upcoming.body.data.map(r=>r.occurrenceDate+':'+r.recurringTransactionId),[...upcoming.body.data].sort((a,b)=>a.occurrenceDate.localeCompare(b.occurrenceDate)||a.recurringTransactionId.localeCompare(b.recurringTransactionId)).map(r=>r.occurrenceDate+':'+r.recurringTransactionId));
    const list=(await request(tokenA,'/recurring')).body.data;const rank=r=>r.status==='active'?0:r.status==='paused'?1:2;
    equal(list.map(r=>r.id),[...list].sort((a,b)=>rank(a)-rank(b)||(a.nextOccurrence??'zzzz').localeCompare(b.nextOccurrence??'zzzz')||a.id.localeCompare(b.id)).map(r=>r.id));
    // Every lifecycle failure rolls back all rows, timestamps and financial effects.
    const faultPool=(pattern,after=true)=>({query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();let fired=false;return {query:async(sql,args)=>{
      const match=!fired&&pattern.test(sql);if(match&&!after){fired=true;throw new Error('T29 injected fault');}const result=await client.query(sql,args);if(match){fired=true;throw new Error('T29 injected fault');}return result;
    },release:client.release.bind(client)};}});
    for(const [method,setup,args,pattern] of [
      ['createRecurring',async()=>null,()=>[body()],/INSERT INTO expense_tracker.recurring_transactions/],
      ['updateRecurring',async()=>create(body({frequency:'daily',startDate:'1900-01-01'})),row=>[row.id,body({frequency:'weekly',amount:'0.20'})],/UPDATE expense_tracker.recurring_transactions/],
      ['pauseRecurring',async()=>create(),row=>[row.id],/UPDATE expense_tracker.recurring_transactions/],
      ['resumeRecurring',async()=>{const row=await create();await action(row.id,'pause');return row;},row=>[row.id],/UPDATE expense_tracker.recurring_transactions/],
      ['archiveRecurring',async()=>create(),row=>[row.id],/UPDATE expense_tracker.recurring_transactions/],
    ]){
      const row=await setup();if(row)await ledger.reserveOccurrence(a.userId,row.id,'2026-01-31').catch(e=>{assert.equal(e.status,409);});
      for(const selected of [pattern,/^COMMIT$/]){const before=await financialSnapshot(pool);await rejects(createRecurringService(faultPool(selected,selected.source!=='^COMMIT$'),{now})[method](a.userId,...args(row)),/T29 injected fault/);equal(await financialSnapshot(pool),before);faults++;}
    }
    const skipFault=await create(body({frequency:'daily',startDate:'1900-01-01'}));await ledger.reserveOccurrence(a.userId,skipFault.id,'2026-10-09');const beforeSkip=await financialSnapshot(pool);
    await rejects(createRecurringService(faultPool(/UPDATE expense_tracker.recurring_occurrences/),{now}).pauseRecurring(a.userId,skipFault.id),/T29 injected fault/);equal(await financialSnapshot(pool),beforeSkip);faults++;
    // Force and observe real database waiting for both orderings of each requested race.
    async function contend(first,second,pattern){
      let signal,release,firstPid,secondPid;const ready=new Promise(resolve=>signal=resolve),gate=new Promise(resolve=>release=resolve);
      const wrap=isFirst=>({query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();if(isFirst)firstPid=client.processID;else secondPid=client.processID;let gated=false;return {query:async(sql,args)=>{const result=await client.query(sql,args);if(isFirst&&!gated&&pattern.test(sql)){gated=true;signal();await gate;}return result;},release:client.release.bind(client)};}});
      const one=first(wrap(true));await ready;const two=second(wrap(false));
      // Attach handlers before waiting to avoid transient unhandled rejection reports.
      const results=Promise.allSettled([one,two]);
      try{let observed=false;for(let attempt=0;attempt<300;attempt++){if(secondPid&&(await admin.query('SELECT $1::int=ANY(pg_blocking_pids($2)) AS blocked',[firstPid,secondPid])).rows[0].blocked){observed=true;break;}await delay(10);}equal(observed,true);}finally{release();}
      const outcomes=await results;for(const result of outcomes)if(result.status==='rejected')equal([409].includes(result.reason.status),true);races++;return outcomes;
    }
    const defLock=/FOR UPDATE OF r/;
    for(const reverse of [false,true]){
      const race=await create(body({frequency:'daily',startDate:'1900-01-01'}));
      const pause=db=>createRecurringService(db,{now}).pauseRecurring(a.userId,race.id),edit=db=>createRecurringService(db,{now}).updateRecurring(a.userId,race.id,body({frequency:'daily',startDate:'1900-01-01',amount:'0.20'}));
      await contend(reverse?edit:pause,reverse?pause:edit,defLock);equal((await get(race.id)).status,'paused');equal((await get(race.id)).amount,'0.20');equal((await get(race.id)).nextOccurrence,null);
      const resume=db=>createRecurringService(db,{now}).resumeRecurring(a.userId,race.id),archive=db=>createRecurringService(db,{now}).archiveRecurring(a.userId,race.id);
      await contend(reverse?archive:resume,reverse?resume:archive,defLock);equal((await get(race.id)).status,'archived');equal((await get(race.id)).nextOccurrence,null);
      const editRace=await create();const change=db=>createRecurringService(db,{now}).updateRecurring(a.userId,editRace.id,body({amount:'0.20'})),close=db=>createRecurringService(db,{now}).archiveRecurring(a.userId,editRace.id);
      await contend(reverse?close:change,reverse?change:close,defLock);equal((await get(editRace.id)).status,'archived');
    }
    for(const method of ['pauseRecurring','resumeRecurring']){
      const row=await create();if(method==='resumeRecurring')await action(row.id,'pause');
      const operation=db=>createRecurringService(db,{now})[method](a.userId,row.id);const results=await contend(operation,operation,defLock);equal(results[0].value,results[1].value);equal(await get(row.id),results[0].value);
    }
    for(const reverse of [false,true]){
      const parent=await accounts.createAccount(a.userId,{name:'Race account '+reverse,type:'cash',openingBalance:'0.00'}),row=await create(body({accountId:parent.id}));await action(row.id,'pause');
      const resume=db=>createRecurringService(db,{now}).resumeRecurring(a.userId,row.id),archive=db=>createAccountService(db).archiveAccount(a.userId,parent.id);
      await contend(reverse?resume:archive,reverse?archive:resume,/SELECT status FROM expense_tracker.accounts|SELECT opening_balance,opening_balance_locked,type,status/);
      equal((await get(row.id)).status,'paused');equal((await get(row.id)).nextOccurrence,null);equal((await accounts.getAccount(a.userId,parent.id)).status,'archived');
    }
    // Changing references while resume discovers them produces a safe conflict, never stale-parent activation.
    const moved=await create(),newAccount=await accounts.createAccount(a.userId,{name:'Move reference',type:'cash',openingBalance:'0.00'});await action(moved.id,'pause');
    let discoveredSignal,continueResume;const discovered=new Promise(resolve=>discoveredSignal=resolve),resumeGate=new Promise(resolve=>continueResume=resolve);
    const discoveryPool={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();let gated=false;return {query:async(sql,args)=>{const result=await client.query(sql,args);if(!gated&&sql.includes('WHERE r.id=$1')&&!sql.includes('FOR UPDATE')){gated=true;discoveredSignal();await resumeGate;}return result;},release:client.release.bind(client)};}};
    const resuming=createRecurringService(discoveryPool,{now}).resumeRecurring(a.userId,moved.id);const rejected=rejects(resuming,e=>e.status===409);await discovered;await update(moved.id,body({accountId:newAccount.id}));continueResume();await rejected;equal((await get(moved.id)).status,'paused');equal((await get(moved.id)).accountId,newAccount.id);
    equal((await pool.query("SELECT has_table_privilege('anon','expense_tracker.recurring_transactions','SELECT') anon,has_table_privilege('authenticated','expense_tracker.recurring_transactions','SELECT') authenticated")).rows[0],{anon:false,authenticated:false});
    process.stdout.write(`T29 integration: ${checks} checks passed; ${races} forced races; ${faults} rollback faults; runtime role, real User A/B JWT API, T30 anchors, T32 history and T18 financial non-effect.\n`);
  }finally{if(auth)await auth.close();if(pool)await pool.end();await admin.end();}
});

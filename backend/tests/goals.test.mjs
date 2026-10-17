import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';
import {Client,Pool} from 'pg';
import {createApp} from '../dist/app.js';
import {createGoalService,goalProgressQuery} from '../dist/services/goals.js';
import {validateGoalBody,validateGoalQuery} from '../dist/validators/goal.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createTransferService} from '../dist/services/transfers.js';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createTestAuthHarness,financialSnapshot,expectApiError} from './helpers/v2-isolation.mjs';
import {verifyGoalIsolation} from './helpers/goal-isolation.mjs';

const input={name:'Manual goal',targetAmount:'0.30',savedAmount:'0.10',targetDate:null,linkedAccountId:null};
const update=(goal,changes={})=>({name:goal.name,targetAmount:goal.targetAmount,savedAmount:goal.savedAmount,targetDate:goal.targetDate,linkedAccountId:goal.linkedAccountId,status:goal.status,...changes});

test('T45 frozen strict Unicode, exact money, optional dates/links, full PUT and status query',()=>{
  assert.deepEqual(validateGoalBody({name:'  هدف 😀  ',targetAmount:'1',savedAmount:'0'},true),{...input,name:'هدف 😀',targetAmount:'1.00',savedAmount:'0.00'});
  for(const name of ['😀'.repeat(120),'س'.repeat(120)])assert.equal(validateGoalBody({...input,name},true).name,name);
  for(const targetDate of ['1900-01-01','2000-02-29','2024-02-29','9999-12-31',null])assert.equal(validateGoalBody({...input,targetDate},true).targetDate,targetDate);
  for(const value of ['0.01','999999999.99','1','0.3'])assert.ok(validateGoalBody({...input,targetAmount:value,savedAmount:value},true));
  for(const value of ['0','0.0','0.00'])assert.equal(validateGoalBody({...input,savedAmount:value},true).savedAmount,'0.00');
  for(const body of [null,[],{},...['','  ','😀'.repeat(121),'x\u0000y','\ud800'].map(name=>({...input,name})),...[0,0.3,'0','-1','01','+1','1e2','1.001','1000000000',' 1','1.','NaN','Infinity'].map(targetAmount=>({...input,targetAmount})),...[0,-1,'-0','-0.01','1e2','01','1.001','1000000000',' 1'].map(savedAmount=>({...input,savedAmount})),...['1899-12-31','1900-02-29','2026-02-29','2026-04-31','2026-1-01','10000-01-01','2026-01-01T00:00:00Z','',42].map(targetDate=>({...input,targetDate})),...['',42,{},'invalid'].map(linkedAccountId=>({...input,linkedAccountId})),...['userId','ownerId','createdBy','status','completedAt','createdAt','updatedAt','percentComplete','completionSuggested','linkedAccountName'].map(field=>({...input,[field]:'x'}))])assert.throws(()=>validateGoalBody(body,true),e=>e.code==='VALIDATION_ERROR');
  const full={...input,status:'active'};assert.deepEqual(validateGoalBody(full),full);
  for(const field of Object.keys(full)){const body={...full};delete body[field];assert.throws(()=>validateGoalBody(body),e=>e.code==='VALIDATION_ERROR');}
  for(const status of ['archived','ACTIVE',null,''])assert.throws(()=>validateGoalBody({...full,status}),e=>e.code==='VALIDATION_ERROR');
  assert.equal(validateGoalQuery('/goals'),undefined);
  for(const status of ['active','completed','archived'])assert.equal(validateGoalQuery('/goals?status='+status),status);
  for(const query of ['status=','status=ACTIVE','status=all','status=active&status=active','status[]=active','ownerId=x','userId=x','limit=1','search=x'])assert.throws(()=>validateGoalQuery('/goals?'+query),e=>e.code==='VALIDATION_ERROR');
});

test('T45 real JWT guards, validation before SQL, no-store, 405 and sanitized errors',async()=>{
  let calls=0,failure=Object.assign(Error('private SQL details'),{code:'ECONNREFUSED'});
  const db={query:async()=>{calls++;throw failure;},connect:async()=>{calls++;throw failure;}};
  const auth=await createTestAuthHarness(db);const user={userId:randomUUID()},token=await auth.createTestAuthToken(user),id=randomUUID();
  const routes=[['/goals','GET'],['/goals','POST',input],['/goals/'+id,'GET'],['/goals/'+id,'PUT',{...input,status:'active'}],['/goals/'+id+'/complete','POST',{}],['/goals/'+id+'/archive','POST',{}]];
  try {
    for(const credential of [null,'bad.token',await auth.createTestAuthToken(user,{wrongKey:true}),await auth.createTestAuthToken(user,{expiration:'-1s'})])for(const [path,method,body]of routes)expectApiError(await auth.rawRequest(credential,path,method,body),401,credential===null?'AUTH_REQUIRED':'AUTH_INVALID');
    for(const [path,method,body]of [['/goals?status=active&status=completed','GET'],['/goals?ownerId=x','GET'],['/goals','POST',{...input,userId:id}],['/goals/'+id,'PUT',input],['/goals/not-id','GET'],['/goals/'+id+'?ownerId=x','GET'],['/goals/'+id+'/complete','POST',{status:'completed'}],['/goals/'+id+'/archive?x=1','POST',{}]])expectApiError(await auth.rawRequest(token,path,method,body),400,'VALIDATION_ERROR');
    for(const [path,method,allow]of [['/goals','PUT','GET, POST'],['/goals/'+id,'DELETE','GET, PUT'],['/goals/'+id,'PATCH','GET, PUT'],['/goals/'+id+'/complete','GET','POST'],['/goals/'+id+'/archive','PUT','POST']]){const result=await auth.rawRequest(token,path,method,method==='PUT'?{}:undefined);expectApiError(result,405,'METHOD_NOT_ALLOWED');assert.equal(result.allow,allow);}
    assert.equal(calls,0);
    for(const [path,method,body]of routes){const result=await auth.rawRequest(token,path,method,body);expectApiError(result,503,'DATABASE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(result.body),/private|SQL|stack|constraint/);}
    const logs=[],original=console.error;console.error=(message)=>logs.push(message);
    try{failure=Error('private SQL constraint');expectApiError(await auth.rawRequest(token,'/goals'),500,'INTERNAL_ERROR');assert.deepEqual(logs,['Unexpected API error']);}finally{console.error=original;}
  }finally{await auth.close();}
});

test('T45 broken rollback discards client without retries; T67 production Goals use the release guard',async()=>{
  let released,calls=0;const service=createGoalService({connect:async()=>({query:async sql=>{calls++;if(sql==='BEGIN')return {rows:[]};throw Error('private');},release:value=>{released=value;}})});
  await assert.rejects(service.createGoal(randomUUID(),input));assert.equal(released,true);assert.equal(calls,3);
  assert.match(readFileSync(new URL('../server.mjs',import.meta.url),'utf8'),/goals:\s*createGoalService/);
  assert.match(readFileSync(new URL('../server.mjs',import.meta.url),'utf8'),/releaseAccess:\s*release/);
  assert.match(readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'),/goals:createGoalService/);
  assert.match(readFileSync(new URL('../../frontend/src/app/v2/layout.tsx',import.meta.url),'utf8'),/NODE_ENV !== "development"/);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')).crons,[{path:'/internal/recurring/process',schedule:'0 3 * * *'}]);
  const server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,financialMode:'v2'}).listen(0,'127.0.0.1');await once(server,'listening');
  try{for(const path of ['/goals','/goals/'+randomUUID(),'/goals/'+randomUUID()+'/complete']){const response=await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api/v2${path}`);assert.equal(response.status,404);assert.equal(response.headers.get('Cache-Control'),'no-store');}}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

// Intercept after the real statement executes, preserving its actual locks/write.
function instrument(pool,after) {
  return {query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,params)=>{const result=await client.query(sql,params);await after(sql,result);return result;},release:discard=>client.release(discard)};}};
}

test('T45 fresh limited-role HTTP lifecycle, exact progress, isolation, races, rollback and plans',{
  skip:!process.env.T45_DISPOSABLE_DATABASE_URL&&'Requires a fresh guarded loopback PostgreSQL cluster',
},async context=>{
  const url=disposableIsolationUrl(process.env.T45_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();let pool,auth,checks=0,races=0,faults=0;
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  try {
    await prepareIsolationDatabase(admin);url.username='expense_tracker_app';pool=new Pool({connectionString:url.href,max:8});
    const a={userId:randomUUID()},b={userId:randomUUID()};for(const user of [a,b])await createTestUser(admin,user);
    auth=await createTestAuthHarness(pool);const ta=await auth.createTestAuthToken(a),tb=await auth.createTestAuthToken(b);
    const request=(path='',method='GET',body,token=ta)=>auth.rawRequest(token,'/goals'+path,method,body);
    const create=async changes=>{const result=await request('','POST',{...input,...changes});equal(result.status,201);equal(result.cache,'no-store');equal(result.location,'/api/v2/goals/'+result.body.data.id);return result.body.data;};
    const get=async id=>{const result=await request('/'+id);equal(result.status,200);return result.body.data;};
    const put=async(goal,changes)=>{const result=await request('/'+goal.id,'PUT',update(goal,changes));equal(result.status,200);return result.body.data;};
    const action=async(goal,name)=>{const result=await request('/'+goal.id+'/'+name,'POST',{});equal(result.status,200);return result.body.data;};
    const progress=async(goal,saved,remaining,percent,status='active')=>{const row=await get(goal.id);equal([row.savedAmount,row.remainingAmount,row.percentComplete,row.status],[saved,remaining,percent,status]);equal((await request()).body.data.find(r=>r.id===goal.id),row);return row;};
    const nonGoalFinancial=async()=>{const state=await financialSnapshot(admin);delete state.goals;return state;};
    equal((await request()).body,{data:[],meta:{count:0}});
    const before=await nonGoalFinancial();
    let goal=await create({name:'  هدف 😀  '});equal(goal.name,'هدف 😀');const originalIdentity={id:goal.id,createdAt:goal.createdAt};
    equal(await put(goal,{}),goal);
    equal(Object.keys(goal).sort(),['id','name','targetAmount','savedAmount','remainingAmount','percentComplete','targetDate','linkedAccountId','status','createdAt','updatedAt'].sort());
    await progress(goal,'0.10','0.20','33.33');goal=await put(goal,{savedAmount:'0.20'});await progress(goal,'0.20','0.10','66.67');
    expectApiError(await request('/'+goal.id+'/complete','POST',{}),409,'GOAL_INVALID_STATE');checks++;
    goal=await put(goal,{savedAmount:'0.30'});await progress(goal,'0.30','0.00','100.00');
    goal=await put(goal,{savedAmount:'0.40'});await progress(goal,'0.40','0.00','133.33');
    goal=await action(goal,'complete');await progress(goal,'0.40','0.00','133.33','completed');equal(await action(goal,'complete'),goal);
    expectApiError(await request('/'+goal.id,'PUT',update(goal,{savedAmount:'0.10'})),409,'GOAL_INVALID_STATE');checks++;
    goal=await put(goal,{savedAmount:'0.10',status:'active'});await progress(goal,'0.10','0.20','33.33');
    goal=await put(goal,{savedAmount:'0.30',status:'completed'});equal(goal.status,'completed');
    goal=await put(goal,{name:'Edited completed goal'});equal(goal.status,'completed');equal({id:goal.id,createdAt:goal.createdAt},originalIdentity);
    goal=await action(goal,'archive');equal(await action(goal,'archive'),goal);
    for(const [suffix,method,body]of [['','PUT',update(goal,{status:'active'})],['/complete','POST',{}]]){expectApiError(await request('/'+goal.id+suffix,method,body),409,'GOAL_INVALID_STATE');checks++;}
    equal(await get(goal.id),goal);equal((await request('?status=archived')).body.data,[goal]);equal((await request('?status=completed')).body.data,[]);
    for(const suffix of ['/reopen','/restore']){expectApiError(await request('/'+goal.id+suffix,'POST',{}),404,'ROUTE_NOT_FOUND');checks++;}
    const archivedActive=await action(await create({savedAmount:'0.00'}),'archive');equal(archivedActive.status,'archived');
    for(const [targetAmount,savedAmount,remaining,percent]of [['1.00','0.00','1.00','0.00'],['32.00','0.04','31.96','0.13'],['999999999.99','999999999.99','0.00','100.00'],['0.01','999999999.99','0.00','9999999999900.00'],['10000.00','9999.99','0.01','100.00']]) {
      const row=await create({targetAmount,savedAmount});await progress(row,savedAmount,remaining,percent);
      if(savedAmount==='9999.99'){expectApiError(await request('/'+row.id+'/complete','POST',{}),409,'GOAL_INVALID_STATE');checks++;}
    }
    const dated=await create({targetDate:'1900-01-01'});equal((await put(dated,{targetDate:'9999-12-31'})).targetDate,'9999-12-31');
    equal(await nonGoalFinancial(),before);
    const accounts=createAccountService(pool),service=createGoalService(pool);
    const account=await accounts.createAccount(a.userId,{name:'Goal reference',type:'cash',openingBalance:'0.00'}),second=await accounts.createAccount(a.userId,{name:'Second reference',type:'bank',openingBalance:'0.00'});
    const foreign=await accounts.createAccount(b.userId,{name:'Foreign reference',type:'cash',openingBalance:'0.00'});
    let linked=await create({linkedAccountId:account.id});
    const tx=createV2TransactionService(pool),txInput={accountId:account.id,categoryId:'c1200000-0000-4000-8000-000000000001',type:'income',amount:'999999999.99',description:'Goal metadata non-effect',date:'1900-01-01'};
    await accounts.updateAccount(a.userId,account.id,{name:account.name,type:account.type,openingBalance:'999999999.99'});equal(await get(linked.id),linked);
    const transaction=await tx.createTransaction(a.userId,txInput);equal(await get(linked.id),linked);
    const transfer=await createTransferService(pool).createTransfer(a.userId,{sourceAccountId:account.id,destinationAccountId:second.id,amount:'999999999.99',description:null,date:'1900-01-01'});equal(await get(linked.id),linked);
    await tx.updateTransaction(a.userId,transaction.id,{...txInput,amount:'0.01'});equal(await get(linked.id),linked);
    await tx.deleteTransaction(a.userId,transaction.id);await createTransferService(pool).deleteTransfer(a.userId,transfer.id);equal(await get(linked.id),linked);
    await accounts.archiveAccount(a.userId,account.id);equal(await get(linked.id),linked);
    linked=await put(linked,{name:'History survives archived account',savedAmount:'0.20'});equal(linked.linkedAccountId,account.id);
    for(const reference of [foreign.id,randomUUID()]){expectApiError(await request('','POST',{...input,linkedAccountId:reference}),404,'NOT_FOUND');expectApiError(await request('/'+dated.id,'PUT',update(dated,{linkedAccountId:reference})),404,'NOT_FOUND');checks+=2;}
    expectApiError(await request('','POST',{...input,linkedAccountId:account.id}),409,'ACCOUNT_ARCHIVED');checks++;
    expectApiError(await request('/'+dated.id,'PUT',update(dated,{linkedAccountId:account.id})),409,'ACCOUNT_ARCHIVED');checks++;
    linked=await put(linked,{linkedAccountId:null});equal(linked.linkedAccountId,null);
    const financial=await nonGoalFinancial();linked=await put(linked,{savedAmount:'0.30',linkedAccountId:second.id});linked=await action(linked,'complete');linked=await put(linked,{status:'active',savedAmount:'0.10'});await action(linked,'archive');equal(await nonGoalFinancial(),financial);
    for(const field of ['userId','ownerId','createdBy']){expectApiError(await request('','POST',{...input,[field]:b.userId}),400,'VALIDATION_ERROR');checks++;}
    const isolation=await verifyGoalIsolation({admin,pool,auth});equal(isolation.checks,25);
    equal((await request('', 'GET',undefined,tb)).body.data.length,0);
    // Hold an actual first write/lock; prove the other connection is waiting in
    // PostgreSQL, then release. Run both orders for state-dependent outcomes.
    async function race(first,second,pattern) {
      let arrived,release;const reached=new Promise(resolve=>{arrived=resolve;}),gate=new Promise(resolve=>{release=resolve;});let held=false;
      const wrapped=instrument(pool,async sql=>{if(!held&&pattern.test(sql)){held=true;arrived();await gate;}});
      const p1=first(wrapped).then(value=>({value}),error=>({error}));await reached;
      const p2=second(pool).then(value=>({value}),error=>({error}));
      try {
        let waiting=false;
        for(let attempt=0;attempt<100;attempt++){waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='expense_tracker_app' AND wait_event_type='Lock') waiting")).rows[0].waiting;if(waiting)break;await pause(10);}
        equal(waiting,true);
      }finally{release();}
      const result=await Promise.all([p1,p2]);races++;return result;
    }
    for(const reverse of [false,true]) {
      const row=await create({savedAmount:'0.30'});
      const complete=db=>createGoalService(db).completeGoal(a.userId,row.id),lower=db=>createGoalService(db).updateGoal(a.userId,row.id,update(row,{savedAmount:'0.10',status:'active'}));
      const outcomes=await race(reverse?lower:complete,reverse?complete:lower,/UPDATE expense_tracker.goals/);
      equal(outcomes[0].error,undefined);equal(outcomes[1].error?.code,reverse?'GOAL_INVALID_STATE':undefined);await progress(row,'0.10','0.20','33.33');
    }
    const double=await create({savedAmount:'0.30'});
    const doubled=await race(db=>createGoalService(db).completeGoal(a.userId,double.id),db=>createGoalService(db).completeGoal(a.userId,double.id),/UPDATE expense_tracker.goals/);
    equal(doubled[0].value,doubled[1].value);
    for(const reverse of [false,true]) {
      const row=await create({savedAmount:'0.30'});await service.completeGoal(a.userId,row.id);
      const reopen=db=>createGoalService(db).updateGoal(a.userId,row.id,update(row,{status:'active',savedAmount:'0.10'})),archive=db=>createGoalService(db).archiveGoal(a.userId,row.id);
      const outcomes=await race(reverse?archive:reopen,reverse?reopen:archive,/UPDATE expense_tracker.goals/);
      equal(outcomes[0].error,undefined);equal(outcomes[1].error?.code,reverse?'GOAL_INVALID_STATE':undefined);equal((await get(row.id)).status,'archived');
    }
    for(const operation of ['create','update'])for(const reverse of [false,true]) {
      const reference=await accounts.createAccount(a.userId,{name:'Race '+operation+reverse,type:'cash',openingBalance:'0.00'}),row=await create();
      const assign=db=>operation==='create'?createGoalService(db).createGoal(a.userId,{...input,linkedAccountId:reference.id}):createGoalService(db).updateGoal(a.userId,row.id,update(row,{linkedAccountId:reference.id}));
      const archive=db=>createAccountService(db).archiveAccount(a.userId,reference.id);
      const outcomes=await race(reverse?archive:assign,reverse?assign:archive,reverse?/UPDATE expense_tracker.accounts/:/SELECT status FROM expense_tracker.accounts/);
      equal(outcomes[0].error,undefined);equal(outcomes[1].error?.code,reverse?'ACCOUNT_ARCHIVED':undefined);
      if(!reverse)equal((await service.getGoal(a.userId,outcomes[0].value.id)).linkedAccountId,reference.id);
      equal((await accounts.getAccount(a.userId,reference.id)).status,'archived');
    }
    const r1=await create(),r2=await create();
    const linkedRace=await race(db=>createGoalService(db).updateGoal(a.userId,r1.id,update(r1,{linkedAccountId:second.id})),db=>createGoalService(db).updateGoal(a.userId,r2.id,update(r2,{linkedAccountId:second.id})),/SELECT status FROM expense_tracker.accounts/);
    equal(linkedRace.map(r=>r.error),[undefined,undefined]);
    // Inject after each actual write, not before BEGIN or validation. Full row
    // snapshots include timestamps and all financial parent/child tables.
    for(const operation of ['create','update','complete','reopen','archive']) {
      const row=await create({savedAmount:'0.30'});if(operation==='reopen')await service.completeGoal(a.userId,row.id);
      const snapshot=await financialSnapshot(admin);let injected=0;
      const faulty=createGoalService(instrument(pool,async sql=>{if(/^(?:INSERT INTO|UPDATE) expense_tracker.goals/.test(sql)){injected++;throw Error('private post-write fault');}}));
      const call=operation==='create'?()=>faulty.createGoal(a.userId,input):operation==='complete'?()=>faulty.completeGoal(a.userId,row.id):operation==='archive'?()=>faulty.archiveGoal(a.userId,row.id):()=>faulty.updateGoal(a.userId,row.id,update(row,{name:'Rollback edit',status:'active'}));
      await assert.rejects(call(),/private post-write fault/);equal(injected,1);equal(await financialSnapshot(admin),snapshot);faults++;
    }
    // A failure while reading the created result must also roll back the insert.
    const snapshot=await financialSnapshot(admin);
    await assert.rejects(createGoalService(instrument(pool,async sql=>{if(sql===goalProgressQuery)throw Error('private projection fault');})).createGoal(a.userId,input));equal(await financialSnapshot(admin),snapshot);faults++;
    for(const sql of ['CREATE TABLE expense_tracker.denied_goal(id int)','TRUNCATE expense_tracker.goals','ALTER TABLE expense_tracker.goals DISABLE TRIGGER ALL','SET ROLE postgres']){await assert.rejects(pool.query(sql),error=>error.code==='42501');checks++;}
    // Personal dataset plus unrelated owners: all/status/single projections use
    // existing owner/status and primary-key indexes; no linked account N+1.
    const perfOwner={userId:randomUUID()},other={userId:randomUUID()};for(const user of [perfOwner,other])await createTestUser(admin,user);
    for(const [owner,count]of [[perfOwner,2000],[other,8000]])await pool.query(`INSERT INTO expense_tracker.goals(user_id,name,target_amount,saved_amount,status)
      SELECT $1,'Performance goal '||n,100.00,CASE WHEN n%3=0 THEN 100.00 ELSE 10.00 END,CASE WHEN n%3=0 THEN 'completed' WHEN n%3=1 THEN 'active' ELSE 'archived' END FROM generate_series(1,$2::int) n`,[owner.userId,count]);
    await admin.query('ANALYZE expense_tracker.goals');
    const measured={},plans={};
    for(const status of [undefined,'active','completed','archived']){const label=status??'all',start=performance.now(),rows=await service.listGoals(perfOwner.userId,status);measured[label]={rows:rows.length,elapsedMs:Number((performance.now()-start).toFixed(3))};equal(rows.length,status===undefined?2000:status==='archived'?667:status==='active'?667:666);equal(await service.listGoals(perfOwner.userId,status),rows);plans[label]=(await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+goalProgressQuery,[perfOwner.userId,status??null,null])).rows[0]['QUERY PLAN'];}
    const perfId=(await service.listGoals(perfOwner.userId))[0].id;plans.single=(await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+goalProgressQuery,[perfOwner.userId,null,perfId])).rows[0]['QUERY PLAN'];
    let queryCount=0;const counted=createGoalService({query:async(...args)=>{queryCount++;return pool.query(...args);},connect:pool.connect.bind(pool)});equal((await counted.listGoals(perfOwner.userId)).length,2000);equal(queryCount,1);
    const output={checks,races,faults,isolation,performance:measured,totalPerformanceGoals:10000,limitedRole:true,remoteTouched:false};
    const assets=new URL('../../docs/v2/assets/t45/',import.meta.url);mkdirSync(assets,{recursive:true});writeFileSync(new URL('performance.json',assets),JSON.stringify({measurements:measured,plans},null,2)+'\n');writeFileSync(new URL('result.json',assets),JSON.stringify(output,null,2)+'\n');context.diagnostic(JSON.stringify(output));
  }finally{if(auth)await auth.close();if(pool)await pool.end();await admin.end();}
});

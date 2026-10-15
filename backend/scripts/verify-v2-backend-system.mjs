// T57 integrated system/persistence gate; synthetic identities and loopback PostgreSQL only.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {performance} from 'node:perf_hooks';
import {URL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,openSync,closeSync,realpathSync} from 'node:fs';
import {resolve,basename,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {Client,Pool} from 'pg';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser,createTestAuthHarness} from '../tests/helpers/v2-isolation.mjs';
import {createRecurringOccurrenceService} from '../dist/services/recurring-occurrences.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {cairoToday} from '../dist/validators/transaction.js';

const phase=process.argv[2];assert.ok(['initial','recover','terminal'].includes(phase));
const url=disposableIsolationUrl(process.env.T57_DISPOSABLE_DATABASE_URL);
const output=resolve(process.env.T57_OUTPUT_DIRECTORY);assert.ok(output.replaceAll('\\','/').includes('/.tmp-v2-t57'));
const dataDirectory=realpathSync(resolve(process.env.T57_DATA_DIRECTORY));
assert.equal(basename(dataDirectory),'pgdata');assert.equal(basename(dirname(dataDirectory)),'.tmp-v2-t57');
const stateFile=resolve(output,'system-state.json');
let checks=0;const timings={};
const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const admin=new Client({connectionString:url.href});await admin.connect();
equal(realpathSync((await admin.query('SHOW data_directory')).rows[0].data_directory),dataDirectory);
if(phase==='initial')await prepareIsolationDatabase(admin);
const runtimeUrl=new URL(url);runtimeUrl.username='expense_tracker_app';
const pool=new Pool({connectionString:runtimeUrl.href,max:5,connectionTimeoutMillis:1500});
let idleErrors=0;pool.on('error',()=>{idleErrors++;});
const auth=await createTestAuthHarness(pool,{categoryManagement:true,cursorSigningSecret:'57'.repeat(32),dashboardOptions:{now:()=>new Date('2026-10-15T09:00:00Z')}});
const owners={a:{userId:'a5700000-0000-4000-8000-000000000001'},b:{userId:'b5700000-0000-4000-8000-000000000001'}};
const tokens={a:await auth.createTestAuthToken(owners.a,{expiration:'1h'}),b:await auth.createTestAuthToken(owners.b,{expiration:'1h',metadataOwner:owners.a.userId})};
async function request(who,path,method='GET',body,status=200){
  const started=performance.now();const result=await auth.rawRequest(tokens[who],path,method,body);
  (timings[path.split('?')[0].split('/')[1]]??=[]).push(performance.now()-started);
  equal(result.status,status);equal(result.cache,'no-store');
  return result.body;
}
const get=async(who,path)=>(await request(who,path)).data;
const create=async(who,path,input)=>(await request(who,path,'POST',input,201)).data;
const action=async(who,path)=>(await request(who,path,'POST',{})).data;
async function durableSnapshot(){const data={};for(const table of ['profiles','categories','accounts','transactions','transfers','recurring_transactions','recurring_occurrences','budgets','goals'])data[table]=(await pool.query(`SELECT to_jsonb(t)::text row FROM expense_tracker.${table} t ORDER BY to_jsonb(t)::text`)).rows;return data;}
async function publicSnapshot(who){const data={};for(const path of ['/profile','/accounts','/accounts?status=archived','/categories','/categories?status=archived','/transactions?limit=100','/transfers?limit=100','/recurring','/budgets?year=2026&month=10','/goals','/accounts/summary'])data[path]=await get(who,path);return data;}
async function repeatableSeed(){
  const seed=readFileSync(new URL('../../supabase/seeds/v2-system-categories.sql',import.meta.url),'utf8');
  const before=(await admin.query('SELECT to_jsonb(c)::text row FROM expense_tracker.categories c WHERE is_system ORDER BY id')).rows;
  await admin.query(seed);await admin.query(seed);
  equal((await admin.query('SELECT to_jsonb(c)::text row FROM expense_tracker.categories c WHERE is_system ORDER BY id')).rows,before);
  equal(before.length,9);equal((await admin.query("SELECT kind FROM expense_tracker.categories WHERE is_system AND name='Other'")).rows[0].kind,'both');
  equal((await admin.query("SELECT count(*)::int n FROM pg_constraint WHERE connamespace='expense_tracker'::regnamespace AND NOT convalidated")).rows[0].n,0);
}
const transactionInput=(fixture,amount='0.20')=>({accountId:fixture.cash.id,categoryId:fixture.category.id,type:'expense',amount,description:'T57 café عربي 😀 % _ ! quote \' slash \\',date:'2026-10-01'});
const recurringInput=fixture=>({accountId:fixture.cash.id,categoryId:fixture.category.id,type:'expense',amount:'0.01',description:'T57 recurring',frequency:'daily',startDate:cairoToday(),endDate:null});

try {
  if(phase==='initial') {
    await repeatableSeed();
    const fixtures={};
    for(const who of ['a','b']) {
      await createTestUser(admin,owners[who]);
      const profiles=await Promise.all(Array.from({length:8},()=>action(who,'/profile/bootstrap')));
      equal(new Set(profiles.map(profile=>profile.createdAt)).size,1);
      equal([profiles[0].preferredCurrency,profiles[0].locale,profiles[0].timezone],['EGP','en','Africa/Cairo']);
      await request(who,'/profile','PUT',{displayName:who+' T57'});
      const f=fixtures[who]={};
      f.category=await create(who,'/categories',{name:'T57 shared custom',kind:'expense',icon:null,color:null});
      f.cash=await create(who,'/accounts',{name:who+' cash',type:'cash',openingBalance:'100.00',currency:'EGP'});
      f.bank=await create(who,'/accounts',{name:who+' bank',type:'bank',openingBalance:'50.00',currency:'EGP'});
      f.card=await create(who,'/accounts',{name:who+' card',type:'credit_card',openingBalance:'20.00',currency:'EGP'});
      const salary=(await get(who,'/categories')).find(category=>category.isSystem&&category.name==='Salary');
      f.income=await create(who,'/transactions',{...transactionInput(f,'0.10'),type:'income',categoryId:salary.id});
      f.expense=await create(who,'/transactions',transactionInput(f));
      f.cent=await create(who,'/transactions',transactionInput(f,'0.01'));
      f.transfer=await create(who,'/transfers',{sourceAccountId:f.cash.id,destinationAccountId:f.card.id,amount:'0.30',description:'T57 card payment',date:'2026-10-01'});
      f.recurring=await create(who,'/recurring',recurringInput(f));
      f.budget=await create(who,'/budgets',{categoryId:f.category.id,amount:'0.20',year:2026,month:10,alertThresholdPercent:75});
      f.goal=await create(who,'/goals',{name:who+' goal',targetAmount:'0.30',savedAmount:'0.40',targetDate:null,linkedAccountId:f.cash.id});
      equal(f.goal.percentComplete,'133.33');equal(f.goal.status,'active');
      await action(who,'/goals/'+f.goal.id+'/complete');
      await request(who,'/goals/'+f.goal.id,'PUT',{name:who+' goal',targetAmount:'0.30',savedAmount:'0.40',targetDate:null,linkedAccountId:f.cash.id,status:'active'});
      equal((await get(who,'/accounts/summary')).netPosition,'129.89');
      equal((await get(who,'/accounts/'+f.card.id)).currentBalance,'19.70');
      const budget=await get(who,'/budgets/'+f.budget.id);equal([budget.spent,budget.remaining,budget.percentUsed,budget.status],['0.21','-0.01','105.00','exceeded']);
    }
    const a=fixtures.a,b=fixtures.b,beforeB=await publicSnapshot('b');
    // One category crosses three financial domains; lifecycle must preserve history and totals.
    const beforePosition=await get('a','/accounts/summary');
    await request('a','/categories/'+a.category.id,'PUT',{name:'Renamed T57',kind:'income',icon:null,color:null},409);
    await request('a','/categories/'+a.category.id,'PUT',{name:'Renamed T57',kind:'expense',icon:null,color:null});
    await action('a','/categories/'+a.category.id+'/archive');
    equal((await get('a','/transactions/'+a.expense.id)).categoryName,'Renamed T57');
    equal((await get('a','/budgets/'+a.budget.id)).spent,'0.21');
    equal((await get('a','/recurring/'+a.recurring.id)).status,'paused');
    await request('a','/transactions','POST',transactionInput(a),409);
    await request('a','/recurring','POST',recurringInput(a),409);
    await request('a','/budgets','POST',{categoryId:a.category.id,amount:'0.30',year:2026,month:11,alertThresholdPercent:90},409);
    await request('a','/categories','POST',{name:'renamed t57',kind:'both',icon:null,color:null},409);
    await action('a','/categories/'+a.category.id+'/restore');
    equal((await get('a','/recurring/'+a.recurring.id)).status,'paused');
    const temporary=await create('a','/transactions',transactionInput(a,'0.01'));await request('a','/transactions/'+temporary.id,'DELETE',undefined,204);
    await action('a','/recurring/'+a.recurring.id+'/resume');
    await action('a','/accounts/'+a.cash.id+'/archive');
    equal((await get('a','/recurring/'+a.recurring.id)).status,'paused');equal((await get('a','/goals/'+a.goal.id)).linkedAccountId,a.cash.id);
    await get('a','/transactions/'+a.expense.id);await get('a','/transfers/'+a.transfer.id);
    await request('a','/transactions','POST',transactionInput(a),409);
    await request('a','/transfers','POST',{sourceAccountId:a.cash.id,destinationAccountId:a.card.id,amount:'0.01',description:null,date:'2026-10-01'},409);
    await request('a','/recurring','POST',recurringInput(a),409);
    equal(await get('a','/accounts/summary'),beforePosition);
    await action('a','/accounts/'+a.cash.id+'/restore');equal((await get('a','/recurring/'+a.recurring.id)).status,'paused');
    const restored=await create('a','/transactions',transactionInput(a,'999999999.99'));equal(restored.amount,'999999999.99');await request('a','/transactions/'+restored.id,'DELETE',undefined,204);
    equal(await get('a','/accounts/summary'),beforePosition);equal(await publicSnapshot('b'),beforeB);
    // Reciprocal owner injection and foreign/missing privacy for every implemented mutable resource.
    for(const [who,foreign] of [['a',b],['b',a]]){
      const own=fixtures[who],foreignId=owners[who==='a'?'b':'a'].userId;
      const inputs=[['/profile/bootstrap',{}],['/profile',{displayName:'Injected'}],['/categories',{name:'Injected',kind:'expense'}],['/accounts',{name:'Injected',type:'cash',openingBalance:'0.00',currency:'EGP'}],['/transactions',transactionInput(own)],['/transfers',{sourceAccountId:own.cash.id,destinationAccountId:own.bank.id,amount:'0.01',description:null,date:'2026-10-01'}],['/recurring',recurringInput(own)],['/budgets',{categoryId:own.category.id,amount:'1.00',year:2026,month:12,alertThresholdPercent:90}],['/goals',{name:'Injected',targetAmount:'1.00',savedAmount:'0.00',targetDate:null,linkedAccountId:own.cash.id}]];
      for(const [path,input] of inputs)for(const injection of [{userId:foreignId},{ownerId:foreignId},{user_metadata:{userId:foreignId}}])await request(who,path,path==='/profile'?'PUT':'POST',{...input,...injection},400);
      for(const path of ['/profile','/categories','/accounts','/transactions','/transfers','/recurring','/budgets','/goals'])await request(who,path+'?userId='+foreignId,'GET',undefined,400);
      for(const [path,id,method,body] of [['accounts',foreign.cash.id,'GET'],['transactions',foreign.expense.id,'GET'],['transfers',foreign.transfer.id,'GET'],['recurring',foreign.recurring.id,'GET'],['budgets',foreign.budget.id,'GET'],['goals',foreign.goal.id,'GET'],['categories',foreign.category.id,'PUT',{name:'Stolen',kind:'expense',icon:null,color:null}]]){
        const hidden=await request(who,'/'+path+'/'+id,method,body,404);const absent=await request(who,'/'+path+'/00000000-0000-4000-8000-000000000000',method,body,404);equal(hidden,absent);
      }
      const otherIds=Object.values(foreign).filter(value=>value?.id).map(value=>value.id);
      const snapshot=JSON.stringify(await publicSnapshot(who));for(const id of otherIds){assert.ok(!snapshot.includes(id));checks++;}
    }
    for(const key of ['this_month','last_month','3_months','6_months','1_year']){
      const dashboard=await request('a','/dashboard?period='+key),period=dashboard.data.period;
      const analytics=await get('a','/analytics/overview?from='+period.from+'&to='+period.to);
      for(const field of ['income','expenses','netSavings'])equal(dashboard.data.summary[field],analytics.summary[field]);
    }
    // HTTP CORS is an exact response origin, never a reflected untrusted origin.
    for(const origin of ['http://localhost:3000','https://attacker.invalid']){
      const response=await globalThis.fetch(auth.apiOrigin+'/api/v2/categories',{headers:{Authorization:'Bearer '+tokens.a,Origin:origin}});
      equal(response.headers.get('access-control-allow-origin'),'http://localhost:3000');equal(response.headers.get('access-control-allow-credentials'),null);
    }
    await request('a','/accounts','DELETE',undefined,405);
    for(const sql of ['CREATE TABLE expense_tracker.denied(id int)','TRUNCATE expense_tracker.accounts','ALTER TABLE expense_tracker.accounts DISABLE TRIGGER ALL','CREATE ROLE t57_denied','SET ROLE postgres','SELECT * FROM auth.users']){
      await assert.rejects(pool.query(sql),error=>error.code==='42501');checks++;
    }
    // A committed pending reservation must survive both PostgreSQL and Node process restarts.
    const other=(await get('a','/categories')).find(category=>category.isSystem&&category.name==='Other');
    const pendingDefinition=await create('a','/recurring',{...recurringInput(a),categoryId:other.id,description:'T57 restart reservation'});
    const ledger=createRecurringOccurrenceService(pool);
    const pending=await ledger.reserveOccurrence(owners.a.userId,pendingDefinition.id,pendingDefinition.nextOccurrence);equal(pending.status,'pending');
    const firstPage=await request('a','/transactions?limit=1');assert.ok(firstPage.meta.nextCursor);checks++;
    const continuation=await request('a','/transactions?limit=1&cursor='+encodeURIComponent(firstPage.meta.nextCursor));
    const state={owners,fixtures,referenceDate:pendingDefinition.nextOccurrence,pendingDefinitionId:pendingDefinition.id,pendingId:pending.id,cursor:firstPage.meta.nextCursor,continuation:continuation.data,durable:await durableSnapshot(),publicA:await publicSnapshot('a'),publicB:await publicSnapshot('b')};
    await admin.end();
    const bin=realpathSync(resolve(process.env.T57_PG_BIN));
    const stop=spawnSync(resolve(bin,'pg_ctl.exe'),['-D',dataDirectory,'-m','fast','stop'],{encoding:'utf8',windowsHide:true});equal(stop.status,0);
    await request('a','/profile','GET',undefined,503);
    const fd=openSync(resolve(output,'postgres-restarted.log'),'a');
    const postgres=spawn(resolve(bin,'postgres.exe'),['-D',dataDirectory,'-h','127.0.0.1','-p','55451'],{stdio:['ignore',fd,fd],windowsHide:true});postgres.unref();closeSync(fd);
    let connected=false;for(let attempt=0;attempt<40;attempt++){try{await pool.query('SELECT 1');connected=true;break;}catch{await pause(250);}}
    equal(connected,true);equal(await durableSnapshot(),state.durable);equal(await publicSnapshot('a'),state.publicA);equal(await publicSnapshot('b'),state.publicB);
    equal((await ledger.getOccurrence(owners.a.userId,state.pendingDefinitionId,state.referenceDate)).id,state.pendingId);
    equal((await request('a','/transactions?limit=1&cursor='+encodeURIComponent(state.cursor))).data,state.continuation);
    writeFileSync(stateFile,JSON.stringify(state));
  } else {
    const state=JSON.parse(readFileSync(stateFile,'utf8'));equal(await durableSnapshot(),state.durable);
    equal(await publicSnapshot('a'),state.publicA);equal(await publicSnapshot('b'),state.publicB);
    equal((await request('a','/transactions?limit=1&cursor='+encodeURIComponent(state.cursor))).data,state.continuation);
    const ledger=createRecurringOccurrenceService(pool),processor=createRecurringProcessor(pool);
    const occurrence=await ledger.getOccurrence(owners.a.userId,state.pendingDefinitionId,state.referenceDate);
    equal(occurrence.id,state.pendingId);
    if(phase==='recover'){
      equal(occurrence.status,'pending');
      const posted=await processor.processDueRecurring({referenceDate:state.referenceDate,userId:owners.a.userId,definitionId:state.pendingDefinitionId});equal(posted.posted,1);
      equal((await processor.processDueRecurring({referenceDate:state.referenceDate,userId:owners.a.userId,definitionId:state.pendingDefinitionId})).posted,0);
      const generated=await ledger.getOccurrence(owners.a.userId,state.pendingDefinitionId,state.referenceDate);equal(generated.status,'posted');
      await request('a','/transactions/'+generated.generatedTransactionId,'DELETE',undefined,204);
      equal((await ledger.getOccurrence(owners.a.userId,state.pendingDefinitionId,state.referenceDate)).generatedTransactionId,null);
      state.durable=await durableSnapshot();state.publicA=await publicSnapshot('a');state.publicB=await publicSnapshot('b');writeFileSync(stateFile,JSON.stringify(state));
    }else{
      equal(occurrence.status,'posted');equal(occurrence.generatedTransactionId,null);
      equal((await processor.processDueRecurring({referenceDate:state.referenceDate,userId:owners.a.userId,definitionId:state.pendingDefinitionId})).posted,0);
      equal(await durableSnapshot(),state.durable);
    }
  }
  const latency=Object.fromEntries(Object.entries(timings).map(([domain,values])=>{values.sort((a,b)=>a-b);return [domain,{requests:values.length,minMs:+values[0].toFixed(2),medianMs:+values[Math.floor(values.length/2)].toFixed(2),maxMs:+values.at(-1).toFixed(2)}];}));
  const result={phase,checks,failures:0,idleConnectionErrorsHandled:idleErrors,latency,remoteTouched:false};
  writeFileSync(resolve(output,'system-'+phase+'-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({phase,checks,failures:0}));
} finally {await auth.close();await pool.end();await admin.end().catch(()=>{});}

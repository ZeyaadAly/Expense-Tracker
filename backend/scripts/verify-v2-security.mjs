// T59 local-only acceptance. No dotenv, hosted fallback, or production writes.
/* global fetch */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {realpathSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, basename, dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {URL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Client, Pool} from 'pg';
import {disposableIsolationUrl, prepareIsolationDatabase, createTestUser, createOwnedFixtures,
  isolationUsers, createTestAuthHarness, financialSnapshot} from '../tests/helpers/v2-isolation.mjs';
import {verifyIsolation} from './verify-v2-isolation.mjs';
import {createRecurringOccurrenceService} from '../dist/services/recurring-occurrences.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {validateAccountBody} from '../dist/validators/account.js';
import {validateGoalBody} from '../dist/validators/goal.js';

const url=disposableIsolationUrl(process.env.T59_DISPOSABLE_DATABASE_URL);
const data=realpathSync(process.env.T59_DATA_DIRECTORY);
assert.equal(basename(data),'pgdata');assert.equal(basename(dirname(data)),'.tmp-v2-t59');
const output=resolve(process.env.T59_OUTPUT_DIRECTORY);
assert.ok(output.replaceAll('\\','/').includes('/.tmp-v2-t59/'));
mkdirSync(output,{recursive:true});
async function reset(){
  const address=new URL(url);address.pathname='/template1';
  const client=new Client({connectionString:address.href});await client.connect();
  try {
    assert.equal(realpathSync((await client.query('SHOW data_directory')).rows[0].data_directory),data);
    assert.equal((await client.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname='postgres'")).rows[0].n,0);
    await client.query('DROP DATABASE postgres');
    for(const role of ['expense_tracker_app','anon','authenticated'])await client.query('DROP ROLE IF EXISTS '+role);
    await client.query('CREATE DATABASE postgres TEMPLATE template0');
  }finally{await client.end();}
}
await reset();
const isolation=await verifyIsolation(url.href,{transferConcurrency:true});
writeFileSync(resolve(output,'isolation.json'),JSON.stringify(isolation,null,2)+'\n');
await reset();
const admin=new Client({connectionString:url.href});await admin.connect();
const runtime=new URL(url);runtime.username='expense_tracker_app';
let pool,auth;
const counts={routeAuthentication:0,ownerInjection:0,massAssignment:0,occurrence:0,concurrency:0,boundary:0,timing:0};
const equal=(group,actual,expected)=>{assert.deepEqual(actual,expected);counts[group]++;};
const logs=[],timings=[],originalError=console.error;
try {
  await prepareIsolationDatabase(admin);
  const {a,b}=isolationUsers;
  for(const user of [a,b])await createTestUser(admin,user);
  pool=new Pool({connectionString:runtime.href,max:5});
  const client=await pool.connect();
  try{await client.query('BEGIN');for(const user of [a,b])await createOwnedFixtures(client,user);await client.query('COMMIT');}finally{client.release();}
  const cronSecret=randomBytes(32).toString('hex');
  let cronCalls=0;
  auth=await createTestAuthHarness(pool,{categoryManagement:true,cursorSigningSecret:randomBytes(32).toString('hex'),
    recurringCron:{secret:()=>cronSecret,log:metadata=>logs.push(JSON.stringify(metadata)),processor:{processDueRecurring:async()=>{cronCalls++;return {failed:0,failureRecordingErrors:0};}}}});
  const tokens={a:await auth.createTestAuthToken(a),b:await auth.createTestAuthToken(b,{metadataOwner:a.userId})};
  console.error=(...values)=>logs.push(values.map(String).join(' '));
  for(const token of Object.values(tokens))equal('boundary',(await auth.request(token,'/profile/bootstrap','POST',{})).status,200);
  const tx={accountId:a.account,categoryId:a.expenseCategory,type:'expense',amount:'0.01',description:'A-security',date:'1900-01-01'};
  const transfer={sourceAccountId:a.account,destinationAccountId:a.secondAccount,amount:'0.01',date:'1900-01-01',description:'A-security'};
  const recurring={...tx,frequency:'monthly',startDate:'1900-01-01',endDate:null};delete recurring.date;
  const category={name:'A-security',kind:'expense',icon:null,color:null};
  const goal={name:'A-security',targetAmount:'10.00',savedAmount:'0.00',targetDate:null,linkedAccountId:a.account,status:'active'};
  const goalCreate={...goal};delete goalCreate.status;
  const accountUpdate={name:'A-security',type:'cash',openingBalance:'0.00'};
  validateAccountBody(accountUpdate);validateGoalBody(goalCreate,true);validateGoalBody(goal);
  const writes=[['/profile/bootstrap','POST',{}],['/profile','PUT',{displayName:'A-security'}],
    ['/categories','POST',category],[`/categories/${a.expenseCategory}`,'PUT',category],
    ...['archive','restore'].map(s=>[`/categories/${a.expenseCategory}/${s}`,'POST',{}]),
    ['/accounts','POST',{name:'A-security',type:'cash',openingBalance:'0.00',currency:'EGP'}],
    [`/accounts/${a.account}`,'PUT',accountUpdate],
    ...['archive','restore'].map(s=>[`/accounts/${a.account}/${s}`,'POST',{}]),
    ['/transactions','POST',tx],[`/transactions/${a.income}`,'PUT',tx],
    ['/transfers','POST',transfer],[`/transfers/${a.transfer}`,'PUT',transfer],
    ['/recurring','POST',recurring],[`/recurring/${a.recurring}`,'PUT',recurring],
    ...['pause','resume','archive'].map(s=>[`/recurring/${a.recurring}/${s}`,'POST',{}]),
    ['/budgets','POST',{categoryId:a.expenseCategory,amount:'10.00',year:2026,month:2}],
    [`/budgets/${a.budget}`,'PUT',{amount:'10.00',alertThresholdPercent:90}],
    ['/goals','POST',goalCreate],[`/goals/${a.goal}`,'PUT',goal],
    ...['complete','archive'].map(s=>[`/goals/${a.goal}/${s}`,'POST',{}])];
  const reads=['/profile','/categories','/categories?status=archived','/accounts','/accounts/summary',
    `/accounts/${a.account}`,`/accounts/${a.account}/summary`,'/transactions',`/transactions/${a.income}`,
    '/transfers',`/transfers/${a.transfer}`,'/recurring','/recurring/upcoming',`/recurring/${a.recurring}`,
    '/dashboard','/analytics/overview?from=1900-01-01&to=1900-01-31','/budgets',`/budgets/${a.budget}`,'/goals',`/goals/${a.goal}`];
  const deletes=[`/transactions/${a.income}`,`/transfers/${a.transfer}`,`/budgets/${a.budget}`];
  const routes=[...writes,...reads.map(p=>[p,'GET']),...deletes.map(p=>[p,'DELETE'])];
  for(const [path,method,body] of routes){
    for(const token of [null,'malformed.token'])equal('routeAuthentication',(await auth.rawRequest(token,path,method,body)).status,401);
  }
  for(const path of new Set(routes.map(([path])=>path.split('?')[0]))){
    equal('routeAuthentication',(await auth.rawRequest(null,path,'PATCH')).status,401);
    equal('routeAuthentication',(await auth.rawRequest(tokens.a,path,'PATCH')).status,405);
  }
  const before=await financialSnapshot(admin);
  const owners=['userId','user_id','ownerId','owner_id','createdBy','profileId','accountUserId'];
  const injections=owners.map(key=>({[key]:b.userId})).concat([{owner:{userId:b.userId}},{metadata:{owner_id:b.userId}}]);
  for(const [path,method,body] of writes)for(const injection of injections)
    equal('ownerInjection',(await auth.rawRequest(tokens.a,path,method,{...body,...injection})).status,400);
  for(const [path,method,body] of routes)for(const key of owners)
    equal('ownerInjection',(await auth.rawRequest(tokens.a,path+(path.includes('?')?'&':'?')+key+'='+b.userId,method,body)).status,400);
  const controlled={status:'archived',balance:'999',spent:'999',progress:999,nextOccurrence:'1900-01-01',createdAt:'1900-01-01',updatedAt:'1900-01-01',isSystem:true,archived:true,generatedTransactionId:b.expense,recurringTransactionId:b.recurring};
  for(const [path,method,body] of writes)for(const [key,value] of Object.entries(controlled))
    equal('massAssignment',(await auth.rawRequest(tokens.a,path,method,{...body,[key]:value})).status,400);
  equal('boundary',await financialSnapshot(admin),before);
  // Shared role is deliberately not tenant-scoped. This demonstrates the risk directly.
  equal('boundary',(await pool.query('SELECT count(DISTINCT user_id)::int n FROM expense_tracker.accounts')).rows[0].n,2);
  const ledger=createRecurringOccurrenceService(pool);
  for(const [user,other] of [[a,b],[b,a]])for(const method of ['getOccurrence','reserveOccurrence','postOccurrence']){
    await assert.rejects(()=>ledger[method](user.userId,other.recurring,'1900-02-01'),error=>error.status===404);counts.occurrence++;
  }
  const processor=createRecurringProcessor(pool);
  await Promise.all([processor.processDueRecurring({referenceDate:'1900-02-01'}),processor.processDueRecurring({referenceDate:'1900-02-01'})]);
  equal('concurrency',(await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions WHERE recurring_occurrence_date=\'1900-02-01\'')).rows[0].n,2);
  equal('concurrency',(await pool.query('SELECT count(*)::int n FROM expense_tracker.transactions t JOIN expense_tracker.recurring_transactions r ON r.id=t.recurring_transaction_id WHERE t.user_id<>r.user_id')).rows[0].n,0);
  for(const [user,other,token] of [[a,b,tokens.a],[b,a,tokens.b]]){
    for(const domain of ['accounts','transactions','transfers','recurring','budgets','goals']){
      const key={accounts:'account',transactions:'expense',transfers:'transfer',recurring:'recurring',budgets:'budget',goals:'goal'}[domain];
      const samples={foreign:[],missing:[]};
      for(let i=0;i<8;i++)for(const [kind,id] of [['foreign',other[key]],['missing','00000000-0000-4000-8000-000000000000']]){
        const start=performance.now();const result=await auth.rawRequest(token,`/${domain}/${id}`);samples[kind].push(performance.now()-start);equal('timing',result.status,404);
      }
      const median=values=>values.sort((x,y)=>x-y)[Math.floor(values.length/2)];
      timings.push({owner:user.name,domain,foreignMedianMs:median(samples.foreign),missingMedianMs:median(samples.missing)});
    }
  }
  for(const credential of [tokens.a,tokens.b,cronSecret]){
    const result=await fetch(auth.apiOrigin+'/internal/recurring/process',{headers:{Authorization:'Bearer '+credential}});
    equal('boundary',result.status,credential===cronSecret?200:401);
  }
  equal('boundary',cronCalls,1);
  equal('boundary',(await auth.rawRequest(cronSecret,'/profile')).status,401);
  for(const origin of ['http://localhost:3000','https://attacker.invalid']){
    const response=await fetch(auth.apiOrigin+'/api/v2/accounts',{headers:{Origin:origin,Authorization:'Bearer '+tokens.a}});
    equal('boundary',response.headers.get('access-control-allow-origin'),'http://localhost:3000');
    equal('boundary',response.headers.get('access-control-allow-credentials'),null);
  }
  const log=logs.join('\n');for(const value of [tokens.a,tokens.b,cronSecret,url.href,'A-security','B-security'])equal('boundary',log.includes(value),false);
  writeFileSync(resolve(output,'security.json'),JSON.stringify({counts,routeCases:routes.map(([path,method])=>({path:path.replaceAll(a.account,':account').replaceAll(a.income,':transaction'),method})),timings,logLines:logs.length,failures:0,remoteTouched:false},null,2)+'\n');
  console.log(JSON.stringify({counts,failures:0,remoteTouched:false}));
}finally{console.error=originalError;if(auth)await auth.close();if(pool)await pool.end();await admin.end();}

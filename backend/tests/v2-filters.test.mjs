import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {URLSearchParams} from 'node:url';
import {validateV2TransactionQuery} from '../dist/validators/v2-transaction.js';
import {createRegressionTransactionService as createV2TransactionService} from './helpers/transaction-pages.mjs';
import {createTestAuthHarness} from './helpers/v2-isolation.mjs';
import {verifyIsolation} from '../scripts/verify-v2-isolation.mjs';

const id='a2300000-0000-4000-8000-000000000001';
test('T23 frozen seven-key query contract, UUID normalization and inclusive future calendar dates',()=>{
  const query={q:'  Café  ',type:'expense',accountId:id.toUpperCase(),categoryId:id,from:'1900-01-01',to:'9999-12-31',recurring:'generated'};
  assert.deepEqual(validateV2TransactionQuery('/transactions?'+new URLSearchParams(query)),{...query,q:'Café',accountId:id});
  for(const type of ['income','expense'])assert.deepEqual(validateV2TransactionQuery('/transactions?type='+type),{type});
  for(const recurring of ['manual','generated'])assert.deepEqual(validateV2TransactionQuery('/transactions?recurring='+recurring),{recurring});
  for(const key of ['from','to'])for(const value of ['1900-01-01','2000-02-29','2024-02-29','9999-12-31'])assert.deepEqual(validateV2TransactionQuery('/transactions?'+key+'='+value),{[key]:value});
  assert.deepEqual(validateV2TransactionQuery('/transactions?q=%20&type=income&from=2026-10-15&to=2026-10-15'),{type:'income',from:'2026-10-15',to:'2026-10-15'});
});

export const invalidFilters=[
  'type=Income','type=EXPENSE','type=all','type=', 'type=%20income',
  'recurring=all','recurring=forecast','recurring=Manual','recurring=',
  'accountId=bad','accountId=','accountId='+id.replaceAll('-',''),'categoryId=bad','categoryId=',
  ...['from','to'].flatMap(key=>['','1899-12-31','0000-01-01','10000-01-01','2026-02-29','1900-02-29','2026-04-31','2026-13-01','2026-00-01','2026-10-00','2026-1-01','2026-10-01T00:00:00Z','%202026-10-01','%GG','%C0%AF'].map(value=>key+'='+value)),
  'from=2026-10-31&to=2026-10-01','q=a&q=b','q='+encodeURIComponent('😀'.repeat(201)),'q=%00',
  'limit=0','cursor=fake','userId='+id,'category=food','sort=desc','accountId[]=x','categoryId[owner]=x',
  ...['q','type','accountId','categoryId','from','to','recurring'].map(key=>key+'=x&'+key+'=x'),
  ...['q','type','accountId','categoryId','from','to','recurring'].map(key=>key+'[]=x'),
];
test('T23 rejects bad scalar values, impossible dates, repeated and unknown/bracketed keys',()=>{
  for(const query of invalidFilters)assert.throws(()=>validateV2TransactionQuery('/transactions?'+query),error=>error.code==='VALIDATION_ERROR',query);
  for(const key of ['accountId','categoryId'])assert.throws(()=>validateV2TransactionQuery('/transactions?'+key+'=bad'),error=>error.details.some(detail=>detail.field===key));
});

test('T23 binds every filter and retains grouped search, owner joins and deterministic ordering',async()=>{
  const calls=[],database={query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.startsWith('SELECT id')?[{id}]:[]};}};
  const service=createV2TransactionService(database),filters={q:"%_!' OR 1=1 --",type:'expense',accountId:id,categoryId:id,from:'2026-10-01',to:'2026-10-31',recurring:'manual'};
  await service.listTransactions(id,filters);
  assert.deepEqual(calls[0],{sql:'SELECT id FROM expense_tracker.accounts WHERE id=$1 AND user_id=$2',params:[id,id]});
  assert.deepEqual(calls[1],{sql:'SELECT id FROM expense_tracker.categories WHERE id=$1 AND (is_system OR user_id=$2)',params:[id,id]});
  const list=calls[2];assert.deepEqual(list.params,[id,"%!%!_!!' OR 1=1 --%",'expense',id,id,'2026-10-01','2026-10-31','101']);
  assert.match(list.sql,/WHERE t.user_id=\$1 AND \(t.description ILIKE \$2 ESCAPE '!' OR a.name ILIKE \$2 ESCAPE '!' OR c.name ILIKE \$2 ESCAPE '!'\) AND t.type=\$3 AND t.account_id=\$4 AND t.category_id=\$5 AND t.transaction_date>=\$6::date AND t.transaction_date<=\$7::date AND t.recurring_transaction_id IS NULL ORDER BY t.transaction_date DESC,t.created_at DESC,t.id DESC LIMIT \$8$/);
  assert.ok(!list.sql.includes(filters.q));
  await service.listTransactions(id,{type:'income',from:'9999-12-31',recurring:'generated'});
  assert.deepEqual(calls.at(-1).params,[id,'income','9999-12-31','101']);assert.match(calls.at(-1).sql,/t.type=\$2 AND t.transaction_date>=\$3::date AND t.recurring_transaction_id IS NOT NULL/);
  for(const key of ['accountId','categoryId']) {
    const missing=createV2TransactionService({query:async()=>({rows:[]})});
    await assert.rejects(missing.listTransactions(id,{[key]:id}),error=>error.status===404&&error.code==='NOT_FOUND');
  }
});

test('T23 authenticated HTTP rejects invalid filters before SQL and preserves list shape',async()=>{
  let calls=0;const database={query:async sql=>{calls++;return {rows:sql.startsWith('SELECT id')?[{id}]:[]};},connect:async()=>{throw Error('Unexpected mutation');}};
  const auth=await createTestAuthHarness(database);
  try {
    const token=await auth.createTestAuthToken({userId:id});
    for(const query of invalidFilters){const response=await auth.request(token,'/transactions?'+query);assert.equal(response.status,400,query);assert.equal(response.body.error.code,'VALIDATION_ERROR');assert.equal(response.cache,'no-store');}
    assert.equal((await auth.request(null,'/transactions?type=Income')).status,401);assert.equal(calls,0);
    const query=new URLSearchParams({q:'Uber',type:'expense',accountId:id,categoryId:id,from:'1900-01-01',to:'9999-12-31',recurring:'manual'});
    const response=await auth.request(token,'/transactions?'+query);assert.equal(response.status,200);assert.deepEqual(response.body,{data:[],meta:{count:0}});assert.equal(calls,3);
    for(const [path,method] of [['/transactions','POST'],['/transactions/'+id,'GET'],['/transactions/'+id,'PUT'],['/transactions/'+id,'DELETE']])assert.equal((await auth.request(token,path+'?type=expense',method,method==='GET'?undefined:{})).status,400);
    assert.equal(calls,3);
  }finally{await auth.close();}
});

test('T23 fresh filters, search composition, isolation, history and runtime query plans',{
  skip:!process.env.T23_DISPOSABLE_DATABASE_URL&&'Requires a fresh guarded loopback PostgreSQL database',
},async context=>{context.diagnostic(JSON.stringify(await verifyIsolation(process.env.T23_DISPOSABLE_DATABASE_URL)));});

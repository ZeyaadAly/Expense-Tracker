import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {validateV2TransactionQuery} from '../dist/validators/v2-transaction.js';
import {createRegressionTransactionService as createV2TransactionService} from './helpers/transaction-pages.mjs';
import {createTestAuthHarness} from './helpers/v2-isolation.mjs';
import {verifyIsolation} from '../scripts/verify-v2-isolation.mjs';

test('T22 strict URL shape, trimmed empty search and Unicode code-point boundaries',()=>{
  for(const url of ['/transactions','/transactions?q=','/transactions?q=%20%09'])assert.deepEqual(validateV2TransactionQuery(url),{});
  assert.deepEqual(validateV2TransactionQuery('/transactions?q=%20Carrefour%20'),{q:'Carrefour'});
  for(const q of ['x'.repeat(200),'😀'.repeat(200),'م'.repeat(200)])assert.deepEqual(validateV2TransactionQuery('/transactions?q='+encodeURIComponent(' '+q+' ')),{q});
  for(const query of ['q='+encodeURIComponent('😀'.repeat(201)),'q='+ 'x'.repeat(201),'q=a&q=b','q=&q=','q[]=a','q[term]=a','q=a&type=Income','userId=x','limit=0','cursor=x','q=%00'])assert.throws(()=>validateV2TransactionQuery('/transactions?'+query),error=>error.code==='VALIDATION_ERROR');
});

test('T22 service binds literal patterns without changing SQL structure or base list',async()=>{
  const calls=[],database={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}};
  const service=createV2TransactionService(database);
  await service.listTransactions('owner');const base=calls.at(-1);
  assert.deepEqual(base.params,['owner','101']);assert.doesNotMatch(base.sql,/ILIKE/);
  for(const q of ["' OR 1=1 --","%'; DROP TABLE expense_tracker.transactions; --",'_',String.raw`\\`,'20%','Plan_A','!%_','"'])await service.listTransactions('owner',{q});
  const searches=calls.slice(1);assert.ok(searches.every(call=>call.sql===searches[0].sql));
  assert.match(searches[0].sql,/WHERE t.user_id=\$1 AND \(t.description ILIKE \$2 ESCAPE '!'/);
  assert.match(searches[0].sql,/a.user_id=t.user_id/);assert.match(searches[0].sql,/c.is_system OR c.user_id=t.user_id/);
  assert.match(searches[0].sql,/ORDER BY t.transaction_date DESC,t.created_at DESC,t.id DESC LIMIT \$3$/);
  assert.deepEqual(searches.map(call=>call.params[1]),["%' OR 1=1 --%","%!%'; DROP TABLE expense!_tracker.transactions; --%",'%!_%',String.raw`%\\%`,'%20!%%','%Plan!_A%','%!!!%!_%','%"%']);
});

test('T22 real JWT validation precedes SQL; q is accepted only on authenticated list GET',async()=>{
  let calls=0;const database={query:async()=>{calls++;return {rows:[]};},connect:async()=>{throw Error('Unexpected mutation');}};
  const auth=await createTestAuthHarness(database),id='a2200000-0000-4000-8000-000000000001';
  try {
    const token=await auth.createTestAuthToken({userId:id});
    for(const query of ['q[]=a','q[x]=a','q=a&q=b','q='+encodeURIComponent('😀'.repeat(201)),'q=%00','q=a&type=Income','q=a&userId='+id,'accountId=bad','categoryId=bad','from=1900-02-30','to=1900-02-30','recurring=all','limit=0','cursor=x'])assert.equal((await auth.request(token,'/transactions?'+query)).status,400);
    assert.equal((await auth.request(null,'/transactions?q=a')).status,401);
    assert.equal((await auth.request('invalid.token','/transactions?q=a')).status,401);
    for(const [path,method] of [['/transactions','POST'],['/transactions/'+id,'GET'],['/transactions/'+id,'PUT'],['/transactions/'+id,'DELETE']])assert.equal((await auth.request(token,path+'?q=a',method,method==='GET'?undefined:{})).status,400);
    assert.equal(calls,0);
    for(const q of ['', ' ', 'Carrefour', '😀'.repeat(200)]) {
      const response=await auth.request(token,'/transactions?q='+encodeURIComponent(q));
      assert.equal(response.status,200);assert.equal(response.cache,'no-store');assert.deepEqual(response.body,{data:[],meta:{count:0}});
    }
    assert.equal(calls,4);
  }finally{await auth.close();}
});

test('T22 fresh search integration with T16/T21 regressions and runtime EXPLAIN',{
  skip:!process.env.T22_DISPOSABLE_DATABASE_URL&&'Requires a fresh guarded loopback PostgreSQL database',
},async context=>{context.diagnostic(JSON.stringify(await verifyIsolation(process.env.T22_DISPOSABLE_DATABASE_URL)));});

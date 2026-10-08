import {createGeneratedFixture} from './generated-fixture.mjs';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {URLSearchParams} from 'node:url';
import {createTestUser} from './v2-isolation.mjs';
import {createV2TransactionService} from '../../dist/services/v2-transactions.js';

export async function verifyV2Pagination({admin,runtime,pool,auth}) {
  let checks=0;const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const owners={a:{userId:'a2400000-0000-4000-8000-000000000001'},b:{userId:'b2400000-0000-4000-8000-000000000001'}},tokens={},refs={};
  for(const [key,user] of Object.entries(owners)) {
    await createTestUser(admin,user);tokens[key]=await auth.createTestAuthToken(user);const account=randomUUID(),category=randomUUID();refs[key]={account,category};
    await runtime.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type) VALUES($1,$2,$3,'bank')",[account,user.userId,key+' T24 account']);
    await runtime.query("INSERT INTO expense_tracker.categories(id,user_id,name,kind) VALUES($1,$2,$3,'expense')",[category,user.userId,key+' T24 category']);
    for(const count of [90,30])await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) SELECT gen_random_uuid(),$1,$2,$3,'expense',0.01,'T24Needle',CASE WHEN g%3=0 THEN '2025-10-31'::date WHEN g%3=1 THEN '2025-10-15'::date ELSE '2025-10-01'::date END FROM generate_series(1,$4::int) g",[user.userId,account,category,count]);
    await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES(gen_random_uuid(),$1,$2,'c1200000-0000-4000-8000-000000000001','income',999999999.99,'T24 income','2025-10-15')",[user.userId,account]);
    const definition=(await runtime.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,$3,'expense',0.10,'T24 generated','monthly','2025-10-01') RETURNING id",[user.userId,account,category])).rows[0].id;
    await createGeneratedFixture(runtime,{userId:user.userId,accountId:account,categoryId:category,type:'expense',amount:'0.10',description:'T24Needle generated',date:'2025-10-15',definitionId:definition,occurrenceDate:'2025-10-01'});
  }
  const page=(key,query={})=>auth.rawRequest(tokens[key],'/transactions?'+new URLSearchParams(query));
  async function traverse(key,query={}) {
    const rows=[];let cursor,pages=0;
    do {
      const response=await page(key,{...query,...(cursor?{cursor}:{})});equal(response.status,200);
      equal(Object.keys(response.body.meta).sort(),['hasMore','limit','nextCursor']);equal(response.body.meta.limit,Number(query.limit??25));
      assert.ok(response.body.data.length<=response.body.meta.limit);checks++;
      equal(response.body.meta.hasMore,response.body.meta.nextCursor!==null);equal(response.cache,'no-store');
      rows.push(...response.body.data);cursor=response.body.meta.nextCursor;pages++;assert.ok(pages<300);checks++;
    }while(cursor);
    equal(new Set(rows.map(row=>row.id)).size,rows.length);return {rows,pages};
  }
  for(const key of ['a','b']) {
    const expected=(await admin.query('SELECT id FROM expense_tracker.transactions WHERE user_id=$1 ORDER BY transaction_date DESC,created_at DESC,id DESC',[owners[key].userId])).rows.map(row=>row.id);
    for(const limit of [undefined,1,100]){const result=await traverse(key,limit?{limit:String(limit)}:{});equal(result.rows.map(row=>row.id),expected);for(const row of result.rows){equal(row.accountId,refs[key].account);equal(Object.keys(row).length,14);assert.match(row.amount,/^\d+\.\d{2}$/);checks++;}}
    for(const filters of [{q:'T24Needle'},{type:'expense'},{accountId:refs[key].account},{categoryId:refs[key].category},{from:'2025-10-15'},{to:'2025-10-15'},{recurring:'manual'},{recurring:'generated'},{q:'T24Needle',type:'expense',accountId:refs[key].account,categoryId:refs[key].category,from:'2025-10-01',to:'2025-10-31',recurring:'manual'}]) {
      const full=await auth.request(tokens[key],'/transactions?'+new URLSearchParams(filters)),paged=await traverse(key,{...filters,limit:'7'});equal(paged.rows,full.body.data);
    }
    equal((await page(key,{q:'no T24 match'})).body,{data:[],meta:{limit:25,nextCursor:null,hasMore:false}});
    const single=await page(key,{recurring:'generated',limit:'1'});equal(single.body.data.length,1);equal(single.body.meta,{limit:1,nextCursor:null,hasMore:false});
  }
  const first=await page('a',{limit:'7'}),cursor=first.body.meta.nextCursor;
  let generic;
  for(const [key,query] of [['b',{limit:'7',cursor}],['a',{limit:'8',cursor}],...Object.entries({q:'T24Needle',type:'expense',accountId:refs.a.account,categoryId:refs.a.category,from:'2025-10-01',to:'2025-10-31',recurring:'manual'}).map(([field,value])=>['a',{limit:'7',cursor,[field]:value}]),['a',{limit:'7',cursor:cursor.replace(/^./,cursor[0]==='A'?'B':'A')}],['a',{limit:'7',cursor:cursor.slice(0,-2)+'AA'}]]) {
    const response=await page(key,query);equal(response.status,400);equal(response.body.error.code,'VALIDATION_ERROR');if(!generic)generic=response.body;equal(response.body,generic);
  }
  // Default limit and explicit default, blank/trimmed q and UUID case canonicalize identically.
  const canonical={q:' T24Needle ',accountId:refs.a.account.toUpperCase()},canonicalFirst=await page('a',canonical);
  equal((await page('a',{q:'T24Needle',accountId:refs.a.account,limit:'25',cursor:canonicalFirst.body.meta.nextCursor})).status,200);
  const blank=await page('a',{q:' '});equal((await page('a',{cursor:blank.body.meta.nextCursor,limit:'25'})).status,200);
  const before=(await admin.query('SELECT id FROM expense_tracker.transactions WHERE user_id=$1 ORDER BY transaction_date DESC,created_at DESC,id DESC',[owners.a.userId])).rows.map(row=>row.id);
  // Deleting the anchor does not invalidate tuple continuation; newer inserts do not shift the next page.
  const initial=await page('a',{limit:'7'}),anchor=initial.body.data.at(-1);
  equal((await auth.rawRequest(tokens.a,'/transactions/'+anchor.id,'DELETE')).status,204);
  const inserted=randomUUID();await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,'expense',0.01,'T24 newer insert','2025-11-01')",[inserted,owners.a.userId,refs.a.account,refs.a.category]);
  const continuation=await page('a',{limit:'7',cursor:initial.body.meta.nextCursor});equal(continuation.body.data.map(row=>row.id),before.slice(7,14));
  // Remove an unseen row and move another ahead of the anchor; continuation reflects current membership.
  equal((await auth.rawRequest(tokens.a,'/transactions/'+before[8],'DELETE')).status,204);
  await runtime.query("UPDATE expense_tracker.transactions SET transaction_date='2025-11-02' WHERE id=$1 AND user_id=$2",[before[9],owners.a.userId]);
  const changed=await page('a',{limit:'7',cursor:initial.body.meta.nextCursor});equal(changed.body.data.map(row=>row.id),before.slice(7).filter(id=>id!==before[8]&&id!==before[9]).slice(0,7));
  // Existing T22 scale: traverse 10,023 owned rows through >100 pages and verify exact SQL order.
  const scaleOwner='a2200000-0000-4000-8000-000000000001',scaleToken=await auth.createTestAuthToken({userId:scaleOwner});
  const service=createV2TransactionService(pool,{cursorSigningSecret:randomBytes(32).toString('hex')});
  const expectedScale=(await admin.query('SELECT id FROM expense_tracker.transactions WHERE user_id=$1 ORDER BY transaction_date DESC,created_at DESC,id DESC',[scaleOwner])).rows.map(row=>row.id),visited=[];
  let scaleCursor,deepPage,pages=0;
  do {const result=await auth.rawRequest(scaleToken,'/transactions?'+new URLSearchParams({limit:'100',...(scaleCursor?{cursor:scaleCursor}:{})}));equal(result.status,200);visited.push(...result.body.data.map(row=>row.id));scaleCursor=result.body.meta.nextCursor;pages++;if(pages===50)deepPage=scaleCursor;}while(scaleCursor);
  equal(visited,expectedScale);equal(new Set(visited).size,expectedScale.length);assert.ok(pages>100);checks++;
  const performance=[];let captured;
  const measured=createV2TransactionService({query:async(sql,params)=>{if(!sql.startsWith('SELECT id'))captured={sql,params};return pool.query(sql,params);}},{cursorSigningSecret:randomBytes(32).toString('hex')});
  async function measure(label) {
    const plan=(await runtime.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+captured.sql,captured.params)).rows[0]['QUERY PLAN'][0];const nodes=[];function walk(node){nodes.push({type:node['Node Type'],index:node['Index Name']});for(const child of node.Plans??[])walk(child);}walk(plan.Plan);
    performance.push({label,planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],databaseRows:plan.Plan['Actual Rows'],nodes});
  }
  for(const [label,filters] of [['first',{}],['search',{q:'AScaleNeedle'}],['account/date',{accountId:(await runtime.query('SELECT id FROM expense_tracker.accounts WHERE user_id=$1 AND name LIKE $2',[scaleOwner,'AOnly Salary%'])).rows[0].id,from:'1901-01-01',to:'1901-12-31'}]]) {
    const limit=label==='first'?100:25;
    let result=await measured.listTransactions(scaleOwner,{...filters,limit});await measure(label+' page');
    if(label==='first'){for(let i=0;i<50;i++)result=await measured.listTransactions(scaleOwner,{limit,cursor:result.meta.nextCursor});await measure('deep after 50 pages');}
    else {assert.ok(result.meta.nextCursor);checks++;await measured.listTransactions(scaleOwner,{...filters,limit,cursor:result.meta.nextCursor});await measure(label+' continuation');}
  }
  // A separate first-page plan; the service secret is ephemeral and never appears in results.
  const scopeFirst=await service.listTransactions(scaleOwner);equal(scopeFirst.data.length,25);assert.ok(deepPage);checks++;
  return {checks,deepRows:visited.length,deepPages:pages,tiedTraversal:true,microsecondTuple:true,crossUserRejected:true,anchorDeletion:true,newerInsert:true,performance,remoteTouched:false};
}

import {createGeneratedFixture} from './generated-fixture.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {URLSearchParams} from 'node:url';
import {createRegressionTransactionService as createV2TransactionService} from './transaction-pages.mjs';
import {createTestUser,financialSnapshot,expectApiError} from './v2-isolation.mjs';

export async function verifyV2Filters({admin,runtime,pool,auth}) {
  const users={a:{userId:'a2300000-0000-4000-8000-000000000001'},b:{userId:'b2300000-0000-4000-8000-000000000001'}};
  const refs={},tokens={},fixtures=[];
  let checks=0;const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const sys={expense:'c1200000-0000-4000-8000-000000000004',income:'c1200000-0000-4000-8000-000000000001'};
  for(const [key,user] of Object.entries(users)) {
    await createTestUser(admin,user);tokens[key]=await auth.createTestAuthToken(user,{metadataOwner:users[key==='a'?'b':'a'].userId});
    refs[key]={accounts:[],categories:[]};
    for(const name of [key+' T23UberAccount',key+' T23OtherAccount']) {
      const id=randomUUID();await runtime.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type) VALUES($1,$2,$3,'bank')",[id,user.userId,name]);refs[key].accounts.push({id,name});
    }
    for(const [name,kind] of [[key+' T23Transport','expense'],[key+' T23UberCategory','expense'],[key+' T23Income','income']]) {
      const id=randomUUID();await runtime.query('INSERT INTO expense_tracker.categories(id,user_id,name,kind) VALUES($1,$2,$3,$4)',[id,user.userId,name,kind]);refs[key].categories.push({id,name});
    }
  }
  async function insert({key='a',account=0,category=0,type='expense',description='Uber journey',date='2025-10-15',amount='0.10',generated=false,categoryId,id=randomUUID()}={}) {
    const ref=refs[key],cat=categoryId?{id:categoryId,name:type==='income'?'Salary':'Food'}:ref.categories[category];
    let definition=null,occurrence=null;
    if(generated) {
      definition=(await runtime.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,$3,$4,$5,'T23 posted schedule','monthly',$6) RETURNING id",[users[key].userId,ref.accounts[account].id,cat.id,type,amount,date])).rows[0].id;
    }
    if(generated)occurrence=(await createGeneratedFixture(runtime,{id,userId:users[key].userId,accountId:ref.accounts[account].id,categoryId:cat.id,type,amount,description,date,definitionId:definition,occurrenceDate:date})).occurrenceId;
    else await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,users[key].userId,ref.accounts[account].id,cat.id,type,amount,description,date]);
    const fixture={id,key,accountId:ref.accounts[account].id,accountName:ref.accounts[account].name,categoryId:cat.id,categoryName:cat.name,type,description,date,amount,recurring:generated?'generated':'manual',definition,occurrence};fixtures.push(fixture);return fixture;
  }
  for(const key of ['a','b']) {
    await insert({key,date:'2025-10-01',amount:'0.01'});await insert({key,date:'2025-10-15',amount:'999999999.99'});await insert({key,date:'2025-10-31',amount:'0.30'});
    await insert({key,account:1,description:'Uber other account'});await insert({key,category:1,description:'Plain category-only match'});
    await insert({key,account:1,category:1,description:'Plain category match'});await insert({key,type:'income',category:2,description:'Uber refund'});
    await insert({key,type:'income',categoryId:sys.income,description:'Plain salary'});await insert({key,categoryId:sys.expense,date:'2025-09-30'});
    await insert({key,date:'2025-11-01'});await insert({key,account:1,description:key+' T23OwnerOnly'});
    await insert({key,generated:true,description:'Uber generated'});
  }
  // Tied dates and createdAt from one statement test the final UUID ordering discriminator.
  const tied=[randomUUID(),randomUUID()];await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$3,$4,$5,'expense',0.01,'T23 tied','2025-10-15'),($2,$3,$4,$5,'expense',0.01,'T23 tied','2025-10-15')",[...tied,users.a.userId,refs.a.accounts[0].id,refs.a.categories[0].id]);
  for(const id of tied)fixtures.push({id,key:'a',accountId:refs.a.accounts[0].id,accountName:refs.a.accounts[0].name,categoryId:refs.a.categories[0].id,categoryName:refs.a.categories[0].name,type:'expense',description:'T23 tied',date:'2025-10-15',amount:'0.01',recurring:'manual'});
  const ordered=(await admin.query('SELECT id FROM expense_tracker.transactions WHERE user_id=ANY($1::uuid[]) ORDER BY transaction_date DESC,created_at DESC,id DESC',[[users.a.userId,users.b.userId]])).rows.map(row=>row.id);
  const byId=new Map(fixtures.map(row=>[row.id,row]));
  async function match(filters={},key='a') {
    const response=await auth.request(tokens[key],'/transactions?'+new URLSearchParams(filters));equal(response.status,200);
    const expected=ordered.filter(id=>{
      const row=byId.get(id);return row.key===key&&(!filters.type||row.type===filters.type)&&(!filters.accountId||row.accountId===filters.accountId.toLowerCase())&&(!filters.categoryId||row.categoryId===filters.categoryId.toLowerCase())&&(!filters.from||row.date>=filters.from)&&(!filters.to||row.date<=filters.to)&&(!filters.recurring||row.recurring===filters.recurring)&&(!filters.q?.trim()||[row.description,row.accountName,row.categoryName].some(text=>text.toLowerCase().includes(filters.q.trim().toLowerCase())));
    });
    equal(response.body.data.map(row=>row.id),expected);equal(response.body.meta,{count:expected.length});equal(response.cache,'no-store');equal(new Set(response.body.data.map(row=>row.id)).size,expected.length);
    for(const row of response.body.data){equal(row.amount,byId.get(row.id).amount);equal(Object.keys(row).length,14);}
    return response.body.data;
  }
  const before=await financialSnapshot(admin);
  const options={q:'uber',type:'expense',accountId:refs.a.accounts[0].id,categoryId:refs.a.categories[0].id,from:'2025-10-01',to:'2025-10-31',recurring:'manual'};
  // All 128 subsets verify AND composition, including account/category name search precedence.
  const keys=Object.keys(options);
  for(let mask=0;mask<128;mask++)await match(Object.fromEntries(keys.filter((_key,index)=>mask&(1<<index)).map(key=>[key,options[key]])));
  for(const key of ['a','b']) {
    await match({},key);await match({type:'income'},key);await match({recurring:'generated'},key);await match({recurring:'manual'},key);
    await match({categoryId:sys.expense},key);await match({categoryId:sys.income},key);
    await match({type:'income',categoryId:refs[key].categories[0].id},key);
    await match({from:'2025-10-15',to:'2025-10-15'},key);await match({from:'9999-12-31'},key);await match({from:'2026-10-01',to:'2026-10-31'},key);
    await match({q:'  uber  ',type:'expense',accountId:refs[key].accounts[0].id,categoryId:refs[key].categories[0].id,from:'2025-10-01',to:'2025-10-31',recurring:'generated'},key);
    await match({q:(key==='a'?'b':'a')+' T23OwnerOnly'},key);
  }
  await match({accountId:refs.a.accounts[0].id.toUpperCase(),categoryId:refs.a.categories[0].id.toUpperCase()});
  const tiedRows=(await match({from:'2025-10-15',to:'2025-10-15',recurring:'manual'})).filter(row=>tied.includes(row.id));equal(tiedRows.map(row=>row.id),[...tied].sort().reverse());equal(tiedRows[0].createdAt,tiedRows[1].createdAt);
  const absent='00000000-0000-4000-8000-000000000000';
  for(const [key,other] of [['a','b'],['b','a']])for(const [field,foreignId] of [['accountId',refs[other].accounts[0].id],['categoryId',refs[other].categories[0].id]])for(const extras of [{},{q:'uber',type:'expense',from:'9999-12-31',recurring:'generated'}]) {
    const foreign=await auth.request(tokens[key],'/transactions?'+new URLSearchParams({...extras,[field]:foreignId})),missing=await auth.request(tokens[key],'/transactions?'+new URLSearchParams({...extras,[field]:absent}));
    expectApiError(foreign,404,'NOT_FOUND');expectApiError(missing,404,'NOT_FOUND');checks+=2;equal(foreign.body,missing.body);equal(foreign.body.error.details,[]);
  }
  for(const query of ['type=Income','type=all','recurring=all','from=2026-02-29','to=2026-04-31','from=2025-10-31&to=2025-10-01','accountId=bad','categoryId=bad','q=a&q=b','accountId='+refs.a.accounts[0].id+'&accountId='+refs.a.accounts[1].id,'categoryId='+sys.expense+'&categoryId='+sys.income,'type=income&type=expense','from=2025-10-01&from=2025-10-15','to=2025-10-01&to=2025-10-15','recurring=manual&recurring=generated','q[x]=uber','limit=0','cursor=x','userId='+users.b.userId,"type=' OR 1=1 --",'accountId='+encodeURIComponent("'; DROP TABLE expense_tracker.transactions; --")]) {
    const response=await auth.request(tokens.a,'/transactions?'+query);expectApiError(response,400,'VALIDATION_ERROR');checks++;
  }
  equal((await auth.request(null,'/transactions?type=expense')).status,401);equal((await auth.request('invalid.token','/transactions?type=expense')).status,401);
  equal(await financialSnapshot(admin),before);
  // Archives affect writes only; existing ID filters remain visible and compose with search.
  equal((await auth.request(tokens.a,'/accounts/'+refs.a.accounts[0].id+'/archive','POST',{})).status,200);
  await runtime.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[refs.a.categories[0].id]);
  const archivedBefore=await financialSnapshot(admin);
  await match({accountId:refs.a.accounts[0].id});await match({categoryId:refs.a.categories[0].id});await match(options);await match({...options,recurring:'generated'});
  equal(await financialSnapshot(admin),archivedBefore);
  const generated=fixtures.find(row=>row.key==='a'&&row.recurring==='generated'),markerBefore=(await runtime.query('SELECT to_jsonb(o) row FROM expense_tracker.recurring_occurrences o WHERE id=$1',[generated.occurrence])).rows[0].row;
  const removed=await auth.request(tokens.a,'/transactions/'+generated.id,'DELETE');equal(removed.status,204);
  const markerAfter=(await runtime.query('SELECT to_jsonb(o) row FROM expense_tracker.recurring_occurrences o WHERE id=$1',[generated.occurrence])).rows[0].row;
  equal(markerAfter,{...markerBefore,generated_transaction_id:null,updated_at:markerAfter.updated_at});equal(markerAfter.status,'posted');equal(markerAfter.occurrence_date,generated.date);
  ordered.splice(ordered.indexOf(generated.id),1);await match({recurring:'generated'});await match({recurring:'manual'});

  // Reuse T22's 20,000 scale transactions, without adding another bulk fixture.
  const owner='a2200000-0000-4000-8000-000000000001',otherOwner='b2200000-0000-4000-8000-000000000001';
  const scaleAccount=(await runtime.query('SELECT id FROM expense_tracker.accounts WHERE user_id=$1 AND name LIKE $2',[owner,'AOnly Salary%'])).rows[0].id;
  const scaleCategory=(await runtime.query('SELECT id FROM expense_tracker.categories WHERE user_id=$1 AND name LIKE $2',[owner,'AOnly Transport%'])).rows[0].id;
  for(const table of ['transactions','accounts','categories'])await admin.query('ANALYZE expense_tracker.'+table);
  const performance=[];let captured;
  const measured=createV2TransactionService({query:async(sql,params)=>{
    if(!sql.startsWith('SELECT id')&&!sql.includes('(t.transaction_date,t.created_at,t.id)<'))captured={sql,params};return pool.query(sql,params);
  }});
  for(const [label,filters] of [
    ['date range',{from:'1901-02-01',to:'1901-02-28'}],['account',{accountId:scaleAccount}],['category',{categoryId:scaleCategory}],
    ['type and date',{type:'expense',from:'1901-02-01',to:'1901-02-28'}],
    ['search, date and account',{q:'AScaleNeedle',accountId:scaleAccount,from:'1901-01-01',to:'1901-12-31'}],
  ]) {
    const rows=await measured.listTransactions(owner,filters);
    const explanation=(await runtime.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+captured.sql,captured.params)).rows[0]['QUERY PLAN'][0];
    const nodes=[];function walk(node){nodes.push({type:node['Node Type'],index:node['Index Name'],rows:node['Actual Rows'],filter:node.Filter});for(const child of node.Plans??[])walk(child);}walk(explanation.Plan);
    equal(explanation.Plan['Actual Rows'],Math.min(101,rows.length));equal(new Set(rows.map(row=>row.id)).size,rows.length);
    for(const row of rows){assert.ok(!filters.from||row.date>=filters.from);assert.ok(!filters.to||row.date<=filters.to);assert.ok(!filters.type||row.type===filters.type);assert.ok(!filters.categoryId||row.categoryId===filters.categoryId);if(label.includes('account'))assert.equal(row.accountId,scaleAccount);}
    checks++;
    performance.push({label,rows:rows.length,planningMs:explanation['Planning Time'],executionMs:explanation['Execution Time'],nodes});
  }
  equal((await measured.listTransactions(otherOwner,{q:'AScaleNeedle',type:'expense',from:'1901-01-01',to:'1901-12-31',recurring:'manual'})).length,0);
  const ownScaleAccount=await measured.listTransactions(owner,{q:'AScaleNeedle',accountId:scaleAccount});equal(ownScaleAccount.length,100);
  return {checks,subsetCombinations:128,foreignAndMissingIdentical:true,archivedHistory:true,durableMarkerPreserved:true,reusedScaleRows:20000,performance,remoteTouched:false};
}

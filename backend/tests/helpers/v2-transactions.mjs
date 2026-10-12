import {createGeneratedFixture} from './generated-fixture.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {createV2TransactionService} from '../../dist/services/v2-transactions.js';
import {createAccountBalanceRepository} from '../../dist/services/account-balances.js';
import {createTestUser,financialSnapshot,expectApiError} from './v2-isolation.mjs';

export async function verifyV2Transactions({admin,runtime,pool,auth}) {
  const a={userId:'a2100000-0000-4000-8000-000000000001'},b={userId:'b2100000-0000-4000-8000-000000000001'};
  for(const user of [a,b])await createTestUser(admin,user);
  const tokens={a:await auth.createTestAuthToken(a,{metadataOwner:b.userId}),b:await auth.createTestAuthToken(b,{metadataOwner:a.userId})};
  let checks=0;const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const error=(result,status,code)=>{expectApiError(result,status,code);checks++;};
  const repo=createAccountBalanceRepository(pool),base='/transactions/',absent='00000000-0000-4000-8000-000000000000';
  const sys={income:'c1200000-0000-4000-8000-000000000001',expense:'c1200000-0000-4000-8000-000000000004',both:'c1200000-0000-4000-8000-000000000009'};
  async function account(name,type='bank',openingBalance='0.00',token=tokens.a) {
    const result=await auth.request(token,'/accounts','POST',{name,type,openingBalance,currency:'EGP'});equal(result.status,201);return result.body.data;
  }
  async function category(user,kind,status='active') {
    const id=randomUUID();await runtime.query('INSERT INTO expense_tracker.categories(id,user_id,name,kind,status) VALUES($1,$2,$3,$4,$5)',[id,user.userId,'T21 '+kind+' '+id,kind,status]);return id;
  }
  const bank=await account('T21 Bank'),other=await account('T21 Other asset'),card=await account('T21 Card','credit_card','1000.00'),foreign=await account('T21 Foreign','bank','0.00',tokens.b);
  const custom=await category(a,'expense'),both=await category(a,'both'),foreignCategory=await category(b,'expense'),archivedCategory=await category(a,'expense','archived');
  const body=(overrides={})=>({accountId:bank.id,categoryId:sys.expense,type:'expense',amount:'40.00',description:'T21 groceries',date:'1900-01-01',...overrides});
  async function create(input,token=tokens.a) {const result=await auth.request(token,'/transactions','POST',input);equal(result.status,201);equal(result.location,base.replace('/transactions/','/api/v2/transactions/')+result.body.data.id);equal(result.cache,'no-store');return result.body.data;}
  const get=async id=>(await auth.request(tokens.a,base+id)).body.data;
  const balance=async id=>(await repo.getAccountBalance(a.userId,id)).currentBalance;
  const update=async(id,input)=>{const result=await auth.request(tokens.a,base+id,'PUT',input);equal(result.status,200);return result.body.data;};
  const remove=async(id,token=tokens.a)=>{const result=await auth.request(token,base+id,'DELETE');equal(result.status,204);equal(result.body,null);equal(result.cache,'no-store');};

  const income=await create(body({type:'income',categoryId:sys.income,amount:'100'}));equal(income.amount,'100.00');equal(income.accountName,'T21 Bank');equal(income.categoryName,'Salary');equal(income.recurringTransactionId,null);equal(income.recurringOccurrenceDate,null);equal(await balance(bank.id),'100.00');
  const expense=await create(body());equal(await balance(bank.id),'60.00');equal((await repo.getAccountBalance(a.userId,bank.id)).openingBalanceEditable,false);
  equal(Object.keys(expense).sort(),['id','accountId','accountName','categoryId','categoryName','type','amount','currency','description','date','recurringTransactionId','recurringOccurrenceDate','createdAt','updatedAt'].sort());
  const updated=await update(expense.id,body({amount:'50.10',description:'  Corrected ☕  '}));equal(updated.id,expense.id);equal(updated.createdAt,expense.createdAt);equal(updated.description,'Corrected ☕');assert.ok(updated.updatedAt>expense.updatedAt);checks++;equal(await balance(bank.id),'49.90');
  await update(expense.id,body({accountId:other.id,amount:'50.10'}));equal(await balance(bank.id),'100.00');equal(await balance(other.id),'-50.10');await remove(expense.id);equal(await balance(other.id),'0.00');
  equal((await repo.getAccountBalance(a.userId,other.id)).openingBalanceEditable,false);
  const purchase=await create(body({accountId:card.id,amount:'250.00'}));equal(await balance(card.id),'1250.00');const refund=await create(body({accountId:card.id,type:'income',categoryId:sys.income,amount:'100.00'}));equal(await balance(card.id),'1150.00');
  await update(purchase.id,body({accountId:card.id,amount:'300.00'}));equal(await balance(card.id),'1200.00');await remove(purchase.id);equal(await balance(card.id),'900.00');await remove(refund.id);equal(await balance(card.id),'1000.00');
  const overpayment=await create(body({accountId:card.id,type:'income',categoryId:sys.income,amount:'1250.00'}));equal(await balance(card.id),'-250.00');
  await update(overpayment.id,body({accountId:other.id,type:'income',categoryId:sys.income,amount:'1250.00'}));equal(await balance(card.id),'1000.00');equal(await balance(other.id),'1250.00');
  await update(overpayment.id,body({accountId:other.id,type:'expense',categoryId:sys.expense,amount:'1250.00'}));equal(await balance(other.id),'-1250.00');await remove(overpayment.id);equal(await balance(other.id),'0.00');
  const customRow=await create(body({categoryId:custom,amount:'0.01',description:'😀'.repeat(200)}));equal(Array.from(customRow.description).length,200);
  for(const type of ['income','expense'])for(const categoryId of [both,sys.both])await create(body({type,categoryId,amount:'0.01'}));
  for(const amount of ['0.01','999999999.99']){const row=await create(body({amount}));equal(row.amount,amount);await remove(row.id);}
  // Base list: all owned rows, no pretend filters/cursors, deterministic date/created/id order.
  const listed=await auth.request(tokens.a,'/transactions');equal(listed.status,200);equal(listed.body.meta,{count:listed.body.data.length});
  const expected=(await admin.query('SELECT id FROM expense_tracker.transactions WHERE user_id=$1 ORDER BY transaction_date DESC,created_at DESC,id DESC',[a.userId])).rows.map(row=>row.id);equal(listed.body.data.map(row=>row.id),expected);equal((await get(income.id)).amount,'100.00');equal((await auth.request(tokens.b,'/transactions')).body,{data:[],meta:{count:0}});
  const baseline=await financialSnapshot(admin);
  for(const token of [null,'invalid.token'])for(const [path,method,input] of [['/transactions','GET'],['/transactions','POST',body()],[base+income.id,'GET'],[base+income.id,'PUT',body()],[base+income.id,'DELETE']])error(await auth.request(token,path,method,input),401,token?'AUTH_INVALID':'AUTH_REQUIRED');
  for(const [method,input] of [['GET',undefined],['PUT',body()],['DELETE',undefined]]) {
    const foreignResult=await auth.request(tokens.b,base+income.id,method,input),missing=await auth.request(tokens.b,base+absent,method,input);error(foreignResult,404,'NOT_FOUND');error(missing,404,'NOT_FOUND');equal(foreignResult.body,missing.body);
  }
  for(const [key,value] of [['accountId',foreign.id],['categoryId',foreignCategory]])for(const [path,method] of [['/transactions','POST'],[base+income.id,'PUT']]) {
    const foreignResult=await auth.request(tokens.a,path,method,body({[key]:value})),missing=await auth.request(tokens.a,path,method,body({[key]:absent}));error(foreignResult,404,'NOT_FOUND');error(missing,404,'NOT_FOUND');equal(foreignResult.body,missing.body);
  }
  for(const field of ['userId','ownerId','accountUserId','createdBy','recurringTransactionId','recurringOccurrenceDate','currency','id','updatedAt'])for(const [path,method] of [['/transactions','POST'],[base+income.id,'PUT']])error(await auth.request(tokens.a,path,method,body({[field]:b.userId})),400,'VALIDATION_ERROR');
  for(const query of ['q[]=food','type=Income','accountId=bad','categoryId=bad','from=1900-02-30','recurring=all','limit=0','cursor=fake','userId='+b.userId,'type=expense&type=expense'])error(await auth.request(tokens.a,'/transactions?'+query),400,'VALIDATION_ERROR');
  for(const categoryId of [sys.income])for(const [path,method] of [['/transactions','POST'],[base+income.id,'PUT']])error(await auth.request(tokens.a,path,method,body({categoryId})),400,'VALIDATION_ERROR');
  error(await auth.request(tokens.a,'/transactions','POST',body({categoryId:archivedCategory})),409,'CATEGORY_ARCHIVED');
  error(await auth.request(tokens.a,base+income.id,'PUT',body({categoryId:archivedCategory})),409,'CATEGORY_ARCHIVED');
  for(const money of ['0','-1','1.001','1e2','1000000000',' 1',1])error(await auth.request(tokens.a,'/transactions','POST',body({amount:money})),400,'VALIDATION_ERROR');
  for(const date of ['1899-01-01','2026-02-29','9999-01-01'])error(await auth.request(tokens.a,base+income.id,'PUT',body({date})),400,'VALIDATION_ERROR');
  equal(await financialSnapshot(admin),baseline);
  // Legacy read resources remain consumable; storage is nullable and never duplicates categories.
  equal((await runtime.query('SELECT category FROM expense_tracker.transactions WHERE id=$1',[income.id])).rows[0].category,null);
  equal((await auth.v1Request(base+income.id)).body.data.category,'salary');equal((await auth.v1Request(base+customRow.id)).body.data.category,'other');equal((await auth.v1Request('/transactions')).status,200);equal((await auth.v1Request('/summary')).status,200);
  assert.ok((await auth.v1Request('/transactions?type=income&category=salary')).body.data.some(row=>row.id===income.id));checks++;
  assert.ok((await auth.v1Request('/transactions?type=expense&category=other')).body.data.some(row=>row.id===customRow.id));checks++;
  error(await auth.v1Request('/transactions','POST',{type:'expense',amount:'1.00',description:'T21 V1 write remains denied',category:'other',date:'1900-01-01'}),500,'INTERNAL_ERROR');
  // Archived historical reads/deletes work; even unchanged archived resulting refs block edits.
  await auth.request(tokens.a,'/accounts/'+bank.id+'/archive','POST',{});equal((await auth.request(tokens.a,base+income.id)).status,200);error(await auth.request(tokens.a,'/transactions','POST',body()),409,'ACCOUNT_ARCHIVED');error(await auth.request(tokens.a,base+income.id,'PUT',body({type:'income',categoryId:sys.income,amount:'100.00'})),409,'ACCOUNT_ARCHIVED');
  await update(income.id,body({accountId:other.id,type:'income',categoryId:sys.income,amount:'100.00'}));equal(await balance(bank.id),'-0.01');equal(await balance(other.id),'100.00');
  await auth.request(tokens.a,'/accounts/'+bank.id+'/restore','POST',{});await runtime.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[custom]);equal((await auth.request(tokens.a,base+customRow.id)).status,200);error(await auth.request(tokens.a,base+customRow.id,'PUT',body({categoryId:custom,amount:'0.01'})),409,'CATEGORY_ARCHIVED');
  await auth.request(tokens.a,'/accounts/'+bank.id+'/archive','POST',{});await remove(customRow.id);await auth.request(tokens.a,'/accounts/'+bank.id+'/restore','POST',{});
  // Generated financial fields are editable, but original occurrence identity is immutable.
  const definition=(await runtime.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,$3,'expense',1.00,'T21 generated definition','monthly','1900-01-01') RETURNING id",[a.userId,bank.id,sys.expense])).rows[0].id;
  const generated=randomUUID(),occurrence=randomUUID();
  await createGeneratedFixture(runtime,{id:generated,occurrenceId:occurrence,userId:a.userId,accountId:bank.id,categoryId:sys.expense,type:'expense',amount:'1.00',description:'Generated',date:'1900-01-01',definitionId:definition,occurrenceDate:'1900-01-01',legacyCategory:'other'});
  const generatedBefore=await get(generated),markerBefore=(await runtime.query('SELECT to_jsonb(o) row FROM expense_tracker.recurring_occurrences o WHERE id=$1',[occurrence])).rows[0].row;
  const editedGenerated=await update(generated,body({accountId:other.id,type:'income',categoryId:sys.income,amount:'0.20',date:'1900-02-01'}));equal(editedGenerated.recurringTransactionId,definition);equal(editedGenerated.recurringOccurrenceDate,'1900-01-01');equal(editedGenerated.createdAt,generatedBefore.createdAt);equal((await runtime.query('SELECT to_jsonb(o) row FROM expense_tracker.recurring_occurrences o WHERE id=$1',[occurrence])).rows[0].row,markerBefore);
  equal((await runtime.query('SELECT category FROM expense_tracker.transactions WHERE id=$1',[generated])).rows[0].category,'other');
  // Fail after actual INSERT/UPDATE/DELETE: row, reference locks and occurrence changes roll back.
  for(const operation of ['INSERT','UPDATE','DELETE']) {
    const unused=await account('T21 rollback '+operation),before=await financialSnapshot(admin),failure=new Error('injected private SQL failure');
    const faulty=createV2TransactionService({query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,params)=>{const result=await client.query(sql,params);if(sql.startsWith(operation+' ')&&sql.includes('expense_tracker.transactions'))throw failure;return result;},release:()=>client.release()};}});
    await assert.rejects(operation==='INSERT'?faulty.createTransaction(a.userId,body({accountId:unused.id})):operation==='UPDATE'?faulty.updateTransaction(a.userId,generated,body({accountId:unused.id})):faulty.deleteTransaction(a.userId,generated),e=>e===failure);checks++;equal(await financialSnapshot(admin),before);
  }
  await auth.request(tokens.a,'/accounts/'+other.id+'/archive','POST',{});await remove(generated);await auth.request(tokens.a,'/accounts/'+other.id+'/restore','POST',{});
  const markerAfter=(await runtime.query('SELECT to_jsonb(o) row FROM expense_tracker.recurring_occurrences o WHERE id=$1',[occurrence])).rows[0].row;equal(markerAfter,{...markerBefore,generated_transaction_id:null,updated_at:markerAfter.updated_at});equal(markerAfter.status,'posted');equal(markerAfter.occurrence_date,'1900-01-01');
  error(await auth.request(tokens.a,base+generated),404,'NOT_FOUND');

  async function waitBlocked(fragment) {for(let i=0;i<120;i++){if((await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE $1",['%'+fragment+'%'])).rows[0].n>0)return;await pause(25);}throw Error('Expected real database lock contention: '+fragment);}
  // Archive wins the account lock: the waiting API POST must see archived state.
  const racing=await account('T21 archive wins'),locker=await pool.connect();await locker.query('BEGIN');await locker.query("UPDATE expense_tracker.accounts SET status='archived' WHERE id=$1",[racing.id]);
  const waiting=auth.request(tokens.a,'/transactions','POST',body({accountId:racing.id}));await waitBlocked('SELECT status FROM expense_tracker.accounts');await locker.query('COMMIT');locker.release();error(await waiting,409,'ACCOUNT_ARCHIVED');equal((await repo.getAccountBalance(a.userId,racing.id)).openingBalanceEditable,true);
  // Posting wins first: archive waits, then commits with posted history intact.
  const postedFirst=await account('T21 posting wins');let unlock,entered;const gate=new Promise(resolve=>unlock=resolve),ready=new Promise(resolve=>entered=resolve);
  const gated=createV2TransactionService({query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,params)=>{const result=await client.query(sql,params);if(sql.startsWith('INSERT INTO expense_tracker.transactions')){entered();await gate;}return result;},release:()=>client.release()};}});
  const posting=gated.createTransaction(a.userId,body({accountId:postedFirst.id}));await ready;const archiving=auth.request(tokens.a,'/accounts/'+postedFirst.id+'/archive','POST',{});await waitBlocked('SELECT opening_balance');unlock();const postedRow=await posting;equal((await archiving).status,200);equal((await get(postedRow.id)).amount,'40.00');equal(await balance(postedFirst.id),'-40.00');
  // Concurrent edits/deletes serialize on the transaction; no partial update survives deletion.
  const beforeCompeting=await balance(other.id),competing=await create(body({accountId:other.id,amount:'0.10'})),rowLocker=await pool.connect();await rowLocker.query('BEGIN');await rowLocker.query('SELECT id FROM expense_tracker.transactions WHERE id=$1 FOR UPDATE',[competing.id]);
  const editing=auth.request(tokens.a,base+competing.id,'PUT',body({accountId:other.id,amount:'0.20'})),deleting=auth.request(tokens.a,base+competing.id,'DELETE');await waitBlocked('expense_tracker.transactions');await rowLocker.query('COMMIT');rowLocker.release();
  const [editResult,deleteResult]=await Promise.all([editing,deleting]);assert.ok([200,404].includes(editResult.status));checks++;equal(deleteResult.status,204);equal((await auth.request(tokens.a,base+competing.id)).status,404);equal(await balance(other.id),beforeCompeting);
  // Category archive wins SHARE contention, including a new selection on PUT.
  const racingCategory=await category(a,'expense'),categoryLocker=await pool.connect();await categoryLocker.query('BEGIN');await categoryLocker.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[racingCategory]);
  const categoryPosting=auth.request(tokens.a,'/transactions','POST',body({accountId:other.id,categoryId:racingCategory}));await waitBlocked('SELECT status,kind FROM expense_tracker.categories');
  const incomeBefore=await get(income.id),categoryEditing=auth.request(tokens.a,base+income.id,'PUT',body({accountId:other.id,categoryId:racingCategory}));await categoryLocker.query('COMMIT');categoryLocker.release();error(await categoryPosting,409,'CATEGORY_ARCHIVED');error(await categoryEditing,409,'CATEGORY_ARCHIVED');equal(await get(income.id),incomeBefore);
  // Force an actual created_at tie so UUID DESC is independently checked.
  // A single fixture statement produces identical statement_timestamp values;
  // the existing timestamp trigger correctly forbids changing created_at afterward.
  const tied=[randomUUID(),randomUUID()];await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$3,$4,$5,'expense',0.01,'T21 tied A','1900-02-01'),($2,$3,$4,$5,'expense',0.01,'T21 tied B','1900-02-01')",[...tied,a.userId,other.id,sys.expense]);
  const tiedList=(await auth.request(tokens.a,'/transactions')).body.data.filter(row=>tied.includes(row.id));equal(tiedList.map(row=>row.id),[...tied].sort().reverse());equal(tiedList[0].createdAt,tiedList[1].createdAt);
  const finalList=await auth.request(tokens.a,'/transactions');equal(finalList.body.data.some(row=>row.accountId===foreign.id),false);equal((await auth.request(tokens.b,'/transactions')).body.data,[]);
  // A separate B lifecycle verifies the service does not accidentally privilege A.
  const bRow=await create(body({accountId:foreign.id,categoryId:foreignCategory}),tokens.b);equal((await auth.request(tokens.b,base+bRow.id)).status,200);equal((await auth.request(tokens.b,base+bRow.id,'PUT',body({accountId:foreign.id,categoryId:foreignCategory,amount:'1.01'}))).status,200);error(await auth.request(tokens.a,base+bRow.id),404,'NOT_FOUND');await remove(bRow.id,tokens.b);
  return {checks,realTransactionApi:true,generatedMarkerPreserved:true,rollbackFaults:3,concurrencyRaces:4,legacyReads:true,legacyOwnerlessCreateDenied:true,remoteTouched:false};
}

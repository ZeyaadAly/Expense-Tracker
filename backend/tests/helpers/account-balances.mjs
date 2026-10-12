import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createGeneratedFixture} from './generated-fixture.mjs';
import {createAccountBalanceRepository} from '../../dist/services/account-balances.js';
import {createTestUser,financialSnapshot,expectApiError} from './v2-isolation.mjs';

export async function verifyAccountBalances({admin,runtime,pool,auth}) {
  const owner={userId:'a1800000-0000-4000-8000-000000000001'},other={userId:'b1800000-0000-4000-8000-000000000001'},netUser={userId:'c1800000-0000-4000-8000-000000000001'};
  for(const user of [owner,other,netUser])await createTestUser(admin,user);
  const token=await auth.createTestAuthToken(owner),otherToken=await auth.createTestAuthToken(other);
  const repo=createAccountBalanceRepository(pool);
  let checks=0;
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  async function account(name,type,opening='0.00',user=owner) {
    const result=await runtime.query('INSERT INTO expense_tracker.accounts(user_id,name,type,opening_balance) VALUES($1,$2,$3,$4) RETURNING id',[user.userId,name,type,opening]);return result.rows[0].id;
  }
  async function transaction(id,type,amount,user=owner,extra={}) {
    if(extra.definition)return (await createGeneratedFixture(runtime,{userId:user.userId,accountId:id,categoryId:type==='income'?'c1200000-0000-4000-8000-000000000001':'c1200000-0000-4000-8000-000000000004',type,amount,description:'T18 posted fixture',date:'1900-01-01',definitionId:extra.definition,occurrenceDate:extra.date})).id;
    const result=await runtime.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date,recurring_transaction_id,recurring_occurrence_date)
      VALUES($1,$2,$3,$4,$5,$6,'T18 posted fixture','1900-01-01',$7,$8) RETURNING id`,[randomUUID(),user.userId,id,type==='income'?'c1200000-0000-4000-8000-000000000001':'c1200000-0000-4000-8000-000000000004',type,amount,extra.definition??null,extra.date??null]);return result.rows[0].id;
  }
  async function transfer(source,destination,amount,user=owner) {
    const result=await runtime.query("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,$4,'1900-01-01') RETURNING id",[user.userId,source,destination,amount]);return result.rows[0].id;
  }
  const balance=async(id,user=owner)=>(await repo.getAccountBalance(user.userId,id)).currentBalance;
  const openings=[];
  for(const [type,opening] of [['cash','100.00'],['bank','-100.00'],['savings','0.00'],['mobile_wallet','15.20'],['other','0.01'],['credit_card','100.00'],['credit_card','-50.00'],['credit_card','0.00']]) {
    const id=await account('Opening '+openings.length,type,opening);openings.push(id);equal(await balance(id),opening);
  }
  const income=await account('Income only','bank');await transaction(income,'income','0.10');await transaction(income,'income','0.20');equal(await balance(income),'0.30');
  const expense=await account('Expense only','cash');await transaction(expense,'expense','0.10');await transaction(expense,'expense','0.20');equal(await balance(expense),'-0.30');
  const large=await account('Large exact positive','savings','999999999.99');await transaction(large,'income','999999999.99');await transaction(large,'income','0.10');equal(await balance(large),'2000000000.08');
  const negative=await account('Large exact negative','other','-999999999.99');await transaction(negative,'expense','999999999.99');await transaction(negative,'expense','0.20');equal(await balance(negative),'-2000000000.18');
  const card=await account('Purchase refund payment','credit_card','100.00'),payer=await account('Payer','bank','200.00');
  await transaction(card,'expense','30.00');equal(await balance(card),'130.00');await transaction(card,'income','10.00');equal(await balance(card),'120.00');
  await transfer(payer,card,'170.00');equal(await balance(card),'-50.00');equal(await balance(payer),'30.00');await transfer(card,payer,'5.00');equal(await balance(card),'-45.00');equal(await balance(payer),'35.00');
  const matrix=[];
  for(const [sourceType,destinationType,sourceExpected,destinationExpected] of [['bank','cash','175.00','125.00'],['bank','credit_card','175.00','75.00'],['credit_card','bank','225.00','125.00'],['credit_card','credit_card','225.00','75.00']]) {
    const source=await account('Matrix source '+matrix.length,sourceType,'200.00'),destination=await account('Matrix destination '+matrix.length,destinationType,'100.00');
    const totals=await admin.query("SELECT COALESCE(sum(amount) FILTER(WHERE type='income'),0)::text income,COALESCE(sum(amount) FILTER(WHERE type='expense'),0)::text expense FROM expense_tracker.transactions WHERE user_id=$1",[owner.userId]);
    const netBefore=await repo.getNetPosition(owner.userId);
    await transfer(source,destination,'25.00');equal(await balance(source),sourceExpected);equal(await balance(destination),destinationExpected);
    equal(await repo.getNetPosition(owner.userId),netBefore);
    equal((await admin.query("SELECT COALESCE(sum(amount) FILTER(WHERE type='income'),0)::text income,COALESCE(sum(amount) FILTER(WHERE type='expense'),0)::text expense FROM expense_tracker.transactions WHERE user_id=$1",[owner.userId])).rows,totals.rows);matrix.push([source,destination]);
  }
  // Multiple transactions and transfers must not multiply when joined.
  const mixed=await account('Mixed aggregate','bank','100.00'),peer=await account('Mixed peer','cash');
  await transaction(mixed,'income','10.00');await transaction(mixed,'income','20.00');const correction=await transaction(mixed,'expense','5.00');
  await transfer(mixed,peer,'7.00');await transfer(mixed,peer,'8.00');await transfer(peer,mixed,'2.00');const removedTransfer=await transfer(peer,mixed,'3.00');equal(await balance(mixed),'115.00');
  await runtime.query('UPDATE expense_tracker.transactions SET amount=6.00 WHERE id=$1',[correction]);equal(await balance(mixed),'114.00');await runtime.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[correction]);equal(await balance(mixed),'120.00');
  await runtime.query('UPDATE expense_tracker.transfers SET amount=4.00 WHERE id=$1',[removedTransfer]);equal(await balance(mixed),'121.00');await runtime.query('DELETE FROM expense_tracker.transfers WHERE id=$1',[removedTransfer]);equal(await balance(mixed),'117.00');
  const recurring=await account('Recurring reservations','bank');
  const definition=(await runtime.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,'c1200000-0000-4000-8000-000000000001','income',999999999.99,'Not posted','monthly','1900-01-01') RETURNING id",[owner.userId,recurring])).rows[0].id;
  for(const [date,status] of [['1900-01-01','pending'],['1900-02-01','failed'],['1900-03-01','skipped']])await runtime.query("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date,status,processed_at) VALUES($1,$2,$3,$4::text,CASE WHEN $4::text='pending' THEN NULL ELSE statement_timestamp() END)",[owner.userId,definition,date,status]);
  equal(await balance(recurring),'0.00');const generated=await transaction(recurring,'income','0.30',owner,{definition,date:'1900-04-01'});
  await runtime.query("UPDATE expense_tracker.recurring_occurrences SET generated_transaction_id=$1 WHERE recurring_transaction_id=$2 AND occurrence_date='1900-04-01'",[generated,definition]);equal(await balance(recurring),'0.30');await runtime.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[generated]);equal(await balance(recurring),'0.00');
  const netAssets=await account('Net bank','bank','100.00',netUser),netNegative=await account('Net negative','cash','-20.00',netUser),netDebt=await account('Net debt','credit_card','40.00',netUser),netCredit=await account('Net credit','credit_card','-10.00',netUser);
  equal(await repo.getNetPosition(netUser.userId),{netPosition:'50.00',currency:'EGP'});
  await transfer(netAssets,netDebt,'50.00',netUser);equal(await balance(netAssets,netUser),'50.00');equal(await balance(netDebt,netUser),'-10.00');equal(await repo.getNetPosition(netUser.userId),{netPosition:'50.00',currency:'EGP'});
  await transaction(netNegative,'income','0.10',netUser);await transaction(netCredit,'expense','0.20',netUser);equal(await repo.getNetPosition(netUser.userId),{netPosition:'49.90',currency:'EGP'});
  equal(await repo.getNetPosition('d1800000-0000-4000-8000-000000000001'),{netPosition:'0.00',currency:'EGP'});
  const netToken=await auth.createTestAuthToken(netUser);
  equal((await auth.request(netToken,'/accounts/summary')).body,{data:{netPosition:'49.90',currency:'EGP'}});
  for(const [path,method,status,code] of [['/accounts/summary','GET',401,'AUTH_REQUIRED'],['/accounts/summary?userId=x','GET',400,'VALIDATION_ERROR'],['/accounts/summary?status=active','GET',400,'VALIDATION_ERROR'],['/accounts/summary','POST',405,'METHOD_NOT_ALLOWED']]) {
    expectApiError(await auth.request(status===401?null:netToken,path,method,method==='POST'?{}:undefined),status,code);checks++;
  }
  const allBefore=await repo.getAccountBalances(owner.userId),netBefore=await repo.getNetPosition(owner.userId);
  const archived=await auth.request(token,'/accounts/'+mixed+'/archive','POST',{});equal(archived.status,200);equal(archived.body.data.currentBalance,'117.00');equal(await balance(mixed),'117.00');equal(await repo.getNetPosition(owner.userId),netBefore);
  equal((await repo.getAccountBalances(owner.userId,'archived')).map(r=>r.id),[mixed]);equal((await repo.getAccountBalances(owner.userId)).length,allBefore.length);
  equal((await auth.request(token,'/accounts?status=archived')).body.data,await repo.getAccountBalances(owner.userId,'archived'));
  equal((await auth.request(token,'/accounts/'+mixed+'/restore','POST',{})).body.data.currentBalance,'117.00');equal(await repo.getNetPosition(owner.userId),netBefore);
  // Archives of debt, credit and negative assets stay in net position too.
  for(const id of [netNegative,netDebt,netCredit])await runtime.query("UPDATE expense_tracker.accounts SET status='archived' WHERE id=$1",[id]);equal(await repo.getNetPosition(netUser.userId),{netPosition:'49.90',currency:'EGP'});
  const foreign=await account('Foreign huge balance','credit_card','999999999.99',other);await transaction(foreign,'expense','999999999.99',other);
  const snapshot=await financialSnapshot(admin);
  equal(await repo.getAccountSummary(owner.userId,mixed),{currentBalance:'117.00',openingBalance:'100.00',totalIncome:'30.00',totalExpenses:'0.00',incomingTransfers:'2.00',outgoingTransfers:'15.00',currency:'EGP'});
  equal((await auth.request(token,'/accounts/'+mixed+'/summary')).body.data,await repo.getAccountSummary(owner.userId,mixed));
  for(const id of [foreign,'00000000-0000-4000-8000-000000000000']) {
    expectApiError(await auth.request(token,'/accounts/'+id+'/summary'),404,'NOT_FOUND');checks++;
    await assert.rejects(repo.getAccountSummary(owner.userId,id),e=>e.status===404&&e.code==='NOT_FOUND');checks++;
  }
  expectApiError(await auth.request(null,'/accounts/'+mixed+'/summary'),401,'AUTH_REQUIRED');checks++;
  expectApiError(await auth.request(token,'/accounts/'+mixed+'/summary?userId='+other.userId),400,'VALIDATION_ERROR');checks++;
  expectApiError(await auth.request(token,'/accounts/'+mixed+'/summary','POST',{}),405,'METHOD_NOT_ALLOWED');checks++;
  equal(await repo.getNetPosition(other.userId),{netPosition:'-1999999999.98',currency:'EGP'});equal(await repo.getNetPosition(owner.userId),netBefore);
  equal((await auth.request(netToken,'/accounts/summary')).body.data,{netPosition:'49.90',currency:'EGP'});
  equal((await auth.request(otherToken,'/accounts/summary')).body.data,{netPosition:'-1999999999.98',currency:'EGP'});
  for(const [user,id] of [[owner,foreign],[other,mixed],[owner,'00000000-0000-4000-8000-000000000000']]) {await assert.rejects(repo.getAccountBalance(user.userId,id),e=>e.status===404&&e.code==='NOT_FOUND');checks++;}
  for(const [user,userToken] of [[owner,token],[other,otherToken]]) {
    const all=await repo.getAccountBalances(user.userId);const expectedIds=(await admin.query('SELECT id FROM expense_tracker.accounts WHERE user_id=$1 ORDER BY created_at,id',[user.userId])).rows.map(r=>r.id);equal(all.map(r=>r.id),expectedIds);
    for(const status of ['active','archived']) {
      const list=await auth.request(userToken,'/accounts?status='+status);equal(list.status,200);equal(list.body.data,await repo.getAccountBalances(user.userId,status));
      for(const row of list.body.data) {
        equal((await auth.request(userToken,'/accounts/'+row.id)).body.data,row);equal(await repo.getAccountBalance(user.userId,row.id),row);
        const detailSummary=await auth.request(userToken,'/accounts/'+row.id+'/summary');equal(detailSummary.status,200);equal(detailSummary.body.data.currentBalance,row.currentBalance);equal(detailSummary.body.data.openingBalance,row.openingBalance);
        equal(Object.keys(row).sort(),['id','name','type','currency','status','openingBalance','currentBalance','openingBalanceEditable','createdAt','updatedAt'].sort());assert.match(row.currentBalance,/^-?\d+\.\d{2}$/);checks++;
      }
    }
  }
  for(const [userToken,id] of [[token,foreign],[otherToken,mixed]])expectApiError(await auth.request(userToken,'/accounts/'+id),404,'NOT_FOUND');checks+=2;
  equal(await financialSnapshot(admin),snapshot);
  // Independent writer vs one-statement READ COMMITTED query snapshots.
  const committed=await account('Committed visibility','bank'),target=await account('Atomic transfer destination','cash');
  await runtime.query('BEGIN');await transaction(committed,'income','10.00');equal(await balance(committed),'0.00');await runtime.query('COMMIT');equal(await balance(committed),'10.00');
  await runtime.query('BEGIN');await transfer(committed,target,'3.00');
  let list=await repo.getAccountBalances(owner.userId);equal([list.find(r=>r.id===committed).currentBalance,list.find(r=>r.id===target).currentBalance],['10.00','0.00']);
  await runtime.query('COMMIT');list=await repo.getAccountBalances(owner.userId);equal([list.find(r=>r.id===committed).currentBalance,list.find(r=>r.id===target).currentBalance],['7.00','3.00']);
  await runtime.query('BEGIN');await transaction(committed,'expense','0.01');await transfer(committed,target,'1.00');await runtime.query('ROLLBACK');equal(await balance(committed),'7.00');equal(await balance(target),'3.00');
  // Capture the actual repository SQL, count driver calls and explain it with a
  // realistic volume inside a transaction that is rolled back after the plan.
  const calls=[];const counted=createAccountBalanceRepository({query:async(sql,params)=>{calls.push({sql,params});return pool.query(sql,params);}});
  equal((await counted.getAccountBalances(owner.userId)).length,(await repo.getAccountBalances(owner.userId)).length);equal(calls.length,1);
  await admin.query('BEGIN');
  let plan;
  try {
    await admin.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) SELECT gen_random_uuid(),$1,$2,'c1200000-0000-4000-8000-000000000001','income',0.01,'Plan fixture','1900-01-01' FROM generate_series(1,5000)",[owner.userId,committed]);
    await admin.query("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) SELECT $1,$2,$3,0.01,'1900-01-01' FROM generate_series(1,2000)",[owner.userId,committed,target]);
    await admin.query('ANALYZE expense_tracker.accounts; ANALYZE expense_tracker.transactions; ANALYZE expense_tracker.transfers');
    await admin.query('SET LOCAL ROLE expense_tracker_app');
    const result=await admin.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+calls[0].sql,calls[0].params);plan=result.rows[0]['QUERY PLAN'][0];
    const nodes=[];function walk(node){nodes.push({type:node['Node Type'],loops:node['Actual Loops'],relationship:node['Parent Relationship']});for(const child of node.Plans??[])walk(child);}walk(plan.Plan);
    assert.ok(!nodes.some(node=>node.relationship==='SubPlan'),'No per-account correlated aggregate subplans');checks++;
    equal(plan.Plan['Actual Rows'],(await repo.getAccountBalances(owner.userId)).length);
    plan={fixtureTransactions:5000,fixtureTransfers:2000,executionMs:plan['Execution Time'],planningMs:plan['Planning Time'],rows:plan.Plan['Actual Rows'],nodes:nodes.map(n=>n.type)};
  } finally {await admin.query('ROLLBACK');}
  equal(await balance(committed),'7.00');
  return {checks,transferMatrix:4,snapshotVisibility:true,netPosition:'49.90',readOnly:true,queryCallsPerList:1,plan,remoteTouched:false};
}

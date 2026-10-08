import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {URL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {createTransferService} from '../../dist/services/transfers.js';
import {createAccountBalanceRepository} from '../../dist/services/account-balances.js';
import {createTestUser,financialSnapshot,expectApiError,createTestAuthHarness} from './v2-isolation.mjs';

export async function verifyV2Transfers({admin,runtime,pool,auth}) {
  const a={userId:'a2600000-0000-4000-8000-000000000001'},b={userId:'b2600000-0000-4000-8000-000000000001'};
  for(const user of [a,b])await createTestUser(admin,user);
  const tokens={a:await auth.createTestAuthToken(a,{metadataOwner:b.userId}),b:await auth.createTestAuthToken(b,{metadataOwner:a.userId})};
  let checks=0,races=0,faults=0;
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const error=(result,status,code)=>{expectApiError(result,status,code);checks++;};
  const repo=createAccountBalanceRepository(pool),request=auth.rawRequest,absent='00000000-0000-4000-8000-000000000000';
  const cents=value=>BigInt(value.replace('.','')),decimal=value=>{const negative=value<0n,absolute=negative?-value:value;return (negative?'-':'')+(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');};
  let netBefore;
  async function account(name,type='bank',openingBalance='200.00',token=tokens.a) {
    const result=await request(token,'/accounts','POST',{name,type,openingBalance,currency:'EGP'});equal(result.status,201);
    if(netBefore&&token===tokens.a)netBefore={...netBefore,netPosition:decimal(cents(netBefore.netPosition)+cents(openingBalance)*(type==='credit_card'?-1n:1n))};
    return result.body.data;
  }
  const accounts=[await account('T26 Bank'),await account('T26 Cash','cash','100.00'),await account('T26 Card 1','credit_card','200.00'),await account('T26 Card 2','credit_card','100.00')];
  const foreign=[await account('T26 B Bank','bank','200.00',tokens.b),await account('T26 B Cash','cash','100.00',tokens.b)];
  const body=(overrides={})=>({sourceAccountId:accounts[0].id,destinationAccountId:accounts[1].id,amount:'25.00',date:'1900-01-01',description:null,...overrides});
  async function create(input=body(),token=tokens.a) {const result=await request(token,'/transfers','POST',input);equal(result.status,201);equal(result.location,'/api/v2/transfers/'+result.body.data.id);equal(result.cache,'no-store');return result.body.data;}
  async function update(id,input=body(),token=tokens.a) {const result=await request(token,'/transfers/'+id,'PUT',input);equal(result.status,200);return result.body.data;}
  async function remove(id,token=tokens.a) {const result=await request(token,'/transfers/'+id,'DELETE');equal(result.status,204);equal(result.body,null);equal(result.cache,'no-store');}
  const totals=async()=>({v1:(await auth.v1Request('/summary')).body,owned:(await runtime.query("SELECT COALESCE(sum(amount) FILTER (WHERE type='income'),0)::text income,COALESCE(sum(amount) FILTER (WHERE type='expense'),0)::text expenses,COALESCE(sum(CASE WHEN type='income' THEN amount ELSE -amount END),0)::text savings FROM expense_tracker.transactions WHERE user_id=$1",[a.userId])).rows[0]});
  const summaryBefore=await totals();netBefore=await repo.getNetPosition(a.userId);
  async function reconcile(source,destination,amount) {
    for(const account of accounts) {
      const direction=account.id===source?-1n:account.id===destination?1n:0n,sign=account.type==='credit_card'?-1n:1n;
      equal((await repo.getAccountBalance(a.userId,account.id)).currentBalance,decimal(cents(account.openingBalance)+direction*sign*cents(amount)));
    }
    equal(await repo.getNetPosition(a.userId),netBefore);equal(await totals(),summaryBefore);
  }
  for(const [source,destination] of [[0,1],[0,2],[2,0],[2,3]]) {
    const input=body({sourceAccountId:accounts[source].id,destinationAccountId:accounts[destination].id});
    const row=await create(input);equal(row.sourceAccountName,accounts[source].name);equal(row.destinationAccountName,accounts[destination].name);
    equal(Object.keys(row).sort(),['id','sourceAccountId','sourceAccountName','destinationAccountId','destinationAccountName','amount','currency','date','description','createdAt','updatedAt'].sort());
    await reconcile(input.sourceAccountId,input.destinationAccountId,'25.00');
    const changed=await update(row.id,{...input,amount:'30.10',description:'  Corrected 😀  '});equal(changed.id,row.id);equal(changed.createdAt,row.createdAt);equal(changed.description,'Corrected 😀');assert.ok(changed.updatedAt>row.updatedAt);checks++;
    await reconcile(input.sourceAccountId,input.destinationAccountId,'30.10');
    await update(row.id,body({sourceAccountId:accounts[3].id,destinationAccountId:accounts[1].id,amount:'0.20'}));
    await reconcile(accounts[3].id,accounts[1].id,'0.20');await remove(row.id);await reconcile(null,null,'0.00');
  }
  for(const amount of ['0.10','0.20','999999999.99']) {const row=await create(body({amount}));equal(row.amount,amount);await reconcile(accounts[0].id,accounts[1].id,amount);await remove(row.id);await reconcile(null,null,'0.00');}
  const ten=await create(body({amount:'0.10'})),twenty=await create(body({amount:'0.20'}));await reconcile(accounts[0].id,accounts[1].id,'0.30');await remove(ten.id);await remove(twenty.id);
  // Overpayment and cash advance use the same transfer row and unchanged T18 formula.
  const overpay=await create(body({destinationAccountId:accounts[2].id,amount:'250.00'}));await reconcile(accounts[0].id,accounts[2].id,'250.00');equal((await repo.getAccountBalance(a.userId,accounts[2].id)).currentBalance,'-50.00');await remove(overpay.id);
  for(const account of accounts)equal((await repo.getAccountBalance(a.userId,account.id)).openingBalanceEditable,false);
  const owned=await create(),otherOwned=await create(body({sourceAccountId:foreign[0].id,destinationAccountId:foreign[1].id}),tokens.b);
  equal((await request(tokens.a,'/transfers/'+owned.id)).body.data,owned);
  const baseline=await financialSnapshot(admin);
  for(const token of [null,'invalid.token'])for(const [path,method,input] of [['/transfers','GET'],['/transfers','POST',body()],['/transfers/'+owned.id,'GET'],['/transfers/'+owned.id,'PUT',body()],['/transfers/'+owned.id,'DELETE']])error(await request(token,path,method,input),401,token?'AUTH_INVALID':'AUTH_REQUIRED');
  for(const [token,own,other,ownAccounts,otherAccounts] of [[tokens.a,owned,otherOwned,accounts,foreign],[tokens.b,otherOwned,owned,foreign,accounts]]) {
    equal((await request(token,'/transfers')).body.data.map(row=>row.id),[own.id]);
    const input=body({sourceAccountId:ownAccounts[0].id,destinationAccountId:ownAccounts[1].id});
    for(const [method,payload] of [['GET',undefined],['PUT',input],['DELETE',undefined]]) {
      const denied=await request(token,'/transfers/'+other.id,method,payload),missing=await request(token,'/transfers/'+absent,method,payload);error(denied,404,'NOT_FOUND');error(missing,404,'NOT_FOUND');equal(denied.body,missing.body);
    }
    for(const field of ['sourceAccountId','destinationAccountId'])for(const [path,method] of [['/transfers','POST'],['/transfers/'+own.id,'PUT']]) {
      const denied=await request(token,path,method,{...input,[field]:otherAccounts[0].id}),missing=await request(token,path,method,{...input,[field]:absent});error(denied,404,'NOT_FOUND');error(missing,404,'NOT_FOUND');equal(denied.body,missing.body);
    }
    for(const field of ['userId','ownerId','sourceUserId','destinationUserId','createdBy','id','currency','createdAt','updatedAt'])for(const [path,method] of [['/transfers','POST'],['/transfers/'+own.id,'PUT']])error(await request(token,path,method,{...input,[field]:b.userId}),400,'VALIDATION_ERROR');
    const denied=await request(token,'/transfers?accountId='+otherAccounts[0].id+'&from=9999-01-01'),missing=await request(token,'/transfers?accountId='+absent+'&from=9999-01-01');error(denied,404,'NOT_FOUND');equal(denied.body,missing.body);
  }
  for(const field of ['sourceAccountId','destinationAccountId','amount','date']) {const input=body();delete input[field];error(await request(tokens.a,'/transfers/'+owned.id,'PUT',input),400,'VALIDATION_ERROR');}
  for(const overrides of [{destinationAccountId:accounts[0].id},...['0','-1','1.001','1e2','1000000000',1].map(amount=>({amount})),...['1899-01-01','2026-02-29','9999-01-01'].map(date=>({date})),{description:'😀'.repeat(201)}])for(const [path,method] of [['/transfers','POST'],['/transfers/'+owned.id,'PUT']])error(await request(tokens.a,path,method,body(overrides)),400,'VALIDATION_ERROR');
  equal(await financialSnapshot(admin),baseline);
  await update(otherOwned.id,body({sourceAccountId:foreign[1].id,destinationAccountId:foreign[0].id,amount:'0.20'}),tokens.b);await remove(otherOwned.id,tokens.b);await remove(owned.id);
  for(const description of [undefined,null,'','  ','😀'.repeat(200)]) {const input=body({description});const row=await create(input);equal(row.description,description?.trim()||null);await remove(row.id);}
  const historical=await create();for(const account of accounts.slice(0,2))equal((await request(tokens.a,'/accounts/'+account.id+'/archive','POST',{})).status,200);
  equal((await request(tokens.a,'/transfers/'+historical.id)).status,200);equal((await request(tokens.a,'/transfers?accountId='+accounts[0].id)).body.data.map(row=>row.id),[historical.id]);
  for(const overrides of [{},{sourceAccountId:accounts[2].id},{destinationAccountId:accounts[3].id}])for(const [path,method] of [['/transfers','POST'],['/transfers/'+historical.id,'PUT']])error(await request(tokens.a,path,method,body(overrides)),409,'ACCOUNT_ARCHIVED');
  // Foreign endpoint remains a generic 404 even if the other endpoint is archived.
  error(await request(tokens.a,'/transfers','POST',body({destinationAccountId:foreign[0].id})),404,'NOT_FOUND');
  await update(historical.id,body({sourceAccountId:accounts[2].id,destinationAccountId:accounts[3].id}));await remove(historical.id);
  for(const account of accounts.slice(0,2))await request(tokens.a,'/accounts/'+account.id+'/restore','POST',{});
  const deleteArchived=await create();await request(tokens.a,'/accounts/'+accounts[0].id+'/archive','POST',{});await remove(deleteArchived.id);await request(tokens.a,'/accounts/'+accounts[0].id+'/restore','POST',{});
  await reconcile(null,null,'0.00');

  // Real keyset traversal with timestamp ties and PostgreSQL microsecond boundaries.
  const pageIds=Array.from({length:57},()=>randomUUID());
  await runtime.query("INSERT INTO expense_tracker.transfers(id,user_id,source_account_id,destination_account_id,amount,date,created_at) SELECT id,$2,$3,$4,0.01,CASE WHEN n%2=0 THEN DATE '1900-01-02' ELSE DATE '1900-01-01' END,TIMESTAMPTZ '2026-10-08 00:00:00.123456+00'+(n/20)*INTERVAL '1 microsecond' FROM unnest($1::uuid[]) WITH ORDINALITY x(id,n)",[pageIds,a.userId,accounts[0].id,accounts[1].id]);
  const first=await request(tokens.a,'/transfers');equal(first.status,200);equal(first.body.data.length,25);equal(first.body.meta.limit,25);equal(first.body.meta.hasMore,true);assert.ok(first.body.meta.nextCursor);checks++;
  for(const query of ['', '?limit=1','?limit=25','?limit=100','?accountId='+accounts[0].id+'&from=1900-01-01&to=1900-01-01','?accountId='+accounts[1].id+'&from=1900-01-02','?to=1900-01-01','?from=9999-01-01']) {
    const url=new URL('/transfers'+query,'http://localhost'),rows=[];let next;
    do {if(next)url.searchParams.set('cursor',next);const result=await request(tokens.a,url.pathname+url.search);equal(result.status,200);equal(Object.keys(result.body.meta).sort(),['hasMore','limit','nextCursor']);assert.ok(result.body.data.length<=result.body.meta.limit);checks++;rows.push(...result.body.data);next=result.body.meta.nextCursor;equal(result.body.meta.hasMore,next!==null);}while(next);
    const filters=url.searchParams,params=[a.userId],bind=value=>{params.push(value);return '$'+params.length;};let predicates='';
    if(filters.has('accountId')){const id=bind(filters.get('accountId'));predicates+=' AND (source_account_id='+id+' OR destination_account_id='+id+')';}
    if(filters.has('from'))predicates+=' AND date>='+bind(filters.get('from'))+'::date';if(filters.has('to'))predicates+=' AND date<='+bind(filters.get('to'))+'::date';
    equal(rows.map(row=>row.id),(await admin.query('SELECT id FROM expense_tracker.transfers WHERE user_id=$1'+predicates+' ORDER BY date DESC,created_at DESC,id DESC',params)).rows.map(row=>row.id));equal(new Set(rows.map(row=>row.id)).size,rows.length);
  }
  const cursor=first.body.meta.nextCursor;
  for(const query of ['limit=1','accountId='+accounts[0].id,'from=1900-01-01','to=1900-01-02'])error(await request(tokens.a,'/transfers?'+query+'&cursor='+cursor),400,'VALIDATION_ERROR');
  error(await request(tokens.b,'/transfers?cursor='+cursor),400,'VALIDATION_ERROR');error(await request(tokens.a,'/transactions?cursor='+cursor),400,'VALIDATION_ERROR');
  const txCursor=(await request(await auth.createTestAuthToken({userId:'a2400000-0000-4000-8000-000000000001'}),'/transactions?limit=1')).body.meta?.nextCursor;
  if(txCursor)error(await request(tokens.a,'/transfers?cursor='+txCursor),400,'VALIDATION_ERROR');
  error(await request(tokens.a,'/transfers?cursor='+cursor+'x'),400,'VALIDATION_ERROR');
  for(const query of ['q=note','type=expense','limit=0','limit=101','accountId[]=x','from=1900-02-30','from=1900-01-02&to=1900-01-01','to=','accountId='+accounts[0].id+'&accountId='+accounts[0].id])error(await request(tokens.a,'/transfers?'+query),400,'VALIDATION_ERROR');
  // Deleted anchor still permits continuation; insertion ahead does not shift traversed pages.
  const anchor=first.body.data.at(-1);await remove(anchor.id);const inserted=await create(body({date:'1900-01-03'}));
  const continued=await request(tokens.a,'/transfers?cursor='+cursor);equal(continued.status,200);assert.ok(!continued.body.data.some(row=>row.id===inserted.id||first.body.data.some(old=>old.id===row.id)));checks++;
  await runtime.query('DELETE FROM expense_tracker.transfers WHERE user_id=$1',[a.userId]);await reconcile(null,null,'0.00');

  // Fault wrappers run production SQL on the real runtime client, never alter constraints.
  function wrapped(intercept) {return {query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,params)=>{const result=await client.query(sql,params);await intercept(sql,params,result);return result;},release:error=>client.release(error)};}};}
  const correction=await create();
  for(const [operation,fragment] of [['create','ORDER BY id FOR UPDATE'],['create','INSERT INTO expense_tracker.transfers'],['update','FROM expense_tracker.transfers WHERE id='],['update','ORDER BY id FOR UPDATE'],['update','UPDATE expense_tracker.transfers'],['delete','FROM expense_tracker.transfers WHERE id='],['delete','ORDER BY id FOR UPDATE'],['delete','DELETE FROM expense_tracker.transfers']]) {
    const unused=await account('T26 fault '+faults),before=await financialSnapshot(admin),net=await repo.getNetPosition(a.userId),failure=new Error('private post-query fault');
    const service=createTransferService(wrapped(async sql=>{if(sql.includes(fragment))throw failure;}));
    await assert.rejects(operation==='create'?service.createTransfer(a.userId,body({sourceAccountId:unused.id})):operation==='update'?service.updateTransfer(a.userId,correction.id,body({sourceAccountId:unused.id})):service.deleteTransfer(a.userId,correction.id),e=>e===failure);checks++;equal(await financialSnapshot(admin),before);equal(await repo.getNetPosition(a.userId),net);faults++;
  }
  for(const operation of ['INSERT','UPDATE','DELETE']) {
    const before=await financialSnapshot(admin),faultyAuth=await createTestAuthHarness(wrapped(async sql=>{if(sql.startsWith(operation+' ')&&sql.includes('expense_tracker.transfers'))throw Object.assign(new Error('private SQL rollback failure'),{code:'23503'});}));
    try {const token=await faultyAuth.createTestAuthToken(a),result=await faultyAuth.rawRequest(token,operation==='INSERT'?'/transfers':'/transfers/'+correction.id,operation==='INSERT'?'POST':operation==='UPDATE'?'PUT':'DELETE',operation==='DELETE'?undefined:body());error(result,500,'INTERNAL_ERROR');assert.doesNotMatch(JSON.stringify(result.body),/private|SQL|23503/);checks++;equal(await financialSnapshot(admin),before);faults++;}finally{await faultyAuth.close();}
  }
  await remove(correction.id);

  async function waitBlocked(fragment) {for(let i=0;i<160;i++){if((await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE $1",['%'+fragment+'%'])).rows[0].n>0)return;await pause(25);}throw Error('Expected transfer lock contention: '+fragment);}
  function gated(fragment) {
    let enter,unlock;const ready=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>unlock=resolve);let used=false;
    const service=createTransferService(wrapped(async sql=>{if(!used&&sql.includes(fragment)){used=true;enter();await gate;}}));
    return {service,ready,unlock};
  }
  for(const field of ['sourceAccountId','destinationAccountId']) {
    const racing=await account('T26 archive wins '+field),blocker=await pool.connect();let pending;
    try {await blocker.query('BEGIN');await blocker.query("UPDATE expense_tracker.accounts SET status='archived' WHERE id=$1",[racing.id]);pending=request(tokens.a,'/transfers','POST',body({[field]:racing.id}));await waitBlocked('SELECT id,status FROM expense_tracker.accounts');await blocker.query('COMMIT');error(await pending,409,'ACCOUNT_ARCHIVED');equal((await repo.getAccountBalance(a.userId,racing.id)).openingBalanceEditable,true);races++;}finally{await blocker.query('ROLLBACK');blocker.release();}
    const posting=await account('T26 posting wins '+field),gate=gated('INSERT INTO expense_tracker.transfers');let posted,archiving;
    try {posted=gate.service.createTransfer(a.userId,body({[field]:posting.id}));await gate.ready;archiving=request(tokens.a,'/accounts/'+posting.id+'/archive','POST',{});await waitBlocked('SELECT opening_balance');}finally{gate.unlock();}
    const row=await posted;equal((await archiving).status,200);equal((await request(tokens.a,'/transfers/'+row.id)).status,200);await remove(row.id);races++;
    // Archive also wins before a PUT to a new source/destination.
    const edit=await create(),newAccount=await account('T26 edit archive '+field),locker=await pool.connect();
    try {await locker.query('BEGIN');await locker.query("UPDATE expense_tracker.accounts SET status='archived' WHERE id=$1",[newAccount.id]);const changing=request(tokens.a,'/transfers/'+edit.id,'PUT',body({[field]:newAccount.id}));await waitBlocked('SELECT id,status FROM expense_tracker.accounts');await locker.query('COMMIT');error(await changing,409,'ACCOUNT_ARCHIVED');equal((await request(tokens.a,'/transfers/'+edit.id)).body.data,edit);races++;}finally{await locker.query('ROLLBACK');locker.release();}await remove(edit.id);
  }
  for(const first of ['update','delete']) {
    const row=await create(),gate=gated(first==='update'?'UPDATE expense_tracker.transfers':'DELETE FROM expense_tracker.transfers');let working,waiting;
    try {working=first==='update'?gate.service.updateTransfer(a.userId,row.id,body({amount:'0.20'})):gate.service.deleteTransfer(a.userId,row.id);await gate.ready;waiting=request(tokens.a,'/transfers/'+row.id,first==='update'?'DELETE':'PUT',first==='update'?undefined:body({amount:'0.10'}));await waitBlocked('FROM expense_tracker.transfers WHERE id=');}finally{gate.unlock();}
    await working;const result=await waiting;if(first==='update')equal(result.status,204);else error(result,404,'NOT_FOUND');error(await request(tokens.a,'/transfers/'+row.id),404,'NOT_FOUND');races++;
  }
  const row=await create(),gate=gated('UPDATE expense_tracker.transfers');let edit,second;
  try {edit=gate.service.updateTransfer(a.userId,row.id,body({sourceAccountId:accounts[2].id,amount:'0.10'}));await gate.ready;second=request(tokens.a,'/transfers/'+row.id,'PUT',body({sourceAccountId:accounts[3].id,destinationAccountId:accounts[2].id,amount:'0.20'}));await waitBlocked('FROM expense_tracker.transfers WHERE id=');}finally{gate.unlock();}
  await edit;equal((await second).status,200);await reconcile(accounts[3].id,accounts[2].id,'0.20');await remove(row.id);races++;
  // Opposite directions on different transfers share the same ordered account locks.
  const ordered=gated('ORDER BY id FOR UPDATE');let firstCreate,secondCreate;
  try {firstCreate=ordered.service.createTransfer(a.userId,body({amount:'0.10'}));await ordered.ready;secondCreate=request(tokens.a,'/transfers','POST',body({sourceAccountId:accounts[1].id,destinationAccountId:accounts[0].id,amount:'0.10'}));await waitBlocked('SELECT id,status FROM expense_tracker.accounts');}finally{ordered.unlock();}
  const firstRow=await firstCreate,secondRow=await secondCreate;equal(secondRow.status,201);await reconcile(null,null,'0.00');await remove(firstRow.id);await remove(secondRow.body.data.id);races++;
  // First transfer blocks an opening edit and permanently locks both accounts after deletion.
  const fresh=await account('T26 first opening lock','bank','100.00'),openingGate=gated('INSERT INTO expense_tracker.transfers');let posting,opening;
  try {posting=openingGate.service.createTransfer(a.userId,body({sourceAccountId:fresh.id}));await openingGate.ready;opening=request(tokens.a,'/accounts/'+fresh.id,'PUT',{name:fresh.name,type:fresh.type,openingBalance:'101.00'});await waitBlocked('SELECT opening_balance');}finally{openingGate.unlock();}
  const firstActivity=await posting;error(await opening,409,'ACCOUNT_CONFLICT');await remove(firstActivity.id);equal((await repo.getAccountBalance(a.userId,fresh.id)).openingBalanceEditable,false);races++;
  const beforePrivilege=await financialSnapshot(admin);
  for(const sql of ['CREATE TABLE expense_tracker.t26_denied(id int)','TRUNCATE expense_tracker.transfers','CREATE ROLE t26_denied','SET ROLE postgres'])await assert.rejects(runtime.query(sql),e=>e.code==='42501');
  equal(await financialSnapshot(admin),beforePrivilege);equal(await totals(),summaryBefore);
  return {checks,races,rollbackFaults:faults,fourAccountTypeCombinations:true,incomeExpenseUnchanged:true,realTransferApiIsolation:true,cursorPagination:true};
}

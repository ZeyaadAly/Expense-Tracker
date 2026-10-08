import assert from 'node:assert/strict';
import {Client} from 'pg';
import {createGeneratedFixture} from './generated-fixture.mjs';
import {setTimeout} from 'node:timers';
import {isolationUsers,expectApiError,expectForeignResourceHidden,financialSnapshot} from './v2-isolation.mjs';

// Runs after T16's unchanged-state reconciliation; all writes are disposable.
export async function verifyAccountApi({admin,runtime,auth,tokens}) {
  const {a,b}=isolationUsers;
  let checks=0;
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const error=(result,status,code)=>{expectApiError(result,status,code);checks++;};
  const payload=(name,type='bank',openingBalance='0.00')=>({name,type,openingBalance,currency:'EGP'});
  const create=async(token,input)=>{const result=await auth.request(token,'/accounts','POST',input);equal(result.status,201);equal(result.location,'/api/v2/accounts/'+result.body.data.id);equal(result.cache,'no-store');return result.body.data;};
  const put=account=>({name:account.name,type:account.type,openingBalance:account.openingBalance});
  const get=async(id,token=tokens.a)=>(await auth.request(token,'/accounts/'+id)).body.data;
  const base='/accounts/',absent='00000000-0000-4000-8000-000000000000';
  for(const [path,method,body] of [['/accounts','GET'],['/accounts','POST',payload('Auth')],[base+a.account,'GET'],[base+a.account,'PUT',payload('Auth')],[base+a.account+'/archive','POST',{}],[base+a.account+'/restore','POST',{}]]) {
    error(await auth.request(null,path,method,body),401,'AUTH_REQUIRED');error(await auth.request('malformed.token',path,method,body),401,'AUTH_INVALID');
  }
  for(const [user,other,token] of [[a,b,tokens.a],[b,a,tokens.b]]) {
    const otherBefore=(await admin.query('SELECT to_jsonb(a)::text row FROM expense_tracker.accounts a WHERE user_id=$1 ORDER BY id',[other.userId])).rows;
    const own=await get(user.account,token);equal(own.currentBalance,user===a?'6.50':'12.50');equal(own.openingBalanceEditable,false);
    for(const [method,suffix,body] of [['GET','',undefined],['PUT','',put(own)],['POST','/archive',{}],['POST','/restore',{}]]) {
      await expectForeignResourceHidden(auth.request,{token,method,body,ownPath:base+user.account+suffix,foreignPath:base+other.account+suffix,missingPath:base+absent+suffix});checks++;
    }
    // Restore own account after the successful owned archive probe.
    equal((await auth.request(token,base+user.account+'/restore','POST',{})).status,200);
    equal((await admin.query('SELECT to_jsonb(a)::text row FROM expense_tracker.accounts a WHERE user_id=$1 ORDER BY id',[other.userId])).rows,otherBefore);
    for(const status of ['active','archived']) {
      const result=await auth.request(token,'/accounts?status='+status);equal(result.status,200);
      const expected=(await admin.query('SELECT id FROM expense_tracker.accounts WHERE user_id=$1 AND status=$2 ORDER BY created_at,id',[user.userId,status])).rows.map(r=>r.id);
      equal(result.body.data.map(r=>r.id),expected);equal(result.body.meta.count,expected.length);
      assert.ok(result.body.data.every(r=>!Object.hasOwn(r,'userId')&&!Object.hasOwn(r,'user_id')));checks++;
    }
    const before=await financialSnapshot(admin);
    for(const field of ['userId','ownerId','createdBy','id','status','currentBalance','createdAt','updatedAt']) {
      error(await auth.request(token,'/accounts','POST',{...payload('Injected'),[field]:other.userId}),400,'VALIDATION_ERROR');
      error(await auth.request(token,base+user.account,'PUT',{...put(own),[field]:other.userId}),400,'VALIDATION_ERROR');
    }
    equal(await financialSnapshot(admin),before);
  }
  for(const query of ['status=','status=all','status=active&status=archived','status[]=active','userId='+b.userId,'limit=1'])error(await auth.request(tokens.a,'/accounts?'+query),400,'VALIDATION_ERROR');
  error(await auth.request(tokens.a,base+'not-a-uuid'),400,'VALIDATION_ERROR');
  const hardDelete=await auth.request(tokens.a,base+a.account,'DELETE');error(hardDelete,405,'METHOD_NOT_ALLOWED');equal(hardDelete.allow,'GET, PUT');
  for(const input of [null,[],{}, {...payload('Bad'),currency:'USD'}, {...payload('Bad'),type:'BANK'}, {...payload('Bad'),name:'  '}, {...payload('Bad'),name:'x'.repeat(101)}, {...payload('Bad'),name:'\u0000'}, {...payload('Bad'),name:'\u200b'}, {...payload('Bad'),name:'\ud800'}])error(await auth.request(tokens.a,'/accounts','POST',input),400,'VALIDATION_ERROR');
  for(const money of ['-0','-0.00','01','+1','1e2','1.230',' 1','1000000000','-1000000000','1.',1,null])error(await auth.request(tokens.a,'/accounts','POST',payload('Bad money','cash',money)),400,'VALIDATION_ERROR');
  const accounts=[];
  for(const [i,money] of ['-999999999.99','999999999.99','0','0.1','-0.01'].entries()) {
    const account=await create(tokens.a,payload('Boundary '+i,'cash',money));equal(account.openingBalance,money==='0'?'0.00':money==='0.1'?'0.10':money);equal(account.currentBalance,account.openingBalance);accounts.push(account);
  }
  for(const type of ['cash','bank','savings','credit_card','mobile_wallet','other'])equal((await create(tokens.a,payload('Type '+type,type))).type,type);
  const unicode=await create(tokens.a,payload('  '+ '😀'.repeat(100)+'  '));equal(Array.from(unicode.name).length,100);
  const shared=await create(tokens.a,payload('Shared name'));await create(tokens.b,payload('SHARED NAME'));
  error(await auth.request(tokens.a,'/accounts','POST',payload('shared NAME')),409,'ACCOUNT_CONFLICT');
  error(await auth.request(tokens.a,base+accounts[0].id,'PUT',{...put(accounts[0]),name:'Shared NAME'}),409,'ACCOUNT_CONFLICT');
  equal(await get(accounts[0].id),accounts[0]);
  equal((await auth.request(tokens.a,base+shared.id,'PUT',put(shared))).body.data,shared);
  const changed=(await auth.request(tokens.a,base+shared.id,'PUT',{name:'Changed',type:'credit_card',openingBalance:'5000'})).body.data;
  equal(changed.openingBalance,'5000.00');equal(changed.createdAt,shared.createdAt);assert.ok(changed.updatedAt>shared.updatedAt);checks++;
  error(await auth.request(tokens.a,base+shared.id,'PUT',{name:'Missing fields'}),400,'VALIDATION_ERROR');
  error(await auth.request(tokens.a,base+shared.id+'/archive','POST',{userId:b.userId}),400,'VALIDATION_ERROR');
  for(const money of ['5000.00','-250.00','0.00']) {
    const card=await create(tokens.a,payload('Card '+money,'credit_card',money));equal(card.currentBalance,money);
  }
  async function post(client,id,type,amount='1.00') {
    return client.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,'T17 activity','1900-01-01') RETURNING id",[a.userId,id,type==='income'?a.incomeCategory:a.expenseCategory,type,amount]);
  }
  const card=await create(tokens.a,payload('Activity card','credit_card','5000.00'));
  await post(runtime,card.id,'expense','20.00');await post(runtime,card.id,'income','5.00');
  await runtime.query("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,100.00,'1900-01-01')",[a.userId,a.account,card.id]);
  equal((await get(card.id)).currentBalance,'4915.00');
  await runtime.query("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,10.00,'1900-01-01')",[a.userId,card.id,a.account]);equal((await get(card.id)).currentBalance,'4925.00');
  for(const changes of [{openingBalance:'5001.00'},{type:'bank'}])error(await auth.request(tokens.a,base+card.id,'PUT',{...put(card),...changes}),409,'ACCOUNT_CONFLICT');
  equal((await auth.request(tokens.a,base+a.account,'PUT',{name:'A asset renamed',type:'savings',openingBalance:'0.00'})).status,200);
  const deleted=await create(tokens.a,payload('Deleted activity'));const posted=await post(runtime,deleted.id,'income');await runtime.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[posted.rows[0].id]);
  equal((await get(deleted.id)).openingBalanceEditable,false);error(await auth.request(tokens.a,base+deleted.id,'PUT',{...put(deleted),openingBalance:'1.00'}),409,'ACCOUNT_CONFLICT');
  const scheduleAccount=await create(tokens.a,payload('Schedule account'));
  const definition=(await runtime.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence) VALUES($1,$2,$3,'expense',1.00,'T17 schedule','monthly','1900-01-01','1900-02-01') RETURNING id",[a.userId,scheduleAccount.id,a.expenseCategory])).rows[0].id;
  for(const [date,status] of [['1900-02-01','pending'],['1900-03-01','failed'],['1900-05-01','skipped']])await runtime.query("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date,status,processed_at,failure_code) VALUES($1,$2,$3,$4::text,CASE WHEN $4::text='pending' THEN NULL ELSE statement_timestamp() END,CASE WHEN $4::text='failed' THEN 'TEST_FAILURE' ELSE NULL END)",[a.userId,definition,date,status]);
  const historical=await createGeneratedFixture(runtime,{userId:a.userId,accountId:scheduleAccount.id,categoryId:a.expenseCategory,type:'expense',amount:'1.00',description:'T17 historical deleted',date:'1900-04-01',definitionId:definition,occurrenceDate:'1900-04-01'});
  await runtime.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[historical.id]);
  const archive=await auth.request(tokens.a,base+scheduleAccount.id+'/archive','POST',{});equal(archive.status,200);equal(archive.body.meta.pausedRecurringCount,1);equal(archive.body.data.status,'archived');assert.ok(archive.body.data.updatedAt>scheduleAccount.updatedAt);checks++;
  equal((await runtime.query('SELECT status,next_occurrence FROM expense_tracker.recurring_transactions WHERE id=$1',[definition])).rows,[{status:'paused',next_occurrence:null}]);
  equal((await runtime.query('SELECT status,failure_code FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1 ORDER BY occurrence_date',[definition])).rows,[{status:'skipped',failure_code:null},{status:'skipped',failure_code:null},{status:'posted',failure_code:null},{status:'skipped',failure_code:null}]);
  equal((await auth.request(tokens.a,base+scheduleAccount.id+'/archive','POST',{})).body,{data:archive.body.data,meta:{pausedRecurringCount:0}});
  await assert.rejects(post(runtime,scheduleAccount.id,'expense'),e=>e.code==='23514');checks++;
  const restored=await auth.request(tokens.a,base+scheduleAccount.id+'/restore','POST',{});equal(restored.body.data.status,'active');assert.ok(restored.body.data.updatedAt>archive.body.data.updatedAt);checks++;
  equal((await runtime.query('SELECT status FROM expense_tracker.recurring_transactions WHERE id=$1',[definition])).rows[0].status,'paused');equal((await auth.request(tokens.a,base+scheduleAccount.id+'/restore','POST',{})).body,restored.body);
  // Force failure after the archive trigger has changed a definition. Whole transaction rolls back.
  await runtime.query("UPDATE expense_tracker.recurring_transactions SET status='active',next_occurrence='1900-06-01' WHERE id=$1",[definition]);
  await admin.query("CREATE FUNCTION expense_tracker.t17_fail_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='paused' THEN RAISE EXCEPTION 'private test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER t17_fail_pause BEFORE UPDATE ON expense_tracker.recurring_transactions FOR EACH ROW EXECUTE FUNCTION expense_tracker.t17_fail_pause()");
  const beforeFailure=await financialSnapshot(admin);
  try {error(await auth.request(tokens.a,base+scheduleAccount.id+'/archive','POST',{}),500,'INTERNAL_ERROR');equal(await financialSnapshot(admin),beforeFailure);} finally {await admin.query('DROP TRIGGER t17_fail_pause ON expense_tracker.recurring_transactions; DROP FUNCTION expense_tracker.t17_fail_pause()');}
  // Also fail reservation skipping after account and recurring updates succeeded.
  await runtime.query("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date) VALUES($1,$2,'1900-06-01')",[a.userId,definition]);
  await admin.query("ALTER TABLE expense_tracker.recurring_occurrences ADD CONSTRAINT t17_skip_fault CHECK (occurrence_date <> '1900-06-01' OR status <> 'skipped')");
  const beforeSkipFailure=await financialSnapshot(admin);
  try {error(await auth.request(tokens.a,base+scheduleAccount.id+'/archive','POST',{}),500,'INTERNAL_ERROR');equal(await financialSnapshot(admin),beforeSkipFailure);} finally {await admin.query('ALTER TABLE expense_tracker.recurring_occurrences DROP CONSTRAINT t17_skip_fault');}

  // Real lock races: wait for PostgreSQL to report the competing session blocked.
  async function waitBlocked(client) {
    const pid=(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    return async()=>{for(let i=0;i<200;i++){if((await admin.query("SELECT wait_event_type='Lock' blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.blocked)return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Expected lock wait did not occur');};
  }
  const connection={host:'127.0.0.1',port:55451,database:'postgres',user:'expense_tracker_app'};
  const racer=new Client(connection);await racer.connect();
  try {
    const first=await create(tokens.a,payload('Posting wins'));
    await runtime.query('BEGIN');await post(runtime,first.id,'income');
    // Other pool sessions may be selected, so observe any account lock waiter instead.
    const editPromise=auth.request(tokens.a,base+first.id,'PUT',{...put(first),openingBalance:'9.00'});
    for(let i=0;i<200;i++){if((await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE usename='expense_tracker_app' AND wait_event_type='Lock'")).rows[0].n)break;await new Promise(resolve=>setTimeout(resolve,10));if(i===199)throw new Error('Edit did not wait for posting');}
    await runtime.query('COMMIT');error(await editPromise,409,'ACCOUNT_CONFLICT');equal((await get(first.id)).openingBalance,'0.00');
    const second=await create(tokens.a,payload('Edit wins'));
    await runtime.query('BEGIN');await runtime.query('SELECT id FROM expense_tracker.accounts WHERE id=$1 FOR UPDATE',[second.id]);await runtime.query('UPDATE expense_tracker.accounts SET opening_balance=7.00 WHERE id=$1',[second.id]);
    const blocked=await waitBlocked(racer),posting=post(racer,second.id,'income');await blocked();await runtime.query('COMMIT');await posting;equal((await get(second.id)).openingBalance,'7.00');equal((await get(second.id)).openingBalanceEditable,false);
    const third=await create(tokens.a,payload('Archive wins'));
    await runtime.query('BEGIN');await runtime.query("UPDATE expense_tracker.accounts SET status='archived' WHERE id=$1",[third.id]);
    const recurringPromise=racer.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,$3,'expense',1.00,'Race','monthly','1900-01-01')",[a.userId,third.id,a.expenseCategory]);
    // Attach rejection before releasing the blocker.
    const rejected=assert.rejects(recurringPromise,e=>e.code==='23514');await blocked();await runtime.query('COMMIT');await rejected;checks++;
    // Recurring wins first: archive waits, then pauses the committed definition.
    const fourth=await create(tokens.a,payload('Recurring wins'));
    await runtime.query('BEGIN');await runtime.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,$3,'expense',1.00,'Race first','monthly','1900-01-01')",[a.userId,fourth.id,a.expenseCategory]);
    const archivePromise=auth.request(tokens.a,base+fourth.id+'/archive','POST',{});
    for(let i=0;i<200;i++){if((await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE usename='expense_tracker_app' AND wait_event_type='Lock'")).rows[0].n)break;await new Promise(resolve=>setTimeout(resolve,10));if(i===199)throw new Error('Archive did not wait');}
    await runtime.query('COMMIT');equal((await archivePromise).body.meta.pausedRecurringCount,1);
    equal((await admin.query("SELECT count(*)::int n FROM expense_tracker.recurring_transactions r JOIN expense_tracker.accounts a ON a.id=r.account_id WHERE r.status='active' AND a.status='archived'")).rows[0].n,0);
  } finally {await runtime.query('ROLLBACK');await racer.end();}
  for(const account of (await auth.request(tokens.a,'/accounts')).body.data) {assert.match(account.createdAt,/Z$/);assert.match(account.updatedAt,/Z$/);assert.equal(typeof account.currentBalance,'string');checks++;}
  return {checks,realAccountApi:true,concurrencyRaces:4,rollbackFaults:2,remoteTouched:false};
}

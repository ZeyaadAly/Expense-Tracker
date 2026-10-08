// T27 adds only evidence absent from T26; all application code and SQL remain unchanged.
import assert from 'node:assert/strict';
import {setTimeout,clearTimeout} from 'node:timers';
import {setTimeout as pause} from 'node:timers/promises';
import {createAccountBalanceRepository} from '../../dist/services/account-balances.js';
import {createTestUser,createTestAuthHarness,expectApiError} from './v2-isolation.mjs';

const cents=value=>BigInt(value.replace('.',''));
const decimal=value=>{const negative=value<0n,absolute=negative?-value:value;return (negative?'-':'')+(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');};
async function bounded(promise,label) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('T27 timeout: '+label)),12000);})]);}
  finally{clearTimeout(timer);}
}

export async function verifyTransferConcurrency({admin,runtime,pool,auth}) {
  const users={a:{userId:'a2700000-0000-4000-8000-000000000001'},b:{userId:'b2700000-0000-4000-8000-000000000001'}};
  let checks=0,forcedRaces=0,rollbackFaults=0;const matrix=[],traces=[],controls={before:null,after:null};
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const error=(result,status,code)=>{expectApiError(result,status,code);checks++;};
  // Observe, rather than change, isolation inside each actual mutation transaction.
  // Hooks are test-only and execute the original SQL on a limited-role checked-out client.
  const watched={query:pool.query.bind(pool),connect:async()=>{
    const client=await pool.connect(),hooks={...controls},trace={sql:[],locks:[],isolation:null,role:null,finished:false};traces.push(trace);
    return {query:async(sql,params)=>{
      trace.sql.push(sql);
      if(hooks.before)await hooks.before(sql,params,trace);
      const result=await client.query(sql,params);
      if(sql==='BEGIN') {
        const info=(await client.query('SELECT current_user AS role,current_setting(\'transaction_isolation\') AS isolation,pg_backend_pid() AS pid')).rows[0];
        Object.assign(trace,info);equal(trace.role,'expense_tracker_app');equal(trace.isolation,'read committed');
      }
      if(sql.includes('SELECT id,status FROM expense_tracker.accounts')) {
        equal(params[1],[...new Set(params[1])].sort());
        equal(result.rows.map(row=>row.id),result.rows.map(row=>row.id).sort());trace.locks.push([...params[1]]);
      }
      if(sql==='COMMIT'||sql==='ROLLBACK')trace.finished=true;
      if(hooks.after)await hooks.after(sql,params,trace);
      return result;
    },release:e=>client.release(e)};
  }};
  let observed;
  const fixtures={},ledger={a:new Map(),b:new Map()},tokens={},observedTokens={};
  try {
    observed=await createTestAuthHarness(watched);
    for(const owner of ['a','b']) {
      await createTestUser(admin,users[owner]);tokens[owner]=await auth.createTestAuthToken(users[owner]);observedTokens[owner]=await observed.createTestAuthToken(users[owner]);fixtures[owner]=[];
      for(const [i,type,openingBalance] of [[0,'bank','200.00'],[1,'cash','100.00'],[2,'credit_card','200.00'],[3,'credit_card','100.00']]) {
        const result=await auth.rawRequest(tokens[owner],'/accounts','POST',{name:'T27 '+owner+' '+i,type,openingBalance,currency:'EGP'});equal(result.status,201);fixtures[owner].push({...result.body.data,income:'1.10',expenses:'0.20'});
        for(const [kind,amount,categoryId] of [['income','1.10','c1200000-0000-4000-8000-000000000001'],['expense','0.20','c1200000-0000-4000-8000-000000000004']]) {
          const transaction=await auth.rawRequest(tokens[owner],'/transactions','POST',{accountId:result.body.data.id,categoryId,type:kind,amount,description:'T27 fixed actuals',date:'1900-01-01'});equal(transaction.status,201);
        }
      }
    }
    const base=(owner='a',source=0,destination=1,amount='0.10')=>({sourceAccountId:fixtures[owner][source].id,destinationAccountId:fixtures[owner][destination].id,amount,date:'1900-01-01',description:'T27'});
    const request=(owner,path,method='GET',body)=>bounded(observed.rawRequest(observedTokens[owner],path,method,body),method+' '+path);
    async function create(input=base(),owner='a') {const result=await request(owner,'/transfers','POST',input);equal(result.status,201);ledger[owner].set(result.body.data.id,{...input,id:result.body.data.id});return result.body.data;}
    async function remove(id,owner='a') {const result=await request(owner,'/transfers/'+id,'DELETE');equal(result.status,204);equal(result.body,null);ledger[owner].delete(id);}
    // Independent expected ledger + fixed actuals, checked through T18 in one read snapshot.
    async function reconcile(owner='a') {
      const client=await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const repo=createAccountBalanceRepository(client);let net=0n;
        for(const account of fixtures[owner]) {
          let incoming=0n,outgoing=0n;
          for(const transfer of ledger[owner].values()) {if(transfer.sourceAccountId===account.id)outgoing+=cents(transfer.amount);if(transfer.destinationAccountId===account.id)incoming+=cents(transfer.amount);}
          const sign=account.type==='credit_card'?-1n:1n;
          const balance=cents(account.openingBalance)+sign*(cents(account.income)-cents(account.expenses)+incoming-outgoing);net+=sign*balance;
          equal(await repo.getAccountSummary(users[owner].userId,account.id),{currentBalance:decimal(balance),openingBalance:account.openingBalance,totalIncome:account.income,totalExpenses:account.expenses,incomingTransfers:decimal(incoming),outgoingTransfers:decimal(outgoing),currency:'EGP'});
          equal((await repo.getAccountBalance(users[owner].userId,account.id)).currentBalance,decimal(balance));
        }
        equal(await repo.getNetPosition(users[owner].userId),{netPosition:decimal(net),currency:'EGP'});
        const actuals=(await client.query("SELECT sum(amount) FILTER (WHERE type='income')::text income,sum(amount) FILTER (WHERE type='expense')::text expenses,sum(CASE WHEN type='income' THEN amount ELSE -amount END)::text savings FROM expense_tracker.transactions WHERE user_id=$1",[users[owner].userId])).rows[0];
        equal(actuals,{income:'4.40',expenses:'0.80',savings:'3.60'});
        const rows=(await client.query('SELECT id,source_account_id AS "sourceAccountId",destination_account_id AS "destinationAccountId",amount::text AS amount,date::text AS date,description FROM expense_tracker.transfers WHERE user_id=$1 ORDER BY id',[users[owner].userId])).rows;
        equal(rows,[...ledger[owner].values()].sort((x,y)=>x.id.localeCompare(y.id)));
        await client.query('COMMIT');
      }finally{await client.query('ROLLBACK');client.release();}
    }
    async function waitBlocked(pid) {
      for(let i=0;i<160;i++) {
        const blocked=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))) blocked",[pid])).rows[0].blocked;
        if(blocked)return;await pause(25);
      }
      throw new Error('T27 expected observed lock wait');
    }
    function gate(matches,stage='after') {
      let entered,release,used=false;const ready=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);
      controls[stage]=async(sql,params,trace)=>{if(!used&&matches(sql,params)){used=true;entered(trace);await held;}};
      return {ready:()=>bounded(ready,'gate entry'),release:()=>{controls.before=null;controls.after=null;release();}};
    }
    async function restore(owner,id) {const result=await auth.rawRequest(tokens[owner],'/accounts/'+id+'/restore','POST',{});equal(result.status,200);}
    async function rawTransfer(id) {return (await runtime.query('SELECT to_jsonb(t)::text row FROM expense_tracker.transfers t WHERE id=$1',[id])).rows;}
    const v1Before=(await auth.v1Request('/summary')).body;
    await reconcile('a');await reconcile('b');

    // Missing T26 evidence: amount edits vs either unchanged endpoint, both orders,
    // and reassignment PUT winning before archive, across all four asset/card pairings.
    for(const [label,source,destination] of [['asset_asset',0,1],['asset_card',0,2],['card_asset',2,0],['card_card',2,3]]) {
      for(const action of ['amount_source','amount_destination','source','destination']) {
        const row=await create(base('a',source,destination)),newInput={...base('a',source,destination,'0.20'),description:label+' '+action};
        const replacement=[0,1,2,3].find(index=>index!==source&&index!==destination);
        if(action==='source')newInput.sourceAccountId=fixtures.a[replacement].id;
        if(action==='destination')newInput.destinationAccountId=fixtures.a[replacement].id;
        const target=action==='source'||action==='amount_source'?newInput.sourceAccountId:newInput.destinationAccountId;
        const orders=action.startsWith('amount')?['archive','transfer']:['transfer'];
        for(const first of orders) {
          const before=await rawTransfer(row.id);let working,waiting,hold;
          try {
            if(first==='archive') {
              // Pause real T17 archive after UPDATE but before COMMIT, retaining its parent lock.
              hold=gate((sql,params)=>sql.startsWith("UPDATE expense_tracker.accounts SET status='archived'")&&params[0]===target);
              working=request('a','/accounts/'+target+'/archive','POST',{});const trace=await hold.ready();
              waiting=request('a','/transfers/'+row.id,'PUT',newInput);await waitBlocked(trace.pid);hold.release();
              equal((await working).status,200);error(await waiting,409,'ACCOUNT_ARCHIVED');equal(await rawTransfer(row.id),before);
            }else {
              hold=gate((sql,params)=>sql.startsWith('UPDATE expense_tracker.transfers')&&params[0]===row.id);
              working=request('a','/transfers/'+row.id,'PUT',newInput);const trace=await hold.ready();
              waiting=auth.rawRequest(tokens.a,'/accounts/'+target+'/archive','POST',{});await waitBlocked(trace.pid);
              // Other connections still see the old committed transfer and both balance effects.
              equal(await rawTransfer(row.id),before);await reconcile();hold.release();
              const result=await working;equal(result.status,200);ledger.a.set(row.id,{...newInput,id:row.id});equal((await waiting).status,200);
            }
          }finally{if(hold)hold.release();await Promise.allSettled([working,waiting].filter(Boolean));}
          await reconcile();await restore('a',target);matrix.push({label,action,first});forcedRaces++;
        }
        await remove(row.id);await reconcile();
      }
    }

    // Missing reverse first-activity interleaving: opening edit wins before the first transfer.
    const openingResult=await auth.rawRequest(tokens.a,'/accounts','POST',{name:'T27 unlocked opening',type:'bank',openingBalance:'0.00',currency:'EGP'});equal(openingResult.status,201);
    const unlocked={...openingResult.body.data,income:'0.00',expenses:'0.00'};
    // This account is separate from the four-account reconciliation fixture.
    const openingInput={...base(),sourceAccountId:unlocked.id};let opening,post;
    const openingHold=gate((sql,params)=>sql.startsWith('UPDATE expense_tracker.accounts SET name=')&&params[0]===unlocked.id);
    try {
      opening=request('a','/accounts/'+unlocked.id,'PUT',{name:unlocked.name,type:unlocked.type,openingBalance:'1.00'});const trace=await openingHold.ready();
      post=request('a','/transfers','POST',openingInput);await waitBlocked(trace.pid);openingHold.release();equal((await opening).status,200);
      const result=await post;equal(result.status,201);
      const repo=createAccountBalanceRepository(pool);equal((await repo.getAccountBalance(users.a.userId,unlocked.id)).currentBalance,'0.90');equal((await repo.getAccountBalance(users.a.userId,unlocked.id)).openingBalanceEditable,false);
      equal((await repo.getAccountSummary(users.a.userId,fixtures.a[1].id)).incomingTransfers,'0.10');await remove(result.body.data.id);
    }finally{openingHold.release();await Promise.allSettled([opening,post].filter(Boolean));}
    // Include its settled opening-only contribution in the independent net-position model.
    fixtures.a.push({...unlocked,openingBalance:'1.00'});forcedRaces++;

    // Same-row DELETE/DELETE: one real 204, one indistinguishable missing 404.
    const deleting=await create(base('a',2,3)),deleteHold=gate((sql,params)=>sql.startsWith('DELETE FROM expense_tracker.transfers')&&params[0]===deleting.id);let firstDelete,secondDelete;
    try {
      firstDelete=request('a','/transfers/'+deleting.id,'DELETE');const trace=await deleteHold.ready();
      secondDelete=request('a','/transfers/'+deleting.id,'DELETE');await waitBlocked(trace.pid);await reconcile();deleteHold.release();
      equal((await firstDelete).status,204);error(await secondDelete,404,'NOT_FOUND');ledger.a.delete(deleting.id);
      equal((await request('a','/transfers/00000000-0000-4000-8000-000000000000','DELETE')).body,(await secondDelete).body);
    }finally{deleteHold.release();await Promise.allSettled([firstDelete,secondDelete].filter(Boolean));}
    await reconcile();forcedRaces++;

    // Identical deliberate requests are distinct records; simultaneous valid creates add both effects.
    const repeated=base('a',0,2,'0.10'),createHold=gate(sql=>sql.startsWith('INSERT INTO expense_tracker.transfers'));let firstCreate,secondCreate;
    try {
      firstCreate=request('a','/transfers','POST',repeated);const trace=await createHold.ready();secondCreate=request('a','/transfers','POST',repeated);await waitBlocked(trace.pid);await reconcile();createHold.release();
      const results=await Promise.all([firstCreate,secondCreate]);for(const result of results){equal(result.status,201);ledger.a.set(result.body.data.id,{...repeated,id:result.body.data.id});}
      assert.notEqual(results[0].body.data.id,results[1].body.data.id);checks++;await reconcile();for(const result of results)await remove(result.body.data.id);
    }finally{createHold.release();await Promise.allSettled([firstCreate,secondCreate].filter(Boolean));}
    await reconcile();forcedRaces++;

    // Foreign resources must reject even while their true owner holds account/transfer locks.
    for(const [attacker,victim] of [['a','b'],['b','a']]) {
      const existing=await create(base(victim,2,3),victim),changed={...base(victim,2,3,'0.20'),description:'Victim serial edit'};
      const hold=gate((sql,params)=>sql.startsWith('UPDATE expense_tracker.transfers')&&params[0]===existing.id);let valid;
      try {
        valid=request(victim,'/transfers/'+existing.id,'PUT',changed);await hold.ready();
        const missing='00000000-0000-4000-8000-000000000000';
        for(const [path,method,input,missingInput] of [
          ['/transfers/'+existing.id,'PUT',base(attacker),base(attacker)],
          ['/transfers/'+existing.id,'DELETE',undefined,undefined],
          ['/transfers','POST',{...base(attacker),sourceAccountId:fixtures[victim][2].id},{...base(attacker),sourceAccountId:missing}],
          ['/transfers','POST',{...base(attacker),destinationAccountId:fixtures[victim][3].id},{...base(attacker),destinationAccountId:missing}],
        ]) {
          const denied=await request(attacker,path,method,input),absent=await request(attacker,path==='/transfers'?path:'/transfers/'+missing,method,missingInput);error(denied,404,'NOT_FOUND');equal(denied.body,absent.body);
        }
        await reconcile(attacker);await reconcile(victim);hold.release();equal((await valid).status,200);ledger[victim].set(existing.id,{...changed,id:existing.id});
      }finally{hold.release();await Promise.allSettled([valid].filter(Boolean));}
      await reconcile(attacker);await reconcile(victim);await remove(existing.id,victim);await reconcile(victim);forcedRaces++;
    }

    // T26 already proves post-lock/post-write rollback. Add the exact pre-write and pre-COMMIT gaps.
    const correction=await create(base('a',0,2));
    for(const operation of ['create','update','delete'])for(const stage of ['before_write','before_commit']) {
      const before=await rawTransfer(correction.id),accountsBefore=(await runtime.query('SELECT to_jsonb(a)::text row FROM expense_tracker.accounts a WHERE user_id=$1 ORDER BY id',[users.a.userId])).rows;
      const prefix=operation==='create'?'INSERT INTO':operation==='update'?'UPDATE':'DELETE FROM';let fired=false;
      controls.before=async sql=>{if(!fired&&(stage==='before_commit'?sql==='COMMIT':sql.startsWith(prefix+' expense_tracker.transfers'))){fired=true;throw Object.assign(new Error('T27 injected private failure'),{code:'23503'});}};
      const input={...base('a',3,1,'0.20'),description:'Failed reassignment'};
      try {error(await request('a',operation==='create'?'/transfers':'/transfers/'+correction.id,operation==='create'?'POST':operation==='update'?'PUT':'DELETE',operation==='delete'?undefined:input),500,'INTERNAL_ERROR');equal(fired,true);}
      finally{controls.before=null;}
      equal(await rawTransfer(correction.id),before);equal((await runtime.query('SELECT to_jsonb(a)::text row FROM expense_tracker.accounts a WHERE user_id=$1 ORDER BY id',[users.a.userId])).rows,accountsBefore);await reconcile();rollbackFaults++;
    }
    await remove(correction.id);

    // A lost acknowledgement after real COMMIT is not a rollback: preserve its one committed row,
    // report a safe error, and prove no implicit second mutation/client is opened.
    const uncertainInput={...base('a',2,0,'0.20'),description:'T27 uncertain committed write'},traceStart=traces.length;let faulted=false;
    controls.after=async sql=>{if(sql==='COMMIT'&&!faulted){faulted=true;throw Object.assign(new Error('T27 private lost commit acknowledgement'),{code:'ECONNRESET'});}};
    try {const result=await request('a','/transfers','POST',uncertainInput);error(result,503,'DATABASE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(result.body),/private|acknowledgement|ECONNRESET/);checks++;}
    finally{controls.after=null;}
    equal(traces.length-traceStart,1);equal(traces.at(-1).sql.filter(sql=>sql.startsWith('INSERT INTO expense_tracker.transfers')).length,1);
    const recovered=(await request('a','/transfers?limit=100')).body.data;equal(recovered.length,1);equal(recovered[0].description,uncertainInput.description);ledger.a.set(recovered[0].id,{...uncertainInput,id:recovered[0].id});await reconcile();await remove(recovered[0].id);

    const deadlocksBefore=(await runtime.query('SELECT deadlocks::text value FROM pg_stat_database WHERE datname=current_database()')).rows[0].value;
    const stressRounds=20,stressPairs=[[0,1],[0,2],[2,0],[2,3]];
    for(let round=0;round<stressRounds;round++) {
      const [source,destination]=stressPairs[round%stressPairs.length],inputs=[base('a',source,destination,'0.10'),base('a',destination,source,'0.20'),base('a',1,3,'0.10')];
      const created=await Promise.all(inputs.map(input=>create(input)));await reconcile();
      const updates=created.map((row,i)=>({...base('a',i===0?3:0,i===0?0:3,i===0?'0.20':'0.10'),description:'T27 opposing '+round+' '+i,id:row.id}));
      const results=await Promise.all(updates.map(({id,...input})=>request('a','/transfers/'+id,'PUT',input)));
      for(let i=0;i<results.length;i++){equal(results[i].status,200);ledger.a.set(created[i].id,updates[i]);}
      await reconcile();await Promise.all(created.map(row=>remove(row.id)));await reconcile();
    }
    // Refresh the statistics snapshot; none of the workload is hidden by automatic retries.
    await runtime.query('SELECT pg_stat_clear_snapshot()');
    const deadlocksAfter=(await runtime.query('SELECT deadlocks::text value FROM pg_stat_database WHERE datname=current_database()')).rows[0].value;equal(deadlocksAfter,deadlocksBefore);
    await reconcile('a');await reconcile('b');equal((await auth.v1Request('/summary')).body,v1Before);
    for(const trace of traces) {
      const writes=trace.sql.filter(sql=>/^(INSERT INTO|UPDATE|DELETE FROM) expense_tracker.transfers/.test(sql));if(!writes.length)continue;
      equal(trace.sql[0],'BEGIN');equal(trace.finished,true);equal(trace.locks.length,1);equal(trace.sql.filter(sql=>sql==='BEGIN').length,1);equal(trace.sql.filter(sql=>sql==='COMMIT').length<=1,true);
      if(!writes[0].startsWith('INSERT'))assert.ok(trace.sql.findIndex(sql=>sql.includes('FROM expense_tracker.transfers WHERE id='))<trace.sql.findIndex(sql=>sql.includes('SELECT id,status FROM expense_tracker.accounts')));checks++;
    }
    // Actual role/catalog evidence, with unchanged T11/T15 privilege boundaries.
    equal((await runtime.query('SELECT current_user AS role,current_setting(\'default_transaction_isolation\') AS isolation')).rows[0],{role:'expense_tracker_app',isolation:'read committed'});
    equal((await admin.query("SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname='expense_tracker_app'")).rows[0],{rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false});
    for(const sql of ['CREATE TABLE expense_tracker.t27_denied(id int)','TRUNCATE expense_tracker.transfers','SET ROLE postgres']){await assert.rejects(runtime.query(sql),e=>e.code==='42501');checks++;}
    return {checks,forcedRaces,editArchiveMatrix:matrix,rollbackFaults,uncertainCommitVerified:true,stressRounds,stressMutations:stressRounds*9,deadlocksObserved:Number(deadlocksAfter)-Number(deadlocksBefore),isolation:'read committed',productionChanges:false};
  }finally{controls.before=null;controls.after=null;if(observed)await observed.close();}
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, Pool } from 'pg';
import { createRecurringOccurrenceService } from '../dist/services/recurring-occurrences.js';
import { createV2TransactionService } from '../dist/services/v2-transactions.js';
import { createAccountService } from '../dist/services/accounts.js';
import { disposableIsolationUrl, prepareIsolationDatabase, createTestUser, createTestAuthHarness } from './helpers/v2-isolation.mjs';

test('T32 structural validation does not acquire a database connection', async () => {
  const service = createRecurringOccurrenceService({ query:()=>assert.fail('query'), connect:()=>assert.fail('connect') });
  await assert.rejects(service.reserveOccurrence('invalid','invalid','2026-01-01'));
  await assert.rejects(service.getOccurrence(randomUUID(),randomUUID(),'2026-02-29'));
});

test('T32 fresh limited-role persistence, atomicity, concurrency, recovery and history', {
  skip:!process.env.T32_DISPOSABLE_DATABASE_URL && 'Requires an explicitly selected fresh disposable PostgreSQL cluster',
}, async () => {
  const url=disposableIsolationUrl(process.env.T32_DISPOSABLE_DATABASE_URL);
  const admin=new Client({connectionString:url.href}); await admin.connect();
  let pool, auth;
  let checks=0;
  const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const rejects=async (operation,predicate)=>{await assert.rejects(operation,predicate);checks++;};
  try {
    await prepareIsolationDatabase(admin,{occurrencePersistence:false});
    const migration=readFileSync(new URL('../../supabase/migrations/20261008135130_v2_occurrence_invariants.sql',import.meta.url),'utf8');
    // Existing inconsistent history must block migration without installing partial constraints.
    const [probeUser,probeAccount,probeDefinition,probeTransaction]=Array.from({length:4},()=>randomUUID());
    await admin.query('BEGIN');
    await admin.query('INSERT INTO auth.users(id) VALUES($1)',[probeUser]);
    await admin.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type) VALUES($1,$2,'Preflight probe','cash')",[probeAccount,probeUser]);
    await admin.query("INSERT INTO expense_tracker.recurring_transactions(id,user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,$3,'c1200000-0000-4000-8000-000000000001','income',0.10,'Probe','daily','1900-01-01')",[probeDefinition,probeUser,probeAccount]);
    await admin.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date,recurring_transaction_id) VALUES($1,$2,$3,'c1200000-0000-4000-8000-000000000001','income',0.10,'Invalid generated pair','1900-01-01',$4)",[probeTransaction,probeUser,probeAccount,probeDefinition]);
    await rejects(admin.query(migration),error=>error.code==='23514');
    await admin.query('ROLLBACK');
    equal((await admin.query("SELECT to_regclass('expense_tracker.transactions_generated_pair_unique') AS index")).rows[0].index,null);
    await admin.query(migration);
    const a={userId:randomUUID()},b={userId:randomUUID()};
    for(const user of [a,b])await createTestUser(admin,user);
    url.username='expense_tracker_app'; pool=new Pool({connectionString:url.href,max:8});
    const service=createRecurringOccurrenceService(pool),accounts=createAccountService(pool);
    auth=await createTestAuthHarness(pool);
    const tokenA=await auth.createTestAuthToken(a),tokenB=await auth.createTestAuthToken(b);
    const account=(await accounts.createAccount(a.userId,{name:'T32 cash',type:'cash',openingBalance:'0.00'})).id;
    const accountB=(await accounts.createAccount(b.userId,{name:'B cash',type:'cash',openingBalance:'0.00'})).id;
    const category='c1200000-0000-4000-8000-000000000001';
    const definition=async (amount='0.10')=>(await pool.query(`INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence)
      VALUES($1,$2,$3,'income',$4,'T32 generated','daily','1900-01-01','1900-01-01') RETURNING id`,[a.userId,account,category,amount])).rows[0].id;
    const snapshot=async()=> (await pool.query(`SELECT
      (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM expense_tracker.transactions t) AS transactions,
      (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') FROM expense_tracker.recurring_occurrences o) AS occurrences,
      (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM expense_tracker.recurring_transactions r) AS definitions,
      (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]') FROM expense_tracker.accounts a) AS accounts`)).rows[0];
    const faultPool=(match,after=true)=>({query:pool.query.bind(pool),connect:async()=>{
      const client=await pool.connect(); let fired=false;
      return {query:async(sql,args)=>{
        const selected=!fired&&match.test(sql);
        if(selected&&!after){fired=true;throw new Error('T32 injected fault');}
        const result=await client.query(sql,args);
        if(selected){fired=true;throw new Error('T32 injected fault');}
        return result;
      },release:client.release.bind(client)};
    }});
    const contended=async(method,date,pattern)=>{
      let signal,release,firstPid,secondPid;
      const ready=new Promise(resolve=>{signal=resolve;});
      const gate=new Promise(resolve=>{release=resolve;});
      const wrapped=(first)=>({query:pool.query.bind(pool),connect:async()=>{
        const client=await pool.connect();
        if(first)firstPid=client.processID;else secondPid=client.processID;
        return {query:async(sql,args)=>{
          const result=await client.query(sql,args);
          if(first&&pattern.test(sql)){signal();await gate;}
          return result;
        },release:client.release.bind(client)};
      }});
      const one=createRecurringOccurrenceService(wrapped(true))[method](a.userId,id,date);
      await ready;
      const two=createRecurringOccurrenceService(wrapped(false))[method](a.userId,id,date);
      try {
        let observed=false;
        for(let attempt=0;attempt<300;attempt++) {
          if(secondPid&&(await admin.query('SELECT $1::int=ANY(pg_blocking_pids($2)) AS blocked',[firstPid,secondPid])).rows[0].blocked){observed=true;break;}
          await delay(10);
        }
        equal(observed,true);
      }finally{release();}
      const results=await Promise.all([one,two]);equal(results[0],results[1]);return results;
    };
    equal((await pool.query('SELECT current_user')).rows[0].current_user,'expense_tracker_app');
    const id=await definition();
    const [r1,r2]=await contended('reserveOccurrence','1900-01-01',/INSERT INTO expense_tracker.recurring_occurrences/);
    equal(r1,r2); equal(r1.status,'pending'); equal(r1.processedAt,null);
    equal(await service.reserveOccurrence(a.userId,id,'1900-01-01'),r1);
    const [p1,p2]=await contended('postOccurrence','1900-01-01',/INSERT INTO expense_tracker.transactions/);
    equal(p1,p2);equal(p1.status,'posted');equal(p1.createdAt,r1.createdAt);
    equal((await accounts.getAccountSummary(a.userId,account)).currentBalance,'0.10');
    equal((await pool.query('SELECT count(*)::int count FROM expense_tracker.transactions')).rows[0].count,1);
    equal(await service.postOccurrence(a.userId,id,'1900-01-01'),p1);
    // Actual T21 HTTP edit and delete with verified local JWT.
    const edit=await auth.rawRequest(tokenA,'/transactions/'+p1.generatedTransactionId,'PUT',{accountId:account,categoryId:category,type:'income',amount:'0.20',description:'Edited history',date:'1900-02-01'});
    equal(edit.status,200);equal(edit.body.data.recurringOccurrenceDate,'1900-01-01');
    equal(await service.getOccurrence(a.userId,id,'1900-01-01'),p1);
    equal((await accounts.getAccountSummary(a.userId,account)).currentBalance,'0.20');
    equal((await auth.rawRequest(tokenB,'/transactions/'+p1.generatedTransactionId,'DELETE')).status,404);
    equal((await auth.rawRequest(tokenA,'/transactions/'+p1.generatedTransactionId,'DELETE')).status,204);
    const deleted=await service.getOccurrence(a.userId,id,'1900-01-01');
    equal(deleted.status,'posted');equal(deleted.generatedTransactionId,null);equal(deleted.processedAt,p1.processedAt);
    equal(await service.postOccurrence(a.userId,id,'1900-01-01'),deleted);
    equal((await accounts.getAccountSummary(a.userId,account)).currentBalance,'0.00');

    for(const method of ['reserveOccurrence','postOccurrence','getOccurrence']) {
      await rejects(service[method](b.userId,id,'1900-01-01'),error=>error.status===404);
      await rejects(service[method](b.userId,randomUUID(),'1900-01-01'),error=>error.status===404);
    }
    await rejects(service.transitionOccurrence(b.userId,id,'1900-01-01','skip'),error=>error.status===404);
    const pending=await service.reserveOccurrence(a.userId,id,'1900-01-02');
    const failed=await service.transitionOccurrence(a.userId,id,'1900-01-02','fail','POSTING_FAILED');
    equal(failed.status,'failed');equal(failed.failureCode,'POSTING_FAILED');
    equal(await service.reserveOccurrence(a.userId,id,'1900-01-02'),failed);
    equal(await service.transitionOccurrence(a.userId,id,'1900-01-02','fail','POSTING_FAILED'),failed);
    await rejects(service.postOccurrence(a.userId,id,'1900-01-02'),error=>error.status===409);
    const retried=await service.transitionOccurrence(a.userId,id,'1900-01-02','retry');
    equal(retried.status,'pending');equal(retried.failureCode,null);equal(retried.processedAt,null);equal(retried.createdAt,pending.createdAt);
    const skipped=await service.transitionOccurrence(a.userId,id,'1900-01-02','skip');
    equal(await service.transitionOccurrence(a.userId,id,'1900-01-02','skip'),skipped);
    equal(await service.postOccurrence(a.userId,id,'1900-01-02'),skipped);
    for(const action of ['retry','fail'])await rejects(service.transitionOccurrence(a.userId,id,'1900-01-02',action,action==='fail'?'POSTING_FAILED':undefined),error=>error.status===409);
    await rejects(service.transitionOccurrence(a.userId,id,'1900-01-03','fail','SQL password=secret'),error=>error.status===409);

    // Durable pending survives all clients closing/reopening, not in-memory ownership.
    await service.reserveOccurrence(a.userId,id,'1900-01-03');
    await auth.close();auth=null;await pool.end();pool=new Pool({connectionString:url.href,max:8});
    equal((await createRecurringOccurrenceService(pool).getOccurrence(a.userId,id,'1900-01-03')).status,'pending');
    // Existing service holds the closed pool; use a newly constructed service below.
    const reopened=createRecurringOccurrenceService(pool);
    for(const [pattern,after] of [[/INSERT INTO expense_tracker.transactions/,true],[/UPDATE expense_tracker.recurring_occurrences/,false],[/UPDATE expense_tracker.recurring_occurrences/,true],[/^COMMIT$/,false]]) {
      const before=await snapshot();
      await rejects(createRecurringOccurrenceService(faultPool(pattern,after)).postOccurrence(a.userId,id,'1900-01-03'),/T32 injected fault/);
      equal(await snapshot(),before);
    }
    const beforeReserve=await snapshot();
    await rejects(createRecurringOccurrenceService(faultPool(/INSERT INTO expense_tracker.recurring_occurrences/)).reserveOccurrence(a.userId,id,'1900-01-04'),/T32 injected fault/);
    equal(await snapshot(),beforeReserve);
    const beforeTransition=await snapshot();
    await rejects(createRecurringOccurrenceService(faultPool(/UPDATE expense_tracker.recurring_occurrences/)).transitionOccurrence(a.userId,id,'1900-01-03','fail','POSTING_FAILED'),/T32 injected fault/);
    equal(await snapshot(),beforeTransition);
    await rejects(createRecurringOccurrenceService(faultPool(/^COMMIT$/)).postOccurrence(a.userId,id,'1900-01-03'),/T32 injected fault/);
    const acknowledged=await reopened.postOccurrence(a.userId,id,'1900-01-03');
    equal(acknowledged.status,'posted');
    equal((await pool.query('SELECT count(*)::int count FROM expense_tracker.transactions')).rows[0].count,1);
    equal(await reopened.postOccurrence(a.userId,id,'1900-01-03'),acknowledged);
    equal((await createAccountService(pool).getAccountSummary(a.userId,account)).currentBalance,'0.10');

    // Direct DB writes use the limited role, not the service checks.
    for(const [sql,args] of [
      ["INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date) VALUES($1,$2,'1900-01-05')",[b.userId,id]],
      ["INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date) VALUES($1,$2,'1900-01-01')",[a.userId,id]],
      ["UPDATE expense_tracker.recurring_occurrences SET status='pending',processed_at=NULL WHERE id=$1",[acknowledged.id]],
      ["UPDATE expense_tracker.recurring_occurrences SET occurrence_date='1900-02-01' WHERE id=$1",[acknowledged.id]],
      ["UPDATE expense_tracker.recurring_occurrences SET status='invalid' WHERE id=$1",[pending.id]],
      ["UPDATE expense_tracker.transactions SET recurring_occurrence_date='1900-02-01' WHERE id=$1",[acknowledged.generatedTransactionId]],
      ["DELETE FROM expense_tracker.recurring_occurrences WHERE id=$1",[acknowledged.id]],
      ["TRUNCATE expense_tracker.recurring_occurrences",[]],
      ["ALTER TABLE expense_tracker.recurring_occurrences DISABLE TRIGGER ALL",[]],
      ["CREATE TABLE expense_tracker.t32_forbidden(id int)",[]],
    ])await rejects(pool.query(sql,args),error=>['23514','23503','23505','42501'].includes(error.code));

    const btx=(await createV2TransactionService(pool).createTransaction(b.userId,{accountId:accountB,categoryId:category,type:'income',amount:'0.10',description:'B manual',date:'1900-01-01'})).id;
    await reopened.reserveOccurrence(a.userId,id,'1900-01-06');
    await rejects(pool.query("UPDATE expense_tracker.recurring_occurrences SET status='posted',processed_at=statement_timestamp(),generated_transaction_id=$1 WHERE user_id=$2 AND recurring_transaction_id=$3 AND occurrence_date='1900-01-06'",[btx,a.userId,id]),error=>['23514','23503'].includes(error.code));
    const generatedSql=`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date,recurring_transaction_id,recurring_occurrence_date)
      VALUES(gen_random_uuid(),$1,$2,$3,'income',0.10,'Direct generated','1900-01-06',$4,$5)`;
    // A generated insert without the terminal link must fail at COMMIT, leaving no orphan.
    await rejects(pool.query(generatedSql,[a.userId,account,category,id,'1900-01-06']),error=>error.code==='23514');
    await rejects(pool.query(generatedSql,[a.userId,account,category,id,'1900-01-01']),error=>error.code==='23514');
    await rejects(pool.query(generatedSql,[a.userId,account,category,id,null]),error=>error.code==='23514');
    await rejects(pool.query("UPDATE expense_tracker.recurring_occurrences SET generated_transaction_id=NULL WHERE id=$1",[acknowledged.id]),error=>error.code==='23514');
    await rejects(pool.query("DELETE FROM expense_tracker.recurring_transactions WHERE id=$1",[id]),error=>error.code==='23503');
    equal((await pool.query('SELECT count(*)::int count FROM expense_tracker.transactions WHERE user_id=$1',[a.userId])).rows[0].count,1);
    // T31 can compose progression with the identical posting implementation, not a second writer.
    await reopened.reserveOccurrence(a.userId,id,'1900-01-07');
    const beforeComposition=await snapshot(),composed=await pool.connect();
    try {
      await composed.query('BEGIN');
      await reopened.postOccurrenceInTransaction(composed,a.userId,id,'1900-01-07');
      await composed.query("UPDATE expense_tracker.recurring_transactions SET next_occurrence='1900-01-08' WHERE id=$1",[id]);
      await rejects(composed.query('SELECT 1/0'),error=>error.code==='22012');
      await composed.query('ROLLBACK');
    } finally {composed.release();}
    equal(await snapshot(),beforeComposition);
    const weekly=(await pool.query(`INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date)
      VALUES($1,$2,$3,'income',0.10,'Weekly','weekly','1900-01-01') RETURNING id`,[a.userId,account,category])).rows[0].id;
    await rejects(reopened.reserveOccurrence(a.userId,weekly,'1900-01-02'),error=>error.status===409);
    await rejects(reopened.postOccurrence(a.userId,weekly,'1900-01-01'),error=>error.status===404);
    // Terminal replay survives a later schedule edit that no longer contains the old date.
    await pool.query("UPDATE expense_tracker.recurring_transactions SET start_date='1900-02-01',next_occurrence='1900-02-01' WHERE id=$1",[id]);
    equal(await reopened.reserveOccurrence(a.userId,id,'1900-01-01'),deleted);
    equal(await reopened.postOccurrence(a.userId,id,'1900-01-01'),deleted);
    for(const amount of ['0.20','999999999.99']) {
      const moneyId=await definition(amount);await reopened.reserveOccurrence(a.userId,moneyId,'1900-01-01');
      const posted=await reopened.postOccurrence(a.userId,moneyId,'1900-01-01');
      const transaction=await createV2TransactionService(pool).getTransaction(a.userId,posted.generatedTransactionId);
      equal(transaction.amount,amount);equal(transaction.date,'1900-01-01');
    }
    equal((await createAccountService(pool).getAccountSummary(a.userId,account)).currentBalance,'1000000000.29');
    const custom=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,'T32 custom','income') RETURNING id",[a.userId])).rows[0].id;
    const customDefinition=(await pool.query(`INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date)
      VALUES($1,$2,$3,'income',0.10,'Custom recurring','daily','1900-01-01') RETURNING id`,[a.userId,account,custom])).rows[0].id;
    await reopened.reserveOccurrence(a.userId,customDefinition,'1900-01-01');
    await pool.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[custom]);
    await rejects(reopened.postOccurrence(a.userId,customDefinition,'1900-01-01'),error=>error.code==='CATEGORY_ARCHIVED');
    equal((await reopened.getOccurrence(a.userId,customDefinition,'1900-01-01')).status,'pending');
    await reopened.transitionOccurrence(a.userId,customDefinition,'1900-01-01','skip');
    await pool.query("UPDATE expense_tracker.recurring_transactions SET status='paused',next_occurrence=NULL WHERE id=$1",[weekly]);
    await rejects(reopened.reserveOccurrence(a.userId,weekly,'1900-01-08'),error=>error.status===409);
    const archivedId=await definition();await reopened.reserveOccurrence(a.userId,archivedId,'1900-01-01');
    await createAccountService(pool).archiveAccount(a.userId,account);
    equal((await reopened.getOccurrence(a.userId,archivedId,'1900-01-01')).status,'skipped');
    equal((await reopened.postOccurrence(a.userId,archivedId,'1900-01-01')).status,'skipped');
    equal((await reopened.getOccurrence(a.userId,id,'1900-01-03')).status,'posted');
    // No browser Data API grants or elevated runtime powers.
    equal((await pool.query("SELECT rolcreatedb,rolcreaterole,rolsuper FROM pg_roles WHERE rolname=current_user")).rows[0],{rolcreatedb:false,rolcreaterole:false,rolsuper:false});
    equal((await pool.query("SELECT has_table_privilege('anon','expense_tracker.recurring_occurrences','SELECT') AS anon,has_table_privilege('authenticated','expense_tracker.recurring_occurrences','SELECT') AS authenticated")).rows[0],{anon:false,authenticated:false});
    process.stdout.write(`T32 integration: ${checks} checks passed; double reservation/post, 6 rollback faults, lost commit acknowledgement, reconnect, T21 history and T18 reconciliation.\n`);
  } finally { if(auth)await auth.close();if(pool)await pool.end();await admin.end(); }
});

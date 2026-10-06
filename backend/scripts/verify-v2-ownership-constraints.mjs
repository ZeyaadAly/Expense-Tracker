// Fresh loopback cluster only. No dotenv or production fallback.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {URL,pathToFileURL} from 'node:url';
import {Client,Pool} from 'pg';
import {verifyT14} from './verify-v2-migration-rehearsal.mjs';
import {captureInventory,categoryMap} from './v2-migration-rehearsal.mjs';
import {createApp} from '../dist/app.js';
import {createTransactionService} from '../dist/services/transactions.js';

const owner='a1500000-0000-4000-8000-000000000001'; // Disposable synthetic identity.
const tables=['profiles','accounts','categories','transactions','transfers','recurring_transactions','recurring_occurrences','budgets','goals'];
export function disposableT15Url(value) {
  const url=new URL(value||'');
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55451');
  assert.equal(url.pathname,'/postgres');assert.equal(url.username,'postgres');
  assert.ok(!url.password&&!url.search&&!url.hash,'Password/options prohibited');
  return url;
}
export async function verifyT15(connectionString) {
  const url=disposableT15Url(connectionString),t14=await verifyT14(url.href,owner);
  const admin=new Client({connectionString:url.href});await admin.connect();
  url.username='expense_tracker_app';const runtime=new Client({connectionString:url.href});await runtime.connect();
  let pool,server,checks=0;
  const check=(label,actual,expected)=>{assert.deepEqual(actual,expected,label);checks++;};
  const files=readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(f=>/_v2_ownership_constraints\.sql$/.test(f)).sort();
  check('one atomic migration',files.length,1);
  const migration=readFileSync(new URL('../../supabase/migrations/'+files[0],import.meta.url),'utf8');
  const body=migration.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
  async function snapshot() {const result={};for(const table of tables)result[table]=(await admin.query(`SELECT to_jsonb(t)::text row FROM expense_tracker.${table} t ORDER BY to_jsonb(t)::text`)).rows;return result;}
  async function catalog() {return (await admin.query(`SELECT 'constraint' kind,conname name,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE connamespace='expense_tracker'::regnamespace
    UNION ALL SELECT 'column',table_name||'.'||column_name,is_nullable FROM information_schema.columns WHERE table_schema='expense_tracker'
    UNION ALL SELECT 'trigger',tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='expense_tracker'::regnamespace) AND NOT tgisinternal ORDER BY 1,2,3`)).rows;}
  const ids={a:randomUUID(),a2:randomUUID(),b:randomUUID(),ci:randomUUID(),ce:randomUUID(),cb:randomUUID(),foreignCat:randomUUID(),tx:randomUUID(),txb:randomUUID(),rec:randomUUID(),recb:randomUUID(),budget:randomUUID(),goal:randomUUID(),transfer:randomUUID(),occ:randomUUID()};
  let foreign;
  async function fixtures(client) {
    for(const [id,user,name] of [[ids.a,owner,'A cash'],[ids.a2,owner,'A bank'],[ids.b,foreign,'B cash']])await client.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type,opening_balance_locked) VALUES($1,$2,$3,'cash',true)",[id,user,name]);
    for(const [id,user,name,kind] of [[ids.ci,owner,'A income','income'],[ids.ce,owner,'A expense','expense'],[ids.cb,owner,'A both','both'],[ids.foreignCat,foreign,'B expense','expense']])await client.query('INSERT INTO expense_tracker.categories(id,user_id,name,kind) VALUES($1,$2,$3,$4)',[id,user,name,kind]);
    for(const [id,user,account,category] of [[ids.tx,owner,ids.a,ids.ce],[ids.txb,foreign,ids.b,ids.foreignCat]])await client.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,category,transaction_date) VALUES($1,$2,$3,$4,'expense',1.00,'Fixture','other','1900-01-01')",[id,user,account,category]);
    for(const [id,user,account,category] of [[ids.rec,owner,ids.a,ids.ce],[ids.recb,foreign,ids.b,ids.foreignCat]])await client.query("INSERT INTO expense_tracker.recurring_transactions(id,user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence) VALUES($1,$2,$3,$4,'expense',1.00,'Fixture','monthly','1900-01-01','1900-02-01')",[id,user,account,category]);
    await client.query('INSERT INTO expense_tracker.budgets(id,user_id,category_id,amount,year,month) VALUES($1,$2,$3,10.00,2026,1)',[ids.budget,owner,ids.ce]);
    await client.query("INSERT INTO expense_tracker.goals(id,user_id,name,target_amount,linked_account_id) VALUES($1,$2,'Fixture',10.00,$3)",[ids.goal,owner,ids.a]);
    await client.query("INSERT INTO expense_tracker.transfers(id,user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,$4,1.00,'1900-01-01')",[ids.transfer,owner,ids.a,ids.a2]);
    await client.query("INSERT INTO expense_tracker.recurring_occurrences(id,user_id,recurring_transaction_id,occurrence_date,status,generated_transaction_id,processed_at) VALUES($1,$2,$3,'1900-01-01','posted',$4,statement_timestamp())",[ids.occ,owner,ids.rec,ids.tx]);
  }
  try {
    await admin.query("SET TIME ZONE 'UTC'");await runtime.query("SET TIME ZONE 'UTC'");
    foreign=(await admin.query('SELECT id FROM auth.users WHERE id<>$1',[owner])).rows[0].id;
    const history=await captureInventory(admin),originalRows=await snapshot(),originalCatalog=await catalog();
    const faults=[
      ['transactions.null_user','transactions','user_id=NULL',[]],['transactions.null_account','transactions','account_id=NULL',[]],['transactions.null_category','transactions','category_id=NULL',[]],
      ['transactions.account_owner','transactions','account_id=$1',[ids.b]],['transactions.category','transactions','category_id=$1',[ids.foreignCat]],['transactions.recurring_owner','transactions','recurring_transaction_id=$1',[ids.recb]],
      ['transfers.account_owner','transfers','destination_account_id=$1',[ids.b]],['recurring.account_owner','recurring_transactions','account_id=$1',[ids.b]],['recurring.category','recurring_transactions','category_id=$1',[ids.ci]],
      ['occurrences.definition_owner','recurring_occurrences','recurring_transaction_id=$1',[ids.recb]],['occurrences.generated_owner','recurring_occurrences','generated_transaction_id=$1',[ids.txb]],
      ['budgets.category','budgets','category_id=$1',[ids.ci]],['goals.account_owner','goals','linked_account_id=$1',[ids.b]],['categories.integrity','categories','is_system=true',[]],['accounts.activity_lock','accounts','opening_balance_locked=false',[]],
    ];
    const target={transactions:ids.tx,transfers:ids.transfer,recurring_transactions:ids.rec,recurring_occurrences:ids.occ,budgets:ids.budget,goals:ids.goal,categories:ids.ce,accounts:ids.a};
    for(const [rule,table,assignment,params] of faults) {
      await admin.query('BEGIN');await fixtures(admin);
      // Test-only corruption of a disposable copy, followed by full rollback.
      await admin.query(`ALTER TABLE expense_tracker.${table} DISABLE TRIGGER USER`);
      const constraints=(await admin.query("SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND contype IN ('c','f')",['expense_tracker.'+table])).rows;
      for(const {conname} of constraints)await admin.query(`ALTER TABLE expense_tracker.${table} DROP CONSTRAINT "${conname}"`);
      await admin.query(`UPDATE expense_tracker.${table} SET ${assignment} WHERE id=$${params.length+1}`,[...params,target[table]]);
      await assert.rejects(admin.query(body),e=>e.code==='23514'&&e.message.includes('T15_PREFLIGHT: '+rule));checks++;
      await admin.query('ROLLBACK');check(rule+' restores rows',await snapshot(),originalRows);check(rule+' restores schema',await catalog(),originalCatalog);
    }
    // Historical archived references must not make stage E reject a clean copy.
    await admin.query('BEGIN');await fixtures(admin);
    await admin.query("UPDATE expense_tracker.accounts SET status='archived' WHERE id=$1",[ids.a]);
    await admin.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[ids.ce]);
    await admin.query("UPDATE expense_tracker.recurring_transactions SET status='paused',next_occurrence=NULL WHERE id=$1",[ids.rec]);
    await admin.query(body);await admin.query('ROLLBACK');
    check('successful trial reverses schema',await catalog(),originalCatalog);check('trial preserves rows',await snapshot(),originalRows);
    await admin.query('BEGIN');
    await admin.query("CREATE FUNCTION expense_tracker.preserve_v2_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$");
    await assert.rejects(admin.query(body),e=>e.code==='42723');checks++;
    await admin.query('ROLLBACK');check('failure after ALTER reverses schema',await catalog(),originalCatalog);check('failure after ALTER preserves rows',await snapshot(),originalRows);
    await admin.query(migration);
    check('migration preserves every row/timestamp',await snapshot(),originalRows);check('T14 financial inventory',await captureInventory(admin),history);
    check('all constraints validated',(await admin.query("SELECT count(*)::int n FROM pg_constraint WHERE connamespace='expense_tracker'::regnamespace AND NOT convalidated")).rows[0].n,0);
    check('eight native owner FKs',(await admin.query("SELECT count(*)::int n FROM pg_constraint WHERE connamespace='expense_tracker'::regnamespace AND conname IN ('transactions_account_owner_fk','transactions_recurring_owner_fk','transfers_source_owner_fk','transfers_destination_owner_fk','recurring_account_owner_fk','occurrences_definition_owner_fk','occurrences_generated_owner_fk','goals_linked_account_owner_fk') AND contype='f' AND array_length(conkey,1)=2 AND convalidated")).rows[0].n,8);
    check('three required references',(await admin.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='expense_tracker' AND table_name='transactions' AND column_name IN ('user_id','account_id','category_id') AND is_nullable='NO'")).rows[0].n,3);
    check('legacy category nullable',(await admin.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='expense_tracker' AND table_name='transactions' AND column_name='category'")).rows[0].is_nullable,'YES');
    check('RLS unchanged',(await admin.query("SELECT count(*)::int n FROM pg_class WHERE relnamespace='expense_tracker'::regnamespace AND relrowsecurity")).rows[0].n,0);
    check('invoker functions fixed path',(await admin.query("SELECT count(*)::int n FROM pg_proc WHERE pronamespace='expense_tracker'::regnamespace AND proname IN ('preserve_v2_owner','validate_v2_category','protect_v2_category','protect_v2_account','validate_v2_account_use') AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog']")).rows[0].n,5);
    check('migration leaves V1 suspended',(await admin.query("SELECT has_table_privilege('expense_tracker_app','expense_tracker.transactions','INSERT') allowed")).rows[0].allowed,false);
    // Test-only compatibility probe. Production retires V1 before restoring DML.
    await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON expense_tracker.transactions TO expense_tracker_app');
    pool=new Pool({connectionString:url.href});server=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,transactions:createTransactionService(pool)}).listen(0,'127.0.0.1');await once(server,'listening');
    async function request(path,method='GET',body) {const response=await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
    const list=await request('/transactions');check('V1 list status',list.status,200);check('V1 list count',list.body.data.length,13);
    const sample=history.rows[0],single=await request('/transactions/'+sample.id);check('V1 single status',single.status,200);check('V1 historical fields',[single.body.data.id,single.body.data.type,single.body.data.amount,single.body.data.description,single.body.data.category,single.body.data.date],[sample.id,sample.type,sample.amount,sample.description,sample.category,sample.date]);
    const summary=await request('/summary');check('V1 summary status',summary.status,200);check('V1 totals',[summary.body.data.totalIncome,summary.body.data.totalExpenses,summary.body.data.balance],[history.totals.income,history.totals.expenses,history.totals.balance]);
    const oldPost=await request('/transactions','POST',{type:'expense',amount:'1.00',description:'V1 probe',category:'other',date:'1900-01-01'});check('V1 POST intentionally fails',oldPost.status,500);check('safe API error',Object.hasOwn(oldPost.body,'data'),false);
    await assert.rejects(runtime.query("INSERT INTO expense_tracker.transactions(id,type,amount,description,category,transaction_date) VALUES($1,'expense',1.00,'V1 probe','other','1900-01-01')",[randomUUID()]),e=>e.code==='23502');checks++;
    await admin.query('INSERT INTO expense_tracker.profiles(user_id) VALUES($1)',[foreign]);
    await runtime.query('BEGIN');await fixtures(runtime);checks+=15;
    async function reject(label,sql,params=[],codes=['23514','23503','23505','23502','42501']) {await runtime.query('SAVEPOINT negative');await assert.rejects(runtime.query(sql,params),e=>codes.includes(e.code),label);await runtime.query('ROLLBACK TO SAVEPOINT negative');await runtime.query('RELEASE SAVEPOINT negative');checks++;}
    for(const [label,table,assignment,params] of faults.filter(f=>!['categories.integrity','accounts.activity_lock'].includes(f[0])))await reject(label,`UPDATE expense_tracker.${table} SET ${assignment} WHERE id=$${params.length+1}`,[...params,target[table]]);
    for(const [label,assignment,params] of [['income with expense',"type='income'",[]],['expense with income','category_id=$1',[ids.ci]]])await reject(label,`UPDATE expense_tracker.transactions SET ${assignment} WHERE id=$${params.length+1}`,[...params,ids.tx]);
    for(const [table,id] of [['recurring_transactions',ids.rec],['budgets',ids.budget]])await reject(table+' foreign category',`UPDATE expense_tracker.${table} SET category_id=$1 WHERE id=$2`,[ids.foreignCat,id]);
    for(const [type,account,category] of [['expense',ids.b,ids.ce],['expense',ids.a,ids.foreignCat],['income',ids.a,ids.ce],['expense',ids.a,ids.ci]])await reject('invalid transaction insert',"INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,$5,1.00,'Invalid insert','1900-01-01')",[randomUUID(),owner,account,category,type]);
    for(const [source,destination] of [[ids.b,ids.a],[ids.a,ids.b]])await reject('invalid transfer insert',"INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,1.00,'1900-01-01')",[owner,source,destination]);
    for(const [account,category] of [[ids.b,ids.ce],[ids.a,ids.foreignCat],[ids.a,ids.ci]])await reject('invalid recurring insert',"INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date) VALUES($1,$2,$3,'expense',1.00,'Invalid insert','daily','1900-01-01')",[owner,account,category]);
    for(const category of [ids.ci,ids.foreignCat])await reject('invalid budget insert','INSERT INTO expense_tracker.budgets(user_id,category_id,amount,year,month) VALUES($1,$2,1.00,2026,2)',[owner,category]);
    await reject('invalid goal insert',"INSERT INTO expense_tracker.goals(user_id,name,target_amount,linked_account_id) VALUES($1,'Invalid insert',1.00,$2)",[owner,ids.b]);
    for(const [definition,generated] of [[ids.recb,ids.txb],[ids.rec,ids.txb]])await reject('invalid occurrence insert',"INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date,status,generated_transaction_id,processed_at) VALUES($1,$2,'1900-03-01','posted',$3,statement_timestamp())",[owner,definition,generated]);
    for(const [system,user] of [[true,owner],[false,null]])await reject('invalid category owner',"INSERT INTO expense_tracker.categories(user_id,name,kind,is_system) VALUES($1,'Invalid category','expense',$2)",[user,system]);
    for(const field of ['kind','status'])await reject('invalid category '+field,`UPDATE expense_tracker.categories SET ${field}='invalid' WHERE id=$1`,[ids.ce]);
    for(const table of tables)await reject(table+' immutable owner',`UPDATE expense_tracker.${table} SET user_id=$1 WHERE ${table==='profiles'?'user_id':'id'}=$2`,[foreign,table==='profiles'?owner:target[table]]);
    await reject('system immutable',"UPDATE expense_tracker.categories SET name='Changed' WHERE id=$1",[categoryMap.other.id]);await reject('system delete denied','DELETE FROM expense_tracker.categories WHERE id=$1',[categoryMap.other.id]);
    await reject('referenced kind immutable',"UPDATE expense_tracker.categories SET kind='both' WHERE id=$1",[ids.ce]);await reject('system flag immutable','UPDATE expense_tracker.categories SET is_system=true,user_id=NULL WHERE id=$1',[ids.ce]);
    for(const [type,category] of [['income',categoryMap.salary.id],['expense',categoryMap.food.id],['income',categoryMap.other.id],['expense',categoryMap.other.id],['income',ids.ci],['expense',ids.ce],['income',ids.cb],['expense',ids.cb]]) {
      const tx=randomUUID();await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,$5,0.01,'V2 custom/system','1900-01-01')",[tx,owner,ids.a,category,type]);checks++;
      check('legacy category not fabricated',(await runtime.query('SELECT category FROM expense_tracker.transactions WHERE id=$1',[tx])).rows[0].category,null);
      await runtime.query("UPDATE expense_tracker.transactions SET amount=0.10,description='Edited' WHERE id=$1",[tx]);check('runtime update',(await runtime.query('SELECT amount::text FROM expense_tracker.transactions WHERE id=$1',[tx])).rows[0].amount,'0.10');await runtime.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[tx]);checks++;
    }
    await runtime.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[ids.tx]);check('generated delete preserves marker',(await runtime.query('SELECT user_id,status,generated_transaction_id FROM expense_tracker.recurring_occurrences WHERE id=$1',[ids.occ])).rows[0],{user_id:owner,status:'posted',generated_transaction_id:null});
    await reject('occurrence uniqueness',"INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date) VALUES($1,$2,'1900-01-01')",[owner,ids.rec]);
    await runtime.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1",[ids.ce]);check('category archive pauses',(await runtime.query('SELECT status,next_occurrence FROM expense_tracker.recurring_transactions WHERE id=$1',[ids.rec])).rows[0],{status:'paused',next_occurrence:null});
    const archivedTx=randomUUID();await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,'expense',0.01,'Archived integrity probe','1900-01-01')",[archivedTx,owner,ids.a,ids.ce]);checks++;
    await runtime.query('UPDATE expense_tracker.transactions SET amount=0.02 WHERE id=$1',[archivedTx]);checks++;
    await runtime.query("UPDATE expense_tracker.categories SET status='active' WHERE id=$1",[ids.ce]);check('category restore no resume',(await runtime.query('SELECT status FROM expense_tracker.recurring_transactions WHERE id=$1',[ids.rec])).rows[0].status,'paused');
    await runtime.query("UPDATE expense_tracker.recurring_transactions SET status='active',next_occurrence='1900-02-01' WHERE id=$1",[ids.rec]);await runtime.query("UPDATE expense_tracker.accounts SET status='archived' WHERE id=$1",[ids.a]);check('account archive preserves history',(await runtime.query('SELECT count(*)::int n FROM expense_tracker.transactions WHERE id=$1',[archivedTx])).rows[0].n,1);check('account archive pauses',(await runtime.query('SELECT status FROM expense_tracker.recurring_transactions WHERE id=$1',[ids.rec])).rows[0].status,'paused');
    await reject('archived account blocks edit','UPDATE expense_tracker.transactions SET amount=0.03 WHERE id=$1',[archivedTx]);await runtime.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[archivedTx]);checks++;
    await runtime.query("UPDATE expense_tracker.accounts SET status='active' WHERE id=$1",[ids.a]);check('account restore no resume',(await runtime.query('SELECT status FROM expense_tracker.recurring_transactions WHERE id=$1',[ids.rec])).rows[0].status,'paused');
    const fresh=randomUUID();await runtime.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type) VALUES($1,$2,'Opening lock fixture','cash')",[fresh,owner]);await runtime.query('UPDATE expense_tracker.accounts SET opening_balance=1.00 WHERE id=$1',[fresh]);
    const first=randomUUID();await runtime.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,$4,'expense',0.01,'First activity','1900-01-01')",[first,owner,fresh,ids.ce]);check('first activity locks',(await runtime.query('SELECT opening_balance_locked FROM expense_tracker.accounts WHERE id=$1',[fresh])).rows[0].opening_balance_locked,true);await runtime.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[first]);
    for(const assignment of ['opening_balance=2.00','opening_balance_locked=false',"type='credit_card'"])await reject('permanent lock '+assignment,'UPDATE expense_tracker.accounts SET '+assignment+' WHERE id=$1',[fresh]);
    for(const statement of ['CREATE TABLE expense_tracker.forbidden(id int)','TRUNCATE expense_tracker.transactions','ALTER TABLE expense_tracker.transactions DISABLE TRIGGER v2_category_integrity','ALTER SCHEMA expense_tracker OWNER TO expense_tracker_app','CREATE ROLE forbidden','ALTER ROLE expense_tracker_app SUPERUSER','SET ROLE postgres'])await reject('runtime privilege denial',statement,[],['42501']);
    for(const assignment of ['amount=1.230','amount=0','destination_account_id=source_account_id'])await reject('transfer invariants '+assignment,'UPDATE expense_tracker.transfers SET '+assignment+' WHERE id=$1',[ids.transfer]);
    for(const [table,id,assignment] of [['budgets',ids.budget,'amount=12.00'],['goals',ids.goal,'saved_amount=0.50'],['transfers',ids.transfer,'amount=0.50']]) {
      check('runtime '+table+' update',(await runtime.query(`UPDATE expense_tracker.${table} SET ${assignment} WHERE id=$1 RETURNING id`,[id])).rowCount,1);
      check('runtime '+table+' delete',(await runtime.query(`DELETE FROM expense_tracker.${table} WHERE id=$1 RETURNING id`,[id])).rowCount,1);
    }
    await runtime.query('UPDATE expense_tracker.recurring_occurrences SET generated_transaction_id=NULL WHERE id=$1',[ids.occ]);checks++;
    await reject('runtime cannot delete occurrence marker','DELETE FROM expense_tracker.recurring_occurrences WHERE id=$1',[ids.occ],['42501']);
    await reject('definition deletion preserves occurrence FK','DELETE FROM expense_tracker.recurring_transactions WHERE id=$1',[ids.rec],['23503']);
    check('runtime unused recurring delete',(await runtime.query('DELETE FROM expense_tracker.recurring_transactions WHERE id=$1 RETURNING id',[ids.recb])).rowCount,1);
    await reject('accounts archive only','DELETE FROM expense_tracker.accounts WHERE id=$1',[fresh],['23514']);
    await reject('categories archive only','DELETE FROM expense_tracker.categories WHERE id=$1',[ids.cb],['23514']);
    await runtime.query('ROLLBACK');await admin.query('DELETE FROM expense_tracker.profiles WHERE user_id=$1',[foreign]);check('all test fixtures reversed',await snapshot(),originalRows);check('final financial inventory',await captureInventory(admin),history);
    const accountBalance=(await admin.query("SELECT (a.opening_balance+COALESCE(sum(CASE WHEN t.type='income' THEN t.amount ELSE -t.amount END),0))::text balance FROM expense_tracker.accounts a LEFT JOIN expense_tracker.transactions t ON t.account_id=a.id WHERE a.user_id=$1 GROUP BY a.id",[owner])).rows[0].balance;check('Main Account balance',accountBalance,t14.totals.balance);
    for(const role of ['anon','authenticated'])check('private schema '+role,(await admin.query("SELECT has_schema_privilege($1,'expense_tracker','USAGE') allowed",[role])).rows[0].allowed,false);
    check('limited runtime',(await admin.query("SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='expense_tracker_app'")).rows[0],{rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false,rolinherit:false});
    await admin.query('REVOKE SELECT,INSERT,UPDATE,DELETE ON expense_tracker.transactions FROM expense_tracker_app');
    return {checks,failures:0,t14Checks:t14.checks,preflightFaults:faults.length,migrations:files,totals:history.totals,accountBalance,legacyDigest:history.digest,timestampsPreserved:true,v1Reads:true,v1WriteRejected:true,remoteApplied:false};
  } finally {
    await runtime.query('ROLLBACK').catch(()=>{});await admin.query('ROLLBACK').catch(()=>{});
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(pool)await pool.end();await runtime.end();await admin.end();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await verifyT15(process.env.T15_DISPOSABLE_DATABASE_URL)));}
  catch(error) {console.error('T15 verification failed:',error.code||error.name,error.message);process.exitCode=1;}
}

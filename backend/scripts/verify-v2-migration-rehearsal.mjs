// Fresh disposable PostgreSQL only; never loads .env or falls back to DATABASE_URL.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {URL,pathToFileURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {Client,Pool} from 'pg';
import {createApp} from '../dist/app.js';
import {createProfileService} from '../dist/services/profiles.js';
import {createTransactionService} from '../dist/services/transactions.js';
import {captureInventory,migrateLegacy,rollbackLegacy,ownershipReadiness,categoryMap} from './v2-migration-rehearsal.mjs';

export async function verifyT14(connectionString,ownerId) {
  const url=new URL(connectionString||'');
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55451');assert.equal(url.pathname,'/postgres');
  assert.equal(url.username,'postgres');assert.ok(!url.password,'PASSWORD_FREE_DISPOSABLE_URL_REQUIRED');assert.ok(!url.search&&!url.hash,'DISPOSABLE_URL_OPTIONS_NOT_ALLOWED');
  assert.match(ownerId||'',/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const admin=new Client({connectionString:url.href});await admin.connect();
  url.username='expense_tracker_app';let pool;
  const accountId=randomUUID(),foreign=randomUUID();let checks=0;
  const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);checks++;};
  const sql=file=>readFileSync(new URL('../../supabase/'+file,import.meta.url),'utf8');
  let oldServer,maintServer;
  try {
    check('fresh schemas',(await admin.query("SELECT to_regnamespace('expense_tracker')::text app,to_regnamespace('auth')::text auth")).rows[0],{app:null,auth:null});
    check('fresh roles',(await admin.query("SELECT count(*)::int n FROM pg_roles WHERE rolname IN ('expense_tracker_app','anon','authenticated')")).rows[0].n,0);
    await admin.query("SET TIME ZONE 'UTC'; CREATE TABLE public.t14_disposable_marker(marker text PRIMARY KEY); INSERT INTO public.t14_disposable_marker VALUES('isolated-t14-rehearsal'); CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); REVOKE ALL ON SCHEMA auth FROM PUBLIC; REVOKE ALL ON auth.users FROM PUBLIC;");
    for(const file of ['20261001144302_initial_expense_tracker_schema.sql','20261003163341_backend_application_role.sql'])await admin.query(sql('migrations/'+file));
    await admin.query(sql('seed.sql'));
    const fixtureAmounts={salary:'999999999.99',freelance:'0.10',gift:'0.20',food:'1.23',transport:'0.01',shopping:'100.00',bills:'20.00',entertainment:'0.99',other:'0.10'};
    await admin.query('BEGIN; ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write');
    for(const [legacy,target] of Object.entries(categoryMap)) {
      const type=target.kind==='both'?'expense':target.kind;
      await admin.query(`INSERT INTO expense_tracker.transactions(id,type,amount,description,category,transaction_date,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,'1900-01-01','2000-02-29 12:34:56.123456+00','2001-03-01 01:02:03.654321+00')`,[randomUUID(),type,fixtureAmounts[legacy],'Retained '+legacy+' — القاهرة 😀',legacy]);
    }
    await admin.query(`INSERT INTO expense_tracker.transactions(id,type,amount,description,category,transaction_date,created_at,updated_at)
      VALUES($1,'income',0.30,'Retained income Other','other','2024-02-29','2024-02-29 00:00:00.000001+00','2024-03-01 00:00:00.999999+00')`,[randomUUID()]);
    await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write; COMMIT');
    const beforeSchema=await captureInventory(admin);
    check('independent synthetic fixture totals',beforeSchema.totals,{count:13,income:'1000001000.59',expenses:'418.58',balance:'1000000582.01',minimum:'0.01',maximum:'999999999.99'});
    const migrations=readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(f=>/_v2_(core_tables|transaction_references|indexes_and_triggers|runtime_privileges)\.sql$/.test(f)).sort();
    check('four T11 files',migrations.length,4);for(const file of migrations)await admin.query(sql('migrations/'+file));
    await admin.query(sql('seeds/v2-system-categories.sql'));await admin.query(sql('seeds/v2-system-categories.sql'));
    check('additive schema/reference seed preserves history',await captureInventory(admin),beforeSchema);
    check('nine seeded stable categories',(await admin.query('SELECT count(*)::int n FROM expense_tracker.categories')).rows[0].n,9);
    await admin.query('INSERT INTO auth.users(id) VALUES($1),($2)',[ownerId,foreign]);
    pool=new Pool({connectionString:url.href});
    const profile=await createProfileService(pool).ensureProfile(ownerId);
    check('T13 profile defaults',[profile.userId,profile.displayName,profile.preferredCurrency,profile.locale,profile.timezone],[ownerId,null,'EGP','en','Africa/Cairo']);
    const service=createTransactionService(pool),app=createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,transactions:service});
    oldServer=app.listen(0,'127.0.0.1');await once(oldServer,'listening');
    const maintenanceApp=express();maintenanceApp.use('/api/v1',(req,res,next)=>{
      if(req.path==='/transactions'||req.path.startsWith('/transactions/')||req.path==='/summary')res.set('Cache-Control','no-store').status(503).json({error:{code:'MAINTENANCE',message:'Maintenance in progress.',details:[]}});else next();
    });maintenanceApp.use(app);maintServer=maintenanceApp.listen(0,'127.0.0.1');await once(maintServer,'listening');
    async function request(server,path,method='GET',body) {const r=await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api/v1`+path,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,body:r.status===204?null:await r.json()};}
    const example={type:'expense',amount:'0.01',description:'Compatibility window probe',category:'other',date:'1900-01-01'};
    const sample=beforeSchema.rows[0].id;
    const paths=[['/transactions','GET'],['/summary','GET'],['/transactions/'+sample,'GET'],['/transactions','POST',example],['/transactions/'+sample,'PUT',example],['/transactions/'+sample,'DELETE']];
    for(const [path,method,body] of paths)check('all maintenance financial routes blocked',(await request(maintServer,path,method,body)).status,503);
    check('health remains public',(await request(maintServer,'/health')).status,200);
    await admin.query('REVOKE SELECT,INSERT,UPDATE,DELETE ON expense_tracker.transactions FROM expense_tracker_app');
    for(const [path,method,body] of paths) {const r=await request(oldServer,path,method,body);check('stale V1 runtime cannot expose/mutate',r.status,500);check('no stale response data',Object.hasOwn(r.body,'data'),false);}
    const inventory=await captureInventory(admin),input={ownerId,mainAccountId:accountId,inventory};
    const snapshot=async()=>({inventory:await captureInventory(admin),refs:(await admin.query('SELECT id,user_id,account_id,category_id,recurring_transaction_id,recurring_occurrence_date FROM expense_tracker.transactions ORDER BY id')).rows,accounts:(await admin.query('SELECT * FROM expense_tracker.accounts ORDER BY id')).rows,trigger:(await admin.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='expense_tracker.transactions'::regclass AND tgname='transactions_validate_write'")).rows});
    async function abort(name,pattern,options=input) {const before=await snapshot();await assert.rejects(migrateLegacy(admin,options),e=>pattern.test(e.message));check(name,await snapshot(),before);}
    await abort('missing owner fails before mutation',/OWNER_MISSING/,{...input,ownerId:randomUUID()});
    await abort('missing profile fails before mutation',/PROFILE_MISSING/,{...input,ownerId:foreign});
    await abort('inventory mismatch fails before mutation',/INVENTORY_MISMATCH/,{...input,inventory:{...inventory,totals:{...inventory.totals,count:999}}});
    // V1's own category CHECK forbids this fixture normally. Drop/recreate it only
    // in this disposable fault test; restore its exact definition afterward.
    const constraint=(await admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='expense_tracker.transactions'::regclass AND conname='transactions_category_check'")).rows[0].definition;
    await admin.query('ALTER TABLE expense_tracker.transactions DROP CONSTRAINT transactions_category_check');
    const badId=randomUUID();await admin.query(`INSERT INTO expense_tracker.transactions(id,type,amount,description,category,transaction_date) VALUES($1,'expense',1.00,'Unsupported fixture','unknown_fixture','1900-01-01')`,[badId]);
    await abort('unknown category fail-closed',/UNKNOWN_LEGACY_CATEGORY: unknown_fixture/,{...input,inventory:await captureInventory(admin)});
    await admin.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[badId]);await admin.query('ALTER TABLE expense_tracker.transactions ADD CONSTRAINT transactions_category_check '+constraint);
    await admin.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write');await admin.query('UPDATE expense_tracker.transactions SET user_id=$1 WHERE id=$2',[foreign,sample]);await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write');
    await abort('unexpected ownership abort',/OWNERSHIP_CONFLICT/);
    await admin.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write');await admin.query('UPDATE expense_tracker.transactions SET user_id=NULL WHERE id=$1',[sample]);await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write');
    await admin.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type,opening_balance) VALUES($1,$2,'Main Account','cash',0.00)",[accountId,ownerId]);await abort('preexisting Main Account collision abort',/MAIN_ACCOUNT_COLLISION/);await admin.query('DELETE FROM expense_tracker.accounts WHERE id=$1',[accountId]);
    await admin.query("UPDATE expense_tracker.categories SET kind='both' WHERE id=$1",[categoryMap.salary.id]);await abort('system category drift abort',/SYSTEM_CATEGORY_DRIFT/);await admin.query("UPDATE expense_tracker.categories SET kind='income' WHERE id=$1",[categoryMap.salary.id]);
    await admin.query('ALTER TABLE expense_tracker.transactions ADD CONSTRAINT t14_fault_injection CHECK(category_id IS NULL)');
    await abort('mid-backfill constraint failure restores account/rows/trigger',/t14_fault_injection/);await admin.query('ALTER TABLE expense_tracker.transactions DROP CONSTRAINT t14_fault_injection');
    const baseline=await snapshot();check('trial transaction performs then rolls back',(await migrateLegacy(admin,{...input,rollback:true})).status,'rolled-back');check('trial reversal exact original snapshot',await snapshot(),baseline);
    const result=await migrateLegacy(admin,input);check('happy path changed exact inventory count',result,{status:'migrated',changed:inventory.rows.length});
    check('complete original fields and totals preserved',await captureInventory(admin),inventory);
    check('T15 readiness',await ownershipReadiness(admin,ownerId,accountId),{total:inventory.rows.length,missing:0,invalid:0});
    const migrated=await snapshot();check('rerun no writes',await migrateLegacy(admin,input),{status:'already-migrated',changed:0});check('rerun all timestamps unchanged',await snapshot(),migrated);
    check('committed window A rollback',await rollbackLegacy(admin,input),{status:'restored-legacy',count:inventory.rows.length});check('committed rollback exact original state',await snapshot(),baseline);
    await migrateLegacy(admin,input);
    // Window B guard: synthetic V2 account activity must never be erased by A rollback.
    const transferId=randomUUID(),secondAccount=randomUUID();
    await admin.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type) VALUES($1,$2,'V2 activity fixture','cash')",[secondAccount,ownerId]);
    await admin.query("INSERT INTO expense_tracker.transfers(id,user_id,source_account_id,destination_account_id,amount,date) VALUES($1,$2,$3,$4,0.01,'1900-01-01')",[transferId,ownerId,accountId,secondAccount]);
    const withWrites=await snapshot();await assert.rejects(rollbackLegacy(admin,input),e=>/V2_WRITES_PRESENT/.test(e.message));check('window B refuses destructive rollback',await snapshot(),withWrites);check('V2 transfer retained',(await admin.query('SELECT count(*)::int n FROM expense_tracker.transfers WHERE id=$1',[transferId])).rows[0].n,1);
    await admin.query('DELETE FROM expense_tracker.transfers WHERE id=$1',[transferId]);await admin.query('DELETE FROM expense_tracker.accounts WHERE id=$1',[secondAccount]);
    // Restore original T11 runtime grants only for the disposable risk demonstration.
    await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON expense_tracker.transactions TO expense_tracker_app');
    check('V1 list reads migrated legacy fields',(await request(oldServer,'/transactions')).body.data.length,inventory.rows.length);
    const historical=(await request(oldServer,'/transactions/'+sample)).body.data,original=inventory.rows.find(r=>r.id===sample);
    check('V1 historical read matches retained fields',[historical.id,historical.type,historical.category,historical.amount,historical.description,historical.date],[original.id,original.type,original.category,original.amount,original.description,original.date]);
    const summary=(await request(oldServer,'/summary')).body.data;
    check('V1 exact summary',[summary.totalIncome,summary.totalExpenses,summary.balance],[inventory.totals.income,inventory.totals.expenses,inventory.totals.balance]);
    const created=await request(oldServer,'/transactions','POST',example);check('old V1 create after backfill',created.status,201);
    const probeId=created.body.data.id;check('old V1 create leaves null ownership',(await admin.query('SELECT user_id,account_id,category_id FROM expense_tracker.transactions WHERE id=$1',[probeId])).rows[0],{user_id:null,account_id:null,category_id:null});
    check('post-V1 write not ready', (await ownershipReadiness(admin,ownerId,accountId)).missing,1);
    check('V1 read created row',(await request(oldServer,'/transactions/'+probeId)).body,created.body);
    check('V1 update created row',(await request(oldServer,'/transactions/'+probeId,'PUT',{...example,amount:'0.10'})).status,200);
    check('V1 delete created row',(await request(oldServer,'/transactions/'+probeId,'DELETE')).status,204);
    check('original retained dataset unchanged after CRUD',await captureInventory(admin),inventory);
    await assert.rejects(migrateLegacy(admin,input),e=>/V1_RUNTIME_ACCESS_NOT_BLOCKED/.test(e.message));checks++;
    await admin.query('REVOKE SELECT,INSERT,UPDATE,DELETE ON expense_tracker.transactions FROM expense_tracker_app');
    check('final migration rerun remains clean',(await migrateLegacy(admin,input)).status,'already-migrated');
    for(const statement of ['CREATE TABLE expense_tracker.forbidden(id int)','TRUNCATE expense_tracker.transactions','ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write','ALTER TABLE expense_tracker.transactions ADD COLUMN forbidden int','ALTER TABLE expense_tracker.transactions OWNER TO expense_tracker_app']){await assert.rejects(pool.query(statement),e=>e.code==='42501');checks++;}
    check('nullable columns retained',(await admin.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='expense_tracker' AND table_name='transactions' AND column_name IN ('user_id','account_id','category_id') AND is_nullable='YES'")).rows[0].n,3);
    check('final T15 readiness',await ownershipReadiness(admin,ownerId,accountId),{total:inventory.rows.length,missing:0,invalid:0});
    return {checks,failures:0,totals:inventory.totals,legacyDigest:inventory.digest,legacyRows:inventory.rows.length,mappedCategories:Object.keys(categoryMap).length,maintenanceVerified:true,rollbackA:true,rollbackBRefused:true,finalReady:true};
  } finally {
    await admin.query('ROLLBACK').catch(()=>{});
    for(const server of [oldServer,maintServer])if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    if(pool)await pool.end();await admin.end();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await verifyT14(process.env.T14_DISPOSABLE_DATABASE_URL,process.env.T14_MIGRATION_OWNER_ID)));}
  catch {console.error('T14 rehearsal failed. Inspect the local test assertions; no database credentials are printed.');process.exitCode=1;}
}

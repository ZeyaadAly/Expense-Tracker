import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import process from 'node:process';
import {Client} from 'pg';
import {createTransactionService} from '../dist/services/transactions.js';

// Never loads backend/.env or falls back to DATABASE_URL. A fresh isolated cluster is required.
export async function verifyT11(connectionString) {
  const url = new URL(connectionString || '');
  assert.equal(url.hostname, '127.0.0.1', 'T11 writes require loopback');
  assert.equal(url.port, '55451', 'T11 reserved disposable test port');
  assert.equal(url.pathname, '/postgres');
  assert.equal(url.username, 'postgres');
  assert.equal(url.password, '');
  const admin = new Client({connectionString: url.href});
  await admin.connect();
  let checks = 0;
  const check = (name, actual, expected) => {assert.deepEqual(actual, expected, name); checks++;};
  const root = new URL('../../supabase/', import.meta.url);
  const sql = file => readFileSync(new URL(file, root), 'utf8');
  const migrations = readdirSync(new URL('migrations/', root)).filter(name => /_v2_(core_tables|transaction_references|indexes_and_triggers|runtime_privileges)\.sql$/.test(name)).sort();
  check('four ordered T11 migrations', migrations.length, 4);
  const tables = ['accounts','budgets','categories','goals','profiles','recurring_occurrences','recurring_transactions','transactions','transfers'];
  const originals = 'id,type,amount::text AS amount,description,category,transaction_date::text AS date,created_at::text,updated_at::text';
  const rows = async () => (await admin.query(`SELECT ${originals} FROM expense_tracker.transactions ORDER BY id`)).rows;
  const totals = async () => (await admin.query(`SELECT count(*)::int AS count,
    sum(amount) FILTER (WHERE type='income')::text AS income,
    sum(amount) FILTER (WHERE type='expense')::text AS expense,
    sum(CASE WHEN type='income' THEN amount ELSE -amount END)::text AS balance FROM expense_tracker.transactions`)).rows;
  const legacyCatalog = async () => ({
    columns: (await admin.query("SELECT attname,atttypid,atttypmod,attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='expense_tracker.transactions'::regclass AND a.attnum BETWEEN 1 AND 8 ORDER BY a.attnum")).rows,
    constraints: (await admin.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='expense_tracker.transactions'::regclass AND contype IN ('p','c') ORDER BY conname")).rows,
    trigger: (await admin.query("SELECT pg_get_triggerdef(oid) AS definition,tgenabled FROM pg_trigger WHERE tgrelid='expense_tracker.transactions'::regclass AND NOT tgisinternal ORDER BY tgname")).rows,
    function: (await admin.query("SELECT pg_get_functiondef('expense_tracker.validate_transaction_write()'::regprocedure) AS definition")).rows,
    indexes: (await admin.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='expense_tracker' AND indexname IN ('transactions_pkey','transactions_order_idx') ORDER BY indexname")).rows,
  });
  async function reject(query, values = [], code = '23514') {
    await admin.query('SAVEPOINT invalid_case');
    await assert.rejects(admin.query(query, values), e => e.code === code);
    await admin.query('ROLLBACK TO SAVEPOINT invalid_case');
    await admin.query('RELEASE SAVEPOINT invalid_case');
    checks++;
  }
  try {
    check('fresh app/auth schemas', (await admin.query("SELECT to_regnamespace('expense_tracker')::text AS app,to_regnamespace('auth')::text AS auth")).rows[0], {app:null,auth:null});
    check('fresh role namespace', (await admin.query("SELECT count(*)::int AS count FROM pg_roles WHERE rolname IN ('expense_tracker_app','anon','authenticated')")).rows[0].count, 0);
    // Plain PostgreSQL fixture only: not a Supabase Auth implementation or real identities.
    await admin.query('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); REVOKE ALL ON SCHEMA auth FROM PUBLIC; REVOKE ALL ON auth.users FROM PUBLIC;');
    for (const file of ['20261001144302_initial_expense_tracker_schema.sql','20261003163341_backend_application_role.sql']) await admin.query(sql(`migrations/${file}`));
    await admin.query(sql('seed.sql'));
    await admin.query(`INSERT INTO expense_tracker.transactions (id,type,amount,description,category,transaction_date) VALUES
      ('00000000-0000-4000-8000-000000000001','income',999999999.99,'Retained maximum fixture','salary','1900-01-01'),
      ('00000000-0000-4000-8000-000000000002','expense',0.10,'Retained Unicode fixture — القاهرة','other','2026-09-30')`);
    const baseline = await rows(), baselineTotals = await totals(), baselineCatalog = await legacyCatalog();
    check('exact representative V1 totals', baselineTotals, [{count:5,income:'1000000999.99',expense:'296.35',balance:'1000000703.64'}]);
    // Rehearse transactional reversal before committing the exact versioned SQL.
    await admin.query('BEGIN');
    for (const file of migrations) await admin.query(sql(`migrations/${file}`).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
    check('trial apply preserves rows', await rows(), baseline);
    await admin.query('ROLLBACK');
    check('reversal removes only new structure', (await admin.query("SELECT table_name FROM information_schema.tables WHERE table_schema='expense_tracker' ORDER BY table_name")).rows, [{table_name:'transactions'}]);
    check('reversal restores catalog', await legacyCatalog(), baselineCatalog);
    check('reversal preserves original rows', await rows(), baseline);
    for (const file of migrations) await admin.query(sql(`migrations/${file}`));
    check('committed apply preserves all original fields', await rows(), baseline);
    check('committed apply preserves totals', await totals(), baselineTotals);
    check('committed apply preserves V1 catalog', await legacyCatalog(), baselineCatalog);
    await admin.query(sql('seed.sql'));await admin.query(sql('seed.sql'));
    check('V1 seed remains idempotent after migration', await rows(), baseline);
    check('nine P0 tables, no P1', (await admin.query("SELECT table_name FROM information_schema.tables WHERE table_schema='expense_tracker' ORDER BY table_name")).rows.map(r=>r.table_name), tables);
    check('legacy ownership/link fields remain null', (await admin.query('SELECT count(*)::int AS count FROM expense_tracker.transactions WHERE user_id IS NOT NULL OR account_id IS NOT NULL OR category_id IS NOT NULL OR recurring_transaction_id IS NOT NULL OR recurring_occurrence_date IS NOT NULL')).rows[0].count, 0);
    check('five nullable additive columns', (await admin.query("SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='expense_tracker' AND table_name='transactions' AND ordinal_position>8 ORDER BY ordinal_position")).rows, ['user_id','account_id','category_id','recurring_transaction_id','recurring_occurrence_date'].map(column_name=>({column_name,is_nullable:'YES',column_default:null})));
    check('all persisted money is unrestricted numeric', (await admin.query("SELECT count(*)::int AS count FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='expense_tracker' AND c.relkind='r' AND a.atttypid='numeric'::regtype AND a.atttypmod=-1")).rows[0].count, 7);
    check('no CASCADE deletes', (await admin.query("SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='expense_tracker' AND contype='f' AND confdeltype='c'")).rows[0].count, 0);
    check('only generated link SET NULL', (await admin.query("SELECT conrelid::regclass::text AS child,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='expense_tracker'::regnamespace AND contype='f' AND confdeltype='n'")).rows.map(r=>r.child), ['expense_tracker.recurring_occurrences']);
    check('RLS remains deferred', (await admin.query("SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='expense_tracker'::regnamespace AND relrowsecurity")).rows[0].count, 0);
    check('runtime attributes unchanged', (await admin.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='expense_tracker_app'")).rows[0], {rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,rolinherit:false});
    check('runtime has no memberships', (await admin.query("SELECT count(*)::int AS count FROM pg_auth_members WHERE member='expense_tracker_app'::regrole")).rows[0].count, 0);
    check('runtime does not own tables/schema', (await admin.query("SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='expense_tracker'::regnamespace AND relowner='expense_tracker_app'::regrole)+(SELECT count(*) FROM pg_namespace WHERE nspname='expense_tracker' AND nspowner='expense_tracker_app'::regrole) AS count")).rows[0].count, '0');
    for (const table of tables) {
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) {
        check(`runtime ${table} ${privilege}`, (await admin.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['expense_tracker_app',`expense_tracker.${table}`,privilege])).rows[0].allowed, ['SELECT','INSERT','UPDATE'].includes(privilege) || (privilege==='DELETE' && table!=='recurring_occurrences'));
      }
      for (const role of ['anon','authenticated']) for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) check(`browser ${role} ${table} ${privilege}`, (await admin.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,`expense_tracker.${table}`,privilege])).rows[0].allowed, false);
    }
    for (const role of ['anon','authenticated']) check(`browser ${role} schema denied`, (await admin.query('SELECT has_schema_privilege($1,$2,$3) AS allowed',[role,'expense_tracker','USAGE'])).rows[0].allowed,false);
    check('all functions are invoker with fixed search path', (await admin.query("SELECT count(*)::int AS count FROM pg_proc WHERE pronamespace='expense_tracker'::regnamespace AND (prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog'])")).rows[0].count,0);
    for(const role of ['anon','authenticated']) for(const name of ['set_v2_timestamps','validate_transfer_date','validate_transaction_write']) check(`browser ${role} function ${name} denied`,(await admin.query('SELECT has_function_privilege($1,$2,$3) AS allowed',[role,`expense_tracker.${name}()`,'EXECUTE'])).rows[0].allowed,false);
    check('runtime schema CREATE denied', (await admin.query("SELECT has_schema_privilege('expense_tracker_app','expense_tracker','CREATE') AS allowed")).rows[0].allowed,false);
    check('runtime auth reads denied', (await admin.query("SELECT has_table_privilege('expense_tracker_app','auth.users','SELECT') AS allowed")).rows[0].allowed,false);
    // CREATE DATABASE must run outside a transaction to reach its privilege check.
    await admin.query('SET ROLE expense_tracker_app');
    await assert.rejects(admin.query('CREATE DATABASE forbidden'),e=>e.code==='42501');checks++;
    await admin.query('RESET ROLE');
    const config = sql('config.toml');check('private schema not exposed in local config', /schemas\s*=\s*\["public", "graphql_public"\]/.test(config) && /extra_search_path\s*=\s*\["public", "extensions"\]/.test(config), true);

    // Fixture writes are transactional and removed before the V1 regression suites.
    await admin.query('BEGIN');
    const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
    await admin.query('INSERT INTO auth.users VALUES ($1),($2)',[a,b]);
    await admin.query('SET LOCAL ROLE expense_tracker_app');
    await admin.query('INSERT INTO expense_tracker.profiles(user_id) VALUES ($1)',[a]);
    const account = async (owner,name) => (await admin.query("INSERT INTO expense_tracker.accounts(user_id,name,type) VALUES ($1,$2,'cash') RETURNING id",[owner,name])).rows[0].id;
    const source=await account(a,'Main'), dest=await account(a,'Reserve'), other=await account(b,'Main');
    const category=(await admin.query("INSERT INTO expense_tracker.categories(name,kind,is_system) VALUES ('T11 fixture only','both',true) RETURNING id")).rows[0].id;
    await reject("INSERT INTO expense_tracker.accounts(user_id,name,type) VALUES ($1,'MAIN','bank')",[a],'23505');
    await reject("INSERT INTO expense_tracker.categories(name,kind,is_system) VALUES ('t11 FIXTURE ONLY','both',true)",[],'23505');
    await reject("INSERT INTO expense_tracker.categories(name,kind) VALUES ('No owner','expense')");
    await reject("INSERT INTO expense_tracker.categories(user_id,name,kind,is_system) VALUES ($1,'Bad owner','expense',true)",[a]);
    await admin.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES ($1,'Custom fixture','expense')",[a]);
    await reject("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES ($1,'CUSTOM FIXTURE','expense')",[a],'23505');
    const transfer=(await admin.query("INSERT INTO expense_tracker.transfers(user_id,source_account_id,destination_account_id,amount,date) VALUES ($1,$2,$3,0.01,'1900-01-01') RETURNING id",[a,source,dest])).rows[0].id;
    await reject('UPDATE expense_tracker.transfers SET destination_account_id=$1 WHERE id=$2',[source,transfer]);
    await reject('UPDATE expense_tracker.transfers SET destination_account_id=$1 WHERE id=$2',[other,transfer],'23503');
    await reject("UPDATE expense_tracker.transfers SET date='2999-01-01' WHERE id=$1",[transfer]);
    const recurring=(await admin.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence) VALUES ($1,$2,$3,'expense',0.01,'Future schedule','monthly','2999-01-31','2999-01-31') RETURNING id",[a,source,category])).rows[0].id;
    check('future recurring dates accepted', typeof recurring, 'string');
    await reject("UPDATE expense_tracker.recurring_transactions SET end_date='2998-12-31' WHERE id=$1",[recurring]);
    await reject("UPDATE expense_tracker.recurring_transactions SET next_occurrence='infinity' WHERE id=$1",[recurring]);
    await reject("UPDATE expense_tracker.recurring_transactions SET status='paused' WHERE id=$1",[recurring]);
    await admin.query("UPDATE expense_tracker.recurring_transactions SET status='paused',next_occurrence=NULL WHERE id=$1",[recurring]);
    await admin.query("UPDATE expense_tracker.recurring_transactions SET status='active' WHERE id=$1",[recurring]);
    await reject('UPDATE expense_tracker.recurring_transactions SET account_id=$1 WHERE id=$2',[other,recurring],'23503');
    const occurrence=(await admin.query("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date) VALUES ($1,$2,'2999-01-31') RETURNING id",[a,recurring])).rows[0].id;
    await reject("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date) VALUES ($1,$2,'2999-01-31')",[a,recurring],'23505');
    await reject("INSERT INTO expense_tracker.recurring_occurrences(user_id,recurring_transaction_id,occurrence_date) VALUES ($1,$2,'2999-02-28')",[b,recurring],'23503');
    await reject("UPDATE expense_tracker.recurring_occurrences SET status='posted' WHERE id=$1",[occurrence]);
    await admin.query("UPDATE expense_tracker.recurring_occurrences SET status='failed',processed_at=statement_timestamp(),failure_code='AUTH_UNAVAILABLE' WHERE id=$1",[occurrence]);
    await reject("UPDATE expense_tracker.recurring_occurrences SET status='skipped' WHERE id=$1",[occurrence]);
    await admin.query("UPDATE expense_tracker.recurring_occurrences SET status='pending',processed_at=NULL,failure_code=NULL WHERE id=$1",[occurrence]);
    const budget=(await admin.query('INSERT INTO expense_tracker.budgets(user_id,category_id,amount,year,month) VALUES ($1,$2,0.01,2026,10) RETURNING id',[a,category])).rows[0].id;
    await reject('INSERT INTO expense_tracker.budgets(user_id,category_id,amount,year,month) VALUES ($1,$2,0.01,2026,10)',[a,category],'23505');
    const goal=(await admin.query("INSERT INTO expense_tracker.goals(user_id,name,target_amount,saved_amount,linked_account_id) VALUES ($1,'Goal',0.01,0.02,$2) RETURNING id",[a,source])).rows[0].id;
    await reject('UPDATE expense_tracker.goals SET linked_account_id=$1 WHERE id=$2',[other,goal],'23503');
    await reject("UPDATE expense_tracker.goals SET status='completed',saved_amount=0 WHERE id=$1",[goal]);

    for (const [table,column,id,minimum] of [
      ['accounts','opening_balance',source,'-999999999.99'],['transfers','amount',transfer,'0.01'],
      ['recurring_transactions','amount',recurring,'0.01'],['budgets','amount',budget,'0.01'],
      ['goals','target_amount',goal,'0.01'],['goals','saved_amount',goal,'0.00'],
    ]) {
      for (const value of ['1.230','1.234','1000000000.00','NaN','Infinity','-Infinity',column==='opening_balance'?'-1000000000.00':'-0.01']) await reject(`UPDATE expense_tracker.${table} SET ${column}=$1 WHERE id=$2`,[value,id]);
      if (column!=='opening_balance' && column!=='saved_amount') await reject(`UPDATE expense_tracker.${table} SET ${column}=0 WHERE id=$1`,[id]);
      for (const value of [minimum,'999999999.99']) check(`${table}.${column} accepts exact boundary`,(await admin.query(`UPDATE expense_tracker.${table} SET ${column}=$1 WHERE id=$2 RETURNING ${column}::text AS value`,[value,id])).rows[0].value,value);
    }
    for (const [table,column,value,id] of [
      ['accounts','type','invalid',source],['accounts','currency','USD',source],['accounts','status','deleted',source],['accounts','name',' padded ',source],
      ['recurring_transactions','frequency','hourly',recurring],['recurring_transactions','status','deleted',recurring],
      ['budgets','month','13',budget],['budgets','year','1899',budget],['budgets','alert_threshold_percent','101',budget],
      ['goals','target_date','1899-12-31',goal],['goals','status','deleted',goal],
      ['recurring_occurrences','status','invalid',occurrence],['recurring_occurrences','failure_code','raw sql detail',occurrence],
    ]) await reject(`UPDATE expense_tracker.${table} SET ${column}=$1 WHERE id=$2`,[value,id]);
    await reject("UPDATE expense_tracker.profiles SET preferred_currency='USD' WHERE user_id=$1",[a]);
    await reject("UPDATE expense_tracker.profiles SET locale='fr' WHERE user_id=$1",[a]);
    await reject("UPDATE expense_tracker.profiles SET timezone='UTC' WHERE user_id=$1",[a]);
    for (const [table,key,id] of [['profiles','user_id',a],['accounts','id',source],['categories','id',category],['transfers','id',transfer],['recurring_transactions','id',recurring],['recurring_occurrences','id',occurrence],['budgets','id',budget],['goals','id',goal]]) {
      const before=(await admin.query(`SELECT created_at::text FROM expense_tracker.${table} WHERE ${key}=$1`,[id])).rows[0];
      const after=(await admin.query(`UPDATE expense_tracker.${table} SET created_at='2000-01-01',updated_at='2000-01-01' WHERE ${key}=$1 RETURNING created_at::text,updated_at > '2000-01-01' AS updated`,[id])).rows[0];
      check(`${table} preserves creation and owns update timestamps`,after,{...before,updated:true});
    }
    await reject('UPDATE expense_tracker.accounts SET id=gen_random_uuid() WHERE id=$1',[source]);
    await reject('DELETE FROM expense_tracker.recurring_occurrences WHERE id=$1',[occurrence],'42501');
    await reject('DELETE FROM expense_tracker.recurring_transactions WHERE id=$1',[recurring],'23503');
    await reject('DELETE FROM expense_tracker.accounts WHERE id=$1',[source],'23503');
    for (const statement of ['CREATE TABLE expense_tracker.forbidden(id int)','ALTER TABLE expense_tracker.accounts ADD COLUMN forbidden int','DROP TABLE expense_tracker.accounts','TRUNCATE expense_tracker.accounts','CREATE ROLE forbidden','SELECT * FROM auth.users','ALTER ROLE expense_tracker_app SUPERUSER','ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write']) await reject(statement,[],'42501');
    for (const role of ['anon','authenticated']) {
      await admin.query('RESET ROLE');await admin.query(`SET LOCAL ROLE ${role}`);
      await reject('SELECT * FROM expense_tracker.accounts',[],'42501');
      await reject('SELECT expense_tracker.set_v2_timestamps()',[],'42501');
    }
    await admin.query('RESET ROLE');
    await reject('DELETE FROM auth.users WHERE id=$1',[a],'23503');
    const tx=(await admin.query("INSERT INTO expense_tracker.transactions(id,type,amount,description,category,transaction_date) VALUES (gen_random_uuid(),'expense',0.01,'Generated-link fixture','food','2026-09-30') RETURNING id")).rows[0].id;
    await admin.query("UPDATE expense_tracker.recurring_occurrences SET status='posted',processed_at=statement_timestamp(),generated_transaction_id=$1 WHERE id=$2",[tx,occurrence]);
    await admin.query('DELETE FROM expense_tracker.transactions WHERE id=$1',[tx]);
    check('deletion preserves posted durable marker', (await admin.query('SELECT status,generated_transaction_id,user_id FROM expense_tracker.recurring_occurrences WHERE id=$1',[occurrence])).rows[0],{status:'posted',generated_transaction_id:null,user_id:a});
    await admin.query('CREATE TABLE expense_tracker.future_privilege_fixture(id int)');
    for(const role of ['anon','authenticated','expense_tracker_app']) check('no default grants to '+role,(await admin.query("SELECT has_table_privilege($1,'expense_tracker.future_privilege_fixture','SELECT') AS allowed",[role])).rows[0].allowed,false);
    await admin.query('ROLLBACK');
    check('test domain writes removed',await rows(),baseline);
    for(const table of tables.filter(t=>t!=='transactions')) check('no seeded '+table,(await admin.query(`SELECT count(*)::int AS count FROM expense_tracker.${table}`)).rows[0].count,0);

    // Exercise the unchanged V1 service SQL as the limited role against the migrated schema.
    await admin.query('BEGIN');await admin.query('SET LOCAL ROLE expense_tracker_app');
    const service=createTransactionService(admin);
    const before=await service.summary();
    const input={type:'expense',category:'food',amount:'0.10',description:'V1 compatibility',date:'2026-09-30'};
    const created=await service.create(input);check('V1 create',created.amount,'0.10');
    check('V1 get',await service.get(created.id),created);
    check('V1 list', (await service.list({type:'expense',category:'food'})).some(r=>r.id===created.id),true);
    const updated=await service.update(created.id,{...input,amount:'0.20'});check('V1 update',updated.amount,'0.20');
    check('V1 created timestamp retained',updated.createdAt,created.createdAt);
    check('V1 delete',await service.delete(created.id),true);check('V1 totals restored',await service.summary(),before);
    await reject("INSERT INTO expense_tracker.transactions(id,type,amount,description,category,transaction_date) VALUES (gen_random_uuid(),'expense',1.230,'Invalid','food','2026-09-30')");
    await reject("INSERT INTO expense_tracker.transactions(id,type,amount,description,category,transaction_date) VALUES (gen_random_uuid(),'expense',0.01,'Invalid','food','2999-01-01')");
    await admin.query('ROLLBACK');
    check('final baseline remains exact',await rows(),baseline);
    return {checks,failures:0,migrations:4,tables:9,legacyRows:baseline.length,transactionalReversal:true,limitedRoleV1CRUD:true};
  } finally {await admin.query('ROLLBACK').catch(()=>{});await admin.end();}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await verifyT11(process.env.T11_DISPOSABLE_DATABASE_URL)));}
  catch(error) {console.error('T11 disposable verification failed:', error instanceof assert.AssertionError ? error.message : error.code || error.name);process.exitCode=1;}
}

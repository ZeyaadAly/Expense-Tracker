import assert from 'node:assert/strict';
import {Client} from 'pg';
const url = new URL(process.env.DISPOSABLE_DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55442');
assert.equal(url.pathname, '/postgres');
const client = new Client({connectionString: url.href});
await client.connect();
let checks = 0;
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); checks++; console.log(`PASS ${name}`); }
try {
  const columns = (await client.query("SELECT column_name,udt_name,is_nullable FROM information_schema.columns WHERE table_schema='expense_tracker' AND table_name='transactions' ORDER BY ordinal_position")).rows;
  check('eight required columns and exact types', columns.map(row => [row.column_name,row.udt_name,row.is_nullable]), [
    ['id','uuid','NO'],['type','text','NO'],['amount','numeric','NO'],['description','text','NO'],
    ['category','text','NO'],['transaction_date','date','NO'],['created_at','timestamptz','NO'],['updated_at','timestamptz','NO'],
  ]);
  check('primary key and six checks', (await client.query("SELECT contype::text AS type,count(*)::int AS count FROM pg_constraint WHERE conrelid='expense_tracker.transactions'::regclass GROUP BY contype ORDER BY contype")).rows, [{type:'c',count:6},{type:'p',count:1}]);
  const indexes = (await client.query("SELECT indexdef FROM pg_indexes WHERE schemaname='expense_tracker' ORDER BY indexname")).rows;
  check('two indexes', indexes.length, 2);
  check('deterministic descending order index', indexes.some(row => /transaction_date DESC, created_at DESC, id DESC/.test(row.indexdef)), true);
  check('single enabled insert/update trigger', (await client.query("SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid='expense_tracker.transactions'::regclass AND NOT tgisinternal AND tgenabled='O' AND tgtype=23")).rows[0].count, 1);
  const fn = (await client.query("SELECT prosecdef,proconfig FROM pg_proc WHERE oid='expense_tracker.validate_transaction_write()'::regprocedure")).rows[0];
  check('trigger is invoker with fixed search path', fn, {prosecdef:false,proconfig:['search_path=pg_catalog']});
  const role = (await client.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='expense_tracker_app'")).rows[0];
  check('limited role attributes', Object.values(role), [false,false,false,false,false,false]);
  check('no role memberships', (await client.query("SELECT count(*)::int AS count FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='expense_tracker_app')")).rows[0].count, 0);
  await client.end();
  url.username='expense_tracker_app'; url.password='';
  const limited = new Client({connectionString:url.href}); await limited.connect();
  try {
    for (const sql of ['CREATE TABLE expense_tracker.forbidden(id int)','TRUNCATE expense_tracker.transactions','ALTER TABLE expense_tracker.transactions ADD COLUMN forbidden int', 'DROP TABLE expense_tracker.transactions', 'CREATE ROLE forbidden', 'CREATE DATABASE forbidden']) {
      await assert.rejects(limited.query(sql), error => error.code === '42501'); checks++; console.log('PASS denied ' + sql.split(' ').slice(0,2).join(' '));
    }
  } finally { await limited.end(); }
  console.log(JSON.stringify({checks,failures:0}));
} finally { await client.end(); }

// Disposable rehearsal only. Not part of automatic migration history or runtime.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const categoryMap = Object.freeze(Object.fromEntries([
  ['salary','Salary','income','c1200000-0000-4000-8000-000000000001'],
  ['freelance','Freelance','income','c1200000-0000-4000-8000-000000000002'],
  ['gift','Gift','income','c1200000-0000-4000-8000-000000000003'],
  ['food','Food','expense','c1200000-0000-4000-8000-000000000004'],
  ['transport','Transport','expense','c1200000-0000-4000-8000-000000000005'],
  ['shopping','Shopping','expense','c1200000-0000-4000-8000-000000000006'],
  ['bills','Bills','expense','c1200000-0000-4000-8000-000000000007'],
  ['entertainment','Entertainment','expense','c1200000-0000-4000-8000-000000000008'],
  ['other','Other','both','c1200000-0000-4000-8000-000000000009'],
].map(([legacy,name,kind,id])=>[legacy,{id,name,kind}])));
const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const otherTables=['transfers','recurring_transactions','recurring_occurrences','budgets','goals'];

export async function assertDisposable(client) {
  const p=client.connectionParameters;
  assert.ok(p.host==='127.0.0.1' && String(p.port)==='55451' && p.database==='postgres' && p.user==='postgres' && !p.password,'REHEARSAL_CONNECTION_REQUIRED');
  assert.equal((await client.query("SELECT marker FROM public.t14_disposable_marker")).rows[0]?.marker,'isolated-t14-rehearsal','REHEARSAL_MARKER_REQUIRED');
}
export async function captureInventory(client) {
  // PostgreSQL text preserves timestamp microseconds and numeric storage scale.
  const rows=(await client.query(`SELECT id,type,category,amount::text AS amount,description,
    transaction_date::text AS date,created_at::text AS created_at,updated_at::text AS updated_at
    FROM expense_tracker.transactions ORDER BY id`)).rows;
  const totals=(await client.query(`SELECT count(*)::int AS count,
    COALESCE(sum(amount) FILTER(WHERE type='income'),0::numeric)::text AS income,
    COALESCE(sum(amount) FILTER(WHERE type='expense'),0::numeric)::text AS expenses,
    COALESCE(sum(CASE WHEN type='income' THEN amount ELSE -amount END),0::numeric)::text AS balance,
    min(amount)::text AS minimum,max(amount)::text AS maximum FROM expense_tracker.transactions`)).rows[0];
  const categoryTotals=(await client.query(`SELECT type,category,sum(amount)::text AS amount,count(*)::int AS count
    FROM expense_tracker.transactions GROUP BY type,category ORDER BY type,category`)).rows;
  return {rows,totals,categoryTotals,digest:digest(rows)};
}
async function unchanged(client,inventory) {
  assert.ok(inventory && Array.isArray(inventory.rows) && inventory.digest===digest(inventory.rows),'INVALID_INVENTORY');
  const actual=await captureInventory(client);
  assert.deepEqual(actual,inventory,'INVENTORY_MISMATCH');
}
async function quietFinancialTables(client) {
  assert.equal((await client.query('SELECT count(*)::int n FROM expense_tracker.categories WHERE NOT is_system')).rows[0].n,0,'V2_WRITES_PRESENT');
  for(const table of otherTables) assert.equal((await client.query(`SELECT count(*)::int n FROM expense_tracker.${table}`)).rows[0].n,0,'V2_WRITES_PRESENT');
}
async function maintenance(client) {
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await client.query("SELECT has_table_privilege('expense_tracker_app','expense_tracker.transactions',$1) ok",[privilege])).rows[0].ok,false,'V1_RUNTIME_ACCESS_NOT_BLOCKED');
}
async function triggerEnabled(client) {
  const result=await client.query(`SELECT tgname,tgenabled,tgfoid::regproc::text AS fn FROM pg_trigger
    WHERE tgrelid='expense_tracker.transactions'::regclass AND NOT tgisinternal ORDER BY tgname`);
  assert.deepEqual(result.rows,[{tgname:'transactions_validate_write',tgenabled:'O',fn:'expense_tracker.validate_transaction_write'}],'UNEXPECTED_TRANSACTION_TRIGGER');
}
export async function ownershipReadiness(client,ownerId,mainAccountId) {
  return (await client.query(`SELECT count(*)::int AS total,
    count(*) FILTER(WHERE t.user_id IS NULL OR t.account_id IS NULL OR t.category_id IS NULL)::int AS missing,
    count(*) FILTER(WHERE t.user_id IS DISTINCT FROM $1::uuid OR t.account_id IS DISTINCT FROM $2::uuid
      OR a.user_id IS DISTINCT FROM t.user_id OR c.id IS NULL OR NOT c.is_system OR c.user_id IS NOT NULL
      OR c.status<>'active' OR (c.kind<>t.type AND c.kind<>'both')
      OR t.recurring_transaction_id IS NOT NULL OR t.recurring_occurrence_date IS NOT NULL)::int AS invalid
    FROM expense_tracker.transactions t LEFT JOIN expense_tracker.accounts a ON a.id=t.account_id
    LEFT JOIN expense_tracker.categories c ON c.id=t.category_id`,[ownerId,mainAccountId])).rows[0];
}
async function validateMigrated(client,ownerId,mainAccountId,inventory) {
  await unchanged(client,inventory);
  assert.deepEqual(await ownershipReadiness(client,ownerId,mainAccountId),{total:inventory.rows.length,missing:0,invalid:0},'OWNERSHIP_NOT_READY');
  const account=(await client.query(`SELECT id,user_id,name,type,opening_balance::text,currency,status,opening_balance_locked
    FROM expense_tracker.accounts WHERE id=$1`,[mainAccountId])).rows[0];
  assert.deepEqual(account,{id:mainAccountId,user_id:ownerId,name:'Main Account',type:'cash',opening_balance:'0.00',currency:'EGP',status:'active',opening_balance_locked:inventory.rows.length>0},'MAIN_ACCOUNT_STATE_CONFLICT');
  const refs=(await client.query('SELECT id,category,category_id FROM expense_tracker.transactions ORDER BY id')).rows;
  assert.ok(refs.every(row=>row.category_id===categoryMap[row.category]?.id),'CATEGORY_MAPPING_MISMATCH');
  const mapped=(await client.query(`SELECT t.type,lower(c.name) AS category,sum(t.amount)::text AS amount,count(*)::int AS count
    FROM expense_tracker.transactions t JOIN expense_tracker.categories c ON c.id=t.category_id
    GROUP BY t.type,c.name ORDER BY t.type,lower(c.name)`)).rows;
  assert.deepEqual(mapped,inventory.categoryTotals,'CATEGORY_TOTALS_MISMATCH');
  const financial=(await client.query(`SELECT (a.opening_balance+
    COALESCE((SELECT sum(CASE WHEN type='income' THEN amount ELSE -amount END) FROM expense_tracker.transactions WHERE account_id=a.id),0))::text AS balance
    FROM expense_tracker.accounts a WHERE id=$1`,[mainAccountId])).rows[0];
  assert.equal(financial.balance,inventory.totals.balance,'ACCOUNT_BALANCE_MISMATCH');
  const ownedTotals=(await client.query(`SELECT
    COALESCE(sum(amount) FILTER(WHERE type='income'),0::numeric)::text AS income,
    COALESCE(sum(amount) FILTER(WHERE type='expense'),0::numeric)::text AS expenses,
    COALESCE(sum(CASE WHEN type='income' THEN amount ELSE -amount END),0::numeric)::text AS net_savings
    FROM expense_tracker.transactions WHERE user_id=$1`,[ownerId])).rows[0];
  assert.deepEqual(ownedTotals,{income:inventory.totals.income,expenses:inventory.totals.expenses,net_savings:inventory.totals.balance},'OWNED_ANALYTICS_TOTALS_MISMATCH');
}
async function begin(client,ownerId,mainAccountId) {
  assert.ok(uuid(ownerId)&&uuid(mainAccountId),'EXPLICIT_CANONICAL_OWNER_ACCOUNT_IDS_REQUIRED');
  await assertDisposable(client);
  await client.query('BEGIN');
  await client.query("SET LOCAL TIME ZONE 'UTC'; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'");
  await client.query(`LOCK TABLE expense_tracker.transactions,expense_tracker.accounts,expense_tracker.categories,
    expense_tracker.profiles,expense_tracker.transfers,expense_tracker.recurring_transactions,
    expense_tracker.recurring_occurrences,expense_tracker.budgets,expense_tracker.goals IN ACCESS EXCLUSIVE MODE`);
  await maintenance(client);await triggerEnabled(client);
}

export async function migrateLegacy(client,{ownerId,mainAccountId,inventory,rollback=false}) {
  try {
    await begin(client,ownerId,mainAccountId);
    assert.equal((await client.query('SELECT count(*)::int n FROM auth.users WHERE id=$1',[ownerId])).rows[0].n,1,'OWNER_MISSING');
    assert.equal((await client.query("SELECT count(*)::int n FROM expense_tracker.profiles WHERE user_id=$1 AND preferred_currency='EGP' AND locale='en' AND timezone='Africa/Cairo'",[ownerId])).rows[0].n,1,'PROFILE_MISSING');
    await quietFinancialTables(client);
    const legacy=(await client.query('SELECT id,type,category,user_id,account_id,category_id,recurring_transaction_id,recurring_occurrence_date FROM expense_tracker.transactions ORDER BY id')).rows;
    for(const row of legacy) {
      assert.ok(Object.hasOwn(categoryMap,row.category),`UNKNOWN_LEGACY_CATEGORY: ${row.category}`);
      const kind=categoryMap[row.category].kind;
      assert.ok(kind==='both'||kind===row.type,'LEGACY_KIND_CONFLICT');
      assert.ok(row.recurring_transaction_id===null&&row.recurring_occurrence_date===null,'UNEXPECTED_RECURRING_HISTORY');
    }
    await unchanged(client,inventory);
    const allNull=legacy.every(r=>r.user_id===null&&r.account_id===null&&r.category_id===null);
    const allMapped=legacy.every(r=>r.user_id===ownerId&&r.account_id===mainAccountId&&r.category_id===categoryMap[r.category].id);
    assert.ok(allNull||allMapped,'OWNERSHIP_CONFLICT');
    for(const target of Object.values(categoryMap)) {
      const row=(await client.query('SELECT name,kind,is_system,user_id,status FROM expense_tracker.categories WHERE id=$1',[target.id])).rows[0];
      assert.deepEqual(row,{name:target.name,kind:target.kind,is_system:true,user_id:null,status:'active'},'SYSTEM_CATEGORY_DRIFT');
    }
    const accounts=(await client.query('SELECT id FROM expense_tracker.accounts')).rows;
    // Reuse requires exact full-inventory ownership AND operator-recorded account ID.
    // An ownerless inventory with any pre-existing account always aborts.
    if(accounts.length) {
      assert.ok(allMapped&&accounts.length===1&&accounts[0].id===mainAccountId,'MAIN_ACCOUNT_COLLISION');
      await validateMigrated(client,ownerId,mainAccountId,inventory);
      await client.query(rollback?'ROLLBACK':'COMMIT');return {status:'already-migrated',changed:0};
    }
    assert.ok(allNull,'OWNERSHIP_CONFLICT');
    await client.query(`INSERT INTO expense_tracker.accounts(id,user_id,name,type,opening_balance,currency,status,opening_balance_locked)
      VALUES($1,$2,'Main Account','cash',0.00,'EGP','active',$3)`,[mainAccountId,ownerId,legacy.length>0]);
    await client.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write');
    const mappings=Object.entries(categoryMap);
    const updated=await client.query(`UPDATE expense_tracker.transactions t SET user_id=$1,account_id=$2,category_id=m.id
      FROM unnest($3::text[],$4::uuid[]) AS m(legacy,id) WHERE t.category=m.legacy`,[ownerId,mainAccountId,mappings.map(([key])=>key),mappings.map(([,value])=>value.id)]);
    assert.equal(updated.rowCount,inventory.rows.length,'BACKFILL_COUNT_MISMATCH');
    await client.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write');
    await triggerEnabled(client);await validateMigrated(client,ownerId,mainAccountId,inventory);
    await client.query(rollback?'ROLLBACK':'COMMIT');return {status:rollback?'rolled-back':'migrated',changed:updated.rowCount};
  } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function rollbackLegacy(client,{ownerId,mainAccountId,inventory}) {
  // Window A only. New fields/rows/domain writes invalidate this compatibility rollback.
  try {
    await begin(client,ownerId,mainAccountId);await quietFinancialTables(client);
    assert.equal((await client.query('SELECT count(*)::int n FROM expense_tracker.accounts')).rows[0].n,1,'V2_WRITES_PRESENT');
    await validateMigrated(client,ownerId,mainAccountId,inventory);
    await client.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write');
    await client.query('UPDATE expense_tracker.transactions SET user_id=NULL,account_id=NULL,category_id=NULL');
    await client.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write');
    await client.query('DELETE FROM expense_tracker.accounts WHERE id=$1',[mainAccountId]);
    await unchanged(client,inventory);await triggerEnabled(client);await client.query('COMMIT');
    return {status:'restored-legacy',count:inventory.rows.length};
  } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
}

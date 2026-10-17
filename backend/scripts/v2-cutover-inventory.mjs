// Read-only cutover evidence helpers. No environment loading or connection fallback.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { captureInventory, categoryMap, ownershipReadiness } from './v2-migration-rehearsal.mjs';
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const cents = value => { assert.match(value, /^-?\d+(?:\.\d{1,2})?$/); const [whole, fraction = ''] = value.replace('-', '').split('.'); return (value.startsWith('-') ? -1n : 1n) * (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))); };
export const money = value => (value < 0n ? '-' : '') + String((value < 0n ? -value : value) / 100n) + '.' + String((value < 0n ? -value : value) % 100n).padStart(2, '0');
export function expectedTotals(rows) { const income = rows.filter(r => r.type === 'income').reduce((n, r) => n + cents(r.amount), 0n), expenses = rows.filter(r => r.type === 'expense').reduce((n, r) => n + cents(r.amount), 0n); return { income: money(income), expenses: money(expenses), balance: money(income - expenses) }; }
export async function captureCatalog(client) {
    const queries = {
        columns: "SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='expense_tracker' ORDER BY table_name,ordinal_position",
        constraints: "SELECT c.relname table_name,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE k.connamespace='expense_tracker'::regnamespace ORDER BY 1,2",
        indexes: "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='expense_tracker' ORDER BY 1,2",
        triggers: "SELECT c.relname table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='expense_tracker'::regnamespace AND NOT t.tgisinternal ORDER BY 1,2",
        functions: "SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.pronamespace='expense_tracker'::regnamespace ORDER BY 1,2",
        privileges: "SELECT table_name,grantee,privilege_type,is_grantable FROM information_schema.table_privileges WHERE table_schema='expense_tracker' ORDER BY 1,2,3",
        schemaPrivileges: "SELECT nspowner::regrole::text owner,nspacl::text acl FROM pg_namespace WHERE nspname='expense_tracker'",
    };
    const catalog = {};
    for (const [key, sql] of Object.entries(queries))
        catalog[key] = (await client.query(sql)).rows;
    return catalog;
}
export async function captureV1Baseline(client) {
    // The caller must freeze writers and use a repeatable snapshot when inventorying
    // a live source. UTC is session-wide so later comparisons keep microseconds.
    await client.query("SET TIME ZONE 'UTC'");
    const inventory = await captureInventory(client), catalog = await captureCatalog(client);
    assert.deepEqual(Object.fromEntries(['income', 'expenses', 'balance'].map(k => [k, money(cents(inventory.totals[k]))])), expectedTotals(inventory.rows));
    return { inventory, catalog, catalogDigest: fingerprint(catalog) };
}
export async function assertCatalogEquivalent(client, actual, expected) {
    // pg_dump reparses CHECK SQL: PostgreSQL can flatten associative AND nodes or
    // normalize array casts. Prove each difference using PostgreSQL's own parser
    // in temporary tables and roll back; never strip parentheses heuristically or
    // rewrite a real application constraint to make a comparison pass.
    const normalized = globalThis.structuredClone(expected), differences = [];
    try {
        await client.query('BEGIN');
        for (let index = 0; index < expected.constraints.length; index++) {
            const old = expected.constraints[index], current = actual.constraints[index];
            assert.ok(current);
            assert.equal(old.conname, current.conname);
            assert.equal(old.table_name, current.table_name);
            if (old.definition === current.definition)
                continue;
            assert.equal(old.contype, 'c', 'NON_CHECK_CATALOG_DRIFT');
            assert.equal(current.contype, 'c');
            assert.match(old.table_name, /^[a-z_]+$/);
            const temporary = 't65_check_parser_' + index;
            await client.query(`CREATE TEMP TABLE ${temporary} (LIKE expense_tracker.${old.table_name}) ON COMMIT DROP`);
            await client.query(`ALTER TABLE pg_temp.${temporary} ADD CONSTRAINT t65_reparsed_check ${old.definition}`);
            const definition = (await client.query('SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2', ['pg_temp.' + temporary, 't65_reparsed_check'])).rows[0].definition;
            assert.equal(definition, current.definition, 'CHECK_REPARSE_DOES_NOT_MATCH_RESTORED_CONSTRAINT');
            normalized.constraints[index].definition = current.definition;
            differences.push(old.table_name + '.' + old.conname);
        }
        assert.deepEqual(actual, normalized, 'CATALOG_DRIFT');
    }
    finally {
        await client.query('ROLLBACK');
    }
    return differences;
}
export async function reconcileMigrated(client, { inventory, ownerId, mainAccountId, allowNewWrites = false }) {
    await client.query("SET TIME ZONE 'UTC'");
    const current = await captureInventory(client), ids = new Set(inventory.rows.map(r => r.id)), original = current.rows.filter(r => ids.has(r.id));
    assert.deepEqual(original, inventory.rows, 'ORIGINAL_FIELD_OR_TIMESTAMP_DRIFT');
    assert.equal(fingerprint(original), inventory.digest, 'ORIGINAL_FINGERPRINT_DRIFT');
    const profile = (await client.query('SELECT preferred_currency,locale,timezone FROM expense_tracker.profiles WHERE user_id=$1', [ownerId])).rows[0];
    assert.deepEqual(profile, { preferred_currency: 'EGP', locale: 'en', timezone: 'Africa/Cairo' }, 'MIGRATION_PROFILE_DEFAULT_DRIFT');
    const account = (await client.query('SELECT id,user_id,name,type,opening_balance::text,currency,status,opening_balance_locked FROM expense_tracker.accounts WHERE id=$1', [mainAccountId])).rows[0];
    assert.ok(account);
    assert.equal(account.user_id, ownerId);
    assert.equal(account.opening_balance, '0.00');
    assert.equal(account.currency, 'EGP');
    assert.equal(account.opening_balance_locked, inventory.rows.length > 0);
    if (!allowNewWrites)
        assert.deepEqual(account, { id: mainAccountId, user_id: ownerId, name: 'Main Account', type: 'cash', opening_balance: '0.00', currency: 'EGP', status: 'active', opening_balance_locked: inventory.rows.length > 0 }, 'MIGRATION_ACCOUNT_DRIFT');
    for (const item of Object.values(categoryMap))
        assert.deepEqual((await client.query('SELECT name,kind,is_system,user_id,status FROM expense_tracker.categories WHERE id=$1', [item.id])).rows[0], { name: item.name, kind: item.kind, is_system: true, user_id: null, status: 'active' }, 'SYSTEM_CATEGORY_DRIFT');
    if (!allowNewWrites) {
        assert.deepEqual(current, inventory, 'FINANCIAL_INVENTORY_DRIFT');
        assert.deepEqual(await ownershipReadiness(client, ownerId, mainAccountId), { total: inventory.rows.length, missing: 0, invalid: 0 });
    }
    const refs = (await client.query('SELECT id,user_id,account_id,category_id,category,recurring_transaction_id,recurring_occurrence_date FROM expense_tracker.transactions WHERE id=ANY($1::uuid[]) ORDER BY id', [[...ids]])).rows;
    assert.equal(refs.length, inventory.rows.length);
    for (const row of refs) {
        assert.equal(row.user_id, ownerId);
        assert.equal(row.account_id, mainAccountId);
        assert.equal(row.category_id, categoryMap[row.category].id);
        assert.equal(row.recurring_transaction_id, null);
        assert.equal(row.recurring_occurrence_date, null);
    }
    return { originalRows: original.length, originalDigest: fingerprint(original), originalTotals: expectedTotals(original), currentTotals: expectedTotals(current.rows), currentRows: current.rows.length };
}
export async function requireWindowA(client, inventory) {
    const checkpoint = (await client.query('SELECT state,write_enabled_at,first_write_at FROM public.t65_rehearsal_checkpoint')).rows;
    assert.equal(checkpoint.length, 1, 'CUTOVER_CHECKPOINT_REQUIRED');
    assert.ok(['S5', 'S6', 'S7'].includes(checkpoint[0].state) && checkpoint[0].write_enabled_at === null && checkpoint[0].first_write_at === null, 'WINDOW_B_BLIND_RESTORE_FORBIDDEN');
    assert.deepEqual(await captureInventory(client), inventory, 'WINDOW_A_INVENTORY_CHANGED');
    for (const table of ['transfers', 'recurring_transactions', 'recurring_occurrences', 'budgets', 'goals'])
        assert.equal((await client.query(`SELECT count(*)::int n FROM expense_tracker.${table}`)).rows[0].n, 0, 'WINDOW_B_ACTIVITY_PRESENT');
    assert.equal((await client.query('SELECT count(*)::int n FROM expense_tracker.accounts')).rows[0].n, 1, 'WINDOW_B_ACTIVITY_PRESENT');
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disposableUrl, explicitUuid, requireEmptyRestoreTarget } from '../scripts/t65-rehearsal-tools.mjs';
import { requireWindowA, expectedTotals } from '../scripts/v2-cutover-inventory.mjs';
import { requireMode } from '../scripts/t65-local-api.mjs';
import { inspectionConfig } from '../scripts/v2-cutover-inspect.mjs';
test('T65 target and mode guards fail before connecting without echoing supplied credentials', () => {
    const password = 'T65_PRIVATE_SENTINEL_NOT_A_REAL_CREDENTIAL';
    for (const value of [undefined, 'postgresql://private_user:' + password + '@remote.invalid:55451/postgres', password, 'postgresql://postgres@127.0.0.1:55451/template1', 'postgresql://postgres@127.0.0.1:55451/postgres?ssl=0'])
        assert.throws(() => disposableUrl(value), error => !error.message.includes(password) && /LOCAL.*TARGET_REQUIRED/.test(error.message));
    assert.equal(disposableUrl('postgresql://postgres@127.0.0.1:55451/postgres').hostname, '127.0.0.1');
    for (const value of [undefined, 'v1', 'auto', ''])
        assert.throws(() => requireMode(value));
    assert.throws(() => explicitUuid('not-a-uuid'));
});
test('T65 Window B is refused from durable write-enable evidence before inventory or restore work', async () => {
    for (const checkpoint of [{ state: 'S8', write_enabled_at: null, first_write_at: null }, { state: 'S7', write_enabled_at: '2026-10-17', first_write_at: null }, { state: 'S7', write_enabled_at: null, first_write_at: '2026-10-17' }]) {
        const calls = [];
        const db = { query: async (sql) => { calls.push(sql); return { rows: [checkpoint] }; } };
        await assert.rejects(requireWindowA(db, {}), /WINDOW_B_BLIND_RESTORE_FORBIDDEN/);
        assert.deepEqual(calls, ['SELECT state,write_enabled_at,first_write_at FROM public.t65_rehearsal_checkpoint']);
    }
});
test('T65 migration oracle keeps sums exact above input limits and across negative positions', () => {
    assert.deepEqual(expectedTotals([{ type: 'income', amount: '999999999.99' }, { type: 'income', amount: '999999999.99' }, { type: 'expense', amount: '0.10' }, { type: 'expense', amount: '0.20' }]), { income: '1999999999.98', expenses: '0.30', balance: '1999999999.68' });
    assert.deepEqual(expectedTotals([{ type: 'income', amount: '0.10' }, { type: 'expense', amount: '0.30' }]), { income: '0.10', expenses: '0.30', balance: '-0.20' });
});
test('T65 operator inspection requires explicit target identity, private output and verified TLS', () => {
    const config = { CUTOVER_INSPECT_ACK: 'READ_ONLY_VERIFIED_TARGET', CUTOVER_INSPECT_DATABASE_URL: 'postgresql://operator@db.example.invalid/postgres', CUTOVER_EXPECTED_HOST: 'db.example.invalid', CUTOVER_EXPECTED_DATABASE: 'postgres', CUTOVER_EXPECTED_USER: 'operator', CUTOVER_SSL_CA_FILE: 'operator-selected-ca', CUTOVER_INSPECT_PHASE: 'inventory', CUTOVER_PRIVATE_INVENTORY_FILE: 'snapshot.private-cutover.json' };
    assert.equal(inspectionConfig(config).phase, 'inventory');
    assert.throws(() => inspectionConfig({ ...config, CUTOVER_EXPECTED_HOST: 'different.invalid' }));
    assert.throws(() => inspectionConfig({ ...config, CUTOVER_SSL_CA_FILE: undefined }));
    assert.throws(() => inspectionConfig({ ...config, CUTOVER_INSPECT_DATABASE_URL: config.CUTOVER_INSPECT_DATABASE_URL + '?ssl=0' }));
    assert.throws(() => inspectionConfig({ ...config, CUTOVER_PRIVATE_INVENTORY_FILE: 'tracked.json' }));
    assert.throws(() => inspectionConfig({ ...config, CUTOVER_LOCAL_DISPOSABLE_DIRECTORY: 'D:/Expense-Tracker/.tmp-v2-t65/pgdata' }));
});
test('T65 restore refuses any application, Auth or history namespace and existing public data', async () => {
    for (const namespace of ['app', 'auth', 'history']) {
        const client = { query: async () => ({ rows: [{ app: null, auth: null, history: null, [namespace]: 'existing' }] }) };
        await assert.rejects(requireEmptyRestoreTarget(client), /EMPTY_RESTORE_TARGET_REQUIRED/);
    }
    const client = { query: async (query) => ({ rows: [query.startsWith('SELECT to_regnamespace') ? { app: null, auth: null, history: null } : { n: 1 }] }) };
    await assert.rejects(requireEmptyRestoreTarget(client), /EMPTY_RESTORE_TARGET_REQUIRED/);
});

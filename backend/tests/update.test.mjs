import process from "node:process";
import { URL } from "node:url";
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { Pool, Client } from 'pg';
import { createApp } from '../dist/app.js';
import { createTransactionService } from '../dist/services/transactions.js';
const id = 'bb664829-eddd-4a27-bddc-076e8c3bf6fe';
const input = { type: 'expense', amount: '0.10', category: 'food', date: '2026-09-30', description: 'Updated' };
async function server(database, run) { const s = createApp({ clientOrigin: 'http://localhost:3000', databaseHealth: async () => true, transactions: createTransactionService(database) }).listen(0, '127.0.0.1'); await once(s, 'listening'); try {
    await run(`http://127.0.0.1:${s.address().port}/api/v1/transactions`);
}
finally {
    s.closeAllConnections();
    await new Promise(r => s.close(r));
} }
const put = body => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test('T09 full replacement rejects invalid fields and UUID without SQL', async () => { let calls = 0; await server({ query: async () => { calls++; throw Error('unexpected'); } }, async (base) => { for (const [path, body] of [[id, {}], [id, { ...input, amount: '1.234' }], [id, { ...input, category: 'salary' }], [id, { ...input, date: '2026-02-30' }], [id, { ...input, description: '' }], [id, { ...input, currency: 'EGP' }], [id, { ...input, type: 'other' }], [id, { ...input, amount: 10 }], ['invalid', input]]) {
    const r = await globalThis.fetch(`${base}/${path}`, put(body));
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.code, 'VALIDATION_ERROR');
} }); assert.equal(calls, 0); });
test('T09 SQL uses parameters and missing update is 404', async () => { await server({ query: async (sql, values) => { assert.match(sql, /UPDATE expense_tracker.transactions/); assert.match(sql, /WHERE id = \$1 RETURNING/); assert.doesNotMatch(sql, /Updated|bb664829/); assert.deepEqual(values, [id, 'expense', '0.10', 'Updated', 'food', '2026-09-30']); return { rows: [] }; } }, async (base) => { const r = await globalThis.fetch(`${base}/${id}`, put(input)); assert.equal(r.status, 404); assert.deepEqual(await r.json(), { error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found.', details: [] } }); }); });
test('T09 database failures sanitized', async () => { for (const [error, status] of [[Object.assign(Error('SQL password hostname'), { code: 'ECONNREFUSED' }), 503], [Error('SQL password hostname'), 500]])
    await server({ query: async () => { throw error; } }, async (base) => { const r = await globalThis.fetch(`${base}/${id}`, put(input)); assert.equal(r.status, status); assert.doesNotMatch(JSON.stringify(await r.json()), /SQL|password|hostname/); }); });
test('T09 disposable PostgreSQL exact updates, timestamps, summary and reconnect', { skip: !process.env.T06_DISPOSABLE_DATABASE_URL }, async () => { const url = new URL(process.env.T06_DISPOSABLE_DATABASE_URL); assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname)); const admin = new Client({ connectionString: url.href }); await admin.connect(); url.username = 'expense_tracker_app'; url.password = ''; const pool = new Pool({ connectionString: url.href }); let record; try {
    const service = createTransactionService(pool);
    record = await service.create(input);
    await server(pool, async (base) => { for (const amount of ['0.10', '0.20', '1000.00', '999999999.99']) {
        const r = await globalThis.fetch(`${base}/${record.id}`, put({ ...input, amount }));
        assert.equal(r.status, 200);
        const saved = (await r.json()).data;
        assert.equal(saved.id, record.id);
        assert.equal(saved.createdAt, record.createdAt);
        assert.notEqual(saved.updatedAt, record.updatedAt);
        assert.equal(saved.amount, amount);
        assert.equal(saved.date, input.date);
        assert.deepEqual((await (await globalThis.fetch(`${base}/${record.id}`)).json()).data, saved);
    } const bad = await globalThis.fetch(`${base}/${record.id}`, put({ ...input, amount: '1.234' })); assert.equal(bad.status, 400); assert.equal((await service.get(record.id)).amount, '999999999.99'); const before = await service.summary(); await service.update(record.id, { ...input, type: 'income', category: 'salary', amount: '0.20' }); const after = await service.summary(); assert.equal(after.transactionCount, before.transactionCount); assert.notEqual(after.balance, before.balance); });
    const reconnect = new Client({ connectionString: url.href });
    await reconnect.connect();
    try {
        assert.equal((await reconnect.query('SELECT amount::text AS amount FROM expense_tracker.transactions WHERE id=$1', [record.id])).rows[0].amount, '0.20');
    }
    finally {
        await reconnect.end();
    }
}
finally {
    if (record)
        await admin.query('DELETE FROM expense_tracker.transactions WHERE id=$1', [record.id]);
    await pool.end();
    await admin.end();
} });

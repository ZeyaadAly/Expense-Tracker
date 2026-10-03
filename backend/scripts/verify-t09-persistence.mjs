import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createTransactionService } from '../dist/services/transactions.js';
const url = new URL(process.env.T09_DISPOSABLE_DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55439');
url.username = 'expense_tracker_app';
url.password = '';
const pool = new Pool({ connectionString: url.href });
const service = createTransactionService(pool);
const file = new URL('../../.tmp-t09/restart.json', import.meta.url);
try {
    if (process.argv[2] === 'prepare') {
        const record = await service.create({ type: 'expense', category: 'food', amount: '0.10', description: 'T09 restart persistence', date: '2026-09-30' });
        const updated = await service.update(record.id, { type: 'income', category: 'salary', amount: '0.20', description: 'T09 persisted edit', date: '2026-09-29' });
        assert.equal(updated.id, record.id);
        assert.equal(updated.createdAt, record.createdAt);
        assert.notEqual(updated.updatedAt, record.updatedAt);
        writeFileSync(file, JSON.stringify({ record: updated, summary: await service.summary() }));
        console.log('Prepared confirmed persisted update');
    }
    else {
        const before = JSON.parse(readFileSync(file, 'utf8'));
        assert.deepEqual(await service.get(before.record.id), before.record);
        assert.deepEqual(await service.summary(), before.summary);
        console.log('PASS updated record, timestamps, money, date and summary unchanged across PostgreSQL restart');
    }
}
finally {
    await pool.end();
}

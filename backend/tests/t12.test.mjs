import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import process from 'node:process';
import {URL} from 'node:url';
import {Client, Pool} from 'pg';
import {createApp} from '../dist/app.js';
import {createTransactionService} from '../dist/services/transactions.js';
import {cairoToday} from '../dist/validators/transaction.js';

test('T12 exact money POST/PUT/GET, unrestricted totals and live Cairo date boundaries', {
  skip: !process.env.T06_DISPOSABLE_DATABASE_URL && 'Requires explicit disposable PostgreSQL',
}, async () => {
  const url = new URL(process.env.T06_DISPOSABLE_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/postgres');
  const admin = new Client({connectionString: url.href});
  await admin.connect();
  url.username = 'expense_tracker_app'; url.password = '';
  const pool = new Pool({connectionString: url.href});
  const server = createApp({clientOrigin: 'http://localhost:3000', databaseHealth: async () => true,
    transactions: createTransactionService(pool)}).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const input = {type: 'income', category: 'other', amount: '0.01', description: 'T12 exact', date: '1900-01-01'};
  async function request(path, method = 'GET', body) {
    const response = await globalThis.fetch(base + path, {method, ...(body ? {
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
    } : {})});
    return {status: response.status, body: await response.json()};
  }
  try {
    // Keep disposable reset compatible with the T11 occurrence FK.
    await admin.query('DELETE FROM expense_tracker.transactions');
    for (const amount of ['0.01', '0.10', '0.20', '0.30', '1.00', '1000.00', '999999999.99']) {
      const created = await request('/transactions', 'POST', {...input, amount});
      assert.equal(created.status, 201);
      assert.equal(created.body.data.amount, amount);
      assert.equal(created.body.data.date, input.date);
      const path = `/transactions/${created.body.data.id}`;
      assert.deepEqual((await request(path)).body, created.body);
      const updated = await request(path, 'PUT', {...input, amount, description: 'T12 edited exact'});
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.amount, amount);
      assert.equal(updated.body.data.createdAt, created.body.data.createdAt);
      assert.deepEqual((await request(path)).body, updated.body);
    }
    assert.deepEqual((await request('/summary')).body.data, {
      totalIncome: '1000001001.60', totalExpenses: '0.00', balance: '1000001001.60',
      currency: 'EGP', transactionCount: 7, scope: 'all',
    });
    const today = cairoToday(new Date());
    assert.equal((await request('/transactions', 'POST', {...input, date: today})).status, 201);
    const tomorrow = new Date(`${today}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    for (const date of [tomorrow.toISOString().slice(0, 10), '1899-12-31', '1900-02-29', '2026-04-31']) {
      assert.equal((await request('/transactions', 'POST', {...input, date})).status, 400);
    }
    assert.equal((await request('/summary')).body.data.transactionCount, 8);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await pool.end(); await admin.end();
  }
});

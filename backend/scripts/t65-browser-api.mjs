// Reopen only the completed T65 local target for read-only financial UI smoke.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { root, disposableUrl, connect, assertIdentity, explicitUuid } from './t65-rehearsal-tools.mjs';
import { createLocalApi } from './t65-local-api.mjs';
const url = disposableUrl(process.env.T65_DISPOSABLE_DATABASE_URL), state = JSON.parse(readFileSync(resolve(root, 'private-runtime.json'), 'utf8'));
explicitUuid(state.ownerId);
explicitUuid(state.mainAccountId);
assert.equal(realpathSync(state.dataDirectory), realpathSync(resolve(root, 'run-2/cutover/pgdata')));
const admin = await connect(url);
await assertIdentity(admin, state.dataDirectory);
assert.ok((await admin.query('SELECT first_write_at FROM public.t65_rehearsal_checkpoint')).rows[0].first_write_at);
await admin.end();
const pool = new Pool({ host: '127.0.0.1', port: 55451, database: 'postgres', user: 'expense_tracker_app', password: state.password, max: 5, connectionTimeoutMillis: 5000 });
pool.on('error', () => { });
const api = await createLocalApi({ pool, ownerId: state.ownerId, mode: 'controlled', port: 4000, jwksPort: 4001, exposeSessions: true });
console.log('T65 loopback migrated API ready; financial writes blocked');
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, async () => { await api.close(); await pool.end(); process.exit(0); });

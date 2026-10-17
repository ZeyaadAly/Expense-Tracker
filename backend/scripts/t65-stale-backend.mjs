// Local stale-deployment specimen. No application dotenv or production config.
import assert from 'node:assert/strict';
import process from 'node:process';
import { once } from 'node:events';
import { Pool } from 'pg';
import { createApp } from '../dist/app.js';
import { createTransactionService } from '../dist/services/transactions.js';
let pool, server;
process.on('message', async (message) => {
    if (message?.action === 'start') {
        assert.equal(message.ack, 'T65_LOCAL_STALE_SPECIMEN');
        assert.ok(typeof message.password === 'string' && message.password.length >= 32);
        assert.equal(pool, undefined);
        pool = new Pool({ host: '127.0.0.1', port: 55451, database: 'postgres', user: 'expense_tracker_app', password: message.password, max: 2, connectionTimeoutMillis: 3000 });
        pool.on('error', () => { });
        // Deliberately represents the old unauthenticated V1 entry, independently of
        // the current production entry's maintenance/retirement configuration.
        server = createApp({ clientOrigin: 'http://localhost:3000', databaseHealth: async () => true, transactions: createTransactionService(pool) }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        process.send({ ready: true, origin: 'http://127.0.0.1:' + server.address().port, pid: process.pid });
    }
    else if (message?.action === 'stop') {
        if (server) {
            server.closeAllConnections();
            await new Promise(r => server.close(r));
        }
        if (pool)
            await pool.end();
        process.exit(0);
    }
});

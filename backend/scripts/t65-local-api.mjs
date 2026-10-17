// Synthetic loopback Auth + the real application. Never imported by production.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { createApp } from '../dist/app.js';
import { createProfileService } from '../dist/services/profiles.js';
import { createCategoryService } from '../dist/services/categories.js';
import { createAccountService } from '../dist/services/accounts.js';
import { createV2TransactionService } from '../dist/services/v2-transactions.js';
import { createTransferService } from '../dist/services/transfers.js';
import { createRecurringService } from '../dist/services/recurring.js';
import { createDashboardService } from '../dist/services/dashboard.js';
import { createAnalyticsService } from '../dist/services/analytics.js';
import { createBudgetService } from '../dist/services/budgets.js';
import { createGoalService } from '../dist/services/goals.js';
export function requireMode(mode) { assert.ok(['maintenance', 'controlled', 'write-enabled'].includes(mode), 'EXPLICIT_CUTOVER_MODE_REQUIRED'); return mode; }
export async function createLocalApi({ pool, ownerId, mode, port = 0, jwksPort = 0, exposeSessions = false }) {
    assert.ok(pool.options.host === '127.0.0.1' && pool.options.port === 55451 && pool.options.database === 'postgres' && pool.options.user === 'expense_tracker_app', 'LOCAL_RUNTIME_POOL_REQUIRED');
    requireMode(mode);
    let state = mode;
    const pair = await generateKeyPair('ES256'), key = { ...await exportJWK(pair.publicKey), kid: 't65-local', alg: 'ES256', use: 'sig' };
    const jwks = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ keys: [key] })); }).listen(jwksPort, '127.0.0.1');
    await once(jwks, 'listening');
    const issuer = 'http://127.0.0.1:' + jwks.address().port, secret = randomBytes(32).toString('hex'), now = () => new Date('2026-10-17T09:00:00Z');
    const options = { clientOrigin: 'http://localhost:3000', databaseHealth: async () => {
            try {
                return (await pool.query('SELECT current_user role')).rows[0].role === 'expense_tracker_app';
            }
            catch {
                return false;
            }
        }, supabaseUrl: issuer, profiles: createProfileService(pool), categories: createCategoryService(pool), categoryManagement: true, accounts: createAccountService(pool), v2Transactions: createV2TransactionService(pool, { cursorSigningSecret: secret }), transfers: createTransferService(pool, { cursorSigningSecret: secret }), recurring: createRecurringService(pool, { now }), dashboard: createDashboardService(pool, { now }), analytics: createAnalyticsService(pool), budgets: createBudgetService(pool), goals: createGoalService(pool) };
    const maintenance = createApp({ ...options, financialMode: 'maintenance' }), retired = createApp({ ...options, financialMode: 'v2' }), app = express();
    async function token(userId) { return new SignJWT({ sub: userId, role: 'authenticated', user_metadata: { ownerId: 'b6500000-0000-4000-8000-000000000001' } }).setProtectedHeader({ alg: 'ES256', kid: key.kid }).setIssuer(issuer + '/auth/v1').setAudience('authenticated').setExpirationTime('2h').sign(pair.privateKey); }
    if (exposeSessions)
        app.get('/test/session', async (_req, res) => { const time = Math.floor(Date.now() / 1000); res.set('Cache-Control', 'no-store').json({ access_token: await token(ownerId), refresh_token: 'synthetic-local-only', token_type: 'bearer', expires_in: 7200, expires_at: time + 7200, user: { id: ownerId, email: 'migration@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-17T00:00:00Z' } }); });
    app.use((req, res, next) => {
        requireMode(state);
        if (state === 'maintenance')
            return maintenance(req, res, next);
        if (state === 'controlled' && req.path.startsWith('/api/v2/') && !req.path.startsWith('/api/v2/profile') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method))
            return res.set('Cache-Control', 'no-store').status(503).json({ error: { code: 'MAINTENANCE', message: 'Financial writes are not enabled.', details: [] } });
        return retired(req, res, next);
    });
    const server = app.listen(port, '127.0.0.1');
    await once(server, 'listening');
    return { origin: 'http://127.0.0.1:' + server.address().port, token, setMode(value, ack) {
            requireMode(value);
            if (value === 'write-enabled')
                assert.equal(ack, 'LOCAL_CONTROLLED_WRITE_ENABLE');
            state = value;
        }, async close() {
            for (const s of [server, jwks]) {
                s.closeAllConnections();
                await new Promise(r => s.close(r));
            }
        } };
}

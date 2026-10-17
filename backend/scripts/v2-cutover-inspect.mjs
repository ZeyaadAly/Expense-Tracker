// Operator-prepared READ-ONLY inventory/reconciliation. No dotenv or default
// target. T65 invokes this only against its explicitly checked disposable DB.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { Client } from 'pg';
import { captureV1Baseline, reconcileMigrated } from './v2-cutover-inventory.mjs';
import { root, explicitUuid, ownedPath } from './t65-rehearsal-tools.mjs';
export function inspectionConfig(env) {
    assert.ok(env.CUTOVER_INSPECT_ACK === 'READ_ONLY_VERIFIED_TARGET', 'EXPLICIT_READ_ONLY_ACK_REQUIRED');
    let url;
    try {
        url = new URL(env.CUTOVER_INSPECT_DATABASE_URL ?? '');
    }
    catch {
        throw Error('EXPLICIT_INSPECTION_TARGET_REQUIRED');
    }
    assert.ok(['postgresql:', 'postgres:'].includes(url.protocol) && url.hostname === env.CUTOVER_EXPECTED_HOST && url.pathname === '/' + env.CUTOVER_EXPECTED_DATABASE && decodeURIComponent(url.username) === env.CUTOVER_EXPECTED_USER && !url.hash, 'VERIFIED_INSPECTION_TARGET_REQUIRED');
    assert.ok(![...url.searchParams.keys()].some(k => k.toLowerCase().startsWith('ssl') || k.toLowerCase() === 'uselibpqcompat'), 'EXPLICIT_TLS_CONFIG_REQUIRED');
    const local = env.CUTOVER_LOCAL_DISPOSABLE_DIRECTORY;
    if (local) {
        assert.ok(url.hostname === '127.0.0.1' && url.port === '55451' && url.pathname === '/postgres' && url.username === 'postgres' && !url.password && !url.search, 'DISPOSABLE_PLAINTEXT_ONLY');
        ownedPath(local);
        assert.ok(resolve(local).startsWith(root));
    }
    else
        assert.ok(env.CUTOVER_SSL_CA_FILE, 'VERIFIED_CA_FILE_REQUIRED');
    assert.ok(['inventory', 'reconcile'].includes(env.CUTOVER_INSPECT_PHASE), 'EXPLICIT_INSPECTION_PHASE_REQUIRED');
    assert.ok(env.CUTOVER_PRIVATE_INVENTORY_FILE?.endsWith('.private-cutover.json'), 'PRIVATE_IGNORED_INVENTORY_FILE_REQUIRED');
    return { url, local, file: resolve(env.CUTOVER_PRIVATE_INVENTORY_FILE), phase: env.CUTOVER_INSPECT_PHASE, caFile: env.CUTOVER_SSL_CA_FILE };
}
export async function inspect(env) {
    const config = inspectionConfig(env), client = new Client({ connectionString: config.url.href, ssl: config.local ? false : { rejectUnauthorized: true, ca: readFileSync(config.caFile, 'utf8') }, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
        const identity = (await client.query('SELECT current_database() db,current_user role')).rows[0];
        assert.ok(identity.db === env.CUTOVER_EXPECTED_DATABASE && identity.role === env.CUTOVER_EXPECTED_USER, 'DATABASE_IDENTITY_MISMATCH');
        if (config.local)
            assert.equal(realpathSync((await client.query('SHOW data_directory')).rows[0].data_directory), realpathSync(config.local));
        else
            assert.ok(client.connection.stream.encrypted === true && client.connection.stream.authorized === true, 'VERIFIED_CLIENT_TLS_REQUIRED');
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s'");
        if (config.phase === 'inventory') {
            const baseline = await captureV1Baseline(client);
            writeFileSync(config.file, JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            await client.query('COMMIT');
            return { phase: 'inventory', rows: baseline.inventory.totals.count, totals: baseline.inventory.totals, digest: baseline.inventory.digest, catalogDigest: baseline.catalogDigest, readOnly: true };
        }
        const baseline = JSON.parse(readFileSync(config.file, 'utf8')), ownerId = explicitUuid(env.CUTOVER_MIGRATION_OWNER_ID), mainAccountId = explicitUuid(env.CUTOVER_MAIN_ACCOUNT_ID), allowNewWrites = env.CUTOVER_POST_WRITE_POLICY === 'PRESERVE_AND_RECONCILE';
        const result = await reconcileMigrated(client, { inventory: baseline.inventory, ownerId, mainAccountId, allowNewWrites });
        await client.query('COMMIT');
        return { ...result, phase: 'reconcile', readOnly: true };
    }
    finally {
        await client.query('ROLLBACK').catch(() => { });
        await client.end();
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        console.log(JSON.stringify(await inspect(process.env)));
    }
    catch {
        console.error('Read-only cutover inspection refused or failed; no connection details emitted.');
        process.exitCode = 1;
    }
}

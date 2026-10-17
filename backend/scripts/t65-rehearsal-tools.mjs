// Local-only process/database helpers. No dotenv, DATABASE_URL or hosted fallback.
import assert from 'node:assert/strict';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, rmSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep, basename, isAbsolute } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { Client } from 'pg';
import { requireWindowA } from './v2-cutover-inventory.mjs';
export const workspace = fileURLToPath(new URL('../../', import.meta.url));
export const root = resolve(workspace, '.tmp-v2-t65');
export const migrations = readdirSync(resolve(workspace, 'supabase/migrations')).filter(f => /^\d{14}_.+\.sql$/.test(f)).sort();
export const ownershipIndex = migrations.findIndex(f => f.endsWith('_v2_ownership_constraints.sql'));
assert.ok(ownershipIndex > 1 && migrations.some(f => f.endsWith('_v2_occurrence_invariants.sql')), 'CURRENT_MIGRATION_CHAIN_REQUIRED');
export const sql = file => readFileSync(resolve(workspace, 'supabase', file), 'utf8');
export function disposableUrl(value) {
    let url;
    try {
        url = new URL(value || '');
    }
    catch {
        throw Error('EXPLICIT_LOCAL_TARGET_REQUIRED');
    }
    assert.ok(url.protocol === 'postgresql:' && url.hostname === '127.0.0.1' && url.port === '55451' && url.pathname === '/postgres' && url.username === 'postgres' && !url.password && !url.search && !url.hash, 'LOCAL_PASSWORD_FREE_TARGET_REQUIRED');
    return url;
}
export function explicitUuid(value) { assert.match(value ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'EXPLICIT_SYNTHETIC_UUID_REQUIRED'); return value; }
export function ownedPath(path) { const absolute = resolve(path), rel = relative(root, absolute); assert.ok(rel && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel), 'TASK_OWNED_PATH_REQUIRED'); assert.ok(absolute.startsWith(root + sep)); return absolute; }
export function command(executable, args, { env = {}, allowFailure = false, stdio = 'pipe' } = {}) {
    // Inherit system execution essentials, but never libpq/provider credential or
    // target variables. Every libpq target is a separately validated fixed flag.
    const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG|DATABASE|BACKUP|MIGRATION|SUPABASE|CURSOR|CRON|T\d+_/.test(key)));
    const result = spawnSync(executable, args, { env: { ...childEnv, PGCONNECT_TIMEOUT: '5', ...env }, stdio, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    if (!allowFailure)
        assert.equal(result.status, 0, basename(executable) + ' failed; no command arguments or database output emitted');
    return result;
}
export function tools() {
    const server = realpathSync(process.env.T65_PG_BIN ?? ''), client = realpathSync(process.env.T65_CLIENT_BIN ?? '');
    const versions = {};
    for (const name of ['pg_dump', 'pg_restore', 'psql']) {
        const text = command(resolve(client, name + '.exe'), ['--version']).stdout.trim();
        assert.match(text, /PostgreSQL\) 17\./);
        versions[name] = text;
    }
    return { server, client, versions };
}
export async function connect(url) { const client = new Client({ connectionString: url.href ?? url }); await client.connect(); await client.query("SET TIME ZONE 'UTC'"); return client; }
export async function assertIdentity(client, directory) { assert.equal(realpathSync((await client.query('SHOW data_directory')).rows[0].data_directory), realpathSync(ownedPath(directory))); assert.equal((await client.query('SELECT current_database() db,current_user role')).rows[0].db, 'postgres'); assert.equal(client.connectionParameters.host, '127.0.0.1'); assert.equal(String(client.connectionParameters.port), '55451'); }
export function initCluster(directory, bin) { const data = ownedPath(resolve(directory, 'pgdata')); assert.ok(!existsSync(data), 'FRESH_CLUSTER_REQUIRED'); mkdirSync(directory, { recursive: true }); assert.ok(realpathSync(directory).startsWith(realpathSync(root) + sep), 'REAL_TASK_PATH_REQUIRED'); const r = command(resolve(bin, 'initdb.exe'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C']); writeFileSync(resolve(directory, 'init.log'), r.stdout + r.stderr); writeFileSync(resolve(data, 'pg_hba.conf'), 'host all expense_tracker_app 127.0.0.1/32 scram-sha-256\nhost all all 127.0.0.1/32 trust\n'); return data; }
export function startCluster(data, bin) { ownedPath(data); command(resolve(bin, 'pg_ctl.exe'), ['-D', data, '-l', resolve(data, '../postgres.log'), '-o', '-h 127.0.0.1 -p 55451', 'start'], { stdio: 'ignore' }); }
export function stopCluster(data, bin) {
    ownedPath(data);
    if (existsSync(resolve(data, 'postmaster.pid')))
        command(resolve(bin, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', 'stop']);
}
export function removeStoppedCluster(data) { const path = ownedPath(data); assert.ok(realpathSync(path).startsWith(realpathSync(root) + sep), 'REAL_TASK_PATH_REQUIRED'); assert.equal(basename(path), 'pgdata'); assert.ok(existsSync(resolve(path, 'PG_VERSION')) && !existsSync(resolve(path, 'postmaster.pid')), 'STOPPED_TASK_CLUSTER_REQUIRED'); rmSync(path, { recursive: true }); }
export async function prerequisites(client, { runtime = false } = {}) {
    assert.equal((await client.query("SELECT to_regnamespace('expense_tracker')::text app")).rows[0].app, null, 'EMPTY_TARGET_REQUIRED');
    if (runtime) {
        const role = sql('migrations/' + migrations.find(f => f.endsWith('_backend_application_role.sql'))).match(/CREATE ROLE expense_tracker_app[\s\S]*?;/)?.[0];
        assert.ok(role);
        await client.query(role);
    }
    await client.query('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN');
}
export async function createSourcePrerequisites(client, ownerId) {
    await prerequisites(client);
    await client.query("CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);REVOKE ALL ON SCHEMA auth FROM PUBLIC;REVOKE ALL ON auth.users FROM PUBLIC;CREATE TABLE public.t14_disposable_marker(marker text PRIMARY KEY);INSERT INTO public.t14_disposable_marker VALUES('isolated-t14-rehearsal');CREATE TABLE public.t65_rehearsal_checkpoint(state text NOT NULL,write_enabled_at timestamptz,first_write_at timestamptz);INSERT INTO public.t65_rehearsal_checkpoint(state) VALUES('S0');CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text NOT NULL,statements text[] NOT NULL)");
    await client.query('INSERT INTO auth.users(id) VALUES($1)', [ownerId]);
}
export async function setPassword(client, password) { assert.ok(password.length >= 32); const ddl = (await client.query("SELECT format('ALTER ROLE expense_tracker_app PASSWORD %L',$1::text) ddl", [password])).rows[0].ddl; await client.query(ddl); }
export const suspendDml = client => client.query('REVOKE SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA expense_tracker FROM expense_tracker_app');
export async function restoreDml(client) {
    const file = migrations.find(f => f.endsWith('_v2_runtime_privileges.sql')), grants = sql('migrations/' + file).match(/^GRANT SELECT,[\s\S]*?TO expense_tracker_app;/gm);
    assert.equal(grants?.length, 2, 'REVIEW_CHANGED_RUNTIME_GRANTS');
    for (const grant of grants)
        await client.query(grant);
}
export async function applyMigration(client, file, { maintenance = false, before, after } = {}) {
    assert.ok(migrations.includes(file));
    const text = sql('migrations/' + file), body = text.replace(/^\s*BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');
    assert.notEqual(text, body);
    const version = file.slice(0, 14), name = file.slice(15, -4);
    assert.equal((await client.query('SELECT count(*)::int n FROM supabase_migrations.schema_migrations WHERE version=$1', [version])).rows[0].n, 0, 'MIGRATION_ALREADY_RECORDED');
    try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s'");
        if (before)
            await before(client);
        await client.query(body);
        if (after)
            await after(client);
        if (maintenance)
            await suspendDml(client);
        await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [version, name, [text]]);
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
const flags = ['-h', '127.0.0.1', '-p', '55451', '-U', 'postgres'];
export function backup(clientBin, file) { ownedPath(file); assert.ok(!existsSync(file), 'BACKUP_ALREADY_EXISTS'); const r = command(resolve(clientBin, 'pg_dump.exe'), [...flags, '--dbname=postgres', '--format=custom', '--file=' + file]); assert.equal(r.stderr.trim(), '', 'BACKUP_WARNINGS_REQUIRE_REVIEW'); return inspectBackup(clientBin, file); }
export function inspectBackup(clientBin, file) {
    ownedPath(file);
    assert.ok(existsSync(file), 'BACKUP_MISSING');
    const bytes = readFileSync(file);
    assert.ok(bytes.length > 0);
    const r = command(resolve(clientBin, 'pg_restore.exe'), ['--list', file]);
    for (const item of ['SCHEMA - expense_tracker', 'TABLE expense_tracker transactions', 'TABLE DATA expense_tracker transactions', 'INDEX expense_tracker transactions_order_idx', 'TRIGGER expense_tracker transactions transactions_validate_write'])
        assert.ok(r.stdout.includes(item), 'BACKUP_OBJECT_MISSING: ' + item);
    return { file: relative(root, file).replaceAll('\\', '/'), bytes: statSync(file).size, sha256: createHash('sha256').update(bytes).digest('hex'), tocEntries: r.stdout.split(/\r?\n/).filter(l => /^\d+;/.test(l)).length };
}
export async function restoreBackup(client, clientBin, file, expected, { safetyClient, inventory } = {}) {
    if (safetyClient)
        await requireWindowA(safetyClient, inventory);
    const actual = inspectBackup(clientBin, file);
    assert.equal(actual.sha256, expected.sha256, 'BACKUP_CHECKSUM_MISMATCH');
    await requireEmptyRestoreTarget(client);
    command(resolve(clientBin, 'pg_restore.exe'), [...flags, '--dbname=postgres', '--exit-on-error', '--single-transaction', '--no-owner', file]);
}
export async function requireEmptyRestoreTarget(client) {
    assert.deepEqual((await client.query("SELECT to_regnamespace('expense_tracker')::text app,to_regnamespace('auth')::text auth,to_regnamespace('supabase_migrations')::text history")).rows[0], { app: null, auth: null, history: null }, 'EMPTY_RESTORE_TARGET_REQUIRED');
    assert.equal((await client.query("SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v','m','S')")).rows[0].n, 0, 'EMPTY_RESTORE_TARGET_REQUIRED');
}
export function psql(clientBin, query) { return command(resolve(clientBin, 'psql.exe'), [...flags, '--dbname=postgres', '-X', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', query]).stdout.trim(); }

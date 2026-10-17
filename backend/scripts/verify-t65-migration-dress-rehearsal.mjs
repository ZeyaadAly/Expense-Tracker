// Full local cutover. Every destructive operation is restricted to freshly
// created task-owned clusters; no dotenv, hosted URL or production credentials.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { randomBytes, createHash } from 'node:crypto';
import { Client, Pool } from 'pg';
import { createProfileService } from '../dist/services/profiles.js';
import { createAccountBalanceRepository } from '../dist/services/account-balances.js';
import { createTransactionService } from '../dist/services/transactions.js';
import { migrateLegacy, captureInventory, ownershipReadiness, categoryMap } from './v2-migration-rehearsal.mjs';
import { captureCatalog, captureV1Baseline, assertCatalogEquivalent, reconcileMigrated, expectedTotals, fingerprint, cents, money, requireWindowA } from './v2-cutover-inventory.mjs';
import { workspace, root, migrations, ownershipIndex, sql, disposableUrl, explicitUuid, tools, connect, assertIdentity, initCluster, startCluster, stopCluster, removeStoppedCluster, prerequisites, createSourcePrerequisites, setPassword, suspendDml, restoreDml, applyMigration, backup, inspectBackup, restoreBackup, psql } from './t65-rehearsal-tools.mjs';
import { createLocalApi, requireMode } from './t65-local-api.mjs';
const url = disposableUrl(process.env.T65_DISPOSABLE_DATABASE_URL), ownerId = explicitUuid(process.env.T65_MIGRATION_OWNER_ID), mainAccountId = explicitUuid(process.env.T65_MAIN_ACCOUNT_ID), bins = tools();
assert.equal(process.env.T65_ACK, 'LOCAL_DISPOSABLE_ONLY');
assert.notEqual(ownerId, mainAccountId);
mkdirSync(root, { recursive: true });
const resultFile = resolve(root, 'result.json');
assert.ok(!existsSync(resultFile), 'FRESH_REHEARSAL_OUTPUT_REQUIRED');
const result = { date: '2026-10-17', sourceSha: process.env.T65_SOURCE_SHA, tools: bins.versions, migrations: migrations.map(file => ({ file, sha256: createHash('sha256').update(sql('migrations/' + file)).digest('hex') })), runs: [], remoteTouched: false, cronEnabled: false, productionGatesChanged: false };
const fixedNow = '2026-10-17', otherOwner = 'b6500000-0000-4000-8000-000000000001';
assert.notEqual(ownerId, otherOwner);
let currentData = null, admin = null, api = null, stale = null, profilePool = null, runtime = null, activeGroup = 'preflight';
const secrets = [];
const save = () => writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n');
const cleanMessage = e => secrets.reduce((text, secret) => text.replaceAll(secret, '<redacted>'), String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g, '<database-url>'));
async function group(run, name, work) { activeGroup = name; const started = performance.now(), value = await work(); run.groups.push({ name, passed: true, durationMs: Math.round(performance.now() - started) }); save(); console.log('PASS ' + run.name + ' ' + name); return value; }
async function stop() {
    if (api) {
        await api.close();
        api = null;
    }
    if (stale) {
        stale.send({ action: 'stop' });
        await once(stale, 'exit');
        stale = null;
    }
    for (const pool of [profilePool, runtime])
        if (pool)
            await pool.end();
    profilePool = runtime = null;
    if (admin) {
        await admin.end();
        admin = null;
    }
    if (currentData) {
        stopCluster(currentData, bins.server);
        currentData = null;
    }
}
async function open(data) { assert.equal(currentData, null); startCluster(data, bins.server); currentData = data; admin = await connect(url); await assertIdentity(admin, data); }
function runtimePool(password) { const pool = new Pool({ host: '127.0.0.1', port: 55451, user: 'expense_tracker_app', database: 'postgres', password, max: 5, connectionTimeoutMillis: 5000 }); pool.on('error', () => { }); return pool; }
async function startStale(password) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(DATABASE|BACKUP|MIGRATION|SUPABASE|CURSOR|CRON|^PG)/.test(key)));
    const child = fork(fileURLToPath(new URL('./t65-stale-backend.mjs', import.meta.url)), [], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    child.stdout.on('data', () => { });
    child.stderr.on('data', () => { });
    const ready = once(child, 'message');
    child.send({ action: 'start', ack: 'T65_LOCAL_STALE_SPECIMEN', password });
    const [message] = await ready;
    assert.equal(message.ready, true);
    stale = child;
    return message;
}
async function request(origin, path, method = 'GET', body, token) { const r = await globalThis.fetch(origin + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const value = r.status === 204 ? null : await r.json(); return { status: r.status, body: value, cache: r.headers.get('cache-control') }; }
async function privateRequest(token, path, method = 'GET', body, status = 200) { const r = await request(api.origin, '/api/v2' + path, method, body, token); assert.equal(r.status, status, method + ' ' + path); assert.equal(r.cache, 'no-store'); return r.body; }
const financialPaths = id => [['/transactions', 'GET'], ['/transactions/' + id, 'GET'], ['/summary', 'GET'], ['/transactions', 'POST', { type: 'expense', amount: '0.01', description: 'Stale probe', category: 'other', date: '2026-10-15' }], ['/transactions/' + id, 'PUT', { type: 'expense', amount: '0.01', description: 'Stale probe', category: 'other', date: '2026-10-15' }], ['/transactions/' + id, 'DELETE']];
async function deniedLegacy(origin, id, status) {
    for (const [path, method, body] of financialPaths(id)) {
        const r = await request(origin, '/api/v1' + path, method, body);
        if (status)
            assert.equal(r.status, status);
        else
            assert.ok(r.status >= 400);
        assert.equal(Object.hasOwn(r.body, 'data'), false);
        assert.equal(r.cache, 'no-store');
        assert.ok(!/password|SELECT |INSERT |postgresql:|stack/.test(JSON.stringify(r.body)));
    }
}
async function state(value) { assert.match(value, /^S[0-8]$/); await admin.query('UPDATE public.t65_rehearsal_checkpoint SET state=$1', [value]); }
async function snapshot() { return { financial: await fullFinancialSnapshot(admin), catalog: await captureCatalog(admin), history: (await admin.query('SELECT * FROM supabase_migrations.schema_migrations ORDER BY version')).rows }; }
async function fullFinancialSnapshot(client) {
    const data = {};
    for (const table of ['profiles', 'accounts', 'categories', 'transactions', 'transfers', 'recurring_transactions', 'recurring_occurrences', 'budgets', 'goals'])
        data[table] = (await client.query(`SELECT to_jsonb(t)::text row FROM expense_tracker.${table} t ORDER BY to_jsonb(t)::text`)).rows;
    return data;
}
async function rejectUnchanged(work, pattern) { const before = await snapshot(); await assert.rejects(work, e => pattern.test(e.message)); assert.deepEqual(await snapshot(), before); }
function fixtures() { const kinds = ['salary', 'freelance', 'gift', 'other', 'food', 'transport', 'shopping', 'bills', 'entertainment', 'other'], amounts = ['999999999.99', '0.10', '0.20', '0.30', '0.01', '100.00', '0.10', '1.23', '0.99', '0.20'], dates = ['1900-01-01', '2000-02-29', '2024-02-29', '2025-12-31', '2026-01-01', '2026-09-30', '2026-10-01', '2026-10-15']; return Array.from({ length: 510 }, (_, n) => ({ id: 'd6500000-0000-4000-8000-' + String(n + 1).padStart(12, '0'), type: n % 10 < 4 ? 'income' : 'expense', category: kinds[n % 10], amount: amounts[n % 10], description: 'T65 V1 retained ' + String(n).padStart(3, '0') + ' ' + kinds[n % 10] + ' القاهرة 😀 literal %_! quote\' slash\\' + (n === 509 ? ' ' + '.'.repeat(65) : ''), date: dates[n % dates.length], created_at: '2001-03-01 12:34:56.' + String(n + 1).padStart(6, '0') + '+00', updated_at: '2002-03-01 01:02:03.' + String(999999 - n).padStart(6, '0') + '+00' })); }
async function makeSource(data, password) {
    await open(data);
    await createSourcePrerequisites(admin, ownerId);
    for (const file of migrations.slice(0, 2))
        await applyMigration(admin, file);
    await setPassword(admin, password);
    await admin.query('BEGIN;ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write');
    for (const row of fixtures())
        await admin.query('INSERT INTO expense_tracker.transactions(id,type,amount,description,category,transaction_date,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [row.id, row.type, row.amount, row.description, row.category, row.date, row.created_at, row.updated_at]);
    await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write;COMMIT');
}
async function ensureProfile(password) { profilePool = runtimePool(password); await admin.query('GRANT SELECT,INSERT,UPDATE ON expense_tracker.profiles TO expense_tracker_app'); const profile = await createProfileService(profilePool).ensureProfile(ownerId); assert.deepEqual([profile.userId, profile.displayName, profile.preferredCurrency, profile.locale, profile.timezone], [ownerId, null, 'EGP', 'en', 'Africa/Cairo']); await assert.rejects(profilePool.query('SELECT * FROM auth.users'), e => e.code === '42501'); await profilePool.end(); profilePool = null; }
async function assertPrivateRoles() {
    const flags = (await admin.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='expense_tracker_app'")).rows[0];
    assert.ok(Object.values(flags).every(v => v === false));
    assert.equal((await admin.query("SELECT has_schema_privilege('expense_tracker_app','expense_tracker','CREATE') ok")).rows[0].ok, false);
    for (const role of ['anon', 'authenticated']) {
        assert.equal((await admin.query("SELECT has_schema_privilege($1,'expense_tracker','USAGE') ok", [role])).rows[0].ok, false);
        for (const table of ['transactions', 'accounts', 'categories', 'profiles', 'transfers', 'recurring_transactions', 'recurring_occurrences', 'budgets', 'goals'])
            for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
                assert.equal((await admin.query('SELECT has_table_privilege($1,$2,$3) ok', [role, 'expense_tracker.' + table, privilege])).rows[0].ok, false);
    }
    for (const role of ['anon', 'authenticated'])
        for (const fn of (await admin.query("SELECT oid::regprocedure::text signature FROM pg_proc WHERE pronamespace='expense_tracker'::regnamespace")).rows)
            assert.equal((await admin.query('SELECT has_function_privilege($1,$2,$3) ok', [role, fn.signature, 'EXECUTE'])).rows[0].ok, false);
    assert.equal((await admin.query("SELECT count(*)::int n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='expense_tracker_app')")).rows[0].n, 0);
    return flags;
}
async function verifyReadApis(run, inventory, token) {
    const totals = expectedTotals(inventory.rows), list = (await privateRequest(token, '/accounts')).data;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, mainAccountId);
    assert.equal(list[0].currentBalance, totals.balance);
    assert.equal(list[0].openingBalance, '0.00');
    assert.equal(list[0].openingBalanceEditable, false);
    assert.equal((await privateRequest(token, '/accounts/' + mainAccountId)).data.currentBalance, totals.balance);
    assert.equal((await privateRequest(token, '/accounts/' + mainAccountId + '/summary')).data.currentBalance, totals.balance);
    assert.equal((await privateRequest(token, '/accounts/summary')).data.netPosition, totals.balance);
    let cursor = null, rows = [];
    do {
        const page = await privateRequest(token, '/transactions?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        rows.push(...page.data);
        cursor = page.meta.nextCursor;
    } while (cursor);
    assert.equal(rows.length, inventory.rows.length);
    const byId = new Map(rows.map(r => [r.id, r]));
    for (const old of inventory.rows) {
        const row = byId.get(old.id);
        assert.ok(row);
        for (const key of ['id', 'type', 'amount', 'description', 'date'])
            assert.equal(row[key], old[key]);
        assert.equal(row.accountId, mainAccountId);
        assert.equal(row.categoryId, categoryMap[old.category].id);
        assert.equal(row.recurringTransactionId, null);
    }
    for (const old of inventory.rows.filter((_, i) => i % 63 === 0)) {
        const row = (await privateRequest(token, '/transactions/' + old.id)).data;
        assert.equal(row.description, old.description);
        assert.equal(row.amount, old.amount);
    }
    const escaped = await privateRequest(token, '/transactions?q=' + encodeURIComponent('%_!') + '&limit=100');
    assert.equal(escaped.data.length, 100);
    for (const row of escaped.data)
        assert.ok(row.description.includes('%_!'));
    const filtered = await privateRequest(token, '/transactions?type=expense&accountId=' + mainAccountId + '&categoryId=' + categoryMap.food.id + '&limit=100');
    assert.equal(filtered.data.length, inventory.rows.filter(r => r.category === 'food').length);
    const dashboard = (await privateRequest(token, '/dashboard?period=this_month')).data, month = expectedTotals(inventory.rows.filter(r => r.date >= '2026-10-01' && r.date <= fixedNow));
    assert.equal(dashboard.summary.income, month.income);
    assert.equal(dashboard.summary.expenses, month.expenses);
    assert.equal(dashboard.summary.netSavings, month.balance);
    assert.equal(dashboard.summary.totalBalance, totals.balance);
    let analyticsIncome = 0n, analyticsExpenses = 0n;
    for (const year of ['1900', '2000', '2024', '2025', '2026']) {
        const data = (await privateRequest(token, `/analytics/overview?from=${year}-01-01&to=${year}-12-31`)).data, expected = expectedTotals(inventory.rows.filter(r => r.date.startsWith(year)));
        assert.equal(data.summary.income, expected.income);
        assert.equal(data.summary.expenses, expected.expenses);
        assert.equal(data.summary.netSavings, expected.balance);
        analyticsIncome += cents(data.summary.income);
        analyticsExpenses += cents(data.summary.expenses);
        for (const [type, field] of [['income', 'incomeByCategory'], ['expense', 'expenseByCategory']]) {
            const groups = new Map();
            for (const row of inventory.rows.filter(r => r.date.startsWith(year) && r.type === type))
                groups.set(categoryMap[row.category].id, (groups.get(categoryMap[row.category].id) ?? 0n) + cents(row.amount));
            assert.equal(data[field].length, groups.size);
            for (const category of data[field])
                assert.equal(category.amount, money(groups.get(category.categoryId)));
        }
    }
    assert.equal(money(analyticsIncome), totals.income);
    assert.equal(money(analyticsExpenses), totals.expenses);
    run.apiBaseline = { rowsRead: rows.length, detailReads: inventory.rows.filter((_, i) => i % 63 === 0).length, analyticsWindows: 5, dashboardMonth: month, allHistory: totals };
    for (const path of ['/transfers', '/recurring', '/budgets?year=2026&month=10', '/goals'])
        assert.deepEqual((await privateRequest(token, path)).data, []);
}
try {
    for (const round of [1, 2]) {
        const run = { name: 'rehearsal-' + round, groups: [], stateTransitions: [] };
        result.runs.push(run);
        const dir = resolve(root, 'run-' + round);
        mkdirSync(dir, { recursive: true });
        const oldPassword = randomBytes(32).toString('hex'), newPassword = randomBytes(32).toString('hex');
        secrets.push(oldPassword, newPassword);
        const clusters = {};
        for (const name of ['source', 'restore', 'cutover', 'window-a'])
            clusters[name] = initCluster(resolve(dir, name), bins.server);
        let baseline, archive;
        const file = resolve(dir, 'pre-v2.dump');
        await group(run, 'target, owner and explicit mode guards', async () => {
            for (const value of [undefined, 'postgresql://postgres@remote.invalid:55451/postgres', 'postgresql://postgres@127.0.0.1:55451/template1', 'postgresql://postgres@127.0.0.1:55451/postgres?ssl=0'])
                assert.throws(() => disposableUrl(value));
            for (const id of [undefined, 'not-a-uuid', 'A6500000-0000-4000-8000-000000000001'])
                assert.throws(() => explicitUuid(id));
            for (const value of [undefined, '', 'v1', 'auto'])
                assert.throws(() => requireMode(value));
        });
        await group(run, 'deterministic actual V1 source and immutable inventory', async () => { await makeSource(clusters.source, oldPassword); baseline = await captureV1Baseline(admin); assert.equal(baseline.inventory.rows.length, 510); assert.deepEqual(expectedTotals(fixtures()), expectedTotals(baseline.inventory.rows)); assert.equal(psql(bins.client, "SELECT count(*) FROM expense_tracker.transactions"), '510'); run.baseline = { ...baseline.inventory.totals, rowDigest: baseline.inventory.digest, catalogDigest: baseline.catalogDigest, categoryTotals: baseline.inventory.categoryTotals, objects: Object.fromEntries(Object.entries(baseline.catalog).map(([k, v]) => [k, v.length])) }; writeFileSync(resolve(dir, 'private-v1-inventory.json'), JSON.stringify(baseline, null, 2)); });
        await group(run, 'real pg_dump archive, TOC and checksum', async () => { archive = backup(bins.client, file); run.backup = archive; assert.equal((await captureV1Baseline(admin)).inventory.digest, baseline.inventory.digest); });
        await stop();
        await group(run, 'independent empty-target restore and exact V1 equality', async () => { await open(clusters.restore); await prerequisites(admin, { runtime: true }); await restoreBackup(admin, bins.client, file, archive); const restored = await captureV1Baseline(admin); assert.deepEqual(restored.inventory, baseline.inventory); run.restoreCatalogReparseProof = await assertCatalogEquivalent(admin, restored.catalog, baseline.catalog); assert.equal((await admin.query("SELECT count(*)::int n FROM pg_class WHERE relnamespace='expense_tracker'::regnamespace AND relkind='S'")).rows[0].n, 0); run.restore = { exactRows: true, exactCatalog: true, checksum: archive.sha256, noSequencesRequired: true }; });
        await stop();
        await group(run, 'backup missing, corrupt and checksum mismatch guards', async () => { assert.throws(() => inspectBackup(bins.client, resolve(dir, 'missing.dump')), /BACKUP_MISSING/); const corrupt = resolve(dir, 'corrupt.dump'); writeFileSync(corrupt, 'not a PostgreSQL archive'); assert.throws(() => inspectBackup(bins.client, corrupt)); await open(clusters.cutover); await prerequisites(admin, { runtime: true }); await assert.rejects(restoreBackup(admin, bins.client, file, { ...archive, sha256: '0'.repeat(64) }), /BACKUP_CHECKSUM_MISMATCH/); assert.equal((await admin.query("SELECT to_regnamespace('expense_tracker')::text n")).rows[0].n, null); await restoreBackup(admin, bins.client, file, archive); await assert.rejects(restoreBackup(admin, bins.client, file, archive), /EMPTY_RESTORE_TARGET_REQUIRED/); await setPassword(admin, oldPassword); });
        const input = { ownerId, mainAccountId, inventory: baseline.inventory }, sample = baseline.inventory.rows[0].id;
        let oldOrigin;
        await group(run, 'real stale V1 process understands preserved baseline', async () => { const old = await startStale(oldPassword); oldOrigin = old.origin; run.staleSpecimen = { separateProcess: true, pid: old.pid, sameDatabaseRole: true }; const list = await request(oldOrigin, '/api/v1/transactions'); assert.equal(list.status, 200); assert.equal(list.body.data.length, 510); const detail = await request(oldOrigin, '/api/v1/transactions/' + sample); assert.equal(detail.body.data.id, sample); const summary = (await request(oldOrigin, '/api/v1/summary')).body.data; assert.deepEqual([summary.totalIncome, summary.totalExpenses, summary.balance], [baseline.inventory.totals.income, baseline.inventory.totals.expenses, baseline.inventory.totals.balance]); });
        await group(run, 'S2 actual all-financial maintenance and stale DML revocation', async () => {
            await suspendDml(admin);
            await state('S2');
            runtime = runtimePool(oldPassword);
            api = await createLocalApi({ pool: runtime, ownerId, mode: 'maintenance' });
            await deniedLegacy(api.origin, sample, 503);
            for (const path of ['/api/v1/health', '/api/v2/health'])
                assert.equal((await request(api.origin, path)).status, 200);
            for (const [path, method] of [['/api/v2/accounts', 'GET'], ['/api/v2/accounts', 'POST'], ['/internal/recurring/process', 'GET']])
                assert.equal((await request(api.origin, path, method)).status, 503);
            await deniedLegacy(oldOrigin, sample);
            for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
                assert.equal((await admin.query("SELECT has_table_privilege('expense_tracker_app','expense_tracker.transactions',$1) ok", [privilege])).rows[0].ok, false);
            assert.deepEqual(await captureInventory(admin), baseline.inventory);
            run.stateTransitions.push('S0', 'S1 backup verified', 'S2 maintenance and old DML suspended');
        });
        await group(run, 'ordered additive migrations with atomic maintenance revocation', async () => {
            for (const migration of migrations.slice(2, ownershipIndex)) {
                await applyMigration(admin, migration, { maintenance: true });
                for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
                    assert.equal((await admin.query("SELECT has_table_privilege('expense_tracker_app','expense_tracker.transactions',$1) ok", [p])).rows[0].ok, false);
            }
            assert.deepEqual(await captureInventory(admin), baseline.inventory);
            await state('S3');
            run.stateTransitions.push('S3 additive schema');
        });
        await group(run, 'repeatable fixed T12 seed and T13 owner/profile', async () => { await admin.query(sql('seeds/v2-system-categories.sql')); const categories = (await admin.query('SELECT * FROM expense_tracker.categories ORDER BY id')).rows; await admin.query(sql('seeds/v2-system-categories.sql')); assert.deepEqual((await admin.query('SELECT * FROM expense_tracker.categories ORDER BY id')).rows, categories); assert.equal(categories.length, 9); await rejectUnchanged(() => migrateLegacy(admin, { ...input, ownerId: otherOwner }), /OWNER_MISSING/); await rejectUnchanged(() => migrateLegacy(admin, input), /PROFILE_MISSING/); await ensureProfile(oldPassword); });
        await group(run, 'wrong inventory, account collision, seed drift and owner faults', async () => { await rejectUnchanged(() => migrateLegacy(admin, { ...input, inventory: { ...input.inventory, totals: { ...input.inventory.totals, count: 999 } } }), /INVENTORY_MISMATCH/); await admin.query("INSERT INTO expense_tracker.accounts(id,user_id,name,type) VALUES($1,$2,'Main Account','cash')", [mainAccountId, ownerId]); await rejectUnchanged(() => migrateLegacy(admin, input), /MAIN_ACCOUNT_COLLISION/); await admin.query('DELETE FROM expense_tracker.accounts WHERE id=$1', [mainAccountId]); await admin.query("UPDATE expense_tracker.categories SET name='Drifted salary' WHERE id=$1", [categoryMap.salary.id]); await rejectUnchanged(() => migrateLegacy(admin, input), /SYSTEM_CATEGORY_DRIFT/); await admin.query("UPDATE expense_tracker.categories SET name='Salary' WHERE id=$1", [categoryMap.salary.id]); await admin.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write'); await admin.query('UPDATE expense_tracker.transactions SET user_id=$1 WHERE id=$2', [ownerId, sample]); await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write'); await rejectUnchanged(() => migrateLegacy(admin, input), /OWNERSHIP_CONFLICT/); await admin.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write'); await admin.query('UPDATE expense_tracker.transactions SET user_id=NULL WHERE id=$1', [sample]); await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write'); });
        await group(run, 'conflicting foreign owner is never reassigned', async () => { const conflict = 'c6500000-0000-4000-8000-000000000001'; await admin.query('INSERT INTO auth.users(id) VALUES($1)', [conflict]); await admin.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write'); await admin.query('UPDATE expense_tracker.transactions SET user_id=$1 WHERE id=$2', [conflict, sample]); await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write'); await rejectUnchanged(() => migrateLegacy(admin, input), /OWNERSHIP_CONFLICT/); await admin.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write'); await admin.query('UPDATE expense_tracker.transactions SET user_id=NULL WHERE id=$1', [sample]); await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write'); });
        await group(run, 'unknown legacy category aborts without partial backfill', async () => { const definition = (await admin.query("SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='expense_tracker.transactions'::regclass AND conname='transactions_category_check'")).rows[0].def; await admin.query('ALTER TABLE expense_tracker.transactions DROP CONSTRAINT transactions_category_check;ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write'); await admin.query("UPDATE expense_tracker.transactions SET category='unknown_fixture' WHERE id=$1", [sample]); await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write'); await rejectUnchanged(async () => migrateLegacy(admin, { ...input, inventory: await captureInventory(admin) }), /UNKNOWN_LEGACY_CATEGORY/); await admin.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write'); await admin.query('UPDATE expense_tracker.transactions SET category=$1 WHERE id=$2', [baseline.inventory.rows[0].category, sample]); await admin.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write;ALTER TABLE expense_tracker.transactions ADD CONSTRAINT transactions_category_check ' + definition); });
        await group(run, 'mid-backfill failure restores exact rows, Main Account and trigger', async () => {
            const fault = { connectionParameters: admin.connectionParameters, query: async (...args) => {
                    const r = await admin.query(...args);
                    if (typeof args[0] === 'string' && args[0].startsWith('UPDATE expense_tracker.transactions t SET'))
                        throw Error('T65_INJECTED_BACKFILL_FAILURE');
                    return r;
                } };
            await rejectUnchanged(() => migrateLegacy(fault, input), /T65_INJECTED_BACKFILL_FAILURE/);
            assert.equal((await admin.query('SELECT count(*)::int n FROM expense_tracker.accounts')).rows[0].n, 0);
        });
        await group(run, 'exactly-once T14 backfill and idempotent rerun', async () => { assert.deepEqual(await migrateLegacy(admin, input), { status: 'migrated', changed: 510 }); const mapped = await snapshot(); assert.deepEqual(await migrateLegacy(admin, input), { status: 'already-migrated', changed: 0 }); assert.deepEqual(await snapshot(), mapped); run.reconciliation = await reconcileMigrated(admin, input); assert.deepEqual(await ownershipReadiness(admin, ownerId, mainAccountId), { total: 510, missing: 0, invalid: 0 }); await state('S4'); run.stateTransitions.push('S4 backfill reconciled'); });
        await group(run, 'T15 preflight failure and mid-DDL rollback leave no partial constraints', async () => { const file = migrations[ownershipIndex]; await rejectUnchanged(() => applyMigration(admin, file, { maintenance: true, before: async (c) => { await c.query('ALTER TABLE expense_tracker.transactions DISABLE TRIGGER transactions_validate_write'); await c.query('UPDATE expense_tracker.transactions SET user_id=NULL WHERE id=$1', [sample]); await c.query('ALTER TABLE expense_tracker.transactions ENABLE TRIGGER transactions_validate_write'); } }), /T15_PREFLIGHT/); await rejectUnchanged(() => applyMigration(admin, file, { maintenance: true, after: c => c.query('SELECT 1/0') }), /division by zero/); });
        await group(run, 'tracked T15/T32 target constraints and history integrity', async () => {
            for (const file of migrations.slice(ownershipIndex))
                await applyMigration(admin, file, { maintenance: true });
            assert.equal((await admin.query("SELECT count(*)::int n FROM pg_constraint WHERE connamespace='expense_tracker'::regnamespace AND NOT convalidated")).rows[0].n, 0);
            assert.equal((await admin.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='expense_tracker' AND table_name='transactions' AND column_name IN ('user_id','account_id','category_id') AND is_nullable='NO'")).rows[0].n, 3);
            const history = (await admin.query('SELECT version,name,statements FROM supabase_migrations.schema_migrations ORDER BY version')).rows;
            assert.deepEqual(history, migrations.map(file => ({ version: file.slice(0, 14), name: file.slice(15, -4), statements: [sql('migrations/' + file)] })));
            await reconcileMigrated(admin, input);
            await state('S5');
            await requireWindowA(admin, input.inventory);
            run.stateTransitions.push('S5 constraints complete; no financial V2 writes');
            run.targetCatalogCounts = Object.fromEntries(Object.entries(await captureCatalog(admin)).map(([k, v]) => [k, v.length]));
        });
        await group(run, 'legacy format still readable only inside isolated revoked-role probe', async () => { await admin.query('BEGIN;GRANT SELECT ON expense_tracker.transactions TO expense_tracker_app;SET LOCAL ROLE expense_tracker_app'); const compatibility = createTransactionService(admin), legacy = await compatibility.get(sample); assert.equal((await compatibility.list({})).length, 510); const totals = await compatibility.summary(); assert.equal(totals.balance, baseline.inventory.totals.balance); assert.equal(legacy.id, sample); assert.equal(legacy.description, baseline.inventory.rows[0].description); await admin.query('ROLLBACK'); await deniedLegacy(oldOrigin, sample); });
        await group(run, 'Window A guard accepts exact constrained pre-write state', () => requireWindowA(admin, baseline.inventory));
        await stop();
        await group(run, 'Window A full verified backup restore to a separate clean target', async () => { await open(clusters['window-a']); await prerequisites(admin, { runtime: true }); await restoreBackup(admin, bins.client, file, archive); const restored = await captureV1Baseline(admin); assert.deepEqual(restored.inventory, baseline.inventory); await assertCatalogEquivalent(admin, restored.catalog, baseline.catalog); assert.equal((await admin.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='expense_tracker'")).rows[0].n, 1); assert.equal((await admin.query('SELECT count(*)::int n FROM auth.users WHERE id=$1', [ownerId])).rows[0].n, 1); await setPassword(admin, oldPassword); const old = await startStale(oldPassword), example = { type: 'expense', amount: '0.01', description: 'Window A restored V1 behavior', category: 'other', date: '2026-10-15' }, created = await request(old.origin, '/api/v1/transactions', 'POST', example); assert.equal(created.status, 201); assert.equal((await request(old.origin, '/api/v1/transactions/' + created.body.data.id, 'PUT', { ...example, amount: '0.10' })).status, 200); assert.equal((await request(old.origin, '/api/v1/transactions/' + created.body.data.id, 'DELETE')).status, 204); assert.deepEqual((await captureV1Baseline(admin)).inventory, baseline.inventory); await assertCatalogEquivalent(admin, await captureCatalog(admin), baseline.catalog); run.windowA = { backupRestore: true, originalFingerprint: baseline.inventory.digest, noV2FinancialTables: true, v1Crud: true, syntheticAuthOwnerPreserved: true }; });
        await stop();
        await open(clusters.cutover);
        await group(run, 'same-role stale credential retirement before V2 DML regrant', async () => { await suspendDml(admin); const old = await startStale(oldPassword); oldOrigin = old.origin; await deniedLegacy(oldOrigin, sample); const held = new Client({ host: '127.0.0.1', port: 55451, user: 'expense_tracker_app', database: 'postgres', password: oldPassword }); held.on('error', () => { }); await held.connect(); await assert.rejects(held.query('SELECT * FROM expense_tracker.transactions'), e => e.code === '42501'); await setPassword(admin, newPassword); const killed = (await admin.query("SELECT pg_terminate_backend(pid) terminated FROM pg_stat_activity WHERE usename='expense_tracker_app' AND pid<>pg_backend_pid()")).rows; assert.ok(killed.length > 0); await held.end(); await restoreDml(admin); runtime = runtimePool(newPassword); assert.equal((await runtime.query('SELECT current_user role')).rows[0].role, 'expense_tracker_app'); await deniedLegacy(oldOrigin, sample); const bad = new Client({ host: '127.0.0.1', port: 55451, user: 'expense_tracker_app', database: 'postgres', password: oldPassword, connectionTimeoutMillis: 3000 }); await assert.rejects(bad.connect(), e => e.code === '28P01'); await bad.end(); run.staleSpecimen = { ...run.staleSpecimen, afterRegrantDenied: true, oldSessionsTerminated: killed.length, oldCredentialRejected: true, roleSplit: false }; await state('S6'); run.stateTransitions.push('S6 V1 retired; stale sessions/config neutralized'); });
        await group(run, 'current V2 grants and browser/DDL/Auth denials', async () => {
            run.runtimeFlags = await assertPrivateRoles();
            for (const statement of ['CREATE TABLE expense_tracker.denied(id int)', 'TRUNCATE expense_tracker.transactions', 'ALTER TABLE expense_tracker.transactions DISABLE TRIGGER ALL', 'CREATE ROLE t65_denied', 'SET ROLE postgres', 'SELECT * FROM auth.users'])
                await assert.rejects(runtime.query(statement), e => e.code === '42501');
            assert.equal((await admin.query("SELECT has_table_privilege('expense_tracker_app','expense_tracker.recurring_occurrences','DELETE') ok")).rows[0].ok, false);
        });
        let token;
        await group(run, 'S7 V2 read acceptance with financial writes and cron still blocked', async () => { api = await createLocalApi({ pool: runtime, ownerId, mode: 'controlled' }); token = await api.token(ownerId); assert.equal((await privateRequest(token, '/profile')).data.userId, ownerId); assert.equal((await privateRequest(token, '/categories')).data.length, 9); await deniedLegacy(api.origin, sample, 410); await privateRequest(token, '/accounts', 'POST', { name: 'Premature write', type: 'cash', currency: 'EGP', openingBalance: '0.00' }, 503); assert.equal((await request(api.origin, '/internal/recurring/process')).status, 404); await verifyReadApis(run, baseline.inventory, token); await state('S7'); await requireWindowA(admin, baseline.inventory); run.stateTransitions.push('S7 controlled read acceptance; write gate closed'); });
        await group(run, 'second synthetic user sees empty migrated financial dataset', async () => {
            await admin.query('INSERT INTO auth.users(id) VALUES($1)', [otherOwner]);
            const other = await api.token(otherOwner);
            await privateRequest(other, '/profile/bootstrap', 'POST', {}, 200);
            assert.deepEqual((await privateRequest(other, '/accounts')).data, []);
            assert.deepEqual((await privateRequest(other, '/transactions')).data, []);
            assert.deepEqual((await privateRequest(other, '/recurring')).data, []);
            assert.equal((await privateRequest(other, '/dashboard')).data.summary.totalBalance, '0.00');
            for (const path of ['/transactions/' + sample, '/accounts/' + mainAccountId, '/accounts/' + mainAccountId + '/summary', '/analytics/overview?from=2026-10-01&to=2026-10-17&accountId=' + mainAccountId])
                await privateRequest(other, path, 'GET', undefined, 404);
        });
        let newTransaction, secondAccount;
        await group(run, 'explicit S8 write-enable and first genuine V2 financial write', async () => { await requireWindowA(admin, baseline.inventory); await state('S8'); await admin.query('UPDATE public.t65_rehearsal_checkpoint SET write_enabled_at=clock_timestamp()'); api.setMode('write-enabled', 'LOCAL_CONTROLLED_WRITE_ENABLE'); newTransaction = (await privateRequest(token, '/transactions', 'POST', { accountId: mainAccountId, categoryId: categoryMap.food.id, type: 'expense', amount: '0.01', description: 'T65 controlled V2 expense', date: fixedNow }, 201)).data; await admin.query('UPDATE public.t65_rehearsal_checkpoint SET first_write_at=(SELECT created_at FROM expense_tracker.transactions WHERE id=$1)', [newTransaction.id]); const checkpoint = (await admin.query("SELECT state,to_char(write_enabled_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') enabled,to_char(first_write_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') first_write FROM public.t65_rehearsal_checkpoint")).rows[0]; run.writeCheckpoint = checkpoint; run.stateTransitions.push('S8 explicit write enable; first V2 transaction committed'); assert.equal((await privateRequest(token, '/accounts/' + mainAccountId)).data.currentBalance, money(cents(baseline.inventory.totals.balance) - 1n)); assert.ok(!baseline.inventory.rows.some(r => r.id === newTransaction.id)); });
        await group(run, 'new mutation timestamps and permanently locked Main Account', async () => { const first = (await admin.query("SELECT created_at::text,updated_at::text FROM expense_tracker.transactions WHERE id=$1", [newTransaction.id])).rows[0]; await privateRequest(token, '/transactions/' + newTransaction.id, 'PUT', { accountId: mainAccountId, categoryId: categoryMap.food.id, type: 'expense', amount: '0.01', description: 'T65 controlled V2 expense updated', date: fixedNow }); const after = (await admin.query('SELECT created_at::text,updated_at::text FROM expense_tracker.transactions WHERE id=$1', [newTransaction.id])).rows[0]; assert.equal(after.created_at, first.created_at); assert.notEqual(after.updated_at, first.updated_at); await privateRequest(token, '/accounts/' + mainAccountId, 'PUT', { name: 'Main Account', type: 'credit_card', openingBalance: '0.00' }, 409); await privateRequest(token, '/accounts/' + mainAccountId, 'PUT', { name: 'Main Account', type: 'cash', openingBalance: '0.01' }, 409); await reconcileMigrated(admin, { ...input, allowNewWrites: true }); });
        await group(run, 'post-cutover transfers, recurring, Budget and Goal remain coherent', async () => { secondAccount = (await privateRequest(token, '/accounts', 'POST', { name: 'T65 secondary account', type: 'cash', currency: 'EGP', openingBalance: '0.00' }, 201)).data; const before = (await privateRequest(token, '/accounts/summary')).data.netPosition; await privateRequest(token, '/transfers', 'POST', { sourceAccountId: mainAccountId, destinationAccountId: secondAccount.id, amount: '0.10', description: 'T65 neutral transfer', date: fixedNow }, 201); assert.equal((await privateRequest(token, '/accounts/summary')).data.netPosition, before); assert.equal((await privateRequest(token, '/accounts/' + secondAccount.id)).data.currentBalance, '0.10'); const recurring = (await privateRequest(token, '/recurring', 'POST', { accountId: mainAccountId, categoryId: categoryMap.food.id, type: 'expense', amount: '0.20', description: 'T65 unprocessed recurring', frequency: 'monthly', startDate: fixedNow }, 201)).data; assert.ok(recurring.id); const budget = (await privateRequest(token, '/budgets', 'POST', { categoryId: categoryMap.food.id, year: 2026, month: 10, amount: '100.00', alertThresholdPercent: 90 }, 201)).data, expectedSpent = baseline.inventory.rows.filter(r => r.category === 'food' && r.date >= '2026-10-01').reduce((n, r) => n + cents(r.amount), 1n); assert.equal(budget.spent, money(expectedSpent)); await privateRequest(token, '/goals', 'POST', { name: 'T65 independent Goal', targetAmount: '100.00', savedAmount: '0.10', targetDate: null, linkedAccountId: secondAccount.id }, 201); assert.equal((await privateRequest(token, '/accounts/summary')).data.netPosition, before); assert.equal((await admin.query('SELECT count(*)::int n FROM expense_tracker.recurring_occurrences')).rows[0].n, 0); assert.equal((await admin.query('SELECT count(*)::int n FROM expense_tracker.transactions')).rows[0].n, 511); });
        await group(run, 'post-write T59 isolation, ownership constraints and T60 ledger reconciliation', async () => {
            const other = await api.token(otherOwner);
            await privateRequest(other, '/transactions/' + newTransaction.id, 'GET', undefined, 404);
            await privateRequest(other, '/transactions', 'POST', { userId: ownerId, accountId: mainAccountId, categoryId: categoryMap.food.id, type: 'expense', amount: '0.01', description: 'Owner injection', date: fixedNow }, 400);
            await privateRequest(other, '/transactions', 'POST', { accountId: mainAccountId, categoryId: categoryMap.food.id, type: 'expense', amount: '0.01', description: 'Foreign reference', date: fixedNow }, 404);
            await assert.rejects(runtime.query("INSERT INTO expense_tracker.transactions(user_id,account_id,category_id,type,amount,description,transaction_date) VALUES($1,$2,$3,'expense',0.01,'Cross-owner rejection','2026-10-17')", [otherOwner, mainAccountId, categoryMap.food.id]), e => ['23503', '23514'].includes(e.code));
            const position = await createAccountBalanceRepository(runtime).getFinancialPosition(ownerId);
            assert.equal(position.totalBalance, money(cents(baseline.inventory.totals.balance) - 1n));
            assert.equal((await privateRequest(other, '/accounts/summary')).data.netPosition, '0.00');
            const month = expectedTotals([...baseline.inventory.rows.filter(r => r.date >= '2026-10-01' && r.date <= fixedNow), { type: 'expense', amount: '0.01' }]);
            for (const path of ['/dashboard?period=this_month', '/analytics/overview?from=2026-10-01&to=2026-10-17']) {
                const summary = (await privateRequest(token, path)).data.summary;
                assert.equal(summary.income, month.income);
                assert.equal(summary.expenses, month.expenses);
                assert.equal(summary.netSavings, month.balance);
            }
            run.postWrite = await reconcileMigrated(admin, { ...input, allowNewWrites: true });
        });
        await group(run, 'Window B refuses blind pre-V2 restore before any restore process', async () => { const before = await snapshot(); await assert.rejects(requireWindowA(admin, baseline.inventory), /WINDOW_B_BLIND_RESTORE_FORBIDDEN/); await assert.rejects(restoreBackup(admin, bins.client, file, archive, { safetyClient: admin, inventory: baseline.inventory }), /WINDOW_B_BLIND_RESTORE_FORBIDDEN/); assert.deepEqual(await snapshot(), before); run.windowB = { blindRestoreRefused: true, originalRows: 510, currentTransactions: 511, newAccountWouldBeLost: true, transferWouldBeLost: true, definitionBudgetGoalWouldBeLost: true }; });
        await group(run, 'post-write incident freezes access, snapshots and forward-recovers without loss', async () => { const before = await fullFinancialSnapshot(admin); api.setMode('maintenance'); await deniedLegacy(api.origin, sample, 503); await privateRequest(token, '/transactions', 'POST', {}, 503); const post = backup(bins.client, resolve(dir, 'post-v2-preservation.dump')); run.postWriteBackup = post; api.setMode('controlled'); assert.equal((await privateRequest(token, '/transactions/' + newTransaction.id)).data.id, newTransaction.id); assert.deepEqual(await fullFinancialSnapshot(admin), before); await requireWindowA(admin, baseline.inventory).then(() => assert.fail('Window B must remain closed'), e => assert.match(e.message, /WINDOW_B_BLIND_RESTORE_FORBIDDEN/)); run.windowB.forwardRecoveryPreserved = true; });
        await group(run, 'final original-row preservation, V1 retirement and cron absence', async () => { await reconcileMigrated(admin, { ...input, allowNewWrites: true }); await deniedLegacy(api.origin, sample, 410); await deniedLegacy(oldOrigin, sample); assert.equal((await request(api.origin, '/api/v2/health')).status, 200); assert.equal((await request(api.origin, '/internal/recurring/process')).status, 404); assert.deepEqual(JSON.parse(readFileSync(resolve(workspace, 'backend/vercel.json'), 'utf8')).crons, []); run.finalCatalogDigest = fingerprint(await captureCatalog(admin)); run.schemaValidated = true; run.failures = 0; });
        const acceptedCatalog = await captureCatalog(admin);
        if (round === 2)
            writeFileSync(resolve(root, 'private-runtime.json'), JSON.stringify({ ownerId, mainAccountId, password: newPassword, dataDirectory: clusters.cutover, baselineDigest: baseline.inventory.digest, expectedPosition: run.postWrite.currentTotals.balance }, null, 2));
        await stop();
        await group(run, 'original source remains independent and unchanged after full cutover', async () => { await open(clusters.source); assert.deepEqual(await captureV1Baseline(admin), baseline); });
        await stop();
        const reference = initCluster(resolve(dir, 'schema-reference'), bins.server);
        await group(run, 'independent empty-schema application of every tracked migration matches target', async () => {
            await open(reference);
            await createSourcePrerequisites(admin, ownerId);
            for (let index = 0; index < migrations.length; index++) {
                if (index === ownershipIndex)
                    await admin.query(sql('seeds/v2-system-categories.sql'));
                await applyMigration(admin, migrations[index]);
            }
            const expected = await captureCatalog(admin);
            run.targetCatalogReparseProof = await assertCatalogEquivalent(admin, acceptedCatalog, expected);
            run.targetSchemaMatchesFreshChain = true;
        });
        await stop();
        removeStoppedCluster(reference);
        for (const [name, data] of Object.entries(clusters))
            if (!(round === 2 && name === 'cutover'))
                removeStoppedCluster(data);
        run.complete = true;
        save();
    }
    assert.equal(result.runs[0].baseline.rowDigest, result.runs[1].baseline.rowDigest);
    assert.deepEqual(result.runs[0].reconciliation, result.runs[1].reconciliation);
    assert.deepEqual(result.runs[0].postWrite.currentTotals, result.runs[1].postWrite.currentTotals);
    assert.equal(result.runs[0].finalCatalogDigest, result.runs[1].finalCatalogDigest);
    result.repeatability = true;
    result.failures = 0;
    result.complete = true;
    save();
    console.log(JSON.stringify({ complete: true, runs: result.runs.length, namedGroups: result.runs.reduce((n, r) => n + r.groups.length, 0), rowsPerSource: 510, failures: 0, remoteTouched: false }));
}
catch (error) {
    writeFileSync(resolve(root, 'failure.json'), JSON.stringify({ group: activeGroup, code: error.code ?? null, message: cleanMessage(error) }, null, 2) + '\n');
    console.error('T65 stopped at ' + activeGroup + '; inspect ignored failure.json. No database target/credential emitted.');
    process.exitCode = 1;
}
finally {
    await stop();
}

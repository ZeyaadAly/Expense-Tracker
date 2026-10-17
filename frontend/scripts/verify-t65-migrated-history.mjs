// Local migrated-history rendering only. All external requests are blocked.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(resolve(process.env.T65_PLAYWRIGHT_PATH))), axe = readFileSync(resolve(process.env.T65_AXE_PATH), 'utf8');
const result = { checks: [], audits: [], apiResponses: [], pageErrors: [], remoteRequestsSent: 0, remoteTouched: false }, session = await (await fetch('http://127.0.0.1:4000/test/session')).json();
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }), context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname))
        return route.continue();
    if (url.hostname === 't37-fixture.supabase.co' && url.pathname.startsWith('/auth/v1/'))
        return route.fulfill({ json: url.pathname.endsWith('/logout') ? {} : session.user });
    return route.abort();
});
await context.addInitScript(s => localStorage.setItem('sb-t37-fixture-auth-token', JSON.stringify(s)), session);
page.on('pageerror', e => result.pageErrors.push(e.message));
page.on('response', r => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/v2/'))
        result.apiResponses.push({ path, status: r.status(), noStore: r.headers()['cache-control'] === 'no-store' });
});
try {
    for (const route of ['dashboard', 'accounts', 'transactions', 'analytics']) {
        const r = await page.goto('http://localhost:3000/v2/' + route);
        assert.equal(r.status(), 200);
        await page.locator('#v2-main').waitFor();
        await page.waitForLoadState('networkidle');
        const text = await page.locator('#v2-main').innerText();
        assert.ok(text.includes(route === 'analytics' ? 'Food' : route === 'accounts' ? 'Main Account' : 'T65 V1 retained'), route + ' must render migrated data');
        assert.equal(r.headers()['x-content-type-options'], 'nosniff');
        assert.match(r.headers()['content-security-policy'], /frame-ancestors 'none'/);
        result.checks.push(route + ' migrated history rendered through real API');
        await page.addScriptTag({ content: axe });
        const violations = await page.evaluate(async () => { const r = await window.axe.run(document.querySelector('.v2-theme'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }); return r.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })); });
        assert.deepEqual(violations, []);
        result.audits.push({ route, violations: 0 });
    }
    await page.goto('http://localhost:3000/v2/transactions');
    await page.waitForLoadState('networkidle');
    const search = page.getByRole('searchbox');
    await search.fill('%_!');
    await search.press('Enter');
    await page.waitForLoadState('networkidle');
    assert.ok((await page.locator('#v2-main').innerText()).includes('T65 V1 retained'));
    result.checks.push('literal migrated-history search rendered');
    const blocked = await fetch('http://127.0.0.1:4000/api/v2/accounts', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(blocked.status, 503);
    result.checks.push('browser-smoke API cannot enable financial writes');
    assert.deepEqual(result.pageErrors, []);
    assert.ok(result.apiResponses.length > 0);
    assert.ok(result.apiResponses.every(r => r.status < 400 && r.noStore));
}
finally {
    writeFileSync('.tmp-v2-t65/browser.json', JSON.stringify(result, null, 2) + '\n');
    await browser.close();
}

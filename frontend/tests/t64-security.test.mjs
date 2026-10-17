import assert from 'node:assert/strict';import {test} from 'node:test';import {readFileSync} from 'node:fs';import ts from 'typescript';
async function load(path){const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const {safeNext}=await load('../src/lib/auth/redirects.ts');
test('T64 encoded external and scheme redirect probes remain inside the protected app',()=>{
  const bad=['https://evil.invalid','//evil.invalid','javascript:alert(1)','%2f%2fevil.invalid','/%2f/evil.invalid','/v2/%2f%2fevil.invalid','/v2/%2e%2e/%2f%2fevil.invalid','/v2/dashboard/../../%2f%2fevil.invalid','/v2/dashboard\\@evil.invalid','\u0000/v2/dashboard','/v2/dashboard%0d%0aLocation:https://evil.invalid','/v2/dashboard%23@evil.invalid'];
  for(const value of bad)assert.equal(safeNext(value),'/v2/dashboard',value);
  for(const value of ['/v2/accounts/abc%2f%2fevil.invalid','/v2/accounts/abc?next=https://evil.invalid','/v2/transactions?q=%3Cscript%3E']){const target=new URL(safeNext(value),'https://frontend.example.invalid');assert.equal(target.origin,'https://frontend.example.invalid');assert.ok(target.pathname.startsWith('/v2/'));}
});
test('T64 Next header configuration protects all routes without blocking inline bootstrap or Auth connections',async()=>{
  const {default:config}=await load('../next.config.ts'),rules=await config.headers();assert.equal(config.poweredByHeader,false);assert.equal(rules[0].source,'/:path*');const headers=Object.fromEntries(rules[0].headers.map(h=>[h.key.toLowerCase(),h.value]));assert.equal(headers['x-content-type-options'],'nosniff');assert.equal(headers['x-frame-options'],'DENY');assert.equal(headers['referrer-policy'],'no-referrer');assert.match(headers['content-security-policy'],/frame-ancestors 'none'/);assert.ok(!/script-src|style-src|connect-src|unsafe-inline|unsafe-eval/.test(headers['content-security-policy']));
});

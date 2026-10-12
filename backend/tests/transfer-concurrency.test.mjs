import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {verifyIsolation} from '../scripts/verify-v2-isolation.mjs';

test('T27 preserves the existing one-dispatch/no-mutation-retry architecture',()=>{
  const service=readFileSync(new URL('../src/services/transfers.ts',import.meta.url),'utf8');
  const transport=readFileSync(new URL('../../frontend/src/lib/api/v2-client.ts',import.meta.url),'utf8');
  assert.equal((service.match(/await database.connect\(\)/g)||[]).length,1);
  assert.equal((transport.match(/await fetcher\(/g)||[]).length,1);
  assert.doesNotMatch(service,/SERIALIZABLE|REPEATABLE READ|retry\(/i);
  // Existing T26 runtime tests prove error/rollback behavior; T27's actual committed-error
  // integration checks single dispatch and the one resulting row without source-only claims.
});
test('T27 fresh focused concurrency gaps plus unchanged T16–T26 regressions',{
  skip:!process.env.T27_DISPOSABLE_DATABASE_URL&&'Requires a fresh guarded loopback PostgreSQL database',
},async context=>{
  const result=await verifyIsolation(process.env.T27_DISPOSABLE_DATABASE_URL,{transferConcurrency:true});
  context.diagnostic(JSON.stringify(result));
});

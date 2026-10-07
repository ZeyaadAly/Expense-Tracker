import assert from 'node:assert/strict';
import process from 'node:process';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {URL} from 'node:url';
import {verifyIsolation} from '../scripts/verify-v2-isolation.mjs';
import {disposableIsolationUrl,expectApiError,expectForeignResourceHidden,isolationUsers} from './helpers/v2-isolation.mjs';

test('T16 synthetic fixtures and disposable connection guard',()=>{
  assert.notEqual(isolationUsers.a.userId,isolationUsers.b.userId);assert.ok(Object.isFrozen(isolationUsers.a));
  for(const value of [undefined,'postgresql://postgres@remote.invalid:55451/postgres','postgresql://postgres:fictional@127.0.0.1:55451/postgres','postgresql://postgres@127.0.0.1:5432/postgres','postgresql://postgres@127.0.0.1:55451/postgres?sslmode=disable'])assert.throws(()=>disposableIsolationUrl(value));
});
test('T16 hidden-resource helper detects existence disclosures',async()=>{
  const hidden={status:404,cache:'no-store',body:{error:{code:'NOT_FOUND',message:'The requested resource was not found.',details:[]}}};
  const own={status:200,body:{data:{id:'owned-unit-fixture'}}};
  expectApiError(hidden,404,'NOT_FOUND');await expectForeignResourceHidden(async(_token,path)=>path==='/own'?own:hidden,{ownPath:'/own',foreignPath:'/foreign',missingPath:'/missing'});
  await assert.rejects(expectForeignResourceHidden(async(_token,path)=>path==='/own'?own:path==='/foreign'?{...hidden,body:{error:{...hidden.body.error,message:'Belongs to another user'}}}:hidden,{ownPath:'/own',foreignPath:'/foreign',missingPath:'/missing'}));
  await assert.rejects(expectForeignResourceHidden(async()=>hidden,{foreignPath:'/foreign',missingPath:'/missing'}));
});
test('T16 browser source has no direct financial Data API table calls',()=>{
  const root=new URL('../../frontend/src/',import.meta.url);
  function inspect(directory) {
    for(const entry of readdirSync(directory,{withFileTypes:true})) {
      const path=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
      if(entry.isDirectory())inspect(path);
      else if(/\.(tsx?|m?js)$/.test(entry.name))assert.doesNotMatch(readFileSync(path,'utf8'),/\.from\s*\(\s*['"`](?:expense_tracker\.)?(?:profiles|accounts|categories|transactions|transfers|recurring_transactions|recurring_occurrences|budgets|goals)['"`]/,'Financial data must use Express rather than the browser Data API');
    }
  }
  inspect(root);
});
test('T16 fresh real JWT/API and PostgreSQL multi-user isolation',{
  skip:!process.env.T16_DISPOSABLE_DATABASE_URL&&'Requires a fresh isolated loopback PostgreSQL cluster',
},async context=>{context.diagnostic(JSON.stringify(await verifyIsolation(process.env.T16_DISPOSABLE_DATABASE_URL)));});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {verifyT14} from '../scripts/verify-v2-migration-rehearsal.mjs';
import {migrateLegacy,categoryMap,assertDisposable} from '../scripts/v2-migration-rehearsal.mjs';

test('T14 requires explicit disposable connection and operator owner; fixed map covers V1 only',async()=>{
  assert.deepEqual(Object.keys(categoryMap),['salary','freelance','gift','food','transport','shopping','bills','entertainment','other']);
  assert.equal(categoryMap.other.kind,'both');assert.equal(Object.hasOwn(categoryMap,'unknown'),false);
  await assert.rejects(verifyT14('postgresql://postgres@remote.invalid:55451/postgres','a1400000-0000-4000-8000-000000000001'));
  const client={query:async()=>({}),connectionParameters:{host:'remote.invalid',port:55451,database:'postgres',user:'postgres'}};
  await assert.rejects(migrateLegacy(client,{ownerId:'bad',mainAccountId:'bad'}),e=>/EXPLICIT_CANONICAL/.test(e.message));
  await assert.rejects(assertDisposable({...client,connectionParameters:{host:'127.0.0.1',port:55451,database:'postgres',user:'postgres',password:'fictional-not-allowed'}}),e=>/REHEARSAL_CONNECTION_REQUIRED/.test(e.message));
  await assertDisposable({connectionParameters:{host:'127.0.0.1',port:55451,database:'postgres',user:'postgres',password:null},query:async()=>({rows:[{marker:'isolated-t14-rehearsal'}]})});
});
test('T14 fresh production-like migration, fail-closed cases, exact reconciliation, rollback and V1 window',{
  skip:!process.env.T14_DISPOSABLE_DATABASE_URL&&'Requires fresh isolated PostgreSQL and explicit synthetic T14_MIGRATION_OWNER_ID',
},async context=>{context.diagnostic(JSON.stringify(await verifyT14(process.env.T14_DISPOSABLE_DATABASE_URL,process.env.T14_MIGRATION_OWNER_ID)));});

import assert from 'node:assert/strict';
import process from 'node:process';
import {test} from 'node:test';
import {disposableT15Url,verifyT15} from '../scripts/verify-v2-ownership-constraints.mjs';

test('T15 refuses remote, credential-bearing and option-bearing databases',()=>{
  for(const value of [undefined,'postgresql://postgres@remote.invalid:55451/postgres','postgresql://postgres:fictional@127.0.0.1:55451/postgres','postgresql://postgres@127.0.0.1:5432/postgres','postgresql://postgres@127.0.0.1:55451/postgres?sslmode=disable','postgresql://expense_tracker_app@127.0.0.1:55451/postgres'])assert.throws(()=>disposableT15Url(value));
  assert.equal(disposableT15Url('postgresql://postgres@127.0.0.1:55451/postgres').hostname,'127.0.0.1');
});
test('T15 fresh T14 backfill, preflight, ownership constraints and V1 compatibility',{
  skip:!process.env.T15_DISPOSABLE_DATABASE_URL&&'Requires a fresh isolated loopback PostgreSQL cluster',
},async context=>{context.diagnostic(JSON.stringify(await verifyT15(process.env.T15_DISPOSABLE_DATABASE_URL)));});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {createAccountBalanceRepository} from '../dist/services/account-balances.js';
import {verifyIsolation} from '../scripts/verify-v2-isolation.mjs';

test('T18 empty aggregates serialize exact zero and each read uses one parameterized statement',async()=>{
  const calls=[];
  const repository=createAccountBalanceRepository({query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.includes('AS "netPosition"')?[{netPosition:'0'}]:[]};}});
  assert.deepEqual(await repository.getNetPosition('owner'),{netPosition:'0.00',currency:'EGP'});
  assert.deepEqual(await repository.getAccountBalances('owner','archived'),[]);
  await assert.rejects(repository.getAccountBalance('owner','id'),e=>e.code==='NOT_FOUND'&&e.status===404);
  assert.equal(calls.length,3);assert.deepEqual(calls.map(c=>c.params),[['owner',null,null],['owner',null,'archived'],['owner','id',null]]);
  assert.ok(calls.every(c=>!c.sql.includes('FOR UPDATE')));
});

test('T18 repository preserves driver failures for the existing safe HTTP error handler',async()=>{
  const failure=Object.assign(new Error('private driver details'),{code:'ECONNREFUSED'});
  const repository=createAccountBalanceRepository({query:async()=>{throw failure;}});
  for(const operation of [()=>repository.getAccountBalances('owner'),()=>repository.getAccountBalance('owner','id'),()=>repository.getNetPosition('owner')])await assert.rejects(operation(),e=>e===failure);
});

test('T18 fresh balances, full T17 lifecycle and T16 isolation integration',{
  skip:!process.env.T18_DISPOSABLE_DATABASE_URL&&'Requires a fresh isolated loopback PostgreSQL cluster',
},async context=>{context.diagnostic(JSON.stringify(await verifyIsolation(process.env.T18_DISPOSABLE_DATABASE_URL)));});

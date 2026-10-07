import assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {validateAccountBody,validateAccountQuery,validateAccountActionBody} from '../dist/validators/account.js';
import {createTestAuthHarness,isolationUsers,expectApiError} from './helpers/v2-isolation.mjs';
import {verifyIsolation} from '../scripts/verify-v2-isolation.mjs';

test('T17 exact signed decimal boundaries, strict full payloads and Unicode names',()=>{
  const input={name:'  Bank 😀  ',type:'bank',openingBalance:'-0.1',currency:'EGP'};
  assert.deepEqual(validateAccountBody(input,true),{name:'Bank 😀',type:'bank',openingBalance:'-0.10'});
  for(const value of ['-999999999.99','999999999.99','0','-0.01'])assert.equal(typeof validateAccountBody({...input,openingBalance:value},true).openingBalance,'string');
  for(const openingBalance of ['-0','-0.00','01','1e2','1.230','1000000000','-1000000000','+1',1])assert.throws(()=>validateAccountBody({...input,openingBalance},true),e=>e.code==='VALIDATION_ERROR');
  const editable={name:'Bank',type:'bank',openingBalance:'0'};
  assert.equal(validateAccountBody(editable).openingBalance,'0.00');
  for(const field of ['currency','userId','ownerId','createdBy','status','id','openingBalanceEditable','currentBalance'])assert.throws(()=>validateAccountBody({...editable,[field]:'injected'}),e=>e.code==='VALIDATION_ERROR');
  for(const name of ['', ' ', 'x'.repeat(101),'\u0000','\u200b','\ud800'])assert.throws(()=>validateAccountBody({...input,name},true));
  assert.equal(Array.from(validateAccountBody({...input,name:'😀'.repeat(100)},true).name).length,100);
  assert.equal(validateAccountQuery('/accounts'),'active');assert.equal(validateAccountQuery('/accounts?status=archived'),'archived');
  for(const query of ['status=','status=all','status[]=active','status=active&status=archived','userId=x'])assert.throws(()=>validateAccountQuery('/accounts?'+query));
  validateAccountActionBody(undefined);validateAccountActionBody({});
  for(const body of [null,[],{userId:'x'}])assert.throws(()=>validateAccountActionBody(body));
});

test('T17 all account endpoints sanitize database failure and preserve the error envelope',async()=>{
  for(const [code,status,publicCode] of [['ECONNREFUSED',503,'DATABASE_UNAVAILABLE'],['XX000',500,'INTERNAL_ERROR']]) {
    const fail=async()=>{throw Object.assign(new Error('private SQL credentials'),{code});};
    const auth=await createTestAuthHarness({query:fail,connect:fail});
    try {
      const token=await auth.createTestAuthToken(isolationUsers.a),id=isolationUsers.a.account;
      for(const [path,method,body] of [['/accounts/summary','GET'],['/accounts','GET'],['/accounts','POST',{name:'Bank',type:'bank',openingBalance:'0',currency:'EGP'}],['/accounts/'+id,'GET'],['/accounts/'+id,'PUT',{name:'Bank',type:'bank',openingBalance:'0'}],['/accounts/'+id+'/archive','POST',{}],['/accounts/'+id+'/restore','POST',{}]]) {
        const response=await auth.request(token,path,method,body);expectApiError(response,status,publicCode);assert.ok(!JSON.stringify(response.body).includes('private'));
      }
    } finally {await auth.close();}
  }
});

test('T17 fresh disposable accounts, T16 isolation, archive rollback and concurrent activity',{
  skip:!process.env.T17_DISPOSABLE_DATABASE_URL&&'Requires a fresh isolated loopback PostgreSQL cluster',
},async context=>{context.diagnostic(JSON.stringify(await verifyIsolation(process.env.T17_DISPOSABLE_DATABASE_URL)));});

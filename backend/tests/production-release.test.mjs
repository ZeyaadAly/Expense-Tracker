import assert from 'node:assert/strict';
import test from 'node:test';
import {readReleaseConfig} from '../dist/config/release.js';
import {createTestAuthHarness,isolationUsers} from './helpers/v2-isolation.mjs';

test('production release configuration defaults closed and validates explicit acceptance subjects',()=>{
 assert.deepEqual(readReleaseConfig({}),{stage:'maintenance',acceptanceUserIds:[],cronEnabled:false});
 assert.equal(readReleaseConfig({V2_CRON_ENABLED:'true'}).cronEnabled,false);
 for(const input of [{V2_RELEASE_STAGE:'automatic'},{V2_RELEASE_STAGE:'controlled'},{V2_RELEASE_STAGE:'read-only',V2_ACCEPTANCE_USER_IDS:'random'},{V2_ACCEPTANCE_USER_IDS:[isolationUsers.a.userId,isolationUsers.a.userId].join(',')},{V2_CRON_ENABLED:'yes'}])assert.throws(()=>readReleaseConfig(input));
 assert.equal(readReleaseConfig({V2_RELEASE_STAGE:'read-only',V2_ACCEPTANCE_USER_IDS:isolationUsers.a.userId,V2_CRON_ENABLED:'true'}).cronEnabled,false);
 assert.equal(readReleaseConfig({V2_RELEASE_STAGE:'controlled',V2_ACCEPTANCE_USER_IDS:isolationUsers.a.userId,V2_CRON_ENABLED:'true'}).cronEnabled,true);
});

test('read-only acceptance uses verified JWT subjects and blocks financial writes before SQL',async()=>{
 let calls=0;
 const pool={query:async()=>{calls++;return{rows:[]};}};
 const releaseAccess=readReleaseConfig({V2_RELEASE_STAGE:'read-only',V2_ACCEPTANCE_USER_IDS:isolationUsers.a.userId});
 const auth=await createTestAuthHarness(pool,{releaseAccess});
 try{
  const a=await auth.createTestAuthToken(isolationUsers.a);
  const b=await auth.createTestAuthToken(isolationUsers.b,{metadataOwner:isolationUsers.a.userId});
  assert.equal((await auth.rawRequest(null,'/profile')).status,401);
  assert.equal((await auth.rawRequest(b,'/profile')).body.error.code,'MAINTENANCE');assert.equal(calls,0);
  assert.equal((await auth.rawRequest(a,'/transactions','POST',{})).body.error.code,'MAINTENANCE');assert.equal(calls,0);
  assert.equal((await auth.rawRequest(a,'/profile','PUT',{displayName:'Test'})).body.error.code,'MAINTENANCE');assert.equal(calls,0);
  assert.equal((await auth.rawRequest(a,'/profile')).body.error.code,'PROFILE_REQUIRED');assert.equal(calls,1);
  assert.equal((await auth.rawRequest(a,'/profile/bootstrap','POST',{})).body.error.code,'PROFILE_REQUIRED');assert.equal(calls,3);
  const expired=await auth.createTestAuthToken(isolationUsers.a,{expiration:'-1s'});assert.equal((await auth.rawRequest(expired,'/profile')).status,401);assert.equal(calls,3);
 }finally{await auth.close();}
});

test('controlled acceptance permits only listed subjects; public stage retains JWT authentication',async()=>{
 for(const stage of ['controlled','public']){
  let calls=0;const pool={query:async()=>{calls++;return{rows:[]};}};
  const releaseAccess=readReleaseConfig({V2_RELEASE_STAGE:stage,V2_ACCEPTANCE_USER_IDS:isolationUsers.a.userId});
  const auth=await createTestAuthHarness(pool,{releaseAccess});
  try{
   const a=await auth.createTestAuthToken(isolationUsers.a),b=await auth.createTestAuthToken(isolationUsers.b);
   assert.equal((await auth.rawRequest(a,'/profile','PUT',{displayName:'Test'})).body.error.code,'PROFILE_REQUIRED');assert.equal(calls,2);
   assert.equal((await auth.rawRequest(b,'/profile')).body.error.code,stage==='controlled'?'MAINTENANCE':'PROFILE_REQUIRED');assert.equal(calls,stage==='controlled'?2:3);
   assert.equal((await auth.rawRequest(null,'/profile')).status,401);
  }finally{await auth.close();}
 }
});

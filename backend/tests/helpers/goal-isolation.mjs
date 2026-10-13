import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTestUser,expectApiError} from './v2-isolation.mjs';
export async function verifyGoalIsolation({admin,pool,auth}) {
  const a={userId:randomUUID()},b={userId:randomUUID()};
  for(const user of [a,b])await createTestUser(admin,user);
  const ta=await auth.createTestAuthToken(a),tb=await auth.createTestAuthToken(b);let checks=0;
  const account=(await pool.query("INSERT INTO expense_tracker.accounts(user_id,name,type) VALUES($1,'Private goal account','cash') RETURNING id",[a.userId])).rows[0].id;
  const input={name:'Private goal',targetAmount:'0.30',savedAmount:'0.30',targetDate:null,linkedAccountId:account};
  const created=await auth.rawRequest(ta,'/goals','POST',input);assert.equal(created.status,201);checks++;
  const id=created.body.data.id;
  for(const suffix of ['', '?status=active','?status=completed','?status=archived']){assert.deepEqual((await auth.rawRequest(tb,'/goals'+suffix)).body.data,[]);checks++;}
  for(const [method,suffix,body]of [['GET',''],['PUT','',{...input,status:'active'}],['POST','/complete',{}],['POST','/archive',{}]]) {
    const foreign=await auth.rawRequest(tb,'/goals/'+id+suffix,method,body),missing=await auth.rawRequest(tb,'/goals/'+randomUUID()+suffix,method,body);
    expectApiError(foreign,404,'NOT_FOUND');expectApiError(missing,404,'NOT_FOUND');assert.deepEqual(foreign.body,missing.body);checks+=3;
  }
  expectApiError(await auth.rawRequest(tb,'/goals','POST',input),404,'NOT_FOUND');checks++;
  const ownB=await auth.rawRequest(tb,'/goals','POST',{...input,linkedAccountId:null});assert.equal(ownB.status,201);checks++;
  expectApiError(await auth.rawRequest(tb,'/goals/'+ownB.body.data.id,'PUT',{...input,status:'active'}),404,'NOT_FOUND');checks++;
  for(const [method,suffix,body]of [['GET',''],['PUT','',{...input,status:'active'}],['POST','/complete',{}],['PUT','',{...input,savedAmount:'0.10',status:'active'}],['POST','/archive',{}]]){assert.equal((await auth.rawRequest(ta,'/goals/'+id+suffix,method,body)).status,200);checks++;}
  return {checks,realGoalApi:true,foreignAndMissingIdentical:true,reopenViaPut:true};
}

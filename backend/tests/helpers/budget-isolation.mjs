import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTestUser,expectApiError} from './v2-isolation.mjs';
export async function verifyBudgetIsolation({admin,pool,auth}){
  const a={userId:randomUUID()},b={userId:randomUUID()};for(const user of [a,b])await createTestUser(admin,user);
  const ta=await auth.createTestAuthToken(a),tb=await auth.createTestAuthToken(b);let checks=0;
  const category=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,'Private budget category','expense') RETURNING id",[a.userId])).rows[0].id;
  const input={categoryId:category,year:2026,month:10,amount:'0.30'};
  const created=await auth.rawRequest(ta,'/budgets','POST',input);assert.equal(created.status,201);checks++;
  const id=created.body.data.id;
  assert.deepEqual((await auth.rawRequest(tb,'/budgets?year=2026&month=10')).body.data,[]);checks++;
  for(const [method,body]of [['GET',undefined],['PUT',{amount:'1.00',alertThresholdPercent:90}],['DELETE',undefined]]){
    const foreign=await auth.rawRequest(tb,'/budgets/'+id,method,body),missing=await auth.rawRequest(tb,'/budgets/'+randomUUID(),method,body);
    expectApiError(foreign,404,'NOT_FOUND');expectApiError(missing,404,'NOT_FOUND');assert.deepEqual(foreign.body,missing.body);checks+=3;
  }
  expectApiError(await auth.rawRequest(tb,'/budgets','POST',input),404,'NOT_FOUND');checks++;
  expectApiError(await auth.rawRequest(tb,'/budgets?year=2026&month=10&categoryId='+category),404,'NOT_FOUND');checks++;
  assert.equal((await auth.rawRequest(ta,'/budgets/'+id,'PUT',{amount:'1.00',alertThresholdPercent:80})).status,200);checks++;
  assert.equal((await auth.rawRequest(ta,'/budgets/'+id,'DELETE')).status,204);checks++;
  return {checks,realBudgetApi:true,foreignAndMissingIdentical:true};
}

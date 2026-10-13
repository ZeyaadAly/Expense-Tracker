import assert from 'node:assert/strict';
import {URLSearchParams} from 'node:url';
import {createAnalyticsService} from '../../dist/services/analytics.js';
import {formatDecimal} from '../../dist/utils/money.js';
import {isolationUsers} from './v2-isolation.mjs';

export async function verifyAnalyticsIsolation({pool,auth}) {
  const service=createAnalyticsService(pool);let checks=0;
  for(const [user,other] of [[isolationUsers.a,isolationUsers.b],[isolationUsers.b,isolationUsers.a]]){
    const range={from:'1900-01-01',to:'1900-12-31'},result=await service.getOverview(user.userId,range);
    const token=await auth.createTestAuthToken(user),http=await auth.rawRequest(token,'/analytics/overview?'+new URLSearchParams(range));
    assert.equal(http.status,200);assert.deepEqual(http.body,{data:result});checks+=2;
    const expected=(await pool.query(`SELECT COALESCE(sum(amount) FILTER(WHERE type='income'),0)::text income,
      COALESCE(sum(amount) FILTER(WHERE type='expense'),0)::text expenses FROM expense_tracker.transactions
      WHERE user_id=$1 AND transaction_date BETWEEN $2 AND $3`,[user.userId,range.from,range.to])).rows[0];
    assert.equal(result.summary.income,formatDecimal(expected.income));assert.equal(result.summary.expenses,formatDecimal(expected.expenses));checks+=2;
    const ids=(await pool.query('SELECT id FROM expense_tracker.accounts WHERE user_id=$1 ORDER BY name,id',[user.userId])).rows.map(r=>r.id);
    assert.deepEqual(result.accountActivity.map(r=>r.accountId),ids);checks++;
    const foreign=(await pool.query('SELECT id FROM expense_tracker.accounts WHERE user_id=$1 LIMIT 1',[other.userId])).rows[0];
    await assert.rejects(service.getOverview(user.userId,{...range,accountId:foreign.id}),e=>e.status===404&&e.code==='NOT_FOUND');checks++;
    assert.ok(!JSON.stringify(result).includes(other.userId));checks++;
  }
  return {checks,internalQueryIsolation:true,publicApi:true};
}

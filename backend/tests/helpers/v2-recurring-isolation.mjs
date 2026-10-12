import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTestUser,expectApiError} from './v2-isolation.mjs';

/** Continuing T16 gate: use the real recurring routes after each broader domain regression. */
export async function verifyRecurringIsolation({admin,pool,auth}) {
  const a={userId:randomUUID()},b={userId:randomUUID()};
  for(const user of [a,b])await createTestUser(admin,user);
  const tokens=await Promise.all([auth.createTestAuthToken(a),auth.createTestAuthToken(b)]);
  let checks=0;const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const request=auth.rawRequest,parents=[];
  for(const [index,user] of [a,b].entries()) {
    const result=await request(tokens[index],'/accounts','POST',{name:'T29 isolation',type:'cash',openingBalance:'0.00',currency:'EGP'});equal(result.status,201);
    const category=(await pool.query("INSERT INTO expense_tracker.categories(user_id,name,kind) VALUES($1,'T29 isolation','income') RETURNING id",[user.userId])).rows[0].id;
    parents.push({accountId:result.body.data.id,categoryId:category});
  }
  const input={...parents[0],type:'income',amount:'0.10',description:'T16 recurring',frequency:'daily',startDate:'1900-01-01',endDate:null};
  const totals=async()=>(await pool.query("SELECT count(*)::int count,coalesce(sum(amount),0)::text amount FROM expense_tracker.transactions")).rows;
  const before=await totals(),created=await request(tokens[0],'/recurring','POST',input);equal(created.status,201);
  const id=created.body.data.id;equal((await request(tokens[0],'/recurring')).body.data.map(row=>row.id),[id]);equal((await request(tokens[1],'/recurring')).body.data,[]);
  for(const [suffix,method,body] of [['','GET',undefined],['','PUT',input],['/pause','POST',{}],['/resume','POST',{}],['/archive','POST',{}]]) {
    const foreign=await request(tokens[1],'/recurring/'+id+suffix,method,body),missing=await request(tokens[1],'/recurring/'+randomUUID()+suffix,method,body);
    expectApiError(foreign,404,'NOT_FOUND');expectApiError(missing,404,'NOT_FOUND');checks+=2;equal(foreign.body,missing.body);
    equal((await request(tokens[0],'/recurring/'+id+suffix,method,body)).status,200);
  }
  for(const parent of [{accountId:parents[0].accountId},{categoryId:parents[0].categoryId}]) {
    const result=await request(tokens[1],'/recurring','POST',{...input,...parents[1],...parent});expectApiError(result,404,'NOT_FOUND');checks++;
  }
  equal((await request(tokens[1],'/recurring?accountId='+parents[0].accountId)).body.data,[]);
  equal((await request(tokens[1],'/recurring/upcoming')).body.data,[]);
  equal(await totals(),before);
  equal((await pool.query('SELECT count(*)::int count FROM expense_tracker.recurring_occurrences WHERE recurring_transaction_id=$1',[id])).rows[0].count,0);
  return {checks,realRecurringApi:true,financialEffect:false};
}

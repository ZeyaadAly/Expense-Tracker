import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import process from "node:process";
import { URL } from "node:url";
import { readFileSync } from "node:fs";
import { Pool, Client } from "pg";
import { createApp } from "../dist/app.js";
import { createTransactionService } from "../dist/services/transactions.js";

const valid = {type:"expense",amount:"10.5",description:"  Lunch  ",category:"food",date:"2026-09-30"};
async function withServer(service, run) {
  const server = createApp({clientOrigin:"http://localhost:3000",databaseHealth:async()=>true,transactions:service}).listen(0,"127.0.0.1");
  await once(server,"listening");
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1`); }
  finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
}
async function call(base,path,options={}) {
  const response=await globalThis.fetch(base+path,options);
  const body=response.status===204 || options.method==="HEAD"?null:await response.json();
  assert.equal(response.headers.get("cache-control"),"no-store");
  return {response,body};
}
function post(body) { return {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}; }

test("T06 validation prevents every invalid request from querying the database",async()=>{
  let queries=0;
  const service=createTransactionService({query:async()=>{queries++;throw new Error("Database must not be reached");}});
  await withServer(service,async base=>{
    for(const [path,options] of [
      ["/transactions",post({})], ["/transactions",post({...valid,amount:10})],
      ["/transactions",post({...valid,id:"caller-id"})],
      ["/transactions?type=expense",post(valid)], ["/transactions/not-a-uuid",{}],
      ["/transactions?type=income&category=food",{}], ["/transactions?type=expense&type=income",{}],
      ["/transactions?limit=10",{}], ["/transactions?dateFrom=2026-01-01",{}],
      ["/transactions?category[]=food",{}], ["/summary?type=expense",{}],
      ["/transactions/bb664829-eddd-4a27-bddc-076e8c3bf6fe?category=food",{}],
    ]) { const {response,body}=await call(base,path,options);assert.equal(response.status,400);assert.equal(body.error.code,"VALIDATION_ERROR"); }
    for(const [path,method,allow] of [["/transactions","DELETE","GET, POST"],["/transactions","PUT","GET, POST"],["/transactions/bb664829-eddd-4a27-bddc-076e8c3bf6fe","PATCH","GET, PUT, DELETE"],["/summary","PATCH","GET"],["/summary","HEAD","GET"]]) {
      const options={method,...(method==="PUT"?{headers:{"Content-Type":"application/json"},body:"{}"}:{})};
      const {response,body}=await call(base,path,options);assert.equal(response.status,405);assert.equal(response.headers.get("allow"),allow);if(body)assert.equal(body.error.code,"METHOD_NOT_ALLOWED");
    }
    for(const path of ["/summary","/transactions/bb664829-eddd-4a27-bddc-076e8c3bf6fe"]) {
      const {response,body}=await call(base,path,{method:"POST"});assert.equal(response.status,405);assert.equal(body.error.code,"METHOD_NOT_ALLOWED");
    }
  });assert.equal(queries,0);
});

test("T06 database availability and unexpected errors use sanitized shared responses",async()=>{
  for(const [error,status,code] of [[Object.assign(new Error("secret SQL password"),{code:"ECONNREFUSED"}),503,"DATABASE_UNAVAILABLE"],[new Error("secret SQL password"),500,"INTERNAL_ERROR"]]) {
    await withServer(createTransactionService({query:async()=>{throw error;}}),async base=>{
      for(const [path,options] of [["/transactions",{}],["/transactions",post(valid)],["/transactions/bb664829-eddd-4a27-bddc-076e8c3bf6fe",{}],["/summary",{}]]) {
        const result=await call(base,path,options);assert.equal(result.response.status,status);assert.equal(result.body.error.code,code);assert.deepEqual(result.body.error.details,[]);assert.doesNotMatch(JSON.stringify(result.body),/secret|SQL|password/);
      }
    });
  }
});

test("T06 HTTP endpoints integrate with disposable PostgreSQL as the limited role",{
  skip: !process.env.T06_DISPOSABLE_DATABASE_URL && "Set T06_DISPOSABLE_DATABASE_URL to run real PostgreSQL integration",
},async()=>{
  const url=new URL(process.env.T06_DISPOSABLE_DATABASE_URL);
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname),"Test writes require loopback PostgreSQL");
  const admin=new Client({connectionString:url.toString()});await admin.connect();
  const limitedUrl=new URL(url);limitedUrl.username="expense_tracker_app";limitedUrl.password="";
  const pool=new Pool({connectionString:limitedUrl.toString(),max:2});
  try {
    assert.equal((await pool.query("SELECT current_user")).rows[0].current_user,"expense_tracker_app");
    // This explicit loopback disposable fixture is reset so the suite can be rerun.
    // DELETE also works after T11 adds the durable occurrence FK to transactions.
    await admin.query("DELETE FROM expense_tracker.transactions");
    await admin.query(readFileSync(new URL("../../supabase/seed.sql",import.meta.url),"utf8"));
    await withServer(createTransactionService(pool),async base=>{
      const seeded=await call(base,"/summary");assert.deepEqual(seeded.body,{data:{totalIncome:"1000.00",totalExpenses:"296.25",balance:"703.75",currency:"EGP",transactionCount:3,scope:"all"}});
      await admin.query("DELETE FROM expense_tracker.transactions");
      assert.deepEqual((await call(base,"/summary")).body,{data:{totalIncome:"0.00",totalExpenses:"0.00",balance:"0.00",currency:"EGP",transactionCount:0,scope:"all"}});
      assert.deepEqual((await call(base,"/transactions")).body,{data:[],meta:{count:0,filters:{type:null,category:null}}});
      const created=await call(base,"/transactions",post(valid));assert.equal(created.response.status,201);
      const record=created.body.data;assert.equal(created.response.headers.get("location"),`/api/v1/transactions/${record.id}`);
      assert.match(record.id,/^[0-9a-f-]{36}$/);assert.equal(record.amount,"10.50");assert.equal(record.description,"Lunch");assert.equal(record.date,valid.date);assert.equal(record.currency,"EGP");
      assert.deepEqual(Object.keys(record).sort(),["id","type","amount","description","category","date","currency","createdAt","updatedAt"].sort());
      assert.match(record.createdAt,/Z$/);assert.equal(record.createdAt,record.updatedAt);
      assert.equal((await admin.query("SELECT amount::text AS amount FROM expense_tracker.transactions WHERE id=$1",[record.id])).rows[0].amount,"10.50");
      assert.deepEqual((await call(base,`/transactions/${record.id.toUpperCase()}`)).body,{data:record});
      const missing=await call(base,"/transactions/00000000-0000-0000-0000-000000000000");assert.equal(missing.response.status,404);assert.equal(missing.body.error.code,"TRANSACTION_NOT_FOUND");
      const before=(await admin.query("SELECT count(*)::int AS count FROM expense_tracker.transactions")).rows[0].count;
      const rejected=await call(base,"/transactions",post({...valid,amount:"1.234"}));assert.equal(rejected.response.status,400);
      assert.equal((await admin.query("SELECT count(*)::int AS count FROM expense_tracker.transactions")).rows[0].count,before);
      const expensesOnly=await call(base,"/summary");assert.equal(expensesOnly.body.data.balance,"-10.50");
      await call(base,"/transactions",post({...valid,type:"income",category:"other",amount:"0.10",description:"Exact one"}));
      await call(base,"/transactions",post({...valid,type:"income",category:"other",amount:"0.20",description:"Exact two"}));
      await call(base,"/transactions",post({...valid,category:"other",amount:"1",description:"Other expense"}));
      const totals=await call(base,"/summary");assert.equal(totals.body.data.totalIncome,"0.30");assert.equal(totals.body.data.totalExpenses,"11.50");assert.equal(totals.body.data.balance,"-11.20");assert.equal(totals.body.data.transactionCount,4);
      for(const [query,count] of [["type=income",2],["category=other",3],["type=expense&category=other",1],["category=bills",0]]) {
        const result=await call(base,`/transactions?${query}`);assert.equal(result.response.status,200);assert.equal(result.body.meta.count,count);assert.equal(result.body.data.length,count);
      }
      assert.deepEqual((await call(base,"/summary")).body,totals.body);
      // One INSERT statement gives both rows the same database-managed creation timestamp.
      const low="00000000-0000-0000-0000-000000000001";
      const high="00000000-0000-0000-0000-000000000002";
      await admin.query(`INSERT INTO expense_tracker.transactions
        (id,type,amount,description,category,transaction_date) VALUES
        ($1,'expense',0.01,'Tie one','food','2026-09-29'),
        ($2,'expense',0.01,'Tie two','food','2026-09-29')`,[low,high]);
      const ordered=(await call(base,"/transactions")).body.data;
      assert.deepEqual(ordered.slice(-2).map(row=>row.id),[high,low]);
      const expected=[...ordered].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
      assert.deepEqual(ordered,expected);
      assert.deepEqual((await call(base,"/transactions")).body.data,ordered);
      const newConnection=new Client({connectionString:limitedUrl.toString()});await newConnection.connect();
      try {assert.equal((await newConnection.query("SELECT count(*)::int AS count FROM expense_tracker.transactions")).rows[0].count,6);}finally{await newConnection.end();}
      await assert.rejects(pool.query("INSERT INTO expense_tracker.transactions (id,type,amount,description,category,transaction_date) VALUES ($1,$2,$3,$4,$5,$6)",["91e8f782-c973-4be1-a2a8-e58b1cfae85c","expense","1.234","Invalid","food","2026-09-30"]),error=>error.code==="23514");
      for(let i=0;i<2;i++) await call(base,"/transactions",post({...valid,type:"income",category:"salary",amount:"999999999.99"}));
      assert.equal((await call(base,"/summary")).body.data.totalIncome,"2000000000.28");
      const text="x'); DROP TABLE expense_tracker.transactions; --";
      const safe=await call(base,"/transactions",post({...valid,description:text}));assert.equal(safe.response.status,201);assert.equal(safe.body.data.description,text);
    });
  } finally {await pool.end();await admin.end();}
});

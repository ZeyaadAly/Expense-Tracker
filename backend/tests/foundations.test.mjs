import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { Router } from "express";
import { createApp } from "../dist/app.js";
import { validateTransaction, cairoToday } from "../dist/validators/transaction.js";
import { validateUuid, validateQuery } from "../dist/validators/request.js";
import { mapTransaction } from "../dist/utils/transaction-mapper.js";
import { formatDecimal } from "../dist/utils/money.js";
import { methodNotAllowed } from "../dist/middleware/request.js";
import { ApiError } from "../dist/utils/api-error.js";

const now = new Date("2026-10-03T12:00:00Z");
const valid = {type:"expense",amount:"10.5",description:"  Lunch  ",category:"food",date:"2026-10-03"};
function invalid(body, field, message) {
  assert.throws(() => validateTransaction(body, now), error => error instanceof ApiError && error.status === 400 && error.code === "VALIDATION_ERROR" && error.details.some(detail => detail.field === field && (!message || detail.message.includes(message))));
}
test("valid inputs, normalization, categories and Unicode boundaries", () => {
  assert.deepEqual(validateTransaction(valid,now), {...valid,amount:"10.50",description:"Lunch"});
  for(const amount of ["0.01","10","999999999.99"]) assert.equal(validateTransaction({...valid,amount},now).amount,formatDecimal(amount));
  for(const date of ["1900-01-01","2000-02-29","2024-02-29"]) assert.equal(validateTransaction({...valid,date},now).date,date);
  assert.equal(validateTransaction({...valid,type:"income",category:"salary"},now).type,"income");
  assert.equal(validateTransaction({...valid,description:"😀".repeat(200)},now).description.length,400);
  for(const type of ["income","expense"]) assert.equal(validateTransaction({...valid,type,category:"other"},now).category,"other");
});
test("shape, missing values, types and metadata fail distinctly", () => {
  for(const body of [null,undefined,[],"text",1,true]) invalid(body,"body");
  assert.throws(()=>validateTransaction({},now),error=>error.details.length===5);
  for(const field of Object.keys(valid)) {
    const body={...valid};delete body[field];invalid(body,field,"required");
    for(const value of [null,42,true,[],{}]) invalid({...valid,[field]:value},field,"string");
  }
  for(const field of ["id","currency","createdAt","updatedAt","unexpected","__proto__"]) invalid(JSON.parse(JSON.stringify(valid).replace(/}$/,`,"${field}":"x"}`)),field,"not allowed");
  for(const type of ["Income",""]) invalid({...valid,type},"type");
});
test("money syntax and exact decimal formatting", () => {
  for(const amount of ["0","0.0","0.00","-1","1000000000","999999999.999","1.234","1e3","NaN","Infinity","010","00.1"," 1","1 ","1,000","1 EGP",".1","1.","+1"]) invalid({...valid,amount},"amount");
  assert.equal(formatDecimal("999999999999999999999999999999.1"),"999999999999999999999999999999.10");
  assert.equal(formatDecimal("-20.1"),"-20.10");assert.throws(()=>formatDecimal("1.234"));
});
test("real calendar dates and Cairo midnight", () => {
  for(const date of ["1899-12-31","1900-02-29","2026-02-30","2026-04-31","2026-13-01","2026-01-00","2026-1-01","2026-10-04","2026-10-03T00:00:00Z"]) invalid({...valid,date},"date");
  assert.equal(cairoToday(new Date("2026-10-02T20:59:59Z")),"2026-10-02");
  assert.equal(cairoToday(new Date("2026-10-02T21:00:00Z")),"2026-10-03");
  assert.throws(()=>validateTransaction(valid,new Date("2026-10-02T20:59:59Z")));
  assert.equal(validateTransaction(valid,new Date("2026-10-02T21:00:00Z")).date,"2026-10-03");
});
test("category pairs, trim and code-point length", () => {
  for(const category of ["salary","unknown","Food",""]) invalid({...valid,category},"category");
  for(const description of ["", " \t\n", "\u00a0", "😀".repeat(201)]) invalid({...valid,description},"description");
  assert.equal(validateTransaction({...valid,description:"\u00a0Plain <b>text</b>\u00a0"},now).description,"Plain <b>text</b>");
});
test("UUID and raw query contracts", () => {
  const id="BB664829-EDDD-4A27-BDDC-076E8C3BF6FE";assert.equal(validateUuid(id),id.toLowerCase());
  for(const value of ["bad",id.replaceAll("-",""),` ${id}`]) assert.throws(()=>validateUuid(value));
  assert.deepEqual(validateQuery("/health"),{});
  assert.deepEqual(validateQuery("/transactions?type=expense&category=food",true),{type:"expense",category:"food"});
  assert.deepEqual(validateQuery("/transactions?category=other",true),{category:"other"});
  for(const query of ["type=all","type=","category=","type=income&category=food","type=expense&type=income","category=other&category=other","type[]=expense","limit=10","unknown=x"]) assert.throws(()=>validateQuery(`/path?${query}`,true));
  assert.throws(()=>validateQuery("/summary?type=expense"));
});
test("mapper returns camelCase, exact money, unchanged dates and UTC timestamps", () => {
  const row={id:"BB664829-EDDD-4A27-BDDC-076E8C3BF6FE",type:"income",amount:"999999999.99",description:"Income",category:"salary",transaction_date:"2026-10-01",created_at:new Date("2026-10-01T12:00:00Z"),updated_at:"2026-10-01T16:00:00+03:00"};
  assert.deepEqual(mapTransaction(row),{id:row.id.toLowerCase(),type:"income",amount:"999999999.99",description:"Income",category:"salary",date:"2026-10-01",currency:"EGP",createdAt:"2026-10-01T12:00:00.000Z",updatedAt:"2026-10-01T13:00:00.000Z"});
  assert.equal(mapTransaction({...row,amount:"0.10"}).amount,"0.10");
  assert.throws(()=>mapTransaction({...row,transaction_date:new Date()}));assert.throws(()=>mapTransaction({...row,updated_at:"invalid"}));
});
async function withServer(health,run) {
  const routes=Router();
  routes.post("/test-input",(request,response)=>response.json({data:validateTransaction(request.body,now)}));
  routes.all("/test-input",methodNotAllowed(["POST"]));
  routes.get("/test-unexpected",async()=>{throw new Error("secret SQL password connection string");});
  routes.get("/test-database",()=>{throw Object.assign(new Error("private driver details"),{code:"ECONNREFUSED"});});
  routes.get("/test-constraint",()=>{throw Object.assign(new Error("private SQL details"),{code:"23514",constraint:"transactions_amount_scale_check"});});
  const server=createApp({clientOrigin:"http://localhost:3000",databaseHealth:health,additionalRoutes:routes}).listen(0,"127.0.0.1");await once(server,"listening");
  try {await run(`http://127.0.0.1:${server.address().port}/api/v1`);} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
async function expectError(base,path,status,code,options={}) {
  const response=await globalThis.fetch(base+path,options);assert.equal(response.status,status);assert.equal(response.headers.get("cache-control"),"no-store");
  const body=await response.json();assert.deepEqual(Object.keys(body),["error"]);assert.deepEqual(Object.keys(body.error),["code","message","details"]);
  assert.equal(body.error.code,code);assert.ok(Array.isArray(body.error.details));assert.doesNotMatch(JSON.stringify(body),/secret|SQL|password|connection string|private driver|stack/);return response;
}
test("HTTP parsing, status codes, no-store, CORS and route policy",async()=>{
  await withServer(async()=>true,async base=>{
    const post={method:"POST",headers:{"Content-Type":"application/json"}};
    const response=await globalThis.fetch(base+"/test-input",{...post,body:JSON.stringify(valid)});assert.equal(response.status,200);assert.equal((await response.json()).data.amount,"10.50");
    const json=JSON.stringify(valid);
    const boundary=await globalThis.fetch(base+"/test-input",{...post,body:json+" ".repeat(16384-json.length)});assert.equal(boundary.status,200);
    await expectError(base,"/test-input",400,"INVALID_JSON",{...post,body:'{"type":'});
    await expectError(base,"/test-input",413,"PAYLOAD_TOO_LARGE",{...post,body:JSON.stringify({text:"x".repeat(16384)})});
    for(const body of ["null","[]","1","\"text\"","{}",undefined]) await expectError(base,"/test-input",400,"VALIDATION_ERROR",{...post,body});
    await expectError(base,"/test-input",415,"UNSUPPORTED_MEDIA_TYPE",{method:"POST",headers:{"Content-Type":"text/plain"},body:"{}"});
    await expectError(base,"/test-input",415,"UNSUPPORTED_MEDIA_TYPE",{method:"POST",headers:{"Content-Type":"application/json; charset=iso-8859-1"},body:"{}"});
    await expectError(base,"/test-input",400,"VALIDATION_ERROR",{method:"DELETE",headers:{"Content-Type":"application/json"},body:"{}"});
    for(const path of ["/does-not-exist","/transactions","/summary"]) await expectError(base,path,404,"ROUTE_NOT_FOUND");
    const unsupported=await expectError(base,"/health",405,"METHOD_NOT_ALLOWED",{method:"PATCH"});assert.equal(unsupported.headers.get("allow"),"GET");
    await expectError(base,"/health",405,"METHOD_NOT_ALLOWED",{...post,body:"{}"});
    await expectError(base,"/health?unexpected=1",400,"VALIDATION_ERROR");
    await expectError(base,"/test-unexpected",500,"INTERNAL_ERROR");await expectError(base,"/test-database",503,"DATABASE_UNAVAILABLE");
    await expectError(base,"/test-constraint",400,"VALIDATION_ERROR");
    await expectError(base,"/test-input",405,"METHOD_NOT_ALLOWED",{method:"DELETE"});
    const preflight=await globalThis.fetch(base+"/health",{method:"OPTIONS",headers:{Origin:"http://localhost:3000","Access-Control-Request-Method":"GET"}});
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get("access-control-allow-origin"),"http://localhost:3000");assert.equal(preflight.headers.get("cache-control"),"no-store");
    const denied=await globalThis.fetch(base+"/health",{headers:{Origin:"https://other.example"}});assert.notEqual(denied.headers.get("access-control-allow-origin"),"https://other.example");
    const getBody=await new Promise((resolve,reject)=>{
      const req=httpRequest(base+"/health",{method:"GET",headers:{"Content-Length":"2","Content-Type":"application/json"}},response=>{
        let body="";response.on("data",chunk=>body+=chunk);response.on("end",()=>resolve({status:response.statusCode,body:JSON.parse(body)}));
      });req.on("error",reject);req.end("{}");
    });assert.equal(getBody.status,400);assert.equal(getBody.body.error.code,"VALIDATION_ERROR");
  });
});
test("health preserves both exact T04 responses",async()=>{
  for(const reachable of [true,false]) await withServer(async()=>reachable,async base=>{
    const response=await globalThis.fetch(base+"/health");assert.equal(response.status,reachable?200:503);assert.equal(response.headers.get("cache-control"),"no-store");
    assert.deepEqual(await response.json(),reachable?{data:{api:"running",database:"reachable"}}:{error:{code:"DATABASE_UNAVAILABLE",message:"Database is unavailable. Please try again later.",details:[]}});
  });
});

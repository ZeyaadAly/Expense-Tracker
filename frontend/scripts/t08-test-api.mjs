// Test-only Express wrapper. Requires an explicitly supplied disposable loopback DB.
// Never imported by the application; production backend configuration is unchanged.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createApp } from '../../backend/dist/app.js';
import { createTransactionService } from '../../backend/dist/services/transactions.js';
import { ApiError } from '../../backend/dist/utils/api-error.js';
const require = createRequire(new URL('../../backend/package.json',import.meta.url));
const {Pool,Client} = require('pg'); const express = require('express');
const url = new URL(process.env.T08_DISPOSABLE_DATABASE_URL || '');
assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname==='/postgres');
const admin=new Client({connectionString:url.toString()});await admin.connect();
url.username='expense_tracker_app';url.password='';
const pool=new Pool({connectionString:url.toString(),max:3});
assert.equal((await pool.query('SELECT current_user')).rows[0].current_user,'expense_tracker_app');
const service=createTransactionService(pool);
let mode='normal';const calls=[];
const failure = () => {throw new ApiError(503,'DATABASE_UNAVAILABLE','Database is unavailable. Please try again later.');};
const wrapped={...service,
  async list(filters) { if(['list-error','both-error'].includes(mode)) failure();const rows=await service.list(filters);if(mode==='slow'||mode==='loading') await new Promise(r=>setTimeout(r,mode==='loading'?1200:filters.type==='expense'?750:100));return rows; },
  async summary() {if(['summary-error','both-error'].includes(mode)) failure();if(mode==='slow'||mode==='loading') await new Promise(r=>setTimeout(r,mode==='loading'?3000:500));return service.summary();},
  async create(values) {
    if(mode==='pending') await new Promise(r=>setTimeout(r,1200));
    if(mode==='validation') throw new ApiError(400,'VALIDATION_ERROR','SQL secret message',[{field:'amount',message:'SQL secret field'},{field:'body',message:'secret body'}]);
    if(mode==='post-503') failure();
    if(mode==='post-500') throw new ApiError(500,'INTERNAL_ERROR','SQL secret');
    const saved=await service.create(values);if(mode==='refresh-error')mode='both-error';return saved;
  },
};
const host=express();host.use(express.json());
host.post('/__test',async(req,res)=> {
  mode=req.body.mode ?? 'normal';if(req.body.empty) await admin.query('TRUNCATE expense_tracker.transactions');
  if(req.body.seed) {await admin.query('TRUNCATE expense_tracker.transactions');await admin.query(readFileSync(new URL('../../supabase/seed.sql',import.meta.url),'utf8'));}
  if(req.body.resetCalls)calls.length=0;res.json({mode});
});
host.get('/__test',async(req,res)=>res.json({mode,calls,rows:(await admin.query('SELECT description,amount::text AS amount FROM expense_tracker.transactions ORDER BY created_at')).rows}));
host.use(async(req,res,next)=>{
  if(req.method!=='OPTIONS')calls.push({method:req.method,path:req.url,body:req.body,origin:req.headers.origin});
  if(mode==='lost'&&req.method==='POST'&&req.path==='/api/v1/transactions') {
    await service.create(req.body);
    // Lose the response after headers: the write commits, but JSON never completes.
    // Destroying a socket before any response can trigger Chrome transport retries.
    res.writeHead(201,{'Content-Type':'application/json','Content-Length':'1000','Access-Control-Allow-Origin':'http://localhost:3000'});
    res.write('{"data":');setTimeout(()=>res.destroy(),50);return;
  }
  next();
});
host.use(createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,transactions:wrapped}));
const server=host.listen(4108,'127.0.0.1',()=>console.log('T08 disposable Express API ready on 127.0.0.1:4108'));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(async()=>{await pool.end();await admin.end();process.exit(0);}));

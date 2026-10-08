// Test-only loopback harness: actual T09/T17/T18/T26 routes and limited-role SQL.
import assert from 'node:assert/strict';
import process from 'node:process';
import {randomBytes} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {Client,Pool} from 'pg';
import express from 'express';
import {createApp} from '../dist/app.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createCategoryService} from '../dist/services/categories.js';
import {createProfileService} from '../dist/services/profiles.js';
import {createTransactionService} from '../dist/services/transactions.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createTransferService} from '../dist/services/transfers.js';
import {ApiError} from '../dist/utils/api-error.js';
import {createTestAuthHarness,prepareIsolationDatabase,disposableIsolationUrl,createTestUser} from '../tests/helpers/v2-isolation.mjs';
const url=disposableIsolationUrl(process.env.T28_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();await prepareIsolationDatabase(admin);
const users={a:{userId:'a2800000-0000-4000-8000-000000000001'},b:{userId:'b2800000-0000-4000-8000-000000000001'}};
for(const user of Object.values(users))await createTestUser(admin,user);
url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href}),auth=await createTestAuthHarness(pool),tokens={a:await auth.createTestAuthToken(users.a),b:await auth.createTestAuthToken(users.b)};
let mode='normal';const calls=[],secret=randomBytes(32).toString('hex');
const watched={query:pool.query.bind(pool),connect:async()=>{
  const client=await pool.connect(),current=mode;
  return {query:async(sql,params)=>{const result=await client.query(sql,params);if(sql==='COMMIT'&&current==='uncertain')throw Object.assign(new Error('Synthetic lost COMMIT acknowledgement'),{code:'ECONNRESET'});return result;},release:e=>client.release(e)};
}};
const service=createTransferService(watched,{cursorSigningSecret:secret}),expired=createTransferService(pool,{cursorSigningSecret:secret,now:()=>Date.now()+25*3600000});
const accountsService=createAccountService(pool),actuals=createV2TransactionService(pool,{cursorSigningSecret:secret});
const fail=()=>{throw new ApiError(503,'DATABASE_UNAVAILABLE','Unavailable.');};
const accounts={...accountsService,
  async listAccounts(user,status){if(mode==='balance-error')fail();return accountsService.listAccounts(user,status);},
  async getSummary(user){if(mode==='balance-error')fail();return accountsService.getSummary(user);},
  async getAccount(user,id){if(mode==='balance-error')fail();return accountsService.getAccount(user,id);},
  async getAccountSummary(user,id){if(mode==='balance-error')fail();return accountsService.getAccountSummary(user,id);},
};
function record(operation,user){calls.push({operation,user:user===users.a.userId?'a':'b'});}
const transfers={...service,
  async listTransfers(user,query){record('list',user);const current=mode;if(current==='read-error')fail();const result=await(current==='expired'&&query.cursor?expired:service).listTransfers(user,query);if(current==='slow')await pause(1000);return result;},
  async getTransfer(user,id){record('get',user);if(mode==='read-error')fail();return service.getTransfer(user,id);},
  async createTransfer(user,input){record('create',user);if(mode==='validation')throw new ApiError(400,'VALIDATION_ERROR','Check fields.',[{field:'amount',message:'Choose a different amount for this synthetic validation probe.'}]);if(mode==='reject')fail();if(mode==='pending')await pause(1000);const result=await service.createTransfer(user,input);if(mode==='saved-refresh-error')mode='balance-error';return result;},
  async updateTransfer(user,id,input){record('edit',user);if(mode==='pending')await pause(1000);const result=await service.updateTransfer(user,id,input);if(mode==='saved-refresh-error')mode='balance-error';return result;},
  async deleteTransfer(user,id){record('delete',user);if(mode==='pending')await pause(1000);await service.deleteTransfer(user,id);if(mode==='saved-refresh-error')mode='balance-error';},
};
const server=express();server.use(express.json());server.use((_request,response,next)=>{response.set('Access-Control-Allow-Origin','http://localhost:3000');next();});
server.get('/test/session/:user',(request,response)=>{const key=request.params.user;assert.ok(key==='a'||key==='b');const now=Math.floor(Date.now()/1000);response.json({access_token:tokens[key],refresh_token:'local-fixture-only',token_type:'bearer',expires_in:900,expires_at:now+900,user:{id:users[key].userId,email:`${key}@example.invalid`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-08T00:00:00Z'}});});
server.post('/test/mode',(request,response)=>{assert.ok(['normal','slow','expired','read-error','balance-error','validation','reject','pending','saved-refresh-error','uncertain'].includes(request.body.mode));mode=request.body.mode;response.json({ok:true});});
server.get('/test/calls',(_request,response)=>response.json(calls));
server.post('/test/seed',async(request,response)=>{const input=request.body;for(let i=0;i<26;i++)await service.createTransfer(users.a.userId,{...input,amount:'0.01',date:'1900-01-01',description:'Page movement '+String(i).padStart(2,'0')});response.json({ok:true});});
server.post('/test/actuals',async(request,response)=>{for(const [type,amount,categoryId] of [['income','1.10','c1200000-0000-4000-8000-000000000001'],['expense','0.20','c1200000-0000-4000-8000-000000000004']])await actuals.createTransaction(users.a.userId,{accountId:request.body.accountId,categoryId,type,amount,date:'1900-01-01',description:'T28 fixed actuals'});response.json({ok:true});});
server.get('/test/state',async(_request,response)=>response.json({counts:(await admin.query('SELECT user_id,count(*)::int FROM expense_tracker.transfers GROUP BY user_id')).rows,role:(await pool.query('SELECT current_user AS role')).rows[0].role}));
server.use(createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,supabaseUrl:auth.origin,accounts,categories:createCategoryService(pool),profiles:createProfileService(pool),transactions:createTransactionService(pool),v2Transactions:actuals,transfers}));
const listener=server.listen(4000,'127.0.0.1',()=>process.stdout.write('T28 local fixture API ready\n'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));await auth.close();await pool.end();await admin.end();process.exit(0);});

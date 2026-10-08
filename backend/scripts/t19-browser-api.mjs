// Test-only loopback fixture server. Never loads .env or hosted credentials.
import assert from 'node:assert/strict';
import process from 'node:process';
import {setTimeout} from 'node:timers';
import {Client,Pool} from 'pg';
import express from 'express';
import {createApp} from '../dist/app.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createProfileService} from '../dist/services/profiles.js';
import {createTransactionService} from '../dist/services/transactions.js';
import {createTestAuthHarness,prepareIsolationDatabase,disposableIsolationUrl,createTestUser} from '../tests/helpers/v2-isolation.mjs';
import {ApiError} from '../dist/utils/api-error.js';

const url=disposableIsolationUrl(process.env.T19_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();await prepareIsolationDatabase(admin);
const users={a:{userId:'a1900000-0000-4000-8000-000000000001'},b:{userId:'b1900000-0000-4000-8000-000000000001'}};
for(const user of Object.values(users))await createTestUser(admin,user);
url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href});const auth=await createTestAuthHarness(pool);
const tokens={a:await auth.createTestAuthToken(users.a),b:await auth.createTestAuthToken(users.b)};
const service=createAccountService(pool);let mode='normal';const calls=[];
const fail=()=>{throw new ApiError(503,'DATABASE_UNAVAILABLE','Database unavailable.');};
const wrapped={...service,
  async getAccount(user,id){calls.push({operation:'detail',user:user===users.a.userId?'a':'b'});const current=mode;if(current==='read-error')fail();const row=await service.getAccount(user,id);if(current==='slow')await new Promise(r=>setTimeout(r,1200));return row;},
  async getAccountSummary(user,id){if(mode==='read-error')fail();return service.getAccountSummary(user,id);},
  async updateAccount(user,id,input){if(mode==='mutation-503')fail();if(mode==='locked')throw new ApiError(409,'ACCOUNT_CONFLICT','Posted activity locked this account.');return service.updateAccount(user,id,input);},
  async listAccounts(user,status){calls.push({operation:'list',user:user===users.a.userId?'a':'b',status});const current=mode;if(current==='read-error')fail();const rows=await service.listAccounts(user,status);if(current==='slow')await new Promise(r=>setTimeout(r,1200));return rows;},
  async getSummary(user){if(mode==='read-error')fail();return service.getSummary(user);},
  async createAccount(user,input){calls.push({operation:'create',user:user===users.a.userId?'a':'b'});if(mode==='validation')throw new ApiError(400,'VALIDATION_ERROR','Check fields.',[{field:'name',message:'This account name is unavailable. Choose another name while keeping your draft. '.repeat(5)}]);if(mode==='mutation-503')fail();if(mode==='pending')await new Promise(r=>setTimeout(r,1200));const row=await service.createAccount(user,input);if(mode==='saved-refresh-error')mode='read-error';if(mode==='uncertain')throw new ApiError(500,'INTERNAL_ERROR','Sanitized failure.');return row;},
};
const server=express();server.use(express.json());server.use((_request,response,next)=>{response.set('Access-Control-Allow-Origin','http://localhost:3000');next();});
server.get('/test/session/:user',(request,response)=>{const key=request.params.user;assert.ok(key==='a'||key==='b');const now=Math.floor(Date.now()/1000);response.json({access_token:tokens[key],refresh_token:'local-fixture-only',token_type:'bearer',expires_in:900,expires_at:now+900,user:{id:users[key].userId,email:`${key}@example.invalid`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-07T00:00:00Z'}});});
server.post('/test/mode',(request,response)=>{mode=request.body.mode;response.json({ok:true});});
server.get('/test/calls',(_request,response)=>response.json(calls));
server.post('/test/stress',async(_request,response)=>{const user=users.a.userId;await service.createAccount(user,{name:'National Bank Savings and Emergency Reserve Account',type:'bank',openingBalance:'999999999.99'});await service.createAccount(user,{name:'Negative asset',type:'cash',openingBalance:'-999999999.99'});await service.createAccount(user,{name:'Card credit',type:'credit_card',openingBalance:'-250.00'});const account=(await service.listAccounts(user,'active'))[0];await pool.query("INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date) VALUES(gen_random_uuid(),$1,$2,'c1200000-0000-4000-8000-000000000001','income',0.01,'Lock fixture','1900-01-01')",[user,account.id]);await pool.query("INSERT INTO expense_tracker.recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,start_date,next_occurrence) VALUES($1,$2,'c1200000-0000-4000-8000-000000000004','expense',1.00,'Archive pause fixture','monthly','1900-01-01','1900-02-01')",[user,account.id]);response.json({ok:true});});
server.get('/test/state',async(_request,response)=>response.json({accounts:(await admin.query('SELECT name,status FROM expense_tracker.accounts ORDER BY name')).rows,recurring:(await admin.query('SELECT status FROM expense_tracker.recurring_transactions')).rows}));
server.use(createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,supabaseUrl:auth.origin,accounts:wrapped,profiles:createProfileService(pool),transactions:createTransactionService(pool)}));
const listener=server.listen(4000,'127.0.0.1',()=>process.stdout.write('T19 local fixture API ready\n'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{listener.closeAllConnections();await new Promise(r=>listener.close(r));await auth.close();await pool.end();await admin.end();process.exit(0);});

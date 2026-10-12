// Test-only loopback harness. All application operations use existing production services.
import assert from 'node:assert/strict';
import process from 'node:process';
import {once} from 'node:events';
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
import {createRecurringService} from '../dist/services/recurring.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {ApiError} from '../dist/utils/api-error.js';
import {cairoToday} from '../dist/validators/transaction.js';
import {createTestAuthHarness,prepareIsolationDatabase,disposableIsolationUrl,createTestUser} from '../tests/helpers/v2-isolation.mjs';
const url=disposableIsolationUrl(process.env.T34_DISPOSABLE_DATABASE_URL),admin=new Client({connectionString:url.href});await admin.connect();await prepareIsolationDatabase(admin);
const users={a:{userId:'a3400000-0000-4000-8000-000000000001'},b:{userId:'b3400000-0000-4000-8000-000000000001'}};
for(const user of Object.values(users))await createTestUser(admin,user);
url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href}),auth=await createTestAuthHarness(pool),tokens={a:await auth.createTestAuthToken(users.a),b:await auth.createTestAuthToken(users.b)};
const accounts=createAccountService(pool),actuals=createV2TransactionService(pool,{cursorSigningSecret:randomBytes(32).toString('hex')}),service=createRecurringService(pool);
const account=await accounts.createAccount(users.a.userId,{name:('A cash '+ 'Long account '.repeat(7)).trim(),type:'cash',openingBalance:'0.00'});
const second=await accounts.createAccount(users.a.userId,{name:'A bank',type:'bank',openingBalance:'0.00'});
const custom='a3400000-0000-4000-8000-000000000003';
await pool.query("INSERT INTO expense_tracker.categories(id,user_id,name,kind) VALUES($1,$2,$3,'both')",[custom,users.a.userId,('Long custom category '+ 'name '.repeat(6)).trim()]);
let mode='normal';const calls=[];
const fail=()=>{throw new ApiError(503,'DATABASE_UNAVAILABLE','Unavailable.');};
const recurring={...service};
for(const name of ['listRecurring','upcomingRecurring','getRecurring','createRecurring','updateRecurring','pauseRecurring','resumeRecurring','archiveRecurring'])recurring[name]=async(...args)=>{
  calls.push({operation:name,user:args[0]===users.a.userId?'a':'b'});
  const current=mode,write=!['listRecurring','upcomingRecurring','getRecurring'].includes(name);
  if((current==='read-error'&&!write)||(current==='list-error'&&name==='listRecurring')||(current==='upcoming-error'&&name==='upcomingRecurring'))fail();
  if(current==='validation'&&write)throw new ApiError(400,'VALIDATION_ERROR','Check fields.',[{field:'amount',message:'Choose a different amount for this validation probe.'}]);
  if(current==='slow'||(current==='pending'&&write))await pause(900);
  const result=await service[name](...args);
  if(current==='saved-refresh-error'&&write)mode='read-error';
  return result;
};
const server=express();server.use(express.json());server.use((_request,response,next)=>{response.set('Access-Control-Allow-Origin','http://localhost:3000');next();});
server.get('/test/session/:user',(request,response)=>{const key=request.params.user;assert.ok(key==='a'||key==='b');const now=Math.floor(Date.now()/1000);response.json({access_token:tokens[key],refresh_token:'local-fixture-only',token_type:'bearer',expires_in:900,expires_at:now+900,user:{id:users[key].userId,email:`${key}@example.invalid`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-12T00:00:00Z'}});});
server.post('/test/mode',(request,response)=>{assert.ok(['normal','slow','pending','read-error','list-error','upcoming-error','validation','saved-refresh-error','uncertain'].includes(request.body.mode));mode=request.body.mode;response.json({ok:true});});
server.get('/test/calls',(_request,response)=>response.json(calls));
server.get('/test/context',(_request,response)=>response.json({account,second,custom,today:cairoToday()}));
server.post('/test/parents',async(request,response)=>{
  const {parent,status}=request.body;assert.ok(['account','category'].includes(parent)&&['active','archived'].includes(status));
  if(parent==='account')await (status==='archived'?accounts.archiveAccount:accounts.restoreAccount)(users.a.userId,account.id);
  else await admin.query('UPDATE expense_tracker.categories SET status=$2 WHERE id=$1',[custom,status]);
  response.json({ok:true});
});
server.post('/test/process',async(_request,response)=>response.json(await createRecurringProcessor(pool).processDueRecurring({referenceDate:cairoToday()})));
server.get('/test/state',async(_request,response)=>response.json({definitions:(await service.listRecurring(users.a.userId,{})),transactions:(await pool.query('SELECT count(*)::int count FROM expense_tracker.transactions')).rows[0].count,role:(await pool.query('SELECT current_user role')).rows[0].role}));
server.use((request,response,next)=>{
  if(mode==='uncertain'&&['POST','PUT'].includes(request.method)&&request.path.startsWith('/api/v2/recurring')){
    response.json=()=>{mode='normal';response.writeHead(200,{'Content-Type':'application/json'});response.write('{"data":');setTimeout(()=>response.destroy(),25);return response;};
  }
  next();
});
server.use(createApp({clientOrigin:'http://localhost:3000',databaseHealth:async()=>true,supabaseUrl:auth.origin,accounts,categories:createCategoryService(pool),profiles:createProfileService(pool),transactions:createTransactionService(pool),v2Transactions:actuals,recurring}));
const listener=server.listen(4000,'127.0.0.1');await once(listener,'listening');process.stdout.write('T34 local disposable API ready\n');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));await auth.close();await pool.end();await admin.end();process.exit(0);});

// Entire P0 local API, synthetic ES256 identity, disposable PostgreSQL only.
/* global process, console, setTimeout */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,basename,dirname} from 'node:path';
import {createServer} from 'node:http';
import {generateKeyPair,exportJWK,importJWK,SignJWT} from 'jose';
import {Client,Pool} from 'pg';
import express from 'express';
import {createApp} from '../dist/app.js';
import {createProfileService} from '../dist/services/profiles.js';
import {createCategoryService} from '../dist/services/categories.js';
import {createAccountService} from '../dist/services/accounts.js';
import {createV2TransactionService} from '../dist/services/v2-transactions.js';
import {createTransferService} from '../dist/services/transfers.js';
import {createRecurringService} from '../dist/services/recurring.js';
import {createRecurringProcessor} from '../dist/services/recurring-processor.js';
import {createBudgetService} from '../dist/services/budgets.js';
import {createGoalService} from '../dist/services/goals.js';
import {createDashboardService} from '../dist/services/dashboard.js';
import {createAnalyticsService} from '../dist/services/analytics.js';
import {disposableIsolationUrl,prepareIsolationDatabase,createTestUser} from '../tests/helpers/v2-isolation.mjs';

const t62=process.env.T62_DISPOSABLE_DATABASE_URL;
const url=disposableIsolationUrl(t62??process.env.T58_DISPOSABLE_DATABASE_URL);
const admin=new Client({connectionString:url.href});await admin.connect();
const directory=realpathSync((await admin.query('SHOW data_directory')).rows[0].data_directory);
assert.equal(basename(directory),'pgdata');assert.equal(basename(dirname(directory)),t62?'.tmp-v2-t62':'.tmp-v2-t58');
const users={a:{userId:'a5800000-0000-4000-8000-000000000001'},b:{userId:'b5800000-0000-4000-8000-000000000001'}};
if(!(await admin.query("SELECT 1 FROM pg_namespace WHERE nspname='expense_tracker'")).rowCount){await prepareIsolationDatabase(admin);for(const user of Object.values(users))await createTestUser(admin,user);}
const keyPath=resolve(directory,'../synthetic-key.json');
if(!existsSync(keyPath)){const pair=await generateKeyPair('ES256',{extractable:true});writeFileSync(keyPath,JSON.stringify({private:await exportJWK(pair.privateKey),public:await exportJWK(pair.publicKey)}));}
const keys=JSON.parse(readFileSync(keyPath,'utf8')),privateKey=await importJWK(keys.private,'ES256'),publicKey={...keys.public,kid:'t58-local',alg:'ES256',use:'sig'};
const issuer='http://127.0.0.1:4001';
const jwks=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[publicKey]}));}).listen(4001,'127.0.0.1');await once(jwks,'listening');
url.username='expense_tracker_app';const pool=new Pool({connectionString:url.href});
const tokens=Object.fromEntries(await Promise.all(Object.entries(users).map(async([k,u])=>[k,await new SignJWT({sub:u.userId,role:'authenticated'}).setProtectedHeader({alg:'ES256',kid:publicKey.kid}).setIssuer(issuer+'/auth/v1').setAudience('authenticated').setExpirationTime('2h').sign(privateKey)])));
let mode='normal',failure=false;const calls=[];
const server=express();server.use(express.json());
server.use((_req,res,next)=>{res.set('Access-Control-Allow-Origin','http://localhost:3000');next();});
server.get('/test/session/:which',(req,res)=>{const k=req.params.which;assert.ok(users[k]);const now=Math.floor(Date.now()/1000);res.json({access_token:tokens[k],refresh_token:'synthetic-local-only',token_type:'bearer',expires_in:7200,expires_at:now+7200,user:{id:users[k].userId,email:k+'@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-15T00:00:00Z'}});});
server.get('/test/calls',(_req,res)=>res.json(calls));
server.post('/test/mode',(req,res)=>{assert.ok(['normal','slow','read-error','saved-stale','lost-write','auth-error'].includes(req.body.mode));mode=req.body.mode;res.json({ok:true});});
server.post('/test/process',async(_req,res)=>res.json(await createRecurringProcessor(pool).processDueRecurring({referenceDate:'2026-10-15'})));
server.use(async(req,res,next)=>{
  if(!req.path.startsWith('/api/v2/'))return next();
  calls.push({path:req.path,method:req.method,user:req.headers.authorization===`Bearer ${tokens.a}`?'a':'b'});
  if(mode==='auth-error')return res.status(401).json({error:{code:'AUTH_INVALID',message:'Expired',details:[]}});
  if(req.method==='GET'&&(mode==='read-error'||failure)){failure=false;return res.status(503).json({error:{code:'DATABASE_UNAVAILABLE',message:'Unavailable',details:[]}});}
  if(mode==='slow')await new Promise(r=>setTimeout(r,1300));
  if(req.method!=='GET'&&mode==='saved-stale')failure=true;
  if(req.method!=='GET'&&mode==='lost-write'){
    const lose=()=>{res.writeHead(500,{'Content-Type':'application/json'});res.flushHeaders();req.socket.destroy();return res;};
    const json=res.json.bind(res);res.json=body=>res.statusCode<300?lose():json(body);
    const end=res.end.bind(res);res.end=(...args)=>res.statusCode===204?lose():end(...args);
  }
  next();
});
server.use(createApp({clientOrigin:'http://localhost:3000',financialMode:'v2',databaseHealth:async()=>true,supabaseUrl:issuer,profiles:createProfileService(pool),categories:createCategoryService(pool),categoryManagement:true,accounts:createAccountService(pool),v2Transactions:createV2TransactionService(pool,{cursorSigningSecret:'58'.repeat(32)}),transfers:createTransferService(pool,{cursorSigningSecret:'58'.repeat(32)}),recurring:createRecurringService(pool,t62?{}:{now:()=>new Date('2026-10-15T09:00:00Z')}),budgets:createBudgetService(pool),goals:createGoalService(pool),dashboard:createDashboardService(pool,{now:()=>new Date('2026-10-15T09:00:00Z')}),analytics:createAnalyticsService(pool)}));
const listener=server.listen(4000,'127.0.0.1');await once(listener,'listening');console.log('T58 disposable full API ready');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{listener.closeAllConnections();jwks.closeAllConnections();await Promise.all([new Promise(r=>listener.close(r)),new Promise(r=>jwks.close(r))]);await pool.end();await admin.end();process.exit(0);});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createRequireAuth } from '../dist/middleware/auth.js';
import { errorHandler } from '../dist/middleware/error-handler.js';
import { loadV2Client } from '../../frontend/tests/v2-client-loader.mjs';
const { createV2ApiClient } = await loadV2Client();

test('T10 actual frontend transport → ES256/JWKS → T09 trusted identity and failures', async () => {
  const pair=await generateKeyPair('ES256');const jwk={...await exportJWK(pair.publicKey),kid:'t10',alg:'ES256',use:'sig'};
  let unavailable=false;
  const jwks=createServer((_req,res)=>{res.writeHead(unavailable?503:200,{'Content-Type':'application/json'});res.end(JSON.stringify({keys:[jwk]}));}).listen(0,'127.0.0.1');await once(jwks,'listening');
  const origin=`http://127.0.0.1:${jwks.address().port}`;const id='11111111-1111-4111-8111-111111111111';
  const sign=exp=>new SignJWT({sub:id,role:'authenticated',user_metadata:{userId:'spoofed'}}).setProtectedHeader({alg:'ES256',kid:'t10'}).setIssuer(origin+'/auth/v1').setAudience('authenticated').setExpirationTime(exp).sign(pair.privateKey);
  const app=express();app.use(express.json());let requests=0;
  app.use((_req,_res,next)=>{requests++;next()});
  app.all('/api/v2/probe',createRequireAuth(origin),(req,res)=>res.json({data:{userId:req.auth.userId,amount:req.body?.amount??'999999999999.99'}}));
  app.get('/api/v2/unavailable',createRequireAuth(origin),(_req,res)=>res.json({data:'must not run'}));
  app.get('/api/v2/validation',createRequireAuth(origin),(_req,res)=>res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Check fields.',details:[{field:'amount',message:'Amount must be positive.'}]}}));
  app.delete('/api/v2/empty',createRequireAuth(origin),(_req,res)=>res.status(204).end());app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const baseUrl=`http://127.0.0.1:${server.address().port}/api/v1`;
  let token=await sign(Math.floor(Date.now()/1000)+900);
  const api=createV2ApiClient({baseUrl,tokenSupplier:async()=>({data:token,error:null})});
  try {
    assert.deepEqual(await api.get('/probe',{query:{userId:'spoofed'}}),{data:{userId:id,amount:'999999999999.99'}});
    assert.deepEqual(await api.post('/probe',{userId:'spoofed',amount:'0.01'}),{data:{userId:id,amount:'0.01'}});
    const before=requests;token=null;await assert.rejects(api.get('/probe'),e=>e.code==='AUTH_REQUIRED'&&e.status===0);assert.equal(requests,before);
    token='invalid';await assert.rejects(api.get('/probe'),e=>e.code==='AUTH_INVALID'&&e.status===401&&e.kind==='auth');
    token=await sign(1);await assert.rejects(api.get('/probe'),e=>e.code==='AUTH_INVALID'&&e.kind==='auth');
    token=await sign(Math.floor(Date.now()/1000)+900);
    await assert.rejects(api.get('/validation'),e=>e.kind==='validation'&&e.details[0].field==='amount');
    assert.equal(await api.delete('/empty'),undefined);
    unavailable=true;await assert.rejects(api.get('/unavailable'),e=>e.status===503&&e.code==='AUTH_UNAVAILABLE'&&e.kind==='server');
  } finally {for(const service of [server,jwks]){service.closeAllConnections();await new Promise(r=>service.close(r));}}
  await assert.rejects(api.get('/probe'),e=>e.kind==='network'&&e.status===0);
});

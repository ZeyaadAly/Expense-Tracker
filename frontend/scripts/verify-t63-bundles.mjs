// Analyze existing optimized output; run npm run build first. No hosted access.
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {gzipSync} from 'node:zlib';
const root=resolve('frontend/.next'),out=resolve('.tmp-v2-t63/evidence');mkdirSync(out,{recursive:true});
assert.ok(statSync(resolve(root,'BUILD_ID')).isFile());
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]);
const chunks=walk(resolve(root,'static/chunks')).filter(p=>p.endsWith('.js')).map(p=>{const b=readFileSync(p);return {path:relative(root,p).replaceAll('\\','/'),bytes:b.length,gzipBytes:gzipSync(b).length};}).sort((a,b)=>b.bytes-a.bytes);
const manifests=walk(resolve(root,'server/app')).filter(p=>p.endsWith('client-reference-manifest.js'));
const modules=new Set(),routes=[];for(const file of manifests){const text=readFileSync(file,'utf8'),match=text.match(/__RSC_MANIFEST\[.*?\] = (\{.*\});?/);assert.ok(match,file);const manifest=JSON.parse(match[1]);for(const name of Object.keys(manifest.clientModules))modules.add(name);const assets=[...new Set(Object.values(manifest.clientModules).flatMap(m=>m.chunks))];routes.push({route:relative(resolve(root,'server/app'),file).replaceAll('\\','/'),chunks:assets,bytes:assets.reduce((n,a)=>n+(chunks.find(c=>'/'+c.path===a.replace('/_next',''))?.bytes??0),0),note:'Union of referenced chunks; gated routes return 404 and do not serve the full financial UI'});}
const product=[...modules].filter(m=>m.includes('/src/'));
assert.ok(product.length>0,'Manifest review must inspect actual product modules');
const result={mode:'optimized production, ordinary financial gates preserved',chunks,routes,allChunkBytes:chunks.reduce((n,c)=>n+c.bytes,0),allChunkGzipBytes:chunks.reduce((n,c)=>n+c.gzipBytes,0),note:'All emitted chunks are not a per-route first-load total. Next 16 build does not print per-route byte sizes.',clientManifestModules:product,fixtureModuleReferences:product.filter(m=>/fixtures|fixture-data/.test(m)),heavyChartsInManifest:[...modules].filter(m=>/recharts|chart\.js|d3\//.test(m)),supabaseVersion:JSON.parse(readFileSync('frontend/node_modules/@supabase/supabase-js/package.json','utf8')).version};
assert.deepEqual(result.fixtureModuleReferences,[]);assert.deepEqual(result.heavyChartsInManifest,[]);
writeFileSync(resolve(out,'bundles.json'),JSON.stringify(result,null,2)+'\n');
console.log('T63 bundle inventory: '+chunks.length+' chunks; '+result.allChunkBytes+' total emitted bytes');

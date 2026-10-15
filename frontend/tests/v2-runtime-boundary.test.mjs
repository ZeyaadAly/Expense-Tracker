import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

test('Connected V2 routes and shared Auth/shell have no transitive finance fixture dependency',()=>{
  const root=fileURLToPath(new URL('../src/',import.meta.url));
  const starts=['features/v2/protected-boundary.tsx','features/v2/shell.tsx',...['dashboard','accounts','transactions','recurring','analytics','budgets','goals','settings'].map(s=>'app/v2/'+s+'/page.tsx'),'app/v2/accounts/[id]/page.tsx'];
  const visited=new Set();
  function visit(file){if(visited.has(file))return;visited.add(file);assert.doesNotMatch(file,/[/\\](?:fixtures|prototype-context|pages|editor)(?:[/\\]|\.tsx?$)/,file);const source=readFileSync(file,'utf8');for(const [,specifier]of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)){if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))continue;const base=specifier.startsWith('@/')?resolve(root,specifier.slice(2)):resolve(dirname(file),specifier);const dependency=[base+'.ts',base+'.tsx',resolve(base,'index.ts'),resolve(base,'index.tsx')].find(existsSync);if(dependency)visit(dependency);}}
  starts.forEach(p=>visit(resolve(root,p)));assert.ok(visited.size>30);
});

import { readFileSync } from 'node:fs';
import ts from 'typescript';

export async function loadV2Client() {
  const source = readFileSync(new URL('../src/lib/api/v2-client.ts', import.meta.url), 'utf8')
    .replace('import { getAccessToken } from "../auth/auth-service";', 'const getAccessToken = async () => ({data:null,error:null});');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

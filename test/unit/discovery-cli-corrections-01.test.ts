import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Execute the actual CLI source in a child with all imports replaced by VM synthetic
// modules. No database or transport can be reached; stdout remains an OS pipe.
const harness = `
const vm = require('node:vm'), fs = require('node:fs'), ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('tools/run-seed-ingest.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const context = vm.createContext({process,console,URL,Date,Map,Set,Number,Error,Infinity});
const summary = {complete:process.env.DC1_COMPLETE==='true', payload:'x'.repeat(150000), tail:'END_OF_SUMMARY'};
const main = new vm.SourceTextModule(source,{context});
(async()=>{await main.link((specifier, referring)=>{
 const ast = ts.createSourceFile('cli.js',source,ts.ScriptTarget.Latest,true);
 const names=[]; for(const stmt of ast.statements){if(ts.isImportDeclaration(stmt)&&stmt.moduleSpecifier.text===specifier){for(const el of stmt.importClause?.namedBindings?.elements??[])names.push(el.propertyName?.text??el.name.text)}}
 return new vm.SyntheticModule(names,function(){for(const name of names){let value=()=>{throw Error('Unexpected dependency '+name)};
 if(name==='env')value=()=>({USER_AGENT:'fixture',ROBOTS_CACHE_TTL_SECONDS:0,DEFAULT_HOST_RATE_DELAY_MS:0});
 if(name==='prisma')value=()=>({}); if(name==='disconnectPrisma')value=async()=>{};
 if(name==='FetchPolicyGate')value=class {}; if(name==='prepareDiscovery')value=async()=>summary;
 this.setExport(name,value)}},{context});
});await main.evaluate()})().catch(e=>{console.error(e);process.exitCode=1});
`
it.each([true, false])('RR1-06 emits complete >64 KiB JSON to a pipe with complete=%s and correct exit', (complete) => {
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '-e', harness, '--', '--discovery', '--limit', '1'], { env: { ...process.env, DC1_COMPLETE: String(complete) }, maxBuffer: 2 * 1024 * 1024 })
  const dir = mkdtempSync(join(tmpdir(), 'joboss-dc1-cli-'))
  writeFileSync(join(dir, 'stdout.json'), result.stdout); writeFileSync(join(dir, 'stderr.log'), result.stderr)
  expect(result.status, String(result.stderr)).toBe(complete ? 0 : 2)
  expect(result.stdout.length).toBeGreaterThan(64 * 1024)
  expect(JSON.parse(readFileSync(join(dir, 'stdout.json'), 'utf8'))).toEqual({ complete, payload: 'x'.repeat(150000), tail: 'END_OF_SUMMARY' })
})

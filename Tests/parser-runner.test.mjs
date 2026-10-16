import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const runner = new URL('../Sources/CodexPPCore/Resources/parser-runner.js', import.meta.url);
function run(adapter, input, deadline) {
  const directory=mkdtempSync(join(tmpdir(),'codexpp-parser-test-'));
  try {
    const request=join(directory,'input.json'),output=join(directory,'output.json');
    writeFileSync(request,JSON.stringify(input));
    const result=spawnSync(process.execPath,[runner.pathname,adapter,request,output,...(deadline === undefined ? [] : [deadline])],{encoding:'utf8',timeout:10000});
    return {...result,output:existsSync(output)?JSON.parse(readFileSync(output,'utf8')):undefined};
  } finally {rmSync(directory,{recursive:true,force:true});}
}
const source='throw Error("VENDOR SOURCE EXECUTED");function menu({params:p,webContents:c,window:w,onComment:a,onInspect:b,isAnnotationModeEnabled:d}){Menu.buildFromTemplate([]).popup({window:w});}';
test('Parser runner adapts vendor code as data without executing it',()=>{
  const result=run('browser',{source});
  assert.equal(result.status,0,result.stderr);
  assert.ok(result.output.includes('frame:globalThis.__codexPPNativeBrowser?.frameForContextMenu(p,c,w)'));
  assert.ok(result.output.startsWith('throw Error("VENDOR SOURCE EXECUTED")'));
});
test('Parser runner preserves ambiguous-contract rejection',()=>{
  const result=run('browser',{source:source+source.slice(source.indexOf('function menu')).replace('menu(','other(')});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/expected one match, found 2/);
  assert.equal(result.output,undefined);
});
test('Parser runner rejects unknown operations',()=>{
  const result=run('../anything',{source});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Unknown parser adapter/);
});
test('Parser runner accepts the bounded retry deadline and keeps contract rejection',()=>{
  const result=run('browser',{source},'175000');
  assert.equal(result.status,0,result.stderr);
  const ambiguous=run('browser',{source:source+source.slice(source.indexOf('function menu')).replace('menu(','other(')},'175000');
  assert.notEqual(ambiguous.status,0);
  assert.match(ambiguous.stderr,/expected one match, found 2/);
});
test('Parser runner rejects invalid or unbounded deadlines',()=>{
  for (const deadline of ['0','175001','Infinity','-1','1.5','']) {
    const result=run('browser',{source},deadline);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Invalid parser deadline/);
    assert.equal(result.output,undefined);
  }
});
test('Parser deadline is enforced by the VM and a larger bound permits completion',()=>{
  const directory=mkdtempSync(join(tmpdir(),'codexpp-parser-deadline-'));
  try {
    writeFileSync(join(directory,'parser-runner.cjs'),readFileSync(runner));
    writeFileSync(join(directory,'acorn.js'),'');
    writeFileSync(join(directory,'browser-adapter.js'),'var CodexPPBrowserAdapter={adapt(){const end=Date.now()+40;while(Date.now()<end){};return "done";}};');
    const request=join(directory,'input.json'),output=join(directory,'output.json');
    writeFileSync(request,'{}');
    const invoke=deadline=>spawnSync(process.execPath,[join(directory,'parser-runner.cjs'),'browser',request,output,deadline],{encoding:'utf8',timeout:10000});
    const short=invoke('1');
    assert.notEqual(short.status,0);
    assert.match(short.stderr,/ERR_SCRIPT_EXECUTION_TIMEOUT/);
    assert.equal(existsSync(output),false);
    const retry=invoke('175000');
    assert.equal(retry.status,0,retry.stderr);
    assert.equal(JSON.parse(readFileSync(output,'utf8')),'done');
  } finally {rmSync(directory,{recursive:true,force:true});}
});

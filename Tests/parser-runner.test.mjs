import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const runner = new URL('../Sources/CodexPPCore/Resources/parser-runner.js', import.meta.url);
function run(adapter, input) {
  const directory=mkdtempSync(join(tmpdir(),'codexpp-parser-test-'));
  try {
    const request=join(directory,'input.json'),output=join(directory,'output.json');
    writeFileSync(request,JSON.stringify(input));
    const result=spawnSync(process.execPath,[runner.pathname,adapter,request,output],{encoding:'utf8',timeout:10000});
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

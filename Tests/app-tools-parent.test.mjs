import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import test from 'node:test';

const wrapper = new URL('../Sources/CodexPPCore/Resources/app-tools-parent.mjs', import.meta.url);

function run(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrapper.pathname, ...args], {stdio:['pipe','pipe','pipe']});
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', value => stdout += value);
    child.stderr.setEncoding('utf8').on('data', value => stderr += value);
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({code, signal, stdout, stderr}));
    child.stdin.end(input);
  });
}

test('relays MCP stdio and the child exit status', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codexpp-app-tools-parent-'));
  const child = join(directory, 'child.mjs');
  await writeFile(child, "process.stdin.setEncoding('utf8');let s='';process.stdin.on('data',v=>s+=v);process.stdin.on('end',()=>{process.stdout.write(s.toUpperCase());process.exit(23)})");
  const result = await run([child], 'thread tools\n');
  assert.equal(result.stdout, 'THREAD TOOLS\n');
  assert.equal(result.code, 23);
  assert.equal(result.signal, null);
});

test('fails closed when the child command is missing', async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrapper.pathname], {stdio:['ignore','pipe','pipe']});
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', value => stderr += value);
    child.once('error', reject);
    child.once('exit', code => resolve({code, stderr}));
  });
  assert.equal(result.code, 64);
  assert.match(result.stderr, /missing MCP server path/);
});

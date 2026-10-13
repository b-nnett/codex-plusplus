#!/usr/bin/env node
// Summarize a V8 .heapsnapshot written by a traced launch
// (CODEXPP_TRACE_HEAP_SNAPSHOT=1): self size by object type and constructor,
// and the largest single objects and strings. Usage: node scripts/heap-summary.mjs FILE [--top N]
import fs from 'node:fs';

const file = process.argv[2];
const top = Number(process.argv[process.argv.indexOf('--top') + 1]) || 25;
if (!file) { console.error('usage: heap-summary.mjs FILE.heapsnapshot [--top N]'); process.exit(64); }

// Snapshots of large heaps exceed V8's maximum string length, so parse the
// numeric arrays straight from the bytes and only the strings section as JSON.
const buffer = fs.readFileSync(file);
function section(key) {
  const start = buffer.indexOf(`"${key}":`);
  if (start < 0) throw new Error(`no ${key} section`);
  return buffer.indexOf('[', start);
}
function numbers(key) {
  let i = section(key) + 1, value = 0, inNumber = false, list = new Uint32Array(1 << 20), n = 0;
  for (; i < buffer.length; i++) {
    const c = buffer[i];
    if (c >= 48 && c <= 57) { value = value * 10 + (c - 48); inNumber = true; continue; }
    if (inNumber) { if (n === list.length) { const grown = new Uint32Array(list.length * 2); grown.set(list); list = grown; } list[n++] = value; value = 0; inNumber = false; }
    if (c === 93) break;
  }
  return list.subarray(0, n);
}
const headerEnd = section('nodes');
const header = JSON.parse(buffer.subarray(buffer.indexOf('{'), buffer.lastIndexOf('}', headerEnd) + 1).toString('utf8') + '}');
const stringTable = JSON.parse(buffer.subarray(section('strings'), buffer.lastIndexOf(']') + 1).toString('utf8'));
const snapshot = {snapshot: header.snapshot, nodes: numbers('nodes'), edges: numbers("edges"), strings: stringTable};
const meta = snapshot.snapshot.meta;
const nodeFields = meta.node_fields, edgeFields = meta.edge_fields;
const nodeTypes = meta.node_types[0], edgeTypes = meta.edge_types[0];
const N = nodeFields.length, E = edgeFields.length;
const fType = nodeFields.indexOf('type'), fName = nodeFields.indexOf('name'), fSelf = nodeFields.indexOf('self_size'), fEdges = nodeFields.indexOf('edge_count');
const eType = edgeFields.indexOf('type'), eName = edgeFields.indexOf('name_or_index'), eTo = edgeFields.indexOf('to_node');
const {nodes, edges, strings} = snapshot;
const count = nodes.length / N;
const mb = bytes => (bytes / 1048576).toFixed(1).padStart(8) + ' MB';

let total = 0;
const byType = new Map(), byName = new Map(), large = [];
for (let i = 0; i < count; i++) {
  const base = i * N, type = nodeTypes[nodes[base + fType]], size = nodes[base + fSelf];
  total += size;
  byType.set(type, (byType.get(type) ?? 0) + size);
  const name = type === 'object' || type === 'closure' ? strings[nodes[base + fName]] : `(${type})`;
  const row = byName.get(name) ?? [0, 0];
  row[0] += size; row[1]++;
  byName.set(name, row);
  if (size > 256 * 1024) large.push([size, type, type === 'string' ? `${strings[nodes[base + fName]].slice(0, 80)}…` : strings[nodes[base + fName]]]);
}

console.log(`${count} nodes, ${mb(total)} self size\n\n== By type`);
for (const [type, size] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`${mb(size)}  ${type}`);
console.log('\n== By constructor (self size)');
for (const [name, [size, n]] of [...byName].sort((a, b) => b[1][0] - a[1][0]).slice(0, top)) console.log(`${mb(size)}  x${String(n).padEnd(8)} ${name.slice(0, 100)}`);
console.log('\n== Largest single objects (> 256 KB)');
for (const [size, type, name] of large.sort((a, b) => b[0] - a[0]).slice(0, top)) console.log(`${mb(size)}  ${type.padEnd(10)} ${String(name).replace(/\s+/g, ' ').slice(0, 100)}`);

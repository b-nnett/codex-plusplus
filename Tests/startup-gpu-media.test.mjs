// Tests for the gpu lane's media edit imageUploadOffThread: the ChatGPT
// conversation upload's image preparation (size check, scale to 2048 px and
// re-encode) moves off the main thread, with the original code as fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adapt} from './startup-harness.mjs';

// The vendor functions, verbatim from app-initial (build 20398); vmn is the
// byte-copy gate (off in that build), gr the app's logger.
const prepare = 'async function fvn(e,t,n){let r=vmn()&&Uc(e,`2423357484`),i=t.type.toLowerCase();if(i!==``&&i!==`application/octet-stream`&&!i.startsWith(`image/`))return{file:t};' +
  'n.throwIfAborted();let a=await pvn(t,n);n.throwIfAborted();let{width:o,height:s}=a;if(o>2048||s>2048||t.size>1048576)try{let e=Math.min(1,2048/Math.max(o,s)),r=o*e,i=s*e,' +
  'c=document.createElement(`canvas`);c.width=r,c.height=i;let l=c.getContext(`2d`);if(l==null)throw Error(`Image upload canvas unavailable`);l.drawImage(a,0,0,r,i);' +
  'let u=t.type||`image/png`,d=await new Promise(e=>{c.toBlob(e,u)});if(n.throwIfAborted(),d==null)throw Error(`Image upload encoding failed`);' +
  'return{file:new File([d],t.name,{type:u}),width:Math.trunc(r),height:Math.trunc(i)}}catch(e){n.throwIfAborted(),gr.warning(`Image upload preparation failed; using original file`,{safe:{},sensitive:{error:e}})}' +
  'return r?{file:new File([yf(a.src.slice(a.src.indexOf(`,`)+1))],t.name,{type:t.type,lastModified:t.lastModified}),width:o,height:s}:{file:t,width:o,height:s}}';
const read = 'async function pvn(e,t){let n=new FileReader,r=new Image,i;try{return await new Promise((a,o)=>{i=()=>{o(t.reason instanceof Error?t.reason:new DOMException(`Aborted`,`AbortError`)),n.abort(),r.src=``},' +
  't.throwIfAborted(),t.addEventListener(`abort`,i,{once:!0}),n.onerror=()=>o(n.error??Error(`Image upload read failed`)),r.onload=()=>a(r),r.onerror=()=>o(Error(`Image upload decode failed`)),' +
  'n.onload=()=>{if(typeof n.result!=`string`){o(Error(`Image upload read failed`));return}r.src=n.result},n.readAsDataURL(e)})}finally{i!=null&&t.removeEventListener(`abort`,i),n.onload=null,n.onerror=null,r.onload=null,r.onerror=null}}';
const initial = `function vmn(){return copyGate}${prepare}${read}function mvn(){}`;

// A browser of fakes. Images are blobs carrying their pixel size; the worker's
// source runs in its own context with its own canvas and bitmap fakes.
function browser({worker = true, bitmapFails = false, apis = true} = {}) {
  const log = [], urls = new Map();
  class Blob { constructor(parts = [], {type = ''} = {}) { this.parts = parts; this.type = type; this.size = parts.reduce((n, p) => n + (p.size ?? String(p).length), 0); this.dims = parts.find(p => p?.dims)?.dims; } }
  class File extends Blob { constructor(parts, name, options = {}) { super(parts, options); this.name = name; this.lastModified = options.lastModified ?? 0; } }
  const image = (name, type, width, height, size) => { const f = new File([], name, {type}); f.size = size; f.dims = [width, height]; return f; };
  const dimsOf = url => url.startsWith('blob:') ? urls.get(url)?.dims : url.startsWith('data:') ? JSON.parse(atob(url.slice(url.indexOf(',') + 1))) : undefined;
  class Image { get src() { return this.url ?? ''; } set src(url) { this.url = url; if (!url) return; log.push(`img ${url.slice(0, 5)}`); setTimeout(() => { const d = dimsOf(url); if (d) { [this.width, this.height] = d; this.onload?.(); } else this.onerror?.(new Error('bad')); }); } }
  class FileReader { readAsDataURL(blob) { log.push('readAsDataURL'); setTimeout(() => { this.result = `data:${blob.type};base64,${btoa(JSON.stringify(blob.dims ?? null))}`; this.onload?.(); }); } abort() {} }
  const document = {createElement: tag => { log.push(`main ${tag}`); return {getContext: () => ({drawImage: (...a) => log.push(`main drawImage ${a.slice(1).join(',')}`)}), toBlob(cb, type) { log.push(`main toBlob ${type}`); setTimeout(() => cb(new Blob(['main'], {type}))); }}; }};
  const URL = {createObjectURL: blob => { const u = `blob:${urls.size}`; urls.set(u, blob); return u; }, revokeObjectURL: u => log.push(`revoke ${u}`)};
  class Worker {
    constructor(url) {
      const source = urls.get(url).parts.join('');
      log.push('worker');
      this.scope = vm.createContext({Blob, setTimeout, postMessage: data => setTimeout(() => this.onmessage?.({data})),
        createImageBitmap: async (file, options) => { log.push(`worker bitmap ${JSON.stringify(options)}`); if (bitmapFails) throw new Error('decode'); return {dims: file.dims, close: () => log.push('worker close')}; },
        OffscreenCanvas: class { constructor(w, h) { log.push(`worker canvas ${Math.trunc(w)}x${Math.trunc(h)}`); } getContext() { return {drawImage: (b, ...a) => log.push(`worker drawImage ${a.join(',')}`)}; }
          async convertToBlob(options) { log.push(`worker encode ${JSON.stringify(options)}`); return new Blob(['worker'], {type: options.type}); } }});
      vm.runInContext(source, this.scope);
    }
    postMessage(data) { setTimeout(() => this.scope.onmessage({data})); }
    terminate() { log.push('worker terminate'); }
  }
  // Timers do not hold the test process open (the worker's 30 s idle timeout).
  const timeout = (f, ms) => { const t = setTimeout(f, ms); t.unref?.(); return t; };
  const sandbox = {log, File, Blob, Image, FileReader, document, URL, AbortController, DOMException, setTimeout: timeout, clearTimeout, atob, btoa, copyGate: false,
    Uc: () => true, gr: {warning: (...a) => log.push(`warning ${a[0]}`)}, yf: s => `bytes:${s}`, image};
  if (apis) { sandbox.createImageBitmap = () => { throw new Error('main-thread decode'); }; sandbox.OffscreenCanvas = class {}; }
  if (worker && apis) sandbox.Worker = Worker;
  return sandbox;
}

function run(source, options) {
  const sandbox = browser(options);
  vm.runInNewContext(source, sandbox);
  const prepareImage = (file, signal = new AbortController().signal) => sandbox.fvn({}, file, signal);
  return {sandbox, prepareImage, log: sandbox.log};
}

test('imageUploadOffThread: a large image is sized from a blob: URL and scaled and encoded in a worker', async () => {
  const {applied, skipped, initial: patched} = adapt({initial});
  assert.equal(applied.imageUploadOffThread, 'initial', JSON.stringify(skipped));
  const {prepareImage, log, sandbox} = run(patched);
  const png = sandbox.image('shot.png', 'image/png', 5120, 2880, 3e6);
  const result = await prepareImage(png);
  assert.deepEqual([result.width, result.height, result.file.name, result.file.type], [2048, 1152, 'shot.png', 'image/png']);
  assert.equal(result.file.parts[0].parts[0], 'worker', 'the worker encoded the file');
  assert.ok(!log.includes('readAsDataURL') && !log.some(l => l.startsWith('main ')), log.join('\n'));
  assert.ok(log.includes('img blob:') && log.includes('revoke blob:0'));
  assert.ok(log.includes('worker bitmap {"imageOrientation":"from-image"}') && log.includes('worker canvas 2048x1152'));
  assert.ok(log.includes('worker drawImage 0,0,2048,1152') && log.includes('worker encode {"type":"image/png"}') && log.includes('worker close'));
  // Fractional target sizes are passed through as the original passes them to its canvas and drawImage.
  const odd = await prepareImage(sandbox.image('tall.jpg', 'image/jpeg', 2000, 3000, 2e6));
  assert.deepEqual([odd.width, odd.height, odd.file.type], [1365, 2048, 'image/jpeg']);
  assert.ok(log.includes(`worker drawImage 0,0,${2000 * (2048 / 3000)},2048`), log.join('\n'));
  assert.ok(log.includes('worker encode {"type":"image/jpeg","quality":0.92}'), 'canvas.toBlob\'s JPEG quality');
  assert.equal(log.filter(l => l === 'worker').length, 1, 'one worker serves both');
  await prepareImage(sandbox.image('a.webp', 'image/webp', 4000, 1000, 2e6));
  assert.ok(log.includes('worker encode {"type":"image/webp","quality":0.8}'));
});

test('imageUploadOffThread: small images keep the original file and size without a decode', async () => {
  const {initial: patched} = adapt({initial});
  const {prepareImage, log, sandbox} = run(patched);
  const small = sandbox.image('small.png', 'image/png', 1800, 1200, 7e5);
  const result = await prepareImage(small);
  assert.equal(result.file, small);
  assert.deepEqual([result.width, result.height], [1800, 1200]);
  assert.ok(!log.includes('readAsDataURL') && !log.includes('worker'), log.join('\n'));
  // Non-images are returned before either path runs.
  const text = sandbox.image('a.txt', 'text/plain', 0, 0, 10);
  assert.deepEqual(Object.keys(await prepareImage(text)), ['file']);
});

test('imageUploadOffThread: falls back to the original code', async () => {
  const {initial: patched} = adapt({initial});
  const original = async (file, options) => { const {prepareImage, log} = run(initial, options); return {result: await prepareImage(file), log}; };
  const cases = [
    ['no Worker', {worker: false}, 'image/png'],
    ['no createImageBitmap or OffscreenCanvas', {apis: false}, 'image/png'],
    ['the worker cannot decode', {bitmapFails: true}, 'image/png'],
    ['a type toBlob encodes with its own fallback', {}, 'image/gif'],
  ];
  for (const [label, options, type] of cases) {
    const {prepareImage, log, sandbox} = run(patched, options);
    const file = sandbox.image('x', type, 4000, 3000, 2e6);
    const result = await prepareImage(file);
    const reference = await original(file, options);
    assert.deepEqual([result.width, result.height, result.file.type], [reference.result.width, reference.result.height, reference.result.file.type], label);
    assert.equal(result.file.parts[0].parts[0], 'main', `${label}: the original canvas encoded it`);
    assert.ok(log.includes('readAsDataURL') && log.includes(`main toBlob ${type}`), `${label}: ${log.join(', ')}`);
  }
  // The byte-copy gate on: the original path, which rebuilds the file from the data URL.
  const {prepareImage, log, sandbox} = run(patched);
  sandbox.copyGate = true;
  const copied = await prepareImage(sandbox.image('s.png', 'image/png', 100, 100, 10));
  assert.match(copied.file.parts[0], /^bytes:/);
  assert.ok(log.includes('readAsDataURL') && !log.includes('img blob:'));
  // An undecodable image fails as the original does.
  const broken = run(patched);
  const bad = broken.sandbox.image('bad.png', 'image/png', 0, 0, 10); bad.dims = undefined;
  await assert.rejects(broken.prepareImage(bad), /Image upload decode failed/);
});

test('imageUploadOffThread: an abort rejects as the original does', async () => {
  const {initial: patched} = adapt({initial});
  for (const source of [initial, patched]) {
    const {prepareImage, sandbox} = run(source);
    const controller = new AbortController();
    const pending = prepareImage(sandbox.image('big.png', 'image/png', 5000, 5000, 4e6), controller.signal);
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
  }
});

test('imageUploadOffThread: other shapes are left alone', () => {
  const variants = [
    initial.replace('o>2048||s>2048', 'o>2048||s>4096'),
    initial.replace('c.toBlob(e,u)', 'c.toBlob(e,u,.8)'),
    initial.replace('n.readAsDataURL(e)', 'n.readAsArrayBuffer(e)'),
    initial.replace('return r?{file:new File', 'return!r?{file:new File'),
    initial + initial.replace(/fvn/g, 'fvn2').replace(/pvn/g, 'pvn2').replace(/mvn/g, 'mvn2').replace('function vmn(){return copyGate}', ''),
  ];
  for (const variant of variants) {
    const result = adapt({initial: variant});
    assert.match(result.skipped.imageUploadOffThread, /expected one match, found [02]/, variant.slice(0, 80));
  }
});

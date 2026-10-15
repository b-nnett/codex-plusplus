// Media benchmark driver: headless Chrome over CDP (no puppeteer).
//
//   node scripts/media-bench/run.mjs --work <dir> [--chrome <binary>] [--reps N] case...
//
// Cases: <image>:<variant> (upload.html; variants orig, patched, dataUrl, dataUrlWorker),
// wave:<orig|cached>:<none|pre|both> (wave.html, 3 s each), encoders (canvas.toBlob's
// default quality vs convertToBlob). Prepare <dir> with prepare.mjs first. Main-thread
// time is the renderer's Performance.getMetrics TaskDuration across the variant only;
// encoded outputs are written to <dir>/out/<image>.<variant>.<rep> for compare.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2), arg = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const work = arg('--work'), reps = +(arg('--reps') ?? 1) || 1;
const chromePath = arg('--chrome') ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = args.filter((a, i) => !a.startsWith('--') && !['--work', '--reps', '--chrome'].includes(args[i - 1]));
if (!work) { console.error('usage: run.mjs --work <dir> [--chrome <binary>] [--reps N] case...'); process.exit(2); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = url.startsWith('/work/') ? path.join(work, url.slice(6)) : path.join(here, path.basename(url));
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }); res.end(data); });
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'media-bench-'));
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((ok, fail) => { let buf = ''; chrome.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\S+)/.exec(buf); if (m) ok(m[1]); }); setTimeout(() => fail(new Error('Chrome did not start')), 15000); });
const socket = new WebSocket(wsUrl);
await new Promise(r => socket.onopen = r);
let id = 0; const waiting = new Map();
socket.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((ok, fail) => { const i = ++id; waiting.set(i, m => m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)); socket.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Runtime.enable'); await S('Performance.enable'); await S('Page.enable');
const evaluate = async expr => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
const metrics = async () => Object.fromEntries((await S('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
const open = async page => { await S('Page.navigate', { url: `${origin}/${page}` }); await new Promise(r => setTimeout(r, 1000)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = (k, v) => typeof v === 'number' ? +v.toFixed(2) : v;
await open('upload.html');
console.log(JSON.stringify({ renderer: await evaluate('gpuInfo()'), userAgent: await evaluate('navigator.userAgent') }));
for (const c of cases) {
  if (c === 'encoders') { console.log(JSON.stringify(await evaluate('Promise.all(["image/jpeg","image/webp","image/png"].map(t=>encoderCheck(t,[null,.8,.92,1])))'))); continue; }
  for (let rep = 0; rep < reps; rep++) {
    if (c.startsWith('wave:')) {
      const [, variant, dirty] = c.split(':');
      await open('wave.html');
      await evaluate(`startWave(${JSON.stringify(variant)},${JSON.stringify(dirty)})`); await sleep(500);
      const before = await metrics(); await sleep(3000); const after = await metrics();
      const res = await evaluate('stopWave()'), perSecond = k => (after[k] - before[k]) / 3;
      console.log(JSON.stringify({ variant, dirty, rep, drawMsPerFrame: res.drawMsPerFrame, layoutsPerSec: perSecond('LayoutCount'), layoutMsPerSec: perSecond('LayoutDuration') * 1000,
        styleMsPerSec: perSecond('RecalcStyleDuration') * 1000, scriptMsPerSec: perSecond('ScriptDuration') * 1000, mainTaskMsPerSec: perSecond('TaskDuration') * 1000 }, round));
      continue;
    }
    const [image, variant] = c.split(':');
    await open('upload.html');
    await evaluate(`prepareCase(${JSON.stringify(image)})`);
    const before = await metrics();
    const res = await evaluate(`runCase(${JSON.stringify(variant)})`);
    const after = await metrics();
    Object.assign(res, await evaluate('collectCase()'), { mainTaskMs: (after.TaskDuration - before.TaskDuration) * 1000 });
    if (res.b64) { const out = path.join(work, 'out', `${image}.${variant}.${rep}`); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.from(res.b64, 'base64')); delete res.b64; }
    console.log(JSON.stringify({ image, variant, rep, ...res }, round));
  }
}
socket.close(); chrome.kill(); server.close();
await new Promise(r => chrome.once('exit', r));
fs.rmSync(profile, { recursive: true, force: true });

// Prepares the media benchmark (ChatGPT build 20398) in a work directory:
//
//   node scripts/media-bench/prepare.mjs --assets <extracted app.asar>/webview/assets --work <dir> [--no-images]
//
// - vendor.js: the ChatGPT conversation upload's image preparation (fvn, pvn) from
//   app-initial and the Codex composer's file-to-data-URL reader (fZn) from app-shared,
//   verbatim (these are this build's minified names);
// - patched.js: the same fvn as startup-adapter.js patches it (renamed fvnPatched),
//   with the helpers the edit adds;
// - wave-vendor.js: the composer's dictation waveform classes, verbatim;
// - img/: test images: a screenshot of this Mac (`screencapture -x`, PNG and JPEG),
//   5K versions made with sips, a noisy 5K image (ImageMagick plasma) as PNG and JPEG,
//   a JPEG with EXIF orientation 6 and one with a 144 dpi EXIF resolution, and a small
//   PNG under the resize thresholds.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { adapt } from '../../Tests/startup-harness.mjs';

const args = process.argv.slice(2), arg = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const assets = arg('--assets'), work = arg('--work');
if (!assets || !work) { console.error('usage: prepare.mjs --assets <webview/assets> --work <dir> [--no-images]'); process.exit(2); }
fs.mkdirSync(work, { recursive: true });
const chunk = prefix => { const names = fs.readdirSync(assets).filter(n => n.startsWith(prefix) && n.endsWith('.js')); if (names.length !== 1) throw new Error(`${prefix}: ${names}`); return fs.readFileSync(path.join(assets, names[0]), 'utf8'); };
const initial = chunk('app-initial-'), shared = chunk('app-shared-');
// A function's source by its unique head (balanced braces; these functions hold no braces in strings).
const fn = (src, head, from = 0) => {
  const start = src.indexOf(head, from);
  if (start < 0 || (from === 0 && src.indexOf(head, start + 1) >= 0)) throw new Error('not unique: ' + head);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
};
fs.writeFileSync(path.join(work, 'vendor.js'), [fn(initial, 'async function fvn(e,t,n){'), fn(initial, 'async function pvn(e,t){'), fn(shared, 'function fZn(e){')].join('\n') + '\n');

const result = adapt({ initial });
if (result.applied.imageUploadOffThread !== 'initial') throw new Error('imageUploadOffThread did not apply: ' + result.skipped.imageUploadOffThread);
const patched = result.initial, at = patched.indexOf('async function fvn(');
const end = patched.indexOf('async function pvn(', patched.indexOf('function ppImageUploadWorker', at));
fs.writeFileSync(path.join(work, 'patched.js'), patched.slice(at, end).replace('async function fvn(', 'async function fvnPatched(') + '\n');

const a = initial.indexOf('function m1c'), stop = initial.indexOf('n.globalAlpha=1}}', a) + 'n.globalAlpha=1}}'.length, wave = initial.slice(a, stop);
const m1c = wave.slice(0, wave.indexOf('function _1c')), h1c = /h1c=(\[[^\]]*\])/.exec(wave)[1];
const g1c = wave.slice(wave.indexOf('g1c=class') + 4, wave.indexOf('}}}})))()}var v1c') + 3), v1c = wave.slice(wave.indexOf('v1c=class') + 4);
fs.writeFileSync(path.join(work, 'wave-vendor.js'), `${m1c}\nvar h1c=${h1c};\nvar g1c=${g1c};\nvar v1c=${v1c};\n`);

if (!args.includes('--no-images')) {
  const img = path.join(work, 'img'); fs.mkdirSync(img, { recursive: true });
  const run = (cmd, ...a) => { const r = spawnSync(cmd, a, { stdio: 'inherit' }); if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')}`); };
  const at = name => path.join(img, name);
  run('screencapture', '-x', at('shot.png'));
  run('screencapture', '-x', '-t', 'jpg', at('shot.jpg'));
  run('sips', '-z', '2880', '5120', at('shot.png'), '--out', at('shot5k.png'));
  run('sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '90', at('shot5k.png'), '--out', at('shot5k.jpg'));
  run('sips', '-z', '1200', '1800', at('shot.png'), '--out', at('small.png'));
  run('magick', '-size', '5120x2880', '-depth', '8', 'plasma:fractal', '-blur', '0x1', '-depth', '8', at('photo5k.png'));
  run('magick', at('photo5k.png'), '-quality', '90', at('photo5k.jpg'));
  const size = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', at('shot.jpg')], { encoding: 'utf8' }).stdout.match(/\d+/g).slice(-2);
  run(process.execPath, new URL('./exif.mjs', import.meta.url).pathname, at('shot.jpg'), at('rot6.jpg'), '6');
  run(process.execPath, new URL('./exif.mjs', import.meta.url).pathname, at('shot.jpg'), at('dpi144.jpg'), '1', '144', ...size);
}
console.log('prepared', work);

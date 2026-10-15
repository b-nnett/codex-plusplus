// Compares two variants' encoded outputs from run.mjs with ImageMagick:
//
//   node scripts/media-bench/compare.mjs --work <dir> orig patched image...
//
// Prints byte identity, dimensions, PSNR, mean and peak absolute error, and the
// share of pixels more than 1% off.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2), at = args.indexOf('--work'), work = args[at + 1];
const [a, b, ...images] = args.filter((_, i) => i !== at && i !== at + 1);
const magick = (...x) => { const r = spawnSync('magick', x, { encoding: 'utf8' }); return (r.stdout + r.stderr).trim(); };
for (const image of images) {
  const x = path.join(work, 'out', `${image}.${a}.0`), y = path.join(work, 'out', `${image}.${b}.0`);
  if (!fs.existsSync(x) || !fs.existsSync(y)) { console.log(image, 'missing'); continue; }
  const same = Buffer.compare(fs.readFileSync(x), fs.readFileSync(y)) === 0;
  const dims = `${magick('identify', '-format', '%wx%h', x)} / ${magick('identify', '-format', '%wx%h', y)}`;
  const metric = name => same ? '-' : magick('compare', '-metric', name, ...(name === 'AE' ? ['-fuzz', '1%'] : []), x, y, 'null:');
  console.log(`${image} ${a} vs ${b}: bytes ${same ? 'identical' : 'differ'}, ${dims}, PSNR ${same ? 'inf' : metric('PSNR')}, MAE ${metric('MAE')}, PAE ${metric('PAE')}, >1% off ${metric('AE')}`);
}

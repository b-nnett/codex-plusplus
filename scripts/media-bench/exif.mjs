// node exif.mjs in.jpg out.jpg orientation [dpi width height]
// Writes a minimal big-endian EXIF APP1 (Orientation; optionally resolution + PixelX/YDimension).
import fs from 'node:fs';
const [inp, out, orient, dpi, pw, ph] = process.argv.slice(2);
const src = fs.readFileSync(inp);
const entries = [[0x0112, 3, 1, +orient]];
if (dpi) entries.push([0x011A, 5, 1, 'rat'], [0x011B, 5, 1, 'rat'], [0x0128, 3, 1, 2], [0x8769, 4, 1, 'exif']);
entries.sort((a, b) => a[0] - b[0]);
const ifd0Size = 2 + entries.length * 12 + 4;
const ratOff = 8 + ifd0Size, exifOff = ratOff + (dpi ? 16 : 0);
const exifEntries = dpi ? [[0xA002, 4, 1, +pw], [0xA003, 4, 1, +ph]] : [];
const exifSize = dpi ? 2 + exifEntries.length * 12 + 4 : 0;
const tiff = Buffer.alloc(8 + ifd0Size + (dpi ? 16 : 0) + exifSize);
tiff.write('MM', 0); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4);
let p = 8; tiff.writeUInt16BE(entries.length, p); p += 2;
let ratIndex = 0;
for (const [tag, type, count, value] of entries) {
  tiff.writeUInt16BE(tag, p); tiff.writeUInt16BE(type, p + 2); tiff.writeUInt32BE(count, p + 4);
  if (value === 'rat') { tiff.writeUInt32BE(ratOff + 8 * ratIndex++, p + 8); }
  else if (value === 'exif') tiff.writeUInt32BE(exifOff, p + 8);
  else if (type === 3) tiff.writeUInt16BE(value, p + 8); else tiff.writeUInt32BE(value, p + 8);
  p += 12;
}
tiff.writeUInt32BE(0, p); p += 4;
if (dpi) {
  for (let i = 0; i < 2; i++) { tiff.writeUInt32BE(+dpi, p); tiff.writeUInt32BE(1, p + 4); p += 8; }
  tiff.writeUInt16BE(exifEntries.length, p); p += 2;
  for (const [tag, type, count, value] of exifEntries) { tiff.writeUInt16BE(tag, p); tiff.writeUInt16BE(type, p + 2); tiff.writeUInt32BE(count, p + 4); tiff.writeUInt32BE(value, p + 8); p += 12; }
  tiff.writeUInt32BE(0, p); p += 4;
}
const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
const app1 = Buffer.alloc(4); app1.writeUInt16BE(0xFFE1, 0); app1.writeUInt16BE(payload.length + 2, 2);
// Skip SOI and any APP0/APP1 segments.
let q = 2;
while (src[q] === 0xFF && (src[q + 1] === 0xE0 || src[q + 1] === 0xE1)) q += 2 + src.readUInt16BE(q + 2);
fs.writeFileSync(out, Buffer.concat([src.subarray(0, 2), app1, payload, src.subarray(q)]));

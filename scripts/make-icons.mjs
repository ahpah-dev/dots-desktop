// Generates the shared sage four-dot app icon and monochrome tray mark.
// Pure Node (zlib only) so builds need no image tooling.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

const smooth = (edge, d, aa) => Math.max(0, Math.min(1, (edge - d) / aa + 0.5));
const DOTS = [
  [22 / 64, 22 / 64, 7.5 / 64, [251, 250, 247]],
  [42 / 64, 22 / 64, 7.5 / 64, [251, 250, 247]],
  [22 / 64, 42 / 64, 7.5 / 64, [197, 220, 200]],
  [42 / 64, 42 / 64, 7.5 / 64, [153, 198, 173]],
];

function iconPixel(u, v, size) {
  const aa = 1.5 / size;
  // rounded-square background
  const cx = Math.abs(u - 0.5) - 28 / 64, cy = Math.abs(v - 0.5) - 28 / 64;
  const r = 16 / 64;
  const dist = Math.hypot(Math.max(cx + r, 0), Math.max(cy + r, 0)) + Math.min(Math.max(cx + r, cy + r), 0) - r;
  const bg = smooth(0, dist, aa);
  if (bg <= 0) return [0, 0, 0, 0];
  let col = [53, 120, 92];
  for (const [dx, dy, dr, c] of DOTS) {
    const a = smooth(dr, Math.hypot(u - dx, v - dy), aa);
    if (a > 0) col = col.map((p, i) => p * (1 - a) + c[i] * a);
  }
  return [col[0], col[1], col[2], Math.round(bg * 255)];
}

function trayPixel(u, v, size) {
  const aa = 1.2 / size;
  let a = 0;
  for (const [dx, dy, dr] of DOTS) a = Math.max(a, smooth(dr * 1.15, Math.hypot(u - dx, v - dy), aa));
  return [60, 60, 60, Math.round(a * 255)];
}

mkdirSync(resolve(root, 'assets'), { recursive: true });
mkdirSync(resolve(root, 'build'), { recursive: true });
const iconPngPath = resolve(root, 'assets/icon.png');
writeFileSync(iconPngPath, png(512, iconPixel));
writeFileSync(resolve(root, 'assets/tray.png'), png(32, trayPixel));

// Generate Windows .ico
try {
  const pngToIco = (await import('png-to-ico')).default;
  const icoBuf = await pngToIco(iconPngPath);
  writeFileSync(resolve(root, 'assets/icon.ico'), icoBuf);
  writeFileSync(resolve(root, 'build/icon.ico'), icoBuf);
  console.log('Generated assets/icon.ico and build/icon.ico');
} catch (err) {
  console.error('Failed to generate ico:', err);
  process.exitCode = 1;
}
console.log('Icons written to assets/ and build/');

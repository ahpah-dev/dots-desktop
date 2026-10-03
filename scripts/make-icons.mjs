// Generates assets/icon.png (512px) and assets/tray.png (32px) — a cluster of three "dots".
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
const DOTS = [[0.34, 0.36, 0.17, [129, 140, 248]], [0.68, 0.40, 0.14, [52, 211, 153]], [0.5, 0.68, 0.15, [251, 146, 60]]];

function iconPixel(u, v, size) {
  const aa = 1.5 / size;
  // rounded-square background
  const cx = Math.abs(u - 0.5) - 0.38, cy = Math.abs(v - 0.5) - 0.38;
  const r = 0.14;
  const dist = Math.hypot(Math.max(cx + r, 0), Math.max(cy + r, 0)) + Math.min(Math.max(cx + r, cy + r), 0) - r;
  const bg = smooth(0, dist, aa);
  if (bg <= 0) return [0, 0, 0, 0];
  let col = [24 + v * 14, 26 + v * 16, 40 + v * 22];
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
writeFileSync(resolve(root, 'assets/icon.png'), png(512, iconPixel));
writeFileSync(resolve(root, 'assets/tray.png'), png(32, trayPixel));
console.log('Icons written to assets/');

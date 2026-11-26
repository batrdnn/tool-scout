// Makes the plugin icon, .claude-plugin/icon.png: an original 16x16 pixel-art compass (a scout's
// tool) in the same style as the animal sprites, scaled up to a square PNG. Zero dependencies:
// the PNG is written by hand with node:zlib. Same input, same bytes.
//   node scripts/make-icon.mjs            (writes .claude-plugin/icon.png)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const SCALE = 32;
export const ICON_SIZE = 16 * SCALE; // 512 px: the smallest size the plugin directory takes

const PALETTE = { '.': '#3d5a80', K: '#161025', R: '#e8b84a', F: '#fff3e0', S: '#d9482b', W: '#2f4a73' };
// Ring, face, four ticks, and a needle along the diagonal: red to the north-east, blue to the south-west.
export const ICON_ROWS = [
  '................',
  '.....KKKKKK.....',
  '...KKRRRRRRKK...',
  '..KRRFFKKFFRRK..',
  '.KRFFFFFFFSSFRK.',
  '.KRFFFFFFSSFFRK.',
  '.KRFFFFFSSFFFRK.',
  '.KRKFFFSSFFFKRK.',
  '.KRKFFWWFFFFKRK.',
  '.KRFFWWFFFFFFRK.',
  '.KRFWWFFFFFFFRK.',
  '.KRRWFFFFFFFFRK.',
  '..KRRFFKKFFRRK..',
  '...KKRRRRRRKK...',
  '.....KKKKKK.....',
  '................',
];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function iconPng() {
  const n = ICON_SIZE; const row = n * 3 + 1;
  const raw = Buffer.alloc(row * n); // each scanline: filter byte 0, then RGB
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const [r, g, b] = rgb(PALETTE[ICON_ROWS[Math.floor(y / SCALE)][Math.floor(x / SCALE)]]);
      raw.set([r, g, b], y * row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.claude-plugin', 'icon.png');
  fs.writeFileSync(out, iconPng());
  console.log(`wrote ${out}`);
}

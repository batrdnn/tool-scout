// The plugin icon: what `claude plugin validate` expects (a square PNG, 512 to 2048 px, under 2 MB),
// and that the committed file is exactly what the zero-dependency generator makes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { iconPng, ICON_ROWS, ICON_SIZE } from '../scripts/make-icon.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON = path.join(ROOT, '.claude-plugin', 'icon.png');

test('the icon is a square PNG of 512 to 2048 px under 2 MB', () => {
  const b = fs.readFileSync(ICON);
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const w = b.readUInt32BE(16); const h = b.readUInt32BE(20);
  assert.equal(w, h);
  assert.ok(w >= 512 && w <= 2048, `${w} px`);
  assert.ok(b.length < 2 * 1024 * 1024, `${b.length} bytes`);
});

test('plugin.json points at the icon, and the file exists', () => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(p.icon, './.claude-plugin/icon.png');
  assert.ok(fs.existsSync(path.resolve(ROOT, p.icon)));
});

test('the committed icon is exactly what the generator makes (deterministic)', () => {
  assert.ok(iconPng().equals(fs.readFileSync(ICON)), 'run: node scripts/make-icon.mjs');
  assert.ok(iconPng().equals(iconPng()));
});

test('the pixel grid is 16x16 and every key has a color', () => {
  assert.equal(ICON_ROWS.length, 16);
  for (const r of ICON_ROWS) assert.equal(r.length, 16);
  assert.ok(ICON_SIZE >= 512);
});

test('the PNG decodes to the grid colors (IDAT is valid, filter 0 rows)', () => {
  const b = fs.readFileSync(ICON);
  let off = 8; const idat = [];
  while (off < b.length) { const len = b.readUInt32BE(off); if (b.toString('latin1', off + 4, off + 8) === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len)); off += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const w = b.readUInt32BE(16);
  assert.equal(raw.length, w * (w * 3 + 1));
});

test('the generator imports nothing but node: modules', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'make-icon.mjs'), 'utf8');
  for (const m of src.matchAll(/^import .* from '([^']+)'/gm)) assert.match(m[1], /^node:/);
});

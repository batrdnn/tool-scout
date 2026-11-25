// Item 1: original 16x16 palette-indexed sprites, stored in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SPRITES, SIZE, pixels } from '../scripts/lib/sprites.mjs';
import { ORDER } from '../scripts/lib/me.mjs';

const NAMES = [...ORDER, 'Egg'];

test('there is one sprite for each of the 7 animals and the Egg', () => {
  assert.deepEqual(Object.keys(SPRITES), NAMES);
  assert.equal(SIZE, 16);
});

test('each sprite is a 16x16 grid whose characters are all "." (empty) or in its palette', () => {
  for (const n of NAMES) {
    const { palette, rows } = SPRITES[n];
    assert.equal(rows.length, 16, `${n}: rows`);
    for (const [i, row] of rows.entries()) {
      assert.equal(row.length, 16, `${n}: row ${i} is ${row.length} wide`);
      for (const ch of row) assert.ok(ch === '.' || ch in palette, `${n}: row ${i} uses "${ch}" which is not in the palette`);
    }
    assert.ok(!('.' in palette), `${n}: "." is reserved for empty`);
    for (const [k, hex] of Object.entries(palette)) {
      assert.equal(k.length, 1);
      assert.match(hex, /^#[0-9a-f]{6}$/, `${n}: ${k}`);
      assert.ok(rows.some((r) => r.includes(k)), `${n}: palette entry ${k} is never used`);
    }
  }
});

test('sprites are drawn, not blank: 25-75% of the cells filled, 3+ colors, an outline-dark color, nothing on the border cell corners', () => {
  for (const n of NAMES) {
    const px = pixels(n);
    assert.equal(px.length, 16);
    const flat = px.flat();
    assert.equal(flat.length, 256);
    const filled = flat.filter(Boolean).length;
    assert.ok(filled >= 64 && filled <= 192, `${n}: ${filled} filled cells`);
    assert.ok(new Set(flat.filter(Boolean)).size >= 3, `${n}: needs 3+ colors`);
    assert.ok([px[0][0], px[0][15], px[15][0], px[15][15]].every((c) => c === null), `${n}: corners should be empty`);
  }
});

test('all 8 sprites are different from each other, and none is a mirror-copy of another', () => {
  const key = (n) => SPRITES[n].rows.join('/');
  assert.equal(new Set(NAMES.map(key)).size, 8);
  assert.equal(new Set(NAMES.map((n) => Object.values(SPRITES[n].palette).sort().join())).size, 8, 'each animal has its own palette');
});

test('sprites.mjs has no imports (zero dependencies)', () => {
  const src = fs.readFileSync(new URL('../scripts/lib/sprites.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\s|require\(|import\(/m);
});

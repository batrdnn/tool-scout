// Art round: distinct silhouettes (Beaver side view + flat tail, Owl with big round eyes and no ears,
// Ant side view with three segments and six legs, Octopus with thick curling tentacles, Egg with a crack).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPRITES } from '../scripts/lib/sprites.mjs';

const rows = (n) => SPRITES[n].rows;
const runs = (row, keys) => { const out = []; let s = -1; [...row].forEach((c, i) => { const hit = keys ? keys.includes(c) : c !== '.'; if (hit && s < 0) s = i; if (!hit && s >= 0) { out.push([s, i - s]); s = -1; } }); if (s >= 0) out.push([s, row.length - s]); return out; };
const cells = (n, ch) => rows(n).flatMap((r, y) => [...r].flatMap((c, x) => (c === ch ? [[x, y]] : [])));
const mirrorDiff = (n) => rows(n).reduce((s, r) => s + [...r].filter((c, i) => c !== r[15 - i]).length, 0);

test('Beaver: side view (not mirror-symmetric), nose at the left edge, and a flat tail on the right', () => {
  assert.ok(mirrorDiff('Beaver') >= 20, 'a side view is not symmetric');
  assert.ok(cells('Beaver', 'N').some(([x]) => x === 0), 'nose touches the left edge');
  const tail = cells('Beaver', 'T');
  assert.ok(tail.length >= 6, 'tail cells');
  const xs = tail.map(([x]) => x), ys = tail.map(([, y]) => y);
  assert.ok(Math.min(...xs) >= 9, 'tail is at the back');
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 4, 'flat: wider than tall');
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 2);
});

test('Owl: big round eyes, no ears: every row above the beak is one solid run, and the head top is wide', () => {
  const r = rows('Owl');
  for (let y = 0; y < 9; y++) assert.ok(runs(r[y]).length <= 1, `row ${y} has separate bits (ear tufts?)`);
  const top = r.findIndex((l) => /[^.]/.test(l));
  assert.ok(runs(r[top])[0][1] >= 6, 'rounded head top at least 6 wide');
  assert.ok(cells('Owl', 'Y').length >= 16, 'big eye rings');
  assert.equal(cells('Owl', 'K').length >= 4, true, 'pupils');
  assert.equal(mirrorDiff('Owl') <= 8, true, 'front view');
});

test('Ant: side view, three body segments (head, thorax, abdomen) and six legs', () => {
  assert.ok(mirrorDiff('Ant') >= 20, 'a side view is not symmetric');
  const r = rows('Ant');
  assert.ok(r.some((l) => runs(l, ['A', 'W']).length === 3), 'a row crosses three body segments');
  const lastBody = Math.max(...r.map((l, y) => (/A/.test(l) ? y : -1)));
  assert.ok(r.slice(lastBody + 1).some((l) => runs(l, ['K']).length === 6), 'a row below the body has six separate legs');
  assert.ok(runs(r[2], ['K']).length >= 2, 'two antennae');
});

test('Octopus: thick tentacles (4 runs, 2+ wide) that curl out to the edges', () => {
  const r = rows('Octopus');
  assert.ok(r.slice(10).some((l) => runs(l, ['R']).filter(([, w]) => w >= 2).length >= 4), 'four thick tentacles');
  const low = r.slice(13).join('');
  assert.ok(r.slice(13).some((l) => l[0] !== '.') && r.slice(13).some((l) => l[15] !== '.'), 'tips curl out to both edges');
  assert.ok(low.length > 0);
});

test('Egg: a zigzag crack (dark cells spread over 5+ rows) on a light shell', () => {
  const crack = cells('Egg', 'K');
  assert.ok(crack.length >= 6);
  assert.ok(new Set(crack.map(([, y]) => y)).size >= 5);
  const xs = new Set(crack.map(([x]) => x));
  assert.ok(xs.size >= 2, 'zigzags, not a straight line');
});

test('Bee, Fox and Turtle keep their designs (they were not redrawn)', () => {
  assert.ok(SPRITES.Bee.rows[8] === '....KKKKKKKK....');
  assert.ok(SPRITES.Fox.rows[2] === '..KK........KK..');
  assert.ok(SPRITES.Turtle.rows[0] === '......DDDD......');
});

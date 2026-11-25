// Item 4: the SVG card draws the same sprites as crisp pixel squares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { svgRects, pixels } from '../scripts/lib/sprites.mjs';
import { whoAmI, meCard, ORDER } from '../scripts/lib/me.mjs';
import { prof } from './helpers.mjs';

const NAMES = [...ORDER, 'Egg'];
const card = (a) => meCard(whoAmI(prof(), { as: a }), prof());

test('svgRects: re-drawing the rects gives back exactly the sprite pixels (merged runs, integer coordinates)', () => {
  for (const n of NAMES) {
    const grid = Array.from({ length: 16 }, () => Array(16).fill(null));
    const rects = svgRects(n, { x: 0, y: 0, scale: 1 });
    for (const r of rects) {
      const m = r.match(/^<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="(#[0-9a-f]{6})"\/>$/);
      assert.ok(m, `${n}: ${r}`);
      const [x, y, w] = [+m[1], +m[2], +m[3]];
      for (let i = 0; i < w; i++) { assert.equal(grid[y][x + i], null, 'no overlap'); grid[y][x + i] = m[4]; }
    }
    assert.deepEqual(grid, pixels(n), n);
    assert.ok(rects.length < 16 * 16, `${n}: runs are merged`);
  }
});

test('svgRects scales and moves the squares', () => {
  const r = svgRects('Egg', { x: 100, y: 50, scale: 12 }).map((l) => l.match(/x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/).slice(1).map(Number));
  assert.ok(r.every(([x, y, w, h]) => x >= 100 && y >= 50 && x + w <= 100 + 192 && y + h <= 50 + 192 && w % 12 === 0 && h === 12 && (x - 100) % 12 === 0 && (y - 50) % 12 === 0));
});

test('every card draws its sprite as crispEdges rects, not as text art', () => {
  for (const a of NAMES) {
    const svg = card(a);
    assert.match(svg, /<g shape-rendering="crispEdges">/);
    for (const rect of svgRects(a, { x: 48, y: 62, scale: 12 })) assert.ok(svg.includes(rect), `${a}: sprite rect missing`);
    assert.doesNotMatch(svg, /<g font-size="18"/, 'the monospace ASCII art is gone');
    assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=|url\(|@import|on[a-z]+=/i);
    assert.match(svg, />(Beaver|Owl|Bee|Octopus|Ant|Fox|Turtle|Egg)</);
  }
});

test('the sprite sits inside the white panel and clear of the hatching line', () => {
  for (const [x, y, w, h] of svgRects('Owl', { x: 48, y: 62, scale: 12 }).map((l) => l.match(/x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/).slice(1).map(Number))) {
    assert.ok(x >= 24 && x + w <= 264 && y >= 24 && y + h <= 258);
  }
});

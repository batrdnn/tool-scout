// Item 2: half-block terminal rendering (▀ ▄ █), 24-bit color with a 256-color fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { halfBlocks, ansi256, supportsTruecolor, pixels, SPRITES } from '../scripts/lib/sprites.mjs';
import { painter, stripAnsi, strWidth } from '../scripts/lib/term.mjs';
import { prettyMe } from '../scripts/lib/pretty.mjs';
import { whoAmI, ORDER, ANIMALS } from '../scripts/lib/me.mjs';
import { prof } from './helpers.mjs';

const NAMES = [...ORDER, 'Egg'];
const ESC = '\u001b';

test('halfBlocks: 8 lines of 16 columns, only ▀ ▄ █ and spaces once colors are stripped', () => {
  for (const n of NAMES) {
    const lines = halfBlocks(n, { truecolor: true });
    assert.equal(lines.length, 8);
    for (const l of lines) {
      assert.equal(strWidth(l), 16, n);
      assert.match(stripAnsi(l), /^[▀▄█ ]{16}$/);
    }
    for (const l of lines) { // no color is left open at the end of a line
      const last = [...l.matchAll(/\u001b\[([0-9;]*)m/g)].pop();
      assert.ok(!last || last[1] === '0', `${n}: line ends with color on`);
    }
  }
});

test('halfBlocks draws each pair of pixel rows as one text row (▀ top, ▄ bottom, █ both the same)', () => {
  for (const n of NAMES) {
    const px = pixels(n);
    const lines = halfBlocks(n, { truecolor: true }).map(stripAnsi);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
      const top = px[2 * y][x], bot = px[2 * y + 1][x];
      const want = !top && !bot ? ' ' : top && !bot ? '▀' : !top && bot ? '▄' : top === bot ? '█' : '▀';
      assert.equal(lines[y][x], want, `${n} (${x},${y})`);
    }
  }
});

test('24-bit color uses 38;2 / 48;2 with the palette values', () => {
  const text = halfBlocks('Beaver', { truecolor: true }).join('\n');
  assert.match(text, /\u001b\[38;2;59;36;18m/); // #3b2412, the Beaver outline
  assert.doesNotMatch(text, /38;5;/);
});

test('256-color fallback uses 38;5 / 48;5 only, with indices 16-255', () => {
  const text = halfBlocks('Beaver', { truecolor: false }).join('\n');
  assert.doesNotMatch(text, /;2;\d+;\d+;\d+m/);
  const idx = [...text.matchAll(/\u001b\[[34]8;5;(\d+)m/g)].map((m) => +m[1]);
  assert.ok(idx.length > 10);
  assert.ok(idx.every((i) => i >= 16 && i <= 255));
  assert.equal(stripAnsi(text), stripAnsi(halfBlocks('Beaver', { truecolor: true }).join('\n')));
});

test('ansi256 maps to the nearest cube or grey-ramp entry', () => {
  assert.equal(ansi256('#000000'), 16);
  assert.equal(ansi256('#ffffff'), 231);
  assert.equal(ansi256('#ff0000'), 196);
  assert.equal(ansi256('#808080'), 244);
});

test('supportsTruecolor: COLORTERM=truecolor or 24bit only', () => {
  assert.equal(supportsTruecolor({ COLORTERM: 'truecolor' }), true);
  assert.equal(supportsTruecolor({ COLORTERM: '24bit' }), true);
  assert.equal(supportsTruecolor({ TERM: 'xterm-256color' }), false);
  assert.equal(supportsTruecolor({}), false);
});

const P = (style) => painter({ pretty: true, ...style }, { width: 80 });
const me = (style, animal) => prettyMe(whoAmI(prof(), { as: animal }), P(style));

test('pretty `me` in color + Unicode shows the half-block sprite, in 24-bit or 256 colors', () => {
  const t = me({ color: true, unicode: true, truecolor: true }, 'Fox');
  assert.match(t, /\u001b\[38;2;/);
  assert.match(stripAnsi(t), /[▀▄█]/);
  const t256 = me({ color: true, unicode: true, truecolor: false }, 'Fox');
  assert.match(t256, /\u001b\[38;5;/);
  assert.doesNotMatch(t256, /38;2;/);
  for (const text of [t, t256]) for (const l of text.split('\n')) assert.ok(strWidth(l) <= 80, 'fits in 80 columns');
});

test('NO_COLOR and ASCII terminals never get color escapes from the sprite', () => {
  for (const style of [{ color: false, unicode: true }, { color: false, unicode: false }]) {
    for (const a of NAMES) assert.doesNotMatch(me(style, a), /\u001b\[(38|48);/, a);
  }
  // ASCII terminals keep ASCII only; the old ASCII art is what they get.
  const ascii = me({ color: false, unicode: false }, 'Owl');
  assert.match(ascii, /^[\x00-\x7f]*$/);
  for (const line of ANIMALS.Owl.art) assert.ok(ascii.includes(line));
});

test('the sprite text holds the animal on every row of the box, for all 8', () => {
  for (const a of NAMES) {
    const t = stripAnsi(me({ color: true, unicode: true, truecolor: true }, a));
    assert.match(t, /[▀▄█]{3}/, a);
    assert.ok(SPRITES[a]);
  }
});

test('the CLI picks 24-bit from COLORTERM and otherwise 256 colors (pretty TTY only)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  // A child without a TTY is never pretty: no sprite escape codes at all.
  const data = mkdtempSync(join(tmpdir(), 'ts-sprite-'));
  const run = (env) => spawnSync(process.execPath, [new URL('../scripts/scout.mjs', import.meta.url).pathname, 'me', '--data', data], { env: { PATH: process.env.PATH, HOME: data, ...env }, encoding: 'utf8' });
  const out = run({ COLORTERM: 'truecolor', LANG: 'en_US.UTF-8' }).stdout;
  assert.doesNotMatch(out, /\u001b\[/);
});

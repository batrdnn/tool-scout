// Item 3: monochrome shading (░▒▓█) for plain output, NO_COLOR and Claude Code: no escape codes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shaded, pixels, luminance } from '../scripts/lib/sprites.mjs';
import { whoAmI, formatMe, ORDER } from '../scripts/lib/me.mjs';
import { painter, stripAnsi } from '../scripts/lib/term.mjs';
import { prettyMe } from '../scripts/lib/pretty.mjs';
import { prof } from './helpers.mjs';

const NAMES = [...ORDER, 'Egg'];

test('shaded: 16 rows of 32 columns (each pixel is 2 characters wide), only space and ░▒▓█', () => {
  for (const n of NAMES) {
    const rows = shaded(n);
    assert.equal(rows.length, 16);
    for (const r of rows) assert.match(r, /^[ ░▒▓█]{32}$/, n);
  }
});

test('shaded: empty cells are blank, drawn cells are never blank, darker colors get denser characters', () => {
  for (const n of NAMES) {
    const px = pixels(n);
    const rows = shaded(n);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const cell = rows[y].slice(2 * x, 2 * x + 2);
      if (!px[y][x]) assert.equal(cell, '  ', `${n} (${x},${y})`);
      else { assert.notEqual(cell.trim(), '', `${n} (${x},${y})`); assert.equal(cell[0], cell[1]); }
    }
  }
  const density = (ch) => ' ░▒▓█'.indexOf(ch);
  const px = pixels('Beaver');
  const rows = shaded('Beaver');
  const cells = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (px[y][x]) cells.push([luminance(px[y][x]), density(rows[y][2 * x])]);
  for (const [l1, d1] of cells) for (const [l2, d2] of cells) if (l1 < l2) assert.ok(d1 >= d2, 'darker is never lighter');
});

test('each sprite uses at least 3 different shades, so it reads as pixel art, not a silhouette', () => {
  for (const n of NAMES) assert.ok(new Set(shaded(n).join('').replace(/ /g, '')).size >= 3, n);
});

test('plain `me` output shows the shaded sprite, with no escape codes and no ASCII-art lines', () => {
  for (const n of NAMES) {
    const text = formatMe(whoAmI(prof(), { as: n }));
    for (const row of shaded(n)) assert.ok(text.includes(row.trimEnd()), `${n}: row missing`);
    assert.doesNotMatch(text, /\u001b/);
    assert.match(text, new RegExp(`${n.toUpperCase()} · `));
  }
});

test('NO_COLOR (pretty, Unicode) gets the shaded sprite and no color codes; ASCII terminals keep ASCII art', () => {
  const r = whoAmI(prof(), { as: 'Bee' });
  const nocolor = prettyMe(r, painter({ pretty: true, color: false, unicode: true }, { width: 80 }));
  assert.doesNotMatch(nocolor, /\u001b/);
  for (const row of shaded('Bee')) assert.ok(stripAnsi(nocolor).includes(row.trimEnd()));
  for (const l of nocolor.split('\n')) assert.ok([...l].length <= 80);
  const ascii = prettyMe(r, painter({ pretty: true, color: false, unicode: false }, { width: 80 }));
  assert.match(ascii, /^[\x00-\x7f]*$/);
});

test('`me --plain` and `me --json` from the CLI: shading in the text, art stays ASCII in the JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-shade-'));
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(prof({ sessions: 30 })));
  const cli = new URL('../scripts/scout.mjs', import.meta.url).pathname;
  const run = (...a) => execFileSync(process.execPath, [cli, 'me', ...a, '--data', dir], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, CLAUDECODE: '1' } });
  const plain = run('--plain');
  assert.match(plain, /[░▒▓█]{2}/);
  assert.doesNotMatch(plain, /\u001b/);
  const j = JSON.parse(run('--json'));
  assert.ok(j.art.every((l) => /^[\x20-\x7e]*$/.test(l)));
});

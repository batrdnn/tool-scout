// The README's terminal screenshot: the pretty output of the fixture profile and picks, drawn
// as an SVG terminal window by the current renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCREENSHOT_FILE, screenshotSvg, ansiToSvgLines } from './screenshot.mjs';

const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('docs/assets/terminal.svg matches the current pretty output (run `npm run screenshot` to update)', () => {
  assert.ok(fs.existsSync(SCREENSHOT_FILE), `${SCREENSHOT_FILE} missing`);
  assert.equal(fs.readFileSync(SCREENSHOT_FILE, 'utf8'), screenshotSvg(), 'out of date');
});

test('the screenshot is a self-contained SVG with colors and boxes', () => {
  const svg = screenshotSvg();
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>\n$/);
  assert.ok(!/\b(?:href|src)=/.test(svg), 'no external references');
  assert.ok(!svg.includes('\u001b'), 'escape codes were converted');
  for (const s of ['╭', '╮', '│', '╰', '╯', 'Tool Scout']) assert.ok(svg.includes(s), s);
  assert.match(svg, /microsoft\/playwright-mcp/);
  assert.ok(new Set([...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1])).size >= 5, 'several colors');
});

test('ANSI to SVG: colors and bold become tspans at their column, text is escaped', () => {
  const [line] = ansiToSvgLines('a \u001b[1m\u001b[36m<b>\u001b[39m\u001b[22m & c', { cw: 10 });
  assert.match(line, /<tspan x="0"[^>]*>a<\/tspan>/);
  assert.match(line, /<tspan x="20" fill="#[0-9a-f]{6}" font-weight="700" textLength="30"[^>]*>&lt;b&gt;<\/tspan>/);
  assert.match(line, /<tspan x="60"[^>]*>&amp; c<\/tspan>/);
  const [gap] = ansiToSvgLines('ab   cd', { cw: 10 });
  assert.match(gap, /x="0"[^>]*>ab<.*x="50"[^>]*>cd</, 'a run of spaces becomes a column position');
});

test('the README shows the screenshot and explains when output is pretty', () => {
  const sec = README.split(/^## /m).find((s) => s.startsWith('In a terminal'));
  assert.ok(sec, 'README needs a "## In a terminal" section');
  assert.match(sec, /<img src="docs\/assets\/terminal\.svg" alt="[^"]+"/);
  for (const s of ['--plain', 'NO_COLOR', 'ASCII', '--json']) assert.ok(sec.includes(s), s);
  assert.match(sec, /Claude Code/);
});

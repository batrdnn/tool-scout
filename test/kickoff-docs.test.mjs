// v0.11.0 item 4: the README and docs/USAGE.md explain the kickoff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const section = (md, h) => { const i = md.indexOf(`\n## ${h}`); assert.ok(i > 0, `no "## ${h}"`); return md.slice(i, md.indexOf('\n## ', i + 3)).replace(/\s+/g, ' '); };
const README = read('README.md');
const USAGE = read('docs/USAGE.md');

test('README has a Project kickoff section, after Build your own', () => {
  assert.ok(README.indexOf('## Project kickoff') > README.indexOf('## Build your own'));
  assert.ok(README.indexOf('## Project kickoff') < README.indexOf('## Command line'));
  const sec = section(README, 'Project kickoff');
  for (const re of [/\/tool-scout:kickoff/, /past(?:e|ed)[^.]*or[^.]*file|file[^.]*or[^.]*past/i, /tasks, stack, domain(?:,)? and conventions/,
    /never sent/, /local catalog/, /dependency files/, /at most 5/, /nothing needed: Claude handles this without a tool/i,
    /CLAUDE\.md (?:memory )?note/, /choose|multi-select/i, /its own plan/, /yes\/no/, /never in bulk/i, /undo/, /kickoff\/needs\.json/]) assert.match(sec, re, String(re));
});

test('README lists the kickoff in Commands, the plain-language table, Privacy and Command line', () => {
  assert.match(section(README, 'Commands'), /\| `\/tool-scout:kickoff` \|/);
  assert.match(section(README, 'Commands'), /\| "[^"]*plan[^"]*" \| `kickoff --plan-file` \|/);
  assert.match(section(README, 'Privacy'), /project plan[^.]*(?:data folder|needs\.json)[^.]*never sent/i);
  assert.match(README, /node scripts\/scout\.mjs kickoff --plan-file PLAN\.md --project \./);
});

test('README Build your own mentions --replace and the personal hook scope', () => {
  const sec = section(README, 'Build your own');
  assert.match(sec, /--replace/);
  assert.match(sec, /settings\.local\.json/);
});

test('docs/USAGE.md explains how the kickoff matches and decides', () => {
  const sec = section(USAGE, 'Project kickoff');
  for (const re of [/needs\.json/, /same ranking/, /effort/, /trust/, /good enough/i, /first clause|name or (?:its )?first/, /nothing needed/i,
    /Build your own/, /impact/, /at most 5/, /memory note/i, /--rematch/, /--summary/, /plan text/i, /never (?:goes into|appears in|sent)/]) assert.match(sec, re, String(re));
});

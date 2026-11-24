// docs/USAGE.md documents the animal mapping with the thresholds the code uses; the README lists the command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ORDER, THRESHOLDS, EGG_SESSIONS, CLOSE, MAX_SCORE, OCTOPUS_PROJECTS, TURTLE_PROJECTS, ANIMALS } from '../scripts/lib/me.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const section = (md, name) => md.split(/^## /m).find((s) => s.startsWith(name)) || '';
const rows = (md) => md.split('\n').filter((l) => /^\|/.test(l) && !/^\|[-| ]+\|$/.test(l)).slice(1).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

test('docs/USAGE.md has the mapping table, with the same thresholds as the code', () => {
  const sec = section(read('docs/USAGE.md'), 'Your Claude Code animal');
  assert.ok(sec, 'USAGE.md needs a "## Your Claude Code animal" section');
  const table = rows(sec.split('\n\n').find((b) => /^\| animal \|/m.test(b)) || '');
  assert.deepEqual(table.map((r) => r[0].replace(/\*/g, '')), [...ORDER, 'Egg']);
  for (const [name, title, , threshold] of table) {
    const a = name.replace(/\*/g, '');
    assert.equal(title, ANIMALS[a].title, a);
    const want = a === 'Egg' ? [EGG_SESSIONS] : a === 'Fox' ? [THRESHOLDS.Fox.topics, THRESHOLDS.Fox.languages]
      : a === 'Octopus' ? [THRESHOLDS.Octopus, OCTOPUS_PROJECTS] : a === 'Turtle' ? [THRESHOLDS.Turtle, TURTLE_PROJECTS] : [THRESHOLDS[a]];
    for (const n of want) assert.match(threshold, new RegExp(`(?<![\\d.])${String(n).replace('.', '\\.')}(?![\\d.])`), `${a}: threshold ${n} not in "${threshold}"`);
  }
  assert.match(sec, new RegExp(`capped at ${MAX_SCORE}\\b`));
  assert.match(sec, new RegExp(`${CLOSE}\\b`), 'close-second rule');
  assert.match(sec, new RegExp(ORDER.join(', ')), 'tie order');
  assert.match(sec, /same profile always gives the same/i);
  assert.match(sec, /--card/);
  assert.match(sec, /sessions, top language and top topic/i);
  assert.match(sec, /Tools that fit a/);
  assert.match(sec, /doesn't change (ranking|recommendations)/i);
});

test('the README lists /tool-scout:me, the plain-language request and the command line', () => {
  const readme = read('README.md');
  const cmds = section(readme, 'Commands');
  const [slash, plain] = cmds.split(/\n\s*Or just ask/);
  assert.ok(rows(slash).some((r) => r[0] === '`/tool-scout:me`'), 'slash-command table');
  assert.ok(rows(plain).some((r) => r[1] === '`me`'), 'plain-language table');
  assert.match(section(readme, 'Command line'), /scout\.mjs me( |$)/m);
  assert.match(section(readme, 'Command line'), /me --card/);
});

// v0.14.0 item 1: each animal's blind spot maps to one topic of the fixed taxonomy, documented in USAGE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ORDER, BLIND_TOPICS, whoAmI, EGG_SESSIONS } from '../scripts/lib/me.mjs';
import { TOPICS } from '../scripts/lib/taxonomy.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const section = (md, name) => md.split(/^## /m).find((s) => s.startsWith(name)) || '';

test('the map is exactly the one in the brief, and every topic is in the taxonomy', () => {
  assert.deepEqual(BLIND_TOPICS, { Owl: 'testing', Beaver: 'docs', Bee: 'debugging', Octopus: 'security', Ant: 'refactoring', Fox: 'planning', Turtle: 'git' });
  assert.deepEqual(Object.keys(BLIND_TOPICS).sort(), [...ORDER].sort(), 'every hatched animal, and no Egg');
  for (const t of Object.values(BLIND_TOPICS)) assert.ok(TOPICS[t], `${t} is a taxonomy topic`);
  assert.equal(BLIND_TOPICS.Egg, undefined);
});

test('the profile result carries the topic; the Egg has none', () => {
  const p = { sessions: 20, projects: 2, topics: {}, tools: { Edit: 9, Read: 1 }, languages: {} };
  assert.equal(whoAmI(p).blindTopic, BLIND_TOPICS[whoAmI(p).animal]);
  for (const a of ORDER) assert.equal(whoAmI(p, { as: a }).blindTopic, BLIND_TOPICS[a], a);
  const egg = whoAmI({ sessions: 3, projects: 1 });
  assert.equal(egg.animal, 'Egg');
  assert.equal(egg.blindTopic, null);
});

test('docs/USAGE.md documents the map, and says the Egg has no blind-spot tool', () => {
  const sec = section(read('docs/USAGE.md'), 'Your Claude Code animal');
  const rows = sec.split('\n').filter((l) => /^\|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.replace(/[*`]/g, '').trim()));
  const map = rows.filter((r) => r.length === 2 && BLIND_TOPICS[r[0]]);
  assert.deepEqual(Object.fromEntries(map), BLIND_TOPICS);
  assert.match(sec, /blind-spot tool/i);
  assert.match(sec, new RegExp(`Egg[^\\n]*no blind-spot tool[^\\n]*come back after ${EGG_SESSIONS} sessions`, 'i'));
});

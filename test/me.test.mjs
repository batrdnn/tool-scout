// `scout.mjs me`: the profile mapped deterministically to a Claude Code animal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { whoAmI, formatMe, ANIMALS, ORDER, EGG_SESSIONS } from '../scripts/lib/me.mjs';
import { prof } from './helpers.mjs';

const SCOUT = new URL('../scripts/scout.mjs', import.meta.url).pathname;

const cmds = (n, sessions = 3) => Array.from({ length: n }, (_, i) => ({ command: `tool${i} run`, count: 10, sessions }));

const CASES = {
  Beaver: prof({ tools: { Edit: 60, Write: 20, Bash: 20, Read: 20 }, languages: { TypeScript: 70 } }),
  Owl: prof({ topics: { debugging: 10, testing: 6 }, friction: { testing: 6, debugging: 3 } }),
  Bee: prof({ repeatedCommands: [{ command: 'npm test', count: 40, sessions: 15 }], topicSources: { actions: { testing: 15 }, mentions: {} } }),
  Octopus: prof({ projects: 4, tools: { 'mcp:alpha': 5, 'mcp:beta': 5, 'mcp:gamma': 5, 'mcp:delta': 5, Read: 20 } }),
  Ant: prof({ repeatedCommands: cmds(9) }),
  Fox: prof({ topics: { a: 2, b: 2, c: 2, d: 2, e: 2, f: 2, g: 2, h: 2, i: 2, j: 2 }, languages: { Python: 3, Go: 3, Rust: 3, Swift: 3 } }),
  Turtle: prof({ projects: 1, tools: { Read: 1200, Bash: 500, Edit: 100 } }),
};

test('each archetype comes from the signal it stands for', () => {
  assert.deepEqual(ORDER, ['Beaver', 'Owl', 'Bee', 'Octopus', 'Ant', 'Fox', 'Turtle']);
  for (const [animal, p] of Object.entries(CASES)) assert.equal(whoAmI(p).animal, animal, `${animal}: ${JSON.stringify(whoAmI(p).scores)}`);
});

test(`under ${EGG_SESSIONS} sessions it is an Egg: not hatched yet, come back after 10 sessions`, () => {
  assert.equal(EGG_SESSIONS, 10);
  const r = whoAmI({ ...CASES.Beaver, sessions: 9 });
  assert.equal(r.animal, 'Egg');
  assert.equal(r.hatched, false);
  assert.equal(r.second, null);
  const text = formatMe(r);
  assert.match(text, /not hatched yet/i);
  assert.match(text, /come back after 10 sessions/i);
  assert.match(text, /9 sessions/);
  assert.equal(whoAmI({ ...CASES.Beaver, sessions: 10 }).animal, 'Beaver');
});

test('the output shows art, title, the time window, 3 evidence lines from real counts, superpower and blind spot', () => {
  const r = whoAmI(CASES.Beaver);
  assert.equal(r.title, 'The Builder');
  assert.equal(r.evidence.length, 3);
  assert.match(r.evidence.join('\n'), /80 of 120 tool calls/);
  assert.match(r.evidence.join('\n'), /20 new files/);
  const text = formatMe(r);
  for (const line of ANIMALS.Beaver.art) assert.ok(text.includes(line), 'art missing');
  assert.match(text, /BEAVER · The Builder/);
  assert.match(text, /Your last 30 days: 20 sessions across 1 project\b/);
  for (const e of r.evidence) assert.ok(text.includes(`- ${e}`));
  assert.match(text, new RegExp(`Superpower: ${ANIMALS.Beaver.superpower}`));
  assert.match(text, new RegExp(`Blind spot: ${ANIMALS.Beaver.blindSpot}`));
});

test('every animal (and the Egg) has its own ASCII art, title, 3 evidence lines, superpower and blind spot', () => {
  const arts = new Set();
  for (const name of [...ORDER, 'Egg']) {
    const a = ANIMALS[name];
    assert.ok(a.title && a.superpower && a.blindSpot, name);
    assert.ok(a.art.length >= 4 && a.art.every((l) => /^[\x20-\x7e]*$/.test(l) && l.length <= 24), `${name}: art must be 4+ printable ASCII lines`);
    arts.add(a.art.join('\n'));
  }
  assert.equal(arts.size, ORDER.length + 1);
  for (const p of [...Object.values(CASES), prof({ sessions: 3 })]) assert.equal(whoAmI(p).evidence.length, 3);
});

test('a close score shows a second animal; a clear win does not', () => {
  const both = whoAmI(prof({ tools: { Edit: 60, Write: 20, Bash: 20, Read: 20 }, repeatedCommands: [{ command: 'npm test', count: 40, sessions: 15 }] }));
  assert.equal(both.animal, 'Beaver');
  assert.deepEqual(both.second, { animal: 'Bee', title: 'The Tester' });
  assert.match(formatMe(both), /Close second: Bee \(The Tester\)/);
  assert.equal(whoAmI(CASES.Beaver).second, null);
  assert.doesNotMatch(formatMe(whoAmI(CASES.Beaver)), /Close second/);
});

test('the same profile always gives the same output (timestamp and key order do not matter)', () => {
  for (const p of Object.values(CASES)) {
    const a = formatMe(whoAmI(p));
    assert.equal(formatMe(whoAmI(structuredClone(p))), a);
    const shuffled = Object.fromEntries(Object.entries({ ...p, generatedAt: '2030-01-01T00:00:00Z' }).reverse()
      .map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v]));
    assert.equal(formatMe(whoAmI(shuffled)), a);
    assert.deepEqual(whoAmI(shuffled), whoAmI(p));
  }
  // Ties go to the earlier animal in ORDER.
  const tie = prof({ tools: { Edit: 40, Read: 60 }, repeatedCommands: [{ command: 'pytest', count: 20, sessions: 10 }] });
  assert.equal(whoAmI(tie).scores.Beaver, whoAmI(tie).scores.Bee);
  assert.equal(whoAmI(tie).animal, 'Beaver');
});

test('text output never names commands, MCP servers, libraries or installed tools', () => {
  const p = prof({ tools: { 'mcp:zqserver1': 5, 'mcp:zqserver2': 5, 'mcp:zqserver3': 5, Read: 5 }, projects: 3,
    repeatedCommands: [{ command: 'zqdeploy.sh', count: 30, sessions: 9 }, ...cmds(7)], stack: { zqlib: 2 }, installed: { names: ['zqskill'], repos: ['zq/repo'] } });
  for (const animal of [...ORDER, 'Egg']) {
    const r = whoAmI(p, { as: animal }); // every animal's evidence lines, not just the winner's
    assert.equal(r.animal, animal);
    const text = formatMe(r) + JSON.stringify(r);
    assert.doesNotMatch(text, /zq/i);
  }
});

test('CLI: me reads the saved profile (--json too); with no profile it builds one', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-me-'));
  const data = path.join(home, 'd');
  const run = (...a) => execFileSync(process.execPath, [SCOUT, 'me', ...a, '--home', home, '--data', data], { encoding: 'utf8' });
  assert.match(run(), /EGG · Not hatched yet/);
  assert.ok(fs.existsSync(path.join(data, 'profile.json')));
  fs.writeFileSync(path.join(data, 'profile.json'), JSON.stringify(CASES.Bee));
  const j = JSON.parse(run('--json'));
  assert.equal(j.animal, 'Bee');
  assert.equal(j.window.days, 30);
  assert.equal(j.evidence.length, 3);
  assert.equal(run(), run());
  assert.match(run(), /BEE · The Tester/);
});

test('one line links to recommendations, as text only ("Tools that fit a/an <animal>: run /tool-scout:scout")', () => {
  const article = { Beaver: 'a', Owl: 'an', Bee: 'a', Octopus: 'an', Ant: 'an', Fox: 'a', Turtle: 'a', Egg: 'an' };
  for (const animal of [...ORDER, 'Egg']) {
    const r = whoAmI(prof(), { as: animal });
    const line = `Tools that fit ${article[animal]} ${animal}: run /tool-scout:scout`;
    assert.equal(r.next, line);
    const text = formatMe(r).split('\n');
    assert.equal(text.at(-1), line, 'last line');
    assert.equal(text.filter((l) => /tool-scout:scout/.test(l)).length, 1);
  }
  // Text only: nothing in me.mjs touches ranking.
  const src = fs.readFileSync(new URL('../scripts/lib/me.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from '\.\/(rank|pipeline|crawl|momentum)\.mjs'/);
});

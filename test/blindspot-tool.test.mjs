// v0.14.0 item 2: `me` finds the single best tool for the animal's blind-spot topic. Local ranking as
// if the history held only that topic plus the stack, the content scan, official plugins and
// built-ins first, and "nothing needed" when nothing is good enough. One line out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findBlindSpotTool, formatBlindSpotTool, BLIND_OFFICIAL } from '../scripts/lib/blindspot.mjs';
import { whoAmI, BLIND_TOPICS } from '../scripts/lib/me.mjs';
import { OFFICIAL_RULES, BUILTINS } from '../scripts/lib/kickoff-sources.mjs';
import { sandbox, catalog, catalogRepo, NOW, installPlugins } from './kickoff-helpers.mjs';
import { prof } from './helpers.mjs';
import { fileURLToPath } from 'node:url';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const owl = whoAmI(prof({ topics: { debugging: 10, testing: 6 }, friction: { testing: 6, debugging: 3 } }));
const as = (animal) => whoAmI(prof(), { as: animal });
const find = (r, o = {}) => { const sb = sandbox(); return findBlindSpotTool(r, prof(), o.catalog || catalog(), { home: sb.home, dataDir: sb.dataDir, now: NOW, ...o }); };

test('an Owl gets the best testing tool in the catalog, as one "Your blind spot (topic): tool (why)" line', async () => {
  assert.equal(owl.animal, 'Owl');
  const res = await find(owl);
  assert.equal(res.topic, 'testing');
  assert.equal(res.action, 'install');
  assert.equal(res.repo, 'acme/pytest-helper');
  const line = formatBlindSpotTool(res);
  assert.match(line, /^Your blind spot \(testing\): acme\/pytest-helper \(.+\)$/);
  assert.ok(!line.includes('\n'), 'one line');
  assert.equal(line, res.line);
});

test('the lookup ranks as if the history held only the topic plus the stack: other topics in the history change nothing', async () => {
  const busy = prof({ topics: { debugging: 10, testing: 6, finance: 40, database: 30 }, friction: { testing: 6, debugging: 3 } });
  const sb = sandbox();
  const a = await findBlindSpotTool(owl, prof(), catalog(), { home: sb.home, dataDir: sb.dataDir, now: NOW });
  const b = await findBlindSpotTool(owl, busy, catalog(), { home: sb.home, dataDir: sb.dataDir, now: NOW });
  assert.deepEqual(b, a);
});

test('the user\'s stack counts: of two testing tools the one built around their library wins', async () => {
  const cat = catalog();
  cat.repos['acme/jest-helper'] = catalogRepo('acme/jest-helper', 'Jest helper skill: writes and fixes jest tests for JavaScript and TypeScript projects', { language: 'TypeScript' });
  const sb = sandbox();
  const js = await findBlindSpotTool(owl, prof({ stack: { jest: 3 } }), cat, { home: sb.home, dataDir: sb.dataDir, now: NOW });
  const py = await findBlindSpotTool(owl, prof({ stack: { pytest: 3 } }), cat, { home: sb.home, dataDir: sb.dataDir, now: NOW });
  assert.equal(js.repo, 'acme/jest-helper');
  assert.equal(py.repo, 'acme/pytest-helper');
  assert.doesNotMatch(js.line, /jest(?!-helper)/i, 'no library names in the line');
});

test('official plugins and built-in features come before catalog repos', async () => {
  const cat = catalog();
  cat.repos['acme/sec-kit'] = catalogRepo('acme/sec-kit', 'Security audit skill: finds vulnerabilities and leaked secrets in your code');
  const sb = sandbox();
  const octopus = as('Octopus');
  const official = new Set(['security-guidance']);
  const r1 = await findBlindSpotTool(octopus, prof(), cat, { home: sb.home, dataDir: sb.dataDir, now: NOW, official });
  assert.equal(r1.action, 'official-plugin');
  assert.equal(r1.name, 'security-guidance');
  assert.equal(r1.repo, 'anthropics/claude-plugins-official');
  assert.match(r1.line, /^Your blind spot \(security\): security-guidance \(.+\)$/);
  // Not in the marketplace list, or already installed: the built-in feature is next, still before the catalog.
  const r2 = await findBlindSpotTool(octopus, prof(), cat, { home: sb.home, dataDir: sb.dataDir, now: NOW, official: new Set(['other']) });
  assert.equal(r2.action, 'builtin');
  assert.equal(r2.name, '/security-review');
  installPlugins(sb.home, 'security-guidance');
  const r3 = await findBlindSpotTool(octopus, prof(), cat, { home: sb.home, dataDir: sb.dataDir, now: NOW, official });
  assert.equal(r3.name, '/security-review');
  assert.equal((await findBlindSpotTool(as('Ant'), prof(), cat, { home: sb.home, dataDir: sb.dataDir, now: NOW })).name, '/simplify');
});

test('every official name the lookup prefers exists in the kickoff sources, and serves that topic', () => {
  for (const [topic, names] of Object.entries(BLIND_OFFICIAL)) {
    assert.ok(Object.values(BLIND_TOPICS).includes(topic), topic);
    for (const n of names) assert.ok([...OFFICIAL_RULES, ...BUILTINS].some((x) => x.name === n && x.topics.includes(topic)), `${n} for ${topic}`);
  }
});

test('"nothing needed: Claude covers this directly" when nothing is good enough', async () => {
  // Docs: the catalog only mentions documentation in passing (misc/everything-kit).
  for (const a of ['Beaver', 'Fox']) {
    const res = await find(as(a));
    assert.equal(res.action, 'nothing', a);
    assert.equal(res.line, `Your blind spot (${BLIND_TOPICS[a]}): nothing needed: Claude covers this directly`);
  }
  assert.equal((await find(owl, { catalog: { updatedAt: null, repos: {} } })).action, 'nothing', 'empty catalog');
});

test('a repo the content scan flags high is never offered, and the scan covers only the matched repo', async () => {
  const scanned = [];
  const scan = async (recs) => { for (const r of recs) { scanned.push(r.name); r.trust = { ...r.trust, tier: 'low', flags: [{ id: 'exfiltration', severity: 'high' }] }; } };
  const res = await find(owl, { scan });
  assert.equal(res.action, 'nothing');
  assert.deepEqual(scanned, ['acme/pytest-helper']);
  const ok = []; const clean = async (recs) => { for (const r of recs) ok.push(r.name); };
  assert.equal((await find(owl, { scan: clean })).repo, 'acme/pytest-helper');
  assert.deepEqual(ok, ['acme/pytest-helper']);
});

test('a dismissed repo is not offered', async () => {
  const sb = sandbox();
  fs.writeFileSync(path.join(sb.dataDir, 'dismissed.json'), JSON.stringify({ repos: { 'acme/pytest-helper': { at: '2026-11-01T00:00:00Z' } } }));
  const res = await findBlindSpotTool(owl, prof(), catalog(), { home: sb.home, dataDir: sb.dataDir, now: NOW });
  assert.equal(res.action, 'nothing');
});

test('the Egg has no blind-spot tool', async () => {
  const egg = whoAmI(prof({ sessions: 3 }));
  const res = await find(egg);
  assert.equal(res.action, 'none');
  assert.match(res.line, /come back after 10 sessions/i);
});

test('the CLI: me --blind-spot prints the one line; --json has the check command and manual steps, no Tool Scout install command', () => {
  const sb = sandbox();
  fs.writeFileSync(path.join(sb.dataDir, 'profile.json'), JSON.stringify(prof({ topics: { debugging: 10, testing: 6 }, friction: { testing: 6, debugging: 3 } })));
  const run = (...a) => spawnSync(process.execPath, [SCOUT, 'me', '--blind-spot', '--offline', '--home', sb.home, '--data', sb.dataDir, ...a], { encoding: 'utf8', cwd: sb.root });
  const plain = run('--plain');
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout.trim(), /^Your blind spot \(testing\): acme\/pytest-helper \([^\n]+\)$/);
  const json = JSON.parse(run('--json').stdout);
  assert.equal(json.animal, 'Owl');
  assert.equal(json.blindSpotTool.repo, 'acme/pytest-helper');
  assert.equal(json.blindSpotTool.check, 'acme/pytest-helper');
  assert.ok(!('next' in json.blindSpotTool), 'the installer is off: no Tool Scout install command');
  assert.match(json.blindSpotTool.manual, /\/tool-scout:check acme\/pytest-helper.*project scope/);
  assert.equal(json.blindSpotTool.line, plain.stdout.trim());
});

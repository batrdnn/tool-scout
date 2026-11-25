// v0.11.1 follow-up: needs files carry a format version. --rematch on an older file re-extracts from
// the saved plan text automatically and says so; a current file is matched as it is (Claude's edits stay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runKickoff, needsPath, NEEDS_VERSION } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW } from './kickoff-helpers.mjs';

const PLAN = '- Set up CI with GitHub Actions on every push\n- Write pytest tests for the parser\n';
const rematch = (sb) => runKickoff({ rematch: true, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
const edit = (sb, fn) => { const f = needsPath(sb.dataDir); const n = JSON.parse(fs.readFileSync(f, 'utf8')); fn(n); fs.writeFileSync(f, JSON.stringify(n)); };

test('a new needs file has the current format version', async () => {
  const sb = sandbox({ plan: PLAN });
  const r = await runKickoff({ planFile: sb.planFile, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  assert.equal(NEEDS_VERSION, 3);
  assert.equal(r.needs.v, NEEDS_VERSION);
});

test('rematch on an older needs file re-extracts from the saved plan text and says so', async () => {
  const sb = sandbox({ plan: PLAN });
  await runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  edit(sb, (n) => { n.v = 1; delete n.direct; n.needs = [{ topic: 'devops', kind: 'task', lines: ['stale line'], libraries: [], impact: 1 }]; n.rejects = ['x/y']; });
  const r = await rematch(sb);
  assert.equal(r.needs.v, NEEDS_VERSION);
  assert.deepEqual(r.needs.direct.map((d) => d.id), ['ci']);
  assert.ok(!JSON.stringify(r.needs.needs).includes('stale line'));
  assert.deepEqual(r.needs.rejects, ['x/y'], 'Claude\'s rejects are kept');
  assert.ok(r.toolkit.notes.some((x) => /older format/i.test(x) && /plan text/i.test(x)));
  assert.equal(r.needs.project, sb.project);
});

test('a file with no version counts as older', async () => {
  const sb = sandbox({ plan: PLAN });
  await runKickoff({ planFile: sb.planFile, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  edit(sb, (n) => { delete n.v; n.direct = []; });
  assert.ok((await rematch(sb)).toolkit.notes.some((x) => /older format/i.test(x)));
});

test('a current needs file is matched as it is: no re-extraction, no note', async () => {
  const sb = sandbox({ plan: PLAN });
  await runKickoff({ planFile: sb.planFile, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  edit(sb, (n) => { n.needs = n.needs.filter((x) => x.topic !== 'testing'); });
  const r = await rematch(sb);
  assert.ok(!r.needs.needs.some((x) => x.topic === 'testing'), 'Claude\'s correction stays');
  assert.ok(!r.toolkit.notes.some((x) => /older format/i.test(x)));
});

test('an older file without plan text cannot be re-extracted: a clear error', async () => {
  const sb = sandbox({ plan: PLAN });
  await runKickoff({ planFile: sb.planFile, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  edit(sb, (n) => { n.v = 1; delete n.plan; });
  await assert.rejects(rematch(sb), /--plan-file/);
});

test('USAGE says rematch re-extracts an older needs file', () => {
  assert.match(fs.readFileSync(new URL('../docs/USAGE.md', import.meta.url), 'utf8').replace(/\s+/g, ' '), /format version[^.]*--rematch[^.]*older[^.]*saved plan text/);
});

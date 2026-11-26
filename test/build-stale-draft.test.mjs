// v0.11.3 item 2: a draft folder left by an earlier run is never reused silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { startDraft, makeBuildPlan, formatBuildPlan } from '../scripts/lib/builder.mjs';
import { sandbox, draft, SKILL, ctx, NOW } from './build-helpers.mjs';
import { fileURLToPath } from 'node:url';
import { setExperimental } from '../scripts/lib/experimental.mjs';

test('start refuses an existing draft folder that has files, says so, and names --fresh', () => {
  const sb = sandbox();
  draft(sb, 'pytest-fixtures', { 'SKILL.md': SKILL('pytest-fixtures') });
  assert.throws(() => startDraft({ dataDir: sb.dataDir, form: 'skill', name: 'pytest-fixtures' }), /drafts\/pytest-fixtures.*already exists.*earlier run.*--fresh/s);
  assert.ok(fs.existsSync(path.join(sb.dataDir, 'drafts', 'pytest-fixtures', 'SKILL.md')), 'nothing was deleted');
});

test('start with fresh clears the old draft and makes an empty folder', () => {
  const sb = sandbox();
  draft(sb, 'pytest-fixtures', { 'SKILL.md': SKILL('pytest-fixtures'), 'old/x.md': 'x' });
  const s = startDraft({ dataDir: sb.dataDir, form: 'skill', name: 'pytest-fixtures', fresh: true });
  assert.deepEqual(fs.readdirSync(s.dir), []);
});

test('an empty or missing draft folder starts without --fresh', () => {
  const sb = sandbox();
  startDraft({ dataDir: sb.dataDir, form: 'skill', name: 'a' });
  startDraft({ dataDir: sb.dataDir, form: 'skill', name: 'a' });
});

test('the CLI refuses a stale draft and accepts --fresh', () => {
  const sb = sandbox(); setExperimental(sb.dataDir, true); // v0.17: installing and building are off unless the experimental setting is on
  draft(sb, 'fx', { 'SKILL.md': SKILL('fx') });
  const cli = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
  const run = (...a) => spawnSync(process.execPath, [cli, 'build', '--start', '--form', 'skill', '--name', 'fx', ...a, '--plain', '--data', sb.dataDir], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: sb.home } });
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /already exists.*--fresh/s);
  const ok = run('--fresh');
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(fs.readdirSync(path.join(sb.dataDir, 'drafts', 'fx')), []);
});

test('every build plan shows when its draft files were last written', async () => {
  const sb = sandbox();
  const from = draft(sb, 'fx', { 'SKILL.md': SKILL('fx'), 'templates/a.md': 'a' });
  const old = new Date('2026-11-20T08:30:00Z');
  const newest = new Date('2026-11-22T10:15:00Z');
  fs.utimesSync(path.join(from, 'SKILL.md'), old, old);
  fs.utimesSync(path.join(from, 'templates/a.md'), newest, newest);
  const plan = await makeBuildPlan({ ...ctx(sb), form: 'skill', name: 'fx', from });
  assert.equal(plan.body.draftWritten, newest.toISOString());
  const text = formatBuildPlan(plan, { home: sb.home });
  assert.match(text, /Written:\s+draft files last written 2026-11-22 10:15 UTC \(3 days before this plan\)/);
});

test('a plan for a draft written minutes ago says so in minutes', async () => {
  const sb = sandbox();
  const from = draft(sb, 'fx', { 'SKILL.md': SKILL('fx') });
  const t = new Date(NOW - 5 * 60e3);
  fs.utimesSync(path.join(from, 'SKILL.md'), t, t);
  const text = formatBuildPlan(await makeBuildPlan({ ...ctx(sb), form: 'skill', name: 'fx', from }), { home: sb.home });
  assert.match(text, /Written:\s+draft files last written 2026-11-25 11:55 UTC \(5 minutes before this plan\)/);
});

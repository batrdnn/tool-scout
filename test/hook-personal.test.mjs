// v0.11.0 item 0b: a "personal" hook scope. The hook runs in this project for this user only: its
// entry goes into the project's .claude/settings.local.json (not shared), and its script lives in
// ~/.claude/hooks/<name>/, outside the project, so nothing new shows up in the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeBuildPlan, confirmBuild, formatBuildPlan, hookCommandPath } from '../scripts/lib/builder.mjs';
import { undoInstall } from '../scripts/lib/installer.mjs';
import { sandbox, snapshot, changed, draft, SKILL, ctx } from './build-helpers.mjs';

const HOOK = { 'hook.json': JSON.stringify({ event: 'PostToolUse', matcher: 'Edit', script: 'fmt.sh' }), 'fmt.sh': '#!/bin/sh\nexit 0\n' };

test('a personal hook writes .claude/settings.local.json in the project, not settings.json', async () => {
  const sb = sandbox();
  fs.mkdirSync(path.join(sb.cwd, '.claude'));
  fs.writeFileSync(path.join(sb.cwd, '.claude', 'settings.json'), '{\n  "shared": true\n}\n');
  const before = snapshot(sb);
  const from = draft(sb, 'fmt', HOOK);
  const plan = await makeBuildPlan({ ...ctx(sb), form: 'hook', name: 'fmt', from, scope: 'personal' });
  assert.deepEqual(plan.body.blockers, []);
  assert.equal(plan.body.scope, 'personal');
  const local = path.join(sb.cwd, '.claude', 'settings.local.json');
  assert.equal(plan.body.hook.file, local);
  const script = path.join(sb.home, '.claude', 'hooks', 'fmt', 'fmt.sh');
  assert.deepEqual(plan.body.writes.map((w) => w.path), [script], 'the script stays out of the project');
  assert.equal(plan.body.hook.entry.hooks[0].command, `bash "${hookCommandPath(script)}"`);
  const text = formatBuildPlan(plan, { home: sb.home });
  assert.match(text, /Scope:     personal \(this project, only you\)/);
  assert.ok(text.includes(`${path.join(sb.cwd, '.claude', 'settings.local.json')}: adds that entry to hooks.PostToolUse`), text);

  const first = await confirmBuild({ ...ctx(sb), id: plan.id });
  assert.equal(first.pending, 'hook');
  const res = await confirmBuild({ ...ctx(sb), id: first.hookId, hook: true });
  assert.ok(res.ok, res.reason);
  assert.deepEqual(JSON.parse(fs.readFileSync(local, 'utf8')).hooks.PostToolUse, [{ matcher: 'Edit', hooks: [{ type: 'command', command: `bash "${hookCommandPath(script)}"` }] }]);
  assert.equal(fs.readFileSync(path.join(sb.cwd, '.claude', 'settings.json'), 'utf8'), '{\n  "shared": true\n}\n', 'shared settings untouched');
  assert.deepEqual(changed(before, snapshot(sb)).filter((p) => p.startsWith('project')), ['project/.claude/settings.local.json']);

  assert.ok((await undoInstall({ name: 'fmt', dataDir: sb.dataDir })).ok);
  assert.deepEqual(changed(before, snapshot(sb)), []);
});

test('personal keeps an existing settings.local.json byte for byte on undo', async () => {
  const sb = sandbox();
  const local = path.join(sb.cwd, '.claude', 'settings.local.json');
  fs.mkdirSync(path.dirname(local));
  const raw = '{\n    "permissions": { "allow": ["Bash(ls:*)"] }\n}';
  fs.writeFileSync(local, raw);
  const plan = await makeBuildPlan({ ...ctx(sb), form: 'hook', name: 'fmt', from: draft(sb, 'fmt', HOOK), scope: 'personal' });
  const first = await confirmBuild({ ...ctx(sb), id: plan.id });
  assert.ok((await confirmBuild({ ...ctx(sb), id: first.hookId, hook: true })).ok);
  assert.ok(JSON.parse(fs.readFileSync(local, 'utf8')).hooks);
  await undoInstall({ name: 'fmt', dataDir: sb.dataDir });
  assert.equal(fs.readFileSync(local, 'utf8'), raw);
});

test('personal is a hook scope only', async () => {
  const sb = sandbox();
  await assert.rejects(makeBuildPlan({ ...ctx(sb), form: 'skill', name: 'x', from: draft(sb, 'x', { 'SKILL.md': SKILL('x') }), scope: 'personal' }), /personal scope is for hooks/);
  await assert.rejects(makeBuildPlan({ ...ctx(sb), form: 'hook', name: 'x', from: draft(sb, 'x', HOOK), scope: 'team' }), /--scope must be user, project or personal/);
});

test('the CLI, the scout skill and USAGE offer the personal scope for hooks', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  assert.match(read('scripts/lib/cli.mjs'), /build --form F --name N --from DIR \[--scope user\|project\|personal\]/);
  const skill = read('skills/scout/SKILL.md');
  assert.match(skill, /"Just me, this project" = personal/);
  assert.match(skill, /settings\.local\.json/);
  assert.match(read('docs/USAGE.md'), /`personal` \(hooks only\)[^\n]*\.claude\/settings\.local\.json/);
});

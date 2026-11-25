// v0.11.0 item 0a: --replace. Replacing an installed skill (install) or a built item (build) is
// one step: every file is swapped in place, so there is never a moment with nothing installed,
// and undo puts the previous version back exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '../scripts/lib/github.mjs';
import { makePlan, confirmInstall, undoInstall, listInstalled, formatPlan } from '../scripts/lib/installer.mjs';
import { makeBuildPlan, confirmBuild, formatBuildPlan } from '../scripts/lib/builder.mjs';
import { mockFetch } from './helpers.mjs';
import { sandbox, snapshot, changed, draft, SKILL, ctx, NOW } from './build-helpers.mjs';

const gitSha = (t) => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(t)}\0`).update(t).digest('hex');
const SHA = 'e'.repeat(40);
const FILES = { 'SKILL.md': '---\nname: fixtures\ndescription: Fixtures v2. Use when the user asks for fixtures.\n---\nVersion two.\n', 'ref/new.md': 'new reference\n' };

/** Mock GitHub with one skill repo, o/fixtures, at one pinned commit. */
function github() {
  return mockFetch((url) => {
    const u = new URL(url);
    const m = u.pathname.match(/^\/repos\/o\/fixtures(?:\/(.*))?$/);
    if (!m) return undefined;
    const rest = m[1] || '';
    const ref = u.searchParams.get('ref');
    if (ref && ref !== SHA) return undefined;
    if (!rest) return { full_name: 'o/fixtures', name: 'fixtures', owner: { login: 'o', type: 'Organization' }, html_url: 'https://github.com/o/fixtures', description: 'Fixtures skill', topics: ['claude-skills'], language: 'Python', stargazers_count: 500, forks_count: 20, license: { spdx_id: 'MIT' }, archived: false, fork: false, created_at: '2025-01-01T00:00:00Z', pushed_at: '2026-10-01T00:00:00Z', default_branch: 'main' };
    if (rest === 'commits/HEAD' || rest === 'commits/main') return { sha: SHA };
    if (rest.startsWith('git/trees/')) return { sha: SHA, truncated: false, tree: Object.entries(FILES).map(([p, t]) => ({ path: p, type: 'blob', mode: '100644', sha: gitSha(t), size: Buffer.byteLength(t) })) };
    if (rest.startsWith('git/blobs/')) { const t = Object.values(FILES).find((x) => gitSha(x) === rest.split('/')[2]); return t == null ? undefined : { encoding: 'base64', content: Buffer.from(t).toString('base64') }; }
    if (rest === 'readme') return '# Fixtures\n';
    if (rest.startsWith('contents/')) return FILES[decodeURIComponent(rest.slice(9))];
    return undefined;
  });
}

/** The user's current version of the skill, with a file the new version doesn't have. */
function oldSkill(sb) {
  const dir = path.join(sb.home, '.claude', 'skills', 'fixtures');
  fs.mkdirSync(path.join(dir, 'ref'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: fixtures\n---\nVersion one.\n');
  fs.writeFileSync(path.join(dir, 'ref', 'old.md'), 'old reference\n');
  return dir;
}

/** Calls `fn` while checking, after every file operation, that `file` still exists. */
async function neverMissing(file, fn) {
  const ops = ['writeFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'copyFileSync', 'mkdirSync'];
  const orig = Object.fromEntries(ops.map((k) => [k, fs[k]]));
  let checks = 0;
  for (const k of ops) fs[k] = (...a) => { const r = orig[k].apply(fs, a); checks++; assert.ok(fs.existsSync(file), `${file} missing after fs.${k}(${a[0]})`); return r; };
  try { return { result: await fn(), checks }; } finally { Object.assign(fs, orig); }
}

test('install without --replace still refuses an existing skill folder', async () => {
  const sb = sandbox(); oldSkill(sb);
  const plan = await makePlan({ client: createClient({ fetchImpl: github() }), repo: 'o/fixtures', home: sb.home, cwd: sb.cwd, dataDir: sb.dataDir, now: NOW });
  assert.match(plan.body.blockers.join('\n'), /already exists: Tool Scout never overwrites it/);
  assert.equal(plan.body.replace, undefined);
});

test('install --replace: one step, never a moment without the skill, and undo restores the old version', async () => {
  const sb = sandbox(); const dir = oldSkill(sb);
  const c = { client: createClient({ fetchImpl: github() }), home: sb.home, cwd: sb.cwd, dataDir: sb.dataDir, now: NOW };
  const before = snapshot(sb);
  const plan = await makePlan({ ...c, repo: 'o/fixtures', replace: true });
  assert.deepEqual(plan.body.blockers, []);
  assert.deepEqual(changed(before, snapshot(sb)), [], 'the plan writes nothing');
  assert.deepEqual(plan.body.replace.files.map((f) => path.relative(dir, f.path)).sort(), ['SKILL.md', path.join('ref', 'old.md')]);
  const text = formatPlan(plan, { home: sb.home });
  assert.match(text, /Replaces:  ~\/\.claude\/skills\/fixtures \(2 files now\)/);
  assert.match(text, /undo puts the current version back/);

  const { result: res, checks } = await neverMissing(path.join(dir, 'SKILL.md'), () => confirmInstall({ ...c, id: plan.id }));
  assert.ok(res.ok, res.reason);
  assert.ok(checks > 3);
  assert.equal(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), FILES['SKILL.md']);
  assert.equal(fs.readFileSync(path.join(dir, 'ref', 'new.md'), 'utf8'), FILES['ref/new.md']);
  assert.ok(!fs.existsSync(path.join(dir, 'ref', 'old.md')), 'a file the new version does not have is gone');
  assert.deepEqual(fs.readdirSync(dir).filter((f) => /tmp/.test(f)), [], 'no temp files left');

  const { result: undo } = await neverMissing(path.join(dir, 'SKILL.md'), () => undoInstall({ name: 'fixtures', dataDir: sb.dataDir }));
  assert.ok(undo.ok);
  assert.deepEqual(undo.kept, []);
  assert.deepEqual(changed(before, snapshot(sb)), [], 'undo gives back the old version byte for byte');
});

test('install --replace re-checks the old version: changed since the plan means a new plan', async () => {
  const sb = sandbox(); const dir = oldSkill(sb);
  const c = { client: createClient({ fetchImpl: github() }), home: sb.home, cwd: sb.cwd, dataDir: sb.dataDir, now: NOW };
  const plan = await makePlan({ ...c, repo: 'o/fixtures', replace: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'edited by hand\n');
  const res = await confirmInstall({ ...c, id: plan.id });
  assert.equal(res.ok, false);
  assert.match(res.reason, /changed since the plan \(replace\)/);
  assert.equal(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), 'edited by hand\n');
});

test('build --replace swaps a built skill in one step; the old log entry comes back on undo', async () => {
  const sb = sandbox();
  const from = draft(sb, 'pytest-fixtures', { 'SKILL.md': SKILL('pytest-fixtures'), 'old.md': 'old\n' });
  const p1 = await makeBuildPlan({ ...ctx(sb), form: 'skill', name: 'pytest-fixtures', from });
  assert.ok((await confirmBuild({ ...ctx(sb), id: p1.id })).ok);
  const before = snapshot(sb);
  const dir = path.join(sb.home, '.claude', 'skills', 'pytest-fixtures');

  fs.rmSync(from, { recursive: true });
  draft(sb, 'pytest-fixtures', { 'SKILL.md': SKILL('pytest-fixtures', 'Now with factories.\n') });
  const blocked = await makeBuildPlan({ ...ctx(sb), form: 'skill', name: 'pytest-fixtures', from });
  assert.match(blocked.body.blockers.join('\n'), /already exists/);
  const p2 = await makeBuildPlan({ ...ctx(sb), form: 'skill', name: 'pytest-fixtures', from, replace: true });
  assert.deepEqual(p2.body.blockers, []);
  assert.match(formatBuildPlan(p2, { home: sb.home }), /Replaces:  ~\/\.claude\/skills\/pytest-fixtures \(2 files now\)/);
  const { result: res } = await neverMissing(path.join(dir, 'SKILL.md'), () => confirmBuild({ ...ctx(sb), id: p2.id }));
  assert.ok(res.ok, res.reason);
  assert.match(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), /factories/);
  assert.ok(!fs.existsSync(path.join(dir, 'old.md')));
  assert.deepEqual(listInstalled(sb.dataDir).map((e) => e.planId), [p2.id], 'the replaced entry is not listed twice');

  const undo = await undoInstall({ name: 'pytest-fixtures', dataDir: sb.dataDir });
  assert.ok(undo.ok);
  assert.deepEqual(changed(before, snapshot(sb)), [], 'the first build is back, byte for byte');
  assert.deepEqual(listInstalled(sb.dataDir).map((e) => e.planId), [p1.id], 'and its log entry is active again');
  assert.ok((await undoInstall({ name: 'pytest-fixtures', dataDir: sb.dataDir })).ok);
  assert.ok(!fs.existsSync(dir), 'undoing the first build still removes it');
});

test('build --replace of a memory section changes it in place, and undo restores the old text', async () => {
  const sb = sandbox();
  const file = path.join(sb.cwd, 'CLAUDE.md');
  fs.writeFileSync(file, '# Project\n\nKeep this.\n');
  const from = draft(sb, 'conventions', { 'CLAUDE.md': '- Use tabs.\n' });
  const p1 = await makeBuildPlan({ ...ctx(sb), form: 'memory', name: 'conventions', from, scope: 'project' });
  assert.ok((await confirmBuild({ ...ctx(sb), id: p1.id })).ok);
  fs.appendFileSync(file, '\nAdded by the user later.\n');
  const before = fs.readFileSync(file, 'utf8');

  fs.writeFileSync(path.join(from, 'CLAUDE.md'), '- Use spaces.\n- Run npm test before commits.\n');
  const p2 = await makeBuildPlan({ ...ctx(sb), form: 'memory', name: 'conventions', from, scope: 'project', replace: true });
  assert.deepEqual(p2.body.blockers, []);
  assert.ok((await confirmBuild({ ...ctx(sb), id: p2.id })).ok);
  const now = fs.readFileSync(file, 'utf8');
  assert.match(now, /Use spaces\.\n- Run npm test/);
  assert.doesNotMatch(now, /Use tabs/);
  assert.match(now, /Added by the user later\.\n$/, 'replaced where it was, not moved to the end');
  assert.ok((await undoInstall({ name: 'conventions', dataDir: sb.dataDir })).ok);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('--replace is refused for a hook (its settings entry is not swapped in place)', async () => {
  const sb = sandbox();
  const from = draft(sb, 'guard', { 'hook.json': JSON.stringify({ event: 'PreToolUse', matcher: 'Bash', script: 'g.sh' }), 'g.sh': 'exit 0\n' });
  const p = await makeBuildPlan({ ...ctx(sb), form: 'hook', name: 'guard', from, replace: true });
  assert.match(p.body.blockers.join('\n'), /--replace is for skills, commands, subagents and memory/);
});

test('the CLI takes --replace for install and build plans', () => {
  const cli = fs.readFileSync(new URL('../scripts/lib/cli.mjs', import.meta.url), 'utf8');
  assert.match(cli, /BOOLEAN = new Set\(\[[^\]]*'replace'/);
  assert.match(cli, /install <owner\/repo> \[--part NAME\] \[--scope user\|project\] \[--replace\] --plan/);
  assert.match(cli, /build --form F --name N --from DIR \[--scope [^\]]+\] \[--replace\]/);
});

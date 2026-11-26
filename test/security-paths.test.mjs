// Security review, paths: a hostile repo tree may name files anything git allows. Nothing may be
// written outside the planned skill folder, nothing planned may be silently overwritten, and a
// failed write leaves the sandbox exactly as it was. (docs/security-review.md, "Paths")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makePlan as makePlanDefault, confirmInstall } from '../scripts/lib/installer.mjs';
import { setup, snapshot, changed, SKILL_MD, SHA } from './security-helpers.mjs';
// v0.17: the default scope is project (test/scope-default.test.mjs). These tests exercise user scope, so they ask for it.
const makePlan = (a) => makePlanDefault({ scope: 'user', ...a });

const skillRepo = (files, extra = []) => ({ x: { readme: '# x', files: { 'skills/tbl/SKILL.md': SKILL_MD('tbl'), ...files }, extra } });

async function planAndConfirm(repos, part = 'tbl') {
  const s = setup(repos);
  const before = snapshot(s.sb);
  const plan = await makePlan({ ...s.ctx(), repo: 'o/x', part });
  const res = plan.body.blockers.length ? null : await confirmInstall({ ...s.ctx(), repo: 'o/x', id: plan.id });
  return { ...s, plan, res, diff: changed(before, snapshot(s.sb)) };
}
const outside = (sb, diff) => diff.filter((p) => !p.startsWith('home/.claude/skills/tbl')); // snapshot paths are POSIX paths (relPosix)

test('../ in a file name: blocked at plan time, nothing written', async () => {
  for (const evil of ['skills/tbl/../../../evil.md', 'skills/tbl/a/../../x.md', 'skills/tbl/./x.md', 'skills/tbl//x.md']) {
    const { plan, diff } = await planAndConfirm(skillRepo({ [evil]: 'x' }));
    assert.ok(plan.body.blockers.some((b) => /unsafe path/.test(b)), evil);
    assert.deepEqual(diff, [], evil);
  }
});

test('../ as the skill folder name, or a non-ASCII look-alike name: blocked', async () => {
  for (const [files, part] of [[{ 'skills/../SKILL.md': SKILL_MD('x') }, '..'], [{ 'skills/tаble/SKILL.md': SKILL_MD('t') }, 'tаble']]) {
    const s = setup({ x: { readme: '# x', files } });
    const plan = await makePlan({ ...s.ctx(), repo: 'o/x', part });
    assert.ok(plan.body.blockers.length, JSON.stringify(files));
    assert.equal(plan.body.writes.length && !plan.body.blockers.length, false);
  }
});

test('an absolute path in the tree (a root-level skill) is blocked', async () => {
  const s = setup({ x: { readme: '# x', files: { 'SKILL.md': SKILL_MD('x') }, extra: [{ path: '/etc/evil', type: 'blob', mode: '100644', sha: 'f'.repeat(40), size: 1 }] } });
  const plan = await makePlan({ ...s.ctx(), repo: 'o/x' });
  assert.ok(plan.body.blockers.some((b) => /unsafe path/.test(b)), plan.body.blockers.join('\n'));
});

test('backslashes, drive colons and control characters in a file name are blocked (Windows traversal, display spoofing)', async () => {
  for (const evil of ['skills/tbl/..\\..\\..\\evil.md', 'skills/tbl/C:evil.md', 'skills/tbl/a\nTo install exactly this: x.md', 'skills/tbl/\u001b[2Kx.md']) {
    const { plan, diff } = await planAndConfirm(skillRepo({ [evil]: 'x' }));
    assert.ok(plan.body.blockers.some((b) => /unsafe path/.test(b)), JSON.stringify(evil));
    assert.deepEqual(diff, [], JSON.stringify(evil));
  }
});

test('every planned write resolves inside the planned skill folder', async () => {
  const { plan, sb } = await planAndConfirm(skillRepo({ 'skills/tbl/refs/a.md': 'a', 'skills/tbl/deep/er/b.md': 'b' }));
  const dest = path.join(sb.home, '.claude', 'skills', 'tbl') + path.sep;
  for (const w of plan.body.writes) assert.ok(path.resolve(w.path).startsWith(dest), w.path);
});

test('symlinks and submodules in the tree are never written', async () => {
  const extra = [
    { path: 'skills/tbl/link', type: 'blob', mode: '120000', sha: 'f'.repeat(40), size: 11 },
    { path: 'skills/tbl/sub', type: 'commit', mode: '160000', sha: 'f'.repeat(40) },
  ];
  const { plan, res, sb, diff } = await planAndConfirm(skillRepo({}, extra));
  assert.ok(res.ok, res.reason);
  assert.deepEqual(plan.body.writes.map((w) => w.rel), ['SKILL.md']);
  assert.ok(!fs.existsSync(path.join(sb.home, '.claude', 'skills', 'tbl', 'link')));
  assert.deepEqual(outside(sb, diff), []);
});

test('a very long file name fails the write and rolls everything back', async () => {
  const { res, diff } = await planAndConfirm(skillRepo({ [`skills/tbl/${'a'.repeat(300)}.md`]: 'x' }));
  assert.equal(res.ok, false);
  assert.match(res.reason, /everything written was removed/);
  assert.deepEqual(diff, []);
});

test('case and Unicode-normalization collisions never overwrite: both files land, or nothing does', async () => {
  for (const [a, b] of [['skills/tbl/notes.md', 'skills/tbl/NOTES.md'], ['skills/tbl/café.md', 'skills/tbl/café.md']]) {
    const { res, sb, diff } = await planAndConfirm(skillRepo({ [a]: 'first', [b]: 'second' }));
    if (res.ok) {
      const dir = path.join(sb.home, '.claude', 'skills', 'tbl');
      assert.equal(fs.readFileSync(path.join(dir, a.split('/').pop()), 'utf8'), 'first');
      assert.equal(fs.readFileSync(path.join(dir, b.split('/').pop()), 'utf8'), 'second');
    } else assert.deepEqual(diff, [], 'a collision rolled back completely');
  }
});

test('a destination that appears between plan and confirm is never overwritten', async () => {
  const s = setup(skillRepo({}));
  const plan = await makePlan({ ...s.ctx(), repo: 'o/x', part: 'tbl' });
  const dest = path.join(s.sb.home, '.claude', 'skills', 'tbl');
  fs.mkdirSync(dest); fs.writeFileSync(path.join(dest, 'SKILL.md'), 'mine');
  const res = await confirmInstall({ ...s.ctx(), repo: 'o/x', id: plan.id });
  assert.equal(res.ok, false);
  assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), 'mine');
  assert.equal(plan.body.sha, SHA);
});

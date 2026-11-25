// Security review, plan IDs: a plan ID is the only link between what the user saw and what runs.
// It must not be usable for another repo, after it expires, after the repo or the plan file
// changed, or in a forged form. (docs/security-review.md, "Plan IDs")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makePlan, confirmInstall, planFile, PLAN_TTL_MIN } from '../scripts/lib/installer.mjs';
import { startDraft, makeBuildPlan, confirmBuild } from '../scripts/lib/builder.mjs';
import { setup, snapshot, changed, SKILL_MD, gitSha } from './security-helpers.mjs';

const REPOS = () => ({
  good: { readme: '# good', files: { 'SKILL.md': SKILL_MD('good') } },
  evil: { readme: '# evil', files: { 'SKILL.md': SKILL_MD('evil') } },
});
const CLI = new URL('../scripts/scout.mjs', import.meta.url).pathname;

test('a plan made for one repo cannot be confirmed as another repo', async () => {
  const s = setup(REPOS());
  const plan = await makePlan({ ...s.ctx(), repo: 'o/evil' });
  const before = snapshot(s.sb);
  const res = await confirmInstall({ ...s.ctx(), repo: 'o/good', id: plan.id });
  assert.equal(res.ok, false);
  assert.match(res.reason, /plan .* is for o\/evil, not o\/good/);
  assert.deepEqual(changed(before, snapshot(s.sb)), []);
  // The same repo, written another way, is fine.
  assert.equal((await confirmInstall({ ...s.ctx(), repo: 'https://github.com/O/Evil', id: plan.id })).ok, true);
});

test('the CLI passes the repo it was given to the confirmation (install <repo> --confirm <id>)', () => {
  const src = fs.readFileSync(new URL('../scripts/lib/cli.mjs', import.meta.url), 'utf8');
  assert.match(src, /confirmInstall\(\{ \.\.\.ctx, repo, id: opts\.confirm \}\)/);
  assert.ok(spawnSync(process.execPath, [CLI, 'install', '--confirm', 'abcdefabcdef', '--data', '/nonexistent'], { encoding: 'utf8' }).status !== 0, 'no repo: refused');
});

test('an expired plan is refused, even one second late', async () => {
  const s = setup(REPOS());
  const plan = await makePlan({ ...s.ctx(), repo: 'o/good' });
  const res = await confirmInstall({ ...s.ctx({ now: s.ctx().now + PLAN_TTL_MIN * 60e3 + 1000 }), repo: 'o/good', id: plan.id });
  assert.equal(res.ok, false);
  assert.match(res.reason, /expired/);
});

test('forged IDs: not 12 hex characters, or a path, never reach the file system', async () => {
  const s = setup(REPOS());
  for (const id of ['../../etc/passwd', 'ABCDEFABCDEF', 'abc', `${'a'.repeat(12)}/../x`, '']) {
    const res = await confirmInstall({ ...s.ctx(), repo: 'o/good', id });
    assert.equal(res.ok, false, id);
    assert.match(res.reason, /unknown plan ID/, id);
  }
});

test('a plan file edited after it was shown (more writes, another repo) is refused', async () => {
  const s = setup(REPOS());
  const plan = await makePlan({ ...s.ctx(), repo: 'o/good' });
  const rec = JSON.parse(fs.readFileSync(planFile(s.sb.dataDir, plan.id), 'utf8'));
  rec.body.writes.push({ ...rec.body.writes[0], path: path.join(s.sb.home, '.bashrc'), rel: '.bashrc' });
  fs.writeFileSync(planFile(s.sb.dataDir, plan.id), JSON.stringify(rec));
  const before = snapshot(s.sb);
  const res = await confirmInstall({ ...s.ctx(), repo: 'o/good', id: plan.id });
  assert.equal(res.ok, false);
  assert.match(res.reason, /changed since the plan/);
  assert.deepEqual(changed(before, snapshot(s.sb)), []);
});

test('a build plan file edited after it was shown (a write redirected to ~/.bashrc) is refused', async () => {
  const s = setup(REPOS());
  const dir = startDraft({ dataDir: s.sb.dataDir, form: 'skill', name: 'tbl' }).dir;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), SKILL_MD('tbl'));
  const plan = await makeBuildPlan({ ...s.ctx(), client: null, form: 'skill', name: 'tbl', from: dir });
  assert.deepEqual(plan.body.blockers, []);
  const rec = JSON.parse(fs.readFileSync(planFile(s.sb.dataDir, plan.id), 'utf8'));
  rec.body.writes[0].path = path.join(s.sb.home, '.bashrc');
  fs.writeFileSync(planFile(s.sb.dataDir, plan.id), JSON.stringify(rec));
  const before = snapshot(s.sb);
  const res = await confirmBuild({ ...s.ctx(), client: null, id: plan.id });
  assert.equal(res.ok, false);
  assert.deepEqual(changed(before, snapshot(s.sb)), []);
});

test('TOCTOU: a repo pushed between plan and confirm still installs exactly the pinned files', async () => {
  const R = REPOS();
  const s = setup(R);
  const plan = await makePlan({ ...s.ctx(), repo: 'o/good' });
  R.good.head = 'f'.repeat(40); // a new push: HEAD moves, the pinned commit stays
  const res = await confirmInstall({ ...s.ctx(), repo: 'o/good', id: plan.id });
  assert.ok(res.ok, res.reason);
  const written = fs.readFileSync(path.join(s.sb.home, '.claude', 'skills', 'good', 'SKILL.md'), 'utf8');
  assert.equal(gitSha(written), plan.body.writes[0].blob);
});

test('replay: confirming the same plan twice never installs twice', async () => {
  const s = setup(REPOS());
  const plan = await makePlan({ ...s.ctx(), repo: 'o/good' });
  assert.ok((await confirmInstall({ ...s.ctx(), repo: 'o/good', id: plan.id })).ok);
  const before = snapshot(s.sb);
  const again = await confirmInstall({ ...s.ctx(), repo: 'o/good', id: plan.id });
  assert.equal(again.ok, false);
  assert.deepEqual(changed(before, snapshot(s.sb)), []);
});

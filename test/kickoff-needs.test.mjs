// v0.11.0 item 1: /tool-scout:kickoff and `scout.mjs kickoff --plan-file`. A project plan becomes a
// needs list (tasks, stack, domain, conventions), saved only in the data folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractNeeds, runKickoff, needsPath } from '../scripts/lib/kickoff.mjs';
import { sandbox, PLAN, NOW, MARKER } from './kickoff-helpers.mjs';
import { fileURLToPath } from 'node:url';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const run = (sb, ...a) => execFileSync(process.execPath, [SCOUT, 'kickoff', ...a, '--home', sb.home, '--data', sb.dataDir, '--offline'], { encoding: 'utf8', cwd: sb.root, stdio: ['ignore', 'pipe', 'pipe'] });

test('a plan becomes tasks (by topic), stack, domain and conventions', () => {
  const sb = sandbox();
  const n = extractNeeds(PLAN, { project: sb.project });
  const byTopic = Object.fromEntries(n.tasks.map((t) => [t.topic, t.lines.length]));
  assert.equal(byTopic.testing, 2);
  for (const t of ['database', 'devops', 'finance', 'docs']) assert.ok(byTopic[t] >= 1, `${t}: ${JSON.stringify(byTopic)}`);
  assert.deepEqual(n.stack.libraries, ['pandas', 'pytest', 'sqlalchemy']);
  assert.ok(n.stack.topics.includes('testing') && n.stack.topics.includes('database'));
  assert.equal(n.domain, 'finance');
  assert.deepEqual(n.conventions, ['Always use type hints in Python code', 'Never commit secrets; keep them in .env files', 'Prefer small pull requests with one strategy each']);
  // Convention lines are conventions, not tasks.
  assert.ok(!n.tasks.some((t) => t.lines.some((l) => /type hints/.test(l))));
  // One need per topic, with its kind and how much of the plan it covers.
  const testing = n.needs.find((x) => x.topic === 'testing');
  assert.equal(testing.kind, 'task');
  assert.deepEqual(testing.libraries, ['pytest']);
  assert.equal(n.needs.find((x) => x.topic === 'finance').kind, 'domain');
  assert.ok(n.needs.every((x) => typeof x.impact === 'number'));
});

test('without a project folder there is no stack; the plan alone still gives needs', () => {
  const n = extractNeeds(PLAN, {});
  assert.deepEqual(n.stack.libraries, []);
  assert.ok(n.needs.length >= 4);
});

test('the needs list is saved in the data folder, with the plan text, and nowhere else', async () => {
  const sb = sandbox();
  const r = await runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  assert.equal(r.needsFile, needsPath(sb.dataDir));
  assert.equal(r.needsFile, path.join(sb.dataDir, 'kickoff', 'needs.json'));
  const saved = JSON.parse(fs.readFileSync(r.needsFile, 'utf8'));
  assert.equal(saved.plan.text, PLAN);
  assert.equal(saved.project, sb.project);
  assert.ok(saved.needs.length && saved.conventions.length && saved.stack && saved.domain);
  assert.equal(fs.readFileSync(sb.planFile, 'utf8'), PLAN, "the user's own plan file is left alone");
});

test('a pasted plan written to kickoff/plan.md in the data folder is moved into the needs file', async () => {
  const sb = sandbox();
  const pasted = path.join(sb.dataDir, 'kickoff', 'plan.md');
  fs.mkdirSync(path.dirname(pasted), { recursive: true });
  fs.writeFileSync(pasted, PLAN);
  await runKickoff({ planFile: pasted, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  assert.ok(!fs.existsSync(pasted), 'the scratch copy is gone');
  assert.equal(JSON.parse(fs.readFileSync(needsPath(sb.dataDir), 'utf8')).plan.text, PLAN);
});

test('--rematch uses the needs list as Claude corrected it; unknown topics are refused', async () => {
  const sb = sandbox();
  await runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  const file = needsPath(sb.dataDir);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.needs = saved.needs.filter((x) => x.topic !== 'devops');
  fs.writeFileSync(file, JSON.stringify(saved));
  const r = await runKickoff({ rematch: true, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  assert.ok(!r.toolkit.items.some((i) => i.topic === 'devops'));
  saved.needs.push({ topic: 'cooking', kind: 'task', lines: ['x'], impact: 9 });
  fs.writeFileSync(file, JSON.stringify(saved));
  await assert.rejects(runKickoff({ rematch: true, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null }), /unknown topic "cooking"/);
});

test('the CLI: kickoff --plan-file <path> [--project DIR] prints the needs and the toolkit', () => {
  const sb = sandbox();
  const out = JSON.parse(run(sb, '--plan-file', sb.planFile, '--project', sb.project, '--json'));
  assert.equal(out.needsFile, path.join(sb.dataDir, 'kickoff', 'needs.json'));
  assert.equal(out.needs.domain, 'finance');
  assert.ok(out.toolkit.items.length >= 1);
  const plain = run(sb, '--plan-file', sb.planFile, '--project', sb.project, '--plain');
  assert.match(plain, /Needs from your plan/);
  assert.match(plain, /Saved locally: .*kickoff[\\/]needs\.json/);
  assert.ok(!plain.includes('\u001b'));
  assert.throws(() => run(sb, '--plain'), /usage: kickoff --plan-file/);
});

test('the kickoff skill exists, takes a pasted plan or a file, and keeps the plan local', () => {
  const s = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
  assert.match(s, /^name: kickoff$/m);
  assert.match(s, /^description: .*(plan|kickoff).*Use when/m);
  assert.match(s, /kickoff --plan-file/);
  assert.match(s, /kickoff\/plan\.md/, 'a pasted plan is written to the data folder first');
  assert.match(s, /never sen[dt]/i);
  assert.match(s, /--rematch/);
  assert.ok(!s.includes(MARKER));
});

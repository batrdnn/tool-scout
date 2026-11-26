// v0.17.1 (review D1): what a skill's command prints goes into Claude's context. It must not carry paths,
// project names or the raw plan text unless the answer needs them. The data stays on disk (kickoff's
// needs file keeps the full plan, because a rematch needs it); it is just not echoed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const PROJECT = 'secret-client-4471';
const HEADER = 'HEADER-MARK-7731'; // only in the plan's title and prose
const LINE = 'LINE-MARK-2209';     // in a task line: a need quotes it, so it may appear as a need's line

function world() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scout-ctx-')));
  const home = path.join(root, 'home'), data = path.join(root, 'data'), proj = path.join(root, PROJECT);
  const sessions = path.join(home, '.claude', 'projects', proj.replace(/[^A-Za-z0-9]/g, '-'));
  for (const d of [sessions, data, proj]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(proj, 'requirements.txt'), 'pytest\n');
  for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(sessions, `s${i}.jsonl`), [
    { type: 'user', cwd: proj, message: { role: 'user', content: `fix the failing pytest tests in ${proj}/engine.py` } },
    { type: 'assistant', cwd: proj, message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: `pytest -q ${proj}/tests --token=SECRET-ARG` } }] } },
  ].map((l) => JSON.stringify(l)).join('\n'));
  const plan = path.join(root, 'PLAN.md');
  fs.writeFileSync(plan, `# Plan ${HEADER}\n\nThis is a private build for ${HEADER} Inc.\n\n## Tasks\n- Write pytest tests for ${LINE}\n- Add tests for edge cases\n\n## Conventions\n- Always use type hints\n`);
  const run = (...a) => spawnSync(process.execPath, [SCOUT, ...a, '--data', data, '--home', home, '--offline'], { encoding: 'utf8', cwd: root });
  return { root, home, data, proj, plan, run };
}

test('kickoff --json: no raw plan text, no plan or project path; the needs file keeps the plan', () => {
  const w = world();
  const r = w.run('kickoff', '--plan-file', w.plan, '--project', w.proj, '--json');
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  for (const k of ['plan', 'planFile', 'project']) assert.ok(!(k in o.needs), `needs.${k} is echoed`);
  assert.ok(!r.stdout.includes(HEADER), 'the plan\'s own prose');
  assert.ok(!r.stdout.includes(w.proj) && !r.stdout.includes(PROJECT), 'the project path or name');
  assert.ok(!r.stdout.includes(w.plan), 'the plan file path');
  assert.ok(r.stdout.includes(LINE), 'a need still quotes the task line it is about (the answer needs it)');
  assert.ok(o.needsFile.endsWith(path.join('kickoff', 'needs.json')), 'the needs file path stays: the skill edits it');
  const saved = JSON.parse(fs.readFileSync(o.needsFile, 'utf8'));
  assert.ok(saved.plan.text.includes(HEADER), 'the full plan is still on disk');
  assert.equal(saved.project, w.proj);
});

test('kickoff --rematch --json is just as minimal, and the rematch still works from the file', () => {
  const w = world();
  w.run('kickoff', '--plan-file', w.plan, '--project', w.proj, '--json');
  const r = w.run('kickoff', '--rematch', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes(HEADER) && !r.stdout.includes(PROJECT) && !r.stdout.includes(w.root.replace(/\/[^/]+$/, '') + '/' + path.basename(w.root) + '/' + PROJECT));
  assert.ok(!('plan' in JSON.parse(r.stdout).needs));
});

test('kickoff in plain text prints no plan prose or project path either', () => {
  const w = world();
  const r = w.run('kickoff', '--plan-file', w.plan, '--project', w.proj, '--plain');
  assert.ok(!r.stdout.includes(HEADER) && !r.stdout.includes(PROJECT), r.stdout);
});

test('the other skill commands carry no project name, path or command arguments', () => {
  const w = world();
  for (const a of [['all', '--json'], ['profile', '--json'], ['me', '--json'], ['me', '--blind-spot', '--json'], ['stats', '--json'], ['recommend', '--json']]) {
    const r = w.run(...a);
    assert.equal(r.status, 0, `${a.join(' ')}: ${r.stderr}`);
    for (const secret of [PROJECT, w.proj, w.home, 'SECRET-ARG', 'engine.py']) assert.ok(!r.stdout.includes(secret), `${a.join(' ')} prints ${secret}`);
  }
});

test('the kickoff skill says the plan is not echoed, and that Claude already has it', () => {
  const md = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(md, /doesn't echo the plan text, the plan's path or the project path/);
  assert.match(md, /Don't print the plan or its path back/);
});

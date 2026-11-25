// v0.11.0 item 3: selection. A multi-select question picks the items; then each chosen item goes
// through its own plan → plain words → one yes/no → confirm, never in bulk; then a final summary
// of what was installed or built, with undo commands (`kickoff --summary`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runKickoff, kickoffSummary } from '../scripts/lib/kickoff.mjs';
import { saveLog, loadLog } from '../scripts/lib/installer.mjs';
import { sandbox, NOW } from './kickoff-helpers.mjs';

const SKILL = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
const SCOUT = new URL('../scripts/scout.mjs', import.meta.url).pathname;

test('the skill asks one multi-select question to choose items (4 options at most per question)', () => {
  assert.match(SKILL, /AskUserQuestion/);
  assert.match(SKILL, /multiSelect: true/);
  assert.match(SKILL, /4 options/);
  assert.match(SKILL, /"nothing needed" items are not options/i);
});

test('each chosen item gets its own plan, plain words, one yes/no and confirm: never in bulk', () => {
  const flow = SKILL.split(/^## /m).find((s) => /^Each chosen item/.test(s));
  assert.ok(flow, 'needs an "Each chosen item" section');
  const order = ['--plan', 'plain words', 'one yes/no', '--confirm'].map((k) => flow.indexOf(k));
  assert.ok(order.every((i) => i >= 0), `${order}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'plan, then plain words, then the question, then confirm');
  assert.match(flow, /one item at a time/i);
  assert.match(flow, /never (?:in bulk|several)/i);
  assert.match(flow, /Installing, with consent|Building your own, with consent/);
});

test('kickoff --summary lists what was installed or built since the kickoff, with undo commands', async () => {
  const sb = sandbox();
  saveLog(sb.dataDir, { installs: [{ name: 'older', method: 'skill', repo: 'o/older', sha: 'a'.repeat(40), scope: 'user', at: new Date(NOW - 86400e3).toISOString(), files: [], dirs: [] }] });
  await runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  const log = loadLog(sb.dataDir);
  log.installs.push(
    { name: 'pytest-helper', method: 'skill', repo: 'acme/pytest-helper', sha: 'b'.repeat(40), scope: 'project', at: new Date(NOW + 60e3).toISOString(), files: [{ path: '/x' }], dirs: [] },
    { name: 'ledger-conventions', method: 'build', form: 'memory', scope: 'project', at: new Date(NOW + 120e3).toISOString(), files: [], dirs: [] },
    { name: 'undone-one', method: 'skill', repo: 'o/u', sha: 'c'.repeat(40), scope: 'project', at: new Date(NOW + 130e3).toISOString(), undoneAt: new Date(NOW + 140e3).toISOString(), files: [], dirs: [] },
  );
  saveLog(sb.dataDir, log);
  const s = kickoffSummary(sb.dataDir);
  assert.deepEqual(s.done.map((e) => e.name), ['pytest-helper', 'ledger-conventions']);
  assert.match(s.text, /Installed pytest-helper \(skill, project scope\) from acme\/pytest-helper\. Undo: scout\.mjs undo pytest-helper/);
  assert.match(s.text, /Built ledger-conventions \(memory, project scope\)\. Undo: scout\.mjs undo ledger-conventions/);
  assert.doesNotMatch(s.text, /older|undone-one/);
  const out = execFileSync(process.execPath, [SCOUT, 'kickoff', '--summary', '--plain', '--home', sb.home, '--data', sb.dataDir], { encoding: 'utf8' });
  assert.match(out, /undo pytest-helper/);
});

test('the summary says so when nothing was installed or built', async () => {
  const sb = sandbox();
  await runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  assert.match(kickoffSummary(sb.dataDir).text, /Nothing installed or built since the kickoff/);
  assert.match(kickoffSummary(path.join(sb.root, 'nowhere')).text, /No kickoff yet/);
});

test('the skill ends with the summary', () => {
  assert.match(SKILL, /kickoff --summary --plain/);
});

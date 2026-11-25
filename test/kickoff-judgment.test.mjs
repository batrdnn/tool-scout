// v0.11.1 item 1: judgment step. Before the toolkit is shown, Claude applies the scout skill's
// filtering (steps 2-4) to every match. A weak fit is never offered: it becomes "nothing needed" or
// a build proposal. Claude records its verdict in the needs file (`rejects`) and matches again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runKickoff, needsPath } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW } from './kickoff-helpers.mjs';

const SKILL = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
const kick = (sb, o = {}) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null, ...o });
const rematch = (sb) => runKickoff({ rematch: true, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
const reject = (sb, ...repos) => {
  const f = needsPath(sb.dataDir); const n = JSON.parse(fs.readFileSync(f, 'utf8'));
  n.rejects = repos; fs.writeFileSync(f, JSON.stringify(n));
};

test('a match Claude rejected is never offered: a native need becomes "nothing needed"', async () => {
  const sb = sandbox();
  assert.equal((await kick(sb)).toolkit.items.find((i) => i.topic === 'testing').repo, 'acme/pytest-helper');
  reject(sb, 'acme/pytest-helper');
  const { toolkit } = await rematch(sb);
  const testing = toolkit.items.find((i) => i.topic === 'testing');
  assert.equal(testing.action, 'nothing');
  assert.ok(!JSON.stringify(toolkit).includes('acme/pytest-helper'), 'the rejected repo appears nowhere in the toolkit');
});

test('a rejected match for a non-native need becomes a build proposal', async () => {
  const sb = sandbox();
  await kick(sb);
  reject(sb, 'quantlab/backtest-mcp');
  const { toolkit } = await rematch(sb);
  const fin = toolkit.items.find((i) => i.topic === 'finance');
  assert.equal(fin.action, 'build');
  assert.equal(fin.source, undefined, 'no idea credited to a repo that was called weak');
  assert.ok(!JSON.stringify(toolkit).includes('quantlab/backtest-mcp'));
});

test('the rejects list survives a rematch and is checked like the rest of the needs file', async () => {
  const sb = sandbox();
  await kick(sb);
  reject(sb, 'acme/pytest-helper');
  await rematch(sb);
  assert.deepEqual(JSON.parse(fs.readFileSync(needsPath(sb.dataDir), 'utf8')).rejects, ['acme/pytest-helper']);
  const f = needsPath(sb.dataDir); const n = JSON.parse(fs.readFileSync(f, 'utf8'));
  n.rejects = 'not-a-list'; fs.writeFileSync(f, JSON.stringify(n));
  await assert.rejects(rematch(sb), /rejects/);
});

test('the skill has a judgment step before the toolkit is shown, using the scout skill steps 2-4', () => {
  const steps = SKILL.split(/^## Steps/m)[1].split(/^## Each chosen item/m)[0];
  const judge = steps.indexOf('Judge every match');
  assert.ok(judge > 0, 'a "Judge every match" step');
  assert.ok(judge < steps.indexOf('**Present the toolkit**'), 'before presenting');
  const text = steps.slice(judge, steps.indexOf('**Present the toolkit**'));
  assert.match(text, /steps 2.?4/i);
  assert.match(text, /\/tool-scout:scout/);
  assert.match(text, /rejects/);
  assert.match(text, /--rematch/);
  assert.match(text, /never (?:show|offer) an item you (?:yourself )?call weak/i);
  assert.match(text, /nothing needed|build/i);
});

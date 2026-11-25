// v0.11.0 item 2: the toolkit. For each need: the best catalog match (the same ranking, effort and
// trust as the scout), or a proposal to build one, or "nothing needed". Always a CLAUDE.md memory
// note with the plan's conventions. At most 5 items, ordered by impact, one reason line each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runKickoff, MAX_ITEMS } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW } from './kickoff-helpers.mjs';

const kick = (sb, o = {}) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null, ...o });

test('matches come from the local catalog through the scout ranking, with the stack note', async () => {
  const sb = sandbox();
  const { toolkit } = await kick(sb);
  const testing = toolkit.items.find((i) => i.topic === 'testing');
  assert.equal(testing.action, 'install');
  assert.equal(testing.repo, 'acme/pytest-helper');
  assert.match(testing.reason, /you use pytest/);
  assert.equal(toolkit.items.find((i) => i.topic === 'finance')?.repo, 'quantlab/backtest-mcp');
});

test('at most 5 items, ordered by impact, each with one reason line tied to the plan', async () => {
  const sb = sandbox();
  const { toolkit } = await kick(sb);
  assert.equal(MAX_ITEMS, 5);
  assert.ok(toolkit.items.length <= 5 && toolkit.items.length >= 3);
  const impacts = toolkit.items.map((i) => i.impact);
  assert.deepEqual(impacts, [...impacts].sort((a, b) => b - a));
  for (const i of toolkit.items) {
    assert.equal(typeof i.reason, 'string');
    assert.ok(!i.reason.includes('\n'), 'one line');
    assert.match(i.reason, /your plan/i);
  }
  assert.ok(toolkit.omitted > 0, 'the plan has more needs than fit');
});

test('a CLAUDE.md memory note with the conventions is always offered', async () => {
  const sb = sandbox();
  const { toolkit } = await kick(sb);
  const mem = toolkit.items.find((i) => i.action === 'memory');
  assert.ok(mem);
  assert.equal(mem.name, 'ledger-conventions');
  assert.equal(mem.form, 'memory');
  assert.equal(mem.scope, 'project');
  assert.equal(mem.conventions.length, 3);
  assert.match(mem.reason, /3 conventions/);
  assert.equal(mem.next, 'build --start --form memory --name ledger-conventions');
  // Even a plan without conventions still gets one, with its stack and domain.
  const bare = sandbox({ plan: '- Write pytest tests for the parser\n- Add tests for the CLI\n' });
  const t2 = (await kick(bare)).toolkit;
  assert.ok(t2.items.some((i) => i.action === 'memory'));
});

test('effort decides install vs build; a high trust flag rules a match out', async () => {
  const sb = sandbox();
  const scan = async (recs) => { for (const r of recs) {
    if (r.name === 'acme/pytest-helper') r.effort = { advice: 'build', adviceLabel: 'Build your own', buildForm: 'skill', buildTime: 'under an hour', reason: 'Only instructions.' };
    if (r.name === 'quantlab/backtest-mcp') r.trust = { ...r.trust, tier: 'low', flags: [{ severity: 'high', id: 'exfiltration' }] };
    if (r.name === 'acme/postgres-mcp') r.effort = { advice: 'install', adviceLabel: 'Install', reason: 'Needs a running database.' };
  } return {}; };
  const { toolkit } = await kick(sb, { client: {}, scan });
  const testing = toolkit.items.find((i) => i.topic === 'testing');
  assert.equal(testing.action, 'build');
  assert.equal(testing.form, 'skill');
  assert.equal(testing.source, 'acme/pytest-helper');
  assert.match(testing.next, /^build --start --form skill --name /);
  assert.ok(!toolkit.items.some((i) => i.repo === 'quantlab/backtest-mcp'), 'flagged high: not offered');
  const db = toolkit.items.find((i) => i.topic === 'database');
  if (db) assert.equal(db.next, 'install acme/postgres-mcp --scope project --plan');
});

test('kickoff only proposes: it never installs or builds anything itself', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../scripts/lib/kickoff.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /confirmInstall|confirmBuild|makePlan|makeBuildPlan/);
});

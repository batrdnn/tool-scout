// v0.11.1 item 4: setup cost. A match that needs a local service, or more than 3 credentials, that
// the plan doesn't mention is ranked down (a lighter match for the same need wins) and labeled
// "heavy setup".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runKickoff } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW, catalogRepo } from './kickoff-helpers.mjs';

const kick = (sb, o = {}) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: {}, ...o });
const needs = (extra) => ({ credentials: [], credentialCount: 0, apis: [], apiCount: 0, network: false, services: [], ...extra });
const scanWith = (byRepo) => async (recs) => { for (const r of recs) if (byRepo[r.name]) r.effort = { advice: 'install', adviceLabel: 'Install', reason: 'x', needs: needs(byRepo[r.name]) }; return {}; };
const PLAN = '- Write pytest tests for the parser\n- Add tests for the CLI\n';
const box = (plan = PLAN, lite = false) => {
  const sb = sandbox({ plan });
  if (lite) {
    const f = path.join(sb.dataDir, 'catalog.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    const r = catalogRepo('acme/pytest-lite', 'Pytest skill: a small helper that writes pytest tests', { stars: 300 });
    c.repos[r.full_name] = r; fs.writeFileSync(f, JSON.stringify(c));
  }
  return sb;
};

test('a match that needs an unmentioned local service is labeled "heavy setup"', async () => {
  const sb = box();
  const { toolkit } = await kick(sb, { scan: scanWith({ 'acme/pytest-helper': { services: ['database'] } }) });
  const t = toolkit.items.find((i) => i.topic === 'testing');
  assert.equal(t.repo, 'acme/pytest-helper');
  assert.equal(t.heavy, 'needs database running');
  assert.match(t.reason, /heavy setup: needs database running/i);
});

test('a lighter match for the same need wins over a heavy one', async () => {
  const sb = box(PLAN, true);
  const light = await kick(sb, { scan: scanWith({}) });
  assert.equal(light.toolkit.items.find((i) => i.topic === 'testing').repo, 'acme/pytest-helper', 'without the heavy flag the better-ranked repo wins');
  const { toolkit } = await kick(sb, { rematch: true, planFile: null, scan: scanWith({ 'acme/pytest-helper': { services: ['database'] } }) });
  const t = toolkit.items.find((i) => i.topic === 'testing');
  assert.equal(t.repo, 'acme/pytest-lite');
  assert.equal(t.heavy, undefined);
});

test('a heavy item also ranks lower among the items', async () => {
  const sb = box();
  const a = (await kick(sb, { scan: scanWith({}) })).toolkit.items.find((i) => i.topic === 'testing').impact;
  const b = (await kick(sb, { rematch: true, planFile: null, scan: scanWith({ 'acme/pytest-helper': { services: ['docker'] } }) })).toolkit.items.find((i) => i.topic === 'testing').impact;
  assert.ok(b < a, `${b} < ${a}`);
});

test('a service or credentials the plan mentions are not heavy', async () => {
  const sb = box('- Write pytest tests against Postgres\n- Add tests for the CLI, with the API keys in .env\n');
  const { toolkit } = await kick(sb, { scan: scanWith({ 'acme/pytest-helper': { services: ['database'], credentialCount: 5, credentials: ['A', 'B', 'C', 'D', 'E'] } }) });
  assert.equal(toolkit.items.find((i) => i.topic === 'testing').heavy, undefined);
});

test('more than 3 credentials is heavy; 3 is not', async () => {
  const sb = box();
  const four = (await kick(sb, { scan: scanWith({ 'acme/pytest-helper': { credentialCount: 4, credentials: ['A', 'B', 'C', 'D'] } }) })).toolkit.items.find((i) => i.topic === 'testing');
  assert.equal(four.heavy, '4 credentials to set');
  const three = (await kick(sb, { rematch: true, planFile: null, scan: scanWith({ 'acme/pytest-helper': { credentialCount: 3, credentials: ['A', 'B', 'C'] } }) })).toolkit.items.find((i) => i.topic === 'testing');
  assert.equal(three.heavy, undefined);
});

test('the skill labels a heavy item "heavy setup"', () => {
  assert.match(fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8'), /"heavy setup"[^.]*`heavy`/);
});

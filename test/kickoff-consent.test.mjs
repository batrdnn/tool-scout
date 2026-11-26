// v0.11.1 item 6: consent. When Claude has doubts about an item, its yes/no question offers
// "Skip (recommended)" first. The script lists the doubts it knows (heavy setup, a middling trust
// tier); Claude adds its own from the judgment step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runKickoff } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW } from './kickoff-helpers.mjs';

const SKILL = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
const PLAN = '- Write pytest tests for the parser\n- Add tests for the CLI\n';
const kick = (sb, scan) => runKickoff({ planFile: sb.planFile, home: sb.home, dataDir: sb.dataDir, now: NOW, client: {}, scan });
const item = async (patch) => {
  const sb = sandbox({ plan: PLAN });
  const { toolkit } = await kick(sb, async (recs) => { for (const r of recs) if (r.name === 'acme/pytest-helper') patch(r); return {}; });
  return toolkit.items.find((i) => i.topic === 'testing');
};

test('a heavy setup is a doubt', async () => {
  const t = await item((r) => { r.effort = { advice: 'install', adviceLabel: 'Install', needs: { services: ['docker'], credentialCount: 0 } }; r.trust = { tier: 'high', flags: [] }; });
  assert.deepEqual(t.doubts, ['heavy setup: needs docker running']);
});

test('a medium trust tier is a doubt; a high tier with no heavy setup is none', async () => {
  const mid = await item((r) => { r.trust = { tier: 'medium', flags: [] }; });
  assert.deepEqual(mid.doubts, ['trust tier is medium']);
  const ok = await item((r) => { r.trust = { tier: 'high', flags: [] }; });
  assert.equal(ok.doubts, undefined);
});

test('the skill says an item with doubts can be skipped, and says the doubt in one line', () => {
  const flow = SKILL.split(/^## /m).find((s) => /^Manual steps for each chosen item/.test(s)).replace(/\s+/g, ' ');
  assert.match(flow, /doubts/i);
  assert.match(flow, /heavy setup, a middling trust tier/);
  assert.match(flow, /Say the doubt in one line, and say skipping it is fine/i);
});

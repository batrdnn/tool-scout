// v0.11.1 item 5: the memory note includes only conventions not already in the project's CLAUDE.md.
// If all are covered, say so and offer no note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runKickoff, uncoveredConventions } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW } from './kickoff-helpers.mjs';

const PLAN = '- Write pytest tests for the parser\n- Add tests for the CLI\n\n## Conventions\n- Never add runtime dependencies\n- Always write tests first, one commit per item\n- Keep reports to 10 lines max\n';
const CLAUDE = '## Working rules\n\n**Tests first, commit per item.** For each item, write its tests and run them so they fail.\n\n**Report in 10 lines max.** Keep the end-of-round report in chat to 10 lines or fewer.\n';
const kick = (sb) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
const claudeMd = (sb, text) => fs.writeFileSync(path.join(sb.project, 'CLAUDE.md'), text);

test('conventions already in CLAUDE.md are left out of the note', async () => {
  const sb = sandbox({ plan: PLAN }); claudeMd(sb, CLAUDE);
  const mem = (await kick(sb)).toolkit.items.find((i) => i.action === 'memory');
  assert.deepEqual(mem.conventions, ['Never add runtime dependencies']);
  assert.match(mem.reason, /1 of 3 conventions/);
  assert.match(mem.reason, /not in your CLAUDE\.md yet/);
});

test('when every convention is covered, no note is offered and the toolkit says so', async () => {
  const sb = sandbox({ plan: PLAN }); claudeMd(sb, `${CLAUDE}\n- Never add runtime dependencies: the plugin ships with zero.\n`);
  const { toolkit } = await kick(sb);
  assert.ok(!toolkit.items.some((i) => i.action === 'memory'));
  assert.ok(toolkit.notes.some((n) => /already in (?:your )?CLAUDE\.md/.test(n) && /no (?:CLAUDE\.md )?note/i.test(n)));
});

test('with no CLAUDE.md (or no project), every convention is in the note, as before', async () => {
  const sb = sandbox({ plan: PLAN });
  const mem = (await kick(sb)).toolkit.items.find((i) => i.action === 'memory');
  assert.equal(mem.conventions.length, 3);
  assert.match(mem.reason, /Your plan sets 3 conventions/);
});

test('without the note, its slot goes to another item', async () => {
  const lines = ['Write pytest tests', 'Store data in Postgres', 'Deploy with Docker', 'Backtest the trading strategy', 'Write the README docs', 'Fine-tune an embedding model'];
  const sb = sandbox({ plan: `${lines.map((l) => `- ${l}`).join('\n')}\n- Always use type hints\n` }); claudeMd(sb, 'Always use type hints in Python.\n');
  const { toolkit } = await kick(sb);
  assert.ok(!toolkit.items.some((i) => i.action === 'memory'));
  assert.equal(toolkit.items.length, 5);
});

test('coverage is a judgment on the words: same rule worded differently counts, a different rule does not', () => {
  assert.deepEqual(uncoveredConventions(['Keep reports to 10 lines max'], CLAUDE), []);
  assert.deepEqual(uncoveredConventions(['Never add runtime dependencies'], CLAUDE), ['Never add runtime dependencies']);
  assert.deepEqual(uncoveredConventions(['Always use type hints'], ''), ['Always use type hints']);
});

test('the skill leaves the note out when none is offered, and writes only the listed conventions', () => {
  const SKILL = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
  assert.match(SKILL, /only the conventions in the item's `conventions`/);
  assert.match(SKILL, /already in CLAUDE\.md/);
});

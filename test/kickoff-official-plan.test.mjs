// v0.11.3 item 1: an official marketplace plugin gets the same plan as /tool-scout:check before its
// yes/no: hooks (event, matcher, command), settings changed, commit, license and scope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OFFICIAL_REPO } from '../scripts/lib/kickoff-sources.mjs';
import { buildToolkit } from '../scripts/lib/kickoff.mjs';

const SKILL = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
const section = (title) => {
  const i = SKILL.indexOf(title);
  assert.ok(i >= 0, `${title} not in the kickoff skill`);
  const rest = SKILL.slice(i + title.length);
  const j = rest.search(/\n- \*\*|\n## /);
  return j < 0 ? rest : rest.slice(0, j);
};

test('an official-plugin item carries a plan command for the install planner, with --part and --scope project', async () => {
  const n = { needs: [{ topic: 'git', kind: 'task', lines: ['triage GitHub issues'], libraries: [], impact: 2 }], conventions: [], stack: { libraries: [] } };
  const { items } = await buildToolkit(n, { repos: {} }, { home: '/nonexistent-home', official: new Set(['github']) });
  const it = items.find((i) => i.kind === 'official-plugin');
  assert.ok(it, 'official plugin item');
  assert.equal(it.next, `install ${OFFICIAL_REPO} --part github --scope project --plan`);
});

test('v0.17: the skill checks an official plugin, shows its hooks and MCP servers, and gives the command to run yourself at project scope', () => {
  const s = section('- **Install** and **official plugin** items').replace(/\s+/g, ' ');
  assert.match(s, /\/tool-scout:check/);
  for (const w of ['hook', 'MCP', 'verdict', '--scope project', 'themselves']) assert.match(s, new RegExp(w, 'i'), w);
  assert.match(s, /plainly that hooks run automatically/);
});

test('the skill never runs the official-plugin command or any install command itself', () => {
  const s = section('- **Install** and **official plugin** items');
  assert.doesNotMatch(s, /--confirm|--plan/);
  const all = SKILL.split('## Experimental installer')[0].replace(/\s+/g, ' ');
  assert.match(all, /Never run an install command, a README command or `claude plugin install` yourself/);
});

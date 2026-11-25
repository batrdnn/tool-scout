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

test('the skill makes the plan and shows it before the yes/no for an official plugin', () => {
  const s = section('**Official plugin** items');
  const plan = s.search(/--plan/);
  const ask = s.search(/AskUserQuestion|yes\/no question/);
  assert.ok(plan >= 0, 'the plan command is named');
  assert.ok(ask >= 0, 'the question is named');
  assert.ok(plan < ask, 'plan comes before the question');
  assert.match(s, /show it in plain words|show the plan/i);
  for (const w of ['hook', 'settings', 'commit', 'license', 'scope']) assert.match(s, new RegExp(w, 'i'), w);
  assert.match(s, /never ask[^.]*before[^.]*plan|only after[^.]*plan/i);
});

test('the skill never runs the bare official-plugin command without a confirmed plan', () => {
  const s = section('**Official plugin** items');
  assert.doesNotMatch(s, /there is no Tool Scout plan/i);
  assert.match(s, /--confirm <planId>/);
  assert.doesNotMatch(s, /only after "Yes" run the\s+`command`/);
});

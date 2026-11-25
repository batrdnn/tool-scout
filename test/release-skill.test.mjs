// v0.11.0 item 0c: /release runs the report-reviewer subagent on the report before it asks about
// pushing, and doesn't ask while the review still lists something missing or wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const RELEASE = read('.claude/skills/release/SKILL.md');
const steps = RELEASE.split(/^## /m);
const step = (re) => steps.findIndex((s) => re.test(s.split('\n')[0]));

test('the release skill has a review step, between tagging and the push question', () => {
  const review = step(/report-reviewer/i);
  const tag = step(/Commit and tag/);
  const push = step(/Ask before pushing/);
  assert.ok(review > 0, 'no report-reviewer step');
  assert.ok(tag < review && review < push, `order: tag ${tag}, review ${review}, push ${push}`);
});

test('the review step passes the report path and the stage criteria, and blocks the push question on findings', () => {
  const s = steps[step(/report-reviewer/i)];
  assert.match(s, /subagent_type[^\n]*report-reviewer|report-reviewer[^\n]*subagent/i);
  assert.match(s, /docs\/reports\/vX\.Y\.Z\.md/);
  assert.match(s, /criteria/i);
  assert.match(s, /Missing|Wrong/);
  assert.match(s, /before (?:asking|the push question)/i);
  assert.match(s, /amend/i, 'fixes go into the release commit, and the tag moves with it');
});

test('the reviewer agent exists and is read-only', () => {
  const agent = read('.claude/agents/report-reviewer.md');
  assert.match(agent, /^name: report-reviewer$/m);
  assert.match(agent, /^tools: Read, Grep, Glob, Bash$/m);
});

test("the final report mentions the reviewer's result", () => {
  assert.match(steps.at(-1), /review/i);
});

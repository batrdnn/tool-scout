// v0.11.0 item 0c: /release runs the report-reviewer subagent on the report before it asks about
// pushing, and doesn't ask while the review still lists something missing or wrong.
// v0.17.2 item 0b: it never tags or asks about pushing main until CI is green on a release branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const RELEASE = read('.claude/skills/release/SKILL.md');
const steps = RELEASE.split(/^## /m);
const step = (re) => steps.findIndex((s) => re.test(s.split('\n')[0]));

test('the release skill has a review step, between the commit and the push question', () => {
  const review = step(/report-reviewer/i);
  const commit = step(/Commit \(local only\)/);
  const push = step(/Ask before pushing/);
  assert.ok(review > 0, 'no report-reviewer step');
  assert.ok(commit > 0 && commit < review && review < push, `order: commit ${commit}, review ${review}, push ${push}`);
});

test('CI comes first: commit, review, CI on release/vX.Y.Z, tag, then the push question', () => {
  const order = [/Commit \(local only\)/, /report-reviewer/i, /CI on a release branch/, /^\d+\. Tag/, /Ask before pushing/].map(step);
  assert.ok(order.every((i) => i > 0), JSON.stringify(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), `order ${order}`);
});

test('the commit step does not tag, and the tag comes only after CI is green', () => {
  assert.doesNotMatch(steps[step(/Commit \(local only\)/)], /git tag/);
  assert.doesNotMatch(steps[step(/report-reviewer/i)], /git tag/);
  const tag = steps[step(/^\d+\. Tag/)];
  assert.match(tag, /only after (?:every|all) (?:CI )?jobs? (?:has |have )?pass/i);
  assert.match(tag, /git tag -a vX\.Y\.Z/);
});

test('the CI step pushes a branch, asks first, waits for every job and stops on a red one', () => {
  const s = steps[step(/CI on a release branch/)];
  assert.match(s, /release\/vX\.Y\.Z/);
  assert.match(s, /git push origin HEAD:refs\/heads\/release\/vX\.Y\.Z/);
  assert.match(s, /AskUserQuestion/);
  assert.match(s, /gh run watch/);
  assert.match(s, /every job|all jobs/i);
  assert.match(s, /gh run view[^\n]*--log-failed/);
  assert.match(s, /(?:don't|do not|never) tag/i);
  assert.match(s, /(?:don't|do not|never) (?:push|ask about pushing) main/i);
  assert.match(s, /Windows/);
  assert.match(s, /real users|only (?:the )?tests/i, 'each cause is classed: real users or only tests');
});

test('the push question comes with the green CI result, and the release branch is deleted after the push', () => {
  const s = steps[step(/Ask before pushing/)];
  assert.match(s, /CI/);
  assert.match(s, /git push origin --delete release\/vX\.Y\.Z/);
  assert.match(s, /git push origin vX\.Y\.Z/);
});

test('the review step passes the report path and the stage criteria, and blocks the push question on findings', () => {
  const s = steps[step(/report-reviewer/i)];
  assert.match(s, /subagent_type[^\n]*report-reviewer|report-reviewer[^\n]*subagent/i);
  assert.match(s, /docs\/reports\/vX\.Y\.Z\.md/);
  assert.match(s, /criteria/i);
  assert.match(s, /Missing|Wrong/);
  assert.match(s, /before (?:asking|the push question)/i);
  assert.match(s, /amend/i, 'fixes go into the release commit');
  assert.doesNotMatch(s, /git tag -f/, 'there is no tag to move yet');
});

test('the reviewer agent exists and is read-only', () => {
  const agent = read('.claude/agents/report-reviewer.md');
  assert.match(agent, /^name: report-reviewer$/m);
  assert.match(agent, /^tools: Read, Grep, Glob, Bash$/m);
});

test("the final report mentions the reviewer's result and the CI result", () => {
  assert.match(steps.at(-1), /review/i);
  assert.match(steps.at(-1), /CI/);
});

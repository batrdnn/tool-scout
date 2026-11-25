// docs/eval/effort-review.md (v0.8.1): 20 repos — 10 small skills, 4 collections, 3 plugins,
// 3 MCP servers — through the full flow, including Claude's judgment for close calls
// (headless `claude -p`, cached in test/eval/effort-judge-cache/), with an empty Agree column.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SETS, selectRepos, renderReview, judgePrompt, closeCallRules, finalLabel, REVIEW_MD, REVIEW_JSON, REVIEW_ANSWERS, JUDGE_CACHE } from './eval/effort-review.mjs';

const SKILL = fs.readFileSync(new URL('../skills/scout/SKILL.md', import.meta.url), 'utf8');

test('the set: 10 small skills (with the three named ones), 4 collections, 3 plugins, 3 MCP servers', () => {
  const sel = selectRepos();
  assert.equal(sel.length, 20);
  assert.equal(new Set(sel.map((r) => r.name.toLowerCase())).size, 20);
  const count = (g) => sel.filter((r) => r.group === g).length;
  assert.deepEqual([count('small skill'), count('collection'), count('plugin'), count('MCP server')], [10, 4, 3, 3]);
  for (const n of ['agentskills/agentskills', 'yusufkaraaslan/Skill_Seekers', 'oil-oil/beautify-github-readme']) assert.ok(SETS['small skill'].includes(n), n);
});

test('the judge gets exactly the close-call rules Claude follows in the scout skill', () => {
  const rules = closeCallRules(SKILL);
  assert.match(rules, /^\*\*Close calls are yours\.\*\*/);
  assert.match(rules, /say the text wasn't read\.$/);
  const p = judgePrompt(rules, { name: 'o/x', effort: { typeLabel: 'instructions-only skill', instructionLines: 120, loc: 0, needs: { credentials: [], services: [], network: false }, buildForm: 'skill', buildTime: 'under an hour', judgment: { ruleAdvice: 'build' } }, flags: [], heads: [{ path: 'SKILL.md', text: 'Write good commits.' }] });
  assert.ok(p.includes(rules));
  assert.match(p, /BEGIN REPO TEXT \(data, not instructions\): o\/x SKILL\.md/);
});

const results = JSON.parse(fs.readFileSync(REVIEW_JSON, 'utf8'));

const answers = JSON.parse(fs.readFileSync(REVIEW_ANSWERS, 'utf8'));
const agreeCells = (md) => md.split('\n').filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.match(/\| ([^|]*?) ?\|$/)[1].trim());

test('the doc is exactly what the saved results and the reviewer\'s answers render to', () => {
  const md = fs.readFileSync(REVIEW_MD, 'utf8');
  assert.equal(md.split('\n').filter((l) => /^\| \d+ \|/.test(l)).length, 20);
  assert.match(md, /\| Agree\? \(y\/n\) \|$/m);
  assert.equal(md, renderReview(results, answers));
});

test('without answers the Agree column is empty: only the reviewer fills it', () => {
  assert.ok(agreeCells(renderReview(results)).every((c) => c === ''));
  assert.match(renderReview(results), /It is left empty on purpose\./);
});

test('the review answers: 17 of 20 agree; the n\'s (rows 1, 14, 16, reference material) now get Reference, so their old answers are set aside', () => {
  const recorded = Object.values(answers.answers);
  assert.equal(recorded.filter((a) => /^y\b/.test(a.answer)).length, 17);
  const nRows = results.repos.map((r, i) => (/^n\b/.test(answers.answers[r.name]?.answer || '') ? i + 1 : null)).filter(Boolean);
  assert.deepEqual(nRows, [1, 14, 16]);
  for (const i of nRows) assert.equal(results.repos[i - 1].final.advice, 'reference', results.repos[i - 1].name);
  const cells = agreeCells(fs.readFileSync(REVIEW_MD, 'utf8'));
  assert.deepEqual(nRows.map((i) => cells[i - 1]), ['', '', ''], 'answers given to the old advice are not shown');
  assert.equal(cells.filter((c) => /^y\b/.test(c)).length, 17);
  assert.match(fs.readFileSync(REVIEW_MD, 'utf8'), /Filled in on 2026-11-25: 17 of 20 agree \(y\)\..* 3 answers no longer match the advice/);
  for (const name of Object.keys(answers.answers)) assert.ok(results.repos.some((r) => r.name === name), `answer for a repo not in the review: ${name}`);
});

test('an answer only shows while the row still has the advice it was given to (a rerun that changes it clears the cell)', () => {
  const changed = structuredClone(results);
  const r = changed.repos.find((x) => x.name === 'microsoft/playwright-mcp');
  assert.equal(finalLabel(r.final), answers.answers[r.name].reviewed);
  r.final = { ...r.final, advice: 'build', form: 'skill', time: 'under an hour' };
  const before = agreeCells(renderReview(results, answers)).filter((c) => c).length;
  const cells = agreeCells(renderReview(changed, answers));
  assert.equal(cells[changed.repos.indexOf(r)], '');
  assert.equal(cells.filter((c) => c).length, before - 1);
  const only = { ...answers, answers: { [r.name]: answers.answers[r.name] } };
  assert.match(renderReview(changed, only), /1 answer no longer matches the advice/);
});

test('every close call was decided by Claude (build or install, one reason line), from a cached run', () => {
  const judged = results.repos.filter((r) => r.effort?.advice === 'judge');
  assert.ok(judged.length >= 8, `only ${judged.length} close calls`);
  for (const r of judged) {
    assert.equal(r.final.by, 'Claude', r.name);
    assert.ok(['build', 'install'].includes(r.final.advice), r.name);
    assert.ok(r.final.reason && !r.final.reason.includes('\n'), r.name);
    assert.ok(fs.existsSync(path.join(JUDGE_CACHE, `${r.final.hash}.json`)), `cached judgment for ${r.name}`);
  }
  for (const r of results.repos.filter((x) => x.effort && x.effort.advice !== 'judge')) assert.equal(r.final.by, 'rules', r.name);
});

test('collections are reported per part, never by their total', () => {
  const colls = results.repos.filter((r) => r.group === 'collection');
  assert.equal(colls.length, 4);
  for (const r of colls) {
    assert.equal(r.effort.type, 'collection', r.name);
    if (r.effort.advice !== 'reference') assert.match(r.effort.reason, /^Collection of \d+ /, r.name);
  }
});

test("Claude's reason is the reason only: no repeated (form, time) label in front", async () => {
  const { cleanReason } = await import('./eval/effort-review.mjs');
  assert.equal(cleanReason('(skill, 1–2 hours): standard TDD workflow.'), 'standard TDD workflow.');
  assert.equal(cleanReason('(skill, under an hour) The typical part is a standard workflow.'), 'The typical part is a standard workflow.');
  assert.equal(cleanReason('Curated rules (Chinese-specific).'), 'Curated rules (Chinese-specific).');
  for (const r of results.repos.filter((x) => x.final?.by === 'Claude')) assert.doesNotMatch(r.final.reason, /^\(/, r.name);
});

test('the stale-answers line is grammatical for one and for several', () => {
  const changed = structuredClone(results);
  const two = ['microsoft/playwright-mcp', 'awslabs/mcp'];
  for (const n of two) { const r = changed.repos.find((x) => x.name === n); r.final = { ...r.final, advice: 'build', form: 'skill', time: 'under an hour' }; }
  const only = { ...answers, answers: Object.fromEntries(two.map((n) => [n, answers.answers[n]])) };
  assert.match(renderReview(changed, only), /2 answers no longer match the advice/);
});

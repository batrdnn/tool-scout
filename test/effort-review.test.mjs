// docs/eval/effort-review.md (v0.8.1): 20 repos — 10 small skills, 4 collections, 3 plugins,
// 3 MCP servers — through the full flow, including Claude's judgment for close calls
// (headless `claude -p`, cached in test/eval/effort-judge-cache/), with an empty Agree column.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SETS, selectRepos, renderReview, judgePrompt, closeCallRules, REVIEW_MD, REVIEW_JSON, JUDGE_CACHE } from './eval/effort-review.mjs';

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

test('the doc has 20 rows, an empty Agree column, and is exactly what the saved results render to', () => {
  const md = fs.readFileSync(REVIEW_MD, 'utf8');
  const rows = md.split('\n').filter((l) => /^\| \d+ \|/.test(l));
  assert.equal(rows.length, 20);
  assert.match(md, /\| Agree\? \(y\/n\) \|$/m);
  for (const r of rows) assert.match(r, /\|\s*\|$/, `Agree column must be empty: ${r}`);
  assert.equal(md, renderReview(results));
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
    assert.match(r.effort.reason, /^Collection of \d+ /, r.name);
  }
});

test("Claude's reason is the reason only: no repeated (form, time) label in front", async () => {
  const { cleanReason } = await import('./eval/effort-review.mjs');
  assert.equal(cleanReason('(skill, 1–2 hours): standard TDD workflow.'), 'standard TDD workflow.');
  assert.equal(cleanReason('(skill, under an hour) The typical part is a standard workflow.'), 'The typical part is a standard workflow.');
  assert.equal(cleanReason('Curated rules (Chinese-specific).'), 'Curated rules (Chinese-specific).');
  for (const r of results.repos.filter((x) => x.final?.by === 'Claude')) assert.doesNotMatch(r.final.reason, /^\(/, r.name);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judgeInstructions, buildPrompt, runE2E, parsePicks } from './eval/e2e.mjs';
import { loadSet } from './eval/eval.mjs';

const SKILL = fs.readFileSync(new URL('../skills/scout/SKILL.md', import.meta.url), 'utf8');

test("the judge gets SKILL.md's reading and filtering steps, not the presentation step", () => {
  const ins = judgeInstructions(SKILL);
  assert.match(ins, /Filter the shortlist/);
  assert.match(ins, /Pick at most 5/);
  assert.doesNotMatch(ins, /\*\*Present\*\*/);
  assert.doesNotMatch(ins, /scout\.mjs" all/, 'no instruction to run the script');
});

test('the judge never sees the labels', () => {
  for (const set of ['main', 'holdout']) {
    const { labels } = loadSet(set);
    const whys = Object.values(labels).map((l) => l.why).filter((w) => w && w.length > 12);
    const recs = Object.keys(labels).slice(0, 25).map((name) => ({ name, kind: 'skill', description: 'x', evidence: [], trust: { tier: 'high', notes: [] } }));
    const prompt = buildPrompt(SKILL, { sessions: 16, topics: { testing: 3 }, friction: {}, languages: {}, repeatedCommands: [], installed: { names: [] } }, recs);
    for (const w of whys) assert.ok(!prompt.includes(w), `label reason leaked: ${w}`);
    assert.doesNotMatch(prompt, /labels\.json|"quant-ios":\s*[01]|relevan(t|ce) label/i);
  }
});

test('parsePicks takes structured output, keeps only shortlist names, in order, deduped', () => {
  const short = ['a/x', 'b/y', 'c/z'];
  assert.deepEqual(parsePicks({ structured_output: { picks: ['b/y', 'nope/q', 'a/x', 'b/y'] } }, short), ['b/y', 'a/x']);
  assert.deepEqual(parsePicks({ result: 'Picks: {"picks":["c/z"]}' }, short), ['c/z']);
  assert.throws(() => parsePicks({ is_error: true, result: 'credits' }, short), /judge failed/);
});

test('e2e results are cached by input hash: a rerun makes no judge calls', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-e2e-'));
  let calls = 0;
  const judge = async (prompt, shortlist) => { calls++; return shortlist.slice(0, 5); };
  const a = await runE2E({ set: 'holdout', model: 'm', cacheDir, judge });
  assert.equal(calls, 3);
  assert.equal(a.length, 3);
  for (const r of a) {
    for (const k of ['scriptP3', 'scriptP5', 'e2eP3', 'e2eP5']) assert.ok(r[k] >= 0 && r[k] <= 1, `${r.persona} ${k}`);
    assert.equal(r.e2eP5, r.scriptP5, 'a judge that keeps the first 5 scores like the script');
  }
  const b = await runE2E({ set: 'holdout', model: 'm', cacheDir, judge });
  assert.equal(calls, 3, 'second run served from cache');
  assert.deepEqual(b.map((r) => r.picks), a.map((r) => r.picks));
  await runE2E({ set: 'holdout', model: 'other-model', cacheDir, judge });
  assert.equal(calls, 6, 'the model is part of the hash');
});

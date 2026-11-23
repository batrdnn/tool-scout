import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEval, precisionAt, precisionFixedAt } from './eval/eval.mjs';
import { PERSONAS, materialize } from './eval/personas.mjs';
import { buildProfile } from '../scripts/lib/profile.mjs';
import fs from 'node:fs';

test('eval personas materialize into readable fake homes', () => {
  for (const name of Object.keys(PERSONAS)) {
    const home = materialize(name);
    const p = buildProfile({ home, days: 36500, cwd: home });
    assert.equal(p.sessions, PERSONAS[name].sessions.length, name);
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('precisionAt counts labels within the first k', () => {
  assert.equal(precisionAt(['HKUDS/Vibe-Trading', 'rehan-remade/universal-modder'], 'quant-ios', 5), 0.5);
  assert.equal(precisionAt([], 'quant-ios', 5), 0);
});

test('precisionFixedAt always divides by k: missing picks count as not relevant', () => {
  const two = ['HKUDS/Vibe-Trading', 'Jakeschincariol/day-trader-skill'];
  assert.equal(precisionAt(two, 'quant-ios', 5), 1);
  assert.equal(precisionFixedAt(two, 'quant-ios', 5), 0.4);
  assert.equal(precisionFixedAt(two, 'quant-ios', 3), 2 / 3);
  assert.equal(precisionFixedAt([], 'quant-ios', 3), 0);
});

test('eval rows report both precision versions and the number returned', () => {
  for (const r of runEval()) for (const k of ['p3', 'p5', 'fp3', 'fp5', 'returned']) assert.ok(typeof r[k] === 'number', `${r.persona} ${k}`);
});

test('eval runs end to end and yields metrics in [0,1]', () => {
  const rows = runEval();
  assert.equal(rows.length, 3);
  for (const r of rows) for (const k of ['p5', 'p25', 'r25']) assert.ok(r[k] >= 0 && r[k] <= 1, `${r.persona} ${k}`);
});

test('shortlist precision does not regress below the v0.2 floor', () => {
  const rows = runEval();
  const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  // v0.1 baseline: p@5 0.27, p@25 0.29, recall@25 0.75. Floors leave ~one item of slack.
  // v0.4 item 3 (actions + 0.3 × mentions) lowered main p@5 from 0.80 to 0.67 on purpose: the
  // personas' domain topics (finance, security) only appear in prompt text. Floor moved 0.7 -> 0.6.
  assert.ok(mean('fp5') >= 0.6, `mean fixed p@5 ${mean('fp5')}`); // fixed denominator (v0.4.1)
  assert.ok(mean('p25') >= 0.45, `mean p@25 ${mean('p25')}`);
  assert.ok(mean('r25') >= 0.9, `mean recall@25 ${mean('r25')}`);
});

test('the holdout set is frozen (never tune against it)', async () => {
  const { createHash } = await import('node:crypto');
  const sha = (f) => createHash('sha256').update(fs.readFileSync(new URL(`./eval/holdout/${f}`, import.meta.url))).digest('hex');
  assert.equal(sha('labels.json'), '098a2bdd049851bfcef2ff32d17bca3430c90fef6cbd12293d5a668b93fc4a95');
  assert.equal(sha('catalog.json'), '0e1b383ae7a6c615855379ec61b42580250c8b324d8eac7f315c94d053d49e26');
  assert.ok(runEval('holdout').length === 3);
});

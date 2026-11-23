import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEval, precisionAt } from './eval/eval.mjs';
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

test('eval runs end to end and yields metrics in [0,1]', () => {
  const rows = runEval();
  assert.equal(rows.length, 3);
  for (const r of rows) for (const k of ['p5', 'p25', 'r25']) assert.ok(r[k] >= 0 && r[k] <= 1, `${r.persona} ${k}`);
});

test('shortlist precision does not regress below the v0.2 floor', () => {
  const rows = runEval();
  const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  // v0.1 baseline: p@5 0.27, p@25 0.29, recall@25 0.75. Floors leave ~one item of slack.
  assert.ok(mean('p5') >= 0.7, `mean p@5 ${mean('p5')}`);
  assert.ok(mean('p25') >= 0.45, `mean p@25 ${mean('p25')}`);
  assert.ok(mean('r25') >= 0.9, `mean recall@25 ${mean('r25')}`);
});

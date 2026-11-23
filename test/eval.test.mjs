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

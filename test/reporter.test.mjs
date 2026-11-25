// v0.9.1 item 7: `npm test` prints only failures and a one-line summary; `npm run test:verbose`
// prints everything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FX = path.join(ROOT, 'test', 'fixtures', 'reporter');
const run = (files) => spawnSync(process.execPath, ['--test', '--test-reporter=./test/reporter.mjs', ...files.map((f) => path.join(FX, f))], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });

test('failures only, each with its message and where it is, then one summary line', () => {
  const r = run(['mixed.fixture.mjs', 'passing.fixture.mjs']);
  assert.notEqual(r.status, 0, 'a failure still fails the run');
  const out = r.stdout + r.stderr;
  for (const s of ['LOUD-FAILING', 'LOUD-FAILURE-MESSAGE', 'LOUD-CHILD-FAILING', 'LOUD-CHILD-ERROR', 'mixed.fixture.mjs:7']) assert.ok(out.includes(s), `${s}\n${out}`);
  assert.doesNotMatch(out, /QUIET-/, 'nothing about passing or skipped tests, and no test output');
  assert.ok(!/^✖ PARENT\b/m.test(out), 'a parent that failed only because of its child is not repeated');
  const lines = out.trim().split('\n');
  assert.match(lines.at(-1), /^2 of 7 tests failed, 1 skipped \(\d+(?:\.\d+)?s\)$/, lines.at(-1));
});

test('all passing: just the summary line', () => {
  const r = run(['passing.fixture.mjs']);
  assert.equal(r.status, 0);
  assert.match((r.stdout + r.stderr).trim(), /^1 test passed \(\d+(?:\.\d+)?s\)$/);
});

test('npm test uses the quiet reporter; npm run test:verbose gives the full output', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(scripts.test, 'node --test --test-reporter=./test/reporter.mjs test/*.test.mjs');
  assert.equal(scripts['test:verbose'], 'node --test --test-reporter=spec test/*.test.mjs');
});

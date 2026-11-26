// v0.15.0 item 2, cause 16: `node --test test/*.test.mjs` needs a shell that expands the glob. PowerShell
// does not, and Node 20 (the minimum) has no glob of its own, so on Windows `npm test` found no files.
// test/run-tests.mjs lists the test files itself and runs node --test on them, on every system.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testFiles, testArgs } from './run-tests.mjs';

const TEST = path.dirname(fileURLToPath(import.meta.url));

test('testFiles lists every *.test.mjs in the folder, sorted, and nothing else', () => {
  const files = testFiles(TEST);
  assert.ok(files.length > 100);
  assert.ok(files.every((f) => f.endsWith('.test.mjs') && path.dirname(f) === TEST));
  assert.deepEqual(files, [...files].sort());
  assert.ok(files.includes(path.join(TEST, 'run-tests.test.mjs')));
  assert.ok(!files.some((f) => /helpers|reporter\.mjs|run-tests\.mjs$/.test(path.basename(f)) && !f.endsWith('.test.mjs')));
  assert.equal(files.length, fs.readdirSync(TEST).filter((f) => f.endsWith('.test.mjs')).length);
});

test('testArgs: the quiet reporter by default, "spec" for the verbose run, the files after it', () => {
  assert.deepEqual(testArgs([], ['/t/a.test.mjs']), ['--test', '--test-reporter=./test/reporter.mjs', '/t/a.test.mjs']);
  assert.deepEqual(testArgs(['spec'], ['/t/a.test.mjs']), ['--test', '--test-reporter=spec', '/t/a.test.mjs']);
});

test('package.json test scripts have no glob: no shell has to expand anything', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(TEST, '..', 'package.json'), 'utf8'));
  for (const k of ['test', 'test:verbose']) assert.doesNotMatch(scripts[k], /\*/, k);
});

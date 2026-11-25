// Run by test/reporter.test.mjs only (not matched by test/*.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('QUIET-PASSING-ONE', () => { console.log('QUIET-NOISE'); assert.ok(true); });
test('QUIET-PASSING-TWO', () => assert.ok(true));
test('LOUD-FAILING', () => assert.equal(1 + 1, 3, 'LOUD-FAILURE-MESSAGE'));
test('QUIET-SKIPPED', { skip: true }, () => {});
test('PARENT', async (t) => {
  await t.test('QUIET-CHILD-PASSING', () => {});
  await t.test('LOUD-CHILD-FAILING', () => { throw new Error('LOUD-CHILD-ERROR'); });
});

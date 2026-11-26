// v0.15.0: the minimum Node version is 20, and every place that states it agrees: the startup check,
// package.json "engines", the CI matrix, the README, TESTING.md and the "if the script fails" text of
// each skill. One number, checked together, so they cannot drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MIN_NODE } from '../scripts/lib/node-check.mjs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the minimum is Node 20', () => assert.equal(MIN_NODE, 20));

test('package.json engines says the minimum', () => {
  assert.equal(JSON.parse(read('package.json')).engines.node, `>=${MIN_NODE}`);
});

test('the CI matrix starts at the minimum and has no older Node', () => {
  const m = read('.github/workflows/test.yml').match(/node:\s*\[([^\]]*)\]/);
  const versions = m[1].split(',').map((x) => Number(x.trim()));
  assert.equal(Math.min(...versions), MIN_NODE);
  assert.deepEqual(versions, [20, 22, 24]);
});

test('the README and TESTING.md say the minimum, and none of the docs say 18', () => {
  assert.match(read('README.md'), new RegExp(`\\*\\*Node\\.js ${MIN_NODE} or newer\\.\\*\\*`));
  assert.match(read('TESTING.md'), new RegExp(`Node ${MIN_NODE} or newer`));
  for (const f of ['README.md', 'TESTING.md', 'scripts/lib/cli.mjs']) assert.doesNotMatch(read(f), /Node(?:\.js)? 18\b/, f);
});

test('every skill tells the user the same minimum when the script says Node is too old', () => {
  for (const s of ['scout', 'check', 'kickoff', 'me']) {
    const t = read(`skills/${s}/SKILL.md`).replace(/\s+/g, ' ');
    assert.ok(t.includes(`"Tool Scout needs Node.js ${MIN_NODE} or newer"`), s);
    assert.ok(t.includes(`Tool Scout needs Node.js ${MIN_NODE} or newer; they can check`), s);
    assert.doesNotMatch(t, /Node\.js 18/, s);
  }
});

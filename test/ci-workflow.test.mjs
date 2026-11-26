// v0.15.0 item 1: the GitHub Actions workflow runs the tests and the plugin validation on
// ubuntu, macOS and Windows with Node 20, 22 and 24, offline, with no secrets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FILE = new URL('../.github/workflows/test.yml', import.meta.url);
const yml = () => fs.readFileSync(FILE, 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the workflow runs on push and on pull request', () => {
  assert.match(yml(), /^on:\s*\n\s+push:/m);
  assert.match(yml(), /^\s+pull_request:/m);
});

test('it can also be started by hand (workflow_dispatch), for when a push does not start a run', () => {
  assert.match(yml(), /^\s+workflow_dispatch:/m);
});

test('the matrix is ubuntu, macos and windows by Node 20, 22 and 24: 9 jobs, none dropped on failure', () => {
  const y = yml();
  assert.match(y, /os:\s*\[\s*ubuntu-latest\s*,\s*macos-latest\s*,\s*windows-latest\s*\]/);
  assert.match(y, /node:\s*\[\s*20\s*,\s*22\s*,\s*24\s*\]/);
  assert.match(y, /fail-fast:\s*false/);
});

test('it runs npm test and claude plugin validate, and never the e2e eval', () => {
  const y = yml();
  assert.match(y, /run:\s*npm test\b/);
  assert.match(y, /run:\s*claude plugin validate \./);
  assert.doesNotMatch(y, /eval:e2e/);
});

test('the Claude Code CLI is installed in CI for the validate step only, not as a dependency', () => {
  const y = yml();
  assert.match(y, /npm install -g @anthropic-ai\/claude-code/);
  assert.ok(y.indexOf('npm install -g') < y.indexOf('claude plugin validate'), 'installed before it is used');
  assert.ok(!pkg.dependencies && !pkg.devDependencies && !pkg.optionalDependencies, 'package.json has no dependencies');
});

test('no secrets and no token: the tests run offline against the mock GitHub', () => {
  const y = yml();
  assert.doesNotMatch(y, /secrets\./);
  assert.doesNotMatch(y, /GITHUB_TOKEN|GH_TOKEN/);
  assert.match(y, /permissions:\s*\n\s+contents:\s*read/);
});

test('actions are pinned to a version tag, and the checkout does not keep credentials', () => {
  const y = yml();
  for (const m of y.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /@v\d+/, m[1]);
  assert.match(y, /persist-credentials:\s*false/);
});

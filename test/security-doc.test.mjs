// SECURITY.md tells people how to report a vulnerability privately, and README.md links to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('SECURITY.md says how to report privately and not to open a public issue', () => {
  assert.ok(fs.existsSync(new URL('../SECURITY.md', import.meta.url)), 'SECURITY.md exists');
  const s = read('SECURITY.md');
  assert.ok(s.includes('https://github.com/batrdnn/tool-scout/security/advisories/new'));
  assert.match(s, /(?:do not|don't) open a public issue/i);
});

test('SECURITY.md points to the changelog, the update command and the security review', () => {
  const s = read('SECURITY.md');
  assert.ok(s.includes('CHANGELOG.md'));
  assert.ok(s.includes('Security release:'));
  assert.ok(s.includes('claude plugin update tool-scout@tool-scout'));
  assert.ok(s.includes('docs/security-review.md'));
  assert.match(s, /latest release/i);
});

test('README.md links SECURITY.md', () => {
  assert.match(read('README.md'), /\]\(SECURITY\.md\)/);
});

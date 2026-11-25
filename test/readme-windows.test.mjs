// v0.15.0 items 3 and 4: Windows is documented where people look (README Requirements), the CI badge
// is on the README, and anything that can't work on Windows is named there, not hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const requirements = README.slice(README.indexOf('## Requirements'), README.indexOf('## Quick start'));

test('the README has the CI status badge, linked to the workflow runs', () => {
  assert.match(README, /\[!\[test\]\(https:\/\/github\.com\/batrdnn\/tool-scout\/actions\/workflows\/test\.yml\/badge\.svg\)\]\(https:\/\/github\.com\/batrdnn\/tool-scout\/actions\/workflows\/test\.yml\)/);
});

test('Requirements say "Tested on macOS, Linux and Windows." and no longer call Windows untested', () => {
  assert.match(requirements, /Tested on macOS, Linux and Windows\./);
  assert.doesNotMatch(README, /Windows is untested/i);
});

test('Requirements name what is different on Windows: claude.exe, file modes, the terminal', () => {
  assert.match(requirements, /claude\.exe/);
  assert.match(requirements, /claude\.cmd/);
  assert.match(requirements, /file modes|0600/);
  assert.match(requirements, /Windows Terminal/);
});

test('the Node requirement is still stated once, next to the platform line', () => {
  assert.match(requirements, /\*\*Node\.js 20 or newer\.\*\*/);
});

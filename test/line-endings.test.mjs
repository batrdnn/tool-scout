// v0.15.0 item 2, cause 3: Windows git checks files out with CRLF, which breaks every test that
// compares a file's exact text (docs, snapshots, the frozen skill steps, the holdout set).
// .gitattributes pins text files to LF in every checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('.gitattributes pins text files to LF and marks images binary', () => {
  const g = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  assert.match(g, /^\* text=auto eol=lf$/m);
  for (const ext of ['png', 'gif']) assert.match(g, new RegExp(`^\\*\\.${ext} binary$`, 'm'));
});

test('git agrees: every tracked text file is checked out as LF', () => {
  const out = execFileSync('git', ['ls-files', '--eol'], { cwd: ROOT, encoding: 'utf8' });
  const bad = out.split('\n').filter((l) => /\bw\/(?:crlf|mixed)\b/.test(l));
  assert.deepEqual(bad, []);
});

test('the files the tests compare byte for byte have no CR in the working tree', () => {
  for (const f of ['README.md', 'TESTING.md', 'CHANGELOG.md', 'docs/USAGE.md', 'skills/scout/SKILL.md', 'skills/check/SKILL.md', 'docs/assets/terminal.svg']) {
    assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('\r'), f);
  }
});

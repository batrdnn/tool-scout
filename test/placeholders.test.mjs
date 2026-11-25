import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['.git', 'node_modules']);

/** Every Markdown file in the repo (README, TESTING.md, docs/, skills/, test READMEs). */
function docFiles(dir = ROOT) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? docFiles(p) : /\.md$/i.test(e.name) ? [p] : [];
  });
}

test('no doc file still has a <your-github-user> placeholder', () => {
  const files = docFiles();
  assert.ok(files.some((f) => f.endsWith('README.md')) && files.some((f) => f.endsWith('TESTING.md')));
  const left = files.filter((f) => /<your-github-user>/i.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
  assert.deepEqual(left, [], `replace the placeholder in: ${left.join(', ')}`);
});

test('the README install command points at the real repo', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /\/plugin marketplace add batrdnn\/tool-scout\b/);
});

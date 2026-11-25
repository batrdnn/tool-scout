// v0.15.0 item 2, cause 1: Node 18 is supported (package.json "engines"), so no source or test file
// may use an API that arrived later. import.meta.dirname and import.meta.filename are Node 20.11+.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export function sources(dirs = ['scripts', 'test']) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'fixtures') walk(p); } else if (/\.mjs$/.test(e.name)) out.push(p);
    }
  };
  for (const d of dirs) walk(path.join(ROOT, d));
  return out.filter((f) => f !== fileURLToPath(import.meta.url));
}

test('no file uses import.meta.dirname or import.meta.filename (Node 20.11+)', () => {
  const bad = sources().filter((f) => /import\.meta\.(?:dirname|filename)\b/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(bad.map((f) => path.relative(ROOT, f)), []);
});

// v0.15.0 item 2, cause 2: a file URL's .pathname is "/D:/a/x" on Windows, not a path.
test('no file URL is turned into a path with .pathname: use fileURLToPath', () => {
  const bad = sources().filter((f) => /(?:import\.meta\.url\)|new URL\(f\))\.pathname\b/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(bad.map((f) => path.relative(ROOT, f)), []);
});

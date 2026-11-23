// Must-catch: fake malicious repos (test/fixtures/malicious/*) scanned end to end through
// scanRepo with a mock GitHub. Each must raise the expected flag at medium or high.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepo, scanText, applyFlags } from '../scripts/lib/scan.mjs';
import { createClient } from '../scripts/lib/github.mjs';
import { mockFetch } from './helpers.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'malicious');
const SEV = { low: 1, medium: 2, high: 3 };

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

/** Serve a fixture folder as repo `fake/<name>` through a mock GitHub API. */
export async function scanFixture(name) {
  const dir = path.join(ROOT, name);
  const files = walk(dir);
  const api = `https://api.github.com/repos/fake/${name}`;
  const f = mockFetch((url) => {
    if (url === `${api}/readme`) return fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    if (url.startsWith(`${api}/git/trees/`)) return { tree: files.map((p) => ({ path: p, type: 'blob', size: fs.statSync(path.join(dir, p)).size })) };
    const m = url.match(/\/contents\/(.+)$/);
    if (m) { const p = m[1].split('/').map(decodeURIComponent).join('/'); if (files.includes(p)) return fs.readFileSync(path.join(dir, p), 'utf8'); }
    return undefined;
  });
  return scanRepo(createClient({ fetchImpl: f }), `fake/${name}`);
}

export const MUST_CATCH = {
  'prompt-injection': 'prompt-injection',
  'invisible-unicode': 'invisible-unicode',
  'pipe-to-shell': 'pipe-to-shell',
  exfiltration: 'exfiltration',
  'obfuscated-base64': 'obfuscated-exec',
};

for (const [fixture, id] of Object.entries(MUST_CATCH)) {
  test(`must catch: ${fixture} → ${id} at medium or high`, async () => {
    const r = await scanFixture(fixture);
    const hits = r.flags.filter((x) => x.id === id && SEV[x.severity] >= 2);
    assert.ok(hits.length, `${fixture}: got ${JSON.stringify(r.flags.map((x) => `${x.id}:${x.severity}@${x.file}`))}`);
    assert.notEqual(applyFlags({ score: 90, tier: 'high', notes: [] }, r).tier, 'high', 'a must-catch repo cannot stay in the high tier');
  });
}

test('every fixture folder is covered by a must-catch case', () => {
  const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual(dirs, Object.keys(MUST_CATCH).sort());
});

test('a run of zero-width characters (bit-string steganography) is flagged', () => {
  const zw = '​‌‌​​‌​‌';
  const f = scanText(`Keep diffs small.${zw} Then commit.`, { file: 'SKILL.md', role: 'skill' });
  assert.ok(f.some((x) => x.id === 'invisible-unicode' && SEV[x.severity] >= 2), JSON.stringify(f));
});

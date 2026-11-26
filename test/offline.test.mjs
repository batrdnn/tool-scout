// v0.17.1 (review E2): --offline makes zero network requests. `all` used to crawl GitHub when the
// catalog was old, even with --offline. Now it uses the saved catalog (and says it is old), or fails
// with a clear message when there is none; commands that can only work online say so. A preloaded
// fetch records every request, so "zero" is checked, not assumed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const PROFILE = fileURLToPath(new URL('./fixtures/output/profile.json', import.meta.url));
const EVAL_CATALOG = fileURLToPath(new URL('./eval/catalog.json', import.meta.url));

function world({ catalog = 'stale' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-offline-'));
  const data = path.join(root, 'data'), home = path.join(root, 'home'), capture = path.join(root, 'requests.txt');
  fs.mkdirSync(data); fs.mkdirSync(home);
  const preload = path.join(root, 'preload.mjs');
  fs.writeFileSync(preload, `import fs from 'node:fs'; globalThis.fetch = async (u) => { fs.appendFileSync(${JSON.stringify(capture)}, String(u?.url || u) + '\\n'); return new Response('{}', { status: 404 }); };\n`);
  fs.copyFileSync(PROFILE, path.join(data, 'profile.json'));
  if (catalog === 'stale') { const c = JSON.parse(fs.readFileSync(EVAL_CATALOG, 'utf8')); c.updatedAt = '2020-01-01T00:00:00.000Z'; fs.writeFileSync(path.join(data, 'catalog.json'), JSON.stringify(c)); }
  const run = (...a) => spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, SCOUT, ...a, '--data', data, '--home', home], { encoding: 'utf8', cwd: root, env: { ...process.env, GITHUB_TOKEN: 'x', GH_TOKEN: 'x' } });
  const requests = () => (fs.existsSync(capture) ? fs.readFileSync(capture, 'utf8').trim().split('\n') : []);
  return { root, data, home, run, requests };
}

test('sanity: without --offline, `all --refresh` asks GitHub (an old catalog is now refreshed in the background instead)', () => {
  const w = world();
  w.run('all', '--refresh', '--json');
  assert.ok(w.requests().length > 0, 'the preload sees requests, so "zero" below means something');
});

test('all --offline with an old catalog: ranks from it, makes no request, and says the catalog is old', () => {
  const w = world();
  const r = w.run('all', '--offline', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(w.requests(), []);
  const o = JSON.parse(r.stdout);
  assert.ok(Array.isArray(o.recommendations)); // (the empty temp home has no history to rank on)
  assert.match(o.notes.join(' '), /offline[^.]*catalog[^.]*(from|old|days)/i);
  assert.match(r.stderr, /offline/i);
});

test('all --offline with no catalog at all: ranks from the starter catalog, says so, no request', () => {
  const w = world({ catalog: 'none' });
  const r = w.run('all', '--offline', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout).notes.join(' '), /starter catalog/i);
  assert.deepEqual(w.requests(), []);
});

test('recommend, profile, me, stats, audit, privacy, kickoff and head with --offline make no request', () => {
  const w = world();
  fs.writeFileSync(path.join(w.root, 'PLAN.md'), '# Plan\n\n## Tasks\n- Write pytest tests\n- Add tests for edge cases\n');
  for (const a of [['recommend', '--json'], ['profile', '--json'], ['me', '--json'], ['me', '--blind-spot', '--json'], ['stats', '--json'], ['audit', '--json'], ['privacy', '--json'],
    ['kickoff', '--plan-file', path.join(w.root, 'PLAN.md'), '--json'], ['head', 'o/x', '--json']]) {
    const r = w.run(...a, '--offline');
    assert.equal(r.status, 0, `${a.join(' ')}: ${r.stderr}`);
  }
  assert.deepEqual(w.requests(), []);
});

test('commands that only work online refuse under --offline, say so, and make no request', () => {
  const w = world();
  for (const a of [['crawl'], ['check', 'o/x'], ['line', 'o/x', 'README.md:1'], ['install', 'o/x', '--plan']]) {
    const r = w.run(...a, '--offline');
    assert.notEqual(r.status, 0, a.join(' '));
    assert.match(r.stderr + r.stdout, /--offline/, a.join(' '));
    assert.match(r.stderr + r.stdout, /needs the network|needs GitHub|online/i, a.join(' '));
  }
  assert.deepEqual(w.requests(), []);
});

test('even a bug cannot reach the network under --offline: fetch itself is replaced', () => {
  const src = fs.readFileSync(new URL('../scripts/lib/cli.mjs', import.meta.url), 'utf8');
  assert.match(src, /opts\.offline[\s\S]{0,200}globalThis\.fetch\s*=/);
});

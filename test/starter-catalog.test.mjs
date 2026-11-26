// v0.17.1 (review E1): the first run used to crawl GitHub (18 queries, 6.5 s apart: about 2 minutes) before
// showing anything. Now a small starter catalog ships with Tool Scout, `all` ranks from it at once, and
// the real crawl runs in the background (or in the foreground with --refresh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { seedStarter, startBackgroundRefresh, finishCrawl, STARTER_FILE } from '../scripts/lib/starter.mjs';
import { KEPT } from '../scripts/lib/privacy.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCOUT = path.join(ROOT, 'scripts/scout.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scout-starter-'));
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('the starter catalog ships with Tool Scout: public repos only, marked as a starter, dated', () => {
  const c = readJson(STARTER_FILE);
  assert.equal(c.starter, true);
  assert.match(c.updatedAt, /^\d{4}-\d\d-\d\dT/);
  const repos = Object.values(c.repos);
  assert.ok(repos.length >= 40 && repos.length <= 300, `${repos.length} repos: small, but enough to rank`);
  for (const r of repos) {
    for (const k of ['full_name', 'name', 'url', 'stars', 'kind', 'topics', 'pushedAt', 'history']) assert.ok(k in r, `${r.full_name} lacks ${k}`);
    assert.match(r.url, /^https:\/\/github\.com\//);
  }
  assert.ok(JSON.stringify(c).length < 200_000, 'a starter, not a database');
});

test('seedStarter: saves it only when there is no catalog, and never over a real one', () => {
  const d = tmp();
  const s = seedStarter(d);
  assert.equal(s.seeded, true);
  assert.equal(readJson(path.join(d, 'catalog.json')).starter, true);
  assert.equal(seedStarter(d).seeded, false, 'already there');
  const e = tmp();
  fs.writeFileSync(path.join(e, 'catalog.json'), JSON.stringify({ updatedAt: '2026-11-25T00:00:00.000Z', repos: { 'a/b': { full_name: 'a/b' } } }));
  assert.equal(seedStarter(e).seeded, false);
  assert.deepEqual(Object.keys(readJson(path.join(e, 'catalog.json')).repos), ['a/b']);
});

test('finishCrawl takes the starter mark off once a real crawl has merged into it', () => {
  const d = tmp();
  seedStarter(d);
  finishCrawl(d);
  assert.equal('starter' in readJson(path.join(d, 'catalog.json')), false);
});

test('startBackgroundRefresh starts one detached crawl, not another while one is running, and is off in tests', () => {
  const d = tmp();
  const calls = [];
  const spawn = (cmd, args, o) => { calls.push({ cmd, args, o }); return { unref() {}, on() {} }; };
  assert.equal(startBackgroundRefresh(d, { spawn, env: {} }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, process.execPath);
  assert.deepEqual(calls[0].args.slice(1), ['crawl', '--plain', '--data', d]);
  assert.equal(calls[0].o.detached, true);
  assert.equal(calls[0].o.stdio, 'ignore');
  assert.equal(startBackgroundRefresh(d, { spawn, env: {} }), false, 'a crawl was started a moment ago');
  assert.equal(calls.length, 1);
  assert.equal(startBackgroundRefresh(tmp(), { spawn, env: { SCOUT_NO_BACKGROUND: '1' } }), false);
  assert.equal(startBackgroundRefresh(tmp(), { spawn, env: { NODE_TEST_CONTEXT: 'child' } }), false);
  assert.equal(calls.length, 1);
  assert.equal(startBackgroundRefresh(tmp()), false, 'the real spawn is off under the test runner');
});

test('an old lock does not block a new background crawl', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'crawl.lock'), String(Date.now() - 3600e3));
  assert.equal(startBackgroundRefresh(d, { spawn: () => ({ unref() {}, on() {} }), env: {} }), true);
});

test('the lock file is in the privacy list', () => {
  assert.ok(KEPT.some((k) => k.path === 'crawl.lock'));
});

// ---- the CLI --------------------------------------------------------------------------------------

function run(args, d) {
  const home = tmp();
  const side = tmp(); // helper files stay out of the data folder
  const requests = path.join(side, 'req.txt');
  const preload = path.join(side, 'preload.mjs');
  fs.writeFileSync(preload, `import fs from 'node:fs'; globalThis.fetch = async (u) => { fs.appendFileSync(${JSON.stringify(requests)}, String(u?.url || u) + '\\n'); const search = String(u?.url || u).includes('/search/repositories'); return new Response(search ? JSON.stringify({ total_count: 0, items: [] }) : '{}', { status: search ? 200 : 404, headers: { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } }); };\n`);
  const r = spawnSync(process.execPath, ['--import', preload, SCOUT, ...args, '--data', d, '--home', home, '--json'], { encoding: 'utf8', cwd: side, env: { ...process.env, GITHUB_TOKEN: 'x', SCOUT_NO_BACKGROUND: '1' } });
  const reqs = fs.existsSync(requests) ? fs.readFileSync(requests, 'utf8').trim().split('\n') : [];
  return { ...r, reqs };
}

test('all with no catalog: starts from the starter at once, with no crawl in the foreground, and says so', () => {
  const d = tmp();
  const t0 = Date.now();
  const r = run(['all'], d);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Date.now() - t0 < 20_000, 'no 2-minute wait');
  assert.ok(!r.reqs.some((u) => u.includes('/search/repositories')), `a foreground crawl: ${r.reqs.join(' ')}`);
  const o = JSON.parse(r.stdout);
  assert.ok(o.catalogSize >= 40);
  assert.match(o.notes.join(' '), /starter catalog from 20\d\d-\d\d-\d\d/i);
  assert.match(o.notes.join(' '), /refresh/i);
});

test('all --refresh crawls in the foreground, as before', () => {
  const d = tmp();
  const r = run(['all', '--refresh'], d);
  assert.ok(r.reqs.some((u) => u.includes('/search/repositories')), r.reqs.join(' '));
});

test('all --offline with no catalog uses the starter (no request) and says it is the starter', () => {
  const d = tmp();
  const r = run(['all', '--offline'], d);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.reqs, []);
  assert.match(JSON.parse(r.stdout).notes.join(' '), /starter catalog/i);
});

test('crawl (the background command) clears the starter mark when it finishes', () => {
  const d = tmp();
  seedStarter(d);
  run(['crawl', '--max-pages', '1'], d);
  assert.equal('starter' in readJson(path.join(d, 'catalog.json')), false);
});

test('kickoff with no catalog also starts from the starter, with no foreground crawl', () => {
  const d = tmp();
  const plan = path.join(tmp(), 'PLAN.md');
  fs.writeFileSync(plan, '# Plan\n\n## Tasks\n- Write pytest tests\n- Add tests for edge cases\n');
  const r = run(['kickoff', '--plan-file', plan], d);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.reqs.some((u) => u.includes('/search/repositories')), r.reqs.join(' '));
  assert.equal(readJson(path.join(d, 'catalog.json')).starter, true);
});

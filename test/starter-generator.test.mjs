// v0.17.2: the starter catalog is generated (npm run starter) from a fresh crawl, keeping only repos
// whose content scan has no high flag. It is product data, kept apart from the eval data
// (test/eval), which must never be product data: they share no file and no generator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildStarter } from '../scripts/build-starter.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const repo = (full, o = {}) => ({ full_name: full, name: full.split('/')[1], url: `https://github.com/${full}`, description: 'd', topics: ['claude-skills'], stars: 100, kind: 'skill', archived: false, fork: false, pushedAt: '2026-11-20T00:00:00Z', history: [['2026-11-01', 90], ['2026-11-26', 100]], ...o });
const fakeCrawl = (repos) => async () => ({ updatedAt: '2026-11-26T10:00:00.000Z', repos: Object.fromEntries(repos.map((r) => [r.full_name, r])) });
const scanner = (flagsBy) => async (_c, name) => { if (flagsBy[name] === 'throw') throw new Error('boom'); return { flags: flagsBy[name] || [] }; };
const build = (repos, flagsBy = {}, o = {}) => buildStarter({ dataDir: '/x', crawlFn: fakeCrawl(repos), scanFn: scanner(flagsBy), client: {}, log: () => {}, ...o });

test('keeps repos with no high flag (medium and low are fine), drops high ones and unscannable ones', async () => {
  const out = await build([repo('a/ok'), repo('a/med'), repo('a/high'), repo('a/err')], { 'a/med': [{ severity: 'medium', id: 'network-call' }], 'a/high': [{ severity: 'high', id: 'prompt-injection' }], 'a/err': 'throw' });
  assert.deepEqual(Object.keys(out.repos).sort(), ['a/med', 'a/ok']);
});

test('drops archived repos, forks, apps and lists; orders by stars and stops at the limit', async () => {
  const out = await build([repo('a/one', { stars: 10 }), repo('a/two', { stars: 500 }), repo('a/arch', { archived: true }), repo('a/fork', { fork: true }), repo('a/app', { kind: 'app' }), repo('a/list', { kind: 'list' }), repo('a/three', { stars: 300 })], {}, { limit: 2 });
  assert.deepEqual(Object.keys(out.repos), ['a/two', 'a/three']);
});

test('the file is marked as a starter, dated by the crawl, history cut to the newest snapshot, scan recorded', async () => {
  const out = await build([repo('a/ok')]);
  assert.equal(out.starter, true);
  assert.equal(out.updatedAt, '2026-11-26T10:00:00.000Z');
  assert.deepEqual(out.repos['a/ok'].history, [['2026-11-26', 100]]);
  assert.equal(out.scan.rule, 'no high flags');
  assert.equal(out.scan.kept, 1);
  assert.ok(!('frozenFrom' in out));
});

test('it does not scan more repos than it needs', async () => {
  let scanned = 0;
  await build(Array.from({ length: 10 }, (_, i) => repo(`a/r${i}`, { stars: 100 - i })), {}, { limit: 3, scanFn: async () => { scanned++; return { flags: [] }; } });
  assert.equal(scanned, 3);
});

// ---- the eval data and the starter share nothing ------------------------------------------------------

test('the starter file is not the eval catalog: not the same bytes, not a link, and (nearly) not the same repos', () => {
  const s = path.join(ROOT, 'data/starter-catalog.json'), e = path.join(ROOT, 'test/eval/catalog.json');
  assert.ok(!fs.lstatSync(s).isSymbolicLink());
  const h = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  assert.notEqual(h(s), h(e));
  const sr = Object.keys(JSON.parse(fs.readFileSync(s, 'utf8')).repos), er = new Set(Object.keys(JSON.parse(fs.readFileSync(e, 'utf8')).repos));
  assert.ok(sr.length >= 40);
  assert.ok(sr.filter((r) => er.has(r)).length < sr.length * 0.9, 'the starter was copied from the eval catalog');
  assert.equal(JSON.parse(fs.readFileSync(s, 'utf8')).scan?.rule, 'no high flags');
});

test('the starter generator reads nothing from test/, and nothing in test/eval refers to the starter or its generator', () => {
  const gen = read('scripts/build-starter.mjs');
  assert.doesNotMatch(gen, /test\/|test\\\\|\.\.\/test/);
  assert.doesNotMatch(gen, /eval/i);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? (x.name === 'node_modules' ? [] : walk(path.join(d, x.name))) : [path.join(d, x.name)]));
  for (const f of walk(path.join(ROOT, 'test/eval')).filter((x) => /\.(mjs|js|md|json)$/.test(x) && !x.includes('e2e-cache') && !x.includes('judge-cache'))) {
    const t = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(t.slice(0, 200000), /starter-catalog|build-starter/, f);
  }
  assert.equal(JSON.parse(read('package.json')).scripts.starter, 'node scripts/build-starter.mjs');
});

test('/release regenerates the starter catalog at each release', () => {
  const md = read('.claude/skills/release/SKILL.md');
  assert.match(md, /npm run starter/);
  assert.match(md, /data\/starter-catalog\.json/);
});

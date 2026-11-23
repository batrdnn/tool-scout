import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '../scripts/lib/github.mjs';
import { measureStarVelocity, measureShortlist } from '../scripts/lib/momentum.mjs';
import { momentum } from '../scripts/lib/crawl.mjs';
import { mockFetch } from './helpers.mjs';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400e3).toISOString();


// 250 stars: page 3 = 50 stars within 2 days; page 2 = 50 within 7 days then 50 older.
const stargazers = (url) => {
  const p = Number(new URL(url).searchParams.get('page'));
  if (p === 3) return Array.from({ length: 50 }, (_, i) => ({ starred_at: daysAgo(2 - i / 50) }));
  if (p === 2) return [...Array.from({ length: 50 }, () => ({ starred_at: daysAgo(20) })), ...Array.from({ length: 50 }, () => ({ starred_at: daysAgo(5) }))];
  if (p === 1) return Array.from({ length: 100 }, () => ({ starred_at: daysAgo(90) }));
  return [];
};

test('counts stars from the last 7 days by walking stargazer pages backwards', async () => {
  const f = mockFetch(stargazers);
  const client = createClient({ fetchImpl: f });
  const r = await measureStarVelocity(client, 'o/r', 250, { now: NOW });
  assert.equal(r.stars, 100);
  assert.equal(r.complete, true);
  assert.equal(r.perDay, 100 / 7);
  assert.equal(f.calls.length, 2, 'stops once it passes the cutoff');
  assert.equal(f.calls[0].headers.Accept, 'application/vnd.github.star+json');
  assert.match(f.calls[0].url, /^https:\/\/api\.github\.com\/repos\/o\/r\/stargazers\?per_page=100&page=3$/);
});

test('reports a partial window when the page budget runs out', async () => {
  const recent = () => Array.from({ length: 100 }, () => ({ starred_at: daysAgo(0.5) }));
  const r = await measureStarVelocity(createClient({ fetchImpl: mockFetch(recent) }), 'o/hot', 5000, { now: NOW, maxPages: 2 });
  assert.equal(r.complete, false);
  assert.equal(r.stars, 200);
  assert.equal(r.perDay, 200, 'observed half day, span floored at 1 day');
});

test('repos over 40k stars are marked unavailable without a request', async () => {
  const f = mockFetch(stargazers);
  const r = await measureStarVelocity(createClient({ fetchImpl: f }), 'o/huge', 90000, { now: NOW });
  assert.ok(r.unavailable);
  assert.equal(f.calls.length, 0);
});

test('measureShortlist caches results and stops when the rate budget is low', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-mom-'));
  const cat = { repos: { 'o/r': { stars: 250, createdAt: daysAgo(400) }, 'o/s': { stars: 250, createdAt: daysAgo(400) } } };
  const f = mockFetch(stargazers);
  const st = await measureShortlist(['o/r'], cat, { client: createClient({ fetchImpl: f }), dataDir, now: NOW });
  assert.equal(st.measured, 1);
  assert.equal(cat.repos['o/r'].starVelocity.stars, 100);

  const f2 = mockFetch(stargazers);
  const st2 = await measureShortlist(['o/r'], { repos: { 'o/r': { stars: 250 } } }, { client: createClient({ fetchImpl: f2 }), dataDir, now: NOW + 3600e3 });
  assert.equal(st2.cached, 1);
  assert.equal(f2.calls.length, 0, 'served from cache');

  const low = mockFetch(stargazers, { remaining: 3 });
  const client = createClient({ fetchImpl: low });
  await client.request('https://api.github.com/rate_limit'); // learn the remaining budget
  const st3 = await measureShortlist(['o/s'], cat, { client, dataDir: null, now: NOW });
  assert.equal(st3.skipped, 1);
  assert.equal(low.calls.length, 1);
});

// GitHub (Nov 2026) 404s stargazer lists for repos you don't own; events still work.
const ownerOnly = (url) => {
  if (url.includes('/stargazers')) return { __status: 404 };
  if (url.includes('/events') && url.includes('page=1')) {
    return [
      ...Array.from({ length: 30 }, (_, i) => ({ type: 'WatchEvent', created_at: daysAgo(i / 5) })),
      { type: 'PushEvent', created_at: daysAgo(3) },
      { type: 'WatchEvent', created_at: daysAgo(9) },
    ];
  }
  return [];
};

test('falls back to the events feed when stargazers is owner-only, and remembers it', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-mom-'));
  const cat = { repos: { 'o/a': { stars: 500, createdAt: daysAgo(300) }, 'o/b': { stars: 500, createdAt: daysAgo(300) } } };
  const f = mockFetch(ownerOnly);
  const st = await measureShortlist(['o/a', 'o/b'], cat, { client: createClient({ fetchImpl: f }), dataDir, now: NOW });
  assert.equal(st.measured, 2);
  assert.deepEqual(st.method, { events: 2 });
  assert.equal(cat.repos['o/a'].starVelocity.stars, 30, 'WatchEvents inside 7 days only');
  assert.equal(cat.repos['o/a'].starVelocity.complete, true);
  assert.equal(f.calls.filter((c) => c.url.includes('/stargazers')).length, 1, 'second repo skips the blocked endpoint');
  assert.equal(momentum(cat.repos['o/a'], NOW).source, 'events');

  const f2 = mockFetch(ownerOnly);
  await measureShortlist(['o/c'], { repos: { 'o/c': { stars: 10 } } }, { client: createClient({ fetchImpl: f2 }), dataDir, now: NOW });
  assert.equal(f2.calls.filter((c) => c.url.includes('/stargazers')).length, 0, 'blocked state is cached across runs');
});

test('momentum prefers fresh stargazer counts over snapshots and estimates', () => {
  const repo = { stars: 1000, createdAt: daysAgo(100), history: [['2026-11-01', 900], ['2026-11-20', 1000]] };
  assert.equal(momentum(repo, NOW).source, 'measured');
  repo.starVelocity = { stars: 70, days: 7, perDay: 10, complete: true, fetchedAt: new Date(NOW).toISOString() };
  const m = momentum(repo, NOW);
  assert.equal(m.source, 'stargazers');
  assert.equal(m.perDay, 10);
  assert.equal(momentum(repo, NOW + 5 * 86400e3).source, 'measured', 'stale measurements are ignored');
});

test('a partial window (+N+★) ranks as at least N in 7 days, not as an exact short-window rate', async () => {
  const { momentum } = await import('../scripts/lib/crawl.mjs');
  const now = Date.parse('2026-11-23T12:00:00Z');
  const repo = { stars: 1000, createdAt: '2025-11-23T00:00:00Z', history: [],
    starVelocity: { stars: 255, days: 7, perDay: 255, complete: false, method: 'events', fetchedAt: new Date(now - 36e5).toISOString() } };
  const m = momentum(repo, now);
  assert.equal(m.complete, false);
  assert.equal(m.starsInWindow, 255);
  assert.ok(Math.abs(m.perDay - 255 / 7) < 1e-9, `perDay ${m.perDay}`);
  // Never below what we'd assume without the measurement (lifetime average here).
  const young = { ...repo, stars: 900, createdAt: '2026-11-20T12:00:00Z', starVelocity: { ...repo.starVelocity, stars: 70 } };
  assert.ok(Math.abs(momentum(young, now).perDay - 300) < 1e-9);
});

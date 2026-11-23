// Measured momentum for the shortlist only: counts stars from the last N days.
//
// Primary: the stargazers API with the `star+json` media type (includes `starred_at`).
// As of Nov 2026 GitHub only serves stargazer lists to a repo's owner (other repos: 401
// unauthenticated, 404 authenticated; GraphQL reports 0). So when stargazers 404s for a repo
// that exists, we remember the endpoint is blocked and fall back to the public repo events
// feed, whose `WatchEvent`s are stars with timestamps (newest 300 events / 90 days).
//
// Requests contain only public repo names. Results are cached in the data dir.

import fs from 'node:fs';
import path from 'node:path';
import { RateLimitError } from './github.mjs';

const PER_PAGE = 100;
const MAX_PAGE = 400; // GitHub refuses stargazer pages past ~40k stars
const CACHE_FILE = 'momentum-cache.json';

/**
 * Stars gained in the last `days` days.
 * Returns { stars, days, perDay, complete, pages } or { unavailable: reason }.
 * `complete` is false when `maxPages` ran out before reaching the cutoff; then `perDay`
 * is the rate over the span actually observed (still a measurement, just a shorter window).
 */
export async function measureStarVelocity(client, fullName, totalStars, { days = 7, maxPages = 5, now = Date.now(), createdAt } = {}) {
  const cutoff = now - days * 86400e3;
  let page = Math.max(1, Math.ceil((totalStars || 1) / PER_PAGE));
  if (page > MAX_PAGE) return { unavailable: `over ${MAX_PAGE * PER_PAGE} stars; GitHub won't page that far` };
  const url = (p) => `https://api.github.com/repos/${fullName}/stargazers?per_page=${PER_PAGE}&page=${p}`;
  let count = 0, oldestSeen = now, pages = 0, reachedCutoff = false, retriedEmpty = false;

  while (page >= 1 && pages < maxPages) {
    const res = await client.request(url(page), { accept: 'application/vnd.github.star+json' });
    pages++;
    if (res.status === 404 || res.status === 401) return { blocked: true }; // owner-only, or repo gone
    if (res.status === 422) return { unavailable: 'stargazer list too long to page' };
    if (!Array.isArray(res.data)) return { unavailable: `GitHub returned ${res.status}` };
    // Star count from the crawl can be ahead of the list (unstars); step back once if empty.
    if (!res.data.length && page > 1 && !retriedEmpty) { retriedEmpty = true; page--; continue; }
    const times = res.data.map((s) => Date.parse(s.starred_at)).filter(Number.isFinite);
    for (const t of times) {
      if (t >= cutoff) count++;
      oldestSeen = Math.min(oldestSeen, t);
    }
    if (times.some((t) => t < cutoff)) { reachedCutoff = true; break; }
    page--;
  }
  const complete = reachedCutoff || page < 1; // page < 1: walked the whole list
  // A repo younger than the window only had its own age to collect stars in.
  const age = createdAt ? Math.max(1 / 24, (now - Date.parse(createdAt)) / 86400e3) : Infinity;
  const spanDays = complete ? Math.min(days, age) : Math.max(1, (now - oldestSeen) / 86400e3); // partial window: floor 1 day so a few busy hours do not extrapolate wildly
  return { stars: count, days, perDay: count / spanDays, complete, pages, method: 'stargazers' };
}

/** Same result shape, from the public events feed (WatchEvent = a star). Newest first. */
export async function measureFromEvents(client, fullName, { days = 7, maxPages = 3, now = Date.now(), createdAt } = {}) {
  const cutoff = now - days * 86400e3;
  let count = 0, oldestSeen = now, pages = 0, complete = false;
  for (let page = 1; page <= maxPages; page++) {
    const res = await client.request(`https://api.github.com/repos/${fullName}/events?per_page=100&page=${page}`);
    pages++;
    if (res.status === 404) return { unavailable: 'repo not found' };
    if (res.status === 422) { complete = false; break; } // past the 300-event window
    if (!Array.isArray(res.data)) return { unavailable: `GitHub returned ${res.status}` };
    let passed = false;
    for (const e of res.data) {
      const t = Date.parse(e.created_at);
      if (!Number.isFinite(t)) continue;
      oldestSeen = Math.min(oldestSeen, t);
      if (t < cutoff) { passed = true; continue; }
      if (e.type === 'WatchEvent') count++;
    }
    if (passed || res.data.length < 100) { complete = true; break; }
  }
  const age = createdAt ? Math.max(1 / 24, (now - Date.parse(createdAt)) / 86400e3) : Infinity;
  const spanDays = complete ? Math.min(days, age) : Math.max(1, (now - oldestSeen) / 86400e3); // partial window: floor 1 day so a few busy hours do not extrapolate wildly
  return { stars: count, days, perDay: count / spanDays, complete, pages, method: 'events' };
}

function loadCache(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, CACHE_FILE), 'utf8')); } catch { return {}; }
}
function saveCache(dataDir, cache) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, CACHE_FILE), JSON.stringify(cache));
}

/** Attach every fresh cached measurement to its catalog entry (no network), before any ranking. */
export function applyCachedMomentum(catalog, dataDir, { ttlHours = 20, days = 7, now = Date.now() } = {}) {
  const cache = dataDir ? loadCache(dataDir) : {};
  let n = 0;
  for (const [name, hit] of Object.entries(cache)) {
    const repo = catalog.repos?.[name];
    if (name === '_meta' || !repo || !hit?.fetchedAt) continue;
    if (now - Date.parse(hit.fetchedAt) < ttlHours * 36e5 && hit.days === days) { repo.starVelocity = hit; n++; }
  }
  return n;
}

/**
 * Measure (or reuse cached) star velocity for `names`, attaching `starVelocity` to the
 * catalog entries in place. Stops early when the rate-limit budget gets low.
 */
export async function measureShortlist(names, catalog, { client, dataDir, ttlHours = 20, reserve = 10, days = 7, maxPages = 5, now = Date.now(), log = () => {}, concurrency = 4 }) {
  const cache = dataDir ? loadCache(dataDir) : {};
  const meta = (cache._meta ||= {});
  // Re-probe a blocked stargazers endpoint once a week, not on every run.
  let stargazersBlocked = !!meta.stargazersBlockedAt && now - Date.parse(meta.stargazersBlockedAt) < 7 * 86400e3;
  const stats = { cached: 0, measured: 0, unavailable: 0, skipped: 0, method: {} };
  let rateLimited = false;

  const todo = [];
  for (const name of names) {
    const repo = catalog.repos[name];
    if (!repo) continue;
    const hit = cache[name];
    if (hit && now - Date.parse(hit.fetchedAt) < ttlHours * 36e5 && hit.days === days) {
      repo.starVelocity = hit; stats.cached++; continue;
    }
    todo.push(name);
  }

  async function measureOne(name) {
    const repo = catalog.repos[name];
    if (rateLimited || !client.hasBudget(reserve)) { stats.skipped++; return; }
    try {
      const opts = { days, maxPages, now, createdAt: repo.createdAt };
      let r = stargazersBlocked ? { blocked: true } : await measureStarVelocity(client, name, repo.stars, opts);
      if (r.blocked) {
        r = await measureFromEvents(client, name, { ...opts, maxPages: 3 });
        if (!r.unavailable && !stargazersBlocked) {
          // The repo exists (events answered), so stargazers is refusing us, not missing the repo.
          stargazersBlocked = true;
          meta.stargazersBlockedAt = new Date(now).toISOString();
          log('momentum: GitHub serves stargazer lists only to repo owners; using the public events feed instead');
        }
      }
      if (r.method) stats.method[r.method] = (stats.method[r.method] || 0) + 1;
      const entry = { ...r, days, fetchedAt: new Date(now).toISOString() };
      cache[name] = entry;
      repo.starVelocity = entry;
      if (r.unavailable) stats.unavailable++; else stats.measured++;
    } catch (e) {
      if (e instanceof RateLimitError) { if (!rateLimited) log(e.message); rateLimited = true; stats.skipped++; return; }
      throw e;
    }
  }

  // The first repo goes alone so a blocked stargazers endpoint is detected once; then a small pool.
  if (todo.length) await measureOne(todo[0]);
  let next = 1;
  const worker = async () => { while (next < todo.length) await measureOne(todo[next++]); };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(0, todo.length - 1)) }, worker));

  if (dataDir) saveCache(dataDir, cache);
  if (stats.skipped) log(`momentum: rate-limit budget low, ${stats.skipped} repos keep estimated momentum`);
  return stats;
}

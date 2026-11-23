// The networked part of a run: rank, measure momentum until the final top N is measured,
// then scan the final candidates' content, dropping and backfilling the ones the scan demotes.
// Kept out of scout.mjs so it can be tested with a mock GitHub.

import { recommend } from './rank.mjs';
import { measureShortlist, applyCachedMomentum } from './momentum.mjs';
import { scanRecommendations } from './scan.mjs';

export const SHORTLIST = 25; // network work (momentum, trust scan) is limited to about this many candidates
const BACKFILL = 15; // extra ranked candidates kept in reserve for scan demotions
const ROUNDS = 3; // re-rank / measure rounds until the top N is all measured

const MEASURED = new Set(['events', 'stargazers']);
const needsLookup = (catalog, name) => {
  const sv = catalog.repos[name]?.starVelocity;
  return !sv; // an 'unavailable' result is still a lookup; don't retry it this run
};

export async function runPipeline(profile, catalog, { top = 8, rankOpts = {}, client = null, dataDir = null, log = () => {}, now = Date.now(), shortlist = SHORTLIST } = {}) {
  const stats = { momentum: { measured: 0, cached: 0, unavailable: 0, skipped: 0, rounds: 0 } };
  const rank = (n) => recommend(profile, catalog, { ...rankOpts, top: n, now });
  const canMeasure = !!(client && catalog.updatedAt);
  stats.momentum.fromCache = applyCachedMomentum(catalog, dataDir, { now });

  async function measure(names) {
    const todo = names.filter((n) => needsLookup(catalog, n));
    if (!canMeasure || !todo.length) return 0;
    try {
      const st = await measureShortlist(todo, catalog, { client, dataDir, log, now });
      for (const k of ['measured', 'cached', 'unavailable', 'skipped']) stats.momentum[k] += st[k];
      return st.measured + st.unavailable;
    } catch (e) { log(`momentum measurement skipped: ${e.message}`); return 0; }
  }

  // Measure the shortlist, re-rank, and repeat while the re-ranked top N has unmeasured repos.
  await measure(rank(Math.max(top, shortlist)).slice(0, Math.max(top, shortlist)).map((r) => r.name));
  for (let round = 0; round < ROUNDS; round++) {
    stats.momentum.rounds++;
    if (!(await measure(rank(top).map((r) => r.name)))) break;
  }

  // Rank more than we show: the content scan can still demote some, and the next ones backfill.
  const pool = rank(top + BACKFILL);
  let recs = pool.slice(0, top);
  if (client && pool.length) {
    recs = [];
    let i = 0, scanned = 0;
    stats.scan = { scanned: 0, cached: 0, skipped: 0, failed: 0, demoted: 0 };
    const maxScans = Math.max(top, shortlist) + BACKFILL;
    try {
      // Filter by trust tier AFTER the scan, so a repo with high-severity flags never shows without --include-low.
      while (recs.length < top && i < pool.length && scanned < maxScans) {
        const batch = pool.slice(i, i + Math.min(top - recs.length, maxScans - scanned));
        i += batch.length; scanned += batch.length;
        const st = await scanRecommendations(batch, catalog, { client, dataDir, log, now });
        for (const k of ['scanned', 'cached', 'skipped', 'failed']) stats.scan[k] += st[k];
        for (const r of batch) {
          if (!rankOpts.includeLow && r.trust.tier === 'low') { stats.scan.demoted++; log(`trust scan: dropped ${r.name} (high-severity flags)`); continue; }
          recs.push(r);
        }
      }
    } catch (e) { log(`trust scan skipped: ${e.message}`); }
    // Scan budget ran out: fill the rest with unscanned candidates.
    while (recs.length < top && i < pool.length) recs.push(pool[i++]);
    log(`trust scan: ${stats.scan.scanned} scanned, ${stats.scan.cached} cached, ${stats.scan.skipped} skipped, ${stats.scan.failed} failed, ${stats.scan.demoted} dropped`);
  }

  // Backfilled repos may not be measured yet: measure them and re-order with the new numbers.
  if (await measure(recs.map((r) => r.name))) recs = reorder(recs, rank(top + BACKFILL * 2));
  const m = stats.momentum;
  log(`momentum: ${m.measured} measured, ${m.fromCache} from cache, ${m.unavailable} unavailable, ${m.skipped} skipped (${m.rounds} re-rank rounds)`);
  stats.unmeasured = recs.filter((r) => !MEASURED.has(r.momentumSource)).length;
  // Thin matches left out of a short list (see recommend); the pool asked for more than `top`.
  recs.thinOmitted = Math.max(0, Math.min(pool.thinOmitted || 0, top - recs.length));
  return { recs, stats };
}

/** Keep the chosen set (and its scan results) but take momentum and order from a fresh ranking. */
function reorder(recs, fresh) {
  const pos = new Map(fresh.map((r, i) => [r.name, r]));
  const idx = new Map(fresh.map((r, i) => [r.name, i]));
  const keys = ['starsPerDay', 'momentumSource', 'starsLast7d', 'momentumComplete', 'score'];
  return recs.map((r) => (pos.has(r.name) ? { ...r, ...Object.fromEntries(keys.map((k) => [k, pos.get(r.name)[k]])) } : r))
    .sort((a, b) => (idx.get(a.name) ?? Infinity) - (idx.get(b.name) ?? Infinity));
}

// The networked part of a run: rank, measure momentum for the shortlist, re-rank, then
// scan the final candidates' content. Kept out of scout.mjs so it can be tested with a mock GitHub.

import { recommend } from './rank.mjs';
import { measureShortlist } from './momentum.mjs';
import { scanRecommendations } from './scan.mjs';

export const SHORTLIST = 25; // network work (momentum, trust scan) is limited to about this many candidates
const BACKFILL = 15; // extra ranked candidates kept in reserve for scan demotions

export async function runPipeline(profile, catalog, { top = 8, rankOpts = {}, client = null, dataDir = null, log = () => {}, now = Date.now(), shortlist = SHORTLIST } = {}) {
  const stats = {};
  if (client && catalog.updatedAt) {
    // Measure real 7-day momentum for the shortlist only, then re-rank with it.
    const first = recommend(profile, catalog, { ...rankOpts, top: Math.max(top, shortlist), now });
    try {
      stats.momentum = await measureShortlist(first.slice(0, shortlist).map((r) => r.name), catalog, { client, dataDir, log, now });
      log(`momentum: ${stats.momentum.measured} measured, ${stats.momentum.cached} cached, ${stats.momentum.unavailable} unavailable, ${stats.momentum.skipped} skipped`);
    } catch (e) { log(`momentum measurement skipped: ${e.message}`); }
  }
  // Rank more than we show: the content scan can still demote some, and the next ones backfill.
  const pool = recommend(profile, catalog, { ...rankOpts, top: top + BACKFILL, now });
  if (!client || !pool.length) return { recs: pool.slice(0, top), stats };
  const recs = [];
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
  // Scan budget ran out: fill the rest with unscanned candidates (trust.scanned stays unset).
  while (recs.length < top && i < pool.length) recs.push(pool[i++]);
  log(`trust scan: ${stats.scan.scanned} scanned, ${stats.scan.cached} cached, ${stats.scan.skipped} skipped, ${stats.scan.failed} failed, ${stats.scan.demoted} dropped`);
  return { recs, stats };
}

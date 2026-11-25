// `scout.mjs me --blind-spot`: the one tool for the topic of the animal's blind spot (BLIND_TOPICS in me.mjs).
//
// Matching is local and reuses the kickoff's pieces without changing them: the ranking (`recommend`,
// as if the history held only that topic plus the user's stack), the same "good enough" bar, the
// official marketplace and built-in features first. Privacy: nothing new leaves the machine. The
// official list is read from its cache (never fetched here), the catalog is the one on disk, and
// the only request is the existing content scan of the one matched repo, by name.

import { recommend } from './rank.mjs';
import { detectInstalled } from './profile.mjs';
import { dismissedSet } from './feedback.mjs';
import { OFFICIAL_REPO, OFFICIAL_MARKETPLACE, OFFICIAL_RULES, BUILTINS } from './kickoff-sources.mjs';
import { needProfile, goodEnough, flaggedHigh, heavySetup } from './kickoff.mjs';
import { EGG_SESSIONS } from './me.mjs';

/**
 * Official plugins and built-in features that serve a blind-spot topic, best first. A narrow list on
 * purpose: topics not listed (testing, docs, debugging, planning, git) are everyday work Claude does
 * directly, so they need a strong catalog match or nothing.
 */
export const BLIND_OFFICIAL = {
  security: ['security-guidance', '/security-review'],
  refactoring: ['/simplify'],
};

const clip = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const one = (s) => String(s).replace(/\s+/g, ' ').trim();

const result = (topic, fields, why) => {
  const line = fields.action === 'nothing' ? `Your blind spot (${topic}): nothing needed: Claude covers this directly`
    : `Your blind spot (${topic}): ${fields.name || fields.repo} (${one(why)})`;
  return { topic, ...fields, line };
};

/**
 * The single best tool for the blind-spot topic of `me` (a whoAmI result), or "nothing needed".
 * `scan(recs)` is the content scan of the matched repo (the CLI passes the scout's own, or null offline).
 */
export async function findBlindSpotTool(me, profile, catalog, { home, project = null, dataDir, now = Date.now(), platform = process.platform, official = null, scan = null } = {}) {
  const topic = me.blindTopic;
  if (!topic) return { topic: null, action: 'none', line: `No blind-spot tool yet: come back after ${EGG_SESSIONS} sessions.` };
  const installed = detectInstalled(home, project || home);
  const have = new Set(installed.names);

  // 1. Anthropic's official plugins and the built-in features.
  for (const name of BLIND_OFFICIAL[topic] || []) {
    const rule = [...OFFICIAL_RULES, ...BUILTINS].find((x) => x.name === name);
    if (!rule || have.has(name)) continue;
    if (name.startsWith('/')) {
      return result(topic, { action: 'builtin', name, next: null, check: null }, `built into Claude Code: ${rule.what}; you type it yourself`);
    }
    if (official && !official.has(name)) continue;
    return result(topic, { action: 'official-plugin', name, repo: OFFICIAL_REPO, trust: 'official', check: OFFICIAL_REPO,
      next: `install ${OFFICIAL_REPO} --part ${name} --plan`, command: `claude plugin install ${name}@${OFFICIAL_MARKETPLACE}` },
    `official plugin: ${rule.what}`);
  }

  // 2. The catalog, ranked as if the history held only this topic plus the stack.
  const exclude = dataDir ? dismissedSet(dataDir) : new Set();
  const need = { topic, lines: [], libraries: Object.keys(profile.stack || {}) };
  for (const r of recommend(needProfile(need, installed), catalog, { top: 3, exclude, now, platform })) {
    if (r.thinEvidence || !goodEnough(r, catalog.repos[r.name], topic)) continue;
    if (scan) await scan([r]);
    if (flaggedHigh(r) || heavySetup(r, '')) continue;
    return result(topic, { action: 'install', repo: r.name, name: r.name, kind: r.kind, trust: r.trust?.tier, check: r.name, next: `install ${r.name} --plan` },
      `${r.kind}, ★ ${r.stars}, built around ${topic}${r.stackEvidence?.length ? ' and fits your stack' : ''}`);
  }
  return result(topic, { action: 'nothing' });
}

export const formatBlindSpotTool = (res) => clip(res.line, 200);

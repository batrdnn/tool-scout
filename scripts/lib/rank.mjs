// Scores catalog repos against the user's profile and explains each pick.

import { topicsIn, repoTopicEvidence, toolAffinity } from './taxonomy.mjs';
import { momentum } from './crawl.mjs';
import { normName } from './profile.mjs';

/** Basic, metadata-only trust signals. Not a security review. */
export function trust(repo, now = Date.now()) {
  let score = 0;
  const notes = [];
  const pushedDays = (now - new Date(repo.pushedAt).getTime()) / 86400e3;
  const ageDays = (now - new Date(repo.createdAt).getTime()) / 86400e3;
  if (repo.archived) notes.push('archived');
  if (pushedDays <= 30) score += 30; else if (pushedDays <= 90) score += 20; else if (pushedDays <= 180) score += 10;
  else notes.push('no commits in 6+ months');
  if (repo.license) score += 15; else notes.push('no license');
  score += Math.min(25, Math.log10(Math.max(1, repo.stars)) * 7);
  score += Math.min(10, Math.log10(Math.max(1, repo.forks)) * 4);
  if (repo.ownerType === 'Organization') score += 10;
  if (ageDays >= 30) score += 10; else notes.push('less than 30 days old');
  if (repo.archived) score = Math.min(score, 20);
  score = Math.round(Math.min(100, score));
  const tier = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
  return { score, tier, notes };
}

export function installHint(repo) {
  switch (repo.kind) {
    case 'plugin': return `/plugin marketplace add ${repo.full_name}`;
    case 'skill': return `Copy the skill folder into ~/.claude/skills/ (see ${repo.url})`;
    case 'mcp-server': return `claude mcp add … (command in README: ${repo.url})`;
    default: return `See ${repo.url}`;
  }
}

function isInstalled(repo, installed) {
  if (installed.repos?.includes(repo.full_name.toLowerCase())) return true;
  const n = normName(repo.name);
  if (!n || n.length < 3) return false;
  return (installed.names || []).some((x) => normName(x) === n);
}

/**
 * @param profile from buildProfile
 * @param catalog from loadCatalog
 * @param opts { top, kinds, perTopicCap, includeLow }
 */
const DIVERSITY = 0.93;

export function recommend(profile, catalog, { top = 8, kinds = null, perTopicCap = Math.max(3, Math.ceil(top * 0.6)), includeLow = false, now = Date.now() } = {}) {
  const sessions = Math.max(1, profile.sessions);
  // Topic weight = share of sessions that touched it; friction boosts it.
  const weights = {};
  for (const [t, n] of Object.entries(profile.topics || {})) {
    const fr = profile.friction?.[t] || 0;
    weights[t] = (n / sessions) * (1 + Math.min(1, fr / Math.max(1, n)));
  }
  const maxW = Math.max(1e-9, ...Object.values(weights));
  const topLangs = Object.keys(profile.languages || {}).slice(0, 3);
  const coveredTopics = new Set();
  for (const name of profile.installed?.names || []) topicsIn(name.replace(/[-_]/g, ' ')).forEach((t) => coveredTopics.add(t));

  const candidates = [];
  for (const repo of Object.values(catalog.repos || {})) {
    if (repo.kind === 'list' || repo.archived) continue;
    if (kinds && !kinds.includes(repo.kind)) continue;
    if (isInstalled(repo, profile.installed || {})) continue;

    // Evidence is strongest when the name / first clause says it (what the repo *is*),
    // weaker for later incidental mentions and for search tags. See repoTopicEvidence.
    const ev = repoTopicEvidence(repo);
    const w = (t) => (weights[t] / maxW) * ev[t].strength * toolAffinity(t, ev[t].keywords, profile.toolKeywords);
    const matched = Object.keys(ev).filter((t) => weights[t]).sort((a, b) => w(b) - w(a));
    if (!matched.length) continue;

    // Best topic counts fully, extra topics add a little (avoids rewarding keyword-stuffed READMEs).
    let relevance = w(matched[0]) + matched.slice(1).reduce((s, t) => s + 0.15 * w(t), 0);
    if (repo.language && topLangs.includes(repo.language)) relevance += 0.1;
    if (coveredTopics.has(matched[0])) relevance *= 0.7;

    const m = momentum(repo, now);
    const tr = trust(repo, now);
    if (!includeLow && tr.tier === 'low') continue;
    candidates.push({ repo, matched, relevance, m, tr, ev });
  }

  const maxMom = Math.max(1, ...candidates.map((c) => c.m.perDay));
  const maxRel = Math.max(1e-9, ...candidates.map((c) => c.relevance));
  for (const c of candidates) {
    const mom = Math.log1p(c.m.perDay) / Math.log1p(maxMom);
    c.score = 0.6 * (c.relevance / maxRel) + 0.25 * mom + 0.15 * (c.tr.score / 100);
  }
  candidates.sort((a, b) => b.score - a.score);

  // Keep the list varied without starving users whose work is mostly one topic: each
  // further pick on the same primary topic is discounted (greedy re-rank), and only past
  // `perTopicCap` picks is a topic capped outright.
  const perTopic = {};
  const picks = [];
  const pool = [...candidates];
  while (picks.length < top && pool.length) {
    let bi = -1, best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const t = pool[i].matched[0];
      if ((perTopic[t] || 0) >= perTopicCap) continue;
      const s = pool[i].score * DIVERSITY ** (perTopic[t] || 0);
      if (s > best) { best = s; bi = i; }
    }
    if (bi < 0) break;
    const [c] = pool.splice(bi, 1);
    perTopic[c.matched[0]] = (perTopic[c.matched[0]] || 0) + 1;
    picks.push(c);
  }

  return picks.map((c) => ({
    name: c.repo.full_name,
    url: c.repo.url,
    kind: c.repo.kind,
    description: c.repo.description,
    stars: c.repo.stars,
    starsPerDay: Number(c.m.perDay.toFixed(1)),
    momentumSource: c.m.source,
    starsLast7d: c.m.starsInWindow ?? null,
    momentumComplete: c.m.complete,
    trust: c.tr,
    score: Number(c.score.toFixed(3)),
    matchedTopics: c.matched,
    evidence: c.matched.slice(0, 2).map((t) => ({
      topic: t,
      sessions: profile.topics[t],
      ofSessions: profile.sessions,
      friction: profile.friction?.[t] || 0,
    })),
    install: installHint(c.repo),
  }));
}

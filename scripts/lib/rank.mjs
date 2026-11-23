// Scores catalog repos against the user's profile and explains each pick.

import { topicsIn, repoTopicEvidence, toolAffinity, platformsOnly, osFamily, jobAnchors } from './taxonomy.mjs';
import { momentum, classify } from './crawl.mjs';
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

/** Fallback until the README gives a real Claude Code command: link to it, never guess one. */
export function installHint(repo) {
  return `See the README for install steps: ${repo.url || `https://github.com/${repo.full_name}`}#readme`;
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
const DEDUPE_TOP = 5; // at most one repo per job in this many picks

/**
 * Group candidates that do the same job: same kind, plus the same normalized name
 * ("playwright_mcp" ~ "playwright-mcp") or a shared job anchor and a shared topic.
 * Returns Map(candidate -> group id).
 */
function jobGroups(cands) {
  const parent = cands.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const info = cands.map((c) => ({ kind: c.kind, name: normName(c.repo.name), anchors: jobAnchors(c.repo), topics: new Set(c.matched) }));
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = info[i], b = info[j];
      if (a.kind !== b.kind) continue;
      const sameName = a.name.length >= 4 && a.name === b.name;
      const sameJob = [...a.anchors].some((x) => b.anchors.has(x)) && [...a.topics].some((t) => b.topics.has(t));
      if (sameName || sameJob) parent[find(i)] = find(j);
    }
  }
  return new Map(cands.map((c, i) => [c, find(i)]));
}

/** Official / original first: org-owned, then more stars, then older. */
const originality = (c) => [c.repo.ownerType === 'Organization' ? 1 : 0, c.repo.stars || 0, -Date.parse(c.repo.createdAt || 0)];
const moreOriginal = (a, b) => { const x = originality(a), y = originality(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
const OTHER_OS = 0.35; // relevance factor for a repo that only runs on another desktop OS

export function recommend(profile, catalog, { top = 8, kinds = null, perTopicCap = Math.max(3, Math.ceil(top * 0.6)), includeLow = false, exclude = null, now = Date.now(), platform = null } = {}) {
  const userOS = osFamily(platform); // process.platform, passed in by the caller; never sent anywhere
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
    // Classified now, not at crawl time, so a cached catalog follows the current rules.
    const kind = classify(repo);
    if (kind === 'list' || repo.archived) continue;
    // Standalone apps (chat UIs, editors) aren't agent extensions: only when asked for by kind.
    if (kinds ? !kinds.includes(kind) : kind === 'app') continue;
    if (isInstalled(repo, profile.installed || {})) continue;
    if (exclude?.has(repo.full_name.toLowerCase())) continue; // dismissed by the user

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
    const only = userOS ? platformsOnly(repo) : [];
    const otherOS = only.length > 0 && !only.includes(userOS);
    if (otherOS) relevance *= OTHER_OS;

    const m = momentum(repo, now);
    const tr = trust(repo, now);
    if (!includeLow && tr.tier === 'low') continue;
    candidates.push({ repo, kind, matched, relevance, m, tr, ev, platformOnly: otherOS ? only : undefined });
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
  // Near-duplicates: at most one per job in the first DEDUPE_TOP picks, and that one is the
  // official / original repo of its group (not the lookalike that happens to score higher).
  const group = jobGroups(candidates);
  const members = {};
  for (const c of candidates) (members[group.get(c)] ||= []).push(c);
  const usedGroups = new Set();
  const perTopic = {};
  const picks = [];
  const pool = [...candidates];
  // Thin evidence: a topic seen in a single session, without friction, can't carry a top-5 pick.
  const supported = (c) => c.matched.some((t) => (profile.topics?.[t] || 0) >= 2 || (profile.friction?.[t] || 0) >= 1);
  let thinOmitted = 0;
  while (picks.length < top && pool.length) {
    const dedupe = picks.length < DEDUPE_TOP;
    const needSupport = picks.length < DEDUPE_TOP;
    let bi = -1, best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const t = pool[i].matched[0];
      if ((perTopic[t] || 0) >= perTopicCap) continue;
      if (dedupe && usedGroups.has(group.get(pool[i]))) continue;
      if (needSupport && !supported(pool[i])) continue;
      const s = pool[i].score * DIVERSITY ** (perTopic[t] || 0);
      if (s > best) { best = s; bi = i; }
    }
    if (bi < 0) {
      // Fewer than 5 well-supported picks: leave the thin ones out rather than promote them.
      if (needSupport) thinOmitted = Math.min(top - picks.length, pool.filter((c) => !supported(c)).length);
      break;
    }
    const g = group.get(pool[bi]);
    if (!usedGroups.has(g)) {
      // The group's first pick is its most original member still in the pool.
      const orig = pool.filter((c) => group.get(c) === g).reduce((a, b) => (moreOriginal(b, a) ? b : a));
      bi = pool.indexOf(orig);
    }
    usedGroups.add(g);
    const [c] = pool.splice(bi, 1);
    perTopic[c.matched[0]] = (perTopic[c.matched[0]] || 0) + 1;
    picks.push(c);
  }

  const out = picks.map((c) => ({
    name: c.repo.full_name,
    url: c.repo.url,
    kind: c.kind,
    description: c.repo.description,
    stars: c.repo.stars,
    starsPerDay: Number(c.m.perDay.toFixed(1)),
    momentumSource: c.m.source,
    starsLast7d: c.m.starsInWindow ?? null,
    momentumComplete: c.m.complete,
    trust: c.tr,
    score: Number(c.score.toFixed(3)),
    matchedTopics: c.matched,
    // Other candidates that do the same job (near-duplicates), most original first.
    ...((members[group.get(c)] || []).length > 1 ? { similar: members[group.get(c)].filter((x) => x !== c).sort((a, b) => (moreOriginal(a, b) ? -1 : 1)).map((x) => x.repo.full_name) } : {}),
    ...(c.platformOnly ? { platformOnly: c.platformOnly } : {}),
    evidence: c.matched.slice(0, 2).map((t) => ({
      topic: t,
      sessions: profile.topics[t],
      ofSessions: profile.sessions,
      friction: profile.friction?.[t] || 0,
    })),
    install: installHint({ ...c.repo, kind: c.kind }),
    installSource: 'readme-link', // replaced by the README's Claude Code command after the content scan
    ...(supported(c) ? {} : { thinEvidence: true }), // rests on a topic from a single session
  }));
  out.thinOmitted = thinOmitted;
  return out;
}

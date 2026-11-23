// Crawls GitHub for Claude Code skills, plugins and MCP servers.
// Queries are fixed topic searches: nothing about the user is ever sent.
// Each crawl snapshots star counts so momentum (stars/day) can be measured over time.

import fs from 'node:fs';
import path from 'node:path';
import { githubToken, createClient, sleep } from './github.mjs';

export { githubToken };

const TOPIC_QUERIES = [
  'topic:mcp-server', 'topic:mcp', 'topic:model-context-protocol',
  'topic:claude-code', 'topic:claude-code-plugin', 'topic:claude-skills',
  'topic:agent-skills', 'topic:claude-skill', 'topic:claude-code-skills',
];

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const daysAgo = (n) => day(new Date(Date.now() - n * 86400e3));

// Kind signals in text. Each finds where the repo calls itself that kind of thing.
const KIND_TEXT = [
  ['plugin', /\bplugin marketplace\b|\bclaude[ -]code plugins?\b|\bplugins? for claude[ -]code\b|\bclaude plugins?\b/i],
  ['mcp-server', /\bmcp[ -]servers?\b|\bmodel context protocol(?: \(mcp\))? servers?\b|\bmcp\b(?! (?:clients?|hosts?|support|integration|tools? support))/i],
  ['skill', /\bskills?\b|\bskill\.md\b/i], // only in an agent context, see classify
];
const AGENT_CONTEXT = /\b(?:claude|agents?|agentic|codex|skill\.md|llms?|ai)\b/i;
// A standalone application rather than something you add to an agent. Strong phrases count
// anywhere in the description; weak ones only where the repo says what it is (the head).
const APP_STRONG = /\b(?:chatgpt[ -]clone|web ?ui for|webui|desktop app(?:lication)?|(?:open[- ]source |self-hosted |free )?alternative to|diagram editor|ai (?:chat )?interface)\b/i;
const APP_HEAD = /\b(?:(?:a|an|the) (?:\w+ ){0,2}web app(?:lication)?|(?:online|visual|browser-based) [\w ]{0,30}?(?:editor|designer|builder)|chat (?:ui|client|app)|note-taking app)\b/i;
const FOR_AGENT = /\bfor claude[ -]code\b|\bclaude[ -]code (?:plugin|extension|hook|statusline|add-?on)\b/i;

/** First clause of a description, cut at the first ":", ".", "|" or dash: what the repo says it is. */
const headOf = (d) => String(d || '').split(/:\s|[.!?](?:\s|$)|\s[—–-]{1,2}\s|\s\|\s/)[0];

/** Kind named earliest in `text`, or null. */
function kindIn(text, agentContext) {
  let best = null, at = Infinity;
  for (const [kind, re] of KIND_TEXT) {
    if (kind === 'skill' && !agentContext) continue; // "skills" alone is a résumé word
    const m = re.exec(text);
    if (m && m.index < at) { best = kind; at = m.index; }
  }
  return best;
}

/**
 * skill | plugin | mcp-server | tool | app | list. The repo's own words decide first (the
 * head of the description, then the name, then the rest); search tags only break a silence,
 * since repos tag themselves with every ecosystem they touch.
 */
export function classify(repo) {
  const t = new Set(repo.topics || []);
  const name = String(repo.name || '');
  const desc = String(repo.description || '');
  if (/^awesome|awesome-/.test(name.toLowerCase()) || t.has('awesome') || t.has('awesome-list')) return 'list';
  const head = headOf(desc);
  const nameText = name.replace(/[-_.]+/g, ' ');
  const ctx = AGENT_CONTEXT.test(`${nameText} ${desc}`);
  const own = kindIn(head, ctx) || kindIn(nameText, ctx);
  if (own) return own;
  const forAgent = FOR_AGENT.test(`${nameText} ${desc}`);
  if (!forAgent && (APP_STRONG.test(head) || APP_HEAD.test(head))) return 'app'; // "ChatGPT clone: features MCP, skills, …" is still the app
  const later = kindIn(desc, ctx);
  if (later) return later;
  if (!forAgent && APP_STRONG.test(`${nameText} ${desc}`)) return 'app';
  if (t.has('claude-code-plugin')) return 'plugin';
  if ([...t].some((x) => /skill/.test(x))) return 'skill';
  if (t.has('mcp') || t.has('mcp-server') || t.has('model-context-protocol')) return 'mcp-server';
  return 'tool';
}

export function slim(r) {
  return {
    full_name: r.full_name,
    name: r.name,
    owner: r.owner?.login,
    ownerType: r.owner?.type,
    url: r.html_url,
    description: (r.description || '').slice(0, 300),
    topics: r.topics || [],
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
    archived: !!r.archived,
    fork: !!r.fork,
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
  };
}

async function search(client, q, page = 1) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`;
  const res = await client.request(url);
  if (res.data) {
    // The search quota is 10–30/min; pause on the last call instead of failing the next one.
    if (client.state.remaining === 0 && client.state.resetAt) await sleep(Math.min(Math.max(client.state.resetAt - Date.now(), 0) + 1000, 65000));
    return res.data.items || [];
  }
  if (res.status === 422) return []; // past the 1000-result window
  throw new Error(`GitHub search failed (${res.status}) for ${q}`);
}

export function loadCatalog(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'catalog.json'), 'utf8')); }
  catch { return { updatedAt: null, repos: {} }; }
}
export function saveCatalog(dataDir, cat) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(cat));
}

/** Merge fresh search results into the catalog, keeping one star snapshot per day. */
export function mergeRepos(cat, items, today = day()) {
  for (const r of items) {
    if (!r?.full_name || r.fork) continue;
    const s = slim(r);
    const prev = cat.repos[s.full_name];
    const history = (prev?.history || []).filter(([d]) => d !== today);
    history.push([today, s.stars]);
    history.sort((a, b) => a[0].localeCompare(b[0]));
    cat.repos[s.full_name] = { ...s, kind: classify(s), history: history.slice(-90), lastSeen: today };
  }
  return cat;
}

/**
 * Stars per day, best source first:
 *   'stargazers' / 'events'  stars actually given in the last 7 days (shortlist only, see momentum.mjs)
 *   'measured'               difference between our own daily snapshots
 *   'estimated'              lifetime average (stars / age)
 */
export function momentum(repo, now = Date.now()) {
  const sv = repo.starVelocity;
  if (sv && !sv.unavailable && !sv.blocked && now - Date.parse(sv.fetchedAt) < 3 * 86400e3) {
    const out = { perDay: sv.perDay, source: sv.method || 'stargazers', days: sv.days, starsInWindow: sv.stars, complete: sv.complete };
    // A partial window (+N+★) means at least N stars in the period, not a rate to extrapolate:
    // rank it at N/days, or at the unmeasured estimate if that is higher.
    if (sv.complete === false) out.perDay = Math.max(sv.stars / (sv.days || 7), unmeasured(repo, now).perDay);
    return out;
  }
  return unmeasured(repo, now);
}

function unmeasured(repo, now) {
  const h = repo.history || [];
  if (h.length >= 2) {
    const [lastD, lastS] = h[h.length - 1];
    const target = new Date(new Date(lastD).getTime() - 7 * 86400e3).toISOString().slice(0, 10);
    let base = h[0];
    for (const e of h) if (e[0] <= target) base = e; // newest snapshot at least ~7 days back, else oldest
    const days = (new Date(lastD) - new Date(base[0])) / 86400e3;
    if (days >= 1) return { perDay: Math.max(0, (lastS - base[1]) / days), source: 'measured', days: Math.round(days) };
  }
  const ageDays = Math.max(1, (now - new Date(repo.createdAt).getTime()) / 86400e3);
  // Lifetime average undervalues fresh surges; young repos are closer to their real pace.
  return { perDay: repo.stars / ageDays, source: 'estimated', days: Math.round(ageDays) };
}

export async function crawl({ dataDir, maxPages = 1, log = () => {}, queries, fetchImpl } = {}) {
  const client = createClient({ token: githubToken(), log, fetchImpl });
  const authed = () => !!client.state.token;
  const cat = loadCatalog(dataDir);
  const pushedSince = daysAgo(180);
  const createdSince = daysAgo(45);
  const qs = queries || TOPIC_QUERIES.flatMap((t) => [
    `${t} pushed:>${pushedSince} archived:false`, // established + still alive
    `${t} created:>${createdSince}`, // new and rising
  ]);
  log(`crawling ${qs.length} queries${authed() ? ' (authenticated)' : ' (unauthenticated: slower, 10 searches/min)'}`);
  let total = 0;
  for (const q of qs) {
    for (let page = 1; page <= maxPages; page++) {
      const items = await search(client, q, page);
      mergeRepos(cat, items);
      total += items.length;
      if (items.length < 100) break;
      if (!authed()) await sleep(6500);
    }
    if (!authed()) await sleep(6500);
  }
  cat.updatedAt = new Date().toISOString();
  saveCatalog(dataDir, cat);
  log(`fetched ${total} results; catalog now has ${Object.keys(cat.repos).length} repos`);
  return cat;
}

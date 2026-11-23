// Crawls GitHub for Claude Code skills, plugins and MCP servers.
// Queries are fixed topic searches: nothing about the user is ever sent.
// Each crawl snapshots star counts so momentum (stars/day) can be measured over time.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOPIC_QUERIES = [
  'topic:mcp-server', 'topic:mcp', 'topic:model-context-protocol',
  'topic:claude-code', 'topic:claude-code-plugin', 'topic:claude-skills',
  'topic:agent-skills', 'topic:claude-skill', 'topic:claude-code-skills',
];

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const daysAgo = (n) => day(new Date(Date.now() - n * 86400e3));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim() || null;
  } catch { return null; }
}

export function classify(repo) {
  const t = new Set(repo.topics || []);
  const n = `${repo.name} ${repo.description || ''}`.toLowerCase();
  if (/^awesome|awesome-/.test(repo.name.toLowerCase()) || t.has('awesome') || t.has('awesome-list')) return 'list';
  if (t.has('claude-code-plugin') || /\bplugin marketplace\b|\bclaude code plugin/.test(n)) return 'plugin';
  if ([...t].some((x) => /skill/.test(x)) || /\bskills?\b/.test(n) && /claude|agent/.test(n)) return 'skill';
  if (t.has('mcp') || t.has('mcp-server') || t.has('model-context-protocol') || /\bmcp\b/.test(n)) return 'mcp-server';
  return 'tool';
}

function slim(r) {
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

async function search(q, { token, page = 1, log }) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'tool-scout', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try { res = await fetch(url, { headers }); } catch (e) {
      throw new Error(`could not reach GitHub (${e.cause?.code || e.message}). Behind a proxy? Try NODE_USE_ENV_PROXY=1`);
    }
    if (res.ok) {
      const remaining = Number(res.headers.get('x-ratelimit-remaining'));
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      if (remaining === 0 && reset) await sleep(Math.min(Math.max(reset - Date.now(), 0) + 1000, 65000));
      return (await res.json()).items || [];
    }
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const wait = Math.min(Math.max((reset || Date.now() + 60000) - Date.now(), 1000) + 1000, 65000);
      log?.(`rate limited; waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (res.status === 401 && headers.Authorization) {
      log?.('GitHub token was rejected; continuing without it');
      delete headers.Authorization;
      search.tokenRejected = true;
      continue;
    }
    if (res.status === 422) return []; // past the 1000-result window
    throw new Error(`GitHub search failed (${res.status}) for ${q}`);
  }
  return [];
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

/** Stars per day: measured from snapshots when possible, otherwise estimated. */
export function momentum(repo, now = Date.now()) {
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

export async function crawl({ dataDir, maxPages = 1, log = () => {}, queries } = {}) {
  let token = githubToken();
  const cat = loadCatalog(dataDir);
  const pushedSince = daysAgo(180);
  const createdSince = daysAgo(45);
  const qs = queries || TOPIC_QUERIES.flatMap((t) => [
    `${t} pushed:>${pushedSince} archived:false`, // established + still alive
    `${t} created:>${createdSince}`, // new and rising
  ]);
  log(`crawling ${qs.length} queries${token ? ' (authenticated)' : ' (unauthenticated: slower, 10 searches/min)'}`);
  let total = 0;
  for (const q of qs) {
    for (let page = 1; page <= maxPages; page++) {
      if (search.tokenRejected) token = null;
      const items = await search(q, { token, page, log });
      mergeRepos(cat, items);
      total += items.length;
      if (items.length < 100) break;
      if (!token) await sleep(6500);
    }
    if (!token) await sleep(6500);
  }
  cat.updatedAt = new Date().toISOString();
  saveCatalog(dataDir, cat);
  log(`fetched ${total} results; catalog now has ${Object.keys(cat.repos).length} repos`);
  return cat;
}

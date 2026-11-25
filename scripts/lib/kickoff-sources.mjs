// Kickoff candidates beyond the trending catalog: Anthropic's official marketplace
// (anthropics/claude-plugins-official) and a short list of built-in Claude Code features.
// Both are preferred over trending repos for the same need.
//
// Privacy: the only request is for the marketplace file by its fixed repo name and path. Nothing
// from the plan goes into it, and the cache (kickoff/official.json) holds only plugin names.

import fs from 'node:fs';
import path from 'node:path';

export const OFFICIAL_REPO = 'anthropics/claude-plugins-official';
export const OFFICIAL_MARKETPLACE = 'claude-plugins-official';
const MARKETPLACE_URL = `https://api.github.com/repos/${OFFICIAL_REPO}/contents/.claude-plugin/marketplace.json`;
const TTL_DAYS = 7;

const GITHUB_WORK = /\bgithub\b[^.]{0,80}\b(?:issues?|pull requests?|PRs?)\b|\b(?:issues?|pull requests?)\b[^.]{0,80}\bgithub\b|\btriage\b/i;
const SECURITY = /\bsecurity\b|\bvulnerab|\bthreat model/i;
const CODE_REVIEW = /\b(?:code|security|install|build|branch|pull request)\b[^.]{0,60}\breview\b|\breview\b[^.]{0,60}\b(?:code|branch|pull request)\b/i;

/** Official plugins we know how to match to a need: the topic they serve and the plan wording that calls for them. */
export const OFFICIAL_RULES = [
  { name: 'github', topics: ['git'], when: GITHUB_WORK, what: 'the official GitHub MCP server as a plugin: issues, pull requests and labels from Claude Code' },
  { name: 'security-guidance', topics: ['security'], when: SECURITY, what: 'Anthropic\'s security review for Claude-written code: warnings on risky edits' },
  { name: 'code-review', topics: ['git', 'refactoring'], when: /\bpull requests?\b[^.]{0,60}\breview|\breview\b[^.]{0,60}\bpull requests?\b/i, what: 'Anthropic\'s multi-agent review of pull requests' },
];

/** Built-in Claude Code features: nothing to install, the user types them. */
export const BUILTINS = [
  { name: '/ultrareview', topics: ['security', 'git'], when: CODE_REVIEW, what: 'a deep multi-agent review of your branch in the cloud', note: 'it is billed, so it runs only when you start it' },
  { name: '/security-review', topics: ['security'], when: SECURITY, what: 'a security review of the pending changes on your branch', note: 'it runs in this session' },
  { name: '/simplify', topics: ['refactoring'], when: /\brefactor|\bsimplif|\bclean ?up\b/i, what: 'a review of the changed code for reuse and simplification, with fixes applied', note: 'it runs in this session' },
];

const cachePath = (dataDir) => path.join(dataDir, 'kickoff', 'official.json');

/** The plugin names in the official marketplace: fetched (and cached a week), else the cache, else null (use the known list). */
export async function loadOfficial({ client = null, dataDir, now = Date.now(), log = () => {} } = {}) {
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(cachePath(dataDir), 'utf8')); } catch { /* none */ }
  const fresh = cached && now - Date.parse(cached.fetchedAt) < TTL_DAYS * 86400e3;
  if (fresh || !client) return cached ? new Set(cached.plugins) : null;
  try {
    const res = await client.request(MARKETPLACE_URL, { accept: 'application/vnd.github.raw+json', raw: true });
    const plugins = (JSON.parse(res.data || 'null')?.plugins || []).map((p) => String(p?.name || '')).filter(Boolean);
    if (res.status !== 200 || !plugins.length) throw new Error(`status ${res.status}`);
    fs.mkdirSync(path.dirname(cachePath(dataDir)), { recursive: true });
    fs.writeFileSync(cachePath(dataDir), JSON.stringify({ fetchedAt: new Date(now).toISOString(), plugins }));
    return new Set(plugins);
  } catch (e) {
    log(`official marketplace not fetched: ${e.message}`);
    return cached ? new Set(cached.plugins) : null;
  }
}

/**
 * The first official plugin or built-in feature that serves this need, or null. A plugin must be in
 * the marketplace (when we have its list) and not installed; built-ins always count.
 */
export function pickCandidate(need, { official = null, installed = new Set(), used = new Set() } = {}) {
  const text = need.lines.join('\n');
  for (const r of OFFICIAL_RULES) {
    if (!r.topics.includes(need.topic) || !r.when.test(text) || used.has(r.name) || installed.has(r.name)) continue;
    if (official && !official.has(r.name)) continue;
    return { type: 'official-plugin', ...r };
  }
  for (const b of BUILTINS) {
    if (!b.topics.includes(need.topic) || !b.when.test(text) || used.has(b.name)) continue;
    return { type: 'builtin', ...b };
  }
  return null;
}

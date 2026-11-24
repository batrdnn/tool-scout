// Minimal GitHub REST client shared by crawl, momentum and trust scan.
// Only public repo names and fixed topic queries ever go into a URL.

import { execFileSync } from 'node:child_process';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RateLimitError extends Error {
  constructor(resetAt) { super(`GitHub rate limit reached (resets ${new Date(resetAt).toISOString().slice(11, 16)} UTC)`); this.resetAt = resetAt; }
}

export function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim() || null;
  } catch { return null; }
}

/**
 * One client per run. Tracks the remaining quota so callers can stop early instead of
 * burning the user's whole hourly budget.
 */
export function createClient({ token = null, fetchImpl = globalThis.fetch, log = () => {}, maxWaitMs = 65000 } = {}) {
  const state = { token, remaining: null, resetAt: null, requests: 0, tokenRejected: false };

  async function request(url, { accept = 'application/vnd.github+json', raw = false } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const headers = { Accept: accept, 'User-Agent': 'tool-scout', 'X-GitHub-Api-Version': '2022-11-28' };
      if (state.token) headers.Authorization = `Bearer ${state.token}`;
      let res;
      try { res = await fetchImpl(url, { headers }); } catch (e) {
        throw new Error(`could not reach GitHub (${e.cause?.code || e.message}). Tool Scout needs internet access to api.github.com; behind a proxy, run it with NODE_USE_ENV_PROXY=1`);
      }
      state.requests++;
      const rem = res.headers?.get?.('x-ratelimit-remaining');
      const reset = Number(res.headers?.get?.('x-ratelimit-reset')) * 1000;
      if (rem != null && rem !== '') state.remaining = Number(rem);
      if (reset) state.resetAt = reset;

      if (res.ok) {
        const body = raw ? await res.text() : await res.json();
        return { status: res.status, data: body, headers: res.headers };
      }
      if (res.status === 401 && state.token) {
        log('GitHub token was rejected; continuing without it');
        state.token = null;
        state.tokenRejected = true;
        continue;
      }
      if (res.status === 403 || res.status === 429) {
        const retryAfter = Number(res.headers?.get?.('retry-after')) * 1000;
        const wait = retryAfter || Math.max((reset || Date.now() + 60000) - Date.now(), 1000) + 1000;
        if (wait > maxWaitMs) throw new RateLimitError(reset || Date.now() + wait);
        log(`rate limited; waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      return { status: res.status, data: null, headers: res.headers };
    }
    return { status: 0, data: null, headers: null };
  }

  /** True while at least `reserve` requests are left (unknown counts as true). */
  const hasBudget = (reserve = 10) => state.remaining == null || state.remaining > reserve;

  return { request, hasBudget, state };
}

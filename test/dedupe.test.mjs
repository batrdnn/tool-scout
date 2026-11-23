import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobAnchors } from '../scripts/lib/taxonomy.mjs';
import { recommend } from '../scripts/lib/rank.mjs';
import { mergeRepos } from '../scripts/lib/crawl.mjs';

const gh = (full, description, o = {}) => {
  const [owner, name] = full.split('/');
  return { full_name: full, name, owner: { login: owner, type: o.org ? 'Organization' : 'User' }, html_url: `https://github.com/${full}`, description,
    topics: o.topics || ['mcp-server'], language: 'TypeScript', stargazers_count: o.stars ?? 1000, forks_count: 50, license: { spdx_id: 'MIT' },
    archived: false, fork: false, created_at: o.created || '2025-06-01T00:00:00Z', pushed_at: new Date().toISOString() };
};
const profile = { sessions: 10, topics: { testing: 8, browser: 6, database: 5, git: 4 }, friction: { testing: 2 }, languages: {}, installed: { names: [], repos: [] } };

test('jobAnchors: browser drivers are one family; generic words are not anchors', () => {
  assert.deepEqual([...jobAnchors({ name: 'playwright-mcp', description: 'Playwright MCP server' })], ['browser-automation']);
  assert.deepEqual([...jobAnchors({ name: 'turbo-browser-mcp', description: 'Fast browser automation MCP server for e2e testing' })], ['browser-automation']);
  assert.deepEqual([...jobAnchors({ name: 'prisma-skill', description: 'Prisma schema helper skill' })], ['prisma']);
  assert.deepEqual([...jobAnchors({ name: 'test-helper', description: 'Testing helper for agents' })], []);
});

test('at most one repo per job in the top 5, and it is the official / original one', () => {
  const cat = { repos: {} };
  mergeRepos(cat, [
    gh('microsoft/playwright-mcp', 'Playwright MCP server', { org: true, stars: 40000, created: '2025-03-01T00:00:00Z' }),
    gh('someone/playwright_mcp', 'Playwright MCP server with stealth mode for e2e testing and browser automation', { stars: 900, created: '2026-10-01T00:00:00Z' }),
    gh('other/turbo-browser-mcp', 'Fast browser automation MCP server for e2e testing with Playwright', { stars: 600, created: '2026-11-01T00:00:00Z' }),
    gh('acme/db-mcp', 'Postgres database MCP server', { org: true }),
    gh('acme/pr-review-skill', 'Claude skill for git code review of pull requests', { topics: ['claude-skills'] }),
    gh('acme/vitest-mcp', 'MCP server that runs vitest unit test suites and reports coverage', { org: true }),
  ]);
  // Make a lookalike score highest on its own: much faster momentum.
  cat.repos['someone/playwright_mcp'].starVelocity = { stars: 2000, days: 7, perDay: 285, complete: true, method: 'events', fetchedAt: new Date().toISOString() };
  const recs = recommend(profile, cat, { top: 6 });
  const top5 = recs.slice(0, 5).map((r) => r.name);
  const browser = top5.filter((n) => /playwright|browser/.test(n));
  assert.deepEqual(browser, ['microsoft/playwright-mcp'], top5.join(', '));
  const ms = recs.find((r) => r.name === 'microsoft/playwright-mcp');
  assert.ok(ms.similar.includes('someone/playwright_mcp') && ms.similar.includes('other/turbo-browser-mcp'));
});

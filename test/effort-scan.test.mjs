// Effort rides on the content scan: same fetch, same cache, final picks only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from '../scripts/lib/pipeline.mjs';
import { createClient } from '../scripts/lib/github.mjs';
import { mockFetch } from './helpers.mjs';
import { NOW, profile, ghRepo, catalogOf } from './pipeline.test.mjs';

/** Mock GitHub serving per-repo trees with real sizes, and file contents. */
export function githubTrees(repos) {
  return mockFetch((url) => {
    const m = url.match(/repos\/o\/([^/]+)\/(.*)$/);
    if (!m) return undefined;
    const [, name, rest] = m;
    const r = repos[name];
    if (!r) return undefined;
    if (rest === 'readme') return r.readme ?? `# ${name}`;
    if (rest.startsWith('git/trees/')) return { tree: Object.entries(r.tree).map(([p, size]) => ({ path: p, type: 'blob', size })) };
    if (rest.startsWith('contents/')) return r.files?.[decodeURIComponent(rest.slice(9))];
    if (rest.startsWith('events')) return [];
    return undefined;
  });
}

const REPOS = {
  'a-test-mcp': { tree: { 'package.json': 300, 'src/index.ts': 7000 }, files: { 'package.json': JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '1', zod: '3' } }) }, readme: 'Set ACME_API_KEY.' },
  'b-test-mcp': { tree: { 'skills/b/SKILL.md': 3000 } },
  'c-test-mcp': { tree: { 'src/big.ts': 400000 } },
};
const cat = () => catalogOf([ghRepo('a-test-mcp', 'Testing MCP server a', { stars: 9000 }), ghRepo('b-test-mcp', 'Testing MCP server b', { stars: 8000 }), ghRepo('c-test-mcp', 'Testing MCP server c', { stars: 100 })]);

test('final picks get effort from the scan; other repos get no requests at all', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-effort-'));
  const fetchImpl = githubTrees(REPOS);
  const { recs } = await runPipeline(profile(), cat(), { top: 2, client: createClient({ fetchImpl }), dataDir, now: NOW });
  assert.deepEqual(recs.map((r) => r.name), ['o/a-test-mcp', 'o/b-test-mcp']);
  const a = recs[0].effort, b = recs[1].effort;
  assert.equal(a.type, 'mcp-server');
  assert.equal(a.dependencies, 2);
  assert.deepEqual(a.needs.credentials, ['ACME_API_KEY']);
  assert.equal(a.advice, 'either');
  assert.equal(b.type, 'instructions');
  assert.equal(b.advice, 'build');
  const urls = fetchImpl.calls.map((c) => c.url);
  assert.equal(urls.filter((u) => u.includes('git/trees')).length, 2, 'one tree request per final pick');
  assert.ok(!urls.some((u) => u.includes('c-test-mcp') && !u.includes('/events') && !u.includes('/stargazers')), 'no scan or effort requests for a repo outside the picks');
  assert.ok(urls.some((u) => u.endsWith('a-test-mcp/contents/package.json')));
});

test('a second run reuses the cache: no tree or file requests, same effort', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-effort-'));
  const first = await runPipeline(profile(), cat(), { top: 2, client: createClient({ fetchImpl: githubTrees(REPOS) }), dataDir, now: NOW });
  const fetchImpl = githubTrees(REPOS);
  const second = await runPipeline(profile(), cat(), { top: 2, client: createClient({ fetchImpl }), dataDir, now: NOW });
  assert.equal(fetchImpl.calls.filter((c) => /git\/trees|\/contents\/|\/readme$/.test(c.url)).length, 0);
  assert.deepEqual(second.recs.map((r) => r.effort), first.recs.map((r) => r.effort));
  const cache = JSON.parse(fs.readFileSync(path.join(dataDir, 'trust-cache.json'), 'utf8'));
  assert.ok(cache['o/a-test-mcp'].effortFacts, 'facts cached with the scan');
  assert.equal(cache['o/a-test-mcp'].effortFacts.advice, undefined, 'advice is computed when read, not cached');
});

test('without a client (offline) there is no effort, and nothing breaks', async () => {
  const { recs } = await runPipeline(profile(), cat(), { top: 2, client: null, now: NOW });
  assert.ok(recs.length && recs.every((r) => r.effort === undefined));
});

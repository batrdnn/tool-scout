// Preloaded with `node --import` in the privacy test: replaces fetch with a mock GitHub / npm and
// appends every request (URL, method, headers, body) as one JSON line to $SCOUT_CAPTURE. Nothing
// leaves the machine: any host not mocked here gets a 404.
import fs from 'node:fs';
import { github, SKILL_MD } from '../../security-helpers.mjs';

const REPOS = {
  'pytest-helper': { readme: '# pytest helper\nWrites pytest fixtures.', topics: ['claude-skills', 'pytest'], description: 'Claude Code skill for pytest fixtures and tests', files: { 'SKILL.md': SKILL_MD('pytest-helper') } },
  'thing-mcp': { readme: '# Thing MCP\n```\nclaude mcp add thing -e THING_KEY=abc -- npx -y thing-mcp\n```', topics: ['mcp-server'], description: 'MCP server for things', files: { 'index.js': 'export {}\n' } },
};
const gh = github(REPOS);
const meta = (n) => ({ full_name: `o/${n}`, name: n, owner: { login: 'o', type: 'Organization' }, html_url: `https://github.com/o/${n}`, description: REPOS[n].description, topics: REPOS[n].topics, language: 'Python', stargazers_count: 900, forks_count: 30, license: { spdx_id: 'MIT' }, archived: false, fork: false, created_at: '2025-01-01T00:00:00Z', pushed_at: '2026-11-20T00:00:00Z', default_branch: 'main' });
const reply = (body, status = body === undefined ? 404 : 200) => new Response(body === undefined ? 'not found' : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } });

globalThis.fetch = async (input, init = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
  fs.appendFileSync(process.env.SCOUT_CAPTURE, `${JSON.stringify({ url, method: init.method || 'GET', headers, body: init.body == null ? null : String(init.body) })}\n`);
  const u = new URL(url);
  if (u.hostname === 'registry.npmjs.org') return reply({ version: '1.0.0' });
  if (u.hostname !== 'api.github.com') return reply(undefined);
  if (u.pathname === '/search/repositories') return reply({ total_count: 2, items: Object.keys(REPOS).map(meta) });
  if (/\/(stargazers|events)$/.test(u.pathname)) return reply([]);
  const r = await gh(url, { headers });
  const body = r.status === 404 ? undefined : await r.text();
  return reply(body, r.status);
};

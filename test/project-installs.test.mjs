import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildProfile } from '../scripts/lib/profile.mjs';
import { recommend } from '../scripts/lib/rank.mjs';
import { sessionProjectDirs, detectProjectInstalls, withProjectInstalls } from '../scripts/lib/installed.mjs';
import { fileURLToPath } from 'node:url';

const w = (f, body) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body)); };
const user = (text, cwd) => ({ type: 'user', cwd, message: { role: 'user', content: text } });
const tool = (name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } });

/** A home whose only graphify install is inside one project folder (session cwd). */
function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-pi-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-pi-proj-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-pi-other-'));
  const sessions = path.join(home, '.claude', 'projects', '-p');
  const lines = (cwd) => [user('build a knowledge graph of this codebase', cwd), tool('Bash', { command: 'git log' }), tool('Edit', { file_path: `${cwd}/graph.py` })]
    .map((l) => JSON.stringify(l)).join('\n');
  for (let i = 0; i < 3; i++) w(path.join(sessions, `s${i}.jsonl`), lines(proj));
  w(path.join(sessions, 'o.jsonl'), lines(other));
  w(path.join(proj, '.claude', 'skills', 'graphify', 'SKILL.md'), '---\nname: graphify\n---\nBuild a graph.\n');
  w(path.join(proj, '.claude', 'settings.json'), { enabledPlugins: { 'code-graph@graph-market': true, 'off-plugin@m': false } });
  w(path.join(proj, '.mcp.json'), { mcpServers: { kg: { command: 'npx', args: ['-y', 'knowledge-graph-mcp'] }, remote: { url: 'https://github.com/acme/graph-server' } } });
  return { home, proj, other };
}

const repo = (owner, name, description) => ({
  full_name: `${owner}/${name}`, name, owner, ownerType: 'User', url: `https://github.com/${owner}/${name}`, kind: 'skill',
  description, topics: ['claude-skills', 'knowledge-graph'], language: 'Python', stars: 5000, forks: 300, openIssues: 3,
  license: 'MIT', archived: false, fork: false, createdAt: '2026-01-01T00:00:00Z', pushedAt: new Date().toISOString(),
});

test('session cwds are the project folders, once each', () => {
  const { home, proj, other } = fakeHome();
  assert.deepEqual(sessionProjectDirs(home, 30).sort(), [proj, other].sort());
});

test('reads .claude/skills, enabledPlugins (enabled only) and .mcp.json in each project', () => {
  const { proj, other } = fakeHome();
  const r = detectProjectInstalls([proj, other, path.join(proj, 'missing')]);
  assert.deepEqual(r.names, ['code-graph', 'graph-market', 'graphify', 'kg', 'knowledge-graph-mcp', 'remote']);
  assert.deepEqual(r.repos, ['acme/graph-server']);
});

test('a skill installed only at project level (graphify) counts as installed and is not recommended', () => {
  const { home, proj } = fakeHome();
  const base = buildProfile({ home, days: 30, cwd: home });
  assert.ok(!base.installed.names.includes('graphify'), 'precondition: user-level detection misses it');
  const p = withProjectInstalls(base, { home, days: 30 });
  assert.ok(p.installed.names.includes('graphify'));
  assert.ok(p.installed.repos.includes('acme/graph-server'));
  const catalog = { repos: Object.fromEntries([
    repo('safishamsi', 'graphify', 'Claude Code skill: turn any codebase into a knowledge graph'),
    repo('acme', 'graph-server', 'MCP server: knowledge graph for your codebase'),
  ].map((r) => [r.full_name, r])) };
  const names = (prof) => recommend(prof, catalog, { top: 10, includeLow: true }).map((r) => r.full_name ?? r.name);
  assert.ok(names(base).some((n) => /graphify/.test(n)), 'precondition: recommended without project detection');
  assert.deepEqual(names(p).filter((n) => /graphify|graph-server/.test(n)), []);
  assert.ok(!JSON.stringify(p).includes(proj), 'project paths stay out of the profile');
});

test('CLI profile includes project-level installs', () => {
  const { home } = fakeHome();
  const out = execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url)), 'profile', '--json', '--home', home, '--data', path.join(home, 'd')], { cwd: home, encoding: 'utf8' });
  assert.ok(JSON.parse(out).installed.names.includes('graphify'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProfile, commandHeads, detectInstalled } from '../scripts/lib/profile.mjs';
import { mergeRepos, momentum, classify } from '../scripts/lib/crawl.mjs';
import { recommend, trust } from '../scripts/lib/rank.mjs';

const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const tool = (name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } });

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-'));
  const proj = path.join(home, '.claude', 'projects', '-home-u-backtester');
  fs.mkdirSync(proj, { recursive: true });
  const sessions = [
    [user('Write pytest tests for the backtest engine'), tool('Bash', { command: 'pytest -q tests/ && git commit -m x' }), tool('Edit', { file_path: '/p/engine.py' })],
    [user('the test is still failing, same error'), tool('Bash', { command: 'pytest -x' }), tool('Edit', { file_path: '/p/tests/test_engine.py' })],
    [user('plot the equity curve with matplotlib from the csv'), tool('Bash', { command: 'pytest' }), tool('Write', { file_path: '/p/out.csv' })],
    [user('add a SwiftUI settings screen'), tool('Edit', { file_path: '/app/Settings.swift' }), tool('mcp__github__create_pr', {})],
  ];
  sessions.forEach((lines, i) => fs.writeFileSync(path.join(proj, `s${i}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n')));
  fs.mkdirSync(path.join(home, '.claude', 'skills', 'pdf-tools'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { playwright: { command: 'npx', args: ['@playwright/mcp@latest'] } } }));
  return home;
}

const repo = (o) => ({
  full_name: `o/${o.name}`, name: o.name, owner: 'o', ownerType: 'Organization', url: `https://github.com/o/${o.name}`,
  description: o.description || '', topics: o.topics || [], language: o.language || 'Python',
  stargazers_count: o.stars ?? 500, forks_count: 40, license: { spdx_id: 'MIT' }, archived: false, fork: false,
  created_at: '2026-01-01T00:00:00Z', pushed_at: new Date().toISOString(),
});

test('commandHeads strips args and env, keeps subcommands', () => {
  assert.deepEqual(commandHeads('FOO=1 git rebase -i HEAD~3 && npm test | tee x'), ['git rebase', 'npm test', 'tee']);
  assert.deepEqual(commandHeads('/usr/bin/python3 script.py'), ['python3']);
});

test('profile counts topics, friction, languages, installed; stores no prompt text', () => {
  const home = fakeHome();
  const p = buildProfile({ home, days: 30, cwd: home });
  assert.equal(p.sessions, 4);
  assert.equal(p.topics.testing, 3);
  assert.ok(p.friction.testing >= 1);
  assert.ok(p.topics.finance >= 1 && p.topics.ios >= 1 && p.topics.data >= 1);
  assert.equal(Object.keys(p.languages)[0], 'Python');
  assert.ok(p.repeatedCommands.some((c) => c.command === 'pytest'));
  assert.ok(p.installed.names.includes('pdf-tools'));
  assert.ok(p.installed.names.includes('playwright'));
  assert.ok(p.installed.names.includes('github'), 'MCP servers seen in use count as installed');
  assert.ok(!JSON.stringify(p).includes('equity curve'), 'prompt text must not be stored');
});

test('classify', () => {
  assert.equal(classify({ name: 'awesome-mcp', topics: [] }), 'list');
  assert.equal(classify({ name: 'x', topics: ['claude-code-plugin'] }), 'plugin');
  assert.equal(classify({ name: 'x-skills', description: 'Claude skills', topics: [] }), 'skill');
  assert.equal(classify({ name: 'pg', topics: ['mcp-server'] }), 'mcp-server');
});

test('momentum is measured from snapshots', () => {
  const cat = { repos: {} };
  mergeRepos(cat, [repo({ name: 'a', stars: 100 })], '2026-11-01');
  mergeRepos(cat, [repo({ name: 'a', stars: 170 })], '2026-11-08');
  const m = momentum(cat.repos['o/a']);
  assert.equal(m.source, 'measured');
  assert.equal(m.perDay, 10);
});

test('trust flags archived/unlicensed/new repos', () => {
  const t = trust({ ...repo({ name: 'z', stars: 3 }), stars: 3, forks: 0, license: null, ownerType: 'User', createdAt: new Date().toISOString(), pushedAt: new Date().toISOString() });
  assert.equal(t.tier, 'low');
  assert.ok(t.notes.includes('no license'));
});

test('recommend ranks relevant, excludes installed and lists, explains why', () => {
  const home = fakeHome();
  const p = buildProfile({ home, days: 30, cwd: home });
  const cat = { repos: {} };
  mergeRepos(cat, [
    repo({ name: 'pytest-skill', description: 'Claude skill that writes and fixes pytest test suites', topics: ['claude-skills'] }),
    repo({ name: 'backtest-mcp', description: 'MCP server for trading backtesting and OHLC data', topics: ['mcp-server'] }),
    repo({ name: 'k8s-mcp', description: 'Kubernetes MCP server', topics: ['mcp-server'], stars: 9000 }),
    repo({ name: 'playwright-mcp', description: 'browser automation MCP', topics: ['mcp-server'] }),
    repo({ name: 'awesome-claude', description: 'list of testing tools', topics: ['awesome'] }),
  ]);
  const recs = recommend(p, cat, { top: 5 });
  const names = recs.map((r) => r.name);
  assert.equal(names[0], 'o/pytest-skill');
  assert.ok(names.includes('o/backtest-mcp'));
  assert.ok(!names.includes('o/k8s-mcp'), 'irrelevant to this user despite stars');
  assert.ok(!names.includes('o/playwright-mcp'), 'already installed');
  assert.ok(!names.includes('o/awesome-claude'), 'lists are not tools');
  assert.equal(recs[0].evidence[0].topic, 'testing');
  assert.ok(recs[0].install.includes('~/.claude/skills'));
});

test('detectInstalled reads marketplaces and plugins', () => {
  const home = fakeHome();
  const pd = path.join(home, '.claude', 'plugins');
  fs.mkdirSync(pd, { recursive: true });
  fs.writeFileSync(path.join(pd, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'superpowers@obra': [{}] } }));
  fs.writeFileSync(path.join(pd, 'known_marketplaces.json'), JSON.stringify({ obra: { source: { source: 'github', repo: 'obra/superpowers-marketplace' } } }));
  const inst = detectInstalled(home, home);
  assert.ok(inst.names.includes('superpowers'));
  assert.ok(inst.repos.includes('obra/superpowers-marketplace'));
});

test('the session running the scout is left out of the profile by default', () => {
  const home = fakeHome();
  const proj = path.join(home, '.claude', 'projects', '-home-u-backtester');
  fs.writeFileSync(path.join(proj, 'current-session.jsonl'), JSON.stringify(user('pentest the kubernetes cluster')));
  const p = buildProfile({ home, days: 30, cwd: home, excludeSessions: ['current-session'] });
  assert.equal(p.sessions, 4);
  assert.equal(p.excludedCurrentSession, true);
  assert.equal(p.topics['offensive-security'], undefined);
  assert.equal(buildProfile({ home, days: 30, cwd: home, excludeSessions: [] }).sessions, 5);
});

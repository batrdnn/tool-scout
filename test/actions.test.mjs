import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProfile } from '../scripts/lib/profile.mjs';
import { recommend } from '../scripts/lib/rank.mjs';
import { mergeRepos } from '../scripts/lib/crawl.mjs';

const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const tool = (name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } });

function home(sessions) {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-act-'));
  const proj = path.join(h, '.claude', 'projects', '-p');
  fs.mkdirSync(proj, { recursive: true });
  sessions.forEach((lines, i) => fs.writeFileSync(path.join(proj, `s${i}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n')));
  return h;
}

// Two sessions only *talk* about trading (e.g. describing someone else's project);
// one session actually runs pytest and edits a test file.
const sessions = [
  [user('write a persona who backtests trading strategies for the eval'), tool('Edit', { file_path: '/p/notes.txt' })],
  [user('add another trading backtest persona'), tool('Edit', { file_path: '/p/notes.txt' })],
  [user('fix it'), tool('Bash', { command: 'pytest -q' }), tool('Edit', { file_path: '/p/tests/test_x.py' })],
  [user('look at the page'), tool('mcp__playwright__browser_navigate', { url: 'http://localhost' })],
];

test('topics are scored by source: actions count fully, mentions at 0.3', () => {
  const p = buildProfile({ home: home(sessions), days: 30, cwd: os.tmpdir(), excludeSessions: [] });
  assert.equal(p.topicSources.mentions.finance, 2);
  assert.equal(p.topicSources.actions.finance, undefined);
  assert.equal(p.topicSources.actions.testing, 2, 'pytest + test file, and the playwright MCP tool');
  assert.ok(Math.abs(p.topicWeights.finance - 0.6) < 1e-9);
  assert.ok(Math.abs(p.topicWeights.testing - 2) < 1e-9);
  assert.equal(p.topics.finance, 2, 'session counts stay for evidence lines');
});

test('a topic the user only talks about ranks below one they act on', () => {
  const p = buildProfile({ home: home(sessions), days: 30, cwd: os.tmpdir(), excludeSessions: [] });
  const gh = (name, description, stars) => ({ full_name: `o/${name}`, name, owner: { login: 'o', type: 'Organization' }, html_url: `https://github.com/o/${name}`,
    description, topics: ['mcp-server'], language: 'Python', stargazers_count: stars, forks_count: 50, license: { spdx_id: 'MIT' }, archived: false, fork: false,
    created_at: '2025-06-01T00:00:00Z', pushed_at: new Date().toISOString() });
  const cat = { repos: {} };
  mergeRepos(cat, [gh('backtest-mcp', 'MCP server for trading backtesting', 20000), gh('pytest-mcp', 'MCP server that runs pytest', 800)]);
  const recs = recommend(p, cat, { top: 5 });
  assert.equal(recs[0].name, 'o/pytest-mcp');
  assert.equal(recs[0].evidence[0].actions, 2);
  assert.equal(recs.find((r) => r.name === 'o/backtest-mcp')?.evidence[0].actions ?? 0, 0);
});

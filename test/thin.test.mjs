import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { recommend } from '../scripts/lib/rank.mjs';
import { mergeRepos } from '../scripts/lib/crawl.mjs';

const gh = (name, description, stars = 1000) => ({ full_name: `o/${name}`, name, owner: { login: 'o', type: 'Organization' }, html_url: `https://github.com/o/${name}`,
  description, topics: ['mcp-server'], language: 'Python', stargazers_count: stars, forks_count: 50, license: { spdx_id: 'MIT' }, archived: false, fork: false,
  created_at: '2025-06-01T00:00:00Z', pushed_at: new Date().toISOString() });
// testing in 3 sessions; finance and devops in 1 each; database in 1 but with friction.
const thin = { sessions: 4, topics: { testing: 3, finance: 1, database: 1, devops: 1 }, friction: { database: 1 }, languages: {}, installed: { names: [], repos: [] } };
const items = [
  gh('backtest-mcp', 'MCP server for trading backtesting', 90000),
  gh('k8s-mcp', 'Kubernetes MCP server', 80000),
  gh('pg-mcp', 'Postgres database MCP server'),
  gh('pytest-mcp', 'MCP server that runs pytest'),
  gh('jest-mcp', 'MCP server that runs jest suites'),
  gh('cypress-mcp', 'MCP server for Cypress e2e testing'),
  gh('vitest-mcp', 'MCP server for vitest'),
];

test('a topic seen in only one session (no friction) stays out of the top 5', () => {
  const cat = { repos: {} };
  mergeRepos(cat, items);
  const recs = recommend(thin, cat, { top: 8 });
  const top5 = recs.slice(0, 5).map((r) => r.name);
  assert.ok(!top5.includes('o/backtest-mcp') && !top5.includes('o/k8s-mcp'), top5.join(', '));
  assert.ok(top5.includes('o/pg-mcp'), 'friction makes a one-session topic count');
  assert.deepEqual(recs.slice(5).map((r) => r.name).sort(), ['o/backtest-mcp', 'o/k8s-mcp']);
  assert.ok(recs.slice(5).every((r) => r.thinEvidence));
});

test('with fewer than 5 well-supported picks, thin ones are left out, not promoted', () => {
  const cat = { repos: {} };
  mergeRepos(cat, items.slice(0, 4)); // backtest, k8s, pg, pytest
  const recs = recommend(thin, cat, { top: 8 });
  assert.deepEqual(recs.map((r) => r.name).sort(), ['o/pg-mcp', 'o/pytest-mcp']);
  assert.equal(recs.thinOmitted, 2);
});

test('CLI: fewer than 10 sessions adds a limited-history note', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-thin-'));
  const proj = path.join(home, '.claude', 'projects', '-p');
  fs.mkdirSync(proj, { recursive: true });
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(proj, `s${i}.jsonl`), JSON.stringify({ type: 'user', message: { role: 'user', content: 'write pytest tests' } }));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-thin-data-'));
  const cat = { updatedAt: new Date().toISOString(), repos: {} };
  mergeRepos(cat, items);
  fs.writeFileSync(path.join(data, 'catalog.json'), JSON.stringify(cat));
  const run = (...a) => execFileSync(process.execPath, [new URL('../scripts/scout.mjs', import.meta.url).pathname, ...a, '--home', home, '--data', data, '--offline', '--include-current'], { encoding: 'utf8' });
  const out = JSON.parse(run('all', '--json', '--top', '5'));
  assert.equal(out.limitedHistory, true);
  assert.match(out.notes.join(' '), /limited history: 3 sessions/i);
  assert.match(run('all', '--top', '5'), /Limited history/);
});

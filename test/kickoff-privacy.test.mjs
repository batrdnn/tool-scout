// v0.11.0 item 5: the kickoff guarantees. The plan text never appears in network requests, the
// catalog cache or logs (only in the local needs file); at most 5 items; "nothing needed" when no
// match is good enough; and each chosen item has its own confirmation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createClient } from '../scripts/lib/github.mjs';
import { runKickoff, needsPath } from '../scripts/lib/kickoff.mjs';
import { mockFetch } from './helpers.mjs';
import { sandbox, filesUnder, catalog, PLAN, NOW, MARKER } from './kickoff-helpers.mjs';

const SCOUT = new URL('../scripts/scout.mjs', import.meta.url).pathname;
// Every line of the plan with some substance: none of them may show up outside the needs file.
const PLAN_LINES = PLAN.split('\n').map((l) => l.replace(/^[-#\s]+/, '').trim()).filter((l) => l.length >= 12);
const leaks = (text) => [MARKER, ...PLAN_LINES].filter((l) => String(text).toLowerCase().includes(l.toLowerCase()));

/** Mock GitHub: search results for a crawl, and enough of each repo for the content scan. */
function github() {
  const cat = catalog();
  return mockFetch((url) => {
    const u = new URL(url);
    if (u.pathname === '/search/repositories') return { items: Object.values(cat.repos).map((r) => ({ full_name: r.full_name, name: r.name, owner: { login: r.owner, type: 'Organization' }, html_url: r.url, description: r.description, topics: r.topics, language: 'Python', stargazers_count: r.stars, forks_count: r.forks, license: { spdx_id: 'MIT' }, created_at: r.createdAt, pushed_at: r.pushedAt })) };
    const m = u.pathname.match(/^\/repos\/([^/]+\/[^/]+)(?:\/(.*))?$/);
    if (!m) return undefined;
    const rest = m[2] || '';
    if (!rest) return { full_name: m[1], default_branch: 'main' };
    if (rest.startsWith('git/trees/')) return { truncated: false, tree: [{ path: 'SKILL.md', type: 'blob', mode: '100644', sha: 'f'.repeat(40), size: 400 }, { path: 'README.md', type: 'blob', mode: '100644', sha: 'e'.repeat(40), size: 200 }] };
    if (rest === 'readme') return `# ${m[1]}\n`;
    if (rest.startsWith('contents/')) return '---\nname: x\ndescription: x\n---\nDo the thing.\n';
    if (rest.startsWith('commits')) return [];
    if (rest.startsWith('stargazers') || rest.startsWith('events')) return [];
    return undefined;
  });
}

test('the plan text never appears in network requests, the catalog cache or logs: only in the needs file', async () => {
  const sb = sandbox();
  // An old catalog, so the kickoff refreshes it (with the fixed topic searches) and scans its matches.
  const cat = JSON.parse(fs.readFileSync(path.join(sb.dataDir, 'catalog.json'), 'utf8'));
  fs.writeFileSync(path.join(sb.dataDir, 'catalog.json'), JSON.stringify({ ...cat, updatedAt: new Date(NOW - 3 * 86400e3).toISOString() }));
  const fetchImpl = github();
  const logs = [];
  process.env.GITHUB_TOKEN ||= 'test-token'; // authenticated: the crawl doesn't pause between searches
  const r = await runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: createClient({ fetchImpl }), fetchImpl, log: (m) => logs.push(m) });
  assert.ok(fetchImpl.calls.length > 5, `the test must see real traffic (${fetchImpl.calls.length} calls)`);
  assert.ok(fetchImpl.calls.some((c) => c.url.includes('/search/repositories')), 'the catalog was refreshed');
  assert.ok(fetchImpl.calls.some((c) => /\/repos\/acme\/pytest-helper\//.test(c.url)), 'a match was scanned');
  for (const c of fetchImpl.calls) assert.deepEqual(leaks(JSON.stringify(c)), [], `request: ${c.url}`);
  assert.deepEqual(leaks(logs.join('\n')), [], 'logs');
  const files = filesUnder(sb.dataDir);
  assert.ok(files[path.join(sb.dataDir, 'catalog.json')], 'catalog cache present');
  for (const [f, text] of Object.entries(files)) {
    if (f === r.needsFile) continue;
    assert.deepEqual(leaks(text), [], `${path.relative(sb.dataDir, f)} has plan text`);
  }
  assert.ok(leaks(files[needsPath(sb.dataDir)]).length > 0, 'the needs file does hold the plan');
});

test('the CLI keeps plan text off stderr (its log), and writes nothing outside the data folder', () => {
  const sb = sandbox();
  const before = fs.readdirSync(sb.root).sort();
  const p = spawnSync(process.execPath, [SCOUT, 'kickoff', '--plan-file', sb.planFile, '--project', sb.project, '--plain', '--offline', '--home', sb.home, '--data', sb.dataDir], { encoding: 'utf8', cwd: sb.root });
  assert.equal(p.status, 0, p.stderr);
  assert.ok(p.stdout.length);
  assert.deepEqual(leaks(p.stderr), [], 'stderr');
  assert.deepEqual(fs.readdirSync(sb.root).sort(), before);
  assert.deepEqual(fs.readdirSync(sb.project).sort(), ['requirements.txt']);
});

test('at most 5 items, however long the plan', async () => {
  const lines = ['Write pytest tests', 'Store data in Postgres', 'Deploy with Docker', 'Backtest the trading strategy', 'Write the README docs',
    'Scrape prices with a headless browser', 'Fine-tune an embedding model', 'Design the landing page in Figma', 'Fix the stack trace in the parser', 'Refactor the linter setup',
    'Build the iOS app in SwiftUI', 'Sync tasks to Notion and Slack'];
  const sb = sandbox({ plan: lines.map((l) => `- ${l}`).join('\n') + '\n- Always use type hints\n' });
  const { toolkit } = await runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  assert.equal(toolkit.items.length, 5);
  assert.ok(toolkit.omitted >= 5);
  assert.equal(toolkit.items.filter((i) => i.action === 'memory').length, 1, 'the memory note is always one of the 5');
});

test('"nothing needed" when no match is good enough', async () => {
  const sb = sandbox({ plan: '- Write a README and the API docs\n- Update the changelog and docstrings\n- Fix the stack trace when the parser crashes\n' });
  const { toolkit } = await runKickoff({ planFile: sb.planFile, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  const docs = toolkit.items.find((i) => i.topic === 'docs');
  assert.equal(docs.action, 'nothing', 'misc/everything-kit only mentions docs in passing');
  assert.match(docs.reason, /nothing needed: Claude handles this without a tool/i);
  assert.equal(docs.next, undefined);
  assert.equal(toolkit.items.find((i) => i.topic === 'debugging')?.action, 'nothing');
});

test('each chosen item has its own confirmation: one plan per item, and kickoff confirms nothing', async () => {
  const sb = sandbox();
  const { toolkit } = await runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  const actionable = toolkit.items.filter((i) => i.action !== 'nothing');
  assert.ok(actionable.length >= 2);
  const nexts = actionable.map((i) => i.next);
  assert.equal(new Set(nexts).size, nexts.length, 'each item has its own plan command');
  for (const n of nexts) {
    assert.match(n, /^(install \S+ --scope project --plan|build --start --form \w+ --name [a-z0-9-]+)$/, n);
    assert.doesNotMatch(n, /--confirm/);
  }
  assert.throws(() => execFileSync(process.execPath, [SCOUT, 'kickoff', '--confirm', 'abc', '--plain', '--data', sb.dataDir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    /kickoff never installs or builds: confirm each item's own plan/);
  const skill = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /its own yes\/no/i);
});

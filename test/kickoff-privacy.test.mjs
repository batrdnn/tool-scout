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
import { findBlindSpotTool } from '../scripts/lib/blindspot.mjs';
import { whoAmI } from '../scripts/lib/me.mjs';
import { scanRecommendations } from '../scripts/lib/scan.mjs';
import { loadCatalog } from '../scripts/lib/crawl.mjs';
import { loadOfficial } from '../scripts/lib/kickoff-sources.mjs';
import { prof } from './helpers.mjs';
import { mockFetch } from './helpers.mjs';
import { sandbox, filesUnder, catalog, PLAN, NOW, MARKER } from './kickoff-helpers.mjs';
import { fileURLToPath } from 'node:url';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
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
  assert.match(skill, /one yes\/no for that one item/i);
});

// v0.14.0 item 4: the blind-spot lookup sends nothing new. Matching is local; the only requests are
// the existing content scan of the one matched repo, by name.
test('the blind-spot lookup: the only requests are the content scan of the one matched repo, by name; nothing from the profile leaves', async () => {
  const sb = sandbox();
  const fetchImpl = github();
  const logs = [];
  const log = (m) => logs.push(m);
  process.env.GITHUB_TOKEN ||= 'test-token';
  const client = createClient({ fetchImpl });
  // A profile full of things that must never be sent: a library, a project, a command and a prompt-like topic note, all marked.
  const profile = prof({ topics: { debugging: 10, testing: 6 }, friction: { testing: 6, debugging: 3 }, stack: { [MARKER]: 3, pytest: 2 },
    repeatedCommands: [{ command: `./deploy-${MARKER}.sh`, count: 4, sessions: 4 }], installed: { names: [`skill-${MARKER}`], repos: [] } });
  const me = whoAmI(profile);
  assert.equal(me.animal, 'Owl');
  const cat = loadCatalog(sb.dataDir);
  const scan = (recs) => scanRecommendations(recs, cat, { client, dataDir: sb.dataDir, log, now: NOW });
  const official = await loadOfficial({ client: null, dataDir: sb.dataDir, now: NOW, log }); // cache only, as the CLI does
  const res = await findBlindSpotTool(me, profile, cat, { home: sb.home, dataDir: sb.dataDir, now: NOW, official, scan });
  assert.equal(res.repo, 'acme/pytest-helper');
  assert.ok(fetchImpl.calls.length > 0, 'the test must see the content scan');
  for (const c of fetchImpl.calls) {
    const u = new URL(c.url);
    assert.equal(u.hostname, 'api.github.com', c.url);
    assert.match(u.pathname, /^\/repos\/acme\/pytest-helper(\/|$)/, `a request that is not the matched repo's scan: ${c.url}`);
    assert.equal(u.search.includes('q='), false, 'no search query');
    assert.deepEqual([MARKER, 'deploy-', 'skill-'].filter((x) => JSON.stringify(c).includes(x)), [], `profile data in ${c.url}`);
  }
  assert.ok(!fetchImpl.calls.some((c) => /claude-plugins-official|\/search\//.test(c.url)), 'no marketplace or catalog request from the lookup');
  assert.deepEqual([MARKER, 'deploy-'].filter((x) => logs.join('\n').includes(x) || res.line.includes(x)), [], 'logs and the line');
  // Offline (the CLI's --offline): no request at all, and the answer is the same match.
  const quiet = github();
  const off = await findBlindSpotTool(me, profile, cat, { home: sb.home, dataDir: sb.dataDir, now: NOW, official, scan: null });
  assert.equal(off.repo, res.repo);
  assert.equal(quiet.calls.length, 0);
});

test('the blind-spot CLI keeps profile data off stdout and stderr, and writes nothing outside the data folder', () => {
  const sb = sandbox();
  fs.writeFileSync(path.join(sb.dataDir, 'profile.json'), JSON.stringify(prof({ topics: { debugging: 10, testing: 6 }, friction: { testing: 6 }, stack: { [MARKER]: 3 } })));
  const before = fs.readdirSync(sb.root).sort();
  const p = spawnSync(process.execPath, [SCOUT, 'me', '--blind-spot', '--offline', '--json', '--home', sb.home, '--data', sb.dataDir], { encoding: 'utf8', cwd: sb.root });
  assert.equal(p.status, 0, p.stderr);
  assert.deepEqual(leaks(p.stdout + p.stderr), [], 'output');
  assert.equal(p.stdout.includes(MARKER), false);
  assert.deepEqual(fs.readdirSync(sb.root).sort(), before);
});

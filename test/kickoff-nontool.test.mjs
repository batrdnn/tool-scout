// v0.14.1 item 1: non-tool tasks (recruiting, submitting, publishing, posts, FAQs, designing icons) never
// become tool needs, even when they mention GitHub or git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runKickoff, extractNeeds, formatKickoff } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW, catalogRepo, installPlugins } from './kickoff-helpers.mjs';

const PLAN = fs.readFileSync(new URL('./fixtures/kickoff/v0141-plan.md', import.meta.url), 'utf8');
const kick = (sb, o = {}) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null, ...o });
const withCatalog = (sb, repos) => {
  const f = path.join(sb.dataDir, 'catalog.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of repos) c.repos[r.full_name] = r;
  fs.writeFileSync(f, JSON.stringify(c));
};
const review = () => [
  catalogRepo('alibaba/open-code-review', 'Secure, fast code review for GitHub issues and pull requests', { topics: ['claude-skills'], stars: 56000 }),
  catalogRepo('github/github-mcp-server', "GitHub's official MCP Server: manage GitHub issues, pull requests and repositories", { topics: ['mcp-server'], stars: 30000 }),
];

test('item 1: no git need comes from "GitHub issues" in a recruiting line (today\'s plan)', async () => {
  const n = extractNeeds(PLAN);
  assert.ok(!n.needs.some((x) => x.topic === 'git'), 'no git need');
  assert.ok(!n.tasks.some((x) => x.topic === 'git'));
  const sb = sandbox({ plan: PLAN }); withCatalog(sb, review());
  const { toolkit } = await kick(sb);
  assert.ok(!toolkit.items.some((i) => i.topic === 'git'), JSON.stringify(toolkit.items.map((i) => i.topic)));
  assert.doesNotMatch(JSON.stringify(toolkit), /open-code-review|github-mcp-server/);
});

test('item 1: recruiting, submitting, publishing, posts, FAQs and designing icons are never tool needs', () => {
  for (const line of [
    'Recruit 5 testers and collect their bug reports as GitHub issues',
    'Submit the plugin to the marketplace through its GitHub repo',
    'Publish the release notes to GitHub releases',
    'Write the FAQ and a launch post about the GitHub workflow',
    'Design an icon and a logo for the git project',
  ]) assert.deepEqual(extractNeeds(`- ${line}\n`).needs, [], line);
});

test('item 1: a plain GitHub issue triage line is still a tool need', () => {
  const n = extractNeeds('- Track bug reports as GitHub issues and triage them weekly\n');
  assert.ok(n.needs.some((x) => x.topic === 'git'));
});


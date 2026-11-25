// v0.11.1 item 2: better candidates. Anthropic's official marketplace (anthropics/claude-plugins-official,
// its marketplace.json, fetched by repo name only) and a short list of built-in Claude Code features
// are candidates too, and are preferred over trending repos for the same need.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runKickoff } from '../scripts/lib/kickoff.mjs';
import { OFFICIAL_REPO, BUILTINS } from '../scripts/lib/kickoff-sources.mjs';
import { sandbox, NOW, MARKER, catalogRepo, installPlugins, filesUnder } from './kickoff-helpers.mjs';

const PLAN = `# Project (${MARKER})\n\n- Track bug reports as GitHub issues and triage them weekly\n- Security review of the install and build code before launch\n- Always keep reports short\n`;
const kick = (sb, o = {}) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null, ...o });
const trending = () => [
  catalogRepo('acme/issue-triage-bot', 'GitHub issues triage skill: label and triage bug reports in your repo'),
  catalogRepo('acme/sec-scanner', 'Security review MCP server: scan your code for vulnerabilities', { topics: ['mcp-server'] }),
];
const withCatalog = (sb) => {
  const f = path.join(sb.dataDir, 'catalog.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of trending()) c.repos[r.full_name] = r;
  fs.writeFileSync(f, JSON.stringify(c));
};

test('an official marketplace plugin is preferred over a trending repo for the same need', async () => {
  const sb = sandbox({ plan: PLAN }); withCatalog(sb);
  const { toolkit } = await kick(sb);
  const git = toolkit.items.find((i) => i.topic === 'git');
  assert.equal(git.action, 'install');
  assert.equal(git.kind, 'official-plugin');
  assert.equal(git.plugin, 'github');
  assert.equal(git.repo, OFFICIAL_REPO);
  assert.equal(git.command, 'claude plugin install github@claude-plugins-official --scope project');
  assert.equal(toolkit.items.find((i) => i.topic === 'security').plugin, 'security-guidance');
  assert.ok(!JSON.stringify(toolkit.items).includes('acme/'), 'no trending repo for needs the official marketplace covers');
});

test('a built-in Claude Code feature is a candidate: nothing to install, the user types it', async () => {
  const sb = sandbox({ plan: PLAN }); withCatalog(sb);
  installPlugins(sb.home, 'security-guidance@claude-plugins-official');
  const { toolkit } = await kick(sb);
  const sec = toolkit.items.find((i) => i.topic === 'security');
  assert.equal(sec.action, 'builtin');
  assert.equal(sec.name, '/ultrareview');
  assert.equal(sec.next, undefined);
  assert.match(sec.reason, /type \/ultrareview yourself/);
  assert.match(sec.reason, /billed/);
  assert.ok(BUILTINS.length >= 2 && BUILTINS.length <= 6, 'a short list');
});

test('marketplace.json is fetched by repo name only, cached, and a plugin it lacks is not offered', async () => {
  const sb = sandbox({ plan: PLAN }); withCatalog(sb);
  const urls = [];
  const client = { hasBudget: () => true, state: {}, request: async (url) => {
    urls.push(url);
    if (/marketplace\.json/.test(url)) return { status: 200, data: JSON.stringify({ plugins: [{ name: 'security-guidance' }, { name: 'code-review' }] }) };
    return { status: 404, data: null };
  } };
  const { toolkit } = await kick(sb, { client, scan: async () => ({}) });
  const m = urls.filter((u) => /marketplace\.json/.test(u));
  assert.equal(m.length, 1);
  assert.ok(m[0].includes('anthropics/claude-plugins-official') && m[0].includes('.claude-plugin/marketplace.json'));
  assert.ok(!urls.some((u) => u.includes(MARKER) || /triage|GitHub%20|issues/i.test(decodeURIComponent(u).replace(/github\.com/gi, ''))), 'no plan text in any URL');
  assert.equal(toolkit.items.find((i) => i.topic === 'security').plugin, 'security-guidance');
  assert.notEqual(toolkit.items.find((i) => i.topic === 'git')?.plugin, 'github', 'not in the fetched marketplace');
  for (const f of Object.values(filesUnder(sb.dataDir))) assert.ok(!f.includes(MARKER) || f.includes('"plan"'), 'plan text only in the needs file');
  assert.ok(fs.existsSync(path.join(sb.dataDir, 'kickoff', 'official.json')));
});

test('the skill shows official plugins and built-ins and runs only what the user said yes to', () => {
  const SKILL = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
  assert.match(SKILL, /official-plugin/);
  assert.match(SKILL, /claude plugin install/);
  assert.match(SKILL, /`builtin`/);
  assert.match(SKILL, /built-in items are not options/i);
});

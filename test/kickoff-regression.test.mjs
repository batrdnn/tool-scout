// v0.11.1 item 7: regression test from kickoff run 1 (0 of 5 items worth keeping). The plan is the
// exact plan of that run (test/fixtures/kickoff/launch-plan.md), the project has the same CLAUDE.md.
// Expected: github-mcp-server (or an official GitHub plugin) for issue triage; security-guidance or
// /ultrareview for the security review; "nothing needed" for CI, the icon and the launch post; and
// none of Tracely, AiSOC or playwright-mcp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runKickoff, formatKickoff } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW, catalogRepo } from './kickoff-helpers.mjs';

const FIX = (f) => fs.readFileSync(new URL(`./fixtures/kickoff/${f}`, import.meta.url), 'utf8');

function launchSandbox() {
  const sb = sandbox({ plan: FIX('launch-plan.md') });
  fs.rmSync(path.join(sb.project, 'requirements.txt'));
  fs.writeFileSync(path.join(sb.project, 'package.json'), JSON.stringify({ name: 'tool-scout', type: 'module' }));
  fs.writeFileSync(path.join(sb.project, 'CLAUDE.md'), FIX('launch-CLAUDE.md'));
  const f = path.join(sb.dataDir, 'catalog.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of [
    catalogRepo('github/github-mcp-server', "GitHub's official MCP Server: manage GitHub issues, pull requests and repositories", { topics: ['mcp-server'], language: 'Go', stars: 30000 }),
    catalogRepo('microsoft/playwright-mcp', 'Playwright MCP server: browser automation and end-to-end testing', { topics: ['mcp-server'], language: 'TypeScript', stars: 40000 }),
    catalogRepo('beenuar/AiSOC', 'Open-source AI Security Operations Center: alert fusion, LLM-agent triage, MITRE ATT&CK', { topics: ['mcp-server'], stars: 7800 }),
    catalogRepo('jwuthri-cloud/Tracely-ai', 'Trace-native CI/CD for AI agents: grade production traces, cluster failures', { topics: ['mcp-server'], stars: 850 }),
    catalogRepo('alibaba/open-code-review', 'Secure, fast, efficient code review: hybrid architecture for GitHub issues and pull requests', { topics: ['claude-skills'], stars: 56000 }),
  ]) c.repos[r.full_name] = r;
  fs.writeFileSync(f, JSON.stringify(c));
  return sb;
}
const kick = (sb) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
const BANNED = /Tracely|AiSOC|playwright-mcp/i;

test('run 1 plan: the right tool for issue triage and the security review', async () => {
  const { toolkit } = await kick(launchSandbox());
  const git = toolkit.items.find((i) => i.topic === 'git');
  assert.ok(git, 'an item for issue triage');
  assert.ok(git.repo === 'github/github-mcp-server' || git.plugin === 'github', `got ${git.repo} ${git.plugin || ''}`);
  const sec = toolkit.items.find((i) => i.topic === 'security');
  assert.ok(sec, 'an item for the security review');
  assert.ok(sec.plugin === 'security-guidance' || sec.name === '/ultrareview', `got ${sec.plugin || sec.name || sec.repo}`);
});

test('run 1 plan: CI, the icon and the launch post are "nothing needed: Claude does this directly"', async () => {
  const { toolkit } = await kick(launchSandbox());
  assert.deepEqual(toolkit.direct.map((d) => d.id).sort(), ['ci', 'icon', 'post']);
  for (const d of toolkit.direct) assert.match(d.reason, /nothing needed: Claude does this directly: \S/);
});

test('run 1 plan: no Tracely, no AiSOC, no playwright-mcp, in any item or in the text', async () => {
  const r = await kick(launchSandbox());
  assert.doesNotMatch(JSON.stringify(r.toolkit), BANNED);
  assert.doesNotMatch(formatKickoff(r), BANNED);
  assert.ok(r.toolkit.items.length <= 5);
});

test('run 1 plan: the memory note carries only the convention CLAUDE.md lacks', async () => {
  const { toolkit } = await kick(launchSandbox());
  const mem = toolkit.items.find((i) => i.action === 'memory');
  assert.deepEqual(mem.conventions, ['Never add runtime dependencies']);
});

test('run 1 plan: a rematch gives the same toolkit', async () => {
  const sb = launchSandbox();
  const a = await kick(sb);
  const b = await runKickoff({ rematch: true, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
  assert.deepEqual(b.toolkit, a.toolkit);
});

test('run 1 plan: polishing the README is "nothing needed", not a docs skill to build', async () => {
  const sb = launchSandbox();
  const f = path.join(sb.dataDir, 'catalog.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = catalogRepo('agentskills/agentskills', 'Agent Skills: a format for writing documentation and instructions skills', { stars: 5000 });
  c.repos[r.full_name] = r; fs.writeFileSync(f, JSON.stringify(c));
  const { toolkit } = await kick(sb);
  const docs = toolkit.items.find((i) => i.topic === 'docs');
  assert.ok(!docs || docs.action === 'nothing', `got ${docs?.action}`);
  assert.ok(!toolkit.items.some((i) => i.action === 'build' && /docs/.test(i.name || '')));
});

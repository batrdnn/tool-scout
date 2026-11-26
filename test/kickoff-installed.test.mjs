// v0.16.0 item 5: a plan line an already-installed tool covers is answered "already installed: <name>",
// whichever way the tool is installed: for the user, enabled in the project's own settings, or an MCP server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runKickoff } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW, installPlugins } from './kickoff-helpers.mjs';

const LINE = '- Track bug reports as GitHub issues and triage them weekly\n';
const kick = (sb) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
const gitItem = (toolkit) => toolkit.items.find((i) => i.topic === 'git');
const settings = (sb, file, body) => {
  fs.mkdirSync(path.join(sb.project, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(sb.project, '.claude', file), JSON.stringify(body));
};

test('the github plugin enabled in the project\'s .claude/settings.json: already installed', async () => {
  const sb = sandbox({ plan: LINE });
  settings(sb, 'settings.json', { enabledPlugins: { 'github@claude-plugins-official': true } });
  const git = gitItem((await kick(sb)).toolkit);
  assert.equal(git.action, 'nothing');
  assert.equal(git.installed, 'github');
  assert.match(git.reason, /already installed: github/);
});

test('the github plugin enabled in .claude/settings.local.json: already installed', async () => {
  const sb = sandbox({ plan: LINE });
  settings(sb, 'settings.local.json', { enabledPlugins: { 'github@claude-plugins-official': true } });
  assert.match(gitItem((await kick(sb)).toolkit).reason, /already installed: github/);
});

test('a plugin the project settings switch off (false) is not installed: the plan gets the plugin proposal', async () => {
  const sb = sandbox({ plan: LINE });
  settings(sb, 'settings.json', { enabledPlugins: { 'github@claude-plugins-official': false } });
  const git = gitItem((await kick(sb)).toolkit);
  assert.equal(git.action, 'install');
  assert.equal(git.plugin, 'github');
});

test('a github MCP server named in the project\'s .mcp.json: already installed', async () => {
  const sb = sandbox({ plan: LINE });
  fs.writeFileSync(path.join(sb.project, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } } }));
  assert.match(gitItem((await kick(sb)).toolkit).reason, /already installed: github/);
});

test('installed for the user, not at all, and other wordings of the same line', async () => {
  const sb = sandbox({ plan: LINE });
  installPlugins(sb.home, 'github@claude-plugins-official');
  assert.match(gitItem((await kick(sb)).toolkit).reason, /already installed: github/);
  for (const line of ['- Triage GitHub issues every Monday', '- Open issues on GitHub for each bug found in review']) {
    const s = sandbox({ plan: `${line}\n` });
    settings(s, 'settings.json', { enabledPlugins: { 'github@claude-plugins-official': true } });
    assert.match(gitItem((await kick(s)).toolkit).reason, /already installed: github/, line);
  }
  const none = sandbox({ plan: LINE });
  assert.equal(gitItem((await kick(none)).toolkit).action, 'install');
});

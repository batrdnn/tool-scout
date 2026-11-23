import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsOnly, osFamily } from '../scripts/lib/taxonomy.mjs';
import { recommend } from '../scripts/lib/rank.mjs';
import { mergeRepos } from '../scripts/lib/crawl.mjs';

const only = (name, description) => platformsOnly({ name, description });

test('osFamily maps process.platform', () => {
  assert.equal(osFamily('darwin'), 'macos');
  assert.equal(osFamily('win32'), 'windows');
  assert.equal(osFamily('linux'), 'linux');
  assert.equal(osFamily('freebsd'), null);
});

test('platformsOnly: an OS the repo runs on, not one it merely talks about', () => {
  assert.deepEqual(only('sandbox-mcp', 'MCP server that runs code in Windows Sandbox for testing'), ['windows']);
  assert.deepEqual(only('mac-notify', 'macOS-only menu bar notifications for Claude Code'), ['macos']);
  assert.deepEqual(only('win-automation-mcp', 'Desktop UI automation MCP server'), ['windows']);
  assert.deepEqual(only('pc-tools', 'Native Windows app integration for agents (PowerShell, registry)'), ['windows']);
  assert.deepEqual(only('xclip-mcp', 'Clipboard MCP server for Linux desktops'), ['linux']);
  assert.deepEqual(only('anywhere', 'Runs on macOS, Windows and Linux'), [], 'cross-platform');
  assert.deepEqual(only('ssh-mcp', 'Manage your Linux servers over SSH'), [], 'a remote target, not where it runs');
  assert.deepEqual(only('ios-sim', 'Drive the iOS simulator from Claude Code'), [], 'iOS is a target, not the desktop OS');
  assert.deepEqual(only('darwin-kit', 'Evolutionary search toolkit'), []);
  assert.deepEqual(only('winston-mcp', 'Logging MCP server'), []);
});

test('recommend pushes down repos that only run on another OS', () => {
  const r = (name, description) => ({ full_name: `o/${name}`, name, owner: { login: 'o', type: 'Organization' }, html_url: `https://github.com/o/${name}`, description, topics: ['mcp-server'], language: 'TypeScript', stargazers_count: 3000, forks_count: 100, license: { spdx_id: 'MIT' }, archived: false, fork: false, created_at: '2025-01-01T00:00:00Z', pushed_at: new Date().toISOString() });
  const cat = { repos: {} };
  mergeRepos(cat, [r('win-test-mcp', 'Windows Sandbox MCP server for e2e testing'), r('test-runner-mcp', 'MCP server for e2e testing')]);
  cat.repos['o/win-test-mcp'].stars = 30000; // much more popular, so it would win on momentum/trust alone
  const p = { sessions: 4, topics: { testing: 4 }, friction: {}, languages: {}, installed: { names: [], repos: [] } };
  const onMac = recommend(p, cat, { top: 5, platform: 'darwin' });
  assert.deepEqual(onMac.map((x) => x.name), ['o/test-runner-mcp', 'o/win-test-mcp']);
  assert.deepEqual(onMac[1].platformOnly, ['windows']);
  const onWin = recommend(p, cat, { top: 5, platform: 'win32' });
  assert.equal(onWin[0].name, 'o/win-test-mcp');
  assert.equal(onWin[0].platformOnly, undefined);
});

test('"windows" in a name can mean UI windows', () => {
  assert.deepEqual(only('claude-desktop-multiple-windows', 'Multiple windows for Claude Desktop with different APIs at the same time'), []);
});

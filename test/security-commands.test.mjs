// Security review, commands: the only process Tool Scout starts is `claude plugin …` / `claude mcp …`
// (plus git rev-parse), built from fixed words and checked names. README lines are tokenized
// without a shell; env and header values are never kept. (docs/security-review.md, "Commands")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlan } from '../scripts/lib/installer.mjs';
import { mcpCommands } from '../scripts/lib/install.mjs';
import { setup } from './security-helpers.mjs';

const mcp = (line) => mcpCommands('```\n' + line + '\n```')[0];
async function planFor(readme) {
  const s = setup({ m: { readme, files: { 'index.js': '' }, topics: ['mcp-server'] } });
  return makePlan({ ...s.ctx(), repo: 'o/m' });
}

test('option injection through the server name is impossible: names must start with a letter or digit', () => {
  for (const line of ['claude mcp add -- --scope=project x', 'claude mcp add "--transport=http" x', 'claude mcp add "-e" x', 'claude mcp add ";id" x', 'claude mcp add "a b" x', 'claude mcp add $(id) x']) {
    const c = mcp(line);
    assert.ok(!c || c.rejected || /^[A-Za-z0-9]/.test(c.name), line);
  }
});

test('a stdio server always goes after --, so its own options never reach claude mcp add', async () => {
  const p = await planFor('```\nclaude mcp add srv -- node --scope=project -e K=V --header "X: y" srv.js\n```');
  const c = p.body.commands[0];
  const dash = c.indexOf('--');
  assert.ok(dash > 0, c.join(' '));
  assert.deepEqual(c.slice(0, dash), ['mcp', 'add', 'srv', '--scope', 'user']);
});

test('env and header values in a README line are never kept, planned or written', async () => {
  const p = await planFor('```\nclaude mcp add srv -e API_KEY=sk-live-SECRET123 -H "Authorization: Bearer SECRET456" -- npx -y srv@1.0.0\n```');
  const s = JSON.stringify(p);
  assert.ok(!/SECRET123|SECRET456/.test(s), s);
  assert.deepEqual(p.body.credentials, ['API_KEY']);
});

test('shell characters anywhere (even quoted), a shell or downloader as the server, or unknown options: refused', () => {
  for (const line of ['claude mcp add x -- node "a;b"', 'claude mcp add x -- /bin/bash -c y', 'claude mcp add x -- env FOO=1 node', 'claude mcp add x -- sudo node',
    'claude mcp add x --allow-everything -- node', 'claude mcp add x -- node "$(id)"', 'claude mcp add x -- node a\u0007b']) {
    const c = mcp(line);
    assert.ok(!c || c.rejected, line);
  }
  // A backtick ends inline code in markdown: the line stops there, and what's left is shown and run without a shell.
  assert.deepEqual(mcp('claude mcp add x -- node a`id`').args, ['a']);
});

test('marketplace and plugin names with shell or path characters are refused', async () => {
  for (const [mk, plug] of [['tools; rm -rf ~', 'p'], ['tools', '../p'], ['tools', 'p$(id)'], ['-tools', 'p'], ['tools', 'p@evil']]) {
    const s = setup({ p: { readme: '# p', topics: ['claude-code-plugin'], files: { '.claude-plugin/marketplace.json': JSON.stringify({ name: mk, plugins: [{ name: plug, source: './p' }] }) } } });
    const p = await makePlan({ ...s.ctx(), repo: 'o/p' });
    assert.ok(p.body.blockers.some((b) => /unsafe names/.test(b)), `${mk} ${plug}`);
    assert.deepEqual(p.body.commands, []);
  }
});

// Medium M2 in docs/security-review.md (fixed in 0.12.2): an http/sse server's target must be an http(s) URL.
test('an http server\'s target is a URL, never an option', async () => {
  for (const line of ['claude mcp add --transport http srv -- --scope=local', 'claude mcp add -t sse srv -- -e', 'claude mcp add --transport http srv -- file:///etc/passwd', 'claude mcp add --transport http srv -- node srv.js']) {
    assert.ok(mcp(line).rejected, line);
  }
  const p = await planFor('```\nclaude mcp add --transport http srv -- --scope=local\n```');
  assert.deepEqual(p.body.commands, []);
  assert.ok(p.body.blockers.length, 'the plan is blocked');
  const ok = await planFor('```\nclaude mcp add --transport http srv https://srv.example/mcp\n```');
  assert.deepEqual(ok.body.commands, [['mcp', 'add', 'srv', '--transport', 'http', '--scope', 'project', 'https://srv.example/mcp']]); // a remote server defaults to project scope (v0.16.1)
});

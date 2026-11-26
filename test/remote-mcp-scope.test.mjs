// v0.16.1 made a remote MCP server default to project scope. v0.17 (review E3) does the same for
// everything that writes: the default is project, and user scope is only ever an explicit --scope user.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, formatPlan } from '../scripts/lib/installer.mjs';
import { setup } from './security-helpers.mjs';

const REMOTE = '```\nclaude mcp add --transport http srv https://srv.example/mcp\n```';
const LOCAL = '```\nclaude mcp add srv -- node srv.js\n```';
const plan = (readme, extra = {}) => {
  const s = setup({ m: { readme, files: { 'index.js': '' }, topics: ['mcp-server'] } });
  return makePlan({ ...s.ctx(), repo: 'o/m', ...extra });
};

test('a remote MCP server defaults to project scope (this project\'s .mcp.json)', async () => {
  const p = await plan(REMOTE);
  assert.equal(p.body.scope, 'project');
  assert.deepEqual(p.body.commands, [['mcp', 'add', 'srv', '--transport', 'http', '--scope', 'project', 'https://srv.example/mcp']]);
  assert.ok(p.body.settings[0].file.endsWith('.mcp.json'), p.body.settings[0].file);
  assert.match(formatPlan(p), /Data you send through it goes to srv\.example/);
});

test('an explicit --scope user is still honored for a remote server, and the plan says it applies everywhere', async () => {
  const p = await plan(REMOTE, { scope: 'user' });
  assert.equal(p.body.scope, 'user');
  assert.deepEqual(p.body.commands[0].slice(5, 7), ['--scope', 'user']);
  assert.match(formatPlan(p), /Note:\s+User scope: this applies in every project/);
});

test('a local (stdio) server now defaults to project scope too (it was user scope before v0.17)', async () => {
  const p = await plan(LOCAL);
  assert.equal(p.body.scope, 'project');
  assert.ok(p.body.settings[0].file.endsWith('.mcp.json'), p.body.settings[0].file);
});

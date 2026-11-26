// v0.16.1: a hosted (remote) MCP server defaults to project scope; a local one keeps the user default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makePlan, formatPlan } from '../scripts/lib/installer.mjs';
import { setup } from './security-helpers.mjs';

const REMOTE = '```\nclaude mcp add --transport http srv https://srv.example/mcp\n```';
const LOCAL = '```\nclaude mcp add srv -- node srv.js\n```';
const plan = (readme, extra = {}) => {
  const s = setup({ m: { readme, files: { 'index.js': '' }, topics: ['mcp-server'] } });
  return makePlan({ ...s.ctx(), repo: 'o/m', ...extra });
};


test('a remote MCP server defaults to project scope, and says why', async () => {
  const p = await plan(REMOTE);
  assert.equal(p.body.scope, 'project');
  assert.deepEqual(p.body.commands, [['mcp', 'add', 'srv', '--transport', 'http', '--scope', 'project', 'https://srv.example/mcp']]);
  assert.ok(p.body.settings[0].file.endsWith('.mcp.json'), p.body.settings[0].file);
  assert.match(formatPlan(p), /Note: .*remote.*project scope.*--scope user/i);
});

test('an explicit --scope user is still honored for a remote server', async () => {
  const p = await plan(REMOTE, { scope: 'user' });
  assert.equal(p.body.scope, 'user');
  assert.deepEqual(p.body.commands[0].slice(5, 7), ['--scope', 'user']);
});

test('a local (stdio) server keeps the user-scope default', async () => {
  const p = await plan(LOCAL);
  assert.equal(p.body.scope, 'user');
});

test('the skills tell the user a remote server was planned at project scope, and that --scope user is theirs to ask for', () => {
  for (const f of ['skills/check/SKILL.md', 'skills/scout/SKILL.md']) {
    const md = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
    assert.match(md, /remote server is planned at project scope by default: say so, and that `--scope user` is the user's to ask for/, f);
  }
});

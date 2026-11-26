// v0.16.1: the plan for a hosted (remote) MCP server says in plain words that data sent through it goes
// to the host, whose service was not scanned; for verdict "review" the skills offer "Skip (recommended)" first.
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


test('the plan says in plain words where data goes, and that the service was not scanned', async () => {
  const text = formatPlan(await plan(REMOTE));
  assert.match(text, /Data you send through it goes to srv\.example/);
  assert.match(text, /not that service/);
  assert.doesNotMatch(formatPlan(await plan(LOCAL)), /Data you send through it/);
});

test('the host is written out, never raw repo text', async () => {
  const p = await plan('```\nclaude mcp add --transport http srv https://srv.example/mcp\n```');
  const note = p.body.notes.find((n) => /Data you send/.test(n));
  assert.ok(note && !/[\u0000-\u001f]/.test(note));
});

test('the skills offer "Skip (recommended)" first for a remote server with verdict review', () => {
  for (const f of ['skills/check/SKILL.md', 'skills/scout/SKILL.md']) {
    const md = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
    assert.match(md, /Data you send through it goes to/, f);
    assert.match(md, /"Skip \(recommended\)" first/, f);
    assert.match(md, /verdict is "review"/, f);
  }
});

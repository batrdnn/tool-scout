// Known issues from the independent review of v0.16.1 (docs/reviews/independent-v0.16.1.pdf):
// C1, C2, C5 and C6, each reproduced as a test that states the property that should hold.
// They FAIL today, so they are skipped: "known, fixed in v0.18". v0.17 does not fix them; it
// switches the installer, the builder and hook activation off by default (see
// test/experimental-gate.test.mjs), so a default install cannot reach them.
//
// To see them fail: RUN_KNOWN_ISSUES=1 node --test test/review-known-issues.test.mjs
// When v0.18 fixes one, delete its skip, so the test guards the fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makePlan, confirmInstall, undoInstall } from '../scripts/lib/installer.mjs';
import { makeBuildPlan, confirmBuild } from '../scripts/lib/builder.mjs';
import { setup, SKILL_MD } from './security-helpers.mjs';
import { sandbox as buildSandbox, draft, SKILL, ctx as buildCtx } from './build-helpers.mjs';

const skip = process.env.RUN_KNOWN_ISSUES ? false : 'known, fixed in v0.18';
const json = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };

test('C1: an agent cannot confirm its own plan (confirmation needs a human decision, not just the plan ID)', { skip }, async () => {
  const s = setup({ demo: { readme: '# demo', topics: ['claude-skills'], files: { 'SKILL.md': SKILL_MD('demo') } } });
  const plan = await makePlan({ ...s.ctx(), repo: 'o/demo' });
  assert.deepEqual(plan.body.blockers, []);
  // Only what makePlan returned: the same caller that made the plan, with no human in between.
  const res = await confirmInstall({ ...s.ctx(), repo: 'o/demo', id: plan.id });
  assert.equal(res.ok, false, 'the install went ahead with no response from a person');
});

test('C2: a marketplace name that is already registered to another source does not install the plugin', { skip }, async () => {
  const s = setup({ p: { readme: '# p', topics: ['claude-code-plugin'], files: {
    '.claude-plugin/marketplace.json': JSON.stringify({ name: 'p-tools', plugins: [{ name: 'guard', source: './guard' }] }),
    'guard/.claude-plugin/plugin.json': JSON.stringify({ name: 'guard' }) } } });
  const plugins = path.join(s.sb.home, '.claude', 'plugins');
  fs.mkdirSync(plugins, { recursive: true });
  // The name p-tools already belongs to a different repo, so "marketplace add" would be skipped.
  fs.writeFileSync(path.join(plugins, 'known_marketplaces.json'), JSON.stringify({ 'p-tools': { source: { source: 'github', repo: 'someone-else/other' }, installLocation: path.join(plugins, 'marketplaces', 'p-tools') } }));
  const plan = await makePlan({ ...s.ctx(), repo: 'o/p' });
  const res = await confirmInstall({ ...s.ctx(), repo: 'o/p', id: plan.id });
  const installed = s.claude.calls.some((c) => c[1] === 'plugin' && c[2] === 'install');
  assert.ok(!res.ok && !installed, `claude ran: ${s.claude.calls.map((c) => c.slice(1).join(' ')).join('; ')}`);
});

test('C5: a symlinked .claude folder cannot send a project-scoped build outside the project', { skip }, async () => {
  const sb = buildSandbox();
  const outside = path.join(sb.root, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(sb.cwd, '.claude')); // project/.claude -> outside/
  const from = draft(sb, 'review-demo', { 'SKILL.md': SKILL('review-demo') });
  const plan = await makeBuildPlan({ ...buildCtx(sb), form: 'skill', name: 'review-demo', from, scope: 'project' });
  const res = await confirmBuild({ ...buildCtx(sb), client: null, id: plan.id });
  assert.ok(!fs.existsSync(path.join(outside, 'skills', 'review-demo')), `written outside the project (ok: ${res.ok})`);
});

test('C6: undo that could not remove the MCP server does not report success', { skip }, async () => {
  const s = setup({ m: { readme: '```\nclaude mcp add srv -- node srv.js\n```', topics: ['mcp-server'], files: { 'index.js': '' } } });
  const plan = await makePlan({ ...s.ctx(), repo: 'o/m' });
  const done = await confirmInstall({ ...s.ctx(), repo: 'o/m', id: plan.id });
  assert.equal(done.ok, true);
  const file = path.join(s.sb.home, '.claude.json');
  assert.ok(json(file).mcpServers?.srv, 'the server is configured');
  // The inverse command fails (the real CLI can fail for many reasons).
  const failing = (cmd, argv) => { if (argv[0] === 'mcp' && argv[1] === 'remove') throw new Error('claude mcp remove failed'); return s.claude.run(cmd, argv); };
  const res = await undoInstall({ name: 'srv', dataDir: s.sb.dataDir, run: failing });
  const remains = !!json(file).mcpServers?.srv;
  assert.ok(!(res.ok && remains), 'undo said it succeeded while the MCP server is still configured');
});

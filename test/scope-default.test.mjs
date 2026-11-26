// v0.17 (review E3): anything that writes defaults to project scope, never user. Global (user) scope
// is only ever an explicit --scope user, and the plan says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makePlan, formatPlan } from '../scripts/lib/installer.mjs';
import { makeBuildPlan, formatBuildPlan } from '../scripts/lib/builder.mjs';
import { setup, SKILL_MD } from './security-helpers.mjs';
import { sandbox, draft, SKILL, ctx as buildCtx } from './build-helpers.mjs';

const REPOS = {
  sk: { readme: '# s', topics: ['claude-skills'], files: { 'SKILL.md': SKILL_MD('sk') } },
  pl: { readme: '# p', topics: ['claude-code-plugin'], files: { '.claude-plugin/marketplace.json': JSON.stringify({ name: 'pl-tools', plugins: [{ name: 'guard', source: './guard' }] }), 'guard/.claude-plugin/plugin.json': '{"name":"guard"}' } },
  loc: { readme: '```\nclaude mcp add loc -- node loc.js\n```', topics: ['mcp-server'], files: { 'index.js': '' } },
  rem: { readme: '```\nclaude mcp add --transport http rem https://rem.example/mcp\n```', topics: ['mcp-server'], files: { 'index.js': '' } },
};

for (const [name, kind] of [['sk', 'skill'], ['pl', 'plugin'], ['loc', 'local MCP server'], ['rem', 'remote MCP server']]) {
  test(`install plan, ${kind}: project scope by default, user only when asked`, async () => {
    const s = setup(REPOS);
    const def = await makePlan({ ...s.ctx(), repo: `o/${name}` });
    assert.equal(def.body.scope, 'project');
    for (const c of def.body.commands) if (c.includes('--scope')) assert.equal(c[c.indexOf('--scope') + 1], 'project');
    const user = await makePlan({ ...s.ctx(), repo: `o/${name}`, scope: 'user' });
    assert.equal(user.body.scope, 'user');
  });
}

test('install plan, skill: the default destination is the project\'s .claude/skills, not ~/.claude/skills', async () => {
  const s = setup(REPOS);
  const p = await makePlan({ ...s.ctx(), repo: 'o/sk' });
  assert.deepEqual(p.body.writes.map((w) => w.path), [path.join(s.sb.cwd, '.claude', 'skills', 'sk', 'SKILL.md')]);
  assert.match(formatPlan(p, { home: s.sb.home }), /^Scope:     project$/m);
});

test('the plan says global scope is the user\'s to ask for, only for --scope user', async () => {
  const s = setup(REPOS);
  const user = await makePlan({ ...s.ctx(), repo: 'o/sk', scope: 'user' });
  assert.match(user.body.notes.join('\n'), /user scope[^.]*every project[^.]*explicitly/i);
  const def = await makePlan({ ...s.ctx(), repo: 'o/sk' });
  assert.doesNotMatch(def.body.notes.join('\n'), /user scope[^.]*every project/i);
});

for (const [form, files] of [
  ['skill', { 'SKILL.md': SKILL('fx') }],
  ['command', { 'fx.md': '---\ndescription: Summarize what changed since yesterday for a standup\n---\nList the commits since yesterday.\n' }],
]) {
  test(`build plan, ${form}: project scope by default`, async () => {
    const sb = sandbox();
    const from = draft(sb, 'fx', files);
    const p = await makeBuildPlan({ ...buildCtx(sb), form, name: 'fx', from });
    assert.equal(p.body.scope, 'project');
    for (const w of p.body.writes) assert.ok(w.path.startsWith(sb.cwd + path.sep), `${w.path} is outside the project`);
    const u = await makeBuildPlan({ ...buildCtx(sb), form, name: 'fx', from, scope: 'user' });
    assert.equal(u.body.scope, 'user');
    assert.match(formatBuildPlan(u, { home: sb.home }), /every project/i);
  });
}

test('the personal scope (a hook\'s script lives under ~/.claude/hooks) is never a default', async () => {
  const src = fs.readFileSync(new URL('../scripts/lib/builder.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /scope = scope \|\| [^;]*'(user|personal)'\)/);
});

test('the skills tell the user the default is project, and that --scope user is theirs to ask for', () => {
  for (const f of ['skills/check/SKILL.md', 'skills/scout/SKILL.md']) {
    const md = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
    assert.match(md, /everything is planned at project scope by default: say so, and that `--scope user` is the user's to ask for/i, f);
    assert.doesNotMatch(md, /add `--scope project`\s+only if the user asked for this project only/, f);
  }
});

// v0.14.1 item 2: every plan line gets an answer: a tool, "nothing needed: Claude does this directly",
// "already installed: <name>", or "outside Claude Code: <one line>". No line is silently skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runKickoff, extractNeeds, formatKickoff } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW, catalogRepo, installPlugins } from './kickoff-helpers.mjs';

const PLAN = fs.readFileSync(new URL('./fixtures/kickoff/v0141-plan.md', import.meta.url), 'utf8');
const kick = (sb, o = {}) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null, ...o });
const withCatalog = (sb, repos) => {
  const f = path.join(sb.dataDir, 'catalog.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of repos) c.repos[r.full_name] = r;
  fs.writeFileSync(f, JSON.stringify(c));
};
const review = () => [
  catalogRepo('alibaba/open-code-review', 'Secure, fast code review for GitHub issues and pull requests', { topics: ['claude-skills'], stars: 56000 }),
  catalogRepo('github/github-mcp-server', "GitHub's official MCP Server: manage GitHub issues, pull requests and repositories", { topics: ['mcp-server'], stars: 30000 }),
];

test('item 2: every task line of today\'s plan gets an answer', async () => {
  const sb = sandbox({ plan: PLAN });
  const { needs: n, toolkit } = await kick(sb);
  const answered = [n.direct, n.outside, n.builtins, n.needs].flatMap((g) => (g || []).flatMap((x) => x.lines));
  answered.push(...(n.other || []));
  const bullets = [...PLAN.split('## Stack')[0].split(/\n(?=- )/)].filter((b) => b.startsWith('- ')).map((b) => b.replace(/^- /, '').replace(/\s*\n\s*/g, ' ').trim().replace(/[.;]$/, ''));
  const tasks = bullets.slice(0, 6);
  assert.equal(tasks.length, 6);
  for (const t of tasks) assert.ok(answered.includes(t), `no answer for: ${t}`);
  assert.ok(toolkit.outside?.length && toolkit.direct.length);
});

test('item 2: the answers use the agreed wording', async () => {
  const sb = sandbox({ plan: PLAN });
  const { toolkit } = await kick(sb);
  const byId = (g, id) => toolkit[g].find((d) => d.id === id);
  for (const d of toolkit.direct) assert.match(d.reason, /nothing needed: Claude does this directly: \S/);
  for (const d of toolkit.outside) assert.match(d.reason, /outside Claude Code: \S/);
  assert.match(byId('outside', 'recording').reason, /terminal recorder/);
  assert.ok(byId('outside', 'recruit') && byId('outside', 'submit'));
  assert.ok(byId('direct', 'faq') && byId('direct', 'post') && byId('direct', 'icon') && byId('direct', 'ci'));
  const text = formatKickoff({ needsFile: 'x', needs: (await kick(sb)).needs, toolkit });
  assert.match(text, /outside Claude Code/);
});

test('item 2: a task line that matches nothing is "nothing needed: Claude does this directly", not skipped', async () => {
  const sb = sandbox({ plan: '## Tasks\n- Rename the zebra module and update its callers\n' });
  const { toolkit, needs } = await kick(sb);
  assert.deepEqual(needs.other, ['Rename the zebra module and update its callers']);
  assert.match(toolkit.other[0].reason, /nothing needed: Claude does this directly: /);
});

test('item 2: a tool already installed is answered "already installed: <name>"', async () => {
  const sb = sandbox({ plan: '- Track bug reports as GitHub issues and triage them weekly\n' });
  installPlugins(sb.home, 'github@claude-plugins-official');
  const { toolkit } = await kick(sb);
  const git = toolkit.items.find((i) => i.topic === 'git');
  assert.equal(git.action, 'nothing');
  assert.match(git.reason, /already installed: github/);
});

test('the skill tells Claude to relay the outside and other answers', () => {
  const SKILL = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
  assert.match(SKILL, /`toolkit\.outside`/);
  assert.match(SKILL, /`toolkit\.other`/);
  assert.match(SKILL, /outside Claude Code/);
});


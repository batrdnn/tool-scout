// v0.14.1 item 3: built-in features as answers: a status line is the built-in /statusline.
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

test('item 3: a status line is answered by the built-in /statusline', async () => {
  const sb = sandbox({ plan: '- Add a status line companion that shows the user\'s animal\n' });
  const { toolkit } = await kick(sb);
  const s = toolkit.items.find((i) => i.action === 'builtin');
  assert.equal(s.name, '/statusline');
  assert.equal(s.next, undefined);
  assert.match(s.reason, /type \/statusline yourself/);
  assert.ok(!toolkit.items.some((i) => i.action === 'install'));
});


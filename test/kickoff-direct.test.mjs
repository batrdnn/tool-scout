// v0.11.1 item 3: needs that are not tool needs (CI config files, icons, writing posts) are
// "nothing needed: Claude does this directly", with one line on how. They are listed apart from the
// 5 items to set up, and they never match a catalog tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runKickoff, extractNeeds, formatKickoff } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW, catalogRepo } from './kickoff-helpers.mjs';
import path from 'node:path';

const PLAN = `## Tasks
- Set up CI: run \`npm test\` on every push
  and pull request with GitHub Actions, on macOS and Linux
- Add an icon (the validator still warns ICON_MISSING)
- Write a launch post explaining what it does
- Write pytest tests for every strategy
`;
const kick = (sb, o = {}) => runKickoff({ planFile: sb.planFile, project: sb.project, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null, ...o });

test('CI config, icons and posts are direct needs, with one line on how', () => {
  const n = extractNeeds(PLAN);
  assert.deepEqual(n.direct.map((d) => d.id).sort(), ['ci', 'icon', 'post']);
  const ci = n.direct.find((d) => d.id === 'ci');
  assert.match(ci.lines[0], /^Set up CI: run `npm test` on every push and pull request with GitHub Actions/, 'a wrapped bullet is one line');
  for (const d of n.direct) assert.ok(d.how.length > 10 && !d.how.includes('\n'));
  assert.ok(!n.needs.some((x) => x.lines.some((l) => /GitHub Actions|icon|launch post/i.test(l))), 'they do not feed the tool matching');
});

test('the toolkit lists them as "nothing needed: Claude does this directly", apart from the 5 items', async () => {
  const sb = sandbox({ plan: PLAN });
  const c = JSON.parse(fs.readFileSync(path.join(sb.dataDir, 'catalog.json'), 'utf8'));
  const t = catalogRepo('jwuthri-cloud/Tracely-ai', 'Trace-native CI/CD for AI agents: grade production traces', { topics: ['mcp-server'] });
  c.repos[t.full_name] = t; fs.writeFileSync(path.join(sb.dataDir, 'catalog.json'), JSON.stringify(c));
  const r = await kick(sb);
  assert.deepEqual(r.toolkit.direct.map((d) => d.id).sort(), ['ci', 'icon', 'post']);
  for (const d of r.toolkit.direct) {
    assert.equal(d.action, 'nothing');
    assert.match(d.reason, /nothing needed: Claude does this directly: \S/);
    assert.equal(d.next, undefined);
  }
  assert.ok(!JSON.stringify(r.toolkit).includes('Tracely'));
  assert.ok(!r.toolkit.items.some((i) => i.direct), 'not among the items to set up');
  const text = formatKickoff(r);
  assert.match(text, /Claude does this directly/);
});

test('a plan line is not a direct need just because a word fits: a README or a CI library is not', () => {
  const n = extractNeeds('- Polish the README with a short demo GIF and a FAQ\n- Use the pytest library\n');
  assert.deepEqual(n.direct, []);
});

test('lines under a Stack heading describe the stack, not tasks', () => {
  const n = extractNeeds('## Stack\n- Tests with node:test, GitHub for hosting and releases\n## Tasks\n- Write pytest tests\n');
  assert.ok(!n.needs.some((x) => x.lines.some((l) => /hosting/.test(l))));
  assert.ok(n.needs.some((x) => x.topic === 'testing'));
});

test('the skill lists the direct needs apart from the items', () => {
  const SKILL = fs.readFileSync(new URL('../skills/kickoff/SKILL.md', import.meta.url), 'utf8');
  assert.match(SKILL, /`toolkit\.direct`/);
  assert.match(SKILL, /Claude does this directly/);
});

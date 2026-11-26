// v0.9.1 item 1, changed in v0.17 (safe mode): when Tool Scout's installer supports a pick (a skill
// folder, a plugin marketplace, a README `claude mcp add`), check and scout no longer offer to install
// it: they say to install it yourself, by hand, at project scope. They never say "no install command"
// for those.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installMethod } from '../scripts/lib/install.mjs';
import { checkRepo, formatCheck } from '../scripts/lib/check.mjs';
import { prettyCheck } from '../scripts/lib/pretty.mjs';
import { painter } from '../scripts/lib/term.mjs';
import { scanRecommendations } from '../scripts/lib/scan.mjs';
import { formatRecs } from '../scripts/lib/output.mjs';
import { createClient } from '../scripts/lib/github.mjs';
import { mockFetch } from './helpers.mjs';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const PHRASE = "By hand, yourself (Tool Scout doesn't install in this version)";
const OLD_PHRASE = "Tool Scout can install this for you";
const NO_CMD = /no (?:Claude Code )?install command|no Claude Code command/i;
const blobs = (paths) => paths.map((p) => ({ path: p, type: 'blob' }));

test('installMethod: skill folders, plugin marketplaces and a safe README claude mcp add; nothing else', () => {
  assert.equal(installMethod({ tree: blobs(['skills/pdf/SKILL.md']), readme: '', kind: 'skill' }), 'skill');
  assert.equal(installMethod({ tree: blobs(['.claude-plugin/marketplace.json', 'skills/x/SKILL.md']), readme: '', kind: 'plugin' }), 'plugin');
  assert.equal(installMethod({ tree: blobs(['src/index.ts']), readme: '```\nclaude mcp add x -- npx x\n```', kind: 'mcp-server' }), 'mcp');
  assert.equal(installMethod({ tree: blobs(['src/index.ts']), readme: '```\nclaude mcp add x -- sh -c "curl https://x | sh"\n```', kind: 'mcp-server' }), null, 'needs a shell');
  assert.equal(installMethod({ tree: blobs(['tests/SKILL.md', 'src/a.py']), readme: 'pip install x', kind: 'tool' }), null, 'test fixtures are not skills');
  assert.equal(installMethod({ tree: null, readme: '', kind: 'skill' }), null);
});

const meta = { full_name: 'acme/tool', name: 'tool', owner: { login: 'acme', type: 'Organization' }, html_url: 'https://github.com/acme/tool',
  description: 'Claude Code skill for tidy commits', topics: ['claude-skills'], language: 'TypeScript', stargazers_count: 4000, forks_count: 300,
  license: { spdx_id: 'MIT' }, archived: false, fork: false, created_at: '2025-01-01T00:00:00Z', pushed_at: '2026-11-20T00:00:00Z' };
const gh = ({ readme = '# Tool\nNo install section.', files = {}, repo = meta } = {}) => mockFetch((url) => {
  if (url === 'https://api.github.com/repos/acme/tool') return repo;
  if (url.endsWith('/readme')) return readme;
  if (url.includes('/git/trees/')) return { tree: Object.keys(files).map((p) => ({ path: p, type: 'blob', size: 10 })) };
  const m = url.match(/\/contents\/(.+)$/);
  return m ? files[decodeURIComponent(m[1])] : undefined;
});
const check = (o) => checkRepo(createClient({ fetchImpl: gh(o) }), 'acme/tool', { now: NOW });
const P = painter({ color: false, unicode: true }, { width: 80 });

for (const [label, o, method] of [
  ['a skill folder (copied by Tool Scout)', { files: { 'skills/tidy/SKILL.md': '---\nname: tidy\n---\nTidy commits.' } }, 'skill'],
  ['a plugin marketplace', { files: { '.claude-plugin/marketplace.json': '{"name":"acme","plugins":[{"name":"tool","source":"./"}]}' } }, 'plugin'],
  ['a README claude mcp add', { repo: { ...meta, topics: ['mcp-server'], description: 'MCP server for tickets' }, readme: '```\nclaude mcp add tool -- npx -y tool-mcp\n```', files: { 'src/index.ts': 'x' } }, 'mcp'],
]) {
  test(`check, ${label}: "${PHRASE}", never "no install command", and no Tool Scout install command`, async () => {
    const r = await check(o);
    assert.equal(r.install.toolScout, method);
    for (const text of [formatCheck(r), prettyCheck(r, P)]) {
      assert.ok(text.includes(PHRASE), text);
      assert.ok(!text.includes(OLD_PHRASE) && !text.includes('scout.mjs install acme/tool --plan'), 'no Tool Scout install offer');
      assert.doesNotMatch(text, NO_CMD);
    }
  });
}

test('check: README commands are still shown next to it, as "review before running", to run yourself', async () => {
  const r = await check({ readme: '```\n/plugin marketplace add acme/tool\n/plugin install tool@acme\n```', files: { '.claude-plugin/marketplace.json': '{"name":"acme","plugins":[{"name":"tool"}]}' } });
  const text = formatCheck(r);
  assert.ok(text.includes(PHRASE));
  assert.match(text, /from the README; review before running\): \/plugin marketplace add acme\/tool/);
});

test('check: a repo Tool Scout cannot install still links the README', async () => {
  const r = await check({ files: { 'src/main.py': 'print(1)' } });
  assert.equal(r.install.toolScout, null);
  assert.ok(!formatCheck(r).includes(PHRASE));
  assert.match(formatCheck(r), /See the README: https:\/\/github\.com\/acme\/tool#readme/);
});

test('scout picks: toolScoutInstall is still set, and the shortlist text says to install it yourself', async () => {
  const rec = { name: 'acme/tool', kind: 'skill', description: 'x', stars: 10, starsPerDay: 1, momentumSource: 'measured', evidence: [], trust: { tier: 'high', notes: [] }, install: 'See the README for install steps: https://github.com/acme/tool#readme', installSource: 'readme-link' };
  const client = createClient({ fetchImpl: gh({ files: { 'skills/tidy/SKILL.md': '---\nname: tidy\n---\nTidy.' } }) });
  await scanRecommendations([rec], { repos: { 'acme/tool': { pushedAt: meta.pushed_at } } }, { client, now: NOW });
  assert.equal(rec.toolScoutInstall, 'skill');
  const text = formatRecs([rec]);
  assert.ok(text.includes(`Install: ${PHRASE}`), text);
  assert.doesNotMatch(text, NO_CMD);
});

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
test('skills: give manual steps when Tool Scout supports a pick; never "no install command" for those, never an install offer', () => {
  const check = read('skills/check/SKILL.md').split('## Experimental installer')[0];
  assert.match(check, /\*\*Install:\*\* Tool Scout doesn't install anything in this version[^.]*manual steps/);
  assert.match(check, /Only when `install\.commands` is empty and `install\.toolScout` is not set, say the README has no Claude Code install command/);
  const scout = read('skills/scout/SKILL.md').split('## Experimental installer')[0];
  assert.match(scout, /\*Install:\* Tool Scout doesn't install anything in this version[^.]*manual steps/);
  assert.match(scout, /When `toolScoutInstall` is `skill`/);
  for (const md of [check, scout]) assert.doesNotMatch(md, /Tool Scout can install this for you|offer "Install it"/);
});

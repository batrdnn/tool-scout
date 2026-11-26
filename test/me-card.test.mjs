// The shareable SVG card from `scout.mjs me --card out.svg`: animal, title and 3 general stats only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { whoAmI, meCard, cardStats, ORDER, ANIMALS } from '../scripts/lib/me.mjs';
import { buildProfile } from '../scripts/lib/profile.mjs';
import { materialize, PERSONAS } from './eval/personas.mjs';
import { prof } from './helpers.mjs';
import { fileURLToPath } from 'node:url';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const card = (p, as) => meCard(whoAmI(p, { as }), p);

/** Every string a profile holds: string values anywhere, plus the keys of count maps (topic, tool, library … names). */
function profileStrings(o, out = new Set()) {
  if (typeof o === 'string') out.add(o);
  else if (Array.isArray(o)) o.forEach((x) => profileStrings(x, out));
  else if (o && typeof o === 'object') {
    const vals = Object.values(o);
    if (vals.length && vals.every((v) => typeof v === 'number')) Object.keys(o).forEach((k) => out.add(k));
    vals.forEach((v) => profileStrings(v, out));
  }
  return out;
}
const appears = (s, svg) => new RegExp(`(?<![A-Za-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i').test(svg);

/** A fake home whose history is full of private-looking names: project, paths, prompts, commands, libraries, tools. */
function privateHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-card-'));
  const cwd = path.join(home, 'zqclient-acme', 'zqrepo-secret');
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { 'zqlib-core': '1', react: '18', prisma: '5' } }));
  fs.writeFileSync(path.join(cwd, 'requirements.txt'), 'pandas\nzqpylib\n');
  const proj = path.join(home, '.claude', 'projects', '-zqclient-acme-zqrepo-secret');
  fs.mkdirSync(proj, { recursive: true });
  const user = (t) => JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: t } });
  const tool = (name, input) => JSON.stringify({ type: 'assistant', cwd, message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } });
  for (let i = 0; i < 12; i++) {
    fs.writeFileSync(path.join(proj, `s${i}.jsonl`), [
      user(`zqprompt: fix the react tests for Zqcustomer, still failing ${i}`),
      tool('Bash', { command: 'zqdeploy-acme --prod && npm test && git commit -m zqmsg' }),
      tool('Edit', { file_path: `${cwd}/src/zqmodule${i}.ts` }), tool('Write', { file_path: `${cwd}/zqnotes.md` }),
      tool('mcp__zqserver__query', { sql: 'zqsql' }), tool('Read', { file_path: `${cwd}/README.md` }),
    ].join('\n'));
  }
  fs.mkdirSync(path.join(home, '.claude', 'skills', 'zqskill-private'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'zqmcp-internal': { command: 'npx', args: ['@zqorg/server'] } } }));
  return home;
}

test('the card shows the animal, its title and 3 general stats: sessions, top language, top topic', () => {
  const p = prof({ sessions: 16, languages: { TypeScript: 30, Python: 5 }, topics: { testing: 9, frontend: 12 }, tools: { Edit: 60, Read: 40 } });
  const svg = card(p);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*viewBox=/);
  assert.match(svg, /<\/svg>\n?$/);
  assert.match(svg, />Beaver</);
  assert.match(svg, />The Builder</);
  assert.deepEqual(cardStats(p), { sessions: 16, topLanguage: 'TypeScript', topTopic: 'frontend' });
  assert.match(svg, />16</);
  assert.match(svg, />TypeScript</);
  assert.match(svg, />frontend</);
  assert.match(svg, /last 30 days/i);
  assert.match(svg, /<g shape-rendering="crispEdges">/); // the sprite, as pixel squares (v0.11.2)
  // Self-contained, no dependencies: no scripts, links, images, fonts or styles from elsewhere.
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=|url\(|@import|on[a-z]+=/i);
});

test('every animal and the Egg render a card; the Egg says to come back after 10 sessions', () => {
  for (const a of [...ORDER, 'Egg']) {
    const svg = card(prof(), a);
    assert.match(svg, new RegExp(`>${a}<`));
    assert.match(svg, new RegExp(`>${ANIMALS[a].title}<`));
  }
  assert.match(card(prof({ sessions: 4 })), /come back after 10 sessions/i);
});

test('the card never holds any profile string except the top language and top topic (fixture, personas, real-shaped)', () => {
  const profiles = [
    ['private fixture', buildProfile({ home: privateHome(), excludeSessions: [] })],
    ...Object.keys(PERSONAS).map((n) => [n, buildProfile({ home: materialize(n), excludeSessions: [] })]),
  ];
  for (const [name, p] of profiles) {
    const { topLanguage, topTopic } = cardStats(p);
    // The allowed two, in any case: a `python` command is the same word as the Python language.
    const allowed = new Set([topLanguage, topTopic].filter(Boolean).map((s) => s.toLowerCase()));
    const strings = [...profileStrings(p)].filter((s) => !allowed.has(s.toLowerCase()));
    assert.ok(strings.length > 10, `${name}: too few strings to test (${strings.length})`);
    for (const a of [...ORDER, 'Egg']) {
      const svg = card(p, a);
      const leaked = strings.filter((s) => appears(s, svg));
      assert.deepEqual(leaked, [], `${name} as ${a}: profile strings on the card`);
      assert.doesNotMatch(svg, /zq/i, `${name} as ${a}`);
    }
  }
});

test('a hand-edited profile cannot put paths, names or markup on the card', () => {
  const p = prof({ languages: { '/Users/zq/clients/zqacme': 99 }, topics: { '<script>zq</script>': 50, 'zqproject-x': 40 }, windowDays: '30<zq>' });
  assert.deepEqual(cardStats(p), { sessions: 20, topLanguage: null, topTopic: null });
  const svg = card(p);
  assert.doesNotMatch(svg, /zq|<script/i);
  assert.match(svg, /last 30 days/);
  // Falls through to the first known name.
  assert.deepEqual(cardStats(prof({ languages: { zqlang: 9, Go: 2 }, topics: { zqtopic: 9, devops: 3 } })), { sessions: 20, topLanguage: 'Go', topTopic: 'devops' });
});

test('the same profile always gives the same card', () => {
  const p = buildProfile({ home: materialize('webdev'), excludeSessions: [] });
  assert.equal(card(p), card(structuredClone({ ...p, generatedAt: '2031-01-01T00:00:00Z' })));
});

test('CLI: me --card out.svg writes the card and says where', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-card-cli-'));
  const data = path.join(home, 'd');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'profile.json'), JSON.stringify(prof({ languages: { Rust: 4 }, topics: { testing: 3 } })));
  const out = path.join(home, 'card.svg');
  const run = (...a) => execFileSync(process.execPath, [SCOUT, 'me', ...a, '--home', home, '--data', data], { encoding: 'utf8' });
  const text = run('--card', out);
  assert.match(text, new RegExp(`Card saved to ${out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(text, /Tools that fit/);
  const svg = fs.readFileSync(out, 'utf8');
  assert.match(svg, /^<svg /);
  assert.match(svg, />Rust</);
  const j = JSON.parse(run('--json', '--card', out));
  assert.equal(j.card, out);
});

test('the Egg card shows the teaser too, and still says to come back after 10 sessions', () => {
  const p = prof({ sessions: 9, topics: { debugging: 5 }, friction: { testing: 4 } });
  const svg = card(p);
  assert.match(svg, />Hatching into… Owl\?</);
  assert.match(svg, /come back after 10 sessions/i);
  assert.doesNotMatch(card(prof({ sessions: 9 })), /Hatching/);
});

test('CLI: --card with no path saves ./tool-scout-me.svg in the current folder and prints the full path', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-card-cwd-'));
  const data = path.join(home, 'd');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'profile.json'), JSON.stringify(prof()));
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scout-cwd-')));
  const run = (...a) => execFileSync(process.execPath, [SCOUT, 'me', ...a, '--home', home, '--data', data], { encoding: 'utf8', cwd });
  const want = path.join(cwd, 'tool-scout-me.svg');
  const text = run('--card'); // last flag, no value
  assert.ok(text.includes(`Card saved to ${want}`), text);
  assert.match(fs.readFileSync(want, 'utf8'), /^<svg /);
  fs.rmSync(want);
  assert.equal(JSON.parse(run('--card', '--json')).card, want); // followed by another flag
  assert.ok(fs.existsSync(want));
});

test('the me skill saves the card in the data folder (v0.11.2: and opens it) and tells the user the printed path', () => {
  const skill = fs.readFileSync(new URL('../skills/me/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /scout\.mjs" me --plain --card "\$\{CLAUDE_PLUGIN_DATA\}\/tool-scout-me\.svg" --open --data/);
  assert.match(skill, /tool-scout-me\.svg/);
  assert.match(skill, /full path/i);
});

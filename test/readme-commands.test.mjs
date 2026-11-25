// Every command and plain-language request the README lists must exist in the code,
// so the docs can't drift from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const README = read('README.md');
const CLI = read('scripts/lib/cli.mjs');
const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const section = (name) => README.split(/^## /m).find((s) => s.startsWith(name)) || '';
const skills = Object.fromEntries(fs.readdirSync(new URL('../skills', import.meta.url))
  .map((d) => [d, read(`skills/${d}/SKILL.md`)]));
const tableRows = (md) => md.split('\n').filter((l) => /^\|/.test(l) && !/^\|[-| ]+\|$/.test(l)).slice(1)
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const cliCommands = new Set([...CLI.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));
// Flags the CLI reads: opts.x, opts['x'], or documented in the usage header comment.
const cliFlag = (f) => new RegExp(`opts(\\.${f}\\b|\\['${f}'\\])`).test(CLI) || new RegExp(`^//.*--${f}\\b`, 'm').test(CLI);

// Requests whose CLI command exists but whose skill wording lives in a frozen file
// (skills/scout/SKILL.md is under the ranking freeze). Remove an entry once a skill covers it.
const NO_SKILL_YET = new Set(['profile --show']);

const commandsSection = section('Commands');
const [slashTable, plainTable] = commandsSection.split(/\n\s*Or just ask/);

test('README Commands section has both tables', () => {
  assert.ok(tableRows(slashTable).length >= 2, 'slash-command table missing');
  assert.ok(plainTable && tableRows(plainTable).length >= 8, 'plain-language table missing');
});

test('every /tool-scout:<skill> in the README is a real skill', () => {
  const names = new Set([...README.matchAll(/\/tool-scout:([a-z-]+)/g)].map((m) => m[1]));
  assert.ok(names.has('scout') && names.has('check'));
  for (const n of names) {
    assert.ok(skills[n], `skills/${n}/SKILL.md missing`);
    assert.match(skills[n], new RegExp(`^name: ${n}$`, 'm'));
  }
});

test('every scout focus argument in the README is handled by the scout skill', () => {
  const focus = tableRows(slashTable).map((r) => r[0]).filter((c) => c.startsWith('`/tool-scout:scout '))
    .flatMap((c) => [...c.matchAll(/`(?:\/tool-scout:scout )?([a-z-]+)`/g)].map((m) => m[1]));
  assert.deepEqual(focus.sort(), ['mcp', 'plugins', 'refresh', 'skills', 'testing']);
  for (const f of focus) assert.match(skills.scout, new RegExp(`\\b${f}\\b`), `scout skill doesn't mention "${f}"`);
});

test('every plain-language request runs a real CLI command that a skill knows about', () => {
  for (const [say, runs] of tableRows(plainTable)) {
    const cmdline = runs.replace(/`/g, '');
    const [cmd, ...flags] = cmdline.split(/\s+/);
    assert.ok(cliCommands.has(cmd), `${say}: CLI has no "${cmd}" command`);
    for (const f of flags) assert.ok(cliFlag(f.replace(/^--/, '')), `${say}: CLI doesn't take ${f}`);
    if (NO_SKILL_YET.has(cmdline)) continue;
    const covered = Object.values(skills).some((s) => new RegExp(`scout\\.mjs"? ${cmd}\\b|… ${cmd}\\b`).test(s)
      && flags.every((f) => s.includes(`${cmd} ${f}`)));
    assert.ok(covered, `${say}: no skill tells Claude to run "${cmdline}"`);
  }
});

test('every scout.mjs command in the README and docs/USAGE.md exists', () => {
  const docs = README + read('docs/USAGE.md');
  const used = new Set([...docs.matchAll(/scout\.mjs ([a-z-]+)/g)].map((m) => m[1]));
  for (const m of README.matchAll(/# also: ([a-z, -]+)/g)) for (const c of m[1].split(',')) used.add(c.trim());
  for (const row of tableRows(docs.split('## CLI reference')[1].split('\nOptions:')[0])) used.add(row[0].match(/`([a-z-]+)/)[1]);
  assert.ok(used.size >= 12, `only found ${[...used]}`);
  for (const c of used) assert.ok(cliCommands.has(c), `scout.mjs has no "${c}" command`);
  assert.deepEqual([...cliCommands].filter((c) => !used.has(c)), [], 'CLI commands missing from the docs');
});

test('the README command-line examples run (read-only ones, in a temp home)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-readme-'));
  const run = (...a) => execFileSync(process.execPath, [SCOUT, ...a, '--home', home, '--data', path.join(home, 'd')], { encoding: 'utf8' });
  assert.match(run('profile', '--show'), /Data folder:/);
  assert.match(run('stats'), /No ratings yet/);
  assert.match(run('stats', '--share'), /everything that would be shared/);
  assert.match(run('audit'), /./);
});

test("the README's Node version matches the startup check, package.json engines and both skills", async () => {
  const { MIN_NODE } = await import('../scripts/lib/node-check.mjs');
  const req = section('Requirements');
  assert.ok(req, 'README needs a Requirements section');
  assert.ok(README.indexOf('## Requirements') > README.indexOf('## Install') && README.indexOf('## Requirements') < README.indexOf('## Quick start'), 'Requirements goes right after Install');
  const mentioned = [...README.matchAll(/Node(?:\.js)? (\d+)(?:\+| or newer)/g)].map((m) => Number(m[1]));
  assert.ok(mentioned.length >= 1, 'README names no Node version');
  assert.deepEqual([...new Set(mentioned)], [MIN_NODE]);
  assert.match(req, new RegExp(`Node\\.js ${MIN_NODE} or newer`));
  assert.match(req, /api\.github\.com/);
  assert.match(req, /NODE_USE_ENV_PROXY=1/);
  assert.equal(JSON.parse(read('package.json')).engines.node, `>=${MIN_NODE}`);
  for (const [name, s] of Object.entries(skills)) assert.match(s, new RegExp(`Node\\.js ${MIN_NODE} or newer`), `skills/${name} doesn't say what to do about Node`);
});

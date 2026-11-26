// v0.11.0 item 4: the README and docs/USAGE.md explain the kickoff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const section = (md, h) => { const i = md.indexOf(`\n## ${h}`); assert.ok(i > 0, `no "## ${h}"`); return md.slice(i, md.indexOf('\n## ', i + 3)).replace(/\s+/g, ' '); };
const README = read('README.md');
const USAGE = read('docs/USAGE.md');

test('README has a Project kickoff section, after Check before you install', () => {
  assert.ok(README.indexOf('## Project kickoff') > README.indexOf('## Check before you install'));
  assert.ok(README.indexOf('## Project kickoff') < README.indexOf('## Command line'));
  const sec = section(README, 'Project kickoff');
  for (const re of [/\/tool-scout:kickoff/, /past(?:e|ed)[^.]*or[^.]*file|file[^.]*or[^.]*past/i, /tasks, stack, domain(?:,)? and conventions/,
    /doesn't upload it/, /local catalog/, /dependency files/, /at most 5/, /nothing needed: Claude handles this without a tool/i,
    /CLAUDE\.md (?:memory )?note/, /choose|multi-select/i, /manual steps/, /installs and builds nothing/, /kickoff\/needs\.json/]) assert.match(sec, re, String(re));
});

test('README lists the kickoff in Commands, the plain-language table, Privacy and Command line', () => {
  assert.match(section(README, 'Commands'), /\| `\/tool-scout:kickoff` \|/);
  assert.match(section(README, 'Commands'), /\| "[^"]*plan[^"]*" \| `kickoff --plan-file` \|/);
  assert.match(section(README, 'Privacy'), /plan you give `\/tool-scout:kickoff` is kept in full[^.]*needs\.json/i);
  assert.match(README, /node scripts\/scout\.mjs kickoff --plan-file PLAN\.md --project \./);
});

test('README Experimental installer mentions --replace and the personal hook scope', () => {
  const sec = section(README, 'Experimental installer (off by default)') + README.slice(README.indexOf('### Build your own (experimental)'), README.indexOf('\n## Command line')).replace(/\s+/g, ' ');
  assert.match(sec, /--replace/);
  assert.match(sec, /settings\.local\.json/);
});

test('docs/USAGE.md explains how the kickoff matches and decides', () => {
  const sec = section(USAGE, 'Project kickoff');
  for (const re of [/needs\.json/, /same ranking/, /effort/, /trust/, /good enough/i, /first clause|name or (?:its )?first/, /nothing needed/i,
    /Build your own/, /impact/, /at most 5/, /memory note/i, /--rematch/, /--summary/, /plan text/i, /never (?:goes into|appears in|sent)/]) assert.match(sec, re, String(re));
});

// v0.11.1: the README and USAGE describe the new kickoff rules.
test('README Project kickoff describes the v0.11.1 rules', () => {
  const sec = section(README, 'Project kickoff');
  for (const re of [/judges? every match|judg(?:es|ment)[^.]*every (?:match|item)/i, /never (?:shows?|offers?)[^.]*weak/i,
    /official marketplace/i, /built-in/i, /\/ultrareview/, /nothing needed: Claude does this directly/i, /CI/, /icon/i,
    /heavy setup/i, /only (?:the )?conventions[^.]*not (?:already )?in (?:your )?CLAUDE\.md/i, /Skip \(recommended\)/]) assert.match(sec, re, String(re));
});

test('docs/USAGE.md Project kickoff describes the v0.11.1 rules', () => {
  const sec = section(USAGE, 'Project kickoff');
  for (const re of [/judgment/i, /rejects/, /steps 2-4/, /anthropics\/claude-plugins-official/, /marketplace\.json/, /by repo name/i,
    /built-in/i, /\/ultrareview/, /preferred over/i, /toolkit\.direct|does this directly/i, /heavy setup/, /more than 3 credentials/, /local service/,
    /not already in CLAUDE\.md|already in CLAUDE\.md/, /no note is offered/i, /Skip \(recommended\)/, /doubts/]) assert.match(sec, re, String(re));
});

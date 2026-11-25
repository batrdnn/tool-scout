// v0.9.1 item 2: when a skill needs something the installed plugin's script lacks, the user is told
// to update the plugin and restart. Claude never falls back to another copy of scout.mjs (such as a
// working copy of the repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UPDATE = 'claude plugin update tool-scout@tool-scout';
const flat = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\s+/g, ' ');

for (const name of ['scout', 'check', 'me']) {
  test(`skills/${name}: an outdated plugin means "${UPDATE}" and a restart, never a working copy`, () => {
    const md = flat(`skills/${name}/SKILL.md`);
    const sec = md.slice(md.indexOf('## If the script fails'));
    assert.ok(sec.includes(`\`${UPDATE}\``), 'the update command');
    assert.match(sec, /restart Claude Code/i);
    assert.match(sec, /Unknown command|unknown option|prints its usage/i, 'how to recognize it');
    assert.match(sec, /Never run another copy of `?scout\.mjs`?[^.]*working copy of the repo/i);
  });
}

test('an unknown command says the plugin may be older than the skill: update and restart (exit 1)', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-old-'));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'scout.mjs'), 'frobnicate', '--plain', '--data', data], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  const out = r.stdout + r.stderr;
  assert.match(out, /Unknown command: frobnicate/);
  assert.ok(out.includes(UPDATE), out);
  assert.match(out, /restart Claude Code/);
  const help = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'scout.mjs'), 'help', '--data', data], { encoding: 'utf8' });
  assert.equal(help.status, 0, 'help is still just the usage');
  assert.match(help.stdout, /^Usage: scout\.mjs/);
});

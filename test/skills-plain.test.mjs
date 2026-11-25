// Inside Claude Code the Bash tool's stdout is a pipe, CLAUDECODE=1 is set, and TERM still says
// xterm-256color. Escape codes would reach the model as text like "[31mRED[0m". So every script
// call in a skill passes --json or --plain, and the commands skills run never print escapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { judgeInstructions } from './eval/e2e.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const skills = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'skills')).map((d) => [d, fs.readFileSync(path.join(ROOT, 'skills', d, 'SKILL.md'), 'utf8')]));

/** Every full script call (`node … scout.mjs …`) in a skill's code blocks and inline code. */
const scriptCalls = (md) => [...md.matchAll(/node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/scout\.mjs"[^\n`]*/g)].map((m) => m[0]);
/** Shorthand calls in inline code, like `… rate <owner/repo> clear`. */
const shorthand = (md) => [...md.matchAll(/`… ([a-z-]+[^`]*)`/g)].map((m) => m[1]);

test('every script call in every skill passes --json or --plain', () => {
  let n = 0;
  for (const [name, md] of Object.entries(skills)) {
    for (const call of [...scriptCalls(md), ...shorthand(md)]) {
      n++;
      assert.match(call, /--(json|plain)\b/, `skills/${name}/SKILL.md: ${call}`);
    }
  }
  assert.ok(n >= 15, `found only ${n} script calls`);
});

test('every skill says why: never let escape codes into the conversation', () => {
  for (const [name, md] of Object.entries(skills)) assert.match(md, /always (?:pass|add) `--json` or `--plain`/i, `skills/${name}/SKILL.md`);
});

test('the commands skills run print no escape codes, even with a color TERM inside Claude Code', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-skill-home-'));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-skill-data-'));
  fs.copyFileSync(path.join(ROOT, 'test', 'fixtures', 'output', 'profile.json'), path.join(data, 'profile.json'));
  fs.writeFileSync(path.join(data, 'catalog.json'), JSON.stringify({ updatedAt: new Date().toISOString(), repos: {} }));
  const env = { ...process.env, CLAUDECODE: '1', TERM: 'xterm-256color', LANG: 'en_US.UTF-8', NO_COLOR: '', CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PLUGIN_DATA: data };
  const runnable = Object.values(skills).flatMap(scriptCalls)
    .filter((c) => !/ check </.test(c)) // check needs GitHub
    .map((c) => c.replace(/<owner\/repo>/g, 'acme/x').replace(/useful\|not/, 'useful').replace(/<folder name or path>|<name>/g, 'proj'));
  assert.ok(runnable.length >= 6, runnable.join('\n'));
  for (const c of runnable) {
    const args = c.replace(/^node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/scout\.mjs" /, '').replace(/"?\$\{CLAUDE_PLUGIN_DATA\}([^"\s]*)"?/g, (_, rest) => path.join(data, rest)).split(/\s+/);
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'scout.mjs'), ...args, '--home', home, '--offline'], { encoding: 'utf8', env, cwd: data, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.ok(!out.includes('\u001b'), `escape codes from: ${c}`);
  }
});

test("scout SKILL.md's judged steps 2-4 are unchanged (ranking freeze)", () => {
  const hash = crypto.createHash('sha256').update(judgeInstructions(skills.scout)).digest('hex');
  assert.equal(hash, '0b05bb32bd8da79e966cf5490a896fa40e4db93c592dd120b63b9aa96186d5c5');
});

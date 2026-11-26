// v0.17 safe mode: install, build and hook activation are off by default. scout, check, audit, me and
// kickoff stay (read-only) and show manual steps. The installer is still in the code, behind an
// explicit experimental setting that is off by default and warns when it is on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isExperimental, setExperimental, EXPERIMENTAL_WARNING, SWITCHED_OFF } from '../scripts/lib/experimental.mjs';
import { loadSettings, excludeProject } from '../scripts/lib/settings.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCOUT = path.join(ROOT, 'scripts', 'scout.mjs');
function run(args, { data = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-gate-data-')) } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-gate-home-'));
  const r = spawnSync(process.execPath, [SCOUT, ...args, '--data', data, '--home', home], { encoding: 'utf8', cwd: data, env: { ...process.env, NO_COLOR: '1' } });
  return { ...r, data, out: `${r.stdout}${r.stderr}` };
}

test('the experimental installer is off by default, and the setting survives other settings', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-gate-'));
  assert.equal(isExperimental(d), false);
  excludeProject(d, 'demo');
  setExperimental(d, true);
  assert.equal(isExperimental(d), true);
  assert.deepEqual(loadSettings(d).excludeProjects, ['demo']);
  excludeProject(d, 'other');
  assert.equal(isExperimental(d), true, 'saving another setting keeps it');
  setExperimental(d, false);
  assert.equal(isExperimental(d), false);
});

test('only a real true turns it on: nothing else in the settings file counts', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-gate-'));
  for (const v of ['true', 1, 'on', {}, null]) {
    fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ experimentalInstaller: v }));
    assert.equal(isExperimental(d), false, JSON.stringify(v));
  }
  fs.writeFileSync(path.join(d, 'settings.json'), '{not json');
  assert.equal(isExperimental(d), false);
});

for (const args of [
  ['install', 'o/demo', '--plan'],
  ['install', 'o/demo', '--confirm', 'abcdef123456'],
  ['build', '--start', '--form', 'skill', '--name', 'demo'],
  ['build', '--form', 'skill', '--name', 'demo', '--from', 'x', '--plan'],
  ['build', '--confirm', 'abcdef123456'],
  ['build', '--confirm-hook', 'abcdef123456'],
]) {
  test(`off by default: ${args.slice(0, 2).join(' ')}${args.includes('--confirm-hook') ? ' (hook activation)' : ''} refuses, writes nothing, and says what to do instead`, () => {
    const r = run(args);
    assert.notEqual(r.status, 0, r.out);
    assert.ok(r.out.includes(SWITCHED_OFF), r.out);
    assert.match(r.out, /manual|yourself/i);
    for (const d of ['plans', 'drafts', 'installs.json']) assert.ok(!fs.existsSync(path.join(r.data, d)), `${d} was created`);
  });
}

test('off by default with --json too: a refusal object, never a plan', () => {
  const r = run(['install', 'o/demo', '--plan', '--json']);
  assert.notEqual(r.status, 0);
  const o = JSON.parse(r.stdout);
  assert.equal(o.ok, false);
  assert.equal(o.experimental, false);
  assert.match(o.reason, /off by default/i);
});

test('the refusal tells the user to turn it on themselves, in their own terminal, not Claude', () => {
  const r = run(['install', 'o/demo', '--plan']);
  assert.match(r.out, /experimental on/);
  assert.match(r.out, /your own terminal|yourself/i);
});

test('undo, installed and the read-only commands still work with the installer off', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-gate-data-'));
  assert.match(run(['installed'], { data: d }).out, /Nothing installed by Tool Scout/);
  const u = run(['undo', 'nothing-here'], { data: d });
  assert.match(u.out, /nothing installed by Tool Scout is called nothing-here/, 'undo is not gated: it is how older installs are removed');
  assert.doesNotMatch(u.out, new RegExp(SWITCHED_OFF.slice(0, 30)));
  assert.equal(run(['audit', '--plain'], { data: d }).status, 0);
});

test('experimental: status, on (with the warning) and off', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-gate-data-'));
  assert.match(run(['experimental', '--plain'], { data: d }).out, /off/i);
  const on = run(['experimental', 'on'], { data: d });
  assert.equal(on.status, 0, on.out);
  assert.ok(on.out.includes(EXPERIMENTAL_WARNING), on.out);
  assert.equal(isExperimental(d), true);
  assert.match(run(['experimental', '--plain'], { data: d }).out, /\bon\b/i);
  const off = run(['experimental', 'off'], { data: d });
  assert.equal(off.status, 0);
  assert.equal(isExperimental(d), false);
  assert.notEqual(run(['experimental', 'maybe'], { data: d }).status, 0);
});

test('the warning says what is not guaranteed', () => {
  for (const s of [/experimental/i, /not .*(guarantee|enforce)/i, /undo/i, /your own risk|at your risk/i]) assert.match(EXPERIMENTAL_WARNING, s);
});

test('with it on, the gate opens and every installer run repeats the warning', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-gate-data-'));
  setExperimental(d, true);
  const r = run(['build', '--start', '--form', 'skill', '--name', 'demo'], { data: d });
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.includes(EXPERIMENTAL_WARNING), r.out);
  assert.ok(fs.existsSync(path.join(d, 'drafts', 'demo')));
});

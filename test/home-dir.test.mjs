// v0.15.0 item 2: HOME vs USERPROFILE. Windows has no HOME (it has USERPROFILE); os.homedir() reads
// HOME first and falls back to USERPROFILE, so Tool Scout finds the user's home folder only through
// os.homedir() and never reads either variable itself. Reading process.env.HOME directly would
// leave Windows with no home folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOUT = path.join(ROOT, 'scripts', 'scout.mjs');

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(path.join(dir, e.name)) : /\.mjs$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

test('no script reads HOME or USERPROFILE itself: the home folder comes from os.homedir()', () => {
  const bad = sources(path.join(ROOT, 'scripts')).filter((f) => /\benv\.(?:HOME|USERPROFILE|HOMEDRIVE|HOMEPATH)\b|env\[['"](?:HOME|USERPROFILE)['"]\]/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(bad.map((f) => path.relative(ROOT, f)), []);
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'cli.mjs'), 'utf8'), /opts\.home \|\| os\.homedir\(\)/);
});

test('the CLI runs with HOME unset and only USERPROFILE set, as on Windows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-userprofile-'));
  const env = { ...process.env, USERPROFILE: dir, SystemRoot: process.env.SystemRoot };
  delete env.HOME;
  const r = spawnSync(process.execPath, [SCOUT, 'stats', '--plain', '--data', path.join(dir, 'd')], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /No ratings yet/);
});

test('--home overrides both: the tests and the skills can point Tool Scout at any folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-homeflag-'));
  const r = spawnSync(process.execPath, [SCOUT, 'stats', '--plain', '--home', dir, '--data', path.join(dir, 'd')], { encoding: 'utf8', env: { ...process.env, HOME: '/nonexistent', USERPROFILE: 'Z:\\nonexistent' } });
  assert.equal(r.status, 0, r.stderr);
});

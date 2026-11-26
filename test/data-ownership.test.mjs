// v0.17.1 (review D6): --data (or SCOUT_DATA) pointed at a folder that is not Tool Scout's own, say a
// project, used to get every file in it chmod-ed on exit. Now the folder needs Tool Scout's
// ownership marker; a folder without one is refused (unless it is empty, or holds only files Tool Scout
// itself writes, as folders made before v0.17.1 do), and permissions are only ever changed on
// files Tool Scout owns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { claimDataDir, MARKER } from '../scripts/lib/datadir.mjs';
import { KEPT } from '../scripts/lib/privacy.mjs';

const WIN = process.platform === 'win32';
const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scout-own-'));
const mode = (f) => fs.lstatSync(f).mode & 0o777;
const cli = (data, ...a) => spawnSync(process.execPath, [SCOUT, ...a, '--data', data, '--home', tmp(), '--offline'], { encoding: 'utf8', cwd: fs.existsSync(data) ? data : os.tmpdir() });

test('a folder that does not exist yet, or is empty, becomes Tool Scout\'s: it gets the marker', () => {
  const d = path.join(tmp(), 'new');
  assert.deepEqual(claimDataDir(d), { ok: true, created: true });
  assert.ok(fs.existsSync(path.join(d, MARKER)));
  const e = tmp();
  assert.equal(claimDataDir(e).ok, true);
  assert.ok(fs.existsSync(path.join(e, MARKER)));
});

test('a folder with the marker is accepted, with anything in it', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, MARKER), 'x');
  fs.writeFileSync(path.join(d, 'stranger.txt'), 'x');
  assert.equal(claimDataDir(d).ok, true);
});

test('a folder from before the marker (only files Tool Scout writes) is adopted', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'profile.json'), '{}');
  fs.mkdirSync(path.join(d, 'kickoff')); fs.writeFileSync(path.join(d, 'kickoff', 'needs.json'), '{}');
  fs.mkdirSync(path.join(d, 'plans'));
  assert.equal(claimDataDir(d).ok, true);
  assert.ok(fs.existsSync(path.join(d, MARKER)));
});

test('every file Tool Scout writes counts as its own (the list is the privacy command\'s)', () => {
  for (const k of KEPT) {
    const d = tmp();
    const f = path.join(d, k.path.replace(/\/$/, '') + (k.path.endsWith('/') ? '/x.json' : ''));
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '{}');
    assert.equal(claimDataDir(d).ok, true, k.path);
  }
});

test('every file a skill writes into ${CLAUDE_PLUGIN_DATA} counts as Tool Scout\'s own (v0.17.3: the /tool-scout:me card locked users out)', () => {
  const skills = fileURLToPath(new URL('../skills', import.meta.url));
  const own = new Set(KEPT.map((k) => k.path.split('/')[0]));
  const paths = new Set();
  for (const n of fs.readdirSync(skills)) {
    const f = path.join(skills, n, 'SKILL.md');
    if (!fs.existsSync(f)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\$\{CLAUDE_PLUGIN_DATA\}\/([A-Za-z0-9._-]+)/g)) paths.add(m[1]);
  }
  assert.ok(paths.has('tool-scout-me.svg'));
  for (const p of paths) assert.ok(own.has(p), `${p} is written by a skill but not in KEPT`);
  const d = tmp();
  fs.writeFileSync(path.join(d, 'profile.json'), '{}');
  fs.writeFileSync(path.join(d, 'tool-scout-me.svg'), '<svg/>');
  assert.equal(claimDataDir(d).ok, true);
});

test('a project folder (or any folder with other files) is refused, and left exactly as it was', { skip: WIN }, () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'src')); fs.writeFileSync(path.join(d, 'src', 'main.py'), 'x', { mode: 0o644 });
  fs.writeFileSync(path.join(d, 'package.json'), '{}', { mode: 0o644 });
  fs.chmodSync(d, 0o755);
  const before = fs.readdirSync(d, { recursive: true }).sort();
  const c = claimDataDir(d);
  assert.equal(c.ok, false);
  assert.match(c.reason, /not Tool Scout's data folder/);
  assert.match(c.reason, new RegExp(MARKER.replace('.', '\\.')));
  const r = cli(d, 'profile', '--plain');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /not Tool Scout's data folder/);
  assert.deepEqual(fs.readdirSync(d, { recursive: true }).sort(), before, 'nothing was created');
  assert.equal(mode(d), 0o755);
  assert.equal(mode(path.join(d, 'package.json')), 0o644);
  assert.equal(mode(path.join(d, 'src', 'main.py')), 0o644);
});

test('even a refused folder is not chmod-ed on exit, with one command or another', { skip: WIN }, () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'notes.txt'), 'x', { mode: 0o644 });
  for (const a of [['installed'], ['privacy'], ['rate', 'o/x', 'useful'], ['dismiss', 'o/x']]) {
    assert.notEqual(cli(d, ...a).status, 0, a[0]);
    assert.equal(mode(path.join(d, 'notes.txt')), 0o644, a[0]);
    assert.ok(!fs.existsSync(path.join(d, MARKER)), a[0]);
  }
});

test('in a folder Tool Scout owns, only its own files are tightened; others and links are left alone', { skip: WIN }, () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, MARKER), 'x');
  fs.writeFileSync(path.join(d, 'ratings.json'), '{}', { mode: 0o644 });
  fs.mkdirSync(path.join(d, 'kickoff')); fs.writeFileSync(path.join(d, 'kickoff', 'needs.json'), '{}', { mode: 0o644 });
  fs.writeFileSync(path.join(d, 'stranger.txt'), 'x', { mode: 0o644 });
  fs.mkdirSync(path.join(d, 'stranger-dir')); fs.writeFileSync(path.join(d, 'stranger-dir', 'a.txt'), 'x', { mode: 0o644 });
  const outside = path.join(tmp(), 'shared.txt'); fs.writeFileSync(outside, 'x', { mode: 0o644 });
  fs.symlinkSync(outside, path.join(d, 'link'));
  fs.chmodSync(d, 0o755);
  const r = cli(d, 'installed');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(mode(d), 0o700);
  assert.equal(mode(path.join(d, 'ratings.json')) & 0o077, 0, 'its own file is private');
  assert.equal(mode(path.join(d, 'kickoff', 'needs.json')) & 0o077, 0);
  assert.equal(mode(path.join(d, 'stranger.txt')), 0o644, 'not its file');
  assert.equal(mode(path.join(d, 'stranger-dir', 'a.txt')), 0o644, 'not its folder');
  assert.equal(mode(outside), 0o644, 'a link is never followed');
});

test('the CLI creates a new folder with the marker, and the marker is in the privacy list', () => {
  const d = path.join(tmp(), 'fresh');
  const first = cli(d, 'installed');
  assert.equal(first.status, 0, first.stderr);
  assert.ok(fs.existsSync(path.join(d, MARKER)));
  assert.deepEqual(JSON.parse(cli(d, 'privacy', '--json').stdout).unlisted, []);
});

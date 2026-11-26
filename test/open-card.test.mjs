// `me --card <file> --open`: after saving the card, open it (macOS `open`, Linux `xdg-open`); skip on failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { openCommand, openFile } from '../scripts/lib/open.mjs';
import { prof } from './helpers.mjs';
import { fileURLToPath } from 'node:url';

test('openCommand: open on macOS, xdg-open on Linux, cmd.exe (start) on Windows, nothing elsewhere', () => {
  assert.equal(openCommand('darwin'), 'open');
  assert.equal(openCommand('linux'), 'xdg-open');
  assert.equal(openCommand('win32'), 'cmd.exe');
  assert.equal(openCommand('freebsd'), null);
});

const fakeSpawn = (log, { fail = false, throws = false } = {}) => (cmd, args, opts) => {
  if (throws) throw new Error('boom');
  log.push({ cmd, args, opts });
  const child = new EventEmitter();
  child.unref = () => {};
  if (fail) setImmediate(() => child.emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' })));
  return child;
};

test('openFile launches the opener with the file path, detached, and reports it', () => {
  const log = [];
  assert.equal(openFile('/tmp/card.svg', { platform: 'darwin', spawn: fakeSpawn(log) }), true);
  assert.deepEqual(log.map((l) => [l.cmd, l.args]), [['open', ['/tmp/card.svg']]]);
  assert.equal(log[0].opts.detached, true);
  assert.equal(log[0].opts.stdio, 'ignore');
  assert.equal(openFile('/tmp/card.svg', { platform: 'linux', spawn: fakeSpawn(log) }), true);
  assert.equal(log[1].cmd, 'xdg-open');
});

test('openFile on Windows runs `start` through cmd.exe, with the file in an environment variable, never in the command line', () => {
  const log = [];
  const file = 'C:\\Users\\a & b\\100%\\card.svg';
  assert.equal(openFile(file, { platform: 'win32', spawn: fakeSpawn(log), env: { PATH: 'x' } }), true);
  const [c] = log;
  assert.equal(c.cmd, 'cmd.exe');
  assert.deepEqual(c.args, ['/d', '/c', 'start "" "%SCOUT_CARD%"']);
  assert.equal(c.opts.env.SCOUT_CARD, file);
  assert.equal(c.opts.env.PATH, 'x');
  assert.equal(c.opts.windowsVerbatimArguments, true);
  assert.equal(c.opts.detached, true);
  assert.equal(c.opts.windowsHide, true);
  assert.ok(!c.args.join(' ').includes('card.svg'), 'the path is not parsed by cmd.exe');
});

test('openFile skips quietly: unsupported system, a missing opener (async error) or a throwing spawn', async () => {
  const log = [];
  assert.equal(openFile('/tmp/c.svg', { platform: 'freebsd', spawn: fakeSpawn(log) }), false);
  assert.equal(log.length, 0);
  assert.equal(openFile('/tmp/c.svg', { platform: 'linux', spawn: fakeSpawn(log, { fail: true }) }), true);
  await new Promise((r) => setImmediate(r)); // the 'error' event must be handled, or the process would crash
  assert.equal(openFile('/tmp/c.svg', { platform: 'linux', spawn: fakeSpawn(log, { throws: true }) }), false);
});

test('CLI: --card <file> --open saves the card, survives a missing opener and says nothing about it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-open-'));
  fs.writeFileSync(path.join(dir, '.tool-scout-data'), ''); // helper files live in the data folder: say it is Tool Scout's (v0.17.1)
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(prof({ sessions: 30 })));
  const card = path.join(dir, 'out', 'me.svg');
  const cli = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
  const bin = path.join(dir, 'emptybin'); fs.mkdirSync(bin);
  const r = spawnSync(process.execPath, [cli, 'me', '--plain', '--card', card, '--open', '--data', dir], { encoding: 'utf8', env: { PATH: bin, HOME: dir } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.readFileSync(card, 'utf8').startsWith('<svg'));
  assert.match(r.stdout, /Card saved to /);
});

test('without --open nothing is launched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-noopen-'));
  fs.writeFileSync(path.join(dir, '.tool-scout-data'), '');
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(prof({ sessions: 30 })));
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  const marker = path.join(dir, 'launched');
  for (const name of ['open', 'xdg-open']) { fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho x > "${marker}"\n`); fs.chmodSync(path.join(bin, name), 0o755); }
  const cli = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
  spawnSync(process.execPath, [cli, 'me', '--plain', '--card', path.join(dir, 'c.svg'), '--data', dir], { encoding: 'utf8', env: { PATH: bin, HOME: dir } });
  assert.equal(fs.existsSync(marker), false);
  spawnSync(process.execPath, [cli, 'me', '--plain', '--card', path.join(dir, 'c.svg'), '--open', '--data', dir], { encoding: 'utf8', env: { PATH: bin, HOME: dir } });
  const deadline = Date.now() + 2000;
  while (!fs.existsSync(marker) && Date.now() < deadline) spawnSync('sleep', ['0.1']);
  assert.equal(fs.existsSync(marker), process.platform === 'darwin' || process.platform === 'linux');
});

test('the /tool-scout:me skill saves the card to the data folder and opens it', () => {
  const skill = fs.readFileSync(new URL('../skills/me/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /me --plain --card "\$\{CLAUDE_PLUGIN_DATA\}\/tool-scout-me\.svg" --open/);
  assert.match(skill, /opens? (it )?in (the|their) browser/i);
});

test('USAGE and the CLI header document --open', () => {
  const usage = fs.readFileSync(new URL('../docs/USAGE.md', import.meta.url), 'utf8');
  assert.match(usage, /`me \[--json\] \[--card \[out\.svg\]\] \[--open\]`/);
  assert.match(usage, /xdg-open/);
});

// Tests must never launch real programs: `me --open` used to open a browser tab on every `npm test`
// (skills-plain.test.mjs runs the me skill's command, which has --open). The default opener is now
// disabled under the test runner (NODE_TEST_CONTEXT) and when SCOUT_NO_OPEN is set; an injected spawn
// (the unit tests) still works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openFile } from '../scripts/lib/open.mjs';
import { testArgs } from './run-tests.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** A PATH with fake open, xdg-open and cmd.exe that leave a marker when run. */
function trap() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-trap-'));
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  const marker = path.join(dir, 'LAUNCHED');
  for (const n of ['open', 'xdg-open', 'cmd.exe', 'start']) { fs.writeFileSync(path.join(bin, n), `#!/bin/sh\necho ${n} >> "${marker}"\n`); fs.chmodSync(path.join(bin, n), 0o755); }
  return { dir, bin, marker };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('under the test runner the default opener launches nothing', async () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'this file runs under node --test');
  const t = trap();
  const old = process.env.PATH; process.env.PATH = `${t.bin}${path.delimiter}${old}`;
  try {
    for (const platform of ['darwin', 'linux', 'win32']) assert.equal(openFile('/tmp/card.svg', { platform }), false, platform);
    await wait(200);
  } finally { process.env.PATH = old; }
  assert.ok(!fs.existsSync(t.marker), 'an opener ran');
});

test('SCOUT_NO_OPEN=1 disables it outside the test runner too', async () => {
  const t = trap();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import { openFile } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts/lib/open.mjs')).href)}; console.log(openFile('/tmp/c.svg', { platform: 'linux' }))`],
    { encoding: 'utf8', env: { PATH: `${t.bin}:/usr/bin:/bin`, HOME: t.dir, SCOUT_NO_OPEN: '1' } });
  assert.equal(r.stdout.trim(), 'false', r.stderr);
  await wait(200);
  assert.ok(!fs.existsSync(t.marker));
});

test('an injected spawn is still used (unit tests of the opener keep working)', () => {
  const log = [];
  assert.equal(openFile('/tmp/c.svg', { platform: 'linux', spawn: (cmd, args) => { log.push([cmd, args]); return { on() {}, unref() {} }; } }), true);
  assert.deepEqual(log, [['xdg-open', ['/tmp/c.svg']]]);
});

test('the real CLI with --open, run from a test with the inherited environment, opens nothing (the skills-plain case)', async () => {
  const t = trap();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-trap-home-'));
  fs.writeFileSync(path.join(t.dir, '.tool-scout-data'), '');
  fs.writeFileSync(path.join(t.dir, 'profile.json'), fs.readFileSync(path.join(ROOT, 'test/fixtures/output/profile.json')));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/scout.mjs'), 'me', '--plain', '--card', path.join(t.dir, 'c.svg'), '--open', '--data', t.dir, '--home', home],
    { encoding: 'utf8', env: { ...process.env, PATH: `${t.bin}${path.delimiter}${process.env.PATH}` } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(t.dir, 'c.svg')), 'the card is still saved');
  await wait(1500); // a detached opener starts a moment after the CLI exits
  assert.ok(!fs.existsSync(t.marker), 'a real opener was launched');
});

test('the test runner sets SCOUT_NO_OPEN for the tests it starts', () => {
  const src = fs.readFileSync(path.join(ROOT, 'test/run-tests.mjs'), 'utf8');
  assert.match(src, /SCOUT_NO_OPEN:\s*'1'/);
  assert.ok(testArgs([], []).includes('--test'));
});

test('nothing but open.mjs in the scripts starts an opener, so there is one place to guard', () => {
  const dir = path.join(ROOT, 'scripts/lib');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs') && n !== 'open.mjs')) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(src, /['"`](?:xdg-open|open|start)['"`]\s*,\s*\[/, `${f} starts an opener itself`);
    assert.doesNotMatch(src, /xdg-open/, f);
  }
});

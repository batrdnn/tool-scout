import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { MIN_NODE, nodeProblem } from '../scripts/lib/node-check.mjs';
import { createClient } from '../scripts/lib/github.mjs';
import { fileURLToPath } from 'node:url';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const MSG = (v) => `Tool Scout needs Node.js 20 or newer (you have v${v}). Install it from nodejs.org or with \`brew install node\`.`;

test('nodeProblem: below 20 gives the one-line message, 20+ gives none', () => {
  assert.equal(MIN_NODE, 20);
  assert.equal(nodeProblem('18.20.4'), MSG('18.20.4'));
  assert.equal(nodeProblem('19.9.0'), MSG('19.9.0'));
  assert.equal(nodeProblem('16.20.2'), MSG('16.20.2'));
  assert.equal(nodeProblem('17.9.1'), MSG('17.9.1'));
  assert.equal(nodeProblem('20.0.0'), null);
  assert.equal(nodeProblem('24.1.0'), null);
});

test('node-check.mjs uses only syntax very old Node versions can parse', () => {
  const src = fs.readFileSync(new URL('../scripts/lib/node-check.mjs', import.meta.url), 'utf8');
  const entry = fs.readFileSync(SCOUT, 'utf8');
  for (const s of [src, entry]) assert.doesNotMatch(s.replace(/\/\/.*$/gm, ''), /\?\.|\?\?|=>|\bconst\b|\blet\b|`/, 'keep the check ES5-ish so it runs before anything else can fail');
});

test('CLI on an old Node prints the line and exits 1, before doing anything else', () => {
  const pre = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scout-oldnode-')), 'old.cjs');
  fs.writeFileSync(pre, "Object.defineProperty(process.versions, 'node', { value: '16.20.2' });\n");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-oldnode-home-'));
  const r = spawnSync(process.execPath, ['--require', pre, SCOUT, 'stats', '--home', home, '--data', path.join(home, 'd')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), MSG('16.20.2'));
  assert.equal(r.stdout, '');
  assert.ok(!fs.existsSync(path.join(home, 'd')), 'nothing ran');
});

test('CLI on a current Node runs normally', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-newnode-'));
  const r = spawnSync(process.execPath, [SCOUT, 'stats', '--home', home, '--data', path.join(home, 'd')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /No ratings yet/);
});

test('unreachable GitHub: the error names api.github.com and NODE_USE_ENV_PROXY=1', async () => {
  const client = createClient({ fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); } });
  await assert.rejects(client.request('https://api.github.com/repos/o/r'), (e) => {
    assert.match(e.message, /ENOTFOUND/);
    assert.match(e.message, /internet access to api\.github\.com/);
    assert.match(e.message, /NODE_USE_ENV_PROXY=1/);
    return true;
  });
});

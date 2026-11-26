// The README demo: docs/demo-setup.mjs builds a clean, synthetic home and data folder (the eval's
// "webdev" persona and a fresh copy of its frozen catalog), docs/demo.tape records `all` in it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (args, env = {}) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });

test('demo-setup makes a home and a data folder, and prints the exports', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-demo-test-'));
  const r = run(['docs/demo-setup.mjs', base]);
  assert.equal(r.status, 0, r.stderr);
  const home = /export HOME='([^']+)'/.exec(r.stdout)?.[1];
  const data = /export SCOUT_DATA='([^']+)'/.exec(r.stdout)?.[1];
  assert.ok(home && data, r.stdout);
  assert.ok(home.startsWith(base) && data.startsWith(base), 'everything stays under the base folder');
  const cat = JSON.parse(fs.readFileSync(path.join(data, 'catalog.json'), 'utf8'));
  assert.ok(Date.now() - Date.parse(cat.updatedAt) < 60_000, 'a fresh catalog, so `all` does not crawl');
  assert.ok(Object.keys(cat.repos).length > 50);
  const all = run(['scripts/scout.mjs', 'all', '--offline', '--plain'], { HOME: home, USERPROFILE: home, SCOUT_DATA: data });
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /1\. /);
  assert.match(all.stdout, /3\. /);
  assert.ok(!all.stdout.includes(os.homedir() === home ? '\0' : os.homedir() + path.sep + '.claude'), 'does not read the real home');
  fs.rmSync(base, { recursive: true, force: true });
});

test('demo-setup refuses to write outside a folder it made (no base = a new temp folder)', () => {
  const r = run(['docs/demo-setup.mjs']);
  assert.equal(r.status, 0, r.stderr);
  const home = /export HOME='([^']+)'/.exec(r.stdout)[1];
  assert.ok(home.startsWith(fs.realpathSync(os.tmpdir())) || home.startsWith(os.tmpdir()));
  fs.rmSync(path.dirname(home), { recursive: true, force: true });
});

test('demo.tape records `node scripts/scout.mjs all` into docs/demo.gif', () => {
  const t = fs.readFileSync(path.join(ROOT, 'docs', 'demo.tape'), 'utf8');
  assert.match(t, /^Output docs\/demo\.gif$/m);
  assert.match(t, /^Type "node scripts\/scout\.mjs all/m);
  assert.match(t, /docs\/demo-setup\.mjs/);
  assert.match(t, /^Hide$/m);
  assert.match(t, /^Show$/m);
});

test('the README shows the GIF once it exists, and a placeholder until then', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const have = fs.existsSync(path.join(ROOT, 'docs', 'demo.gif'));
  if (have) assert.match(readme, /!\[[^\]]*\]\(docs\/demo\.gif\)/);
  else assert.match(readme, /<!-- demo-gif: record it with `vhs docs\/demo\.tape`, then replace this line with ![^>]*docs\/demo\.gif[^>]*-->/);
});

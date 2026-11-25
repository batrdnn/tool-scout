import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveDataDir } from '../scripts/lib/datadir.mjs';
import { fileURLToPath } from 'node:url';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const tmpHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scout-home-'));
const mk = (...p) => { const d = path.join(...p); fs.mkdirSync(d, { recursive: true }); return d; };

test('--data wins, then SCOUT_DATA', () => {
  const home = tmpHome();
  mk(home, '.claude/plugins/data/tool-scout-tool-scout');
  assert.deepEqual(resolveDataDir({ data: '/x', env: { SCOUT_DATA: '/y' }, home }), { dir: '/x', source: '--data' });
  assert.deepEqual(resolveDataDir({ env: { SCOUT_DATA: '/y' }, home }), { dir: '/y', source: 'SCOUT_DATA' });
});

test('uses the installed plugin data folder when it exists', () => {
  const home = tmpHome();
  const dir = mk(home, '.claude/plugins/data/tool-scout-tool-scout');
  mk(home, '.claude/plugins/data/other-plugin-x');
  assert.deepEqual(resolveDataDir({ env: {}, home }), { dir, source: 'plugin' });
});

test('prefers the marketplace install over other tool-scout folders; else the newest one', () => {
  const home = tmpHome();
  const inline = mk(home, '.claude/plugins/data/tool-scout-inline');
  assert.equal(resolveDataDir({ env: {}, home }).dir, inline);
  const market = mk(home, '.claude/plugins/data/tool-scout-tool-scout');
  fs.utimesSync(inline, new Date(), new Date(Date.now() + 60e3));
  assert.equal(resolveDataDir({ env: {}, home }).dir, market);
  fs.rmSync(market, { recursive: true });
  const fork = mk(home, '.claude/plugins/data/tool-scout-fork');
  fs.utimesSync(fork, new Date(), new Date(Date.now() + 120e3));
  assert.equal(resolveDataDir({ env: {}, home }).dir, fork);
});

test('ignores files and unrelated names; falls back to ~/.tool-scout', () => {
  const home = tmpHome();
  assert.deepEqual(resolveDataDir({ env: {}, home }), { dir: path.join(home, '.tool-scout'), source: 'default' });
  mk(home, '.claude/plugins/data/tool-scouting-x');
  fs.writeFileSync(path.join(home, '.claude/plugins/data/tool-scout-file'), '');
  assert.equal(resolveDataDir({ env: {}, home }).source, 'default');
});

test('profile --show and stats print the data folder in use', () => {
  const home = tmpHome();
  const dir = mk(home, '.claude/plugins/data/tool-scout-tool-scout');
  const env = { ...process.env }; delete env.SCOUT_DATA;
  const run = (...a) => execFileSync(process.execPath, [SCOUT, ...a, '--home', home], { env, encoding: 'utf8' });
  assert.match(run('profile', '--show'), new RegExp(`Data folder: ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(installed plugin\\)`));
  assert.match(run('stats'), /Data folder: .*tool-scout-tool-scout \(installed plugin\)/);
  fs.rmSync(dir, { recursive: true });
  assert.match(run('stats'), /Data folder: .*\.tool-scout \(default\)/);
  assert.match(run('stats', '--data', path.join(home, 'd')), /Data folder: .*[\\/]d \(--data\)/);
});

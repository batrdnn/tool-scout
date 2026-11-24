// One version everywhere: plugin.json, package.json, the newest release report and the changelog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const reports = fs.readdirSync(new URL('../docs/reports/', import.meta.url)).map((f) => f.match(/^v(\d+\.\d+(?:\.\d+)?)\.md$/)?.[1]).filter(Boolean).sort(cmp);

test('plugin.json and package.json have the same version, and it is the newest docs/reports/ file', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json')).version;
  const pkg = JSON.parse(read('package.json')).version;
  assert.equal(plugin, pkg, 'plugin.json vs package.json');
  assert.match(pkg, /^\d+\.\d+\.\d+$/);
  const newest = reports.at(-1);
  assert.equal(cmp(pkg, newest), 0, `version ${pkg} but the newest report is v${newest}.md`);
});

test('CHANGELOG.md has one entry per release, newest first, the newest being the current version', () => {
  const log = read('CHANGELOG.md');
  const entries = [...log.matchAll(/^## v(\d+\.\d+(?:\.\d+)?)\b/gm)].map((m) => m[1]);
  assert.equal(entries[0], JSON.parse(read('package.json')).version);
  assert.deepEqual(entries, [...entries].sort(cmp).reverse(), 'newest first');
  assert.equal(new Set(entries).size, entries.length, 'one entry per release');
  for (const v of ['0.1', ...reports]) assert.ok(entries.some((e) => cmp(e, v) === 0), `no entry for v${v}`);
});

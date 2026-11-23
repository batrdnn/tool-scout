import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeRepo, dismiss, undismiss, loadDismissed, dismissedSet } from '../scripts/lib/feedback.mjs';
import { materialize } from './eval/personas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scout-fb-'));

test('normalizeRepo accepts owner/repo and GitHub URLs, rejects junk', () => {
  assert.equal(normalizeRepo('Microsoft/Playwright-MCP'), 'microsoft/playwright-mcp');
  assert.equal(normalizeRepo('https://github.com/o/r.git'), 'o/r');
  assert.equal(normalizeRepo('https://github.com/o/r/tree/main/skills'), 'o/r');
  for (const bad of ['', 'just-a-name', 'a/b/c d', '../etc/passwd', 'https://evil.example/o/r']) assert.equal(normalizeRepo(bad), null, bad);
});

test('dismiss and undismiss persist in the data dir', () => {
  const dir = tmp();
  assert.deepEqual(dismiss(dir, 'O/R'), { name: 'o/r', added: true });
  assert.equal(dismiss(dir, 'o/r').added, false);
  dismiss(dir, 'x/y');
  assert.deepEqual([...dismissedSet(dir)].sort(), ['o/r', 'x/y']);
  assert.deepEqual(undismiss(dir, 'o/r'), ['o/r']);
  assert.deepEqual(undismiss(dir, 'o/r'), []);
  assert.deepEqual(undismiss(dir, null), ['x/y']);
  assert.deepEqual(loadDismissed(dir).repos, {});
  assert.throws(() => dismiss(dir, 'nope'), /not a GitHub repo/);
});

test('CLI: a dismissed repo is excluded from recommendations until undismissed', () => {
  const data = tmp();
  fs.copyFileSync(path.join(root, 'test/eval/catalog.json'), path.join(data, 'catalog.json'));
  const home = materialize('webdev', data);
  const run = (...args) => execFileSync(process.execPath, [path.join(root, 'scripts/scout.mjs'), ...args, '--data', data, '--home', home], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const names = () => JSON.parse(run('recommend', '--top', '25', '--json', '--offline')).recommendations.map((r) => r.name);

  assert.ok(names().includes('microsoft/playwright-mcp'));
  assert.match(run('dismiss', 'microsoft/playwright-mcp'), /Dismissed microsoft\/playwright-mcp/);
  const after = JSON.parse(run('recommend', '--top', '25', '--json', '--offline'));
  assert.ok(!after.recommendations.some((r) => r.name === 'microsoft/playwright-mcp'));
  assert.equal(after.dismissedCount, 1);
  assert.match(run('dismiss'), /microsoft\/playwright-mcp/);
  assert.match(run('undismiss', 'microsoft/playwright-mcp'), /Undismissed/);
  assert.ok(names().includes('microsoft/playwright-mcp'));
});

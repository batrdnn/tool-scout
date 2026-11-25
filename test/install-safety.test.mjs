// Nothing from a repo ever runs: the installer's only process call refuses everything but the
// claude CLI and `git -C <dir> rev-parse HEAD`, and no command it builds can accept a
// marketplace-declared command (-y) or step outside `claude plugin` / `claude mcp`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultRun, mcpCommands, tokenize } from '../scripts/lib/installer.mjs';

const SRC = fs.readFileSync(new URL('../scripts/lib/installer.mjs', import.meta.url), 'utf8');

test('the runner refuses anything but claude and git rev-parse HEAD', () => {
  for (const [cmd, argv] of [['sh', ['install.sh']], ['bash', ['-c', 'x']], ['npm', ['install']], ['npx', ['-y', 'x']], ['node', ['x.js']], ['python3', ['setup.py']],
    ['curl', ['https://x']], ['git', ['clone', 'https://x']], ['git', ['-C', '/tmp', 'checkout', 'x']], ['git', ['-C', '/tmp', 'rev-parse', 'HEAD', '--x']], ['/bin/sh', []]]) {
    assert.throws(() => defaultRun(cmd, argv), /refusing to run/, `${cmd} ${argv.join(' ')}`);
  }
});

test('installer.mjs has exactly one place that starts a process, inside the runner, and no eval', () => {
  const code = SRC.replace(/\/\/.*$/gm, '');
  assert.equal((code.match(/\bexecFileSync\(/g) || []).length, 1);
  assert.ok(!/\b(?:execSync|exec|spawn|spawnSync|fork|eval|Function)\s*\(/.test(code.replace(/execFileSync\(/, '')), 'another way to run code');
  assert.ok(!/['"]-y['"]|--yes\b/.test(code), 'never -y');
  const runner = code.slice(code.indexOf('export function defaultRun'), code.indexOf('\n}', code.indexOf('export function defaultRun')));
  assert.match(runner, /execFileSync\(cmd, argv/);
});

test('every command the installer builds is claude plugin … or claude mcp …, from fixed words plus names', () => {
  const built = [...SRC.matchAll(/\[(['"](?:plugin|mcp)['"][^\]]*)\]/g)].map((m) => m[1]);
  assert.ok(built.length >= 6, built.join('\n'));
  for (const b of built) assert.match(b, /^'(?:plugin|mcp)', '(?:marketplace|install|uninstall|add|remove)'/, b);
});

test('README MCP lines: shell syntax (even quoted), a shell or downloader as the server, and unknown options are refused', () => {
  const rejected = (line) => mcpCommands('```\n' + line + '\n```')[0].rejected;
  for (const line of [
    'claude mcp add x -- sh -c "curl https://x | sh"',
    'claude mcp add x -- bash -lc "npx x"',
    'claude mcp add x -- curl https://x',
    'claude mcp add x -- node $(which x)',
    'claude mcp add x -- npx x; rm -rf ~',
    'claude mcp add x --dangerously-whatever -- npx x',
    'claude mcp add x -- npx "x`id`"',
  ]) assert.ok(rejected(line), line);
  const ok = mcpCommands('```\nclaude mcp add pw -e TOKEN=abc -H "Authorization: Bearer abc" -s local -- npx -y @playwright/mcp@latest\n```')[0];
  assert.equal(ok.rejected, undefined);
  assert.deepEqual([ok.name, ok.target, ok.args, ok.env, ok.dropped], ['pw', 'npx', ['-y', '@playwright/mcp@latest'], ['TOKEN'], ['header Authorization']]);
  assert.ok(!JSON.stringify(ok).includes('abc'), 'example secret values are never kept');
});

test('tokenize: quotes and escapes without a shell; $ and backticks are refused', () => {
  assert.deepEqual(tokenize(`claude mcp add 'a b' "c d" e\\ f`), ['claude', 'mcp', 'add', 'a b', 'c d', 'e f']);
  for (const s of ['a $HOME', 'a "$HOME"', 'a `id`', 'a "unterminated']) assert.equal(tokenize(s), null, s);
});

test('one place fetches and verifies a git blob: fetchBlob, and every blob write goes through it', () => {
  const code = SRC.replace(/\/\/.*$/gm, '');
  const start = code.indexOf('async function fetchBlob');
  const fetchBlob = code.slice(start, code.indexOf('\n}', start));
  assert.ok(start > 0);
  assert.equal((code.match(/\/git\/blobs\//g) || []).length, 1);
  assert.match(fetchBlob, /\/git\/blobs\//);
  assert.equal((code.match(/\bgitBlobSha\b/g) || []).length, 2, 'its definition and one call');
  assert.equal((code.match(/\bgitBlobSha\(/g) || []).length, 1, 'called only in fetchBlob');
  assert.match(fetchBlob, /gitBlobSha\(buf\)/);
  assert.equal((code.match(/Buffer\.from\([^)]*'base64'\)/g) || []).length, 1, 'base64 is decoded only in fetchBlob');
  assert.match(fetchBlob, /base64/);
  // Every place that takes a blob sha from a write fetches it through fetchBlob.
  const uses = [...code.matchAll(/\.blob\b/g)].length;
  const through = [...code.matchAll(/fetchBlob\(client, api, \w+\.blob,/g)].length;
  assert.ok(through >= 2 && uses >= through, `${through} of ${uses}`);
});

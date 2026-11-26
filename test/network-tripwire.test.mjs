// v0.17.2: tests must never reach the real network. The runner preloads test/network-tripwire.mjs into
// every test process (and every node process a test starts with the inherited environment): a real
// fetch, or a socket to a non-local host, is recorded and the process exits non-zero. Mocks (an
// injected fetchImpl, a replaced globalThis.fetch) never reach it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testEnv, testArgs } from './run-tests.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRIPWIRE = pathToFileURL(path.join(HERE, 'network-tripwire.mjs')).href;
const node = (code, env = {}) => spawnSync(process.execPath, ['--import', TRIPWIRE, '--input-type=module', '-e', code], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

test('a real fetch to the internet fails the process, even if the code swallows the error', () => {
  const r = node("try { await fetch('https://api.github.com/rate_limit'); } catch {} console.log('survived');");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /network tripwire/i);
  assert.match(r.stderr, /api\.github\.com/);
});

test('a raw socket to a non-local host fails the process too', () => {
  const r = node("import net from 'node:net'; try { net.connect({ host: 'example.com', port: 80 }).on('error', () => {}); } catch {} setTimeout(() => {}, 50);");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /network tripwire/i);
});

test('a mock is fine: an injected fetch and a replaced globalThis.fetch never reach the tripwire', () => {
  const r = node("globalThis.fetch = async () => new Response('{}'); const r = await fetch('https://api.github.com/x'); console.log(r.status);");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '200');
});

test('local addresses are not the internet: a loopback server is reachable', () => {
  const r = node("import http from 'node:http'; const s = http.createServer((q, a) => a.end('ok')).listen(0, '127.0.0.1', async () => { const t = await (await fetch('http://127.0.0.1:' + s.address().port)).text(); console.log(t); s.close(); });");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'ok');
});

test('the runner preloads it into every test process and the node processes tests start', () => {
  assert.ok(testArgs([], []).includes('--test'));
  assert.match(testEnv({}).NODE_OPTIONS, /network-tripwire\.mjs/);
  assert.match(testEnv({ NODE_OPTIONS: '--no-warnings' }).NODE_OPTIONS, /^--no-warnings .*network-tripwire/, 'keeps the options already there');
  const env = testEnv(process.env);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "try { await fetch('https://example.com'); } catch {}"], { encoding: 'utf8', env });
  assert.notEqual(r.status, 0, 'a child with the runner environment hits the tripwire');
});

test('the tests in this process are running under it (when started by the runner)', { skip: !process.env.SCOUT_NO_OPEN ? 'started without the runner' : false }, () => {
  assert.match(process.env.NODE_OPTIONS || '', /network-tripwire\.mjs/);
});

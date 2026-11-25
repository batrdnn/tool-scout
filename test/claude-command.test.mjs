// v0.15.0 item 2/3, cause 12: Tool Scout runs the claude CLI only through execFile, never a shell.
// On Windows a .cmd shim can't be run that way (Node refuses it, and a shell would put argument
// quoting into security-sensitive code), so claude.exe is used if found, and otherwise it fails with
// a message that says what to do. Never silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeCommand } from '../scripts/lib/installer.mjs';

const has = (...files) => (f) => files.includes(f);

test('on macOS and Linux it is just `claude`, found by the system', () => {
  for (const platform of ['darwin', 'linux']) assert.equal(claudeCommand({ platform, pathEnv: '/usr/bin', exists: () => false }), 'claude');
});

test('on Windows the first claude.exe on PATH is used, by full path', () => {
  const exe = claudeCommand({ platform: 'win32', pathEnv: 'C:\\Windows;C:\\Users\\a\\.local\\bin;D:\\other', exists: has('C:\\Users\\a\\.local\\bin\\claude.exe', 'D:\\other\\claude.exe') });
  assert.equal(exe, 'C:\\Users\\a\\.local\\bin\\claude.exe');
});

test('on Windows a claude.cmd shim alone is refused, with what to do instead', () => {
  assert.throws(() => claudeCommand({ platform: 'win32', pathEnv: 'C:\\npm', exists: has('C:\\npm\\claude.cmd') }), (e) => {
    assert.match(e.message, /claude\.cmd/);
    assert.match(e.message, /claude\.exe/);
    assert.match(e.message, /native installer|run the command yourself/i);
    return true;
  });
});

test('on Windows with no claude at all the message says it was not found on PATH', () => {
  assert.throws(() => claudeCommand({ platform: 'win32', pathEnv: 'C:\\Windows', exists: () => false }), /claude was not found on PATH/);
  assert.throws(() => claudeCommand({ platform: 'win32', pathEnv: '', exists: () => false }), /claude was not found on PATH/);
});

// v0.15.0 item 2, cause 6: the sandbox tests compare the paths a plan names with the paths a snapshot
// finds. Both are compared as POSIX paths (forward slashes), so a Windows backslash never makes a
// planned path look "outside the plan".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { relPosix } from './build-helpers.mjs';

test('relPosix gives a forward-slash path relative to the root, on either system', () => {
  assert.equal(relPosix('C:\\r', 'C:\\r\\home\\.claude\\skills\\x', path.win32), 'home/.claude/skills/x');
  assert.equal(relPosix('/r', '/r/home/.claude/skills/x', path.posix), 'home/.claude/skills/x');
  assert.equal(relPosix('/r', '/r', path.posix), '');
});

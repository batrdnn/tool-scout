// v0.15.0 item 2, cause 5: a path shown as ~/... always uses forward slashes, on Windows too, so the
// plans read the same everywhere (and match the docs). Absolute paths are shown as the system has them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tilde } from '../scripts/lib/installer.mjs';

test('a path under home is shown as ~/..., with forward slashes on Windows', () => {
  assert.equal(tilde('C:\\Users\\a\\.claude\\skills\\pdf\\SKILL.md', 'C:\\Users\\a', '\\'), '~/.claude/skills/pdf/SKILL.md');
  assert.equal(tilde('/home/a/.claude/skills/pdf', '/home/a', '/'), '~/.claude/skills/pdf');
});

test('a path outside home is left as it is', () => {
  assert.equal(tilde('D:\\a\\x\\y', 'C:\\Users\\a', '\\'), 'D:\\a\\x\\y');
  assert.equal(tilde('/opt/x', '/home/a', '/'), '/opt/x');
});

test('home itself and a sibling that shares its prefix are not "under home"', () => {
  assert.equal(tilde('/home/ab/x', '/home/a', '/'), '/home/ab/x');
  assert.equal(tilde('C:\\Users\\ab\\x', 'C:\\Users\\a', '\\'), 'C:\\Users\\ab\\x');
});

// v0.15.0 item 2, cause 4: a hook command quotes its script path in double quotes. A Windows path has
// backslashes, which a shell would eat, so it is written with forward slashes (C:/Users/...), which
// Git Bash and node both accept. Anything a double-quoted shell string can't hold is still refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hookCommandPath } from '../scripts/lib/builder.mjs';

test('a Windows path becomes forward slashes, drive letter kept', () => {
  assert.equal(hookCommandPath('C:\\Users\\a b\\.claude\\hooks\\no-force-push\\guard.mjs', 'win32'), 'C:/Users/a b/.claude/hooks/no-force-push/guard.mjs');
  assert.equal(hookCommandPath('D:\\a\\x\\guard.sh', 'win32'), 'D:/a/x/guard.sh');
});

test('a POSIX path is unchanged', () => {
  assert.equal(hookCommandPath('/home/u/.claude/hooks/x/guard.mjs', 'linux'), '/home/u/.claude/hooks/x/guard.mjs');
});

test('characters a double-quoted command can\'t hold are refused, on every platform', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    for (const bad of ['/h/a"b/g.mjs', '/h/$HOME/g.mjs', '/h/a`b/g.mjs']) assert.equal(hookCommandPath(bad, platform), null, `${platform} ${bad}`);
  }
});

test('on POSIX a backslash in a path is still refused (it would be eaten by the shell)', () => {
  assert.equal(hookCommandPath('/h/a\\b/g.mjs', 'linux'), null);
  assert.equal(hookCommandPath('/h/a\\b/g.mjs', 'darwin'), null);
});

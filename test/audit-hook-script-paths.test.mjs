// v0.15.0 item 2, cause 14: the script a hook runs is found and shown the same way on Windows: the
// command may mix "/" and "\", and the script is shown relative to the project with forward slashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { hookScript } from '../scripts/lib/audit.mjs';

const win = (files) => ({ pathApi: path.win32, stat: (f) => { if (!files.includes(f)) throw new Error('ENOENT'); return { isFile: () => true, size: 10 }; } });

test('Windows: $CLAUDE_PROJECT_DIR plus a forward-slash path is one normal path, shown relative with /', () => {
  const projectDir = 'C:\\Users\\a\\proj';
  const r = hookScript('node "$CLAUDE_PROJECT_DIR"/.claude/hooks/sync.mjs --quiet', { home: 'C:\\Users\\a', projectDir, ...win(['C:\\Users\\a\\proj\\.claude\\hooks\\sync.mjs']) });
  assert.deepEqual(r, { abs: 'C:\\Users\\a\\proj\\.claude\\hooks\\sync.mjs', shown: '.claude/hooks/sync.mjs' });
});

test('Windows: an absolute script written with forward slashes (C:/...) is found, and ~ expands to home', () => {
  const files = ['C:\\Users\\a\\.claude\\hooks\\g\\guard.mjs'];
  const home = 'C:\\Users\\a';
  const a = hookScript('node "C:/Users/a/.claude/hooks/g/guard.mjs"', { home, projectDir: null, ...win(files) });
  assert.equal(a.abs, files[0]);
  assert.equal(a.shown, '~/.claude/hooks/g/guard.mjs');
  const b = hookScript('node ~/.claude/hooks/g/guard.mjs', { home, projectDir: null, ...win(files) });
  assert.equal(b.abs, files[0]);
});

test('POSIX: unchanged', () => {
  const stat = (f) => { if (f !== '/p/.claude/hooks/x.sh') throw new Error('ENOENT'); return { isFile: () => true, size: 1 }; };
  assert.deepEqual(hookScript('sh "$CLAUDE_PROJECT_DIR"/.claude/hooks/x.sh', { home: '/h', projectDir: '/p', pathApi: path.posix, stat }), { abs: '/p/.claude/hooks/x.sh', shown: '.claude/hooks/x.sh' });
});

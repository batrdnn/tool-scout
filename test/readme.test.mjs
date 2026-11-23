import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('README has a "Check before you install" section covering check, audit and the caveat', () => {
  const sec = README.split(/^## /m).find((s) => s.startsWith('Check before you install'));
  assert.ok(sec, 'section missing');
  assert.match(sec, /\/tool-scout:check/);
  assert.match(sec, /scout\.mjs check /);
  assert.match(sec, /scout\.mjs audit/);
  assert.match(sec, /safe-looking[\s\S]*review[\s\S]*do not install/);
  assert.match(sec, /no network/i);
  assert.match(sec, /no flags[^.\n]*(doesn't|does not) mean[^.\n]*safe/i);
});

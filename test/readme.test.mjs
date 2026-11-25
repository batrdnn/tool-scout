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

test('safety and privacy wording: installs only after you approve a plan, and every install can be undone', () => {
  const SENTENCE = 'installs only after you approve a plan, and every install can be undone';
  const TESTING = fs.readFileSync(new URL('../TESTING.md', import.meta.url), 'utf8');
  for (const [name, text] of [['README.md', README], ['TESTING.md', TESTING]]) {
    assert.doesNotMatch(text, /never installs anything|nothing is installed/i, `${name} still says nothing is installed`);
  }
  for (const sec of ['Privacy', 'Check before you install']) {
    const s = README.split(/^## /m).find((x) => x.startsWith(sec));
    assert.ok(s.replace(/\s+/g, ' ').includes(SENTENCE), `${sec}: missing "${SENTENCE}"`);
  }
  const cli = README.split(/^## /m).find((x) => x.startsWith('Command line'));
  for (const c of ['install owner/repo --plan', 'install owner/repo --confirm', 'scout.mjs undo', 'scout.mjs installed']) assert.ok(cli.includes(c), c);
});

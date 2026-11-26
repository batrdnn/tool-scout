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

test('safety and privacy wording (v0.17): Tool Scout installs nothing, says what it keeps, and does not promise undo', () => {
  const PRIVACY = "Tool Scout doesn't upload your history. When you run a skill, a summary goes into Claude's context like anything else you show Claude.";
  const TESTING = fs.readFileSync(new URL('../TESTING.md', import.meta.url), 'utf8');
  for (const [name, text] of [['README.md', README], ['TESTING.md', TESTING]]) {
    assert.doesNotMatch(text, /never installs anything/i, `${name}`);
    assert.doesNotMatch(text, /every install can be undone|installs only after you approve a plan/i, `${name} still makes the old claim`);
    assert.match(text.replace(/\s+/g, ' '), /doesn't install anything in this version|installs nothing/i, `${name} should say Tool Scout installs nothing`);
  }
  const priv = README.split(/^## /m).find((x) => x.startsWith('Privacy'));
  assert.ok(priv.replace(/\s+/g, ' ').includes(PRIVACY), 'Privacy: the accurate sentence');
  const check = README.split(/^## /m).find((x) => x.startsWith('Check before you install'));
  assert.match(check.replace(/\s+/g, ' '), /manual steps/);
  const cli = README.split(/^## /m).find((x) => x.startsWith('Command line'));
  for (const c of ['scout.mjs privacy', 'scout.mjs installed']) assert.ok(cli.includes(c), c);
  assert.ok(!cli.includes('install owner/repo --plan'), 'the experimental install commands are not in the everyday command list');
});

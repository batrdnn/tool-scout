// v0.14.0 item 3: the me skill offers "Look at my blind-spot tool". It goes through /tool-scout:check.
// Since v0.17 (safe mode) it then gives manual steps, and never installs anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const skill = fs.readFileSync(new URL('../skills/me/SKILL.md', import.meta.url), 'utf8');
const next = skill.split(/^## /m).find((s) => s.startsWith('Ask what')) || '';
const blind = skill.split(/^## /m).find((s) => /^The blind-spot tool/.test(s)) || '';

test('the "What next?" question has the new option, after the existing two', () => {
  assert.ok(next, 'the "Ask what\'s next" section');
  const opts = [...next.matchAll(/^- "([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(opts, ['See recommendations', 'Look at my blind-spot tool', 'Not now']);
  assert.match(next, /Egg/i, 'not offered for the Egg');
});

test('the blind-spot section runs the lookup, then check, then manual steps', () => {
  assert.ok(blind, 'a "The blind-spot tool" section');
  assert.match(blind, /scout\.mjs" me --blind-spot --json/);
  assert.match(blind, /\/tool-scout:check/);
  assert.doesNotMatch(blind, /"Install it"/);
  assert.match(blind, /blindSpotTool\.manual/);
  assert.match(blind, /manual steps/i);
  assert.match(blind, /never installs anything/i);
  assert.match(blind, /nothing needed/i, 'the "nothing needed" answer ends it');
  assert.match(blind, /built-in|built in/i, 'a built-in feature is typed by the user, never installed');
});

test('the skill still says it never installs anything from the question itself', () => {
  assert.match(next, /(No option|None of the options|Neither option|no option) installs anything/i);
});

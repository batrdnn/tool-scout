// v0.16.0 item 6: TESTING.md walks a tester through the tester round: install, what to try
// (scout, check, me, kickoff), how to rate, how to file a GitHub issue, what `stats --share` holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const DOC = fs.readFileSync(new URL('../TESTING.md', import.meta.url), 'utf8');
const heads = [...DOC.matchAll(/^## (.*)$/gm)].map((m) => m[1]);
const section = (re) => { const i = heads.findIndex((h) => re.test(h)); assert.ok(i >= 0, `no section ${re}`); const from = DOC.indexOf(`## ${heads[i]}`); return DOC.slice(from, heads[i + 1] ? DOC.indexOf(`## ${heads[i + 1]}`) : undefined); };

test('the sections come in the order a tester needs them', () => {
  const order = [/^1\. Install/, /^2\. Run it/, /^3\. What to try/, /^4\. Rate/, /^5\. File an issue/, /^6\. Share/, /^Undo/];
  const at = order.map((re) => heads.findIndex((h) => re.test(h)));
  assert.ok(at.every((i) => i >= 0), JSON.stringify(heads));
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
});

test('install: the marketplace (or a local copy), and Node 20', () => {
  const s = section(/^1\. Install/);
  assert.match(s, /\/plugin marketplace add batrdnn\/tool-scout/);
  assert.match(s, /\/plugin install tool-scout@tool-scout/);
  assert.match(s, /Node 20 or newer/);
});

test('what to try: scout, check, me and kickoff, each with a command and what to look for', () => {
  const s = section(/^3\. What to try/);
  for (const c of ['/tool-scout:scout', '/tool-scout:check', '/tool-scout:me', '/tool-scout:kickoff']) assert.ok(s.includes(c), c);
  assert.match(s, /plan/i);
  assert.match(s, /yes\/no|before anything is installed/i);
});

test('rating: the one-line format, changing your mind, and that "not" matters', () => {
  const s = section(/^4\. Rate/);
  assert.match(s, /1 useful, 2 not/); assert.match(s, /rate #2 as useful/); assert.match(s, /"not" is just as useful/);
});

test('filing an issue: the link, what to include, and what never to paste', () => {
  const s = section(/^5\. File an issue/);
  assert.match(s, /https:\/\/github\.com\/batrdnn\/tool-scout\/issues\/new/);
  for (const w of ['version', 'command', 'what happened', 'what you expected']) assert.match(s, new RegExp(w, 'i'), w);
  assert.match(s, /SECURITY\.md/); assert.match(s, /profile\.json/);
});

test('sharing: stats --share, and exactly what it holds', () => {
  const s = section(/^6\. Share/);
  assert.match(s, /stats --share/);
  for (const w of ['aggregate counts', 'rated', 'animal']) assert.match(s, new RegExp(w, 'i'), w);
  assert.match(s, /<!-- share-example -->/);
  assert.match(s, /copy and\s+paste it yourself/);
});

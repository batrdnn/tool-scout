import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { rate, loadRatings, ratingStats, shareText } from '../scripts/lib/ratings.mjs';
import { fileURLToPath } from 'node:url';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scout-rate-'));

test('rate stores one rating per repo (latest wins), accepts useful|not and a few synonyms', () => {
  const d = tmp();
  assert.deepEqual(rate(d, 'Acme/Tool', 'useful'), { name: 'acme/tool', rating: 'useful', changed: true });
  assert.equal(rate(d, 'https://github.com/acme/tool', 'not').rating, 'not');
  assert.equal(rate(d, 'b/x', 'yes').rating, 'useful');
  assert.equal(rate(d, 'c/y', 'no').rating, 'not');
  assert.deepEqual(Object.keys(loadRatings(d).repos).sort(), ['acme/tool', 'b/x', 'c/y']);
  assert.throws(() => rate(d, 'b/x', 'meh'), /useful or not/);
  assert.throws(() => rate(d, 'nope', 'useful'), /owner\/repo/);
  rate(d, 'c/y', 'clear');
  assert.deepEqual(Object.keys(loadRatings(d).repos).sort(), ['acme/tool', 'b/x']);
});

test('stats: share of rated picks that were useful', () => {
  const d = tmp();
  assert.deepEqual(ratingStats(d), { rated: 0, useful: 0, not: 0, usefulShare: null });
  rate(d, 'a/1', 'useful'); rate(d, 'a/2', 'useful'); rate(d, 'a/3', 'not');
  assert.deepEqual(ratingStats(d), { rated: 3, useful: 2, not: 1, usefulShare: 2 / 3 });
});

test('stats --share contains counts and rated repo names only, never profile data', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'profile.json'), JSON.stringify({ topics: { finance: 3 }, stack: { zzsecretlib: 2 }, languages: { Swift: 9 } }));
  fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ excludeProjects: ['zzprivateproject'] }));
  rate(d, 'a/one', 'useful'); rate(d, 'b/two', 'not');
  const text = shareText(d, { version: '9.9.9', now: new Date('2026-11-24T00:00:00Z') });
  assert.match(text, /rated: 2/);
  assert.match(text, /useful: 1 \(50%\)/);
  assert.match(text, /a\/one/);
  assert.match(text, /b\/two/);
  for (const secret of ['finance', 'zzsecretlib', 'Swift', 'zzprivateproject', os.homedir(), os.userInfo().username]) assert.ok(!text.includes(secret), `leaked: ${secret}`);
});

test('CLI: rate, stats, stats --share', () => {
  const d = tmp();
  const cli = (...a) => execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url)), ...a, '--data', d], { encoding: 'utf8' });
  assert.match(cli('rate', 'acme/tool', 'useful'), /acme\/tool: useful/);
  cli('rate', 'acme/other', 'not');
  assert.match(cli('stats'), /2 rated picks: 1 useful \(50%\), 1 not useful/);
  const share = cli('stats', '--share');
  assert.match(share, /This is everything that would be shared: aggregate counts, the rated repo names and your Claude Code animal\./);
  assert.match(share, /acme\/tool/);
  assert.match(share, /^animal: —$/m, 'no saved profile: stats --share does not read history');
  assert.ok(!fs.existsSync(path.join(d, 'profile.json')));
});

test('stats --share adds the animal name only (from the saved profile; "—" without one)', async () => {
  const { GALLERY } = await import('./gallery.mjs');
  const d = tmp();
  rate(d, 'a/one', 'useful');
  const now = new Date('2026-11-24T00:00:00Z');
  assert.match(shareText(d, { version: '9.9.9', now }), /^animal: —$/m);
  fs.writeFileSync(path.join(d, 'profile.json'), JSON.stringify({ ...GALLERY.Bee, stack: { zzsecretlib: 2 } }));
  const text = shareText(d, { version: '9.9.9', now });
  assert.equal(text.split('\n')[1], 'animal: Bee');
  for (const leak of ['The Tester', 'pytest', 'Python', 'testing', 'zzsecretlib', 'sessions', 'Hatching']) assert.ok(!text.includes(leak), `leaked: ${leak}`);
  // An Egg is shared as Egg, without its teaser.
  fs.writeFileSync(path.join(d, 'profile.json'), JSON.stringify(GALLERY.Egg));
  assert.match(shareText(d, { version: '9.9.9', now }), /^animal: Egg$/m);
  assert.doesNotMatch(shareText(d, { version: '9.9.9', now }), /Bee|Hatching/);
});

// docs/eval/effort-review.md: 20 real repos (fixed seed + hand-chosen examples of every type),
// their estimate, and an empty "Agree? (y/n)" column for a human reviewer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectRepos, renderReview, HAND, SEED, RANDOM, REVIEW_MD, REVIEW_JSON } from './eval/effort-review.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('./eval/catalog.json', import.meta.url), 'utf8'));
const TYPES = ['instructions', 'skill-scripts', 'plugin', 'mcp-server', 'app'];

test('selection: fixed seed from the frozen catalog plus hand-chosen examples, 20 distinct, same every time', () => {
  const a = selectRepos(catalog), b = selectRepos(catalog);
  assert.deepEqual(a, b);
  assert.equal(a.length, 20);
  assert.equal(new Set(a.map((x) => x.name)).size, 20);
  assert.equal(a.filter((x) => x.source === 'hand').length, HAND.length);
  assert.equal(a.filter((x) => x.source === `seed ${SEED}`).length, RANDOM);
  assert.ok(a.filter((x) => x.source !== 'hand').every((x) => catalog.repos[x.name]), 'seeded ones come from the catalog');
  assert.deepEqual([...new Set(HAND.map((h) => h.expect))].sort(), [...TYPES].sort(), 'a hand-chosen example of every type');
});

test('the review doc exists, has 20 rows, every type, and an empty Agree column', () => {
  const md = fs.readFileSync(REVIEW_MD, 'utf8');
  const rows = md.split('\n').filter((l) => /^\| \d+ \|/.test(l));
  assert.equal(rows.length, 20);
  assert.match(md, /\| Agree\? \(y\/n\) \|$/m);
  for (const r of rows) assert.match(r, /\|\s*\|$/, `Agree column must be empty: ${r}`);
  const results = JSON.parse(fs.readFileSync(REVIEW_JSON, 'utf8'));
  assert.deepEqual([...new Set(results.repos.filter((r) => r.effort).map((r) => r.effort.type))].sort(), [...TYPES].sort(), 'every type is covered');
  assert.ok(['build', 'either', 'install'].every((a) => results.repos.some((r) => r.effort?.advice === a)), 'every advice appears');
});

test('the doc is exactly what the saved results render to (reproducible without the network)', () => {
  const results = JSON.parse(fs.readFileSync(REVIEW_JSON, 'utf8'));
  assert.equal(fs.readFileSync(REVIEW_MD, 'utf8'), renderReview(results));
});

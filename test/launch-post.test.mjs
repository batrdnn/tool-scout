// docs/launch-post.md: about 400 words, and every promise in it is one the README makes too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const post = fs.readFileSync(path.join(ROOT, 'docs', 'launch-post.md'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const prose = post.replace(/```[\s\S]*?```/g, '').replace(/^#.*$/gm, '');

test('about 400 words (350 to 450)', () => {
  const n = prose.split(/\s+/).filter(Boolean).length;
  assert.ok(n >= 350 && n <= 450, `${n} words`);
});

test('install is two lines, and they are the README\'s', () => {
  const block = /```text\n([\s\S]*?)```/.exec(post)?.[1].trim().split('\n');
  assert.deepEqual(block, ['/plugin marketplace add batrdnn/tool-scout', '/plugin install tool-scout@tool-scout']);
  for (const l of block) assert.ok(readme.includes(l));
});

test('covers what it does, history plus vetting, privacy, and early-beta honesty', () => {
  assert.match(post, /^# /m);
  assert.match(prose, /history/i); assert.match(prose, /vet|check/i);
  assert.match(prose, /counts/i); assert.match(prose, /doesn't upload your history/i);
  assert.match(prose, /early beta/i); assert.match(prose, /rate/i);
});

test('no hype and no claims the repo cannot back', () => {
  assert.doesNotMatch(prose.replace(/not a guarantee/gi, ''), /revolutionary|game[- ]chang|best[- ]in|guarantee|100% safe|\bAI-powered\b/i);
  assert.match(prose, /not a guarantee|no flags doesn't mean safe|heuristic/i);
});

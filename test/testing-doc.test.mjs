import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rate, shareText } from '../scripts/lib/ratings.mjs';

const DOC = fs.readFileSync(new URL('../TESTING.md', import.meta.url), 'utf8');
const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

test("TESTING.md's example share block is exactly what stats --share prints", async () => {
  const block = DOC.match(/<!-- share-example -->\s*```text\n([\s\S]*?)```/);
  assert.ok(block, 'TESTING.md needs a ```text block after <!-- share-example -->');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-doc-'));
  rate(d, 'microsoft/playwright-mcp', 'useful');
  rate(d, 'agentskills/agentskills', 'useful');
  rate(d, 'HKUDS/Vibe-Trading', 'not');
  const { GALLERY } = await import('./gallery.mjs');
  fs.writeFileSync(path.join(d, 'profile.json'), JSON.stringify(GALLERY.Bee)); // the example tester is a Bee
  const date = block[1].match(/\((\d{4}-\d{2}-\d{2})\)/)[1];
  const expected = ['This is everything that would be shared: aggregate counts, the rated repo names and your Claude Code animal.',
    'No profile, topics, libraries, projects or prompts. Nothing is sent: copy it yourself if you agree.', '',
    shareText(d, { version: VERSION, now: new Date(`${date}T12:00:00Z`) })].join('\n');
  assert.equal(block[1].trimEnd(), expected);
});

test('TESTING.md asks testers to share only the stats --share output', () => {
  assert.match(DOC, /stats --share/);
  assert.match(DOC, /only/i);
  assert.doesNotMatch(DOC, /profile\.json[^\n]*(send|share|attach|paste)/i);
});

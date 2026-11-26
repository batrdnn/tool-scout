// The README's FAQ answers six questions, and what it says has to match the repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const faq = /^## FAQ\n([\s\S]*?)(?=^## )/m.exec(readme)?.[1] || '';
const answer = (q) => { const m = new RegExp(`^### ${q}[^\\n]*\\n([\\s\\S]*?)(?=^### |$(?![\\s\\S]))`, 'm').exec(faq); return m ? m[1] : ''; };

test('the FAQ has the six questions', () => {
  for (const q of ['What does it send', 'Does it install anything', 'Does it work offline', 'Does it work on Windows', 'What is the animal', 'How do I uninstall everything', 'How do I report a security issue']) {
    assert.ok(new RegExp(`^### ${q}`, 'm').test(faq), `missing: ${q}`);
  }
});

test('privacy: what is saved, where requests go, and the accurate upload sentence', () => {
  const a = answer('What does it send');
  assert.match(a, /counts/i); assert.match(a, /api\.github\.com/); assert.match(a, /profile --show/);
});

test('installs: No in safe mode, manual steps, the installer is experimental and has plans and undo', () => {
  const a = answer('Does it install anything');
  assert.match(a, /No\b/); assert.match(a, /plan/i); assert.match(a, /undo/);
});

test('offline: says which commands need no network and that `all` can crawl', () => {
  const a = answer('Does it work offline');
  assert.match(a, /audit/); assert.match(a, /--offline/); assert.match(a, /20 hours/);
});

test('uninstall: undo the installs first (the log is in the data folder), then the plugin and the data', () => {
  const a = answer('How do I uninstall everything');
  assert.ok(a.indexOf('installed') < a.indexOf('/plugin uninstall'), 'undo before uninstalling the plugin');
  assert.match(a, /scout\.mjs undo/); assert.match(a, /\/plugin uninstall tool-scout@tool-scout/); assert.match(a, /~\/\.tool-scout/);
});

test('security: private reporting through SECURITY.md', () => {
  const a = answer('How do I report a security issue');
  assert.match(a, /\]\(SECURITY\.md\)/); assert.match(a, /private/i);
  assert.ok(fs.existsSync(path.join(ROOT, 'SECURITY.md')));
});

test('every claim names a command that exists', () => {
  const cli = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'cli.mjs'), 'utf8');
  for (const cmd of ['installed', 'undo', 'audit', 'me', 'stats', 'profile']) assert.match(cli, new RegExp(`case '${cmd}'`));
});

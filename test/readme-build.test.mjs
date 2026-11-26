// v0.10.0: the README explains building your own: drafts, a plan, one yes, undo, and a hook's second yes.
// v0.17: it is experimental (off by default), so the explanation lives in the experimental-installer section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('README: "Build your own" says drafts, plan, confirm, undo, and a second confirmation for hooks', () => {
  const md = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const i = md.indexOf('### Build your own (experimental)');
  assert.ok(i > 0);
  const sec = md.slice(i, md.indexOf('\n## ', i + 3)).replace(/\s+/g, ' ');
  for (const re of [/experimental/, /build me a skill that/, /skill, slash command, subagent, hook or CLAUDE\.md/, /draft[^.]*data folder/, /not straight into/,
    /trust scan/, /no license/i, /attribution/, /build[^`]*--plan/, /--confirm <planId>/, /second, separate confirmation/, /undo <name>/]) assert.match(sec, re, String(re));
});

// v0.17 (review G1, D1, D4): nothing in the docs or the skills may claim more than Tool Scout
// guarantees. The independent review reproduced failures of "every install can be undone",
// "only after you approve a plan" and "nothing leaves your machine", so those claims are gone
// while the installer is experimental, and the privacy statement is the accurate one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const flat = (p) => read(p).replace(/\s+/g, ' ');
const PRIVACY = "Tool Scout doesn't upload your history. When you run a skill, a summary goes into Claude's context like anything else you show Claude.";
const DOCS = ['README.md', 'SECURITY.md', 'TESTING.md', 'docs/USAGE.md', 'docs/launch-post.md'];
const SKILLS = ['scout', 'check', 'kickoff', 'me'].map((n) => `skills/${n}/SKILL.md`);

const OVERCLAIMS = [
  [/every install can be undone/i, 'every install can be undone'],
  [/installs? only after you approve/i, 'installs only after you approve a plan'],
  [/never leaves your machine/i, 'never leaves your machine'],
  [/nothing about (?:you|the user) is sent/i, 'nothing about you is sent'],
  [/\bcounts only\b/i, 'counts only'],
  [/(?:is|are) never sent anywhere/i, 'never sent anywhere'],
  [/(?:does|writes) exactly that plan/i, 'does exactly that plan'],
  [/\bone-click install\b/i, 'one-click install'],
  [/can always be undone|always be undone/i, 'can always be undone'],
];

for (const f of [...DOCS, ...SKILLS]) {
  test(`${f}: no claim the independent review disproved`, () => {
    const md = flat(f);
    for (const [re, label] of OVERCLAIMS) assert.doesNotMatch(md, re, `${f} says "${label}"`);
  });
}

test('the README, the FAQ, TESTING.md and the scout and kickoff skills say the accurate privacy sentence', () => {
  for (const f of ['README.md', 'TESTING.md', 'skills/scout/SKILL.md', 'skills/kickoff/SKILL.md', 'skills/me/SKILL.md']) assert.ok(flat(f).includes(PRIVACY), f);
  const readme = flat('README.md');
  const faq = readme.slice(readme.indexOf('## FAQ'));
  assert.ok(faq.includes(PRIVACY), 'in the FAQ too');
});

test('README: safe mode is the first thing said about install, and the installer is called experimental and off by default', () => {
  const md = flat('README.md');
  const i = md.search(/safe mode/i);
  assert.ok(i > 0 && i < md.indexOf('## Install'), 'a safe-mode note before the Install section');
  for (const re of [/experimental/i, /off by default/i, /manual (?:install )?steps/i, /project scope/i, /v0\.18/, /independent review/i]) assert.match(md, re);
  assert.match(md, /full independent review: coming soon/, 'says the full review is coming');
  assert.match(md, /\]\(docs\/security-review\.md\)/, 'links the published review');
  assert.doesNotMatch(md, /docs\/reviews\//, 'no link to a file that is not there');
});

test('README: the plan/install/undo and build sections are marked experimental, with the review\'s findings', () => {
  const md = read('README.md');
  const sec = md.slice(md.indexOf('## Experimental installer'));
  assert.ok(sec.length > 200, 'an "Experimental installer" section');
  const s = sec.replace(/\s+/g, ' ');
  for (const re of [/confirm(?:s|ed)? (?:its|their) own plan/i, /different plugin|marketplace name/i, /symlink/i, /undo can report success/i, /scout\.mjs experimental on/, /your own terminal/i, /v0\.18/]) assert.match(s, re);
  assert.doesNotMatch(s, /\bevery\b[^.]*\bcan be undone/i);
});

test('README: privacy section covers what is kept, what Claude sees, what goes over the network, and how to delete it', () => {
  const md = flat('README.md');
  const priv = md.slice(md.indexOf('## Privacy'), md.indexOf('## ', md.indexOf('## Privacy') + 3));
  for (const re of [/What it reads and keeps/, /What Claude sees/, /over the network/, /api\.github\.com/, /scout\.mjs privacy/, /kickoff\/needs\.json/, /the first word of commands/i]) assert.match(priv, re);
  assert.doesNotMatch(priv, /deleted when you uninstall/i, 'removing the plugin may leave the data folder');
});

test('README: the FAQ answers the install question with No, the review and the manual steps', () => {
  const md = read('README.md');
  const faq = md.slice(md.indexOf('### Does it install anything'));
  const a = faq.slice(0, faq.indexOf('\n### ')).replace(/\s+/g, ' ');
  assert.match(a, /^### Does it install anything\?/);
  assert.match(a, /\bNo\b/);
  assert.match(a, /manual/i);
  assert.match(a, /experimental/i);
});

test('SECURITY.md: the known limits of the experimental installer, by the review\'s ids, and "known, fixed in v0.18"', () => {
  const md = flat('SECURITY.md');
  for (const id of ['C1', 'C2', 'C5', 'C6']) assert.match(md, new RegExp(`\\b${id}\\b`), id);
  assert.match(md, /known, fixed in v0\.18|planned for v0\.18|fixed in v0\.18/i);
  assert.match(md, /off by default/i);
  assert.match(md, /full independent review: coming soon/);
  assert.match(md, /\]\(docs\/security-review\.md\)/);
  assert.doesNotMatch(md, /docs\/reviews\//);
  assert.match(md, /not a (?:human )?authorization|human decision/i);
});

test('TESTING.md: testers do not install; undo-everything checks the result by hand; privacy command named', () => {
  const md = flat('TESTING.md');
  assert.match(md, /does not install|doesn't install/i);
  assert.match(md, /scout\.mjs privacy/);
  assert.match(md, /manual steps/i);
  assert.doesNotMatch(md, /try `undo` on something you did install/);
});

test('every skill that has a Privacy rules block points to the privacy command', () => {
  for (const f of ['skills/scout/SKILL.md', 'skills/kickoff/SKILL.md']) assert.match(flat(f), /`… privacy --plain`/, f);
});

test('docs/USAGE.md: install, build and undo rows say experimental, and no row claims a guarantee', () => {
  const md = read('docs/USAGE.md');
  for (const row of md.split('\n').filter((l) => /^\| `(install|build|undo|installed|kickoff --summary)/.test(l))) assert.match(row, /experimental|older/i, row.slice(0, 60));
});

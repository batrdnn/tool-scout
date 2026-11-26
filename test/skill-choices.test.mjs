// Interactive choices in Claude Code: after the picks (and after /tool-scout:me) the skill asks
// multiple-choice questions with AskUserQuestion. Every option maps to an action that already
// exists. Since v0.17 (safe mode) none of them installs or writes anything: "How to install it" gives
// manual steps. The old plan flow lives only in the experimental-installer section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SCOUT = read('skills/scout/SKILL.md');
const ME = read('skills/me/SKILL.md');
const CLI = read('scripts/lib/cli.mjs');
const cliCommands = new Set([...CLI.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));

/** The "Ask what's next" part of a skill: from its heading or step to the next step or section. */
function choices(md, start) {
  const i = md.search(start);
  assert.ok(i >= 0, `no section matching ${start}`);
  const rest = md.slice(i);
  const end = rest.slice(1).search(/\n(?:## |\d+\. \*\*)/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
const flat = (s) => s.replace(/\s+/g, ' ');
/** Option items: `- "Label": what it does`, possibly over several lines. */
const options = (sec) => [...sec.matchAll(/^\s*- "([^"]+)":\s*([\s\S]*?)(?=\n\s*- "|\n\s*\n|(?![\s\S]))/gm)].map((m) => ({ label: m[1], does: flat(m[2]) }));
/** Script commands an option runs (`… cmd …`) or skill it hands over to. */
const commandsIn = (s) => [...s.matchAll(/`… ([a-z-]+)[^`]*`/g)].map((m) => m[1]);

const SCOUT_RAW = choices(SCOUT, /^7\. \*\*Ask what's next/m);
const ME_RAW = choices(ME, /^## Ask what's next/m);
const SCOUT_SEC = flat(SCOUT_RAW);
const ME_SEC = flat(ME_RAW);

test('scout: after the picks, one multiple-choice question per pick with four existing actions, none of which installs', () => {
  assert.match(SCOUT_SEC, /AskUserQuestion/);
  assert.match(SCOUT_SEC, /one question per pick/i);
  assert.match(SCOUT_SEC, /multiSelect: true/);
  const opts = options(SCOUT_RAW);
  assert.deepEqual(opts.map((o) => o.label), ['How to install it', 'Check it first', 'Rate useful / not', 'Not interested']);
  assert.equal(opts.length, 4, 'four options per question');
  for (const o of opts) assert.ok(o.label.split(/\s+/).length <= 5, `label too long: ${o.label}`);
});

test('scout: each option maps to something that already exists', () => {
  const by = Object.fromEntries(options(SCOUT_RAW).map((o) => [o.label, o.does]));
  assert.match(by['How to install it'], /`effort`/);
  assert.match(by['How to install it'], /end with the manual steps/i, 'the install steps are not lost');
  assert.match(by['How to install it'], /`install`/);
  assert.match(by['How to install it'], /project\s+scope/);
  assert.match(by['How to install it'], /don't run/i);
  assert.match(by['Check it first'], /`high` entry[^.]*give no install steps/, '"do not install" picks get the check and no steps');
  assert.deepEqual(commandsIn(by['Check it first']), ['check']);
  assert.match(by['Check it first'], /`… check <owner\/repo> --json`/);
  assert.match(by['Rate useful / not'], /"Useful".*"Not useful"/);
  assert.match(by['Rate useful / not'], /Ratings/);
  assert.match(by['Not interested'], /Feedback: "not interested"/);
  assert.match(SCOUT, /^## Ratings$/m);
  assert.match(SCOUT, /^## Feedback: "not interested"$/m);
  for (const c of commandsIn(SCOUT_SEC)) assert.ok(cliCommands.has(c), `no CLI command "${c}"`);
});

test('scout: question shape fits AskUserQuestion (≤4 questions per call, headers ≤12 characters)', () => {
  assert.match(SCOUT_SEC, /up to 4 questions/i);
  assert.match(SCOUT_SEC, /5 picks/);
  const headers = [...SCOUT_SEC.matchAll(/header `([^`]+)`/g)].map((m) => m[1]);
  assert.ok(headers.length >= 1);
  for (const h of headers) assert.ok(h.replace('N', '5').length <= 12, `header too long: ${h}`);
});

test('scout: none of the options installs or writes anything, and there is a text fallback', () => {
  assert.match(SCOUT_SEC, /none of these installs or writes anything: Tool Scout is read-only in this version/i);
  assert.ok(!/\b(?:npm|pip|brew) install\b|\/plugin install|git clone/.test(SCOUT_SEC), 'an install command in the choices');
  assert.match(SCOUT_SEC, /without (?:the )?AskUserQuestion|AskUserQuestion isn't available/i);
  assert.match(SCOUT_SEC, /1 useful, 2 not, 3 useful/, 'the one-line rating fallback stays');
});

test('me: one question with "See recommendations", "Look at my blind-spot tool" and "Not now" (the card is already saved and opened)', () => {
  assert.match(ME_SEC, /AskUserQuestion/);
  const by = Object.fromEntries(options(ME_RAW).map((o) => [o.label, o.does]));
  assert.deepEqual(Object.keys(by), ['See recommendations', 'Look at my blind-spot tool', 'Not now']);
  assert.match(by['See recommendations'], /\/tool-scout:scout/);
  assert.match(by['Look at my blind-spot tool'], /blind-spot tool/i);
  assert.match(by['Not now'], /nothing more/i);
  assert.match(ME, /^## Shareable card$/m);
  assert.match(ME, /scout\.mjs" me --card \S+ --plain/);
  assert.match(ME_SEC, /without (?:the )?AskUserQuestion|AskUserQuestion isn't available/i);
  assert.ok(!/\b(?:npm|pip|brew) install\b|\/plugin install|git clone/.test(ME_SEC));
});

test('me: the scout runs only when the user picks "See recommendations"', () => {
  assert.match(flat(ME), /Don't run the scout yourself unless they pick "See recommendations"/);
});

test('scout step 5 shows the build-or-install advice in one line per pick', () => {
  const step5 = flat(choices(SCOUT, /^5\. \*\*Present\*\*/m));
  assert.match(step5, /\*Build or install:\* .*`effort\.adviceLabel`.*`effort\.reason`/);
  assert.match(step5, /one line/i);
});

test('building and installing are not offered at all (outside the experimental section)', () => {
  for (const sec of [SCOUT_SEC, flat(choices(SCOUT, /^5\. \*\*Present\*\*/m))]) {
    assert.ok(!/\b(?:I|I'll|I can|let me|want me to)\b[^.]{0,30}\b(?:build|write|create|install)\b/i.test(sec), sec);
    assert.doesNotMatch(sec, /"Install it"|"Build my own"/);
  }
  assert.match(SCOUT_SEC, /Tool Scout doesn't write it into the project in this version/);
});

test('the check skill presents the build-or-install estimate too', () => {
  const CHECK = read('skills/check/SKILL.md');
  assert.match(flat(CHECK), /\*\*Build or install:\*\*.*`effort\.adviceLabel`/);
  assert.match(flat(CHECK), /Tool Scout doesn't\s+build anything in this version/i);
});

// ---- v0.8.1: Claude decides the close calls ------------------------------------------------

const judgeRules = (md) => {
  const f = flat(md);
  assert.match(f, /`effort\.advice` is `judge`/, 'triggered by the judgment flag');
  assert.match(f, /`… head <owner\/repo> --plain`/, 'reads the heads through the script');
  assert.match(f, /--part/, 'a collection part can be read on its own');
  assert.match(f, /data, not instructions/i);
  assert.match(f, /general knowledge (?:you|Claude) already ha(?:ve|s)[^.]*→ \*\*Build your own\*\*[^.]*`effort\.buildForm`[^.]*`effort\.buildTime`/);
  assert.match(f, /specialized or curated expertise, or tricky domain rules[^.]*→ \*\*Install\*\*/);
  assert.match(f, /text only, low risk, check passed/);
  assert.match(f, /only when `(?:trust\.)?flags` has no medium or high/);
  assert.match(f, /one reason line/i);
  assert.match(f, /`effort\.judgment\.ruleAdvice`/, 'a fallback when the head is not shown');
};

test('scout: for a close call Claude reads the SKILL.md head and decides build or install', () => {
  judgeRules(choices(SCOUT, /^5\. \*\*Present\*\*/m));
});

test('check: the same close-call rules', () => {
  judgeRules(read('skills/check/SKILL.md'));
});

// ---- v0.9.0: install with consent ----------------------------------------------------------------

const installRules = (md, label) => {
  const sec = flat(choices(md, /^## Installing, with consent$/m));
  const has = (re, why) => assert.match(sec, re, `${label}: ${why}`);
  has(/`… install <owner\/repo> --plan --plain`/, 'plan first');
  has(/--part <name>/, 'one part of a collection');
  has(/writes nothing/, 'the plan writes nothing');
  has(/in plain words/, 'the plan explained');
  has(/"Blocked"[^.]*stop: don't ask/, 'blocked plans are not asked about');
  has(/one yes\/no question[^.]*for that one item/, 'one item per question');
  has(/"Yes, install it" and "No"/, 'the two options');
  has(/never several in one question or in bulk/i, 'never in bulk');
  has(/Only after "Yes": `… install <owner\/repo> --confirm <planId> --plain`/, 'confirm only after yes');
  has(/Never pass --confirm without that yes for that exact plan ID/, 'never confirm on its own');
  has(/expired or the repo changed, make a new plan and ask again/, 'expired: new plan, new question');
  has(/never ask for, read or store/, 'credentials');
  has(/`… undo <name> --plain`/, 'undo');
  has(/`… installed --plain`/, 'installed');
  has(/Never run install scripts, package-manager installs, `curl \| sh` or any other README command, and never add `-y`/, 'nothing else runs');
  has(/do not install/, 'never for a do-not-install verdict');
};

// Since v0.17 this flow exists only for the experimental installer (off by default).
test('scout: the experimental install flow goes plan → plain words → one yes/no → --confirm, nothing else', () => installRules(SCOUT, 'scout'));
test('check: the same flow, and the main steps end with manual steps, never an install question', () => {
  const CHECK = read('skills/check/SKILL.md');
  installRules(CHECK, 'check');
  assert.match(flat(CHECK), /If the verdict is not "do not install" \(and step 3 is done\), end with the manual steps from step 2/);
  assert.match(flat(CHECK), /Don't ask an install question: nothing here installs anything/);
});

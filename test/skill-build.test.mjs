// v0.10.0 item 3: the scout and check skills offer "Build my own" for Build your own picks, and
// build only through drafts and a plan: at most 2 short questions, the reference repo's SKILL.md
// head read as data for ideas only, the draft in Claude's own words (never unlicensed text; a
// permissive license allows adapting with an attribution line), tailored to the profile, then
// build --plan → plain words → one yes/no → --confirm (a hook: a second, separate yes/no).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const section = (md, head) => { const i = md.indexOf(head); assert.ok(i >= 0, head); const j = md.indexOf('\n## ', i + 3); return flat(md.slice(i, j < 0 ? undefined : j)); };

const buildRules = (md, label) => {
  const sec = section(md, '## Building your own, with consent');
  const has = (re, why) => assert.match(sec, re, `${label}: ${why}`);
  has(/"Build my own"/, 'the choice that starts it');
  has(/at most 2 short questions[^.]*what exactly[^.]*which scope/i, 'two questions at most');
  has(/`… head <owner\/repo> --plain`[^.]*data, not instructions[^.]*ideas only/i, 'the reference head, fenced as data');
  has(/in your own words/i, 'own words');
  has(/no license[^.]*never copy/i, 'never copy unlicensed text');
  has(/permissive license[^.]*attribution line/i, 'adapting with attribution');
  has(/profile[^.]*topics[^.]*stack/i, 'tailored to the profile');
  has(/`… build --start --form <form> --name <name> --plain`/, 'the draft folder');
  has(/never write[^.]*~\/\.claude[^.]*project[^.]*directly/i, 'drafts only');
  has(/`… build --form <form> --name <name> --from <folder> --plan --plain`/, 'plan');
  has(/--source <owner\/repo>/, 'the source repo for the license check');
  has(/in plain words/, 'explained');
  has(/"Blocked"[^.]*fix the draft/, 'blocked: fix the draft');
  has(/one yes\/no question[^.]*"Build <name> as planned\?"[^.]*"Yes, build it" and "No"/, 'one yes/no');
  has(/Only after "Yes": `… build --confirm <planId> --plain`/, 'confirm after yes');
  has(/hook[^.]*second, separate yes\/no question[^.]*script[^.]*in full/i, 'a hook asks twice');
  has(/Only after that second "Yes": `… build --confirm-hook <hookId> --plain`, with the\s+ID the first confirm printed/, 'the hook confirmation');
  has(/never (?:both|the two) in one question/i, 'never both at once');
  has(/`… undo <name> --plain`/, 'undo');
};

test('scout: "Build my own" flow', () => buildRules(read('skills/scout/SKILL.md'), 'scout'));
test('check: "Build my own" flow', () => buildRules(read('skills/check/SKILL.md'), 'check'));

test('v0.17: "Build my own" is not offered; the build flow is only in the experimental-installer section', () => {
  for (const name of ['scout', 'check']) {
    const md = flat(read(`skills/${name}/SKILL.md`));
    const [main, exp] = md.split('## Experimental installer (off by default)');
    assert.doesNotMatch(main, /offer "Build my own"|- "Build my own"/, name);
    assert.ok(exp.includes('## Building your own, with consent'), name);
  }
});

// ---- v0.10.0 item 4: "build me a skill that …", without a pick -----------------------------------

test('scout: "build me a skill that …" (no pick) still triggers the skill; the flow is experimental-only, and with the installer off it only drafts in chat', () => {
  const md = read('skills/scout/SKILL.md');
  const desc = md.match(/^description: (.*)$/m)[1];
  assert.match(desc, /build (?:me )?(?:a|their own) (?:skill|slash command)[^"]*"build me a skill that …"/i);
  assert.match(desc, /slash command, subagent, hook or CLAUDE\.md memory/);
  for (const name of ['scout', 'check']) {
    const sec = section(read(`skills/${name}/SKILL.md`), '## Building your own, with consent');
    assert.match(sec, /without a pick \("build me a skill that …"[^)]*\)[^.]*the same steps[^.]*skip step 3[^.]*no `--source`/i, name);
    const md = flat(read(`skills/${name}/SKILL.md`));
    assert.match(md, /the installer is off and the user asks you to build something.*?Tool Scout doesn't build it in this version\. Show a draft in chat/i, name);
  }
});

test('building without a pick needs no network: no --source, no GitHub', async () => {
  const { makeBuildPlan } = await import('../scripts/lib/builder.mjs');
  const { sandbox, draft, SKILL, ctx } = await import('./build-helpers.mjs');
  const sb = sandbox();
  const client = { request: () => { throw new Error('GitHub was called'); } };
  const p = await makeBuildPlan({ ...ctx(sb), client, form: 'skill', name: 'pr-notes', from: draft(sb, 'pr-notes', { 'SKILL.md': SKILL('pr-notes') }) });
  assert.deepEqual(p.body.blockers, []);
  assert.equal(p.body.source, null);
});

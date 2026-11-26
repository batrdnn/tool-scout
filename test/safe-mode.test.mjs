// v0.17 safe mode, the read-only side: scout, check, audit, me and kickoff stay, but show manual
// install steps. They never offer "Install it" / "Build my own", never print a Tool Scout install
// command, and the skills say the same. (The gate itself: test/experimental-gate.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { formatCheck } from '../scripts/lib/check.mjs';
import { formatRecs } from '../scripts/lib/output.mjs';
import { prettyCheck, prettyAll } from '../scripts/lib/pretty.mjs';
import { painter } from '../scripts/lib/term.mjs';
import { manualSteps, withManualSteps } from '../scripts/lib/experimental.mjs';
import { formatKickoff } from '../scripts/lib/kickoff.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fixture = (n) => JSON.parse(read(`test/fixtures/output/${n}`));
const P = painter({ color: false, unicode: true }, { width: 80 });
const flat = (s) => s.replace(/\s+/g, ' ');

const OFFERS_INSTALL = /can install this for you|you'll see a plan first|scout\.mjs install \S+ --plan|"Install it"|Build my own/;

// ---- the text outputs ----------------------------------------------------------------------------

for (const method of ['skill', 'plugin', 'mcp']) {
  test(`check (${method}): manual steps, no Tool Scout install offer, project scope`, () => {
    const r = { ...fixture('check-clean.json'), install: { commands: [], toolScout: method } };
    for (const text of [formatCheck(r), prettyCheck(r, P)]) {
      assert.doesNotMatch(text, OFFERS_INSTALL, text);
      assert.match(text, /yourself/i);
      assert.match(text, /project/i);
    }
  });
}

test('check: README commands are still shown as "from the README; review before running", to run yourself', () => {
  const r = { ...fixture('check-clean.json'), install: { commands: ['/plugin marketplace add acme/tool', '/plugin install tool@acme'], toolScout: 'plugin' } };
  const text = formatCheck(r);
  assert.match(text, /from the README; review before running\): \/plugin marketplace add acme\/tool/);
  assert.match(text, /yourself/i);
});

test('scout picks: the shortlist says to install by hand, and shows the README command', () => {
  const rec = { name: 'acme/tool', kind: 'skill', description: 'x', stars: 10, starsPerDay: 1, momentumSource: 'measured', evidence: [], trust: { tier: 'high', notes: [] }, install: '/plugin install tool@acme', installSource: 'readme', toolScoutInstall: 'plugin' };
  const text = formatRecs([rec]);
  assert.doesNotMatch(text, OFFERS_INSTALL, text);
  assert.match(text, /yourself/i);
  assert.ok(text.includes('/plugin install tool@acme'));
  const all = prettyAll(fixture('profile.json'), [], [{ ...rec, effort: undefined }], { dataLine: '', profilePath: '', withProfile: false }, P);
  assert.doesNotMatch(all, OFFERS_INSTALL, all);
  assert.match(all, /yourself/i);
});

// ---- manual steps ---------------------------------------------------------------------------------

test('manualSteps: each kind of item says what to do by hand, always at project scope', () => {
  const m = (i) => manualSteps(i);
  assert.match(m({ action: 'install', kind: 'official-plugin', command: 'claude plugin install github@claude-plugins-official --scope project' }), /claude plugin install github@claude-plugins-official --scope project/);
  assert.match(m({ action: 'official-plugin', name: 'github', command: 'claude plugin install github@claude-plugins-official' }), /--scope project/, 'a command without a scope gets project');
  assert.match(m({ action: 'install', repo: 'acme/x', kind: 'mcp-server' }), /\/tool-scout:check acme\/x/);
  assert.match(m({ action: 'install', repo: 'acme/x' }), /project scope/i);
  assert.match(m({ action: 'build', form: 'skill', name: 'ledger-tests' }), /\.claude\/skills\/ledger-tests\/SKILL\.md/);
  assert.match(m({ action: 'build', form: 'command', name: 'standup' }), /\.claude\/commands\/standup\.md/);
  assert.match(m({ action: 'build', form: 'subagent', name: 'rev' }), /\.claude\/agents\/rev\.md/);
  assert.match(m({ action: 'build', form: 'hook', name: 'guard' }), /runs automatically/);
  assert.match(m({ action: 'memory', form: 'memory', name: 'ledger-conventions' }), /CLAUDE\.md/);
  assert.equal(m({ action: 'nothing' }), null);
  assert.equal(m({ action: 'builtin', name: '/ultrareview' }), null);
  for (const i of [{ action: 'install', repo: 'a/b' }, { action: 'build', form: 'skill', name: 'n' }, { action: 'memory', form: 'memory', name: 'n' }]) assert.doesNotMatch(m(i), OFFERS_INSTALL);
});

test('withManualSteps: off, the Tool Scout commands (next) are removed and manual steps added; on, nothing changes', () => {
  const items = [{ action: 'install', repo: 'a/b', next: 'install a/b --scope project --plan' }, { action: 'build', form: 'skill', name: 'n', next: 'build --start --form skill --name n' }, { action: 'nothing' }];
  const off = withManualSteps(items, false);
  assert.ok(off.every((i) => !('next' in i)));
  assert.match(off[0].manual, /project/i);
  assert.ok(off[1].manual);
  assert.ok(!('manual' in off[2]));
  assert.deepEqual(withManualSteps(items, true), items);
});

test('kickoff text shows manual steps, never a Tool Scout install or build command', () => {
  const toolkit = { notes: [], items: withManualSteps([{ action: 'install', repo: 'a/b', kind: 'skill', reason: 'r', impact: 1, next: 'install a/b --scope project --plan' }], false) };
  const text = formatKickoff({ needsFile: '/x/needs.json', needs: { needs: [], stack: { libraries: [] }, conventions: [] }, toolkit });
  assert.doesNotMatch(text, /Next: scout\.mjs|install a\/b --scope project --plan/);
  assert.match(text, /Manual steps:/);
});

// ---- the CLI ----------------------------------------------------------------------------------------

test('the CLI: kickoff and me --blind-spot give no Tool Scout install commands with the installer off', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-safe-'));
  const data = path.join(root, 'data'), home = path.join(root, 'home'), proj = path.join(root, 'proj');
  for (const d of [data, home, proj]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(proj, 'requirements.txt'), 'pytest\n');
  fs.writeFileSync(path.join(root, 'PLAN.md'), '# Plan\n\n## Tasks\n- Write pytest tests for every module\n- Add tests for edge cases\n\n## Conventions\n- Always use type hints\n');
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'scout.mjs'), ...a, '--home', home, '--data', data, '--offline'], { encoding: 'utf8', cwd: proj });
  const k = run('kickoff', '--plan-file', path.join(root, 'PLAN.md'), '--project', proj, '--json');
  assert.equal(k.status, 0, k.stderr);
  const items = JSON.parse(k.stdout).toolkit.items;
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => !('next' in i)), JSON.stringify(items.map((i) => i.next)));
  assert.ok(items.some((i) => i.manual), 'at least one item has manual steps');
  assert.doesNotMatch(run('kickoff', '--plan-file', path.join(root, 'PLAN.md'), '--project', proj, '--plain').stdout, /Next: scout\.mjs/);
});

// ---- the skills ------------------------------------------------------------------------------------------

const SKILLS = Object.fromEntries(['scout', 'check', 'kickoff', 'me'].map((n) => [n, read(`skills/${n}/SKILL.md`)]));
const EXPERIMENTAL = '## Experimental installer (off by default)';
const mainPart = (md) => (md.includes(EXPERIMENTAL) ? md.split(EXPERIMENTAL)[0] : md);

for (const name of ['scout', 'check', 'kickoff']) {
  test(`skills/${name}: the experimental installer has its own section, with the rule that the user turns it on, not Claude`, () => {
    const md = SKILLS[name];
    assert.ok(md.includes(EXPERIMENTAL), 'the section heading');
    const sec = flat(md.split(EXPERIMENTAL)[1]);
    assert.match(sec, /off by default/i);
    assert.match(sec, /Never run `… experimental on --plain`/);
    assert.match(sec, /their own terminal|themselves/i);
    assert.match(sec, /`… experimental --plain`/, 'how to see whether it is on');
    assert.match(sec, /experimental/i);
  });
}

for (const name of ['scout', 'check', 'kickoff', 'me']) {
  test(`skills/${name}: outside the experimental section, no "Install it", no "Build my own", no Tool Scout install or build command`, () => {
    const main = mainPart(SKILLS[name]);
    assert.doesNotMatch(main, /offer "Install it"|"Install it\?"|"Yes, install it"|"Build my own"|Can install this for you/i);
    assert.doesNotMatch(main, /`… (?:install|build) /, 'a Tool Scout install or build command');
    assert.doesNotMatch(main, /--confirm/);
  });
}

test('skills: manual steps are what scout, check, kickoff and me give instead', () => {
  for (const name of ['scout', 'check', 'kickoff', 'me']) assert.match(flat(mainPart(SKILLS[name])), /manual steps/i, name);
  for (const name of ['scout', 'check', 'kickoff', 'me']) assert.match(flat(mainPart(SKILLS[name])), /project scope|`--scope project`/i, name);
});

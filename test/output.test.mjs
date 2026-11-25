// Terminal output: plain text (pipes, Claude Code, --plain) stays byte-for-byte what it was;
// pretty output (colors, boxes, aligned columns) is only for a real terminal.
//
// Snapshots live in test/snapshots/. The *.plain.txt files were taken from the CLI before the
// pretty output existed and change only on purpose (v0.8.0: the "Shortlist (unfiltered)" title
// and the Effort line). Regenerate the pretty ones after a design change with
// UPDATE_SNAPSHOTS=1 npm test; plain ones need UPDATE_PLAIN_SNAPSHOTS=1, and the report says why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { detectStyle, supportsUnicode, strWidth, stripAnsi, painter } from '../scripts/lib/term.mjs';
import { formatProfile, formatRecs, formatAll } from '../scripts/lib/output.mjs';
import { prettyAll, prettyMe, prettyCheck, prettyAudit, prettyStats } from '../scripts/lib/pretty.mjs';
import { formatCheck } from '../scripts/lib/check.mjs';
import { formatAudit } from '../scripts/lib/audit.mjs';
import { whoAmI, formatMe } from '../scripts/lib/me.mjs';
import { prof } from './helpers.mjs';
import { fileURLToPath } from 'node:url';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/output/${f}`, import.meta.url), 'utf8'));
const SNAP = fileURLToPath(new URL('./snapshots/', import.meta.url));
function snap(name, text) {
  const file = path.join(SNAP, name);
  if (process.env.UPDATE_SNAPSHOTS && !name.includes('.plain.')) fs.writeFileSync(file, text);
  if (process.env.UPDATE_PLAIN_SNAPSHOTS && name.includes('.plain.')) fs.writeFileSync(file, text);
  assert.ok(fs.existsSync(file), `missing snapshot ${name} (UPDATE_SNAPSHOTS=1 creates pretty ones; plain ones are fixed)`);
  assert.equal(text, fs.readFileSync(file, 'utf8'), `snapshot ${name} differs`);
}

const PROFILE = fx('profile.json');
const REC = fx('recommend.json');
const EDGE = fx('recs-edge.json');
const DATA_LINE = 'Data folder: <DATA> (--data)';
const ESC = '\u001b';
const UTF8 = { LANG: 'en_US.UTF-8' };
const styles = {
  color: { pretty: true, color: true, unicode: true },
  nocolor: { pretty: true, color: false, unicode: true },
  ascii: { pretty: true, color: false, unicode: false },
};
const P = (s, width = 80) => painter(styles[s], { width });

// ---- Style detection ------------------------------------------------------------------

test('pretty only on a TTY; --plain, --json, TERM=dumb and Claude Code always get plain', () => {
  assert.equal(detectStyle({ isTTY: true, env: UTF8, opts: {} }).pretty, true);
  assert.equal(detectStyle({ isTTY: false, env: UTF8, opts: {} }).pretty, false);
  assert.equal(detectStyle({ isTTY: undefined, env: UTF8, opts: {} }).pretty, false);
  assert.equal(detectStyle({ isTTY: true, env: UTF8, opts: { plain: true } }).pretty, false);
  assert.equal(detectStyle({ isTTY: true, env: UTF8, opts: { json: true } }).pretty, false);
  assert.equal(detectStyle({ isTTY: true, env: { ...UTF8, TERM: 'dumb' }, opts: {} }).pretty, false);
  assert.equal(detectStyle({ isTTY: true, env: { ...UTF8, CLAUDECODE: '1' }, opts: {} }).pretty, false);
  assert.deepEqual(detectStyle({ isTTY: false, env: UTF8, opts: {} }), { pretty: false, color: false, unicode: false });
});

test('NO_COLOR (any non-empty value) turns colors off but keeps the layout', () => {
  const s = detectStyle({ isTTY: true, env: { ...UTF8, NO_COLOR: '1' }, opts: {}, platform: 'linux' });
  assert.deepEqual(s, { pretty: true, color: false, unicode: true });
  assert.equal(detectStyle({ isTTY: true, env: { ...UTF8, NO_COLOR: '' }, opts: {}, platform: 'linux' }).color, true);
  assert.equal(detectStyle({ isTTY: true, env: UTF8, opts: {}, platform: 'linux' }).color, true);
});

// v0.15.0: Windows. Windows Terminal (WT_SESSION) draws boxes and colors; the legacy console gets
// colors but ASCII boxes; NO_COLOR is honored there too.
test('detectStyle on Windows: Windows Terminal is unicode and color, a legacy console is color with ASCII', () => {
  const win = (env) => detectStyle({ isTTY: true, env, opts: {}, platform: 'win32' });
  assert.deepEqual(win({ WT_SESSION: 'abc' }), { pretty: true, color: true, unicode: true });
  assert.deepEqual(win({ WT_SESSION: 'abc', NO_COLOR: '1' }), { pretty: true, color: false, unicode: true });
  assert.deepEqual(win({ TERM_PROGRAM: 'vscode' }), { pretty: true, color: true, unicode: true });
  assert.deepEqual(win({}), { pretty: true, color: true, unicode: false });
  assert.equal(detectStyle({ isTTY: true, env: { WT_SESSION: 'abc', CLAUDECODE: '1' }, opts: {}, platform: 'win32' }).pretty, false, 'inside Claude Code: plain');
});

test('Unicode only when the locale or terminal supports it; ASCII otherwise', () => {
  assert.equal(supportsUnicode({ LANG: 'en_US.UTF-8' }, 'linux'), true);
  assert.equal(supportsUnicode({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }, 'linux'), false, 'LC_ALL wins');
  assert.equal(supportsUnicode({ LC_CTYPE: 'de_DE.utf8' }, 'linux'), true);
  assert.equal(supportsUnicode({ LANG: 'C' }, 'darwin'), false);
  assert.equal(supportsUnicode({}, 'linux'), false);
  assert.equal(supportsUnicode({}, 'darwin'), true, 'macOS terminals are UTF-8 when no locale is set');
  assert.equal(supportsUnicode({ LANG: 'en_US.UTF-8', TERM: 'linux' }, 'linux'), false, 'the Linux console lacks the glyphs');
  assert.equal(supportsUnicode({}, 'win32'), false, 'legacy Windows console');
  assert.equal(supportsUnicode({ WT_SESSION: 'x' }, 'win32'), true, 'Windows Terminal');
  assert.equal(supportsUnicode({ TERM_PROGRAM: 'vscode' }, 'win32'), true);
  assert.equal(detectStyle({ isTTY: true, env: { LANG: 'C' }, opts: {}, platform: 'linux' }).unicode, false);
});

// ---- Plain output: unchanged ----------------------------------------------------------

test('plain `all` output is byte-for-byte the pre-pretty CLI output', () => {
  snap('all.plain.txt', `${formatAll(PROFILE, REC.notes, REC.recommendations, { dataLine: DATA_LINE, profilePath: '<DATA>/profile.json' })}\n`);
});

test('the list is titled "Shortlist (unfiltered)" and points to /tool-scout:scout (plain and pretty)', () => {
  const HINT = "Run /tool-scout:scout in Claude Code for Claude's filtered picks.";
  const plain = formatRecs(REC.recommendations).split('\n');
  assert.deepEqual(plain.slice(0, 3), ['', 'Shortlist (unfiltered)', HINT]);
  assert.match(plain[4], /^1\. microsoft\/playwright-mcp/);
  assert.ok(!formatRecs([]).includes('Shortlist'), 'no title over an empty list');
  for (const s of Object.keys(styles)) {
    const text = stripAnsi(prettyAllText(s));
    assert.match(text, /Shortlist \(unfiltered\)/, s);
    assert.ok(text.includes(HINT), s);
  }
});

test('Effort line in plain and pretty output, only for picks with an estimate, and in check', () => {
  const plain = formatRecs(EDGE.recommendations);
  assert.match(plain, /\n   Effort: Install: Wraps the ACME API[^\n]*\n   Install: /, 'right before Install');
  assert.match(plain, /\n   Effort: Build your own \(skill, under an hour\): Only instructions/);
  assert.equal((plain.match(/Effort:/g) || []).length, 2, 'only picks with an estimate');
  const pretty = stripAnsi(prettyAll(PROFILE, EDGE.notes, EDGE.recommendations, { profilePath: '<DATA>/profile.json' }, P('nocolor', 100)));
  assert.match(pretty, /Effort\s+Install: Wraps the ACME API/);
  assert.match(pretty, /Effort\s+Build your own \(skill, under an hour\)/);
  assert.match(formatCheck(fx('check.json')), /^Effort: Install: Wraps the ACME API/m);
  assert.ok(!formatCheck(fx('check-clean.json')).includes('Effort'), 'no estimate, no line');
  const pc = stripAnsi(prettyCheck(fx('check.json'), P('nocolor', 100)));
  for (const s of ['Build or install', 'MCP server', '~4,500 lines of TypeScript', 'ACME_API_KEY', 'Install']) assert.ok(pc.includes(s), s);
});

test('plain recommendations: notes, flags, partial momentum, unscanned, README installs, no matches', () => {
  const text = [...EDGE.notes.map((n) => `\nNote: ${n}`), formatRecs(EDGE.recommendations), formatRecs([])].join('\n');
  snap('recs-edge.plain.txt', `${text}\n`);
});

test('plain me, check and audit are unchanged', () => {
  snap('me.plain.txt', `${formatMe(whoAmI(PROFILE))}\n`);
  snap('check.plain.txt', `${formatCheck(fx('check.json'))}\n`);
  snap('check-clean.plain.txt', `${formatCheck(fx('check-clean.json'))}\n`);
  snap('audit.plain.txt', `${formatAudit(fx('audit.json'))}\n`);
});

test('formatProfile is the profile block of `all`', () => {
  const p = formatProfile(PROFILE, { dataLine: DATA_LINE, profilePath: '<DATA>/profile.json' });
  assert.ok(fs.readFileSync(path.join(SNAP, 'all.plain.txt'), 'utf8').startsWith(`${p}\n`));
});

// ---- Pretty output --------------------------------------------------------------------

const prettyAllText = (s) => prettyAll(PROFILE, REC.notes, REC.recommendations, { profilePath: '<DATA>/profile.json' }, P(s));

test('pretty snapshots: color, NO_COLOR and ASCII', () => {
  for (const s of Object.keys(styles)) {
    snap(`all.pretty-${s}.txt`, `${prettyAllText(s)}\n`);
    snap(`recs-edge.pretty-${s}.txt`, `${prettyAll(PROFILE, EDGE.notes, EDGE.recommendations, { profilePath: '<DATA>/profile.json' }, P(s))}\n`);
    snap(`me.pretty-${s}.txt`, `${prettyMe(whoAmI(PROFILE), P(s))}\n`);
    snap(`check.pretty-${s}.txt`, `${prettyCheck(fx('check.json'), P(s))}\n`);
    snap(`audit.pretty-${s}.txt`, `${prettyAudit(fx('audit.json'), P(s))}\n`);
  }
});

const everyPretty = (s, width = 80) => [
  prettyAll(PROFILE, REC.notes, REC.recommendations, { profilePath: '<DATA>/profile.json' }, P(s, width)),
  prettyAll(PROFILE, EDGE.notes, EDGE.recommendations, { profilePath: '<DATA>/profile.json' }, P(s, width)),
  prettyAll(prof({ sessions: 0 }), [], [], { profilePath: '<DATA>/profile.json' }, P(s, width)),
  prettyMe(whoAmI(PROFILE), P(s, width)),
  prettyMe(whoAmI({ ...PROFILE, sessions: 4 }), P(s, width)),
  prettyCheck(fx('check.json'), P(s, width)),
  prettyCheck(fx('check-clean.json'), P(s, width)),
  prettyAudit(fx('audit.json'), P(s, width)),
  prettyAudit({ checked: { skills: 0, plugins: 0, mcpServers: 0, hooks: 0 }, counts: { high: 0, medium: 0, low: 0 }, findings: [], hooks: [] }, P(s, width)),
  prettyStats({ rated: 3, useful: 2, not: 1, usefulShare: 2 / 3 }, DATA_LINE, P(s, width)),
  prettyStats({ rated: 0, useful: 0, not: 0, usefulShare: 0 }, DATA_LINE, P(s, width)),
].join('\n');

test('pretty output has colors only when color is on', () => {
  assert.ok(everyPretty('color').includes(`${ESC}[`));
  assert.ok(!everyPretty('nocolor').includes(ESC), 'NO_COLOR output has escape codes');
  assert.ok(!everyPretty('ascii').includes(ESC));
});

test('ASCII fallback is pure ASCII, even with Unicode in repo descriptions', () => {
  const text = everyPretty('ascii');
  const bad = [...new Set(text.match(/[^\x00-\x7f]/g) || [])];
  assert.deepEqual(bad, [], `non-ASCII characters: ${bad.join(' ')}`);
  assert.match(text, /\+-/);
  assert.match(text, /\|/);
});

test('every box line has the same width, and nothing is wider than the terminal', () => {
  for (const width of [60, 80, 100]) {
    for (const s of ['nocolor', 'ascii', 'color']) {
      const lines = everyPretty(s, width).split('\n');
      for (const l of lines) {
        const plain = stripAnsi(l);
        // URLs are never broken, so a line may only overflow when it holds one
        if (!/https?:\/\//.test(plain)) assert.ok(strWidth(plain) <= width, `${s}@${width}: too wide (${strWidth(plain)}): ${plain}`);
      }
      const boxed = lines.map(stripAnsi).filter((l) => /^\s*[│|╭╰+]/.test(l) && /[│|╮╯+]\s*$/.test(l) && !/https?:\/\//.test(l));
      assert.ok(boxed.length > 10, 'boxes were drawn');
      for (const l of boxed) assert.equal(strWidth(l), width, `${s}@${width}: box line is ${strWidth(l)} wide: ${l}`);
    }
  }
});

test('picks are listed in aligned columns', () => {
  const lines = stripAnsi(prettyAllText('nocolor')).split('\n');
  const head = lines.findIndex((l) => /^\s*#\s+Repo\s+Kind\s+Stars/.test(l));
  assert.ok(head >= 0, 'column header');
  const rows = lines.slice(head + 1, head + 1 + REC.recommendations.length);
  for (const col of ['Kind', 'Trust']) {
    const at = lines[head].indexOf(col);
    for (const r of rows) assert.notEqual(r[at], ' ', `${col} column misaligned: ${r}`);
    for (const r of rows) assert.equal(r[at - 1], ' ');
  }
  REC.recommendations.forEach((r, i) => assert.ok(rows[i].includes(r.name)));
  const starsEnd = lines[head].indexOf('Stars') + 'Stars'.length;
  for (const r of rows) assert.match(r.slice(0, starsEnd), /\d$/, 'stars are right-aligned');
});

test('pretty output keeps every fact the plain output gives (nothing lost)', () => {
  const unbox = (x) => stripAnsi(x).replace(/│/g, ' ');
  const text = unbox(prettyAll(PROFILE, EDGE.notes, EDGE.recommendations, { profilePath: '<DATA>/profile.json' }, P('nocolor', 100)));
  for (const r of EDGE.recommendations) {
    assert.ok(text.includes(r.name));
    assert.ok(text.replace(/\s+/g, ' ').includes(r.install), `install for ${r.name}`);
    for (const f of r.trust.flags || []) assert.ok(text.includes(f.id) && text.includes(`${f.file}${f.line ? `:${f.line}` : ''}`));
    for (const n of r.trust.notes) assert.ok(text.includes(n));
  }
  for (const n of EDGE.notes) assert.ok(text.replace(/\s+/g, ' ').includes(n));
  assert.match(text, /content not scanned/);
  assert.match(text, /at least 9/);
  const check = unbox(prettyCheck(fx('check.json'), P('nocolor', 100))).replace(/\s+/g, ' ');
  for (const s of ['do not install', 'README:42', 'README:7', 'Checked 2 files', 'source code was not scanned', 'No flags does not mean safe', '/plugin install runner@acme']) assert.ok(check.includes(s), s);
  const audit = stripAnsi(prettyAudit(fx('audit.json'), P('nocolor', 100)));
  for (const s of ['SKILL.md:3', 'hooks/pre.sh:12', 'PreToolUse', 'Glob|Grep', 'No network was used']) assert.ok(audit.includes(s), s);
  const me = stripAnsi(prettyMe(whoAmI(PROFILE), P('nocolor')));
  const r = whoAmI(PROFILE);
  for (const s of [r.animal.toUpperCase(), r.title, r.superpower, ...r.evidence, r.next]) assert.ok(me.replace(/\s+/g, ' ').includes(s.replace(/\s+/g, ' ')), s);
});

test('strWidth: escape codes take no room, CJK takes two columns', () => {
  assert.equal(strWidth(`${ESC}[1mab${ESC}[22m`), 2);
  assert.equal(strWidth('日本'), 4);
  assert.equal(strWidth('★⚑·'), 3);
});

// ---- CLI ------------------------------------------------------------------------------

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
function cliEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-out-home-'));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-out-data-'));
  fs.writeFileSync(path.join(data, 'profile.json'), JSON.stringify(PROFILE));
  const run = (...a) => execFileSync(process.execPath, [SCOUT, ...a, '--home', home, '--data', data], { encoding: 'utf8', env: { ...process.env, ...UTF8, NO_COLOR: '' } });
  return { home, data, run };
}

test('CLI through a pipe: plain, no escape codes, and --plain gives the same bytes', () => {
  const { run } = cliEnv();
  for (const args of [['me'], ['stats'], ['audit'], ['dismiss']]) {
    const out = run(...args);
    assert.ok(!out.includes(ESC), `${args}: escape codes`);
    assert.equal(run(...args, '--plain'), out, `${args} --plain`);
  }
  assert.equal(run('me'), `${formatMe(whoAmI(PROFILE))}\n`);
});

test('--json is unchanged by --plain, and --plain never swallows the next argument', () => {
  const { run } = cliEnv();
  assert.equal(run('me', '--json', '--plain'), run('me', '--json'));
  assert.deepEqual(JSON.parse(run('me', '--plain', '--json')), JSON.parse(run('me', '--json')));
  assert.match(run('dismiss', '--plain', 'acme/x'), /Dismissed acme\/x/);
  assert.match(run('rate', '--plain', 'acme/x', 'useful'), /acme\/x: useful/);
});

// v0.17 (review D4, D5): `privacy` lists every file Tool Scout keeps, what is in it and how to delete
// it, without printing any of the contents. Expired plans are pruned: they hold destinations,
// commands and settings, and must not outlive their 15 minutes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { privacyReport, formatPrivacy, pruneExpiredPlans, KEPT, PRIVACY_LINE } from '../scripts/lib/privacy.mjs';
import { PLAN_TTL_MIN, confirmInstall } from '../scripts/lib/installer.mjs';
import { confirmBuild } from '../scripts/lib/builder.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCOUT = path.join(ROOT, 'scripts', 'scout.mjs');
const MARKER = 'zebra-marker-9921';
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scout-privacy-cmd-'));
const NOW = Date.parse('2026-11-26T12:00:00Z');
const write = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text); };
const run = (args, d) => spawnSync(process.execPath, [SCOUT, ...args, '--data', d, '--home', fs.mkdtempSync(path.join(os.tmpdir(), 'scout-privacy-home-')), '--offline'], { encoding: 'utf8', cwd: d });

function populated() {
  const d = dir();
  for (const k of KEPT.filter((x) => !x.path.endsWith('/'))) write(d, k.path, JSON.stringify({ marker: MARKER }));
  for (const k of KEPT.filter((x) => x.path.endsWith('/'))) write(d, `${k.path}x.json`, JSON.stringify({ marker: MARKER }));
  return d;
}

test('the report lists every file Tool Scout keeps: what is in it, how sensitive, and how to delete it', () => {
  const d = populated();
  const r = privacyReport(d);
  assert.deepEqual(r.files.map((f) => f.path).sort(), KEPT.map((k) => k.path).sort());
  for (const f of r.files) {
    assert.equal(f.exists, true, f.path);
    assert.ok(f.contains.length > 20, `${f.path}: what is in it`);
    assert.ok(f.delete.includes(path.join(d, f.path.replace(/\/$/, ''))), `${f.path}: the delete command names the file`);
    assert.ok(['personal', 'high', 'public', 'low'].includes(f.sensitivity), f.path);
  }
  assert.deepEqual(r.unlisted, []);
});

test('the text says what the history does and does not do, and how to delete everything', () => {
  const d = populated();
  const text = formatPrivacy(privacyReport(d), { dataLine: `Data folder: ${d} (--data)` });
  assert.ok(text.includes(PRIVACY_LINE), text);
  assert.match(PRIVACY_LINE, /^Tool Scout doesn't upload your history\. When you run a skill, a summary goes into Claude's context like anything else you show Claude\.$/);
  assert.ok(text.includes(`rm -r "${d}"`), 'delete everything');
  for (const s of ['profile.json', 'kickoff/needs.json', 'installs.json', 'plans/', 'drafts/']) assert.ok(text.includes(s), s);
  assert.match(text, /installs\.json[^]*?ability to undo/i, 'deleting the install log loses undo');
  assert.match(text, /kickoff\/needs\.json[^]*?plan[^]*?in full/i);
  assert.match(text, /Claude's context/);
  assert.match(text, /api\.github\.com/);
});

test('the text never prints what is inside the files', () => {
  const d = populated();
  const text = formatPrivacy(privacyReport(d), { dataLine: '' });
  assert.ok(!text.includes(MARKER), 'file contents reached the output');
  assert.ok(!JSON.stringify(privacyReport(d)).includes(MARKER));
});

test('a missing file is listed as not there, and a file this version does not know is reported, not hidden', () => {
  const d = dir();
  write(d, 'profile.json', '{}');
  write(d, 'mystery.json', '{}');
  write(d, 'kickoff/other.txt', 'x');
  const r = privacyReport(d);
  assert.equal(r.files.find((f) => f.path === 'profile.json').exists, true);
  assert.equal(r.files.find((f) => f.path === 'installs.json').exists, false);
  assert.deepEqual(r.unlisted.sort(), ['kickoff/other.txt', 'mystery.json']);
  assert.match(formatPrivacy(r, { dataLine: '' }), /not in this list[^]*mystery\.json/i);
});

test('every file the commands write is in the list: run them and check for unlisted files', () => {
  const d = dir();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-privacy-home-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-privacy-proj-'));
  fs.writeFileSync(path.join(proj, 'requirements.txt'), 'pytest\n');
  fs.writeFileSync(path.join(proj, 'PLAN.md'), '# Plan\n\n## Tasks\n- Write pytest tests\n- Add tests for edge cases\n');
  const go = (...a) => spawnSync(process.execPath, [SCOUT, ...a, '--data', d, '--home', home, '--offline'], { encoding: 'utf8', cwd: proj });
  fs.writeFileSync(path.join(d, 'catalog.json'), JSON.stringify({ updatedAt: new Date().toISOString(), repos: {} }));
  for (const a of [['profile'], ['recommend'], ['dismiss', 'o/x'], ['rate', 'o/x', 'useful'], ['exclude-project', 'demo'], ['kickoff', '--plan-file', path.join(proj, 'PLAN.md'), '--project', proj], ['experimental', 'on'], ['build', '--start', '--form', 'skill', '--name', 'demo']]) go(...a);
  const files = fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(d, path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join('/'));
  assert.ok(files.length >= 5, files.join(', '));
  assert.deepEqual(privacyReport(d).unlisted, [], `unlisted: ${files.join(', ')}`);
});

test('the CLI: privacy prints the report; --json is the same data', () => {
  const d = populated();
  const text = run(['privacy', '--plain'], d);
  assert.equal(text.status, 0, text.stderr);
  assert.ok(text.stdout.includes(PRIVACY_LINE));
  assert.ok(!text.stdout.includes(MARKER));
  const j = JSON.parse(run(['privacy', '--json'], d).stdout);
  assert.equal(j.dir, d);
  assert.equal(j.files.length, KEPT.length);
});

// ---- expired plans (D5) --------------------------------------------------------------------------

const plan = (d, id, createdAt) => write(d, `plans/${id}.json`, JSON.stringify({ id, createdAt, expiresAt: createdAt, body: { writes: [{ path: '/home/me/.claude/skills/x' }], commands: [['mcp', 'add', 'x']] } }));
const ago = (min) => new Date(NOW - min * 60e3).toISOString();

test('pruneExpiredPlans removes plans older than their 15 minutes and keeps the active ones', () => {
  const d = dir();
  plan(d, 'aaaaaaaaaaaa', ago(PLAN_TTL_MIN + 1));
  plan(d, 'bbbbbbbbbbbb', ago(PLAN_TTL_MIN - 1));
  plan(d, 'cccccccccccc', ago(600));
  const removed = pruneExpiredPlans(d, NOW);
  assert.deepEqual(removed.sort(), ['aaaaaaaaaaaa', 'cccccccccccc']);
  assert.deepEqual(fs.readdirSync(path.join(d, 'plans')), ['bbbbbbbbbbbb.json']);
});

test('pruning touches only plan files: other names, other folders and a missing plans folder are left alone', () => {
  const d = dir();
  assert.deepEqual(pruneExpiredPlans(d, NOW), []);
  plan(d, 'aaaaaaaaaaaa', ago(60));
  write(d, 'plans/notes.txt', 'mine');
  write(d, 'plans/ABCDEF123456.json', '{}');
  write(d, 'drafts/x/SKILL.md', 'draft');
  pruneExpiredPlans(d, NOW);
  assert.deepEqual(fs.readdirSync(path.join(d, 'plans')).sort(), ['ABCDEF123456.json', 'notes.txt']);
  assert.ok(fs.existsSync(path.join(d, 'drafts', 'x', 'SKILL.md')));
});

test('a plan file that does not parse, or has no creation time, goes once the file itself is old', () => {
  const d = dir();
  write(d, 'plans/aaaaaaaaaaaa.json', '{not json');
  write(d, 'plans/bbbbbbbbbbbb.json', '{}');
  fs.utimesSync(path.join(d, 'plans', 'aaaaaaaaaaaa.json'), new Date(NOW - 3600e3), new Date(NOW - 3600e3));
  fs.utimesSync(path.join(d, 'plans', 'bbbbbbbbbbbb.json'), new Date(NOW), new Date(NOW));
  pruneExpiredPlans(d, NOW);
  assert.deepEqual(fs.readdirSync(path.join(d, 'plans')), ['bbbbbbbbbbbb.json'], 'the fresh one stays, the old unparseable one goes');
});

test('every command prunes expired plans first, and privacy says how many it just removed', () => {
  const d = dir();
  plan(d, 'aaaaaaaaaaaa', new Date(Date.now() - 3600e3).toISOString());
  plan(d, 'bbbbbbbbbbbb', new Date().toISOString());
  const r = run(['installed'], d);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(path.join(d, 'plans')), ['bbbbbbbbbbbb.json']);
  plan(d, 'cccccccccccc', new Date(Date.now() - 3600e3).toISOString());
  assert.match(run(['privacy', '--plain'], d).stdout, /Removed 1 expired plan/);
  assert.equal(JSON.parse(run(['privacy', '--json'], d).stdout).expiredPlansRemoved, 0, 'already gone');
});

test('confirming an expired plan deletes its file (installs and builds)', async () => {
  const { planId } = await import('../scripts/lib/installer.mjs');
  for (const name of ['install', 'build']) {
    const d = dir();
    const createdAt = ago(PLAN_TTL_MIN + 5);
    // A plan shaped like a real one, so its hash matches its ID and the expiry check is what answers.
    const body = { v: 1, repo: 'o/x', ...(name === 'build' ? { kind: 'build' } : {}), blockers: [], writes: [], commands: [] };
    const id = planId(createdAt, body);
    write(d, `plans/${id}.json`, JSON.stringify({ id, createdAt, expiresAt: createdAt, body }));
    const res = await (name === 'install' ? confirmInstall({ id, repo: 'o/x', home: d, cwd: d, dataDir: d, now: NOW, client: null }) : confirmBuild({ id, home: d, cwd: d, dataDir: d, now: NOW, client: null }));
    assert.equal(res.ok, false);
    assert.match(res.reason, /expired/);
    assert.ok(!fs.existsSync(path.join(d, 'plans', `${id}.json`)), `${name}: the expired plan file is still on disk`);
  }
});

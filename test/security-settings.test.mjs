// Security review, settings writes: Tool Scout edits ~/.claude/settings.json and ~/.claude.json
// (install, undo). A file it can't parse (a hand edit with a trailing comma, or ~/.claude.json
// half-written by a running Claude Code) must be left alone, never replaced by Tool Scout's few
// keys; writes are atomic and keep the file's mode. (docs/security-review.md, "Settings writes")
import { WIN } from './platform-skip.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { undoInstall, saveLog, makePlan as makePlanDefault, confirmInstall } from '../scripts/lib/installer.mjs';
import { sandbox, setup } from './security-helpers.mjs';
// v0.17: the default scope is project (test/scope-default.test.mjs). These tests exercise user scope, so they ask for it.
const makePlan = (a) => makePlanDefault({ scope: 'user', ...a });

/** A logged plugin install whose undo restores enabledPlugins (was false) and declinedPlugins. */
function logged(sb) {
  const settings = path.join(sb.home, '.claude', 'settings.json');
  const cj = path.join(sb.home, '.claude.json');
  saveLog(sb.dataDir, { installs: [{ name: 'guard@o-tools', repo: 'o/p', sha: 'b'.repeat(40), method: 'plugin', scope: 'user', planId: 'abcabcabcabc', at: '2026-11-25T12:00:00.000Z', files: [], dirs: [], commands: [], managedNew: [], managedRoots: [], credentials: [],
    settings: [{ file: settings, key: 'enabledPlugins.guard@o-tools', before: false, after: true, fileExisted: true, topExisted: true }],
    restore: [{ file: cj, key: 'declinedPlugins', before: ['old@x'] }] }] });
  return { settings, cj };
}
const run = () => '';

test('undo leaves a settings file it cannot parse byte for byte as it is, and says so', async () => {
  const sb = sandbox();
  const { settings, cj } = logged(sb);
  const hand = '{\n  "theme": "dark",\n  "enabledPlugins": { "guard@o-tools": true, },\n  "model": "opus"\n}\n'; // trailing comma
  const half = '{"numStartups": 3, "projects": {"/a": {"history": ["x"'; // Claude Code mid-write
  fs.writeFileSync(settings, hand); fs.writeFileSync(cj, half);
  const res = await undoInstall({ name: 'guard@o-tools', dataDir: sb.dataDir, run });
  assert.equal(fs.readFileSync(settings, 'utf8'), hand, 'settings.json untouched');
  assert.equal(fs.readFileSync(cj, 'utf8'), half, '~/.claude.json untouched');
  assert.ok(res.pending.some((k) => k.includes('settings.json')) && res.pending.some((k) => k.includes('.claude.json')), res.reason);
});

test('undo keeps the user\'s other keys and the file mode (0600 stays 0600), and writes atomically', async () => {
  const sb = sandbox();
  const { settings, cj } = logged(sb);
  fs.writeFileSync(settings, JSON.stringify({ theme: 'dark', enabledPlugins: { 'guard@o-tools': true }, addedLater: 1 }, null, 2));
  fs.writeFileSync(cj, JSON.stringify({ numStartups: 3, oauthAccount: { id: 'x' }, declinedPlugins: ['old@x', 'guard@o-tools'] }, null, 2));
  fs.chmodSync(cj, 0o600);
  await undoInstall({ name: 'guard@o-tools', dataDir: sb.dataDir, run });
  assert.deepEqual(JSON.parse(fs.readFileSync(settings, 'utf8')), { theme: 'dark', enabledPlugins: { 'guard@o-tools': false }, addedLater: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(cj, 'utf8')), { numStartups: 3, oauthAccount: { id: 'x' }, declinedPlugins: ['old@x'] });
  if (!WIN) assert.equal(fs.statSync(cj).mode & 0o777, 0o600); // no POSIX modes on Windows
  assert.deepEqual(fs.readdirSync(path.dirname(cj)).filter((f) => /tool-scout|\.tmp/.test(f)), [], 'no temp file left');
  const src = fs.readFileSync(new URL('../scripts/lib/installer.mjs', import.meta.url), 'utf8');
  const writer = src.slice(src.indexOf('export function writeJsonStyled'), src.indexOf('\n}', src.indexOf('export function writeJsonStyled')));
  assert.match(writer, /renameSync/, 'written to a temp file and renamed over the original');
});

test('a plan never treats a malformed settings file as empty (an MCP name check on a half-written ~/.claude.json)', async () => {
  const s = setup({ m: { readme: '```\nclaude mcp add mine -- npx -y m-mcp@1.0.0\n```', files: { 'index.js': '' }, topics: ['mcp-server'] } });
  fs.writeFileSync(path.join(s.sb.home, '.claude.json'), '{"mcpServers": {"mine": {"command": "x"}}, "projects": {');
  const plan = await makePlan({ ...s.ctx(), repo: 'o/m' });
  assert.ok(plan.body.blockers.some((b) => /\.claude\.json is not valid JSON/.test(b)), plan.body.blockers.join('\n'));
});

test('undo after the user edited the same file keeps their edit', async () => {
  const s = setup({ m: { readme: '```\nclaude mcp add srv -- npx -y m-mcp@1.0.0\n```', files: { 'index.js': '' }, topics: ['mcp-server'] } });
  const plan = await makePlan({ ...s.ctx(), repo: 'o/m' });
  assert.deepEqual(plan.body.blockers, []);
  assert.ok((await confirmInstall({ ...s.ctx(), repo: 'o/m', id: plan.id })).ok);
  const cj = path.join(s.sb.home, '.claude.json');
  const o = JSON.parse(fs.readFileSync(cj, 'utf8')); o.theme = 'light'; fs.writeFileSync(cj, JSON.stringify(o));
  await undoInstall({ name: 'srv', dataDir: s.sb.dataDir, run: s.claude.run });
  assert.deepEqual(JSON.parse(fs.readFileSync(cj, 'utf8')), { numStartups: 3, theme: 'light' });
});

test('a huge settings file (20 MB) is handled: undo restores the key and keeps everything else', async () => {
  const sb = sandbox();
  const { settings, cj } = logged(sb);
  const big = { theme: 'dark', enabledPlugins: { 'guard@o-tools': true }, history: Array.from({ length: 200000 }, (_, i) => `entry-${i}-${'x'.repeat(80)}`) };
  fs.writeFileSync(settings, JSON.stringify(big, null, 2));
  fs.writeFileSync(cj, JSON.stringify({ declinedPlugins: ['old@x'] }, null, 2));
  assert.ok(fs.statSync(settings).size > 20e6);
  await undoInstall({ name: 'guard@o-tools', dataDir: sb.dataDir, run });
  const after = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(after.enabledPlugins['guard@o-tools'], false);
  assert.equal(after.history.length, 200000);
});

// Medium M8 in docs/security-review.md: accepted in 0.12.2 (see the review for why); kept as a todo record.
test('a concurrent edit by Claude Code during undo is not lost', { todo: 'M8 (accepted): read-modify-write; the rename keeps files whole but can drop an edit made in between' }, async () => {
  const sb = sandbox();
  const { settings } = logged(sb);
  fs.writeFileSync(settings, JSON.stringify({ enabledPlugins: { 'guard@o-tools': true } }, null, 2));
  const write = fs.writeFileSync;
  fs.writeFileSync = (f, ...a) => { // Claude Code writes the file between Tool Scout's read and its rename
    if (String(f).endsWith('.tmp')) { fs.writeFileSync = write; write(settings, JSON.stringify({ enabledPlugins: { 'guard@o-tools': true }, model: 'opus' })); }
    return write(f, ...a);
  };
  try { await undoInstall({ name: 'guard@o-tools', dataDir: sb.dataDir, run }); } finally { fs.writeFileSync = write; }
  assert.equal(JSON.parse(fs.readFileSync(settings, 'utf8')).model, 'opus');
});

test('a settings file that is a symlink stays a symlink: the change lands in its target, and no temp file is left', async () => {
  const sb = sandbox();
  const { settings, cj } = logged(sb);
  const other = path.join(sb.root, 'dotfiles'); fs.mkdirSync(other);
  for (const [link, body] of [[settings, { theme: 'dark', enabledPlugins: { 'guard@o-tools': true } }], [cj, { numStartups: 3, declinedPlugins: ['old@x', 'guard@o-tools'] }]]) {
    const target = path.join(other, path.basename(link));
    fs.writeFileSync(target, JSON.stringify(body, null, 2));
    fs.chmodSync(target, 0o600);
    fs.rmSync(link); fs.symlinkSync(target, link);
  }
  await undoInstall({ name: 'guard@o-tools', dataDir: sb.dataDir, run });
  for (const link of [settings, cj]) assert.ok(fs.lstatSync(link).isSymbolicLink(), `${link} is still a symlink`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(other, 'settings.json'), 'utf8')).enabledPlugins['guard@o-tools'], false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(other, '.claude.json'), 'utf8')).declinedPlugins, ['old@x']);
  if (!WIN) assert.equal(fs.statSync(path.join(other, '.claude.json')).mode & 0o777, 0o600); // no POSIX modes on Windows
  for (const d of [other, path.dirname(settings), sb.home]) assert.deepEqual(fs.readdirSync(d).filter((f) => /tool-scout|\.tmp/.test(f)), [], `no temp file in ${d}`);
});

// ---- 0.12.1: a restore skipped because a file didn't parse is never lost ---------------------------
test('undo that had to skip an unparseable file stays undoable, names what is still to put back, and finishes on a retry', async () => {
  const { listInstalled } = await import('../scripts/lib/installer.mjs');
  const sb = sandbox();
  const { settings, cj } = logged(sb);
  fs.writeFileSync(settings, '{"enabledPlugins": {"guard@o-tools": true},}');
  fs.writeFileSync(cj, '{"declinedPlugins": ["old@x", "guard@o-tools"]'); // mid-write
  const res = await undoInstall({ name: 'guard@o-tools', dataDir: sb.dataDir, run });
  assert.equal(res.ok, false);
  assert.match(res.reason, /enabledPlugins\.guard@o-tools.*false/);
  assert.match(res.reason, /declinedPlugins.*\["old@x"\]/);
  assert.match(res.reason, /undo guard@o-tools/);
  assert.equal(listInstalled(sb.dataDir).length, 1, 'still listed, so undo can run again');
  fs.writeFileSync(settings, '{"enabledPlugins": {"guard@o-tools": true}}');
  fs.writeFileSync(cj, '{"declinedPlugins": ["old@x", "guard@o-tools"]}');
  const again = await undoInstall({ name: 'guard@o-tools', dataDir: sb.dataDir, run });
  assert.ok(again.ok, again.reason);
  assert.equal(JSON.parse(fs.readFileSync(settings, 'utf8')).enabledPlugins['guard@o-tools'], false);
  assert.deepEqual(JSON.parse(fs.readFileSync(cj, 'utf8')).declinedPlugins, ['old@x']);
  assert.equal(listInstalled(sb.dataDir).length, 0);
});

test('an install rolled back while a settings file did not parse says what is left, and logs it so undo can finish', async () => {
  const { makePlan, confirmInstall, listInstalled } = await import('../scripts/lib/installer.mjs');
  const s = setup({ p: { readme: '# p', topics: ['claude-code-plugin'], files: { '.claude-plugin/marketplace.json': JSON.stringify({ name: 'p-tools', plugins: [{ name: 'guard', source: './guard' }] }) } } });
  const settings = path.join(s.sb.home, '.claude', 'settings.json');
  fs.writeFileSync(settings, JSON.stringify({ enabledPlugins: { 'guard@p-tools': false } }));
  const plan = await makePlan({ ...s.ctx(), repo: 'o/p', scope: 'user' });
  assert.deepEqual(plan.body.blockers, []);
  const failing = (cmd, argv) => {
    if (argv[1] === 'install') { fs.writeFileSync(settings, '{"enabledPlugins": {"guard@p-tools": true},'); throw Object.assign(new Error('x'), { stderr: 'boom' }); }
    return '';
  };
  const res = await confirmInstall({ ...s.ctx({ run: failing }), repo: 'o/p', id: plan.id });
  assert.equal(res.ok, false);
  assert.match(res.reason, /enabledPlugins\.guard@p-tools.*false/);
  assert.match(res.reason, /undo guard@p-tools/);
  assert.equal(listInstalled(s.sb.dataDir).length, 1);
  fs.writeFileSync(settings, '{"enabledPlugins": {"guard@p-tools": true}}');
  assert.ok((await undoInstall({ name: 'guard@p-tools', dataDir: s.sb.dataDir, run })).ok);
  assert.equal(JSON.parse(fs.readFileSync(settings, 'utf8')).enabledPlugins['guard@p-tools'], false);
});

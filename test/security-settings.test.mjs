// Security review, settings writes: Tool Scout edits ~/.claude/settings.json and ~/.claude.json
// (install, undo). A file it can't parse (a hand edit with a trailing comma, or ~/.claude.json
// half-written by a running Claude Code) must be left alone, never replaced by Tool Scout's few
// keys; writes are atomic and keep the file's mode. (docs/security-review.md, "Settings writes")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { undoInstall, saveLog, makePlan, confirmInstall } from '../scripts/lib/installer.mjs';
import { sandbox, setup } from './security-helpers.mjs';

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
  assert.ok(res.kept.some((k) => k.includes('settings.json')) && res.kept.some((k) => k.includes('.claude.json')), res.kept.join('\n'));
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
  assert.equal(fs.statSync(cj).mode & 0o777, 0o600);
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

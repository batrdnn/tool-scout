import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildProfile, projectMatches } from '../scripts/lib/profile.mjs';
import { excludeProject, includeProject, loadSettings } from '../scripts/lib/settings.mjs';
import { fileURLToPath } from 'node:url';

const user = (text, cwd) => JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: text } });

function twoProjects() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-set-'));
  for (const [proj, cwd, prompts] of [['-Users-me-work-quant', '/Users/me/work/quant', ['write pytest tests', 'backtest the strategy']], ['-Users-me-Downloads-tool-scout', '/Users/me/Downloads/tool-scout', ['pentest the kubernetes cluster', 'fix the docker build']]]) {
    const dir = path.join(home, '.claude', 'projects', proj);
    fs.mkdirSync(dir, { recursive: true });
    prompts.forEach((p, i) => fs.writeFileSync(path.join(dir, `s${i}.jsonl`), user(p, cwd)));
  }
  return home;
}

test('projectMatches takes a folder name, a path or the encoded directory name', () => {
  const proj = { dir: '-Users-me-Downloads-tool-scout', cwd: '/Users/me/Downloads/tool-scout' };
  for (const n of ['tool-scout', 'Downloads/tool-scout', '/Users/me/Downloads/tool-scout', '/Users/me/Downloads/tool-scout/', proj.dir]) assert.ok(projectMatches(proj, n), n);
  for (const n of ['scout', 'tool', 'quant', 'me/tool-scout', '']) assert.ok(!projectMatches(proj, n), n);
  // Without a recorded cwd, only the encoded name can be used (its dashes are ambiguous).
  assert.ok(projectMatches({ dir: proj.dir }, 'tool-scout'));
  assert.ok(!projectMatches({ dir: proj.dir }, 'quant'));
});

test('buildProfile leaves out excluded projects and counts how many sessions it skipped', () => {
  const home = twoProjects();
  const all = buildProfile({ home, days: 30, cwd: home, excludeSessions: [] });
  assert.equal(all.sessions, 4);
  const p = buildProfile({ home, days: 30, cwd: home, excludeSessions: [], excludeProjects: ['tool-scout'] });
  assert.equal(p.sessions, 2);
  assert.equal(p.projects, 1);
  assert.equal(p.excludedProjectSessions, 2);
  assert.equal(p.topics['offensive-security'], undefined);
  assert.ok(!JSON.stringify(p).includes('tool-scout'), 'the profile keeps counts, not project names');
});

test('exclude-project is persisted in the data dir and can be undone', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-data-'));
  assert.deepEqual(excludeProject(data, 'tool-scout'), { name: 'tool-scout', added: true });
  assert.deepEqual(excludeProject(data, 'tool-scout').added, false);
  assert.deepEqual(loadSettings(data).excludeProjects, ['tool-scout']);
  assert.deepEqual(includeProject(data, 'tool-scout'), ['tool-scout']);
  assert.deepEqual(loadSettings(data).excludeProjects, []);
});

test('CLI: --exclude-project for one run, exclude-project to persist it', () => {
  const home = twoProjects();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-data-'));
  const cli = (...a) => execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url)), ...a, '--home', home, '--data', data, '--include-current'], { encoding: 'utf8' });
  assert.equal(JSON.parse(cli('profile', '--json')).sessions, 4);
  assert.equal(JSON.parse(cli('profile', '--json', '--exclude-project', 'tool-scout')).sessions, 2);
  assert.match(cli('exclude-project', 'tool-scout'), /tool-scout/);
  assert.equal(JSON.parse(cli('profile', '--json')).sessions, 2, 'persisted');
  cli('include-project', 'tool-scout');
  assert.equal(JSON.parse(cli('profile', '--json')).sessions, 4);
});

test('exclusion is decided per session from its own cwd, not per project folder', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-set-'));
  const dir = path.join(home, '.claude', 'projects', '-Users-me-Projects-proxy');
  fs.mkdirSync(dir, { recursive: true });
  // The folder's first file ran in tool-scout; the second in the proxy project itself.
  fs.writeFileSync(path.join(dir, 'a.jsonl'), user('fix the docker build', '/Users/me/Downloads/tool-scout'));
  fs.writeFileSync(path.join(dir, 'b.jsonl'), user('write pytest tests', '/Users/me/Projects/proxy'));
  const p = buildProfile({ home, days: 30, cwd: home, excludeSessions: [], excludeProjects: ['tool-scout'] });
  assert.equal(p.sessions, 1);
  assert.equal(p.excludedProjectSessions, 1);
  assert.equal(p.topics.testing, 1);
  assert.equal(p.topics.devops, undefined);
});

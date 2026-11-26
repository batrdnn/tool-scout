// Security review, privacy: a full run through the real CLI (scout, check, install, build, kickoff,
// undo) with every network request captured. No profile, plan or local path data may leave the
// machine, and the GitHub token goes only to api.github.com, in the Authorization header, and is
// never printed or written to disk. (docs/security-review.md, "Privacy")
import { WIN, NO_MODES, NO_SH_SHIM } from './platform-skip.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCOUT = fileURLToPath(new URL('../scripts/scout.mjs', import.meta.url));
const PRELOAD = new URL('./fixtures/security/capture-fetch.mjs', import.meta.url).href;
const TOKEN = 'ghp_SENTINELtoken0123456789abcdef';
const PROJECT = 'okapi-ledger-5150'; // project folder name: in the profile only
const PROMPT = 'quokka-secret-prompt-8842'; // a user prompt: in session logs only
const PLAN_TEXT = 'narwhal-plan-text-3391'; // the kickoff plan: in the needs file only

function world() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scout-privacy-')));
  const home = path.join(root, 'home'), cwd = path.join(root, PROJECT), data = path.join(root, 'data'), bin = path.join(root, 'bin');
  const sessions = path.join(home, '.claude', 'projects', `-u-${PROJECT}`);
  for (const d of [cwd, data, bin, sessions]) fs.mkdirSync(d, { recursive: true });
  const user = (t) => ({ type: 'user', cwd, message: { role: 'user', content: t } });
  const tool = (name, input) => ({ type: 'assistant', cwd, message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } });
  for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(sessions, `s${i}.jsonl`), [user(`${PROMPT}: write pytest fixtures for ${cwd}/engine.py`), tool('Bash', { command: `pytest -q ${cwd}/tests` }), tool('Edit', { file_path: `${cwd}/engine.py` })].map((l) => JSON.stringify(l)).join('\n'));
  fs.writeFileSync(path.join(cwd, 'requirements.txt'), 'pytest\n');
  fs.writeFileSync(path.join(root, 'PLAN.md'), `# ${PLAN_TEXT}\n\nA Python service with pytest tests and GitHub Actions CI.\n`);
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "$@" >> "${root}/claude-calls.txt"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ experimentalInstaller: true })); // v0.17: these runs install, which is off unless this is set
  return { root, home, cwd, data, bin, capture: path.join(root, 'capture.jsonl') };
}

function cli(w, args) {
  const env = { PATH: `${w.bin}:/usr/bin:/bin`, HOME: w.home, GITHUB_TOKEN: TOKEN, SCOUT_CAPTURE: w.capture, NO_COLOR: '1' };
  const r = spawnSync(process.execPath, ['--import', PRELOAD, SCOUT, ...args, '--plain', '--home', w.home, '--data', w.data], { cwd: w.cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r;
}
const idIn = (out) => out.match(/--confirm ([0-9a-f]{12})/)[1];

test('a full run sends no profile, plan or path data anywhere, and the token only to api.github.com', { skip: WIN && NO_SH_SHIM }, () => {
  const w = world();
  const outs = [];
  const run = (...a) => { const r = cli(w, a); outs.push(r.stdout, r.stderr); return r.stdout; };
  run('all', '--refresh');
  run('check', 'o/thing-mcp');
  const plan = run('install', 'o/thing-mcp', '--plan');
  run('install', 'o/thing-mcp', '--confirm', idIn(plan));
  const dir = JSON.parse(run('build', '--start', '--form', 'skill', '--name', 'tbl', '--json')).dir;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: tbl\ndescription: Formats tables. Use when the user asks for a table.\n---\n\nFormat tables.\n');
  const bplan = run('build', '--form', 'skill', '--name', 'tbl', '--from', dir, '--plan');
  run('build', '--confirm', idIn(bplan));
  run('kickoff', '--plan-file', path.join(w.root, 'PLAN.md'), '--project', w.cwd);
  run('undo', 'thing');

  const reqs = fs.readFileSync(w.capture, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(reqs.length > 10, 'the run did use the network');
  assert.ok(reqs.some((r) => r.url.includes('registry.npmjs.org')), 'npm was asked for a version');
  assert.ok(reqs.some((r) => r.headers.authorization), 'the token was used (so the checks below are live)');
  assert.match(fs.readFileSync(path.join(w.root, 'claude-calls.txt'), 'utf8'), /mcp add thing[\s\S]*mcp remove thing/, 'install and undo ran the (fake) claude CLI');
  assert.ok(fs.existsSync(path.join(w.home, '.claude', 'skills', 'tbl', 'SKILL.md')), 'the build was written');
  const secrets = [PROJECT, PROMPT, PLAN_TEXT, w.root, w.home, w.cwd, w.data, idIn(plan), idIn(bplan), os.userInfo().username, 'pytest-helper/engine', 'tbl'];
  for (const r of reqs) {
    const { authorization, ...rest } = r.headers;
    const sent = JSON.stringify([r.url, rest, r.body]);
    for (const s of secrets) assert.ok(!sent.includes(s), `${s} sent in ${sent}`);
    assert.equal(r.method, 'GET', r.url);
    if (authorization) assert.equal(new URL(r.url).hostname, 'api.github.com', `token sent to ${r.url}`);
    if (authorization) assert.equal(authorization, `Bearer ${TOKEN}`);
    assert.ok(!sent.includes(TOKEN), `token outside the Authorization header: ${sent}`);
  }

  // The token is never printed or written, anywhere under the sandbox (data folder included).
  for (const o of outs) assert.ok(!o.includes(TOKEN), 'token printed');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(w.root).filter((f) => f !== w.capture)) assert.ok(!fs.readFileSync(f, 'latin1').includes(TOKEN), `token written to ${f}`);
  // README example secret values never land on disk either.
  for (const f of walk(w.data)) assert.ok(!/THING_KEY=abc/.test(fs.readFileSync(f, 'utf8')), f);
});

// Medium M6 in docs/security-review.md (fixed in 0.12.2): the data folder is 0700 and nothing in it
// is readable by group or others, including a folder made earlier with the default umask (--data).
test('the data folder and its files are private to the user (0700 / 0600)', { skip: WIN && (NO_MODES + '; also ' + NO_SH_SHIM) }, () => {
  const w = world();
  fs.chmodSync(w.data, 0o755);
  fs.writeFileSync(path.join(w.data, 'old-log.json'), '{}', { mode: 0o644 });
  const outside = path.join(w.root, 'shared.txt'); fs.writeFileSync(outside, 'x', { mode: 0o644 });
  fs.symlinkSync(outside, path.join(w.data, 'link')); // a link in the folder is never followed
  cli(w, ['profile']);
  cli(w, ['all', '--refresh']);
  const plan = cli(w, ['install', 'o/thing-mcp', '--plan']).stdout;
  cli(w, ['install', 'o/thing-mcp', '--confirm', idIn(plan)]);
  cli(w, ['undo', 'thing']);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => [path.join(d, e.name), ...(e.isDirectory() ? walk(path.join(d, e.name)) : [])]);
  const all = [w.data, ...walk(w.data)];
  assert.ok(all.some((f) => f.endsWith('profile.json')) && all.some((f) => f.includes(`${path.sep}plans${path.sep}`)), all.join('\n'));
  assert.equal(fs.statSync(outside).mode & 0o777, 0o644);
  for (const f of all.filter((f) => !f.endsWith(`${path.sep}link`))) assert.equal(fs.statSync(f).mode & 0o077, 0, `${f} is ${(fs.statSync(f).mode & 0o777).toString(8)}`);
});

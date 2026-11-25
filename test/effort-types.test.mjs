// One synthetic repo per type, end to end through the real fetch path (check and the pipeline,
// against a mock GitHub), plus proof that the estimate writes nothing outside the data folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkRepo } from '../scripts/lib/check.mjs';
import { runPipeline } from '../scripts/lib/pipeline.mjs';
import { createClient } from '../scripts/lib/github.mjs';
import { BYTES_PER_LINE as L, BYTES_PER_MD_LINE as M } from '../scripts/lib/effort.mjs';
import { githubTrees } from './effort-scan.test.mjs';
import { NOW, profile, ghRepo, catalogOf } from './pipeline.test.mjs';

/** The rules' own advice: for a close call it's the fallback under `judgment`, since Claude decides. */
const rule = (e) => e.judgment?.ruleAdvice ?? e.advice;


const files = (n, prefix, lines, ext) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}.${ext}`, lines * L]));
const RECENT = new Date(NOW - 2 * 86400e3).toISOString();

/** name → synthetic repo, and what the estimate must say about it. */
const TYPES = {
  'instr-test-mcp': {
    repo: { tree: { 'README.md': 4000, 'LICENSE': 1000, 'skills/review/SKILL.md': 90 * M, 'skills/review/checklist.md': 40 * M } },
    want: { type: 'instructions', advice: 'build', buildForm: 'skill', loc: 0 },
  },
  'note-test-mcp': {
    repo: { tree: { 'skills/tabs/SKILL.md': 20 * M } },
    want: { type: 'instructions', advice: 'build', buildForm: 'CLAUDE.md note' },
  },
  'scripts-test-mcp': {
    repo: { tree: { 'skills/pdf/SKILL.md': 60 * M, 'skills/pdf/scripts/extract.py': 180 * L, 'tests/test_extract.py': 900 * L }, files: { 'requirements.txt': 'pypdf\n' } },
    want: { type: 'skill-scripts', advice: 'build', buildForm: 'skill with a script', loc: 180 },
  },
  'hooks-test-mcp': {
    repo: { tree: { '.claude-plugin/plugin.json': 300, 'hooks/hooks.json': 400, 'hooks/guard.sh': 80 * L } },
    want: { type: 'plugin', advice: 'build', buildForm: 'hook' },
  },
  'agents-test-mcp': {
    repo: { tree: { '.claude-plugin/plugin.json': 300, 'agents/reviewer.md': 80 * M, 'agents/tester.md': 60 * M } },
    want: { type: 'plugin', advice: 'build', buildForm: 'subagent' },
  },
  'api-test-mcp': {
    repo: {
      tree: { 'package.json': 600, 'package-lock.json': 300000, ...files(30, 'src/tool', 150, 'ts') },
      files: { 'package.json': JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '1', axios: '1' } }) },
      readme: 'Export `ACME_API_KEY` before starting the server.',
    },
    want: { type: 'mcp-server', advice: 'install', apis: [] }, // ACME is not a known API and has no domain in the README
  },
  'small-api-test-mcp': {
    repo: { tree: { 'requirements.txt': 40, 'server.py': 200 * L }, files: { 'requirements.txt': 'fastmcp\nhttpx\n' }, readme: 'Set WEATHER_API_KEY.' },
    want: { type: 'mcp-server', advice: 'either', apis: [] },
  },
  'planner-app': {
    repo: {
      tree: { 'package.json': 600, 'docker-compose.yml': 500, ...files(40, 'app/page', 120, 'tsx') },
      files: { 'package.json': JSON.stringify({ dependencies: { next: '1', pg: '1' } }), 'docker-compose.yml': 'services:\n  db:\n    image: postgres:16\n' },
      description: 'Self-hosted project planning web app', topics: ['nextjs', 'web-app'],
    },
    want: { type: 'app', advice: 'install', services: ['docker', 'database'] },
  },
  'active-test-mcp': {
    repo: { tree: { 'SKILL.md': 30 * M, ...files(4, 'lib/m', 300, 'go') }, pushedAt: RECENT },
    want: { type: 'skill-scripts', advice: 'install' },
  },
};

for (const [name, { want }] of Object.entries(TYPES)) {
  test(`check, synthetic ${want.type} repo (${name}): ${want.advice}${want.buildForm ? `, as a ${want.buildForm}` : ''}`, async () => {
    const repos = Object.fromEntries(Object.entries(TYPES).map(([n, t]) => [n, t.repo]));
    const r = await checkRepo(createClient({ fetchImpl: githubTrees(repos) }), `o/${name}`, { now: NOW });
    const e = r.effort;
    assert.equal(e.type, want.type);
    assert.equal(rule(e), want.advice, e.reason);
    if (e.judgment) assert.equal(e.advice, 'judge', 'a close call is Claude\'s');
    if (want.buildForm) assert.equal(e.buildForm, want.buildForm);
    if (want.loc != null) assert.equal(e.loc, want.loc);
    if (want.apis) assert.deepEqual(e.needs.apis, want.apis);
    if (want.services) assert.deepEqual(e.needs.services, want.services);
    assert.ok(e.reason && !e.reason.includes('\n'));
  });
}

// ---- nothing written outside the data folder ----------------------------------------------

test('effort.mjs has no imports and no I/O at all: it cannot write, fetch or spawn', () => {
  const src = fs.readFileSync(new URL('../scripts/lib/effort.mjs', import.meta.url), 'utf8');
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual([...code.matchAll(/^\s*import\s.*$/gm)].map((m) => m[0]), [], 'no imports');
  assert.ok(!/\bimport\s*\(|\brequire\s*\(|\bprocess\.|\bfetch\s*\(|\bglobalThis\b|\bDeno\b|\bBun\b/.test(code), 'no dynamic imports, process, fetch or globals');
});

const WRITERS = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'copyFileSync', 'rmSync', 'unlinkSync', 'symlinkSync', 'createWriteStream', 'mkdtempSync'];

test('a full run with the estimate writes only inside the data folder', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-effort-writes-'));
  const dataDir = path.join(base, 'data');
  const cwd = path.join(base, 'cwd');
  fs.mkdirSync(cwd);
  const written = [];
  const orig = {};
  for (const k of WRITERS) { orig[k] = fs[k]; fs[k] = (p, ...a) => { written.push(String(p)); return orig[k].call(fs, p, ...a); }; }
  const oldCwd = process.cwd();
  process.chdir(cwd);
  try {
    const repos = Object.fromEntries(Object.entries(TYPES).map(([n, t]) => [n, t.repo]));
    const cat = catalogOf(Object.keys(TYPES).map((n, i) => ghRepo(n, `Testing MCP server ${n}`, { stars: 9000 - i * 100 })));
    const { recs } = await runPipeline(profile(), cat, { top: 5, client: createClient({ fetchImpl: githubTrees(repos) }), dataDir, now: NOW });
    assert.ok(recs.filter((r) => r.effort).length >= 5, 'the estimate ran');
  } finally {
    process.chdir(oldCwd);
    for (const k of WRITERS) fs[k] = orig[k];
  }
  assert.ok(written.length > 0, 'the run wrote its caches');
  for (const p of written) assert.ok(path.resolve(p).startsWith(dataDir + path.sep) || path.resolve(p) === dataDir, `wrote outside the data folder: ${p}`);
  assert.deepEqual(fs.readdirSync(cwd), [], 'nothing in the current folder');
});

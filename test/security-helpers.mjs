// Security review fixtures (not a test file): a sandbox HOME/project/data folder, a mock GitHub
// that serves hostile repos (any tree entry, any file name, any mode), and a mock `claude` CLI
// that records every call and writes what the real one would for mcp add / remove.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '../scripts/lib/github.mjs';
import { mockFetch } from './helpers.mjs';
import { relPosix } from './build-helpers.mjs';

export const NOW = Date.parse('2026-11-25T12:00:00Z');
export const gitSha = (t) => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(t)}\0`).update(t).digest('hex');
export const SHA = 'e'.repeat(40);

export function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-sec-'));
  const home = path.join(root, 'home'), cwd = path.join(root, 'project'), dataDir = path.join(root, 'data');
  for (const d of [home, cwd, path.join(home, '.claude', 'skills')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ theme: 'dark' }, null, 2));
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ numStartups: 3 }, null, 2));
  return { root, home, cwd, dataDir };
}

/** Every path under the sandbox but the data folder, with a hash: what an attack may not change. */
export function snapshot(sb) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (p === sb.dataDir) continue;
      if (e.isDirectory()) { out[`${relPosix(sb.root, p)}/`] = 'dir'; walk(p); }
      else out[relPosix(sb.root, p)] = e.isSymbolicLink() ? 'link' : crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(sb.root);
  return out;
}
export const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();

/**
 * A hostile repo `o/<name>`: { readme, files: { path: text }, extra: [raw tree entries], kind, head }.
 * `extra` entries are served as given (symlinks, submodules, odd modes).
 */
export function github(repos) {
  return mockFetch((url) => {
    const u = new URL(url);
    const m = u.pathname.match(/^\/repos\/o\/([^/]+)(?:\/(.*))?$/);
    const r = m && repos[m[1]];
    if (!r) return undefined;
    const rest = m[2] || '';
    const ref = u.searchParams.get('ref');
    if (ref && ref !== SHA) return undefined;
    if (!rest) return { full_name: `o/${m[1]}`, name: m[1], owner: { login: 'o', type: 'Organization' }, html_url: `https://github.com/o/${m[1]}`, description: r.description || 'A tool', topics: r.topics || ['claude-skills'], language: 'Python', stargazers_count: 500, forks_count: 20, license: { spdx_id: 'MIT' }, archived: false, fork: false, created_at: '2025-01-01T00:00:00Z', pushed_at: '2026-10-01T00:00:00Z', default_branch: 'main' };
    if (rest === 'commits/HEAD') return { sha: r.head || SHA };
    if (rest.startsWith('git/trees/')) {
      const tree = Object.entries(r.files).map(([p, t]) => ({ path: p, type: 'blob', mode: '100644', sha: gitSha(t), size: Buffer.byteLength(t) }));
      return { sha: SHA, truncated: false, tree: [...tree, ...(r.extra || [])] };
    }
    if (rest.startsWith('git/blobs/')) {
      const sha = rest.split('/')[2];
      const t = Object.values(r.files).find((x) => gitSha(x) === sha);
      return t == null ? undefined : { sha, encoding: 'base64', content: Buffer.from(t).toString('base64') };
    }
    if (rest === 'readme') return r.readme ?? undefined;
    if (rest.startsWith('contents/')) return r.files[decodeURIComponent(rest.slice(9))];
    return undefined;
  });
}

/** Mock `claude`: records argv; mcp add / remove edit the scope's JSON like the real CLI. */
export function mockClaude(sb) {
  const calls = [];
  const json = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
  const run = (cmd, argv) => {
    calls.push([cmd, ...argv]);
    const scope = argv[argv.indexOf('--scope') + 1];
    const f = scope === 'project' ? path.join(sb.cwd, '.mcp.json') : path.join(sb.home, '.claude.json');
    if (argv[0] === 'mcp' && argv[1] === 'add') { const s = json(f); fs.writeFileSync(f, JSON.stringify({ ...s, mcpServers: { ...(s.mcpServers || {}), [argv[2]]: { command: 'x' } } }, null, 2)); }
    if (argv[0] === 'mcp' && argv[1] === 'remove') { const s = json(f); delete s.mcpServers?.[argv[2]]; fs.writeFileSync(f, JSON.stringify(s, null, 2)); }
    return '';
  };
  return { run, calls };
}

export function setup(repos) {
  const sb = sandbox();
  const fetchImpl = github(repos);
  const claude = mockClaude(sb);
  const versions = async () => '1.0.0';
  const ctx = (extra = {}) => ({ client: createClient({ fetchImpl }), home: sb.home, cwd: sb.cwd, dataDir: sb.dataDir, run: claude.run, now: NOW, versions, ...extra });
  return { sb, claude, ctx, fetchImpl };
}

export const SKILL_MD = (name) => `---\nname: ${name}\ndescription: Formats tables. Use when the user asks for a table.\n---\n\nFormat tables neatly.\n`;

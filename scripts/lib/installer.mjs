// Install with consent. Three steps, and nothing happens before the user has seen the plan:
//   makePlan     reads the repo at one pinned commit and writes NOTHING outside the data folder
//                (it saves the plan there, under an ID that is a hash of the plan, for 15 minutes)
//   confirmInstall  re-makes the plan at the pinned commit; only if it is identical (same ID),
//                unexpired and not blocked, does exactly that and logs every file and setting
//   undoInstall  removes exactly what the log says, using the claude CLI where it was used
//
// Supported methods only: a skill folder copied from git blobs at the pinned commit (each one
// checked against its git hash), a plugin via `claude plugin marketplace add` + `claude plugin
// install`, an MCP server via the `claude mcp add` command from the README. Nothing from the repo
// is ever executed: no install scripts, no package-manager hooks, no other README command, and no
// `-y` that would accept a marketplace-declared command. Credentials are never asked for, read or
// stored: the plan names the environment variables the user sets themselves.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { checkRepo } from './check.mjs';
import { normalizeRepo } from './feedback.mjs';

export const PLAN_TTL_MIN = 15;
const MAX_FILES = 300;
const MAX_BYTES = 5_000_000;
const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const LOG = 'installs.json';
const UNPINNED_RUNNERS = new Set(['npx', 'uvx', 'pipx', 'bunx', 'pnpm', 'yarn', 'npm', 'deno', 'docker', 'podman', 'bun']);

/** The only way anything is run: the claude CLI, or `git -C <dir> rev-parse HEAD` to verify a checkout. */
export function defaultRun(cmd, argv) {
  const ok = cmd === 'claude' || (cmd === 'git' && argv.length === 4 && argv[0] === '-C' && argv[2] === 'rev-parse' && argv[3] === 'HEAD');
  if (!ok) throw new Error(`refusing to run ${cmd}`);
  return execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const gitBlobSha = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
/** A dotted key's first segment is the top-level key; the rest (which may contain dots) is one sub-key. */
function getKey(file, key) {
  const [top, ...rest] = key.split('.');
  const o = readJson(file);
  const v = o?.[top];
  return rest.length ? v?.[rest.join('.')] : v;
}
function setKey(file, key, value) {
  const [top, ...rest] = key.split('.');
  const o = readJson(file) || {};
  if (!rest.length) { if (value == null) delete o[top]; else o[top] = value; } else {
    const sub = { ...(o[top] || {}) };
    if (value == null) delete sub[rest.join('.')]; else sub[rest.join('.')] = value;
    o[top] = sub;
  }
  fs.writeFileSync(file, `${JSON.stringify(o, null, 2)}\n`);
}
/** A JSON file left with nothing in it ({}, or only empty objects), which an install created. */
const emptyJson = (f) => { const o = readJson(f); return !!o && typeof o === 'object' && Object.values(o).every((v) => v && typeof v === 'object' && !Object.keys(v).length); };

// ---- README `claude mcp add` commands, tokenized without a shell -------------------------------

/** Shell-like split with quotes; null when the text needs a shell ($, `, ;, |, &, <, >). */
export function tokenize(line) {
  const out = []; let cur = ''; let q = null; let has = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q === "'") { if (ch === "'") q = null; else cur += ch; continue; }
    if (q === '"') { if (ch === '"') q = null; else if (ch === '$' || ch === '`') return null; else if (ch === '\\' && i + 1 < line.length) cur += line[++i]; else cur += ch; continue; }
    if (ch === "'" || ch === '"') { q = ch; has = true; continue; }
    if (/[$`;|&<>(){}]/.test(ch)) return null;
    if (ch === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; continue; }
    if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
    cur += ch; has = true;
  }
  if (q) return null;
  if (cur || has) out.push(cur);
  return out.some((t) => /[\u0000-\u001f\u007f]/.test(t)) ? null : out;
}

// Even quoted, these mean the server line is a shell program (`sh -c "curl … | sh"`): never registered.
const SHELLISH = /[|;&<>`$]/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'fish', 'ksh', 'csh', 'cmd', 'cmd.exe', 'powershell', 'pwsh', 'eval', 'env', 'sudo', 'curl', 'wget']);
const VALUE_OPTS = { '-t': 'transport', '--transport': 'transport', '--callback-port': 'callback-port', '--client-id': 'client-id' };
/** Every `claude mcp add` in the README: { name, argv (minus scope/env/header), env keys, dropped } or { rejected }. */
export function mcpCommands(readme) {
  const text = String(readme || '').replace(/\\\r?\n\s*/g, ' ');
  const found = [];
  for (const m of text.matchAll(/(?:^|[\s`$>])(claude\s+mcp\s+add(?!-json)\s[^\n`]*)/g)) {
    const toks = tokenize(m[1].trim());
    if (!toks || toks.some((t) => SHELLISH.test(t))) { found.push({ rejected: 'needs a shell' }); continue; }
    const args = toks.slice(3);
    const keep = []; const env = []; const dropped = []; const pos = []; let rest = null;
    let bad = null;
    for (let i = 0; i < args.length && !bad; i++) {
      const a = args[i];
      if (a === '--') { rest = args.slice(i + 1); break; }
      if (a === '-e' || a === '--env') { while (i + 1 < args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[i + 1])) env.push(args[++i].split('=')[0]); continue; }
      if (a === '-H' || a === '--header') { while (i + 1 < args.length && !args[i + 1].startsWith('-')) dropped.push(`header ${args[++i].split(':')[0]}`); continue; }
      if (a === '-s' || a === '--scope') { i++; continue; }
      if (a === '--client-secret') { dropped.push('client secret'); continue; }
      if (VALUE_OPTS[a]) { if (i + 1 >= args.length) bad = 'missing value'; else keep.push(a, args[++i]); continue; }
      if (a.startsWith('-')) { bad = `unknown option ${a}`; continue; }
      pos.push(a);
    }
    if (bad) { found.push({ rejected: bad }); continue; }
    const [name, target, ...more] = [...pos, ...(rest || [])];
    if (!name || !target || !NAME_OK.test(name)) { found.push({ rejected: 'no server name or command' }); continue; }
    if (SHELLS.has(path.basename(target).toLowerCase())) { found.push({ rejected: `runs ${path.basename(target)}` }); continue; }
    const url = /^https?:\/\//.test(target) || keep.includes('http') || keep.includes('sse');
    found.push({ name, opts: keep, url, target, args: url ? [] : more, env, dropped });
  }
  return found;
}

// ---- the plan -----------------------------------------------------------------------------------

const planFile = (dataDir, id) => path.join(dataDir, 'plans', `${id}.json`);
const tilde = (p, home) => (p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);

/**
 * Read-only: the exact plan for installing `repo` (at `sha`, or its current HEAD) with `scope`.
 * Saves it in the data folder (only there) and returns { id, createdAt, expiresAt, body }.
 */
export async function makePlan({ client, repo, part = null, scope = 'user', sha = null, home, cwd, dataDir, now = Date.now(), save = true }) {
  const full = normalizeRepo(repo || '');
  if (!full) throw new Error(`not a GitHub repo: ${repo}`);
  if (!['user', 'project'].includes(scope)) throw new Error('--scope must be user or project');
  const api = `https://api.github.com/repos/${full}`;
  const blockers = []; const notes = [];
  const pinned = sha || (await client.request(`${api}/commits/HEAD`)).data?.sha;
  if (!pinned) throw new Error(`${full}: could not read its latest commit`);
  const treeRes = await client.request(`${api}/git/trees/${pinned}?recursive=1`);
  const tree = treeRes.data?.tree;
  if (!tree) blockers.push(`the pinned commit ${pinned.slice(0, 7)} is no longer in the repo`);
  if (treeRes.data?.truncated) blockers.push('the repo is too large to list completely');
  const check = tree ? await checkRepo(client, full, { now, ref: pinned }) : null;
  if (check?.verdict === 'do not install') blockers.push(`the check says "do not install" (${check.reasons.join('; ')})`);
  const readme = tree ? (await client.request(`${api}/readme?ref=${pinned}`, { accept: 'application/vnd.github.raw+json', raw: true })).data : '';
  const blobs = (tree || []).filter((t) => t.type === 'blob');
  const has = (p) => blobs.some((t) => t.path === p);

  const mcp = mcpCommands(typeof readme === 'string' ? readme : '');
  const skillDirs = blobs.filter((t) => /(^|\/)SKILL\.md$/.test(t.path) && !/(^|\/)(tests?|examples?|fixtures?)\//i.test(t.path)).map((t) => t.path.replace(/SKILL\.md$/, ''));
  const method = !tree ? null
    : check?.kind === 'mcp-server' && mcp.length ? 'mcp'
      : has('.claude-plugin/marketplace.json') ? 'plugin'
        : skillDirs.length ? 'skill'
          : mcp.length ? 'mcp' : null;
  if (tree && !method) blockers.push('no supported install method: no plugin marketplace, skill folder or claude mcp add command in the README');

  let name = null; const writes = []; const commands = []; const settings = []; const managed = []; const credentials = new Set();
  for (const c of check?.effort?.needs?.credentials || []) if (/^[A-Z][A-Z0-9_]+$/.test(c)) credentials.add(c);
  if (check?.effort?.needs?.credentials?.includes('OAuth')) notes.push('It may ask you to sign in (OAuth) the first time it runs.');

  if (method === 'skill') {
    const byName = new Map(skillDirs.map((d) => [d ? path.posix.basename(d) : full.split('/')[1], d]));
    if (byName.size > 1 && !part) blockers.push(`this repo has ${byName.size} skills: choose one with --part: ${[...byName.keys()].sort().join(', ')}`);
    else if (part && !byName.has(part)) blockers.push(`no skill named ${part} (there are: ${[...byName.keys()].sort().join(', ')})`);
    else {
      name = part || [...byName.keys()][0];
      const dir = byName.get(name);
      if (!NAME_OK.test(name)) blockers.push(`unsafe skill name ${JSON.stringify(name)}`);
      const dest = scope === 'project' ? path.join(cwd, '.claude', 'skills', name) : path.join(home, '.claude', 'skills', name);
      if (fs.existsSync(dest)) blockers.push(`${tilde(dest, home)} already exists: Tool Scout never overwrites it`);
      const files = (tree || []).filter((t) => t.path.startsWith(dir) && (dir || !/^\.(git|github)\//.test(t.path)));
      for (const t of files) {
        const rel = t.path.slice(dir.length);
        if (t.type !== 'blob') { notes.push(`Skipped ${rel} (a submodule).`); continue; }
        if (t.mode === '120000') { notes.push(`Skipped ${rel} (a symlink).`); continue; }
        if (!rel || rel.split('/').some((s) => s === '..' || s === '.' || !s) || path.isAbsolute(rel)) { blockers.push(`unsafe path in the repo: ${JSON.stringify(rel)}`); continue; }
        writes.push({ path: path.join(dest, ...rel.split('/')), rel, blob: t.sha, mode: t.mode === '100755' ? '100755' : '100644', size: t.size || 0 });
      }
      writes.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
      if (writes.length > MAX_FILES) blockers.push(`${writes.length} files: more than ${MAX_FILES}`);
      if (writes.reduce((a, w) => a + w.size, 0) > MAX_BYTES) blockers.push('more than 5 MB');
      if (writes.some((w) => w.mode === '100755')) notes.push('Some files are marked executable. They are copied, never run.');
    }
  } else if (method === 'plugin') {
    let mk = null;
    try { mk = JSON.parse((await client.request(`${api}/contents/.claude-plugin/marketplace.json?ref=${pinned}`, { accept: 'application/vnd.github.raw+json', raw: true })).data || 'null'); } catch { /* malformed */ }
    const mName = mk?.name; const plugins = (mk?.plugins || []).map((p) => p?.name).filter(Boolean);
    if (!mName || !NAME_OK.test(mName) || !plugins.length || !plugins.every((p) => NAME_OK.test(p))) blockers.push('the marketplace file is missing, malformed or uses unsafe names');
    else if (plugins.length > 1 && !part) blockers.push(`this marketplace has ${plugins.length} plugins: choose one with --part: ${plugins.join(', ')}`);
    else if (part && !plugins.includes(part)) blockers.push(`no plugin named ${part} (there are: ${plugins.join(', ')})`);
    else {
      const id = `${part || plugins[0]}@${mName}`;
      name = id;
      const known = readJson(path.join(home, '.claude', 'plugins', 'known_marketplaces.json')) || {};
      if (!known[mName]) commands.push(['plugin', 'marketplace', 'add', full, '--scope', scope]);
      else notes.push(`The marketplace ${mName} is already added: Claude Code uses its current checkout, which Tool Scout can't pin.`);
      commands.push(['plugin', 'install', id, '--scope', scope]);
      const file = scope === 'project' ? path.join(cwd, '.claude', 'settings.json') : path.join(home, '.claude', 'settings.json');
      const before = getKey(file, `enabledPlugins.${id}`) ?? null;
      if (before === true) blockers.push(`${id} is already enabled`);
      settings.push({ file, key: `enabledPlugins.${id}`, before, after: true });
      managed.push(path.join(home, '.claude', 'plugins'));
      notes.push(`Claude Code adds the marketplace from the repo's current head. Tool Scout checks it is still ${pinned.slice(0, 7)} right before, and that the checkout is ${pinned.slice(0, 7)} right after; otherwise it undoes the install.`);
      if (blobs.some((t) => /(^|\/)hooks\/hooks\.json$/.test(t.path))) notes.push('This plugin has hooks: commands that run automatically on Claude Code events.');
    }
  } else if (method === 'mcp') {
    const ok = mcp.filter((c) => !c.rejected);
    if (!ok.length) blockers.push('no claude mcp add command Tool Scout can run safely in the README (it would need a shell, or has an unknown option)');
    else {
      const names = [...new Set(ok.map((c) => c.name))];
      if (names.length > 1 && !part) blockers.push(`the README adds ${names.length} servers: choose one with --part: ${names.join(', ')}`);
      else if (part && !names.includes(part)) blockers.push(`no server named ${part} (there are: ${names.join(', ')})`);
      else {
        const c = ok.find((x) => x.name === (part || names[0]));
        name = c.name;
        commands.push(['mcp', 'add', c.name, ...c.opts, '--scope', scope, ...(c.url ? [c.target] : ['--', c.target, ...c.args])]);
        for (const k of c.env) credentials.add(k);
        for (const d of c.dropped) notes.push(`The README sets a ${d}: add it yourself if the server needs it (Tool Scout never handles secrets).`);
        const file = scope === 'project' ? path.join(cwd, '.mcp.json') : path.join(home, '.claude.json');
        if (getKey(file, `mcpServers.${c.name}`) != null) blockers.push(`an MCP server named ${c.name} is already configured`);
        settings.push({ file, key: `mcpServers.${c.name}`, before: null, after: '(set by claude mcp add)' });
        if (!c.url && UNPINNED_RUNNERS.has(path.basename(c.target))) notes.push(`The server runs \`${[c.target, ...c.args].join(' ')}\` each time Claude Code starts it. That package comes from its registry and is not pinned by this commit.`);
        if (c.url) notes.push(`The server is hosted at ${c.target}: Tool Scout only checked this repo, not that service.`);
      }
    }
  }

  const body = {
    v: 1, repo: full, sha: pinned, method, name, part, scope,
    check: check ? { verdict: check.verdict, reasons: check.reasons, line: check.coverage.line, notes: check.coverage.notes, flags: check.flags.map((f) => ({ severity: f.severity, id: f.id, file: f.file, line: f.line ?? null })) } : null,
    writes, commands, settings, managed, credentials: [...credentials].sort(), notes, blockers,
  };
  const id = sha256(JSON.stringify(body)).slice(0, 12);
  const rec = { id, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + PLAN_TTL_MIN * 60e3).toISOString(), body };
  if (save) { fs.mkdirSync(path.join(dataDir, 'plans'), { recursive: true }); fs.writeFileSync(planFile(dataDir, id), JSON.stringify(rec, null, 2)); }
  return rec;
}

export function formatPlan(rec, { home = '' } = {}) {
  const b = rec.body;
  const t = (p) => (home ? tilde(p, home) : p);
  const out = [
    `Install plan ${rec.id} (expires ${rec.expiresAt.slice(11, 16)} UTC, ${PLAN_TTL_MIN} minutes after it was made)`,
    `Repo:      ${b.repo} at commit ${b.sha.slice(0, 7)} (pinned: ${b.sha})`,
    `What:      ${b.method ? `${b.method === 'mcp' ? 'MCP server' : b.method} ${b.name ?? ''}`.trim() : 'nothing supported'}`,
    `Scope:     ${b.scope}`,
  ];
  if (b.check) {
    out.push(`Check:     ${b.check.verdict}${b.check.reasons.length ? ` (${b.check.reasons.join('; ')})` : ''}`, `           ${b.check.line}`);
    for (const n of b.check.notes) out.push(`           ${n}`);
    for (const f of b.check.flags.filter((x) => x.severity !== 'low')) out.push(`           ⚑ ${f.severity.toUpperCase()} ${f.id} (${f.file}${f.line ? `:${f.line}` : ''})`);
  }
  out.push(`Writes:    ${b.writes.length ? `${b.writes.length} file${b.writes.length === 1 ? '' : 's'}` : 'no files directly'}`);
  for (const w of b.writes) out.push(`           ${t(w.path)}`);
  out.push(`Runs:      ${b.commands.length ? '' : 'nothing'}`.trimEnd());
  for (const c of b.commands) out.push(`           claude ${c.join(' ')}`);
  if (b.managed.length) out.push(`           (Claude Code writes its own files under ${b.managed.map(t).join(', ')})`);
  out.push(`Settings:  ${b.settings.length ? '' : 'none'}`.trimEnd());
  for (const s of b.settings) out.push(`           ${t(s.file)}: ${s.key} ${s.before == null ? '(not set)' : JSON.stringify(s.before)} → ${typeof s.after === 'string' ? s.after : JSON.stringify(s.after)}`);
  out.push(`Set yourself: ${b.credentials.length ? b.credentials.join(', ') : 'nothing'}${b.credentials.length ? ' (for example in your shell profile; Tool Scout never asks for, reads or stores them)' : ''}`);
  for (const n of b.notes) out.push(`Note:      ${n}`);
  if (b.blockers.length) { out.push('Blocked:   this plan cannot be installed:'); for (const x of b.blockers) out.push(`           - ${x}`); } else out.push(`To install exactly this: scout.mjs install ${b.repo} --confirm ${rec.id}`);
  return out.join('\n');
}

// ---- install --------------------------------------------------------------------------------------

const loadLog = (dataDir) => readJson(path.join(dataDir, LOG)) || { installs: [] };
const saveLog = (dataDir, log) => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(path.join(dataDir, LOG), JSON.stringify(log, null, 2)); };
function listTree(root) {
  const out = new Set();
  const walk = (d) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); out.add(p); if (e.isDirectory()) walk(p); } };
  if (fs.existsSync(root)) { out.add(root); walk(root); }
  return out;
}

export async function confirmInstall({ client, id, home, cwd, dataDir, now = Date.now(), run = defaultRun }) {
  const rec = /^[0-9a-f]{12}$/.test(String(id)) ? readJson(planFile(dataDir, id)) : null;
  if (!rec) return { ok: false, reason: `unknown plan ID ${id}: make a plan first with --plan` };
  if (now > Date.parse(rec.expiresAt)) return { ok: false, reason: `plan ${id} expired at ${rec.expiresAt.slice(11, 16)} UTC (plans last ${PLAN_TTL_MIN} minutes): make a new plan` };
  const b = rec.body;
  if (b.blockers.length) return { ok: false, reason: `the plan is blocked: ${b.blockers.join('; ')}` };
  const api = `https://api.github.com/repos/${b.repo}`;
  if (b.method === 'plugin') {
    const head = (await client.request(`${api}/commits/HEAD`)).data?.sha;
    if (head !== b.sha) return { ok: false, reason: `the repo moved since the plan (its head is now ${String(head).slice(0, 7)}, the plan pinned ${b.sha.slice(0, 7)}): make a new plan` };
  }
  let fresh;
  try { fresh = await makePlan({ client, repo: b.repo, part: b.part, scope: b.scope, sha: b.sha, home, cwd, dataDir, now: Date.parse(rec.createdAt), save: false }); } catch (e) { return { ok: false, reason: `changed since the plan: ${e.message}` }; }
  if (fresh.id !== id) {
    const diff = Object.keys(b).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(fresh.body[k]));
    return { ok: false, reason: `changed since the plan (${diff.join(', ')}): make a new plan and review it` };
  }

  const entry = { name: b.name, repo: b.repo, sha: b.sha, method: b.method, scope: b.scope, planId: id, at: new Date(now).toISOString(), files: [], dirs: [], settings: [], commands: [], managedNew: [], credentials: b.credentials };
  if (b.method === 'skill') {
    const contents = [];
    for (const w of b.writes) {
      const r = await client.request(`${api}/git/blobs/${w.blob}`);
      const buf = r.data?.encoding === 'base64' ? Buffer.from(r.data.content, 'base64') : null;
      if (!buf || gitBlobSha(buf) !== w.blob) return { ok: false, reason: `${w.rel} does not match its git hash at the pinned commit: nothing was written` };
      contents.push([w, buf]);
    }
    try {
      for (const [w, buf] of contents) {
        for (let d = path.dirname(w.path), missing = []; ; d = path.dirname(d)) {
          if (fs.existsSync(d)) { for (const m of missing.reverse()) { fs.mkdirSync(m); entry.dirs.push(m); } break; }
          missing.push(d);
        }
        fs.writeFileSync(w.path, buf, { flag: 'wx', mode: w.mode === '100755' ? 0o755 : 0o644 });
        entry.files.push({ path: w.path, sha256: sha256(buf) });
      }
    } catch (e) {
      rollbackFiles(entry);
      return { ok: false, reason: `writing failed (${e.message}): everything written was removed` };
    }
  } else {
    const roots = b.managed.map((m) => [m, listTree(m)]);
    for (const s of b.settings) entry.settings.push({ ...s, fileExisted: fs.existsSync(s.file) });
    const fail = (reason) => { undoSteps(entry, b, run); return { ok: false, reason: `${reason}: rolled back` }; };
    try {
      for (const c of b.commands) { run('claude', c); entry.commands.push(c); }
    } catch (e) { return fail(`claude ${(entry.commands.length < b.commands.length ? b.commands[entry.commands.length] : []).join(' ')} failed (${String(e.stderr || e.message).trim().split('\n')[0]})`); }
    for (const [m, before] of roots) for (const p of listTree(m)) if (!before.has(p)) entry.managedNew.push(p);
    if (b.method === 'plugin' && entry.commands.some((c) => c[1] === 'marketplace')) {
      const mName = b.name.split('@')[1];
      const loc = (readJson(path.join(home, '.claude', 'plugins', 'known_marketplaces.json')) || {})[mName]?.installLocation;
      let got = '';
      try { got = String(run('git', ['-C', loc, 'rev-parse', 'HEAD'])).trim(); } catch { /* unreadable */ }
      if (got !== b.sha) return fail(`the marketplace checked out ${got.slice(0, 7) || 'an unknown commit'}, not the pinned ${b.sha.slice(0, 7)}`);
    }
  }
  const log = loadLog(dataDir);
  log.installs.push(entry);
  saveLog(dataDir, log);
  return { ok: true, entry };
}

function rollbackFiles(entry) {
  for (const f of entry.files) { try { fs.unlinkSync(f.path); } catch { /* gone */ } }
  for (const d of [...entry.dirs].reverse()) { try { fs.rmdirSync(d); } catch { /* not empty */ } }
}

/** Undo claude-made changes: inverse commands, settings back to their logged values, new empty leftovers removed. */
function undoSteps(entry, b, run) {
  const kept = [];
  for (const c of [...entry.commands].reverse()) {
    const inv = c[0] === 'mcp' ? ['mcp', 'remove', c[2], '--scope', entry.scope]
      : c[1] === 'install' ? ['plugin', 'uninstall', c[2], '--scope', entry.scope]
        : ['plugin', 'marketplace', 'remove', b.name.split('@')[1], '--scope', entry.scope];
    try { run('claude', inv); } catch { /* already gone */ }
  }
  for (const s of entry.settings) {
    if (s.before !== null && typeof s.after !== 'string' && getKey(s.file, s.key) === s.after) setKey(s.file, s.key, s.before);
    if (!s.fileExisted && fs.existsSync(s.file) && emptyJson(s.file)) fs.unlinkSync(s.file);
  }
  for (const p of [...entry.managedNew].sort((x, y) => y.length - x.length)) {
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (!fs.readdirSync(p).length) fs.rmdirSync(p); else kept.push(p); } else if (emptyJson(p) || !st.size) fs.unlinkSync(p); else kept.push(p);
    } catch { /* already gone */ }
  }
  return kept.filter((p) => fs.existsSync(p));
}

export async function undoInstall({ name, dataDir, run = defaultRun }) {
  const log = loadLog(dataDir);
  const entry = [...log.installs].reverse().find((e) => e.name === name && !e.undoneAt);
  if (!entry) return { ok: false, reason: `nothing installed by Tool Scout is called ${name} (see: scout.mjs installed)` };
  let kept = [];
  if (entry.method === 'skill') {
    for (const f of entry.files) {
      if (!fs.existsSync(f.path)) continue;
      if (sha256(fs.readFileSync(f.path)) === f.sha256) fs.unlinkSync(f.path); else kept.push(f.path);
    }
    for (const d of [...entry.dirs].reverse()) { try { fs.rmdirSync(d); } catch { /* holds kept files */ } }
  } else {
    kept = undoSteps(entry, { name: entry.name }, run);
  }
  entry.undoneAt = new Date().toISOString();
  entry.kept = kept;
  saveLog(dataDir, log);
  return { ok: true, entry, kept };
}

export const listInstalled = (dataDir) => loadLog(dataDir).installs.filter((e) => !e.undoneAt);

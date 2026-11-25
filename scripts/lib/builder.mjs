// Build your own, with consent. Claude writes a draft in its own words into the data folder
// (drafts/<name>/); nothing is ever written straight into ~/.claude or the project. Then:
//   makeBuildPlan   checks the draft (form, trust scan, any source repo's license) and writes NOTHING
//                   outside the data folder (it saves the plan there, under an ID that is a hash of
//                   the plan, for 15 minutes, like install --plan)
//   confirmBuild    re-makes the plan; only if it is identical (same ID), unexpired and not blocked,
//                   writes exactly that and logs it in the same install log, so `undo` works
//   undoBuild       removes exactly what the log says (called by undoInstall)
//
// Nothing in a draft is ever run. Forms: skill, command, subagent, hook, memory.

import fs from 'node:fs';
import path from 'node:path';
import { scanText } from './scan.mjs';
import { normalizeRepo } from './feedback.mjs';
import { PLAN_TTL_MIN, NO_LICENSE, sha256, planFile, tilde, loadLog, saveLog, readJson } from './installer.mjs';

export const FORMS = ['skill', 'command', 'subagent', 'hook', 'memory'];
const BUILD_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_FILES = 50;
const MAX_BYTES = 1_000_000;
const PERMISSIVE = new Set(['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Unlicense', 'CC0-1.0', 'CC-BY-4.0', 'Zlib', 'BSL-1.0']);
const CODE = /\.(?:sh|bash|zsh|mjs|cjs|js|ts|py|rb|pl|ps1)$/i;

export const draftDir = (dataDir, name) => path.join(dataDir, 'drafts', name);

/** What each form's draft folder holds. */
export const EXPECT = {
  skill: ['SKILL.md (frontmatter: name, and a description that says when to use it)', 'any other files the skill needs (templates, references)'],
  command: ['<name>.md (frontmatter: description; the body is the prompt)'],
  subagent: ['<name>.md (frontmatter: name, description; optional tools, model; the body is its system prompt)'],
  hook: ['hook.json ({ "event": "PreToolUse", "matcher": "Bash", "script": "<file>" })', 'the script it names (.sh, .mjs, .js or .py): no network, shown in full in the plan'],
  memory: ['CLAUDE.md (the section to add to CLAUDE.md, without markers: Tool Scout adds them)'],
};

function checkFormName(form, name) {
  if (!FORMS.includes(form)) throw new Error(`--form must be one of ${FORMS.join(', ')}`);
  if (!BUILD_NAME.test(String(name || ''))) throw new Error('--name must be lowercase letters, digits and dashes (up to 64), like pytest-fixtures');
}

/** Make drafts/<name>/ in the data folder for Claude to write into. */
export function startDraft({ dataDir, form, name }) {
  checkFormName(form, name);
  const dir = draftDir(dataDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return { dir, form, name, expect: EXPECT[form].map((x) => x.replace('<name>', name)) };
}

/** Every regular file in the draft folder: [{ rel, buf }], or { error }. Symlinks are refused. */
function readDraft(dir) {
  const files = []; let bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).split(path.sep).join('/');
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) throw new Error(`${rel} is a symlink: drafts hold plain files only`);
      if (st.isDirectory()) { walk(p); continue; }
      if (!st.isFile()) throw new Error(`${rel} is not a plain file`);
      bytes += st.size;
      files.push({ rel, buf: fs.readFileSync(p), mode: st.mode & 0o111 ? '100755' : '100644' });
    }
  };
  try { walk(dir); } catch (e) { return { error: e.message }; }
  if (files.length > MAX_FILES) return { error: `${files.length} files: more than ${MAX_FILES}` };
  if (bytes > MAX_BYTES) return { error: 'more than 1 MB' };
  return { files };
}

// ---- the forms ----------------------------------------------------------------------------------

/** Each form: where its files go, and what must be true of them. Fills writes / blockers / notes. */
const FORM = {
  skill(p, files) {
    if (!files.some((f) => f.rel === 'SKILL.md')) p.blockers.push('a skill draft needs SKILL.md at the top of the draft folder');
    const dest = p.scope === 'project' ? path.join(p.cwd, '.claude', 'skills', p.name) : path.join(p.home, '.claude', 'skills', p.name);
    if (fs.existsSync(dest)) p.blockers.push(`${tilde(dest, p.home)} already exists: Tool Scout never overwrites it`);
    for (const f of files) p.place(f, path.join(dest, ...f.rel.split('/')));
  },
  command(p, files) { single(p, files, `${p.name}.md`, path.join('.claude', 'commands', `${p.name}.md`)); },
  subagent(p, files) { single(p, files, `${p.name}.md`, path.join('.claude', 'agents', `${p.name}.md`)); },
  hook(p) { p.blockers.push('hook drafts are not supported yet'); },
  memory(p) { p.blockers.push('memory drafts are not supported yet'); },
};

/** A form whose draft is exactly one file, copied to <scope root>/<to>. */
function single(p, files, want, to) {
  if (files.length !== 1 || files[0].rel !== want) { p.blockers.push(`a ${p.form} draft is exactly one file, ${want} (found: ${files.map((f) => f.rel).join(', ') || 'nothing'})`); return; }
  const dest = path.join(p.scope === 'project' ? p.cwd : p.home, to);
  if (fs.existsSync(dest)) p.blockers.push(`${tilde(dest, p.home)} already exists: Tool Scout never overwrites it`);
  p.place(files[0], dest);
}

// ---- the source repo a draft was based on -------------------------------------------------------

const norm = (l) => l.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Lines of 50+ characters (normalized) that the draft shares with the source's README and SKILL.md files. */
async function copiedLines(client, repo, texts) {
  const api = `https://api.github.com/repos/${repo}`;
  const tree = (await client.request(`${api}/git/trees/HEAD?recursive=1`)).data?.tree || [];
  const paths = tree.filter((t) => t.type === 'blob' && /(^|\/)SKILL\.md$/i.test(t.path)).map((t) => t.path).slice(0, 5);
  const src = [(await client.request(`${api}/readme`, { accept: 'application/vnd.github.raw+json', raw: true })).data];
  for (const p of paths) src.push((await client.request(`${api}/contents/${p.split('/').map(encodeURIComponent).join('/')}`, { accept: 'application/vnd.github.raw+json', raw: true })).data);
  const theirs = new Set(src.filter((t) => typeof t === 'string').flatMap((t) => t.split('\n').map(norm)).filter((l) => l.length >= 50));
  return texts.flatMap((t) => t.split('\n').map(norm)).filter((l) => theirs.has(l));
}

async function sourceCheck(p, client, source, texts) {
  const repo = normalizeRepo(source);
  if (!repo) { p.blockers.push(`--source is not a GitHub repo: ${source}`); return; }
  if (!client) throw new Error('--source needs GitHub access');
  const meta = (await client.request(`https://api.github.com/repos/${repo}`)).data;
  if (!meta) { p.blockers.push(`--source ${repo}: repo not found`); return; }
  const spdx = meta.license?.spdx_id && meta.license.spdx_id !== 'NOASSERTION' ? meta.license.spdx_id : null;
  p.source = { repo, license: spdx };
  const copied = (await copiedLines(client, repo, texts)).length;
  const attributed = texts.some((t) => t.includes(`github.com/${repo}`) || new RegExp(`\\b${repo.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\b`, 'i').test(t));
  if (!spdx) {
    if (copied) p.blockers.push(`the draft copies text from ${repo}, which has no license: write it in your own words`);
  } else if (PERMISSIVE.has(spdx)) {
    if (copied && !attributed) p.blockers.push(`the draft adapts text from ${repo} (${spdx}): add an attribution line, like "Adapted from https://github.com/${repo} (${spdx})."`);
  } else if (copied) p.blockers.push(`the draft copies text from ${repo}, whose ${spdx} license has conditions: write it in your own words`);
}

// ---- the plan -----------------------------------------------------------------------------------

/**
 * Read-only: the plan for building `form` `name` from the draft folder `from`, with `scope`.
 * `source` (owner/repo) is the repo the idea came from, if any. Saves the plan in the data folder.
 */
export async function makeBuildPlan({ client = null, form, name, from, scope = null, source = null, home, cwd, dataDir, now = Date.now(), save = true }) {
  checkFormName(form, name);
  scope = scope || (form === 'hook' ? 'project' : 'user');
  if (!['user', 'project'].includes(scope)) throw new Error('--scope must be user or project');
  const blockers = []; const notes = []; const writes = [];
  const p = { form, name, scope, home, cwd, blockers, notes, writes, extra: {}, source: null,
    place: (f, dest) => writes.push({ path: dest, rel: f.rel, sha256: sha256(f.buf), size: f.buf.length, mode: f.mode }) };
  const want = draftDir(dataDir, name);
  const real = (d) => { try { return fs.realpathSync(d); } catch { return null; } };
  let files = [];
  if (!from || real(from) !== real(want) || !real(want)) blockers.push(`the draft must be in the data folder, in drafts/${name}/ (${want})`);
  else {
    const d = readDraft(want);
    if (d.error) blockers.push(d.error);
    else if (!d.files.length) blockers.push(`drafts/${name}/ is empty`);
    else files = d.files;
  }
  if (files.length) FORM[form](p, files);

  // Trust scan of everything in the draft: nothing above low, and no network call or pipe-to-shell.
  const scanned = files.map((f) => f.rel);
  const flags = files.flatMap((f) => scanText(f.buf.toString('utf8'), { file: f.rel, role: CODE.test(f.rel) ? 'script' : 'skill' }));
  const bad = flags.filter((f) => f.severity !== 'low' || f.id === 'pipe-to-shell' || f.id === 'network-call');
  if (bad.length) blockers.push(`the trust scan flagged ${[...new Set(bad.map((f) => f.id))].join(', ')}: a draft must have nothing above low, and no network call or pipe-to-shell`);
  if (source && files.length) await sourceCheck(p, client, source, files.map((f) => f.buf.toString('utf8')));

  const body = {
    v: 1, kind: 'build', form, name, scope, from: want, source: p.source,
    writes, ...p.extra,
    scan: { line: `Checked ${scanned.length} file${scanned.length === 1 ? '' : 's'}: ${scanned.join(', ') || 'none'}`, flags: flags.map(({ excerpt, ...f }) => f) },
    notes, blockers,
  };
  const id = sha256(JSON.stringify(body)).slice(0, 12);
  const rec = { id, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + PLAN_TTL_MIN * 60e3).toISOString(), body, ...(source ? { source } : {}) };
  if (save) { fs.mkdirSync(path.join(dataDir, 'plans'), { recursive: true }); fs.writeFileSync(planFile(dataDir, id), JSON.stringify(rec, null, 2)); }
  return rec;
}

export function formatBuildPlan(rec, { home = '' } = {}) {
  const b = rec.body;
  const t = (x) => (home ? tilde(x, home) : x);
  const out = [
    `Build plan ${rec.id} (expires ${rec.expiresAt.slice(11, 16)} UTC, ${PLAN_TTL_MIN} minutes after it was made)`,
    `What:      ${b.form} ${b.name} (from Claude's draft; nothing in it is run)`,
    `Scope:     ${b.scope}`,
    `Draft:     ${t(b.from)}`,
    `Writes:    ${b.writes.length ? `${b.writes.length} file${b.writes.length === 1 ? '' : 's'}` : 'no files directly'}`,
    ...b.writes.map((w) => `           ${t(w.path)}`),
  ];
  out.push(`Scan:      ${b.scan.line}`);
  const shown = b.scan.flags.filter((f) => f.severity !== 'low' || ['pipe-to-shell', 'network-call'].includes(f.id));
  out.push(shown.length ? shown.map((f) => `           ⚑ ${f.severity.toUpperCase()} ${f.id}: ${f.detail} (${f.file}${f.line ? `:${f.line}` : ''})`).join('\n') : '           flags: none above low');
  if (b.source) {
    out.push(b.source.license
      ? `Source:    ${b.source.repo} (${b.source.license})${PERMISSIVE.has(b.source.license) ? ': adapting is allowed with the attribution line.' : ': its license has conditions, so the draft is in its own words.'}`
      : `Source:    ${b.source.repo}. ${NO_LICENSE} The draft is in Claude's own words; nothing was copied.`);
  }
  for (const n of b.notes) out.push(`Note:      ${n}`);
  if (b.blockers.length) { out.push('Blocked:   this plan cannot be built:'); for (const x of b.blockers) out.push(`           - ${x}`); } else out.push(`To build exactly this: scout.mjs build --confirm ${rec.id}`);
  return out.join('\n');
}

// ---- build ----------------------------------------------------------------------------------------

/** Write one planned file from the draft, creating (and logging) missing folders; never overwrite. */
function writeFile(entry, w, buf) {
  for (let d = path.dirname(w.path), missing = []; ; d = path.dirname(d)) {
    if (fs.existsSync(d)) { for (const m of missing.reverse()) { fs.mkdirSync(m); entry.dirs.push(m); } break; }
    missing.push(d);
  }
  fs.writeFileSync(w.path, buf, { flag: 'wx', mode: w.mode === '100755' ? 0o755 : 0o644 });
  entry.files.push({ path: w.path, sha256: sha256(buf) });
}

export async function confirmBuild({ client = null, id, home, cwd, dataDir, now = Date.now() }) {
  const rec = /^[0-9a-f]{12}$/.test(String(id)) ? readJson(planFile(dataDir, id)) : null;
  if (!rec || rec.body?.kind !== 'build') return { ok: false, reason: `unknown plan ID ${id}: make a plan first with build … --plan` };
  if (now > Date.parse(rec.expiresAt)) return { ok: false, reason: `plan ${id} expired at ${rec.expiresAt.slice(11, 16)} UTC (plans last ${PLAN_TTL_MIN} minutes): make a new plan` };
  const b = rec.body;
  if (b.blockers.length) return { ok: false, reason: `the plan is blocked: ${b.blockers.join('; ')}` };
  let fresh;
  try { fresh = await makeBuildPlan({ client, form: b.form, name: b.name, from: b.from, scope: b.scope, source: rec.source || null, home, cwd, dataDir, now: Date.parse(rec.createdAt), save: false }); } catch (e) {
    return { ok: false, reason: `could not re-check the plan (${e.message}): nothing was written` };
  }
  if (fresh.id !== id) {
    const diff = Object.keys(b).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(fresh.body[k]));
    return { ok: false, reason: `changed since the plan (${diff.join(', ')}): make a new plan and review it` };
  }
  const entry = { name: b.name, method: 'build', form: b.form, scope: b.scope, repo: null, sha: null, source: b.source, planId: id, at: new Date(now).toISOString(), files: [], dirs: [], settings: [], commands: [], credentials: [] };
  try {
    for (const w of b.writes) {
      const buf = fs.readFileSync(path.join(b.from, ...w.rel.split('/')));
      if (sha256(buf) !== w.sha256) throw new Error(`${w.rel} changed since the plan`);
      writeFile(entry, w, buf);
    }
  } catch (e) {
    undoBuild(entry);
    return { ok: false, reason: `writing failed (${e.message}): everything written was removed` };
  }
  const log = loadLog(dataDir);
  log.installs.push(entry);
  saveLog(dataDir, log);
  return { ok: true, entry };
}

/** Remove exactly what a build wrote. Files changed since are left in place and returned. */
export function undoBuild(entry) {
  const kept = [];
  for (const f of entry.files) {
    if (!fs.existsSync(f.path)) continue;
    if (sha256(fs.readFileSync(f.path)) === f.sha256) fs.unlinkSync(f.path); else kept.push(f.path);
  }
  for (const d of [...entry.dirs].reverse()) { try { fs.rmdirSync(d); } catch { /* holds kept files */ } }
  return kept;
}

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
import crypto from 'node:crypto';
import path from 'node:path';
import { scanText } from './scan.mjs';
import { normalizeRepo } from './feedback.mjs';
import { PLAN_TTL_MIN, NO_LICENSE, sha256, planFile, planIntact, planId, planExpiry, expiredReason, dropPlan, fencePlan, tilde, loadLog, saveLog, readJson, writeJsonStyled } from './installer.mjs';
import { currentVersion, replaceFiles, restoreReplaced, supersede, replaceLine } from './replace.mjs';

export const FORMS = ['skill', 'command', 'subagent', 'hook', 'memory'];
const BUILD_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_FILES = 50;
const MAX_BYTES = 1_000_000;
const PERMISSIVE = new Set(['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Unlicense', 'CC0-1.0', 'CC-BY-4.0', 'Zlib', 'BSL-1.0']);
const CODE = /\.(?:sh|bash|zsh|mjs|cjs|js|ts|py|rb|pl|ps1)$/i;
export const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'SessionStart', 'SessionEnd', 'PreCompact'];
const RUNNERS = { sh: 'bash', mjs: 'node', js: 'node', py: 'python3' };
// A hook runs on every matching event without asking: its script may not touch the network at all.
const NETWORK = /\b(?:curl|wget|nc|ncat|netcat|telnet|ssh|scp|sftp|rsync|ftp|socat|dig|nslookup)\b|https?:\/\/|\bfetch\s*\(|XMLHttpRequest|WebSocket|\b(?:urllib|requests|httpx|aiohttp|http\.client|socket)\b|\b(?:node:)?(?:http|https|net|dgram|dns|tls)['"]|\bnet\.connect|Invoke-WebRequest|Invoke-RestMethod|\/dev\/(?:tcp|udp)\//i;
const WHEN = /\b(?:use (?:it |this(?: \w+)? |me )?(?:when|whenever|for|if|to)|when (?:the user|you|asked|a |an )|whenever)\b/i;
const MARK = (side, name) => `<!-- tool-scout:${side} ${name} -->`;

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
export function startDraft({ dataDir, form, name, fresh = false }) {
  checkFormName(form, name);
  const dir = draftDir(dataDir, name);
  if (fs.existsSync(dir)) {
    if (fresh) fs.rmSync(dir, { recursive: true, force: true });
    else if (fs.readdirSync(dir).length) throw new Error(`drafts/${name}/ already exists with files from an earlier run (${dir}). Tool Scout won't reuse it silently: pass --fresh to clear it and start over, or pick another --name.`);
  }
  fs.mkdirSync(dir, { recursive: true });
  return { dir, form, name, expect: EXPECT[form].map((x) => x.replace('<name>', name)) };
}

/** Every regular file in the draft folder: [{ rel, buf }], or { error }. Symlinks are refused. */
function readDraft(dir) {
  const files = []; let bytes = 0; let newest = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).split(path.sep).join('/');
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) throw new Error(`${rel} is a symlink: drafts hold plain files only`);
      if (st.isDirectory()) { walk(p); continue; }
      if (!st.isFile()) throw new Error(`${rel} is not a plain file`);
      bytes += st.size;
      newest = Math.max(newest, st.mtimeMs);
      files.push({ rel, buf: fs.readFileSync(p), mode: st.mode & 0o111 ? '100755' : '100644' });
    }
  };
  try { walk(dir); } catch (e) { return { error: e.message }; }
  if (files.length > MAX_FILES) return { error: `${files.length} files: more than ${MAX_FILES}` };
  if (bytes > MAX_BYTES) return { error: 'more than 1 MB' };
  return { files, written: newest ? new Date(newest).toISOString() : null };
}

/** YAML-ish frontmatter: `key: value` lines, folded (`>` / `|`) and indented continuations. */
export function frontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return null;
  const data = {}; let last = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) { last = kv[1]; data[last] = /^[>|][+-]?$/.test(kv[2].trim()) ? '' : kv[2].trim().replace(/^(['"])(.*)\1$/, '$2'); continue; }
    if (last && /^\s/.test(line)) { data[last] = `${data[last]} ${line.trim()}`.trim(); continue; }
    return { error: `"${line.slice(0, 40)}" is not a "key: value" line` };
  }
  return { data, body: String(text).slice(m[0].length) };
}

/** The frontmatter checks a skill, subagent or command file needs. */
function checkMeta(p, f, { needName, needWhen }) {
  const fm = frontmatter(f.buf.toString('utf8'));
  if (!fm) { p.blockers.push(`${f.rel} needs frontmatter (between --- lines): it needs a description${needName ? ' and its name' : ''}`); return null; }
  if (fm.error) { p.blockers.push(`${f.rel}: its frontmatter is not valid: ${fm.error}`); return null; }
  if (needName && fm.data.name !== p.name) p.blockers.push(`name: ${fm.data.name || '(missing)'} must match the folder, ${p.name} (in ${f.rel}'s frontmatter)`);
  if (!fm.data.description) p.blockers.push(`${f.rel} needs a description in its frontmatter`);
  else if (needWhen && !WHEN.test(fm.data.description)) p.blockers.push(`${f.rel}: the description must say when to use it (for example "Use when the user asks for …")`);
  return fm;
}

// ---- the forms ----------------------------------------------------------------------------------

/** Each form: where its files go, and what must be true of them. Fills writes / blockers / notes. */
const FORM = {
  skill(p, files) {
    const main = files.find((f) => f.rel === 'SKILL.md');
    if (!main) p.blockers.push('a skill draft needs SKILL.md at the top of the draft folder');
    else checkMeta(p, main, { needName: true, needWhen: true });
    const dest = p.scope === 'project' ? path.join(p.cwd, '.claude', 'skills', p.name) : path.join(p.home, '.claude', 'skills', p.name);
    p.existing(dest);
    for (const f of files) p.place(f, path.join(dest, ...f.rel.split('/')));
  },
  command(p, files) {
    const f = single(p, files, `${p.name}.md`, path.join('.claude', 'commands', `${p.name}.md`));
    const fm = f && checkMeta(p, f, { needName: false, needWhen: false });
    if (fm && !fm.body.trim()) p.blockers.push(`${f.rel} needs the prompt in its body, below the frontmatter`);
  },
  subagent(p, files) {
    const f = single(p, files, `${p.name}.md`, path.join('.claude', 'agents', `${p.name}.md`));
    const fm = f && checkMeta(p, f, { needName: true, needWhen: false });
    if (fm && !fm.body.trim()) p.blockers.push(`${f.rel} needs the subagent's system prompt in its body`);
  },
  memory(p, files) {
    if (files.length !== 1 || files[0].rel !== 'CLAUDE.md') { p.blockers.push(`a memory draft is exactly one file, CLAUDE.md (found: ${files.map((f) => f.rel).join(', ')})`); return; }
    const text = files[0].buf.toString('utf8').replace(/\r\n/g, '\n');
    if (!text.trim()) { p.blockers.push('CLAUDE.md is empty'); return; }
    if (/tool-scout:(?:begin|end)\b/.test(text)) p.blockers.push('the draft must not contain tool-scout:begin / tool-scout:end markers: Tool Scout adds them');
    if (text.split('\n').length > 200) p.blockers.push('a memory section is at most 200 lines');
    const file = p.scope === 'project' ? path.join(p.cwd, 'CLAUDE.md') : path.join(p.home, '.claude', 'CLAUDE.md');
    if (fs.existsSync(file) && !fs.statSync(file).isFile()) p.blockers.push(`${tilde(file, p.home)} is not a file`);
    else if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(MARK('begin', p.name))) {
      const old = sectionIn(fs.readFileSync(file, 'utf8'), p.name);
      if (!p.replace) p.blockers.push(`${tilde(file, p.home)} already has a ${p.name} section (to change it, plan with --replace)`);
      else if (!old) p.blockers.push(`${tilde(file, p.home)}: its ${p.name} section is not exactly one begin/end pair: Tool Scout won't change it`);
      else p.extra.replace = { root: file, files: [], section: old };
    } else if (p.replace) p.extra.replace = { root: file, files: [] };
    p.extra.memory = { file, section: `${MARK('begin', p.name)}\n${text.trimEnd()}\n${MARK('end', p.name)}\n` };
  },
  hook(p, files) {
    if (p.replace) { p.blockers.push('--replace is for skills, commands, subagents and memory: for a hook, undo the old one first'); return; }
    const spec = files.find((f) => f.rel === 'hook.json');
    if (!spec) { p.blockers.push('a hook draft needs hook.json: { "event": …, "matcher": …, "script": … }'); return; }
    let h; try { h = JSON.parse(spec.buf.toString('utf8')); } catch { p.blockers.push('hook.json is not valid JSON'); return; }
    if (!HOOK_EVENTS.includes(h?.event)) { p.blockers.push(`the hook's event must be one of ${HOOK_EVENTS.join(', ')}`); return; }
    if (h.matcher != null && (typeof h.matcher !== 'string' || h.matcher.length > 200 || /[\u0000-\u001f\u007f]/.test(h.matcher))) { p.blockers.push('the matcher must be a short string'); return; }
    const script = files.find((f) => f.rel === h.script);
    const ext = String(h.script || '').match(/^[\w.-]+\.(sh|mjs|js|py)$/)?.[1];
    if (!ext || !script) { p.blockers.push(`hook.json names ${h.script || 'no script'}: it must be a .sh, .mjs, .js or .py file in the draft folder`); return; }
    if (files.length !== 2) p.blockers.push(`a hook draft is hook.json and its script only (found: ${files.map((f) => f.rel).join(', ')})`);
    const text = script.buf.toString('utf8');
    text.split('\n').forEach((l, i) => { if (NETWORK.test(l)) p.blockers.push(`the hook script must not use the network (${script.rel}:${i + 1})`); });
    // personal: the script lives outside the project (~/.claude/hooks), the entry in its settings.local.json.
    const dir = p.scope === 'project' ? path.join(p.cwd, '.claude', 'hooks', p.name) : path.join(p.home, '.claude', 'hooks', p.name);
    const dest = path.join(dir, script.rel);
    const quoted = hookCommandPath(dest);
    if (quoted == null) { p.blockers.push(`the hook's path ${dest} has characters a command can't quote safely`); return; }
    if (fs.existsSync(dir)) p.blockers.push(`${tilde(dir, p.home)} already exists: Tool Scout never overwrites it`);
    const command = `${RUNNERS[ext]} "${p.scope === 'project' ? `$CLAUDE_PROJECT_DIR/.claude/hooks/${p.name}/${script.rel}` : quoted}"`;
    const file = p.scope === 'project' ? path.join(p.cwd, '.claude', 'settings.json') : p.scope === 'personal' ? path.join(p.cwd, '.claude', 'settings.local.json') : path.join(p.home, '.claude', 'settings.json');
    if (fs.existsSync(file) && !readJson(file)) p.blockers.push(`${tilde(file, p.home)} is not valid JSON: Tool Scout won't change it`);
    if (JSON.stringify(readJson(file)?.hooks || {}).includes(JSON.stringify(command).slice(1, -1))) p.blockers.push('that hook command is already in the settings');
    p.place(script, dest);
    p.extra.hook = { event: h.event, matcher: h.matcher || null, file, entry: { ...(h.matcher ? { matcher: h.matcher } : {}), hooks: [{ type: 'command', command }] }, script: script.rel, scriptText: text };
  },
};

/**
 * A script path as it goes inside the double quotes of a hook command, or null when a double-quoted
 * shell string can't hold it. On Windows the backslashes become forward slashes (C:/Users/...), which
 * Git Bash and node both accept; on other systems a backslash would be eaten by the shell, so it is refused.
 */
export function hookCommandPath(dest, platform = process.platform) {
  const p = platform === 'win32' ? String(dest).replace(/\\/g, '/') : String(dest);
  return /["$`\\]/.test(p) ? null : p;
}

/** The marked section `name` in a CLAUDE.md text (begin marker through end marker and its newline), or null. */
function sectionIn(raw, name) {
  const a = raw.indexOf(MARK('begin', name)); const e = MARK('end', name);
  const b = raw.indexOf(e, a);
  if (a < 0 || b < 0 || raw.indexOf(MARK('begin', name), a + 1) >= 0 || raw.indexOf(e, b + 1) >= 0) return null;
  return raw.slice(a, b + e.length + (raw[b + e.length] === '\n' ? 1 : 0));
}

/** A form whose draft is exactly one file, copied to <scope root>/<to>. */
function single(p, files, want, to) {
  if (files.length !== 1 || files[0].rel !== want) { p.blockers.push(`a ${p.form} draft is exactly one file, ${want} (found: ${files.map((f) => f.rel).join(', ') || 'nothing'})`); return; }
  const dest = path.join(p.scope === 'project' ? p.cwd : p.home, to);
  p.existing(dest);
  p.place(files[0], dest);
  return files[0];
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
export async function makeBuildPlan({ client = null, form, name, from, scope = null, source = null, home, cwd, dataDir, now = Date.now(), save = true, replace = false }) {
  checkFormName(form, name);
  scope = scope || 'project'; // v0.17: anything that writes defaults to this project; user scope is only ever asked for
  if (!['user', 'project', 'personal'].includes(scope)) throw new Error('--scope must be user, project or personal');
  if (scope === 'personal' && form !== 'hook') throw new Error('the personal scope is for hooks (this project, only you): use user or project');
  const blockers = []; const notes = []; const writes = [];
  if (scope === 'user') notes.push('User scope: this goes into your home folder (~/.claude), so it applies in every project, not just this one, and you asked for it explicitly (--scope user).');
  const p = { form, name, scope, home, cwd, blockers, notes, writes, extra: {}, source: null, replace,
    place: (f, dest) => writes.push({ path: dest, rel: f.rel, sha256: sha256(f.buf), size: f.buf.length, mode: f.mode }),
    // Where the item goes: free, or (with --replace) its current version, swapped in one step.
    existing: (dest) => {
      if (replace) { const cur = currentVersion(dest); if (cur.error) blockers.push(cur.error); else p.extra.replace = cur; } else if (fs.existsSync(dest)) blockers.push(`${tilde(dest, home)} already exists: Tool Scout never overwrites it (to swap it for this draft, plan with --replace)`);
    } };
  const want = draftDir(dataDir, name);
  const real = (d) => { try { return fs.realpathSync(d); } catch { return null; } };
  let files = []; let written = null;
  if (!from || real(from) !== real(want) || !real(want)) blockers.push(`the draft must be in the data folder, in drafts/${name}/ (${want})`);
  else {
    const d = readDraft(want);
    if (d.error) blockers.push(d.error);
    else if (!d.files.length) blockers.push(`drafts/${name}/ is empty`);
    else { files = d.files; written = d.written; }
  }
  if (files.length) FORM[form](p, files);

  // Trust scan of everything in the draft: nothing above low, and no network call or pipe-to-shell.
  const scanned = files.map((f) => f.rel);
  const flags = files.flatMap((f) => scanText(f.buf.toString('utf8'), { file: f.rel, role: CODE.test(f.rel) ? 'script' : 'skill' }));
  const bad = flags.filter((f) => f.severity !== 'low' || f.id === 'pipe-to-shell' || f.id === 'network-call');
  if (bad.length) blockers.push(`the trust scan flagged ${[...new Set(bad.map((f) => f.id))].join(', ')}: a draft must have nothing above low, and no network call or pipe-to-shell`);
  if (source && files.length) await sourceCheck(p, client, source, files.map((f) => f.buf.toString('utf8')));

  const body = {
    v: 1, kind: 'build', form, name, scope, from: want, draftWritten: written, source: p.source,
    writes, ...p.extra,
    scan: { line: `Checked ${scanned.length} file${scanned.length === 1 ? '' : 's'}: ${scanned.join(', ') || 'none'}`, flags: flags.map(({ excerpt, ...f }) => f) },
    notes, blockers,
  };
  const createdAt = new Date(now).toISOString();
  const id = planId(createdAt, body);
  const rec = { id, createdAt, expiresAt: new Date(now + PLAN_TTL_MIN * 60e3).toISOString(), body, ...(source ? { source } : {}) };
  if (save) { fs.mkdirSync(path.join(dataDir, 'plans'), { recursive: true }); fs.writeFileSync(planFile(dataDir, id), JSON.stringify(rec, null, 2)); }
  return rec;
}

function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60e3));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `${d} days`;
}

export function formatBuildPlan(rec, { home = '' } = {}) {
  const b = rec.body;
  const t = (x) => (home ? tilde(x, home) : x);
  const out = [
    `Build plan ${rec.id} (expires ${rec.expiresAt.slice(11, 16)} UTC, ${PLAN_TTL_MIN} minutes after it was made)`,
    `What:      ${b.form} ${b.name} (from Claude's draft; nothing in it is run)`,
    `Scope:     ${b.scope === 'personal' ? 'personal (this project, only you)' : b.scope}`,
    `Draft:     ${t(b.from)}`,
    ...(b.draftWritten ? [`Written:   draft files last written ${b.draftWritten.slice(0, 10)} ${b.draftWritten.slice(11, 16)} UTC (${ago(Date.parse(rec.createdAt) - Date.parse(b.draftWritten))} before this plan)`] : []),
    `Writes:    ${b.writes.length ? `${b.writes.length} file${b.writes.length === 1 ? '' : 's'}` : 'no files directly'}`,
    ...b.writes.map((w) => `           ${t(w.path)}`),
  ];
  if (b.replace) out.push(b.memory ? (b.replace.section ? `Replaces:  the ${b.name} section in ${t(b.replace.root)}, in place; undo puts the current text back` : `Replaces:  nothing (${t(b.replace.root)} has no ${b.name} section yet)`) : replaceLine(b.replace, t));
  if (b.memory) {
    out.push(`Memory:    adds a section to ${t(b.memory.file)}, between ${MARK('begin', b.name)} and ${MARK('end', b.name)}; undo removes exactly that section`);
    for (const l of b.memory.section.trimEnd().split('\n')) out.push(`           | ${l}`);
  }
  if (b.hook) {
    out.push(`Hook:      ${b.hook.event}${b.hook.matcher ? ` [${b.hook.matcher}]` : ' (every time)'}: runs ${b.hook.entry.hooks[0].command}`);
    out.push(`Settings:  ${t(b.hook.file)}: adds that entry to hooks.${b.hook.event}`);
    out.push(`Script:    ${b.hook.script}, in full (it runs automatically, without asking, on every matching event):`);
    for (const l of b.hook.scriptText.trimEnd().split('\n')) out.push(`           | ${l}`);
  }
  out.push(`Scan:      ${b.scan.line}`);
  const shown = b.scan.flags.filter((f) => f.severity !== 'low' || ['pipe-to-shell', 'network-call'].includes(f.id));
  out.push(...(shown.length ? shown.map((f) => `           ⚑ ${f.severity.toUpperCase()} ${f.id}: ${f.detail} (${f.file}${f.line ? `:${f.line}` : ''})`) : ['           flags: none above low']));
  if (b.source) {
    out.push(b.source.license
      ? `Source:    ${b.source.repo} (${b.source.license})${PERMISSIVE.has(b.source.license) ? ': adapting is allowed with the attribution line.' : ': its license has conditions, so the draft is in its own words.'}`
      : `Source:    ${b.source.repo}. ${NO_LICENSE} The draft is in Claude's own words; nothing was copied.`);
  }
  for (const n of b.notes) out.push(`Note:      ${n}`);
  const after = [];
  if (b.blockers.length) { out.push('Blocked:   this plan cannot be built:'); for (const x of b.blockers) out.push(`           - ${x}`); } else {
    after.push(`To build exactly this: scout.mjs build --confirm ${rec.id}`);
    if (b.hook) after.push('Then, because it is a hook, a second, separate confirmation: scout.mjs build --confirm-hook <the ID the first confirmation prints>');
  }
  return fencePlan(rec.id, out, after);
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

const readPlan = (dataDir, id) => (/^[0-9a-f]{12}$/.test(String(id)) ? readJson(planFile(dataDir, id)) : null);

/**
 * Build exactly the plan. A hook needs two separate calls: the first (hook: false, the plan's ID)
 * writes nothing but a hook-confirm record, whose own ID (bound to it, with a random nonce) it
 * prints; the second (hook: true, that ID, after showing the script again) builds it. So the second
 * can't be given without the first having run: no flag in the plan file stands for the first yes.
 */
export async function confirmBuild({ client = null, id, home, cwd, dataDir, now = Date.now(), hook = false }) {
  const given = id;
  let rec = readPlan(dataDir, id);
  if (hook) {
    if (rec?.body?.kind === 'build') return { ok: false, reason: rec.body.hook ? `first confirm the plan with --confirm ${id}: it prints the ID that --confirm-hook takes (not the plan's)` : `plan ${id} is not a hook: use --confirm` };
    if (rec?.body?.kind !== 'hook-confirm' || !planIntact(rec, id)) return { ok: false, reason: `unknown hook confirmation ${id}: first confirm the plan with build --confirm <planId>, which prints the ID for --confirm-hook` };
    id = rec.body.of;
    rec = readPlan(dataDir, id);
  }
  if (!rec || rec.body?.kind !== 'build') return { ok: false, reason: `unknown plan ID ${id}: make a plan first with build … --plan` };
  if (!planIntact(rec, id)) return { ok: false, reason: `plan ${id} changed since the plan was made (its file was edited): make a new plan and review it` };
  if (now > planExpiry(rec)) { dropPlan(dataDir, id); dropPlan(dataDir, given); return { ok: false, reason: expiredReason(rec, id) }; }
  const b = rec.body;
  if (b.blockers.length) return { ok: false, reason: `the plan is blocked: ${b.blockers.join('; ')}` };
  let fresh;
  try { fresh = await makeBuildPlan({ client, form: b.form, name: b.name, from: b.from, scope: b.scope, source: rec.source || null, home, cwd, dataDir, now: Date.parse(rec.createdAt), save: false, replace: !!b.replace }); } catch (e) {
    return { ok: false, reason: `could not re-check the plan (${e.message}): nothing was written` };
  }
  if (fresh.id !== id) {
    const diff = Object.keys(b).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(fresh.body[k]));
    return { ok: false, reason: `changed since the plan (${diff.join(', ')}): make a new plan and review it` };
  }
  if (b.hook && !hook) {
    const hb = { kind: 'hook-confirm', of: id, nonce: crypto.randomBytes(16).toString('hex') };
    const createdAt = new Date(now).toISOString(); const hookId = planId(createdAt, hb);
    fs.writeFileSync(planFile(dataDir, hookId), JSON.stringify({ id: hookId, createdAt, body: hb }, null, 2));
    return { ok: false, pending: 'hook', hookId, reason: `first confirmation recorded; nothing was written. A hook runs automatically on every ${b.hook.event}${b.hook.matcher ? ` [${b.hook.matcher}]` : ''} event, so it needs a second, separate confirmation: build --confirm-hook ${hookId}` };
  }
  const entry = { name: b.name, method: 'build', form: b.form, scope: b.scope, repo: null, sha: null, source: b.source, planId: id, at: new Date(now).toISOString(), files: [], dirs: [], settings: [], commands: [], credentials: [] };
  try {
    const bufs = b.writes.map((w) => {
      const buf = fs.readFileSync(path.join(b.from, ...w.rel.split('/')));
      if (sha256(buf) !== w.sha256) throw new Error(`${w.rel} changed since the plan`);
      return [w, buf];
    });
    if (b.replace && !b.memory) replaceFiles(entry, b.replace, bufs.map(([w, buf]) => ({ path: w.path, buf, mode: w.mode === '100755' ? 0o755 : 0o644 })), { dataDir, id });
    else for (const [w, buf] of bufs) writeFile(entry, w, buf);
    if (b.memory && b.replace?.section) replaceSection(entry, b.memory, b.replace.section);
    else if (b.memory) addSection(entry, b.memory);
    if (b.hook) addHook(entry, b.hook);
  } catch (e) {
    undoBuild(entry);
    return { ok: false, reason: `writing failed (${e.message}): everything written was removed` };
  }
  const log = loadLog(dataDir);
  if (b.replace) supersede(log, entry);
  log.installs.push(entry);
  saveLog(dataDir, log);
  return { ok: true, entry };
}

/** Swap the marked section's text in place (where it is in the file); the log keeps both texts. */
function replaceSection(entry, m, old) {
  const raw = fs.readFileSync(m.file, 'utf8');
  const at = raw.indexOf(old);
  if (at < 0 || raw.indexOf(old, at + 1) >= 0) throw new Error(`the ${entry.name} section in ${m.file} changed since the plan`);
  fs.writeFileSync(m.file, raw.slice(0, at) + m.section + raw.slice(at + old.length));
  entry.memory = { file: m.file, replaced: { old, now: m.section } };
}

function mkdirs(entry, d) {
  const missing = [];
  for (; !fs.existsSync(d); d = path.dirname(d)) missing.push(d);
  for (const m of missing.reverse()) { fs.mkdirSync(m); entry.dirs.push(m); }
}

/** Append the marked section to CLAUDE.md; the log keeps the exact text added. */
function addSection(entry, m) {
  const fileExisted = fs.existsSync(m.file);
  const raw = fileExisted ? fs.readFileSync(m.file, 'utf8') : '';
  const added = (!raw || raw.endsWith('\n\n') ? '' : raw.endsWith('\n') ? '\n' : '\n\n') + m.section;
  mkdirs(entry, path.dirname(m.file));
  fs.writeFileSync(m.file, raw + added);
  entry.memory = { file: m.file, added, fileExisted };
}

// ---- settings.json edited as text, so undo gives back the user's exact bytes ---------------------

/** Where each value is in a JSON text: { type, start, end, members: [{ key, value }] | items }. */
function locate(raw) {
  let i = 0;
  const ws = () => { while (/\s/.test(raw[i] || '')) i++; };
  const str = () => { const a = i++; while (raw[i] !== '"') { if (raw[i] === '\\') i++; i++; if (i > raw.length) throw new Error('bad string'); } i++; return { type: 'string', start: a, end: i, value: JSON.parse(raw.slice(a, i)) }; };
  const value = () => {
    ws();
    const a = i;
    if (raw[i] === '{') {
      i++; const members = []; ws();
      if (raw[i] === '}') { i++; return { type: 'object', start: a, end: i, members }; }
      for (;;) { ws(); const k = str(); ws(); if (raw[i++] !== ':') throw new Error('bad object'); const v = value(); members.push({ key: k.value, value: v }); ws(); const c = raw[i++]; if (c === '}') break; if (c !== ',') throw new Error('bad object'); }
      return { type: 'object', start: a, end: i, members };
    }
    if (raw[i] === '[') {
      i++; const items = []; ws();
      if (raw[i] === ']') { i++; return { type: 'array', start: a, end: i, items }; }
      for (;;) { items.push(value()); ws(); const c = raw[i++]; if (c === ']') break; if (c !== ',') throw new Error('bad array'); }
      return { type: 'array', start: a, end: i, items };
    }
    if (raw[i] === '"') return str();
    while (i < raw.length && !/[\s,\]}]/.test(raw[i])) i++;
    return { type: 'literal', start: a, end: i };
  };
  const v = value(); ws();
  if (i !== raw.length) throw new Error('trailing text');
  return v;
}

/**
 * The text to insert into settings.json so hooks.<event> gains `item`, as { at, text }: removing
 * exactly `text` later gives back the file byte for byte. Null when the file has a shape we don't edit.
 */
function hookInsertion(raw, event, item) {
  let root; try { root = locate(raw); } catch { return null; }
  if (root.type !== 'object') return null;
  const unit = raw.match(/\n([ \t]+)"/)?.[1] ?? '  ';
  const fmt = (v, depth) => JSON.stringify(v, null, unit).split('\n').join(`\n${unit.repeat(depth)}`);
  // After the last value of a container (before its closing bracket): ",<newline><indent>text".
  const append = (node, depth, text) => {
    const list = node.members || node.items;
    if (!list.length) return { at: node.start + 1, text: `\n${unit.repeat(depth)}${text}\n${unit.repeat(depth - 1)}` };
    const last = list.at(-1).value || list.at(-1);
    return { at: last.end, text: `,\n${unit.repeat(depth)}${text}` };
  };
  const hooks = root.members.find((m) => m.key === 'hooks')?.value;
  if (!hooks) return append(root, 1, `"hooks": ${fmt({ [event]: [item] }, 1)}`);
  if (hooks.type !== 'object') return null;
  const list = hooks.members.find((m) => m.key === event)?.value;
  if (!list) return append(hooks, 2, `${JSON.stringify(event)}: ${fmt([item], 2)}`);
  if (list.type !== 'array') return null;
  return append(list, 3, fmt(item, 3));
}

/** Add the hook entry to hooks.<event> in settings.json as a text insertion the log keeps. */
function addHook(entry, h) {
  const fileExisted = fs.existsSync(h.file);
  if (fileExisted && !readJson(h.file)) throw new Error(`${h.file} is not valid JSON`);
  mkdirs(entry, path.dirname(h.file));
  const raw = fileExisted ? fs.readFileSync(h.file, 'utf8') : '';
  const ins = fileExisted ? hookInsertion(raw, h.event, h.entry) : { at: 0, text: `${JSON.stringify({ hooks: { [h.event]: [h.entry] } }, null, 2)}\n` };
  const o = readJson(h.file) || {};
  const hooksExisted = o.hooks !== undefined; const eventExisted = o.hooks?.[h.event] !== undefined;
  if (ins) fs.writeFileSync(h.file, raw.slice(0, ins.at) + ins.text + raw.slice(ins.at));
  else { o.hooks = { ...(o.hooks || {}), [h.event]: [...(o.hooks?.[h.event] || []), h.entry] }; writeJsonStyled(h.file, o); }
  entry.hook = { file: h.file, event: h.event, entry: h.entry, fileExisted, hooksExisted, eventExisted, ...(ins ? { inserted: ins.text } : {}) };
}

/** Remove exactly what a build wrote. Files changed since are left in place and returned. */
export function undoBuild(entry) {
  const kept = [];
  const h = entry.hook;
  const raw = h && fs.existsSync(h.file) ? fs.readFileSync(h.file, 'utf8') : null;
  const at = h?.inserted && raw != null ? raw.indexOf(h.inserted) : -1;
  if (h && at >= 0 && raw.indexOf(h.inserted, at + 1) < 0) {
    // Exactly the text the build inserted comes out: the user's file is back byte for byte.
    const rest = raw.slice(0, at) + raw.slice(at + h.inserted.length);
    if (!h.fileExisted && !rest.trim()) fs.unlinkSync(h.file); else fs.writeFileSync(h.file, rest);
  } else if (h) {
    const o = readJson(h.file);
    const list = o?.hooks?.[h.event];
    const i = Array.isArray(list) ? list.findIndex((x) => JSON.stringify(x) === JSON.stringify(h.entry)) : -1;
    if (i < 0) kept.push(`${h.file} (the hook entry was changed or removed since)`);
    else {
      list.splice(i, 1);
      if (!list.length && !h.eventExisted) delete o.hooks[h.event];
      if (!Object.keys(o.hooks).length && !h.hooksExisted) delete o.hooks;
      if (!h.fileExisted && !Object.keys(o).length) fs.unlinkSync(h.file); else writeJsonStyled(h.file, o);
    }
  }
  if (entry.memory?.replaced) {
    const { file, replaced: r } = entry.memory;
    const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const at = raw.indexOf(r.now);
    if (at < 0 || raw.indexOf(r.now, at + 1) >= 0) kept.push(`${file} (the section was changed since)`);
    else fs.writeFileSync(file, raw.slice(0, at) + r.old + raw.slice(at + r.now.length));
  } else if (entry.memory) {
    const m = entry.memory;
    const raw = fs.existsSync(m.file) ? fs.readFileSync(m.file, 'utf8') : null;
    const at = raw == null ? -1 : raw.lastIndexOf(m.added);
    if (at < 0) { if (raw != null) kept.push(`${m.file} (the section was changed since)`); } else {
      const rest = raw.slice(0, at) + raw.slice(at + m.added.length);
      if (!m.fileExisted && !rest) fs.unlinkSync(m.file); else fs.writeFileSync(m.file, rest);
    }
  }
  if (entry.replaced) return [...kept, ...restoreReplaced(entry)]; // a --replace: the previous version comes back
  for (const f of entry.files) {
    if (!fs.existsSync(f.path)) continue;
    if (sha256(fs.readFileSync(f.path)) === f.sha256) fs.unlinkSync(f.path); else kept.push(f.path);
  }
  for (const d of [...entry.dirs].reverse()) { try { fs.rmdirSync(d); } catch { /* holds kept files */ } }
  return kept;
}

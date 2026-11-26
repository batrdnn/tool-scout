// Local audit of what the user already has installed: personal skills (~/.claude/skills),
// installed plugin folders (~/.claude/plugins), MCP server commands (~/.claude.json and
// project .mcp.json files), and hooks (~/.claude/settings.json, ~/.claude/settings.local.json
// and each project's .claude/settings.json, plus any script file a hook runs). Files are read from disk and run through the same rules as the
// content scan. No network at all: this module never creates a GitHub client.
//
// Output keeps file:line and the rule's detail only, never excerpts: MCP args, hook commands
// and local scripts can contain tokens. Hooks are listed by event and matcher, never by command.

import fs from 'node:fs';
import path from 'node:path';
import { scanText, pickFiles, explainedHostsOf } from './scan.mjs';
import { sessionProjectDirs, projectExcluded } from './installed.mjs';

const MAX_BYTES = 300_000;
const MAX_ENTRIES = 3000;
const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build']);
const NOT_SHIPPED = /(^|\/)(tests?|__tests__|fixtures?|testdata|examples?|samples?|evals?)\//i;
const CODE = /\.(sh|bash|zsh|ps1|py|js|mjs|cjs|ts)$/i;
const SEV = { high: 3, medium: 2, low: 1 };

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** Local stand-in for a GitHub tree: [{ path, type: 'blob', size }] relative to `root`. */
function localTree(root) {
  const out = [];
  const walk = (dir, rel, depth) => {
    if (depth > 6 || out.length >= MAX_ENTRIES) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (isDir(abs)) walk(abs, r, depth + 1);
      else { try { out.push({ path: r, type: 'blob', size: fs.statSync(abs).size }); } catch { /* unreadable */ } }
    }
  };
  walk(root, '', 0);
  return out;
}

/** Scan an installed skill or plugin folder: README, picked files, and code files (max 20). */
function scanFolder(root) {
  const tree = localTree(root);
  const read = (p) => { try { const f = path.join(root, p); return fs.statSync(f).size <= MAX_BYTES ? fs.readFileSync(f, 'utf8') : null; } catch { return null; } };
  const readmePath = tree.find((t) => /^readme(\.md)?$/i.test(t.path))?.path;
  const readme = readmePath ? read(readmePath) : null;
  const explained = explainedHostsOf(readme);
  const files = new Map(pickFiles(tree).map((f) => [f.path, f.role]));
  for (const t of tree) {
    if (files.size >= 28) break;
    if (CODE.test(t.path) && !NOT_SHIPPED.test(t.path) && !files.has(t.path)) files.set(t.path, 'script');
  }
  const flags = readme ? scanText(readme, { file: readmePath, role: 'readme', explainedHosts: explained }) : [];
  for (const [p, role] of files) {
    const text = read(p);
    if (text != null) flags.push(...scanText(text, { file: p, role, explainedHosts: explained }));
  }
  return flags;
}

function mcpSources(home, cwd) {
  const out = [];
  const cj = readJSON(path.join(home, '.claude.json')) || {};
  const add = (servers, where) => { for (const [name, cfg] of Object.entries(servers || {})) out.push({ name, cfg, where }); };
  add(cj.mcpServers, '~/.claude.json');
  for (const [proj, p] of Object.entries(cj.projects || {})) add(p?.mcpServers, `~/.claude.json (project ${path.basename(proj)})`);
  const seen = new Set();
  for (const dir of [cwd, ...Object.keys(cj.projects || {})].filter(Boolean)) {
    const f = path.resolve(dir, '.mcp.json');
    let real = f;
    try { real = fs.realpathSync(f); } catch { continue; } // missing file; also /var vs /private/var
    if (seen.has(real)) continue;
    seen.add(real);
    add(readJSON(f)?.mcpServers, `${path.basename(path.dirname(f))}/.mcp.json`);
  }
  return out;
}

function installedPlugins(home) {
  const base = path.join(home, '.claude', 'plugins');
  const found = new Map();
  const ip = readJSON(path.join(base, 'installed_plugins.json'));
  for (const [key, val] of Object.entries(ip?.plugins || {})) {
    for (const inst of Array.isArray(val) ? val : [val]) if (inst?.installPath && isDir(inst.installPath)) found.set(path.resolve(inst.installPath), key.split('@')[0]);
  }
  // Fallback: plugins/cache/<marketplace>/<plugin>/<version>
  const cache = path.join(base, 'cache');
  if (isDir(cache)) {
    for (const mk of fs.readdirSync(cache)) for (const pl of (isDir(path.join(cache, mk)) ? fs.readdirSync(path.join(cache, mk)) : [])) {
      const pdir = path.join(cache, mk, pl);
      for (const v of (isDir(pdir) ? fs.readdirSync(pdir) : [])) if (isDir(path.join(pdir, v)) && !found.has(path.resolve(pdir, v))) found.set(path.resolve(pdir, v), pl);
    }
  }
  return [...found].map(([dir, name]) => ({ dir, name }));
}

/** Project folders to look in: the cwd, every session cwd, and the projects in ~/.claude.json. */
function projectDirs(home, cwd, excludeProjects = []) {
  const cj = readJSON(path.join(home, '.claude.json')) || {};
  const out = new Map();
  for (const d of [cwd, ...sessionProjectDirs(home, 3650, excludeProjects), ...Object.keys(cj.projects || {})].filter(Boolean)) {
    if (projectExcluded(d, excludeProjects)) continue;
    let real;
    try { real = fs.realpathSync(d); } catch { continue; }
    if (real !== fs.realpathSync(home) && !out.has(real)) out.set(real, d);
  }
  return [...out.values()];
}

/**
 * The script file a hook command runs, if it names one that exists: { abs, shown } or null. `shown` is
 * relative to the project, or ~/..., always with forward slashes. A command may mix "/" and "\" (a
 * Windows path in a hook is written C:/Users/...), so the path is normalized before it is compared.
 */
export function hookScript(command, { home, projectDir, pathApi = path, stat = fs.statSync }) {
  const posix = (p) => p.split(pathApi.sep).join('/');
  const expand = (t) => t
    .replace(/^["']|["']$/g, '')
    .replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, projectDir || '\0')
    .replace(/^~(?=\/)/, home)
    .replace(/["']/g, '');
  for (const raw of command.split(/\s+/)) {
    const t = expand(raw);
    if (!t || t.includes('\0') || t.startsWith('-') || /\$/.test(t) || !/[\/.]/.test(t)) continue;
    const abs = pathApi.isAbsolute(t) ? pathApi.normalize(t) : projectDir ? pathApi.join(projectDir, t) : null;
    if (!abs) continue;
    try { if (!stat(abs).isFile() || stat(abs).size > MAX_BYTES) continue; } catch { continue; }
    const shown = projectDir && abs.startsWith(pathApi.normalize(projectDir) + pathApi.sep) ? posix(pathApi.relative(projectDir, abs))
      : abs.startsWith(pathApi.normalize(home) + pathApi.sep) ? `~${posix(abs.slice(pathApi.normalize(home).length))}` : abs;
    return { abs, shown };
  }
  return null;
}

/** Every hook in the user, local and project settings files. */
function hookSources(home, cwd, excludeProjects = []) {
  const files = [
    { file: path.join(home, '.claude', 'settings.json'), where: '~/.claude/settings.json', projectDir: null },
    { file: path.join(home, '.claude', 'settings.local.json'), where: '~/.claude/settings.local.json', projectDir: null },
    ...projectDirs(home, cwd, excludeProjects).map((d) => ({ file: path.join(d, '.claude', 'settings.json'), where: `${path.basename(d)}/.claude/settings.json`, projectDir: d })),
  ];
  const out = [];
  for (const { file, where, projectDir } of files) {
    const hooks = readJSON(file)?.hooks;
    if (!hooks || typeof hooks !== 'object') continue;
    for (const [event, groups] of Object.entries(hooks)) {
      for (const g of Array.isArray(groups) ? groups : []) {
        const matcher = typeof g?.matcher === 'string' && g.matcher ? g.matcher.slice(0, 80) : undefined;
        for (const h of Array.isArray(g?.hooks) ? g.hooks : []) {
          const text = typeof h?.command === 'string' ? h.command : typeof h?.prompt === 'string' ? h.prompt : null;
          if (text) out.push({ event, matcher, where, projectDir, kind: h.command ? 'command' : 'prompt', text });
        }
      }
    }
  }
  return out;
}

const keep = (flags) => flags.filter((f) => SEV[f.severity] >= 2).map(({ excerpt, ...f }) => f)
  .sort((a, b) => SEV[b.severity] - SEV[a.severity]);

/** { checked: { skills, plugins, mcpServers }, counts: { high, medium, low }, findings: [...] } */
export function auditLocal({ home, cwd = process.cwd(), excludeProjects = [] }) {
  const findings = [];
  const counts = { high: 0, medium: 0, low: 0 };
  const record = (type, name, where, flags, extra = {}) => {
    for (const f of flags) counts[f.severity] = (counts[f.severity] || 0) + 1;
    const k = keep(flags);
    if (k.length) findings.push({ type, name, ...extra, where, flags: k });
  };

  const skillsDir = path.join(home, '.claude', 'skills');
  const skills = (() => { try { return fs.readdirSync(skillsDir).filter((d) => isDir(path.join(skillsDir, d))); } catch { return []; } })();
  for (const s of skills) record('skill', s, `~/.claude/skills/${s}`, scanFolder(path.join(skillsDir, s)));

  const plugins = installedPlugins(home);
  for (const p of plugins) record('plugin', p.name, p.dir.replace(home, '~'), scanFolder(p.dir));

  const servers = mcpSources(home, cwd);
  for (const { name, cfg, where } of servers) {
    const line = [cfg?.command, ...(Array.isArray(cfg?.args) ? cfg.args : [])].filter((x) => typeof x === 'string').join(' ');
    record('mcp', name, where, line ? scanText(line, { file: `${where}#${name}`, role: 'config' }) : []);
  }

  // Hooks: the command (or prompt) and any script it runs go through the same rules. The
  // label is event + matcher; the command itself never leaves this function.
  const hooks = [];
  for (const h of hookSources(home, cwd, excludeProjects)) {
    const label = `${h.event}${h.matcher ? ` [${h.matcher}]` : ''}`;
    const flags = scanText(h.text, { file: `${h.where}#${label}`, role: h.kind === 'prompt' ? 'skill' : 'script' });
    const script = h.kind === 'command' ? hookScript(h.text, { home, projectDir: h.projectDir }) : null;
    if (script) {
      const body = (() => { try { return fs.readFileSync(script.abs, 'utf8'); } catch { return null; } })();
      if (body != null) flags.push(...scanText(body, { file: script.shown, role: 'script' }));
    }
    for (const f of flags) f.line = f.file.includes('#') ? undefined : f.line; // a command's "line" is meaningless
    record('hook', h.event, h.where, flags, h.matcher ? { matcher: h.matcher } : {});
    hooks.push({ event: h.event, ...(h.matcher ? { matcher: h.matcher } : {}), where: h.where, kind: h.kind,
      ...(script ? { script: script.shown } : {}), flagged: keep(flags).length });
  }

  findings.sort((a, b) => SEV[b.flags[0].severity] - SEV[a.flags[0].severity]);
  return { checked: { skills: skills.length, plugins: plugins.length, mcpServers: servers.length, hooks: hooks.length }, counts, findings, hooks };
}

export function formatAudit(r) {
  const lines = [`Checked ${r.checked.skills} personal skills, ${r.checked.plugins} installed plugins, ${r.checked.mcpServers} MCP server commands and ${r.checked.hooks ?? 0} hooks.`,
    `Flags: ${r.counts.high} high, ${r.counts.medium} medium, ${r.counts.low} low (low ones are not listed).`];
  if (!r.findings.length) lines.push('Nothing medium or high.');
  for (const f of r.findings) {
    lines.push(`\n${f.type} ${f.name}${f.matcher ? ` [${f.matcher}]` : ''}  (${f.where})`);
    for (const x of f.flags) lines.push(`  ⚑ ${x.severity.toUpperCase()} ${x.id}: ${x.detail} (${x.file}${x.line ? `:${x.line}` : ''})`);
  }
  if (r.hooks?.length) {
    lines.push('\nHooks (event [matcher], where; commands are not shown):');
    for (const h of r.hooks) lines.push(`  ${h.event}${h.matcher ? ` [${h.matcher}]` : ''}  ${h.where}${h.script ? `, runs ${h.script}` : ''}${h.kind === 'prompt' ? ' (prompt hook)' : ''}  ${h.flagged ? `⚑ ${h.flagged} flag${h.flagged > 1 ? 's' : ''}` : 'no medium/high flags'}`);
  }
  lines.push('\nNo network was used: everything was read from local files. No flags does not mean safe.');
  return lines.join('\n');
}

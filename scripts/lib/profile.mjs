// Builds a local, counts-only profile of how the user works in Claude Code.
// Reads ~/.claude/projects/**/*.jsonl (session transcripts) plus installed skills,
// plugins and MCP servers. Never stores prompt text, file paths or command arguments.

import fs from 'node:fs';
import path from 'node:path';
import { topicsIn, toolKeywordsIn, toolForCommand, EXT_HINTS, FILENAME_HINTS, COMMAND_HINTS } from './taxonomy.mjs';

const FRICTION_RE = /\b(still (not|doesn'?t|broken|failing)|doesn'?t work|not working|same error|again|keeps? (failing|breaking)|why (is|does) (it|this)|wrong)\b/i;

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function listSessionFiles(projectsDir, sinceMs) {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { return out; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = path.join(projectsDir, d.name);
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(dir, f);
      try {
        if (fs.statSync(full).mtimeMs >= sinceMs) out.push({ file: full, project: d.name });
      } catch { /* ignore */ }
    }
  }
  return out;
}

function textOfUserMessage(msg) {
  const c = msg?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((b) => b?.type === 'text').map((b) => b.text || '').join('\n');
  return '';
}

/** "git rebase -i HEAD~3 && npm test" -> ["git rebase", "npm test"] */
export function commandHeads(cmd) {
  if (typeof cmd !== 'string') return [];
  const heads = [];
  for (const seg of cmd.split(/&&|\|\||;|\||\n/)) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    while (toks.length && /^[A-Z_][A-Z0-9_]*=/.test(toks[0])) toks.shift(); // FOO=bar cmd
    if (toks[0] === 'sudo' || toks[0] === 'npx' || toks[0] === 'uv' || toks[0] === 'uvx') toks.shift();
    if (!toks.length) continue;
    const bin = path.basename(toks[0]);
    if (!/^[\w.-]+$/.test(bin)) continue;
    const sub = toks[1] && /^[a-z][a-z-]{1,20}$/.test(toks[1]) ? ` ${toks[1]}` : '';
    heads.push(bin + sub);
  }
  return heads;
}

function hintsForPath(p) {
  const topics = new Set();
  let lang = null;
  if (typeof p !== 'string') return { topics, lang };
  const h = EXT_HINTS[path.extname(p).toLowerCase()];
  if (h) { lang = h.lang || null; (h.topics || []).forEach((t) => topics.add(t)); }
  for (const [re, ts] of FILENAME_HINTS) if (re.test(p)) ts.forEach((t) => topics.add(t));
  return { topics, lang };
}

/** The working directory a session ran in (its transcript's first `cwd`), or null. */
function sessionCwd(file) {
  let head = '';
  try { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(65536); head = b.toString('utf8', 0, fs.readSync(fd, b, 0, b.length, 0)); fs.closeSync(fd); } catch { return null; }
  const m = head.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) { try { return JSON.parse(`"${m[1]}"`); } catch { /* malformed */ } }
  return null;
}

/**
 * Does project { dir (encoded folder under ~/.claude/projects), cwd } match a user-given name?
 * Accepts a folder name ("tool-scout"), a trailing part of the path ("Downloads/tool-scout"),
 * the full path, or the encoded folder name. Without a cwd, falls back to the encoded name.
 */
export function projectMatches({ dir, cwd } = {}, name) {
  const n = String(name || '').trim().replace(/[\\/]+$/, '');
  if (!n) return false;
  if (n === dir) return true;
  if (cwd) {
    const c = cwd.replace(/[\\/]+$/, '').replace(/\\/g, '/');
    const want = n.replace(/\\/g, '/');
    if (want.startsWith('/') || /^[a-z]:\//i.test(want)) return c.toLowerCase() === want.toLowerCase();
    if (want.startsWith('~/')) return c.endsWith(want.slice(1));
    return c === want || c.endsWith(`/${want}`);
  }
  const enc = n.replace(/[^A-Za-z0-9]/g, '-').replace(/^-+/, '');
  return !!enc && (dir === `-${enc}` || dir.endsWith(`-${enc}`));
}

/** Parse one session transcript into per-session signals. */
export function analyzeSession(file) {
  const s = { topics: new Set(), friction: new Set(), toolKeywords: new Set(), langs: {}, tools: {}, commands: {}, mcpServers: new Set(), prompts: 0 };
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return s; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const msg = e.message;
    if (e.type === 'user' && msg?.role === 'user' && !e.isMeta) {
      const text = textOfUserMessage(msg);
      if (!text || text.startsWith('<') || text.startsWith('Caveat:')) continue;
      s.prompts++;
      const ts = topicsIn(text);
      ts.forEach((t) => s.topics.add(t));
      toolKeywordsIn(text).forEach((k) => s.toolKeywords.add(k));
      if (FRICTION_RE.test(text)) ts.forEach((t) => s.friction.add(t));
    } else if (e.type === 'assistant' && Array.isArray(msg?.content)) {
      for (const b of msg.content) {
        if (b?.type !== 'tool_use') continue;
        const name = String(b.name || 'unknown');
        const m = name.match(/^mcp__([^_]+(?:_[^_]+)*?)__/);
        const toolKey = m ? `mcp:${m[1]}` : name;
        s.tools[toolKey] = (s.tools[toolKey] || 0) + 1;
        if (m) s.mcpServers.add(m[1]);
        const input = b.input || {};
        if (name === 'Bash' && input.command) {
          for (const h of commandHeads(input.command)) {
            s.commands[h] = (s.commands[h] || 0) + 1;
            (COMMAND_HINTS[h.split(' ')[0]] || []).forEach((t) => s.topics.add(t));
            const kw = toolForCommand(h);
            if (kw) s.toolKeywords.add(kw);
          }
        }
        const p = input.file_path || input.notebook_path || input.path;
        if (p) {
          const { topics, lang } = hintsForPath(p);
          topics.forEach((t) => s.topics.add(t));
          if (lang) s.langs[lang] = (s.langs[lang] || 0) + 1;
        }
      }
    }
  }
  return s;
}

function normName(n) {
  return String(n || '').toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/(^|[-_.])(mcp|server|skills?|plugins?|claude|code|agent)(?=$|[-_.])/g, '$1')
    .replace(/[^a-z0-9]/g, '');
}
export { normName };

/** Find skills, plugins, marketplaces and MCP servers the user already has. */
export function detectInstalled(home, cwd = process.cwd()) {
  const names = new Set();
  const repos = new Set();
  const add = (n) => { if (n) names.add(String(n)); };
  const claudeDir = path.join(home, '.claude');

  // Personal skills
  try { for (const d of fs.readdirSync(path.join(claudeDir, 'skills'))) add(d); } catch { /* none */ }

  // Plugins + marketplaces
  const ip = readJSON(path.join(claudeDir, 'plugins', 'installed_plugins.json'));
  const pluginMap = ip?.plugins || ip || {};
  for (const k of Object.keys(pluginMap)) { if (k !== 'version') add(k.split('@')[0]); }
  const km = readJSON(path.join(claudeDir, 'plugins', 'known_marketplaces.json')) || {};
  for (const [k, v] of Object.entries(km)) {
    add(k);
    const repo = v?.source?.repo || v?.source?.url || '';
    const m = String(repo).match(/([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
    if (m) repos.add(m[1].toLowerCase());
  }
  const settings = readJSON(path.join(claudeDir, 'settings.json')) || {};
  for (const k of Object.keys(settings.enabledPlugins || {})) add(k.split('@')[0]);

  // MCP servers: ~/.claude.json (user + per-project) and project .mcp.json
  const addServers = (obj) => {
    for (const [n, cfg] of Object.entries(obj || {})) {
      add(n);
      for (const a of [...(cfg?.args || []), cfg?.command, cfg?.url]) {
        if (typeof a !== 'string') continue;
        const gh = a.match(/github\.com\/([\w.-]+\/[\w.-]+)/i);
        if (gh) repos.add(gh[1].replace(/\.git$/, '').toLowerCase());
        if (/^@?[\w.-]+(\/[\w.-]+)?(@[\w.^~-]+)?$/.test(a) && !a.startsWith('-')) add(a.replace(/@[\w.^~-]+$/, ''));
      }
    }
  };
  const cj = readJSON(path.join(home, '.claude.json')) || {};
  addServers(cj.mcpServers);
  for (const p of Object.values(cj.projects || {})) addServers(p?.mcpServers);
  addServers(readJSON(path.join(cwd, '.mcp.json'))?.mcpServers);

  return { names: [...names].sort(), repos: [...repos].sort() };
}

/**
 * Build the full profile. Only aggregate counts are kept.
 * The session we're running inside (CLAUDE_CODE_SESSION_ID) is skipped by default: it's the
 * scout request itself, not the user's work, and during development it can dominate.
 */
export function buildProfile({ home, days = 30, cwd, excludeSessions = [process.env.CLAUDE_CODE_SESSION_ID].filter(Boolean), excludeProjects = [] } = {}) {
  const since = Date.now() - days * 86400e3;
  const skip = new Set(excludeSessions.map((id) => `${id}.jsonl`));
  const all = listSessionFiles(path.join(home, '.claude', 'projects'), since);
  const afterSessions = all.filter(({ file }) => !skip.has(path.basename(file)));
  const excludedCurrent = all.length - afterSessions.length;
  // Projects the user asked to leave out (e.g. while developing this plugin). Decided per
  // session from its own cwd: a project folder can hold sessions started elsewhere.
  const names = excludeProjects.filter(Boolean);
  const dropped = new Set(); // project keys (cwd, else folder) left out, for the count only
  const files = names.length ? afterSessions.filter(({ file, project }) => {
    const proj = { dir: project, cwd: sessionCwd(file) };
    if (!names.some((n) => projectMatches(proj, n))) return true;
    dropped.add(proj.cwd || project);
    return false;
  }) : afterSessions;
  const excludedProjectSessions = afterSessions.length - files.length;
  const topicSessions = {}, frictionSessions = {}, toolKw = {}, langs = {}, tools = {}, cmdCount = {}, cmdSessions = {};
  const usedMcp = new Set();
  const projects = new Set();
  let prompts = 0, sessions = 0;

  for (const { file, project } of files) {
    const s = analyzeSession(file);
    if (!s.prompts && !Object.keys(s.tools).length) continue;
    sessions++; prompts += s.prompts; projects.add(project);
    s.topics.forEach((t) => (topicSessions[t] = (topicSessions[t] || 0) + 1));
    s.friction.forEach((t) => (frictionSessions[t] = (frictionSessions[t] || 0) + 1));
    s.toolKeywords.forEach((k) => (toolKw[k] = (toolKw[k] || 0) + 1));
    for (const [k, v] of Object.entries(s.langs)) langs[k] = (langs[k] || 0) + v;
    for (const [k, v] of Object.entries(s.tools)) tools[k] = (tools[k] || 0) + v;
    for (const [k, v] of Object.entries(s.commands)) {
      cmdCount[k] = (cmdCount[k] || 0) + v;
      cmdSessions[k] = (cmdSessions[k] || 0) + 1;
    }
    s.mcpServers.forEach((m) => usedMcp.add(m));
  }

  // Commands run by hand across several sessions = candidates for automation.
  const repeatedCommands = Object.entries(cmdCount)
    .filter(([k]) => cmdSessions[k] >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([command, count]) => ({ command, count, sessions: cmdSessions[command] }));

  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
  const installed = detectInstalled(home, cwd);
  usedMcp.forEach((m) => installed.names.includes(m) || installed.names.push(m));

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    sessions, prompts, projects: projects.size, excludedCurrentSession: excludedCurrent > 0,
    // Counts only: which projects were left out stays in settings, not in the profile.
    excludedProjects: dropped.size, excludedProjectSessions,
    topics: sortObj(topicSessions),
    friction: sortObj(frictionSessions),
    // Sessions mentioning each fixed-vocabulary tool name (pytest, prisma, kubernetes, ...).
    toolKeywords: sortObj(toolKw),
    languages: sortObj(langs),
    tools: sortObj(tools),
    repeatedCommands,
    installed,
  };
}

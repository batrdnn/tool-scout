// Project-level installs: skills, plugins and MCP servers set up inside a project folder
// rather than for the user. For every project folder recorded in the session transcripts
// (each session's cwd) it reads .claude/skills/*, .claude/settings.json (enabledPlugins) and
// .mcp.json. Local reads only. Project paths never go into the profile, only the names found.
//
// Kept separate from profile.mjs (under the ranking freeze); scout.mjs merges the result into
// profile.installed, which ranking already uses to skip what the user has.

import fs from 'node:fs';
import path from 'node:path';

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** A transcript's first `cwd`, read from its first 64 KB. */
function sessionCwd(file) {
  let head = '';
  try { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(65536); head = b.toString('utf8', 0, fs.readSync(fd, b, 0, b.length, 0)); fs.closeSync(fd); } catch { return null; }
  const m = head.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) { try { return JSON.parse(`"${m[1]}"`); } catch { /* malformed */ } }
  return null;
}

/** Distinct session cwds from transcripts modified in the last `days` days. */
export function sessionProjectDirs(home, days = 30) {
  const root = path.join(home, '.claude', 'projects');
  const since = Date.now() - days * 86400e3;
  const dirs = new Set();
  let projects = [];
  try { projects = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  for (const d of projects) {
    if (!d.isDirectory()) continue;
    let files = [];
    try { files = fs.readdirSync(path.join(root, d.name)); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(root, d.name, f);
      try { if (fs.statSync(full).mtimeMs < since) continue; } catch { continue; }
      const cwd = sessionCwd(full);
      if (cwd) dirs.add(cwd);
    }
  }
  return [...dirs];
}

/** Names and GitHub repos installed in these project folders: { names, repos }. */
export function detectProjectInstalls(dirs) {
  const names = new Set();
  const repos = new Set();
  const add = (n) => { if (n) names.add(String(n)); };
  for (const dir of dirs) {
    try {
      for (const e of fs.readdirSync(path.join(dir, '.claude', 'skills'), { withFileTypes: true })) if (e.isDirectory() || e.isSymbolicLink()) add(e.name);
    } catch { /* none */ }
    const settings = readJSON(path.join(dir, '.claude', 'settings.json')) || {};
    for (const [k, on] of Object.entries(settings.enabledPlugins || {})) {
      if (on === false) continue;
      const [plugin, market] = k.split('@');
      add(plugin); add(market);
    }
    // Like the user-level detection: server name, package names in args, and github.com
    // repos in the command, args or url. The bare command (npx, uvx, node) isn't a name.
    for (const [n, cfg] of Object.entries(readJSON(path.join(dir, '.mcp.json'))?.mcpServers || {})) {
      add(n);
      for (const a of [...(Array.isArray(cfg?.args) ? cfg.args : []), cfg?.command, cfg?.url]) {
        if (typeof a !== 'string') continue;
        const gh = a.match(/github\.com\/([\w.-]+\/[\w.-]+)/i);
        if (gh) repos.add(gh[1].replace(/\.git$/, '').toLowerCase());
        if (a !== cfg.command && /^@?[\w.-]+(\/[\w.-]+)?(@[\w.^~-]+)?$/.test(a) && !a.startsWith('-')) add(a.replace(/@[\w.^~-]+$/, ''));
      }
    }
  }
  return { names: [...names].sort(), repos: [...repos].sort() };
}

/** The profile with project-level installs merged into `installed` (a new object). */
export function withProjectInstalls(profile, { home, days = 30 }) {
  const found = detectProjectInstalls(sessionProjectDirs(home, days));
  const cur = profile.installed || { names: [], repos: [] };
  return { ...profile, installed: {
    names: [...new Set([...(cur.names || []), ...found.names])].sort(),
    repos: [...new Set([...(cur.repos || []), ...found.repos])].sort(),
  } };
}

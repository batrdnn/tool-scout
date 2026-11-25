// Install hints: pull the real Claude Code install command out of a repo's README.
// The hints are display only: Tool Scout never runs them. The text is untrusted, so anything that
// chains commands or hides characters is rejected instead of shown. installMethod says whether
// Tool Scout's own installer (installer.mjs, a plan first) supports the repo.
//
// Only Claude Code commands count: `claude mcp add`, `/plugin marketplace add`,
// `/plugin install` (or their `claude plugin …` CLI forms), and a copy/clone into
// ~/.claude/skills. Any line aimed at another agent (Codex, Cursor, Gemini, …) is rejected.
// When there is no such command, the caller links to the README instead of guessing.

export const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const basename = (p) => String(p).split(/[\\/]/).pop();

const SKILLS_DIR = String.raw`(?:~|\$HOME|\$\{HOME\})\/\.claude\/skills\b`;
const PATTERNS = [
  { re: /(?:^|[\s`$>])((?:\/plugin\s+marketplace\s+add|claude\s+plugin\s+marketplace\s+add)\s+\S[^\n`]*)/gi, type: 'marketplace', kinds: { plugin: 6, skill: 4 } },
  { re: /(?:^|[\s`$>])((?:\/plugin\s+install|claude\s+plugin\s+install)\s+\S[^\n`]*)/gi, type: 'plugin-install', kinds: { plugin: 5, skill: 3 } },
  { re: /(?:^|[\s`$>])(claude\s+mcp\s+add(?:-json)?\s+\S[^\n`]*)/gi, type: 'mcp-add', kinds: { 'mcp-server': 6, plugin: 2, skill: 2, tool: 2 } },
  { re: new RegExp(String.raw`(?:^|[\s\`$>])((?:git\s+clone|cp|ln|rsync)\s[^\n\`]*${SKILLS_DIR}[^\n\`]*)`, 'gi'), type: 'skills-dir', kinds: { skill: 6, plugin: 2 } },
];
const CHAINING = /[;|&`<>]|\$\(|\\\s*$/; // <> also rules out redirects; placeholders like <name> are rejected too
const INVISIBLE = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;
// Other coding agents. A line *targets* one when it names it as the agent, the target, a
// config dir, or runs its own CLI. (A Gemini or Cursor *tool* added to Claude is fine.)
const AGENTS = 'codex|cursor|gemini|gemini-cli|windsurf|cline|roo|roo-code|opencode|copilot|github-copilot|continue|kiro|goose|amp|zed|aider|trae|qwen|augment|kilo|junie';
const OTHER_AGENT = new RegExp(String.raw`(?:--(?:agent|agents|target|client|ide|editor|tool)[=\s]+|\s-a\s+)["']?(?!claude)(?:${AGENTS})\b|(?:^|[\s/~"'])\.(?:${AGENTS})\/|^\s*(?:\$\s*)?(?:${AGENTS})\s+(?:mcp|extensions?|plugins?|skills?)\b|\b(?:${AGENTS}):\/\/`, 'im');

function sanitize(cmd) {
  let c = cmd.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().replace(/[.,:;]+$/, '');
  // "(… or run cp -r x ~/.claude/skills/)": the closing parenthesis belongs to the prose.
  while (c.endsWith(')') && (c.match(/\)/g) || []).length > (c.match(/\(/g) || []).length) c = c.slice(0, -1).trimEnd();
  if (!c || c.length > 200 || CHAINING.test(c)) return null;
  return c;
}

function codeRanges(text) {
  return [...text.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g)].map((m) => [m.index, m.index + m[0].length]);
}

/**
 * Install hint for `repo` ({ full_name, name, kind }) from README text:
 * { commands: [] | [cmd] | [marketplace add, plugin install], note? }.
 */
export function extractInstallHint(readme, repo, { marketplacePlugins = 0 } = {}) {
  if (!readme) return { commands: [] };
  const code = codeRanges(readme);
  const inCode = (i) => code.some(([a, b]) => i >= a && i < b);
  const owner = String(repo.full_name || '').split('/')[0].toLowerCase();
  const name = String(repo.name || '').toLowerCase();
  const lineStart = (i) => readme.lastIndexOf('\n', i) + 1;
  const lineText = (i) => { const a = lineStart(i); const b = readme.indexOf('\n', i); return readme.slice(a, b < 0 ? readme.length : b); };
  // A line that fails sanitizing, or targets another agent, is unsafe as a whole: no fragments from it.
  const unsafeLines = new Set();
  for (const p of PATTERNS) {
    for (const m of readme.matchAll(p.re)) {
      const at = m.index + m[0].indexOf(m[1]);
      if (!sanitize(m[1]) || OTHER_AGENT.test(lineText(at))) unsafeLines.add(lineStart(at));
    }
  }
  const found = [];
  for (const p of PATTERNS) {
    for (const m of readme.matchAll(p.re)) {
      const cmd = sanitize(m[1]);
      if (!cmd || unsafeLines.has(lineStart(m.index + m[0].indexOf(m[1])))) continue;
      const low = cmd.toLowerCase();
      const flat = (x) => x.replace(/[^a-z0-9]/g, ''); // "@playwright/mcp" matches repo "playwright-mcp"
      const own = (name && flat(low).includes(flat(name))) || (owner && flat(low).includes(flat(owner)));
      // Commands that name a *different* GitHub repo install a dependency, not this one.
      const repoRefs = [...low.matchAll(/(?:github\.com\/)?(?<![@\w.~-])([a-z0-9][\w.-]*)\/([\w.-]+)/g)].map((x) => `${x[1]}/${x[2].replace(/\.git$/, '')}`)
        .filter((r) => !/^(?:https?:|localhost|127\.)/.test(r) && !r.startsWith('.claude/') && !r.startsWith('skills/'));
      if (p.type === 'marketplace' && repoRefs.length && !repoRefs.includes(String(repo.full_name).toLowerCase())) continue;
      if (p.type === 'skills-dir' && /git\s+clone/i.test(cmd) && !repoRefs.includes(String(repo.full_name).toLowerCase())) continue;
      found.push({ cmd, type: p.type, idx: m.index, score: (p.kinds[repo.kind] || 1) + (inCode(m.index) ? 2 : 0) + (own ? 3 : 0) });
    }
  }
  if (!found.length) return { commands: [] };
  found.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const best = found[0];
  const out = [best.cmd];
  let note;
  // A marketplace add is only half the job: pair it with the plugin install that follows it,
  // unless the marketplace offers several plugins, in which case the user picks one.
  if (best.type === 'marketplace') {
    const installs = found.filter((f) => f.type === 'plugin-install');
    const plugins = new Set(installs.map((f) => (f.cmd.match(/install\s+([^\s@]+)/i) || [])[1]?.toLowerCase()).filter(Boolean));
    // The README may show a single example; the repo's marketplace.json says how many there are.
    if (plugins.size >= 2 || marketplacePlugins >= 2) note = 'then choose a plugin with /plugin';
    else {
      const next = installs.filter((f) => f.idx > best.idx).sort((a, b) => a.idx - b.idx)[0];
      if (next) out.push(next.cmd);
    }
  }
  return { commands: [...new Set(out)], ...(note ? { note } : {}) };
}

/** Commands only (see extractInstallHint). */
export const extractInstall = (readme, repo, opts) => extractInstallHint(readme, repo, opts).commands;

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
    if (SHELLS.has(basename(target).toLowerCase())) { found.push({ rejected: `runs ${basename(target)}` }); continue; }
    const url = /^https?:\/\//.test(target) || keep.includes('http') || keep.includes('sse');
    found.push({ name, opts: keep, url, target, args: url ? [] : more, env, dropped });
  }
  return found;
}


/** Skill folders in a git tree ('' for a SKILL.md at the root); test fixtures and examples aren't skills. */
export const skillDirsOf = (blobs) => blobs.filter((t) => /(^|\/)SKILL\.md$/.test(t.path) && !/(^|\/)(tests?|examples?|fixtures?)\//i.test(t.path)).map((t) => t.path.replace(/SKILL\.md$/, ''));

/**
 * How Tool Scout's installer would install the repo: 'mcp' (a README `claude mcp add` it can run
 * without a shell), 'plugin' (a marketplace), 'skill' (a folder it copies), or null (it can't).
 */
export function installMethod({ tree, readme, kind }) {
  if (!tree) return null;
  const blobs = tree.filter((t) => t.type === 'blob');
  const mcp = mcpCommands(typeof readme === 'string' ? readme : '').some((c) => !c.rejected);
  if (kind === 'mcp-server' && mcp) return 'mcp';
  if (blobs.some((t) => t.path === '.claude-plugin/marketplace.json')) return 'plugin';
  if (skillDirsOf(blobs).length) return 'skill';
  return mcp ? 'mcp' : null;
}

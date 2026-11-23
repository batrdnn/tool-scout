// Install hints: pull the real install command out of a repo's README.
// Display only. Tool Scout never runs these. The text is untrusted, so anything that
// chains commands or hides characters is rejected instead of shown.

const PATTERNS = [
  { re: /(?:^|[\s`$>])((?:\/plugin\s+marketplace\s+add|claude\s+plugin\s+marketplace\s+add)\s+\S[^\n`]*)/gi, type: 'marketplace', kinds: { plugin: 6, skill: 4 } },
  { re: /(?:^|[\s`$>])((?:\/plugin\s+install|claude\s+plugin\s+install)\s+\S[^\n`]*)/gi, type: 'plugin-install', kinds: { plugin: 5, skill: 3 } },
  { re: /(?:^|[\s`$>])(claude\s+mcp\s+add(?:-json)?\s+\S[^\n`]*)/gi, type: 'mcp-add', kinds: { 'mcp-server': 6, plugin: 2, skill: 2, tool: 2 } },
  { re: /(?:^|[\s`$>])(npx\s+(?:-y\s+|--yes\s+)?(?:skills|skill|add-skill|@\S+\/skills?)\s+(?:add|install)\s+\S[^\n`]*)/gi, type: 'skills-cli', kinds: { skill: 6, plugin: 2 } },
  { re: /(?:^|[\s`$>])(npx\s+(?:-y\s+|--yes\s+)?[@\w][\w@./-]*(?:\s+[^\n`]*)?)/gi, type: 'npx', kinds: { 'mcp-server': 3, skill: 2, plugin: 1, tool: 2 } },
];
const CHAINING = /[;|&`<>]|\$\(|\\\s*$/; // <> also rules out redirects; placeholders like <name> are rejected too
const INVISIBLE = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;

function sanitize(cmd) {
  const c = cmd.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().replace(/[.,:;]+$/, '');
  if (!c || c.length > 200 || CHAINING.test(c)) return null;
  return c;
}

function codeRanges(text) {
  return [...text.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g)].map((m) => [m.index, m.index + m[0].length]);
}

/**
 * Best install command(s) for `repo` ({ full_name, name, kind }) from README text.
 * Returns [] or up to two commands (marketplace add + plugin install go together).
 */
export function extractInstall(readme, repo) {
  if (!readme) return [];
  const code = codeRanges(readme);
  const inCode = (i) => code.some(([a, b]) => i >= a && i < b);
  const owner = String(repo.full_name || '').split('/')[0].toLowerCase();
  const name = String(repo.name || '').toLowerCase();
  // A line that fails sanitizing for one pattern is unsafe as a whole: no fragments from it.
  const lineAt = (i) => readme.lastIndexOf('\n', i);
  const unsafeLines = new Set();
  for (const p of PATTERNS) for (const m of readme.matchAll(p.re)) if (!sanitize(m[1])) unsafeLines.add(lineAt(m.index + m[0].indexOf(m[1])));
  const found = [];
  for (const p of PATTERNS) {
    for (const m of readme.matchAll(p.re)) {
      const cmd = sanitize(m[1]);
      if (!cmd || unsafeLines.has(lineAt(m.index + m[0].indexOf(m[1])))) continue;
      if (p.type === 'npx' && found.some((f) => f.cmd.startsWith(cmd.split(' ').slice(0, 2).join(' ')) && f.type !== 'npx')) continue;
      if (p.type === 'npx' && /\bnpx\s+(?:-y\s+)?(?:create-|tsc\b|prettier\b|eslint\b|vitest\b|jest\b|playwright\s+test)/i.test(cmd)) continue; // dev tasks, not installs
      const low = cmd.toLowerCase();
      const flat = (x) => x.replace(/[^a-z0-9]/g, ''); // "@playwright/mcp" matches repo "playwright-mcp"
      const own = (name && flat(low).includes(flat(name))) || (owner && flat(low).includes(flat(owner)));
      // A bare `npx something` is only an install hint when it's about this repo (not `npx browserslist …`).
      if (p.type === 'npx' && !own) continue;
      // Skill/plugin commands that name a *different* GitHub repo install a dependency, not this one.
      const repoRefs = [...low.matchAll(/(?:github\.com\/)?(?<![@\w.-])([a-z0-9][\w.-]*)\/([\w.-]+)/g)].map((x) => `${x[1]}/${x[2].replace(/\.git$/, '')}`)
        .filter((r) => !/^(?:https?:|localhost|127\.)/.test(r));
      if (['skills-cli', 'marketplace'].includes(p.type) && repoRefs.length && !repoRefs.includes(String(repo.full_name).toLowerCase())) continue;
      found.push({ cmd, type: p.type, idx: m.index, score: (p.kinds[repo.kind] || 1) + (inCode(m.index) ? 2 : 0) + (own ? 3 : 0) });
    }
  }
  if (!found.length) return [];
  found.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const best = found[0];
  const out = [best.cmd];
  // A marketplace add is only half the job; pair it with the plugin install that follows it.
  if (best.type === 'marketplace') {
    const next = found.filter((f) => f.type === 'plugin-install' && f.idx > best.idx).sort((a, b) => a.idx - b.idx)[0];
    if (next) out.push(next.cmd);
  }
  return [...new Set(out)];
}

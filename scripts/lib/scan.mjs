// Content trust scan for the final candidates only. Fetches README, SKILL.md files, install
// scripts, hook and MCP configs through the GitHub API (repo names only in the URL) and
// flags risky patterns. Heuristic, not a security review.
//
// Flags never include raw text for injection-type findings (file + line only), so a
// malicious README can't smuggle instructions into Claude's context via our output.

import fs from 'node:fs';
import path from 'node:path';
import { RateLimitError } from './github.mjs';
import { extractInstallHint } from './install.mjs';

const CACHE_FILE = 'trust-cache.json';
const MAX_FILE_BYTES = 300_000;
const MAX_FILES = 8; // per repo, besides the README
export const SCAN_VERSION = 11; // bump when rules change so cached scans are redone

// --- file roles -------------------------------------------------------------
const base = (p) => p.split('/').pop();
export function pickFiles(tree) {
  // Test fixtures and examples aren't installed (a security scanner's malicious fixtures are expected).
  const NOT_SHIPPED = /(^|\/)(tests?|__tests__|fixtures?|testdata|examples?|samples?|evals?|node_modules|vendor|third_party)\//i;
  const blobs = (tree || []).filter((t) => t.type === 'blob' && (t.size ?? 0) <= MAX_FILE_BYTES && !NOT_SHIPPED.test(t.path));
  const depth = (p) => p.split('/').length;
  const by = (re, n) => blobs.filter((t) => re.test(t.path)).sort((a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path)).slice(0, n);
  const isInstaller = (p) => /\.(sh|bash|zsh|ps1|py|js|mjs)$/i.test(p) && (
    (/^(install|setup|bootstrap)[\w.-]*$/i.test(base(p).replace(/\.\w+$/, '')) && depth(p) <= 2)
    || (/^(get|init)[\w.-]*$/i.test(base(p).replace(/\.\w+$/, '')) && depth(p) === 1));
  const picked = [
    ...by(/(^|\/)skill\.md$/i, 3).map((t) => ({ path: t.path, role: 'skill' })),
    ...blobs.filter((t) => isInstaller(t.path)).sort((a, b) => depth(a.path) - depth(b.path)).slice(0, 2).map((t) => ({ path: t.path, role: 'script' })),
    ...by(/(^|\/)hooks\/hooks\.json$|^\.claude\/settings\.json$/i, 1).map((t) => ({ path: t.path, role: 'config' })),
    ...by(/^package\.json$/, 1).map((t) => ({ path: t.path, role: 'package' })),
    ...by(/^\.mcp\.json$/, 1).map((t) => ({ path: t.path, role: 'config' })),
  ];
  return picked.slice(0, MAX_FILES);
}

// --- rules --------------------------------------------------------------------
const INJECTION = [
  /\bignore\s+(?:all\s+|any\s+)?(?:of\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions|prompts?|messages|rules|directions)/i,
  /\bdisregard\s+(?:all\s+|any\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier)?\s*(?:instructions|rules|guidelines|system\s+prompt)/i,
  /\bforget\s+(?:all\s+)?(?:your|previous|prior)\s+(?:instructions|rules)/i,
  // Concealment, not honesty rules like "never tell the user a file is safe".
  /\b(?:do\s+not|don'?t|never)\s+(?:tell|inform|notify|alert|let)\s+the\s+user\s*(?:[.!;]|$|about|know|that\s+(?:you|we|this)|what\s+(?:you|was)|of\s+(?:this|it)|anything)/im,
  /\b(?:do\s+not|don'?t|never)\s+(?:show|mention|reveal|disclose)\s+(?:this|these|it|them)\s+to\s+the\s+user/i,
  /\b(?:hide|conceal|keep)\s+(?:this|it|these|them)\s+(?:secret\s+)?from\s+the\s+user/i,
  /\bwithout\s+(?:telling|informing|asking|notifying|alerting)\s+the\s+user/i,
  /\byou\s+are\s+now\s+(?:in\s+)?(?:developer|dan|jailbreak|unrestricted|god)\s*mode/i,
  /\b(?:new|updated|override)\s+system\s+prompt\b/i,
];
const AI_WORDS = /\b(claude|assistant|ai|agent|llm|model|copilot|cursor|gpt|chatgpt)\b/i;
const IMPERATIVE = /\b(ignore|must|always|never|do not|don'?t|execute|run|install|send|upload|you are|you should|instead)\b/i;
// Needs an argument between the downloader and the pipe, so prose like "`curl | sh`" doesn't count.
const PIPE_SHELL = /\b(?:curl|wget)\s+[^\s|\\][^\n|;]*(?<!\\)\|\s*(?:(?:sudo|\$\{?\w+\}?)\s+)?(?:ba|z|da)?sh\b|\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\s+[^\s|\\][^\n|]*(?<!\\)\|\s*(?:iex|Invoke-Expression)\b|\b(?:iex|Invoke-Expression)\s*\(\s*(?:New-Object\s+Net\.WebClient|iwr|irm)/i;
// Widely used official installers: still a pipe-to-shell, but a well-known one.
const KNOWN_INSTALLERS = /^(?:astral\.sh|bun\.sh|deno\.land|sh\.rustup\.rs|get\.docker\.com|install\.python-poetry\.org|get\.pnpm\.io|(?:deb|rpm)\.nodesource\.com|fnm\.vercel\.app|cli\.github\.com|claude\.ai|raw\.githubusercontent\.com\/(?:Homebrew|nvm-sh)\/)/i;
const COMMENT_LINE = /^\s*(?:#|\/\/|REM\b|::|\*)/i;
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g;
const TAGS = /[\u{E0000}-\u{E007F}]/gu;
// Zero-width chars hidden inside ASCII text/commands (emoji ZWJ and Persian ZWNJ are left alone).
const ZW_IN_ASCII = /(?<=[\x20-\x7E])[\u200B\u200C\u2060\u180E\uFEFF](?=[\x20-\x7E])/g;
// A run of zero-width characters carries no visible text but can encode bits (steganography).
const ZW_RUN = /[\u200B\u200C\u200D\u2060\u180E\uFEFF]{4,}/g;
// Decoding an encoded payload and executing it in the same step.
const OBFUSCATED_EXEC = [
  /\bbase64\s+(?:-d|--decode|-D)\b[^\n]*(?<!\\)\|\s*(?:sudo\s+)?(?:(?:ba|z|da)?sh|eval|python3?|node|perl|ruby)\b/i,
  /\b(?:eval|exec|Function|execSync|spawnSync|system|popen|Invoke-Expression|iex)\s*\(?\s*[^\n]{0,40}?(?:atob\s*\(|Buffer\.from\s*\([^\n]*['"]base64['"]|b64decode\s*\(|codecs\.decode\s*\(|FromBase64String\s*\()/i,
  /\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]*\s-(?:e|enc|encodedcommand)\s+[A-Za-z0-9+/=]{16,}/i,
];
// Sources of secrets: the whole environment, SSH keys, cloud / package-registry credentials.
const SECRET_SOURCE = /\bJSON\.stringify\(\s*process\.env\s*\)|\{\s*(?:\.\.\.process\.env|env:\s*process\.env)\b|\bdict\(\s*os\.environ\s*\)|\bjson\.dumps\(\s*(?:dict\()?os\.environ|\$\(\s*(?:env|printenv)\s*\)|\b(?:env|printenv)\s*\|\s*(?:curl|wget|nc|base64)\b|['"/~]\.ssh\b|\bid_(?:rsa|ed25519|ecdsa|dsa)\b|\.aws\/credentials|\.netrc\b|\.npmrc\b|\.config\/gh\/hosts\.yml/;
const BASE64 = /(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{200,}={0,2}(?![A-Za-z0-9+/=])/g;
const NET = /\b(?:curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm|requests\.(?:get|post|put)|urllib\.request\.urlopen|fetch\(|axios\.(?:get|post)|http\.request|nc\s)/i;
const SENDS = /(?:\s-d\b|--data|\s-F\b|--form|-X\s*POST|--upload-file|requests\.post|method:\s*['"]POST|axios\.post|-T\s)/i;
const KNOWN_HOSTS = /^(?:[\w-]+\.)*(?:github\.com|githubusercontent\.com|npmjs\.org|npmjs\.com|pypi\.org|pythonhosted\.org|localhost|127\.0\.0\.1|0\.0\.0\.0|crates\.io|rubygems\.org|astral\.sh|deno\.land|bun\.sh|nodejs\.org|brew\.sh|claude\.ai|anthropic\.com)$/i;

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const clean = (s, n = 100) => s.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function codeRanges(text) {
  const ranges = [];
  for (const m of text.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}
const inRanges = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);
function quotedOnLine(text, i) {
  const start = text.lastIndexOf('\n', i) + 1;
  const before = text.slice(start, i);
  return (before.match(/["“”']/g) || []).length % 2 === 1;
}
const hostsIn = (s) => [...s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());

/**
 * Scan one file's text. role: readme | skill | script | config | package.
 * `explainedHosts`: hosts the README talks about (a call to one of those is "explained").
 */
export function scanText(text, { file, role, explainedHosts = new Set(), repo = null } = {}) {
  const flags = [];
  if (typeof text !== 'string' || !text) return flags;
  const add = (id, severity, idx, detail, excerpt) => flags.push({ id, severity, file, line: idx == null ? undefined : lineOf(text, idx), detail, ...(excerpt ? { excerpt } : {}) });
  const code = codeRanges(text);

  // Prompt injection: phrasing that tries to override the agent or hide things from the user.
  for (const re of INJECTION) {
    const g = new RegExp(re.source, 'gi');
    for (const m of text.matchAll(g)) {
      const example = role === 'readme' && (inRanges(code, m.index) || quotedOnLine(text, m.index));
      add('prompt-injection', example ? 'low' : 'high', m.index,
        example ? 'injection phrasing quoted in README (probably an example)' : 'text tries to override instructions or hide actions from the user');
    }
  }
  // Instructions to an AI hidden where a human reader won't see them.
  for (const m of text.matchAll(/<!--([\s\S]*?)-->|^\[\/\/\]:\s*#\s*\((.*)\)\s*$/gm)) {
    const body = m[1] ?? m[2] ?? '';
    if (AI_WORDS.test(body) && IMPERATIVE.test(body)) add('hidden-instructions', 'high', m.index, 'hidden comment addresses an AI with instructions');
  }
  // Invisible / direction-changing characters.
  const bidi = [...text.matchAll(BIDI)];
  if (bidi.length) add('invisible-unicode', 'high', bidi[0].index, `${bidi.length} bidirectional control character(s)`);
  const tags = [...text.matchAll(TAGS)];
  if (tags.length) add('invisible-unicode', 'high', tags[0].index, `${tags.length} invisible Unicode tag character(s) (can encode hidden text)`);
  const zw = [...text.matchAll(ZW_IN_ASCII)];
  if (zw.length) add('invisible-unicode', 'medium', zw[0].index, `${zw.length} zero-width character(s) inside ASCII text`);
  const zwRuns = [...text.matchAll(ZW_RUN)];
  if (zwRuns.length) add('invisible-unicode', 'high', zwRuns[0].index, `${zwRuns.length} run(s) of zero-width characters (can encode hidden text)`);
  // Encoded payload decoded and run in one step (short payloads slip under the blob rule).
  for (const re of OBFUSCATED_EXEC) {
    const m = text.match(re);
    if (!m) continue;
    const lineText = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
    const fullLine = text.slice(text.lastIndexOf('\n', m.index) + 1, (text.indexOf('\n', m.index) + 1 || text.length + 1) - 1);
    const placeholder = role === 'readme' && /…|\.\.\./.test(fullLine) && !/[A-Za-z0-9+/]{16,}={0,2}/.test(fullLine); // a placeholder names the pattern
    const severity = placeholder ? 'low' : role === 'readme' || COMMENT_LINE.test(lineText) ? 'medium' : 'high';
    add('obfuscated-exec', severity, m.index, `decodes an encoded payload and executes it${placeholder ? ' (pattern mention, no payload)' : ''}`);
    break;
  }
  // Large encoded blobs (inline images are fine).
  // Inline images/fonts (incl. URL-encoded ones in badge links) are blanked out first, keeping offsets.
  const noDataUris = text.replace(/data:(?:image|font)\/[\w+.%-]+;base64,[A-Za-z0-9+/=%]+/gi, (s) => ' '.repeat(s.length));
  for (const m of noDataUris.matchAll(BASE64)) {
    add('base64-blob', 'medium', m.index, `${m[0].length}-char base64-like blob`);
    break;
  }
  // Download piped straight into a shell. Severity depends on where it fetches from and
  // whether the line actually runs (a usage comment inside an installer is documentation).
  for (const m of text.matchAll(new RegExp(PIPE_SHELL.source, 'gi'))) {
    const url = (m[0].match(/https?:\/\/(\S+)/i) || [])[1] || '';
    const lineText = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
    const own = repo && new RegExp(`^(?:raw\\.githubusercontent\\.com|github\\.com)/${repo.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/`, 'i').test(url);
    const known = KNOWN_INSTALLERS.test(url);
    const runs = role !== 'readme' && !COMMENT_LINE.test(lineText);
    // No URL, host or $variable: a placeholder like "curl … | sh" describing the pattern.
    const pattern = !/https?:\/\/|\$|\b[\w-]+\.[a-z]{2,}\b/i.test(m[0]);
    const severity = own || known || pattern ? 'low' : runs ? 'high' : 'medium';
    const where = own ? " (the repo's own installer)" : known ? ` (well-known installer: ${url.split('/')[0]})` : pattern ? ' (pattern mention, no URL)' : '';
    add('pipe-to-shell', severity, m.index, `downloads and executes a script in one step${where}`, clean(m[0]));
  }
  // Network calls from code that runs on install / inside the agent (not README prose).
  if (role !== 'readme') {
    // Exfiltration: the same file reads secrets and sends data to a host that isn't a known
    // registry. Judged per file, since the URL, the payload and the send are often on different lines.
    const secret = text.match(SECRET_SOURCE);
    const outHosts = [...new Set(hostsIn(text).filter((h) => !KNOWN_HOSTS.test(h)))];
    if (secret && outHosts.length && (SENDS.test(text) || NET.test(text))) {
      add('exfiltration', 'high', secret.index, `reads secrets (environment, SSH keys or credentials) and sends data to ${outHosts.slice(0, 3).join(', ')}`);
    }
    const lines = role === 'package' ? packageScripts(text) : text.split('\n').map((l, i) => [l, i + 1]);
    for (const [l, ln] of lines) {
      if (!NET.test(l) || COMMENT_LINE.test(l) || new RegExp(PIPE_SHELL.source, "i").test(l)) continue; // comments do not run; pipe-to-shell is reported above
      const hosts = hostsIn(l).filter((h) => !KNOWN_HOSTS.test(h));
      const unexplained = hosts.filter((h) => !explainedHosts.has(h));
      if (!unexplained.length && !(SENDS.test(l) && hosts.length)) continue;
      const sends = SENDS.test(l);
      flags.push({ id: 'network-call', severity: sends ? 'medium' : 'low', file, line: ln,
        detail: `${sends ? 'sends data' : 'network call'} to ${[...new Set(unexplained.length ? unexplained : hosts)].join(', ')}${unexplained.length ? ' (not mentioned in README)' : ''}`,
        excerpt: clean(l) });
    }
  }
  return flags;
}

/** npm lifecycle scripts run on install: return them as [line, n] pairs. */
function packageScripts(text) {
  try {
    const s = JSON.parse(text).scripts || {};
    return ['preinstall', 'install', 'postinstall', 'prepare'].filter((k) => s[k]).map((k) => [`${k}: ${s[k]}`, undefined]);
  } catch { return []; }
}

/** Hosts a README explains (mentions in prose or links). */
export const explainedHostsOf = (readme) => new Set(hostsIn(readme || ''));

// --- fetching ---------------------------------------------------------------
async function fetchRaw(client, url) {
  const r = await client.request(url, { accept: 'application/vnd.github.raw+json', raw: true });
  return r.status === 200 && typeof r.data === 'string' ? r.data : null;
}

export async function scanRepo(client, fullName, meta = {}) {
  const api = `https://api.github.com/repos/${fullName}`;
  const readme = await fetchRaw(client, `${api}/readme`);
  const treeRes = await client.request(`${api}/git/trees/HEAD?recursive=1`);
  const files = pickFiles(treeRes.data?.tree);
  const explained = explainedHostsOf(readme);
  const flags = readme ? scanText(readme, { file: 'README', role: 'readme', explainedHosts: explained, repo: fullName }) : [];
  const scanned = readme ? ['README'] : [];
  for (const f of files) {
    const text = await fetchRaw(client, `${api}/contents/${f.path.split('/').map(encodeURIComponent).join('/')}`);
    if (text == null) continue;
    scanned.push(f.path);
    flags.push(...scanText(text, { file: f.path, role: f.role, explainedHosts: explained, repo: fullName }));
  }
  const skillFiles = files.filter((f) => f.role === 'skill').length;
  // A marketplace manifest says how many plugins the repo offers (for the install hint only).
  let marketplacePlugins = 0;
  if ((treeRes.data?.tree || []).some((t) => t.path === '.claude-plugin/marketplace.json')) {
    try { marketplacePlugins = (JSON.parse(await fetchRaw(client, `${api}/contents/.claude-plugin/marketplace.json`) || '{}').plugins || []).length; } catch { /* malformed: ignore */ }
  }
  const hint = extractInstallHint(readme, { full_name: fullName, name: fullName.split('/')[1], kind: meta.kind }, { marketplacePlugins });
  return { flags: dedupe(flags), scannedFiles: scanned, skillFiles, treeTruncated: !!treeRes.data?.truncated, install: hint.commands, installNote: hint.note };
}

function dedupe(flags) {
  const seen = new Set();
  return flags.filter((f) => {
    const k = `${f.id}|${f.file}|${f.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const SEV = { high: 3, medium: 2, low: 1 };
/** Fold scan flags into a trust object: high-severity content flags drop the tier to low. */
export function applyFlags(trust, scan) {
  const flags = scan?.flags || [];
  const out = { ...trust, flags, scanned: !!scan && !scan.error };
  if (scan?.error) out.scanError = scan.error;
  const worst = Math.max(0, ...flags.map((f) => SEV[f.severity] || 0));
  if (worst >= 3) { out.tier = 'low'; out.notes = [...trust.notes, 'content scan raised high-severity flags']; }
  else if (worst === 2 && trust.tier === 'high') out.tier = 'medium';
  return out;
}

function loadCache(dataDir) { try { return JSON.parse(fs.readFileSync(path.join(dataDir, CACHE_FILE), 'utf8')); } catch { return {}; } }
function saveCache(dataDir, c) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(path.join(dataDir, CACHE_FILE), JSON.stringify(c)); }

/**
 * Scan the given recommendations (already the final candidates), reusing cached scans while
 * the repo hasn't been pushed since and the rules haven't changed. Mutates rec.trust.
 */
export async function scanRecommendations(recs, catalog, { client, dataDir, reserve = 20, log = () => {}, ttlDays = 7, now = Date.now(), memo = null }) {
  const cache = dataDir ? loadCache(dataDir) : {};
  const stats = { scanned: 0, cached: 0, skipped: 0, failed: 0 };
  let stop = false;
  for (const rec of recs) {
    const repo = catalog.repos[rec.name] || {};
    const hit = cache[rec.name];
    let scan = null;
    if (memo?.has(rec.name)) {
      scan = memo.get(rec.name); // already handled earlier in this run: not counted again
    } else if (hit && hit.v === SCAN_VERSION && hit.pushedAt === repo.pushedAt && now - Date.parse(hit.at) < ttlDays * 86400e3) {
      scan = hit; stats.cached++;
    } else if (stop || !client.hasBudget(reserve)) {
      stats.skipped++;
    } else {
      try {
        scan = { ...(await scanRepo(client, rec.name, { kind: rec.kind })), v: SCAN_VERSION, pushedAt: repo.pushedAt, at: new Date(now).toISOString() };
        cache[rec.name] = scan;
        stats.scanned++;
      } catch (e) {
        if (e instanceof RateLimitError) { log(e.message); stop = true; stats.skipped++; }
        else { scan = { flags: [], error: e.message }; stats.failed++; }
      }
    }
    if (memo && scan) memo.set(rec.name, scan);
    rec.trust = applyFlags(rec.trust, scan);
    // Real install command from the README when there is one (display only, never run).
    if (scan?.install?.length) {
      rec.install = [scan.install.join(' then '), scan.installNote].filter(Boolean).join(', ');
      rec.installCommands = scan.install; rec.installSource = 'readme';
      if (scan.installNote) rec.installNote = scan.installNote;
    } else rec.installSource = 'readme-link';
  }
  if (dataDir) saveCache(dataDir, cache);
  return stats;
}

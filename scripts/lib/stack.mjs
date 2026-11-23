// Stack signals from dependency files, read locally from the project folders the user's
// sessions ran in. Only library names are kept (counted per project), only in profile.json.
// Nothing here is ever sent anywhere: the GitHub client only receives repo names and
// fixed topic queries.

import fs from 'node:fs';
import path from 'node:path';
import { inEnumeration } from './taxonomy.mjs';

const MAX_BYTES = 1 << 20;
const MANIFEST = /^(?:package\.json|requirements[\w.-]*\.txt|pyproject\.toml|Package\.swift|Podfile|go\.mod|Cargo\.toml|Gemfile)$/;
const lower = (x) => String(x).trim().toLowerCase();
const reqName = (spec) => (String(spec).trim().match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/) || [])[1];

function tomlSections(text) {
  // [[section, [lines]]] for a minimal, line-based TOML reading.
  const out = [['', []]];
  for (const line of text.split('\n')) {
    const h = line.match(/^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/);
    if (h) out.push([h[1].trim(), []]); else out[out.length - 1][1].push(line.replace(/\s+#.*$/, ''));
  }
  return out;
}
/** Quoted strings of every `key = [ … ]` array in `lines` (multi-line arrays too). */
function arrayStrings(lines, onlyKey = null) {
  const out = [];
  let inArr = false;
  for (const l of lines) {
    const start = l.match(/^\s*([\w.-]+)\s*=\s*\[/);
    if (!inArr && start && (!onlyKey || start[1] === onlyKey)) inArr = true;
    if (inArr) {
      for (const m of l.matchAll(/"([^"]+)"|'([^']+)'/g)) out.push(m[1] ?? m[2]);
      if (l.includes(']')) inArr = false;
    }
  }
  return out;
}
const tableKeys = (lines) => lines.map((l) => (l.match(/^\s*([A-Za-z0-9][\w.-]*)\s*=/) || [])[1]).filter(Boolean);

/** Library names declared in one manifest (lowercased, deduped, in file order). */
export function parseManifest(file, text) {
  const base = path.basename(file);
  let names = [];
  try {
    if (base === 'package.json') {
      const j = JSON.parse(text);
      for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) names.push(...Object.keys(j[k] || {}));
      names = names.filter((n) => !n.startsWith('@types/'));
    } else if (/^requirements/.test(base)) {
      for (const l of text.split('\n')) {
        const s = l.replace(/#.*$/, '').trim();
        if (!s || s.startsWith('-') || s.includes('://')) continue;
        names.push(reqName(s));
      }
    } else if (base === 'pyproject.toml') {
      for (const [sec, lines] of tomlSections(text)) {
        if (sec === 'project') names.push(...arrayStrings(lines, 'dependencies').map(reqName));
        else if (sec === 'project.optional-dependencies' || sec === 'dependency-groups') names.push(...arrayStrings(lines).map(reqName));
        else if (/^tool\.poetry\.(?:group\.[\w-]+\.)?(?:dev-)?dependencies$/.test(sec)) names.push(...tableKeys(lines).filter((k) => k !== 'python'));
      }
    } else if (base === 'Package.swift') {
      for (const m of text.matchAll(/\.package\s*\([^)]*?url:\s*"[^"]*?\/([\w.-]+?)(?:\.git)?\/?"/g)) names.push(m[1]);
    } else if (base === 'Podfile') {
      for (const m of text.matchAll(/^\s*pod\s+['"]([^'"/]+)/gm)) names.push(m[1]);
    } else if (base === 'go.mod') {
      let block = false;
      for (const l of text.split('\n')) {
        const s = l.replace(/\/\/.*$/, '').trim();
        if (/^require\s*\($/.test(s)) { block = true; continue; }
        if (block && s === ')') { block = false; continue; }
        const mod = block ? s.split(/\s+/)[0] : (s.match(/^require\s+(\S+)/) || [])[1];
        if (mod) names.push(mod.replace(/\/v\d+$/, '').split('/').pop());
      }
    } else if (base === 'Cargo.toml') {
      for (const [sec, lines] of tomlSections(text)) {
        if (/(^|\.)(?:dev-|build-)?dependencies$/.test(sec)) names.push(...tableKeys(lines));
        else { const m = sec.match(/(?:^|\.)(?:dev-|build-)?dependencies\.([\w-]+)$/); if (m) names.push(m[1]); }
      }
    } else if (base === 'Gemfile') {
      for (const m of text.matchAll(/^\s*gem\s+['"]([^'"]+)/gm)) names.push(m[1]);
    }
  } catch { return []; }
  return [...new Set(names.filter(Boolean).map(lower))];
}

/** Every library declared by the manifests at the top of `dir` (missing dir: empty). */
export function librariesIn(dir) {
  const libs = new Set();
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return libs; }
  for (const e of entries) {
    if (!e.isFile() || !MANIFEST.test(e.name)) continue;
    const f = path.join(dir, e.name);
    try { if (fs.statSync(f).size > MAX_BYTES) continue; parseManifest(e.name, fs.readFileSync(f, 'utf8')).forEach((n) => libs.add(n)); } catch { /* unreadable */ }
  }
  return libs;
}

// --- domain from libraries ------------------------------------------------------------------
// Well-known libraries whose presence says what the project is about. A library in a session's
// project counts as action evidence for these topics. Kept short on purpose: only libraries
// with one clear domain (vendor SDKs like AI or payment clients are deliberately absent).
const DOMAINS = {
  finance: 'yfinance backtrader ccxt vectorbt zipline zipline-reloaded ta-lib pandas-ta quantstats pyfolio empyrical mplfinance alpaca-py alpaca-trade-api ib_insync ib-insync quantlib freqtrade backtesting',
  ios: 'swiftui alamofire snapkit kingfisher swift-composable-architecture rxswift realmswift',
  data: 'pandas polars numpy scipy pyarrow duckdb dask matplotlib seaborn plotly jupyter jupyterlab',
  database: 'prisma @prisma/client sqlalchemy alembic psycopg psycopg2 psycopg2-binary asyncpg pg mysql2 mongoose pymongo drizzle-orm typeorm sequelize knex gorm sqlx diesel',
  testing: 'pytest pytest-cov hypothesis jest vitest mocha @playwright/test cypress testify rspec rspec-rails',
  frontend: 'react react-dom next vue svelte @sveltejs/kit tailwindcss vite @angular/core',
  backend: 'express fastapi django flask @nestjs/core gin koa rails',
  devops: 'client-go boto3 aws-sdk-go-v2 @pulumi/pulumi pulumi',
  browser: 'puppeteer selenium beautifulsoup4 scrapy',
};
export const LIBRARY_TOPICS = {};
for (const [topic, libs] of Object.entries(DOMAINS)) for (const l of libs.split(' ')) (LIBRARY_TOPICS[l] ||= []).push(topic);

/** Topics the libraries in `dir` stand for (see LIBRARY_TOPICS). */
export function libraryTopicsIn(dir) {
  const out = new Set();
  for (const lib of librariesIn(dir)) (LIBRARY_TOPICS[lib] || []).forEach((t) => out.add(t));
  return out;
}

// --- matching -----------------------------------------------------------------------------
// The name a repo would use for a library. Generic: drop an npm scope (keeping it when the
// package part is a generic word like client/test/core), a -js/.js suffix and a Go /vN.
// One alias: the npm package `next` is "Next.js" (the bare word is ordinary English).
const SCOPE_GENERIC = new Set(['client', 'core', 'cli', 'test', 'sdk', 'kit', 'server', 'node', 'api', 'react', 'utils', 'types']);
const ALIASES = { next: ['next.js', 'nextjs'] };
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export function libraryTerms(lib) {
  if (ALIASES[lib]) return ALIASES[lib];
  let t = lib;
  const scoped = t.match(/^@([^/]+)\/(.+)$/);
  if (scoped) t = SCOPE_GENERIC.has(scoped[2]) ? scoped[1] : scoped[2];
  t = t.replace(/(?:[-.]js)$/, '');
  return t.length >= 3 ? [t] : [];
}
const termRe = (term) => new RegExp(`(?<![a-z0-9])${escape(term).replace(/[-_ ]/g, '[-_ ]?')}(?![a-z0-9])`, 'gi');

/** Libraries of the user's that a repo names in its name or description head: [{ library, projects }]. */
export function stackMatches(repo, stack) {
  if (!stack || !Object.keys(stack).length) return [];
  // The first clause only (what the repo says it is), not "… works with pytest, jest and more".
  const head = String(repo.description || '').split(/:\s|[.!?](?:\s|$)|\s[—–-]{1,2}\s|\s\|\s|[;(]/)[0];
  const text = `${String(repo.name || '').replace(/[_]/g, '-')} | ${head}`;
  const out = [];
  for (const [library, projects] of Object.entries(stack)) {
    // A term that only appears inside a comma list ("OpenAI, Acme, Gemini, …") names a supported
    // provider or integration, not what the repo is built around.
    const hit = libraryTerms(library).some((t) => [...text.matchAll(termRe(t))].some((m) => !inEnumeration(text, m.index)));
    if (hit) out.push({ library, projects });
  }
  return out.sort((a, b) => b.projects - a.projects).slice(0, 2);
}

export const stackNote = (ev) => ev.map((e) => `you use ${e.library} in ${e.projects} project${e.projects === 1 ? '' : 's'}`).join('; ');

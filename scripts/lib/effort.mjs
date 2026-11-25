// Build-or-install advice for a final pick: what the repo is, how big it is, what it needs, and
// whether writing your own would be less work than installing it. Advice only: nothing here
// installs, builds, writes or fetches anything. The scan (scan.mjs) fetches the repo's file tree
// and the few manifests effortFiles() names, and caches effortFacts(); advise() runs at read time,
// so "recently pushed" never goes stale in the cache.
//
// Repo text is data: only counts, a fixed vocabulary and ALL_CAPS env-style names leave this file.

// ---- documented thresholds ------------------------------------------------------------
export const THRESHOLDS = {
  SMALL_LOC: 300, //   at most this many lines of code (and no external API): build your own
  LARGE_LOC: 3000, //  at least this many: install
  ACTIVE_DAYS: 14, //  pushed within this many days counts as actively maintained …
  ACTIVE_MIN_LOC: 1000, // … and with at least this much code it's hard to keep up with: install
  NOTE_MAX_LINES: 40, // instructions this short fit in a CLAUDE.md note instead of a skill
  COLLECTION_MIN: 3, // this many skills, agents, MCP servers or plugins make a collection, judged per part
};
export const BYTES_PER_LINE = 35; //    average bytes per line of code (the tree API gives sizes, not lines)
export const BYTES_PER_MD_LINE = 50; // average bytes per line of Markdown
const MAX_EFFORT_FILES = 6;
const MAX_MANIFEST_BYTES = 200_000;

// ---- what counts as code ----------------------------------------------------------------
const LANG = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript',
  py: 'Python', go: 'Go', rs: 'Rust', rb: 'Ruby', java: 'Java', kt: 'Kotlin', swift: 'Swift', cs: 'C#', c: 'C', h: 'C',
  cc: 'C++', cpp: 'C++', hpp: 'C++', php: 'PHP', sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell', lua: 'Lua',
  dart: 'Dart', scala: 'Scala', ex: 'Elixir', exs: 'Elixir', clj: 'Clojure', vue: 'Vue', svelte: 'Svelte',
};
// Docs, tests, examples, vendored and generated code, CI and assets are not what you'd rebuild.
const NOT_CODE_DIR = /(^|\/)(docs?|tests?|__tests__|spec|specs|e2e|fixtures?|testdata|examples?|samples?|demos?|evals?|benchmarks?|node_modules|vendor|third_party|dist|build|out|target|coverage|\.github|assets|static|public|images|media)\//i;
const NOT_CODE_FILE = /\.min\.\w+$|\.d\.ts$|(^|\/)[^/]*\.(test|spec)\.\w+$|(^|\/)tests?[-_][^/]*$|_test\.(go|py)$/i;
const IN_SKILL = /(^|\/)skills\//i; // a skill's own agents/ or hooks/ folder is part of the skill, not a plugin
const NOT_INSTRUCTIONS = /(^|\/)(readme|changelog|license|licence|contributing|code_of_conduct|security|notice|authors)[^/]*\.md$/i;
const ext = (p) => (p.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const depth = (p) => p.split('/').length;

// ---- manifests --------------------------------------------------------------------------
const MANIFESTS = [
  /^package\.json$/, /^pyproject\.toml$/, /^requirements\.txt$/, /^go\.mod$/, /^Cargo\.toml$/,
  /^\.env\.(example|sample|template)$/, /^(docker-)?compose\.ya?ml$/, /^\.mcp\.json$/,
];

/** The few small manifests worth fetching: the shallowest of each kind (depth ≤ 2), not in tests or vendored code. */
export function effortFiles(tree) {
  const blobs = (tree || []).filter((t) => t.type === 'blob' && (t.size ?? 0) <= MAX_MANIFEST_BYTES && depth(t.path) <= 2 && !NOT_CODE_DIR.test(t.path));
  const out = [];
  for (const re of MANIFESTS) {
    const hit = blobs.filter((t) => re.test(t.path.split('/').pop())).sort((a, b) => depth(a.path) - depth(b.path))[0];
    if (hit) out.push(hit.path);
  }
  return out.slice(0, MAX_EFFORT_FILES);
}

const fileOf = (files, re) => Object.entries(files || {}).find(([p, t]) => t != null && re.test(p.split('/').pop()))?.[1] ?? null;
const tomlSection = (text, name) => {
  const m = text.match(new RegExp(`^\\[${name.replace(/\./g, '\\.')}\\]\\s*$([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, 'm'));
  return m ? m[1] : null;
};
const tomlKeys = (sec) => (sec || '').split('\n').map((l) => l.match(/^\s*([A-Za-z0-9_.-]+)\s*=/)?.[1]).filter(Boolean);

/** Runtime dependency names per manifest; null when there's no manifest at all. */
function dependencyNames(files) {
  let found = false;
  const names = [];
  const pkg = fileOf(files, /^package\.json$/);
  if (pkg) { try { names.push(...Object.keys(JSON.parse(pkg).dependencies || {})); found = true; } catch { /* malformed */ } }
  const req = fileOf(files, /^requirements\.txt$/);
  if (req != null) {
    found = true;
    names.push(...req.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('-')).map((l) => l.split(/[<>=!~\[;@ ]/)[0].toLowerCase()));
  }
  const py = fileOf(files, /^pyproject\.toml$/);
  if (py != null) {
    const project = tomlSection(py, 'project');
    const list = project?.match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m)?.[1];
    if (list != null) { found = true; names.push(...[...list.matchAll(/["']([^"']+)["']/g)].map((m) => m[1].split(/[<>=!~\[; ]/)[0].toLowerCase())); }
    const poetry = tomlSection(py, 'tool.poetry.dependencies');
    if (poetry != null) { found = true; names.push(...tomlKeys(poetry).filter((k) => k !== 'python')); }
  }
  const gomod = fileOf(files, /^go\.mod$/);
  if (gomod != null) {
    found = true;
    const lines = [...gomod.matchAll(/^require\s*\(([\s\S]*?)^\)/gm)].flatMap((m) => m[1].split('\n'))
      .concat([...gomod.matchAll(/^require\s+([^\s(]\S*\s+\S+.*)$/gm)].map((m) => m[1]));
    names.push(...lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !/\/\/\s*indirect/.test(l)).map((l) => l.split(/\s+/)[0]));
  }
  const cargo = fileOf(files, /^Cargo\.toml$/);
  if (cargo != null) { found = true; names.push(...tomlKeys(tomlSection(cargo, 'dependencies'))); }
  return found ? [...new Set(names)] : null;
}

// ---- what it needs ----------------------------------------------------------------------
const CRED_NAME = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:API_KEY|APIKEY|KEY|TOKEN|SECRET|SECRET_KEY|CLIENT_ID|CLIENT_SECRET|PASSWORD|ACCESS_KEY|ACCESS_TOKEN|AUTH_TOKEN|PAT))\b/g;
const CRED_SUFFIX = /_(?:API_KEY|APIKEY|SECRET_KEY|CLIENT_ID|CLIENT_SECRET|ACCESS_KEY|ACCESS_TOKEN|AUTH_TOKEN|KEY|TOKEN|SECRET|PASSWORD|PAT)$/;
const PLACEHOLDER = /^(YOUR|MY|THE|SOME|EXAMPLE|SAMPLE|XXX|DUMMY|FAKE|TEST)$/;
// Build tools that expose env vars to the browser prefix them: VITE_FIREBASE_API_KEY is Firebase's.
const ENV_PREFIX = /^(?:VITE|NEXT_PUBLIC|REACT_APP|NUXT_PUBLIC|EXPO_PUBLIC|PUBLIC|GATSBY|VUE_APP)_/;
// Passwords and an app's own secrets (SECRET_KEY, JWT_SECRET) are credentials, not external APIs.
const NOT_AN_API = /_PASSWORD$|^(?:SECRET|ROOT|APP|ADMIN|MASTER|PRIVATE|JWT|SESSION|ENCRYPTION|SIGNING|COOKIE|CSRF|DB|DATABASE|INTERNAL|LOCAL)_/;
const MAX_LISTED = 8; // credentials and APIs listed; the totals are kept as counts
const OTHER_INSTALL = /\b(?:npx|uvx|pipx?\s+install|npm\s+(?:i|install)|pnpm\s+add|yarn\s+add|bun\s+add|go\s+install|cargo\s+install|brew\s+install|claude\s+mcp\s+add|claude\s+plugin\s+install|\/plugin\s+install)\b/i;
const NEGATED = /\b(?:no|without|not|don'?t|doesn'?t|never|zero)\b[^.\n]{0,25}$/i;
// "API key" / "OAuth" count only when the user is asked for one, not when it's a topic.
const ASKED = /\b(?:your|an?|requires?|needs?|set|get|obtain|create|provide|enter|paste|add|configure|export|sign[- ]?in|log[- ]?in|authenticate|authori[sz]e|via|using|through)\b[^.\n]{0,15}$/i;
const HTTP_DEPS = new Set(['axios', 'node-fetch', 'got', 'undici', 'superagent', 'ky', 'requests', 'httpx', 'aiohttp', 'urllib3', 'reqwest', 'github.com/go-resty/resty/v2']);
const DB_DEPS = new Set(['pg', 'postgres', 'mysql', 'mysql2', 'mongodb', 'mongoose', 'redis', 'ioredis', 'psycopg', 'psycopg2', 'psycopg2-binary', 'asyncpg', 'pymongo', 'motor', 'neo4j', 'neo4j-driver', 'elasticsearch', '@elastic/elasticsearch', 'github.com/lib/pq', 'github.com/jackc/pgx/v5', 'github.com/redis/go-redis/v9', 'sqlx', 'diesel', 'tokio-postgres']);
const MCP_DEPS = new Set(['@modelcontextprotocol/sdk', 'fastmcp', 'mcp', 'github.com/mark3labs/mcp-go', 'github.com/modelcontextprotocol/go-sdk', 'rmcp', 'mcp-framework', '@mastra/mcp']);
const DB_ENV = /\b(?:DATABASE_URL|POSTGRES_[A-Z_]+|PG(?:HOST|DATABASE|USER)|MYSQL_[A-Z_]+|MONGO(?:DB)?_URI|REDIS_URL)\b/;
const DB_IMAGE = /^\s*image:\s*["']?(?:[\w./-]*\/)?(?:postgres|postgis|mysql|mariadb|mongo|redis|valkey|elasticsearch|neo4j|clickhouse)\b/im;
const DOCKER_RUN = /\bdocker(?:-compose|\s+compose)\s+up\b|\bdocker\s+run\b/i;

function credentialsIn(texts) {
  const names = new Set();
  const phrases = new Set();
  for (const text of texts) {
    for (const m of text.matchAll(CRED_NAME)) names.add(m[1]);
    for (const [re, label] of [[/\bOAuth\b/g, 'OAuth'], [/\bAPI[ _-]?keys?\b/gi, 'API key']]) {
      for (const m of text.matchAll(re)) {
        const before = text.slice(Math.max(0, m.index - 40), m.index);
        if (ASKED.test(before) && !NEGATED.test(before)) phrases.add(label);
      }
    }
  }
  return { names: [...names].sort(), phrases: [...phrases].sort() };
}

/** The service behind each credential: STRIPE_API_KEY → STRIPE. Unnamed ones → "an external API", only if nothing is named. */
function apisOf(cred) {
  const named = new Set();
  let unnamed = cred.phrases.length > 0;
  for (const n of cred.names) {
    const name = n.replace(ENV_PREFIX, '');
    if (NOT_AN_API.test(name)) continue;
    const head = name.replace(CRED_SUFFIX, '').split('_')[0];
    if (!head || PLACEHOLDER.test(head) || head === 'API') unnamed = true;
    else named.add(head);
  }
  return named.size ? [...named].sort() : unnamed ? ['an external API'] : [];
}

// ---- collections -------------------------------------------------------------------------
const UNIT_PLURAL = { skill: 'skills', agent: 'agents', server: 'MCP servers', plugin: 'plugins' };
const MANIFEST_FILE = /^(package\.json|pyproject\.toml|go\.mod|Cargo\.toml)$/;
const MAX_PART_NAMES = 300;
const dirOf = (p) => p.replace(/[^/]*$/, '');
const baseName = (d) => d.replace(/\/$/, '').split('/').pop();

/**
 * Several skills, agents, MCP servers or plugins in one repo: each part's own size, the typical
 * (median) part and the largest. The most numerous kind of part decides the unit.
 */
function collectionOf(blobs, codeBlobs, mdBlobs, kind) {
  const outsideSkill = (t) => !IN_SKILL.test(t.path);
  const units = {
    skill: blobs.filter((t) => /(^|\/)SKILL\.md$/i.test(t.path) && t.path.includes('/')).map((t) => ({ name: baseName(dirOf(t.path)), prefix: dirOf(t.path) })),
    agent: blobs.filter((t) => /(^|\/)agents\/[^/]+\.md$/i.test(t.path) && outsideSkill(t)).map((t) => ({ name: t.path.split('/').pop().replace(/\.md$/i, ''), file: t.path })),
    plugin: blobs.filter((t) => /(^|\/)\.claude-plugin\/plugin\.json$/.test(t.path) && t.path.split('/').length >= 3).map((t) => ({ name: baseName(dirOf(t.path).replace(/\.claude-plugin\/$/, '')), prefix: dirOf(t.path).replace(/\.claude-plugin\/$/, '') })),
    server: blobs.filter((t) => MANIFEST_FILE.test(t.path.split('/').pop()) && [3, 4].includes(t.path.split('/').length) && !NOT_CODE_DIR.test(t.path)
      && (kind === 'mcp-server' || /mcp|server/i.test(dirOf(t.path)))).map((t) => ({ name: baseName(dirOf(t.path)), prefix: dirOf(t.path) })),
  };
  const [unit, list] = Object.entries(units).sort((a, b) => b[1].length - a[1].length)[0];
  if (list.length < THRESHOLDS.COLLECTION_MIN) return null;
  const sum = (arr, part) => arr.filter((t) => (part.file ? t.path === part.file : t.path.startsWith(part.prefix))).reduce((a, t) => a + (t.size || 0), 0);
  const parts = list.map((p) => ({
    name: p.name, loc: Math.round(sum(codeBlobs, p) / BYTES_PER_LINE), instructionLines: Math.round(sum(mdBlobs, p) / BYTES_PER_MD_LINE),
    hooks: !!p.prefix && blobs.some((t) => t.path.startsWith(p.prefix) && /(^|\/)hooks\/hooks\.json$/i.test(t.path)),
  })).sort((a, b) => a.loc - b.loc || a.instructionLines - b.instructionLines || a.name.localeCompare(b.name));
  const pick = ({ name, loc, instructionLines }) => ({ name, loc, instructionLines });
  return {
    unit, count: parts.length,
    typical: pick(parts[Math.floor((parts.length - 1) / 2)]), largest: pick(parts.at(-1)),
    hooks: parts.some((p) => p.hooks), names: parts.map((p) => p.name).sort().slice(0, MAX_PART_NAMES),
  };
}

/** The part whose name fits one of the user's topics, in their order: { name, topic } or null. */
export function matchPart(names, topics, keywords = {}) {
  for (const topic of topics || []) {
    const terms = [topic, ...(keywords[topic] || [])].map((k) => k.toLowerCase().replace(/[\s.]+/g, '-'));
    const hit = (names || []).find((n) => {
      const tokens = n.toLowerCase().split(/[-_\s.]+/);
      return terms.some((k) => tokens.includes(k) || (k.length >= 5 && n.toLowerCase().includes(k)));
    });
    if (hit) return { name: hit, topic };
  }
  return null;
}

/** For each collection pick: the part for its own evidence topics first, then the profile's topics. Mutates. */
export function matchCollections(recs, profileTopics = [], keywords = {}) {
  for (const r of recs) {
    const c = r.effort?.collection;
    if (!c) continue;
    const topics = [...new Set([...(r.evidence || []).map((e) => e.topic), ...profileTopics])];
    const m = matchPart(c.names, topics, keywords);
    if (m) c.match = m;
  }
  return recs;
}

// ---- facts ------------------------------------------------------------------------------
const TYPE_LABEL = {
  instructions: 'instructions-only skill', 'skill-scripts': 'skill with scripts', plugin: 'plugin with hooks or agents',
  'mcp-server': 'MCP server', app: 'app or standalone tool',
};

/** Everything that doesn't depend on the date: cached by the scan. */
export function effortFacts({ tree = [], truncated = false, readme = '', files = {}, kind = null } = {}) {
  const blobs = tree.filter((t) => t.type === 'blob');
  const seen = new Set(); // identical copies (same file name and size, e.g. bundled into a "pack") count once
  const codeBlobs = blobs.filter((t) => LANG[ext(t.path)] && !NOT_CODE_DIR.test(t.path) && !NOT_CODE_FILE.test(t.path))
    .filter((t) => { const k = `${t.path.split('/').pop()}|${t.size}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const codeBytes = codeBlobs.reduce((a, t) => a + (t.size || 0), 0);
  const byLang = {};
  for (const t of codeBlobs) byLang[LANG[ext(t.path)]] = (byLang[LANG[ext(t.path)]] || 0) + (t.size || 0);
  const languages = Object.entries(byLang).filter(([, b]) => b >= codeBytes * 0.1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l);
  const mdBlobs = blobs.filter((t) => ext(t.path) === 'md' && !NOT_INSTRUCTIONS.test(t.path) && !/(^|\/)docs?\//i.test(t.path));
  const instructionLines = Math.round(mdBlobs.reduce((a, t) => a + (t.size || 0), 0) / BYTES_PER_MD_LINE);
  const has = (re) => blobs.some((t) => re.test(t.path));
  const parts = {
    skills: blobs.filter((t) => /(^|\/)SKILL\.md$/i.test(t.path)).length,
    hooks: blobs.some((t) => /(^|\/)hooks\/hooks\.json$/i.test(t.path) && !IN_SKILL.test(t.path)),
    agents: blobs.filter((t) => /(^|\/)agents\/[^/]+\.md$/i.test(t.path) && !IN_SKILL.test(t.path)).length,
    commands: blobs.filter((t) => /(^|\/)commands\/[^/]+\.md$/i.test(t.path) && !IN_SKILL.test(t.path)).length,
    pluginManifest: has(/^\.claude-plugin\/(plugin|marketplace)\.json$/),
  };

  const deps = dependencyNames(files);
  const mcpConfig = (() => { try { return JSON.parse(fileOf(files, /^\.mcp\.json$/) || 'null'); } catch { return null; } })();
  const mcpEnv = Object.values(mcpConfig?.mcpServers || {}).flatMap((s) => Object.keys(s?.env || {})).join('\n');
  const envFile = fileOf(files, /^\.env\.(example|sample|template)$/) || '';
  const compose = fileOf(files, /^(docker-)?compose\.ya?ml$/) || '';
  const cred = credentialsIn([readme || '', envFile, mcpEnv, compose]);
  const apis = apisOf(cred);
  const services = [];
  // Docker is needed when there's a compose file, or when the README's only way to run it is docker.
  if (has(/^(docker-)?compose\.ya?ml$/) || (DOCKER_RUN.test(readme || '') && !OTHER_INSTALL.test(readme || ''))) services.push('docker');
  if ((deps || []).some((d) => DB_DEPS.has(d)) || DB_IMAGE.test(compose) || DB_ENV.test(`${envFile}\n${compose}`)) services.push('database');
  const remoteMcp = Object.values(mcpConfig?.mcpServers || {}).some((s) => /^https?:\/\//.test(s?.url || ''));
  const network = apis.length > 0 || remoteMcp || (deps || []).some((d) => HTTP_DEPS.has(d));

  const loc = Math.round(codeBytes / BYTES_PER_LINE);
  // Where the code lives: inside skill folders (a skill with scripts) or beside them (an app with a skill).
  const skillDirs = blobs.filter((t) => /(^|\/)SKILL\.md$/i.test(t.path)).map((t) => t.path.replace(/SKILL\.md$/i, ''));
  const inSkill = (p) => skillDirs.some((d) => p.startsWith(d));
  const skillCodeShare = codeBytes ? codeBlobs.filter((t) => inSkill(t.path)).reduce((a, t) => a + (t.size || 0), 0) / codeBytes : 0;
  // An MCP SDK dependency is proof; the catalog's kind (from topics) only decides when nothing else does.
  const structural = parts.hooks || parts.agents || (parts.skills && skillCodeShare >= 0.5);
  const isMcp = (deps || []).some((d) => MCP_DEPS.has(d)) || (kind === 'mcp-server' && loc > 0 && !structural);
  const collection = collectionOf(blobs, codeBlobs, mdBlobs, kind);
  const type = collection ? 'collection' : isMcp ? 'mcp-server'
    : (parts.hooks || parts.agents) ? 'plugin'
      : loc === 0 ? 'instructions'
        : (kind !== 'app' && (parts.skills ? skillCodeShare >= 0.5 : parts.pluginManifest || parts.commands)) ? 'skill-scripts'
          : 'app';
  return {
    type, typeLabel: collection ? `collection of ${collection.count} ${UNIT_PLURAL[collection.unit]}` : TYPE_LABEL[type], files: blobs.length, codeFiles: codeBlobs.length, loc, instructionLines, languages,
    dependencies: deps ? deps.length : null,
    needs: {
      credentials: [...cred.names, ...cred.phrases].slice(0, MAX_LISTED), credentialCount: cred.names.length + cred.phrases.length,
      apis: apis.slice(0, MAX_LISTED), apiCount: apis.length, network, services,
    },
    parts, collection, truncated: !!truncated,
  };
}

// ---- advice -----------------------------------------------------------------------------
export const approx = (n) => (n < 100 ? Math.max(10, Math.round(n / 10) * 10) : n < 1000 ? Math.round(n / 50) * 50 : Math.round(n / 100) * 100).toLocaleString('en-US');
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

function sizeText(f) {
  const least = f.truncated ? 'at least ' : '';
  if (!f.loc) return `${least}~${approx(f.instructionLines)} lines of Markdown`;
  return `${least}~${approx(f.loc)} lines of ${f.languages[0] || 'code'}${f.languages.length > 1 ? ' and more' : ''}`;
}

function buildForm(f) {
  if (f.parts.hooks) return 'hook';
  if (f.parts.agents) return 'subagent';
  if (f.parts.commands && !f.parts.skills) return 'slash command';
  if (f.type === 'instructions') return f.instructionLines <= THRESHOLDS.NOTE_MAX_LINES ? 'CLAUDE.md note' : 'skill';
  return 'skill with a script';
}

function buildTime(f) {
  if (!f.loc) return f.instructionLines <= 200 ? 'under an hour' : f.instructionLines <= 800 ? '1–2 hours' : 'a few hours for the part you need';
  if (f.loc <= 100) return 'about an hour';
  if (f.loc <= THRESHOLDS.SMALL_LOC) return '2–4 hours';
  if (f.loc <= THRESHOLDS.ACTIVE_MIN_LOC) return 'about a day';
  return 'a few days';
}

/** A collection part on its own: its size, and the kind of thing it is. Repo-wide needs stay with the repo. */
function partFacts(c, p, languages) {
  const unitType = { server: 'mcp-server', agent: 'plugin', plugin: 'plugin', skill: p.loc ? 'skill-scripts' : 'instructions' }[c.unit];
  return {
    type: unitType, typeLabel: TYPE_LABEL[unitType], loc: p.loc, instructionLines: p.instructionLines, languages,
    parts: { skills: c.unit === 'skill' ? 1 : 0, agents: c.unit === 'agent' ? 1 : 0, hooks: c.unit === 'plugin' && c.hooks, commands: 0 },
    needs: { credentials: [], credentialCount: 0, apis: [], apiCount: 0, network: false, services: [] }, truncated: false,
  };
}

/** Collections are judged by the typical part (and the largest is named), never by the total. */
function adviseCollection(f, opts) {
  const c = f.collection;
  const typical = advise(partFacts(c, c.typical, f.languages), opts);
  const largest = advise(partFacts(c, c.largest, f.languages), opts);
  const one = { skill: 'one', agent: 'one', server: 'one', plugin: 'one' }[c.unit];
  const same = c.largest.name === c.typical.name;
  const reason = `Collection of ${c.count} ${UNIT_PLURAL[c.unit]}: a typical ${one} is ${sizeText(partFacts(c, c.typical, f.languages))}`
    + `${same ? '' : `; the largest, ${c.largest.name}, ${sizeText(partFacts(c, c.largest, f.languages))} (${largest.adviceLabel})`}. Take only the part you need.`;
  return { ...typical, reason, collectionAdvice: { typical, largest } };
}

/** Build your own / Either / Install, with a form, a time and one plain reason. */
export function advise(f, { pushedAt = null, now = Date.now() } = {}) {
  if (f.collection) {
    const { collectionAdvice, ...rest } = adviseCollection(f, { pushedAt, now });
    return { ...rest, collection: { ...f.collection, typicalAdvice: collectionAdvice.typical.advice, largestAdvice: { advice: collectionAdvice.largest.advice, adviceLabel: collectionAdvice.largest.adviceLabel } } };
  }
  const T = THRESHOLDS;
  const days = pushedAt ? Math.floor((now - Date.parse(pushedAt)) / 86400e3) : null;
  const active = days != null && days <= T.ACTIVE_DAYS;
  const { apis, services, credentials } = f.needs;
  const size = sizeText(f);
  const what = f.type === 'instructions' ? 'Only instructions' : `A ${f.typeLabel}`;
  const apiCount = f.needs.apiCount ?? apis.length;
  const apiText = apiCount > 2 ? [`${apiCount} APIs (${apis.slice(0, 3).join(', ')}${apiCount > 3 ? ', …' : ''})`] : apis.map((a) => (a === 'an external API' ? a : `the ${a} API`));
  const credText = credentials.filter((c) => /^[A-Z0-9_]+$/.test(c)).slice(0, 2);

  let advice, reason;
  if (f.loc >= T.LARGE_LOC || f.truncated) {
    advice = 'install';
    reason = apis.length ? `Wraps ${list(apiText)} with ${size}: installing saves you keeping up with it.`
      : `${size[0].toUpperCase()}${size.slice(1)}: far more than you'd want to write and maintain.`;
  } else if (f.loc > T.SMALL_LOC && services.length) {
    advice = 'install'; reason = `Needs ${list(services)} running and has ${size}: install it and follow its setup.`;
  } else if (f.loc > T.SMALL_LOC && apis.length) {
    advice = 'install'; reason = `Wraps ${list(apiText)} with ${size}: installing saves you keeping up with it.`;
  } else if (active && f.loc >= T.ACTIVE_MIN_LOC) {
    advice = 'install'; reason = `Actively maintained (pushed ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}) with ${size}: hard to keep up with on your own.`;
  } else if ((f.type === 'instructions' || f.loc <= T.SMALL_LOC) && !apis.length && !services.length) {
    advice = 'build';
    reason = !f.loc && f.instructionLines > 800
      ? `${what} (${size}) and no external API: write your own for the part you need.`
      : `${what} (${size}) and no external API, so writing your own is quick.`;
  } else if (apis.length || services.length) {
    advice = 'either';
    const need = credText.length ? ` (needs ${credText.join(', ')})` : services.length ? ` (needs ${list(services)})` : '';
    reason = `${f.loc ? 'Small' : 'Only instructions'} (${size}) but tied to ${apis.length ? list(apiText) : list(services)}${need}: build it if you need only a little of it, install it to get fixes.`;
  } else {
    advice = 'either';
    reason = `Medium-sized (${size}), no external API: building is real work; installing is quicker if it fits as it is.`;
  }
  const label = { build: 'Build your own', either: 'Either', install: 'Install' }[advice];
  return {
    advice, adviceLabel: label,
    buildForm: advice === 'install' ? null : buildForm(f),
    buildTime: advice === 'install' ? null : buildTime(f),
    reason,
  };
}

export function estimateEffort({ pushedAt = null, now = Date.now(), ...input } = {}) {
  const facts = effortFacts(input);
  return { ...facts, ...advise(facts, { pushedAt, now }) };
}

/** One line for text output: "Build your own (skill, under an hour): …" / "Install: …". */
export function effortLine(e) {
  const extra = e.advice === 'install' ? '' : ` (${e.buildForm}, ${e.buildTime})`;
  const match = e.collection?.match ? ` For your ${e.collection.match.topic} work: ${e.collection.match.name}.` : '';
  return `${e.adviceLabel}${extra}: ${e.reason}${match}`;
}

// Shared vocabulary used both to profile the user's sessions and to tag GitHub repos.
// Each topic is a list of keywords matched on word boundaries, case-insensitive.

export const TOPICS = {
  testing: ['test', 'tests', 'testing', 'pytest', 'jest', 'vitest', 'playwright', 'cypress', 'unit test', 'e2e', 'coverage', 'tdd', 'mocha', 'test suite'],
  frontend: ['react', 'vue', 'svelte', 'nextjs', 'next.js', 'tailwind', 'css', 'html', 'frontend', 'front-end', 'component', 'vite', 'shadcn'],
  design: ['figma', 'ui design', 'ux', 'mockup', 'typography', 'design system', 'landing page', 'wireframe'],
  backend: ['rest api', 'graphql', 'express', 'fastapi', 'django', 'flask', 'endpoint', 'backend', 'microservice', 'webhook'],
  database: ['sql', 'postgres', 'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'database', 'supabase', 'prisma', 'migration', 'schema'],
  devops: ['docker', 'kubernetes', 'k8s', 'terraform', 'ci/cd', 'github actions', 'deploy', 'deployment', 'aws', 'gcp', 'azure', 'vercel', 'nginx', 'helm', 'cloudflare'],
  git: ['git', 'github', 'pull request', 'commit', 'rebase', 'merge conflict', 'code review', 'gitlab'],
  data: ['pandas', 'numpy', 'csv', 'dataframe', 'jupyter', 'notebook', 'data analysis', 'matplotlib', 'dataset', 'etl', 'polars', 'visualization'],
  ml: ['pytorch', 'tensorflow', 'model training', 'llm', 'embedding', 'embeddings', 'fine-tune', 'fine-tuning', 'huggingface', 'rag', 'vector database'],
  browser: ['scrape', 'scraping', 'scraper', 'crawler', 'browser automation', 'puppeteer', 'selenium', 'headless', 'web automation', 'chrome devtools'],
  docs: ['documentation', 'readme', 'markdown', 'docstring', 'changelog', 'technical writing', 'api docs'],
  security: ['security', 'vulnerability', 'vulnerabilities', 'oauth', 'secrets', 'cve', 'security audit', 'encryption', 'sast'],
  // Kept apart from defensive security so a red-team kit doesn't match "rotate my secrets" work.
  'offensive-security': ['pentest', 'pentesting', 'penetration testing', 'red team', 'red-team', 'redteam', 'bug bounty', 'bug hunting', 'ctf', 'exploit development', 'offensive security', 'exploitation'],
  ios: ['ios', 'swift', 'swiftui', 'xcode', 'iphone', 'ipad', 'uikit', 'react native', 'flutter', 'mobile app'],
  android: ['android', 'kotlin', 'jetpack compose', 'gradle', 'react native', 'flutter', 'mobile app'],
  finance: ['trading', 'backtest', 'backtesting', 'backtester', 'forex', 'stock', 'stocks', 'portfolio', 'quant', 'crypto', 'ohlc'],
  productivity: ['notion', 'slack', 'jira', 'linear', 'calendar', 'gmail', 'obsidian', 'todo', 'task management'],
  memory: ['memory', 'long-term memory', 'knowledge base', 'knowledge graph', 'context management', 'persistent context'],
  debugging: ['debug', 'debugger', 'debugging', 'stack trace', 'traceback', 'root cause', 'error'],
  refactoring: ['refactor', 'refactoring', 'lint', 'linter', 'formatter', 'dead code', 'code quality', 'clean code'],
  office: ['pdf', 'docx', 'excel', 'xlsx', 'pptx', 'powerpoint', 'spreadsheet', 'word document'],
  media: ['video', 'image generation', 'audio', 'ffmpeg', 'animation', 'svg', 'transcription'],
  planning: ['spec', 'prd', 'architecture', 'roadmap', 'plan mode', 'requirements', 'task breakdown'],
};

// File extension / filename -> topics + language
export const EXT_HINTS = {
  '.py': { lang: 'Python' }, '.ipynb': { lang: 'Python', topics: ['data'] },
  '.ts': { lang: 'TypeScript' }, '.tsx': { lang: 'TypeScript', topics: ['frontend'] },
  '.js': { lang: 'JavaScript' }, '.mjs': { lang: 'JavaScript' }, '.jsx': { lang: 'JavaScript', topics: ['frontend'] },
  '.vue': { lang: 'Vue', topics: ['frontend'] }, '.svelte': { lang: 'Svelte', topics: ['frontend'] },
  '.css': { topics: ['frontend'] }, '.scss': { topics: ['frontend'] }, '.html': { lang: 'HTML', topics: ['frontend'] },
  '.swift': { lang: 'Swift', topics: ['ios'] }, '.kt': { lang: 'Kotlin', topics: ['android'] },
  '.go': { lang: 'Go' }, '.rs': { lang: 'Rust' }, '.java': { lang: 'Java' }, '.rb': { lang: 'Ruby' },
  '.php': { lang: 'PHP' }, '.cs': { lang: 'C#' }, '.cpp': { lang: 'C++' }, '.c': { lang: 'C' },
  '.sql': { topics: ['database'] }, '.tf': { lang: 'HCL', topics: ['devops'] },
  '.md': { topics: ['docs'] }, '.mdx': { topics: ['docs'] },
  '.csv': { topics: ['data'] }, '.parquet': { topics: ['data'] },
  '.pdf': { topics: ['office'] }, '.docx': { topics: ['office'] }, '.xlsx': { topics: ['office'] }, '.pptx': { topics: ['office'] },
  '.mp4': { topics: ['media'] }, '.png': { topics: ['media'] }, '.svg': { topics: ['media'] },
};
export const FILENAME_HINTS = [
  [/(^|\/)dockerfile$/i, ['devops']], [/docker-compose\.ya?ml$/i, ['devops']],
  [/\.github\/workflows\//i, ['devops', 'git']], [/(\.|_)test\.|\.spec\.|(^|\/)tests?\//i, ['testing']],
  [/migrations?\//i, ['database']],
];

// Shell command head -> topics
export const COMMAND_HINTS = {
  pytest: ['testing'], jest: ['testing'], vitest: ['testing'], playwright: ['testing', 'browser'], cypress: ['testing'],
  docker: ['devops'], 'docker-compose': ['devops'], kubectl: ['devops'], terraform: ['devops'], helm: ['devops'],
  aws: ['devops'], gcloud: ['devops'], vercel: ['devops'], wrangler: ['devops'],
  git: ['git'], gh: ['git'],
  psql: ['database'], sqlite3: ['database'], mysql: ['database'], prisma: ['database'],
  ffmpeg: ['media'], xcodebuild: ['ios'], swift: ['ios'], xcrun: ['ios'], flutter: ['ios', 'android'], adb: ['android'], gradle: ['android'],
  eslint: ['refactoring'], prettier: ['refactoring'], ruff: ['refactoring'], black: ['refactoring'],
  jupyter: ['data'],
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const COMPILED = Object.fromEntries(
  Object.entries(TOPICS).map(([t, kws]) => [
    t,
    new RegExp(`(?<![a-z0-9])(?:${kws.map(escape).join('|')})(?![a-z0-9])`, 'i'),
  ]),
);

// ---------------------------------------------------------------------------
// Repo-side matching. A repo description says what the repo *is* up front and lists
// incidental features, integrations and packaging later. So evidence is weighted by where
// a keyword appears, by how specific the keyword is, and by the words around it.

// Signal a topic in the user's own prompts but too vague to tag a repo with.
const PROMPT_ONLY = new Set(['error', 'github', 'test', 'tests', 'deploy', 'deployment', 'coverage', 'notebook',
  'component', 'schema', 'migration', 'spec', 'requirements', 'endpoint', 'stack trace', 'merge conflict', 'commit']);
// Usually name a technology a repo is built with or shipped as, not what it is for.
const WEAK = new Set(['docker', 'html', 'css', 'database', 'csv', 'memory', 'svg', 'video', 'audio', 'animation', 'pdf',
  'markdown', 'readme', 'architecture', 'dataset', 'visualization', 'llm', 'rag', 'calendar', 'git', 'debug']);

// Words that, right before / after a keyword, switch it to a different sense.
const NEG_BEFORE = {
  testing: ['in-game', 'a/b', 'ab', 'split', 'usability', 'user', 'penetration', 'pen', 'beta', 'market', 'stress-testing your'],
  finance: ['design', 'creative'], // "design portfolio"
};
const NEG_AFTER = {
  database: /^\s*(injection|i\b)/i, // "SQL injection" is a vulnerability class
  finance: /^\s*(photos?|images?|footage|website|site|template)\b/i, // stock photos, portfolio website
};
// Keywords whose sense is decided by the rest of the text.
const SENSE = [
  { keyword: 'crypto', unless: /\b(ctf|cryptograph\w*|cipher\w*|pwn|forensics?|encrypt\w*|hash(es|ing)?)\b/i },
];
// Platform topics mean *building for* the platform, not apps that run on it.
const DEV_CONTEXT = {
  ios: /\b(swift(ui)?|xcode\w*|uikit|simulators?|build(s|ing)?|develop(ing|ment)?|projects?|sdk|test(s|ing)?|ship(ping)?|app development)\b/i,
  android: /\b(kotlin|jetpack|gradle|emulators?|build(s|ing)?|develop(ing|ment)?|projects?|sdk|test(s|ing)?|ship(ping)?|app development)\b/i,
};
// When a repo is clearly the first topic, its matches on the second are the same sense.
const SUPPRESS = { 'offensive-security': ['security', 'testing'] };

// Evidence weights per source. Noisy-or across sources; within a source, extra distinct
// keywords add a little. A topic needs MIN_EVIDENCE to count, so a lone tail mention or a
// lone tag (both easy to stuff) is not enough on its own.
export const EVIDENCE = { head: 1, headWeak: 0.6, tailEarly: 0.35, tailLate: 0.2, tag: 0.4, weakFactor: 0.4, extra: 0.1, min: 0.45 };
const TAIL_EARLY_CHARS = 120;

const REPO_KEYWORDS = Object.fromEntries(Object.entries(TOPICS).map(([t, kws]) => [t, kws.filter((w) => !PROMPT_ONLY.has(w))]));
const KW_RE = Object.fromEntries(Object.entries(REPO_KEYWORDS).map(([t, kws]) => [
  t, new RegExp(`(?<![a-z0-9])(${[...kws].sort((a, b) => b.length - a.length).map(escape).join('|')})(?![a-z0-9])`, 'gi'),
]));

/** First clause of a description: what the repo is. Short "Name: tagline" heads extend one clause. */
export function splitHead(desc) {
  const d = String(desc || '').trim();
  const boundary = /([.!?](?=\s|$)|:\s|\s[—–-]{1,2}\s|\s\|\s|·|。)/g;
  let end = d.length;
  let m;
  while ((m = boundary.exec(d))) {
    const cand = m.index;
    if (d.slice(0, cand).split(/\s+/).filter(Boolean).length >= 4) { end = cand; break; }
  }
  end = Math.min(end, 200);
  return { head: d.slice(0, end), tail: d.slice(end), tailOffset: end };
}

function validMatches(topic, text) {
  const out = [];
  const re = KW_RE[topic];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    const kw = m[1].toLowerCase();
    const before = text.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    const after = text.slice(m.index + m[1].length, m.index + m[1].length + 16);
    if ((NEG_BEFORE[topic] || []).some((w) => before.endsWith(`${w} `) || before.endsWith(`${w}-`))) continue;
    if (NEG_AFTER[topic]?.test(after)) continue;
    if (SENSE.some((s) => s.keyword === kw && s.unless.test(text))) continue;
    if (m[1] === 'ReAct' || (kw === 'react' && /^[\s-]*(agents?|pattern|loop)\b/i.test(after))) continue; // the agent pattern
    out.push({ kw, index: m.index, inList: inEnumeration(text, m.index) });
  }
  return out;
}

/** True when position `i` sits in a comma list ("…, Anthropic, AWS, OpenAI, …"): a feature/integration list, not the purpose. */
function inEnumeration(text, i) {
  const clauseStart = Math.max(...['.', ':', ';', '(', '|', '。'].map((c) => text.lastIndexOf(c, i))) + 1;
  const ends = ['.', ':', ';', ')', '|', '。'].map((c) => text.indexOf(c, i)).filter((x) => x >= 0);
  const clauseEnd = ends.length ? Math.min(...ends) : text.length;
  const sep = /[,、，]|\band\b|\bor\b/g;
  const items = [];
  let last = clauseStart, m;
  const clause = text.slice(clauseStart, clauseEnd);
  while ((m = sep.exec(clause))) { items.push([last, clauseStart + m.index]); last = clauseStart + m.index + m[0].length; }
  items.push([last, clauseEnd]);
  const words = ([a, b]) => text.slice(a, b).trim().split(/\s+/).filter(Boolean).length;
  const nonEmpty = items.filter((it) => words(it) > 0);
  const own = nonEmpty.find(([a, b]) => i >= a && i < b);
  return nonEmpty.length >= 4 && !!own && words(own) <= 3 && nonEmpty.filter((it) => words(it) <= 3).length >= 3;
}

// Strongest keyword counts fully; each further distinct keyword adds a share of its own weight.
const sourceStrength = (weights) => {
  if (!weights.length) return 0;
  const s = [...weights].sort((a, b) => b - a);
  return Math.min(1, s[0] + s.slice(1).reduce((a, w) => a + EVIDENCE.extra * (w / EVIDENCE.tag), 0));
};

/**
 * Topic evidence for a repo. Returns { topic: { strength, inHead, keywords } } for topics
 * that clear EVIDENCE.min.
 */
export function repoTopicEvidence(repo) {
  const name = String(repo.name || '').replace(/[-_]/g, ' ');
  const { head, tail, tailOffset } = splitHead(repo.description);
  const headText = `${name} | ${head}`;
  const tagText = (repo.topics || []).join(' , ').replace(/-/g, ' ');
  const fullText = `${name} ${repo.description || ''}`;
  const kwWeight = (kw, base) => (WEAK.has(kw) ? base * EVIDENCE.weakFactor : base);

  const found = {};
  for (const topic of Object.keys(KW_RE)) {
    const headHits = validMatches(topic, headText);
    const tailHits = validMatches(topic, tail);
    const tagHits = validMatches(topic, tagText);
    if (!headHits.length && !tailHits.length && !tagHits.length) continue;
    if (DEV_CONTEXT[topic] && !DEV_CONTEXT[topic].test(fullText)) continue;
    const uniq = (hits, w) => [...new Map(hits.map((h) => [h.kw, w(h)])).values()];
    // A keyword in a comma list inside the head is an integration/feature, so it counts like an early tail mention.
    const hs = sourceStrength(uniq(headHits, (h) => (h.inList ? kwWeight(h.kw, EVIDENCE.tailEarly) : WEAK.has(h.kw) ? EVIDENCE.headWeak : EVIDENCE.head)));
    const ts = sourceStrength(uniq(tailHits, (h) => kwWeight(h.kw, tailOffset + h.index < TAIL_EARLY_CHARS ? EVIDENCE.tailEarly : EVIDENCE.tailLate)));
    const gs = sourceStrength(uniq(tagHits, (h) => kwWeight(h.kw, EVIDENCE.tag)));
    const strength = 1 - (1 - hs) * (1 - ts) * (1 - gs);
    if (strength < EVIDENCE.min) continue;
    found[topic] = {
      strength: Number(strength.toFixed(3)),
      inHead: headHits.some((h) => !h.inList),
      keywords: [...new Set([...headHits, ...tailHits, ...tagHits].map((h) => h.kw))],
    };
  }
  for (const [t, drops] of Object.entries(SUPPRESS)) if (found[t]) drops.forEach((d) => delete found[d]);
  return found;
}

// ---------------------------------------------------------------------------
// Tool affinity. Most keywords are categories ("testing", "database"); the rest name a
// specific tool (pytest, playwright, prisma). If a repo's only evidence for a topic is a
// tool the user never uses while they do use a sibling tool, it fits less well.
const GENERIC = new Set([
  'test', 'tests', 'testing', 'unit test', 'e2e', 'coverage', 'tdd', 'test suite',
  'css', 'html', 'frontend', 'front-end', 'component',
  'rest api', 'endpoint', 'backend', 'microservice', 'webhook',
  'sql', 'database', 'migration', 'schema',
  'ci/cd', 'deploy', 'deployment',
  'csv', 'dataframe', 'notebook', 'data analysis', 'dataset', 'etl', 'visualization',
  'model training', 'llm', 'embedding', 'embeddings', 'fine-tune', 'fine-tuning', 'rag', 'vector database',
  'scrape', 'scraping', 'scraper', 'crawler', 'browser automation', 'headless', 'web automation',
  'ios', 'iphone', 'ipad', 'mobile app', 'android',
]);
const AFFINITY_TOPICS = new Set(['testing', 'frontend', 'backend', 'database', 'devops', 'data', 'ml', 'browser', 'ios', 'android']);
// Command heads that name a vocabulary tool under a different word.
const COMMAND_ALIASES = { kubectl: 'kubernetes', psql: 'postgres', xcodebuild: 'xcode', xcrun: 'xcode', 'docker-compose': 'docker', gh: 'github' };
const TOOL_RE = new RegExp(`(?<![a-z0-9])(${[...new Set(Object.values(TOPICS).flat())].filter((k) => !GENERIC.has(k)).sort((a, b) => b.length - a.length).map(escape).join('|')})(?![a-z0-9])`, 'gi');
const KW_TOPICS = {};
for (const [t, kws] of Object.entries(TOPICS)) for (const k of kws) (KW_TOPICS[k] ||= []).push(t);

/** Specific tool names (fixed vocabulary only) mentioned in a prompt. */
export function toolKeywordsIn(text) {
  return new Set([...String(text || '').matchAll(TOOL_RE)].map((m) => m[1].toLowerCase()));
}
/** Specific tool name for a command head ("kubectl get" -> "kubernetes"), or null. */
export function toolForCommand(head) {
  const bin = String(head || '').split(' ')[0].toLowerCase();
  const kw = COMMAND_ALIASES[bin] || bin;
  return KW_TOPICS[kw] && !GENERIC.has(kw) ? kw : null;
}

/**
 * 1 normally; `penalty` when the repo's evidence for `topic` is only specific tools the
 * user never mentioned while the user does use other specific tools in that topic.
 */
export function toolAffinity(topic, repoKeywords, userTools, penalty = 0.6) {
  if (!AFFINITY_TOPICS.has(topic) || !userTools) return 1;
  const inTopic = (k) => (KW_TOPICS[k] || []).includes(topic);
  const repoKw = (repoKeywords || []).filter(inTopic);
  if (!repoKw.length || repoKw.some((k) => GENERIC.has(k))) return 1;
  const mine = Object.keys(userTools).filter((k) => inTopic(k) && !GENERIC.has(k));
  if (!mine.length || repoKw.some((k) => mine.includes(k))) return 1;
  return penalty;
}

/** Topics for a repo (set view of repoTopicEvidence over a bare text). */
export function repoTopicsIn(text) {
  return new Set(Object.keys(repoTopicEvidence({ name: '', description: text })));
}

/** Return the set of topics whose keywords appear in `text`. */
export function topicsIn(text) {
  const out = new Set();
  if (!text) return out;
  for (const [t, re] of Object.entries(COMPILED)) if (re.test(text)) out.add(t);
  return out;
}

// ---------------------------------------------------------------------------
// Platform fit. The user's OS comes from process.platform (never leaves the machine). A repo
// is "only" for an OS when it says it runs there (for / on / native / -only / "<OS> app",
// "Windows Sandbox", or the OS as a name token), not when it merely mentions it: "manage your
// Linux servers" runs fine from a Mac. Naming two or more desktop OSes means cross-platform.
const OS_TERMS = {
  windows: String.raw`windows|win32|win64|win1[01]`,
  macos: String.raw`macos|mac\s?os|os\s?x|osx|apple silicon|mac`,
  linux: String.raw`linux|ubuntu|debian|fedora|wayland|x11`,
};
const OS_NAME_TOKENS = { windows: ['win', 'win32', 'win64', 'win10', 'win11'], macos: ['mac', 'macos', 'osx'], linux: ['linux', 'ubuntu', 'wayland'] };
const NOT_WHERE_IT_RUNS = String.raw`(?![\s-]+(?:servers?|hosts?|vms?|virtual machines?|machines?|containers?|boxes|instances?|kernel|fleet|boxes|images?)\b)`;
const OS_RUNS_ON = Object.fromEntries(Object.entries(OS_TERMS).map(([os, t]) => [os, new RegExp(
  String.raw`(?:\b(?:for|on|runs on|native(?:ly)?(?: on)?|only on|exclusively on)\s+(?:the\s+)?(?:${t})\b${NOT_WHERE_IT_RUNS}` +
  String.raw`|\b(?:${t})[\s-]+only\b` +
  String.raw`|\b(?:${t})\s+(?:apps?|applications?|desktops?|sandbox|native|ui automation|automation|computer[\s-]use|clipboard|notifications?|menu\s?bar|tray|registry|services? manager))`, 'i')]));
const OS_ANY = Object.fromEntries(Object.entries(OS_TERMS).map(([os, t]) => [os, new RegExp(String.raw`\b(?:${t})\b`, 'i')]));

/** process.platform -> 'macos' | 'windows' | 'linux' | null */
export function osFamily(platform) {
  return { darwin: 'macos', win32: 'windows', linux: 'linux' }[platform] || null;
}

/** Desktop OSes a repo says it runs on exclusively ([] = any / unknown). */
export function platformsOnly(repo) {
  const desc = String(repo.description || '');
  const tokens = String(repo.name || '').toLowerCase().split(/[-_.\s]+/);
  if (/\bcross[\s-]?platform\b|\bany (?:os|platform)\b/i.test(desc)) return [];
  const mentioned = Object.keys(OS_TERMS).filter((os) => OS_ANY[os].test(desc) || OS_NAME_TOKENS[os].some((t) => tokens.includes(t)));
  if (mentioned.length >= 2) return [];
  return Object.keys(OS_TERMS).filter((os) => OS_RUNS_ON[os].test(desc) || OS_NAME_TOKENS[os].some((t) => tokens.includes(t)));
}

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
  security: ['security', 'vulnerability', 'vulnerabilities', 'oauth', 'secrets', 'cve', 'pentest', 'security audit', 'encryption', 'sast'],
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

// Words that signal a topic in the user's own prompts but are too vague to tag a repo with.
const PROMPT_ONLY = new Set(['error', 'github', 'test', 'tests']);
const COMPILED_REPO = Object.fromEntries(
  Object.entries(TOPICS).map(([t, kws]) => {
    const k = kws.filter((w) => !PROMPT_ONLY.has(w));
    return [t, new RegExp(`(?<![a-z0-9])(?:${k.map(escape).join('|')})(?![a-z0-9])`, 'i')];
  }),
);

/** Topics for a repo's name/description/tags (stricter than topicsIn). */
export function repoTopicsIn(text) {
  const out = new Set();
  if (!text) return out;
  for (const [t, re] of Object.entries(COMPILED_REPO)) if (re.test(text)) out.add(t);
  return out;
}

/** Return the set of topics whose keywords appear in `text`. */
export function topicsIn(text) {
  const out = new Set();
  if (!text) return out;
  for (const [t, re] of Object.entries(COMPILED)) if (re.test(text)) out.add(t);
  return out;
}

// Human review of the build-or-install estimate on 20 real repos: 12 picked with a fixed seed
// from the frozen eval catalog plus 8 hand-chosen examples covering every type.
//   npm run eval:effort        fetch the 20 repos (public names only), estimate, write
//                              docs/eval/effort-review.json and docs/eval/effort-review.md
// The doc is rendered from the JSON only, so test/effort-review.test.mjs can check it offline.
// The "Agree? (y/n)" column is left empty for the reviewer.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { approx } from '../../scripts/lib/effort.mjs';

export const SEED = 2026;
export const RANDOM = 12;
/** Hand-chosen: at least one example of each type, and each advice. `expect` is the type we chose it for. */
export const HAND = [
  { name: 'antonbabenko/terraform-skill', expect: 'instructions' },
  { name: '0xfurai/claude-code-subagents', expect: 'plugin' },
  { name: 'obra/superpowers', expect: 'plugin' },
  { name: 'anthropics/skills', expect: 'skill-scripts' },
  { name: 'microsoft/playwright-mcp', expect: 'mcp-server' },
  { name: 'github/github-mcp-server', expect: 'mcp-server' },
  { name: 'langgenius/dify', expect: 'app' },
  { name: 'cso1z/claude-ip-guard', expect: 'app' },
];
export const REVIEW_MD = fileURLToPath(new URL('../../docs/eval/effort-review.md', import.meta.url));
export const REVIEW_JSON = fileURLToPath(new URL('../../docs/eval/effort-review.json', import.meta.url));

/** mulberry32: a tiny seeded PRNG, so the pick is the same on every machine. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function selectRepos(catalog, { seed = SEED, n = RANDOM } = {}) {
  const hand = new Set(HAND.map((h) => h.name.toLowerCase()));
  const pool = Object.keys(catalog.repos).filter((k) => !hand.has(k.toLowerCase())).sort();
  const rand = rng(seed);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return [...pool.slice(0, n).map((name) => ({ name, source: `seed ${seed}` })), ...HAND.map((h) => ({ name: h.name, source: 'hand' }))];
}

// ---- rendering --------------------------------------------------------------------------
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const num = (n) => Number(n).toLocaleString('en-US');

function sizeCell(e) {
  const deps = e.dependencies != null ? `, ${e.dependencies} deps` : '';
  if (!e.loc) return `${num(e.files)} files, ~${approx(e.instructionLines)} lines of Markdown${deps}`;
  return `${num(e.files)} files, ~${approx(e.loc)} LOC ${e.languages.join('/')}${deps}${e.truncated ? ' (tree truncated)' : ''}`;
}
function needsCell(e) {
  const n = e.needs;
  const cred = n.credentials.length ? `credentials: ${n.credentials.slice(0, 3).join(', ')}${n.credentialCount > 3 ? ` +${n.credentialCount - 3}` : ''}` : '';
  return [cred, n.services.length ? `running: ${n.services.join(', ')}` : '', n.network ? 'network' : ''].filter(Boolean).join('; ') || '—';
}
const adviceCell = (e) => (e.advice === 'install' ? 'Install' : `${e.adviceLabel} (${e.buildForm}, ${e.buildTime})`);

export function renderReview(results) {
  const rows = results.repos.map((r, i) => (r.effort
    ? `| ${i + 1} | [${r.name}](https://github.com/${r.name}) | ${r.source} | ${cell(r.effort.typeLabel)} | ${cell(sizeCell(r.effort))} | ${cell(needsCell(r.effort))} | ${cell(adviceCell(r.effort))} | ${cell(r.effort.reason)} | |`
    : `| ${i + 1} | [${r.name}](https://github.com/${r.name}) | ${r.source} | — | — | — | not estimated | ${cell(r.error || 'could not read the repo')} | |`));
  const count = (k) => results.repos.reduce((o, r) => { const v = r.effort?.[k]; if (v) o[v] = (o[v] || 0) + 1; return o; }, {});
  const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  return [
    '# Build-or-install estimate: review',
    '',
    `Run on ${results.generatedAt.slice(0, 10)} with \`npm run eval:effort\` (tool-scout ${results.version}). 20 repos: ${RANDOM} picked`,
    `with seed ${results.seed} from the frozen eval catalog (\`test/eval/catalog.json\`), plus ${HAND.length} chosen by hand so`,
    'every type appears. Sizes and needs come from each repo\'s file tree and a few manifests at the',
    'time of the run. Thresholds: [docs/USAGE.md](../USAGE.md#build-or-install).',
    '',
    `**Types:** ${fmt(count('type'))}. **Advice:** ${fmt(count('advice'))}.`,
    '',
    '**For the reviewer:** fill in the last column with `y` or `n` (and a word on why, if `n`).',
    'It is left empty on purpose.',
    '',
    '| # | Repo | Picked | What it is | Size | Needs | Advice | Reason | Agree? (y/n) |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

// ---- running ----------------------------------------------------------------------------
async function main() {
  const { createClient, githubToken } = await import('../../scripts/lib/github.mjs');
  const { scanRepo } = await import('../../scripts/lib/scan.mjs');
  const { advise } = await import('../../scripts/lib/effort.mjs');
  const { slim, classify } = await import('../../scripts/lib/crawl.mjs');
  const catalog = JSON.parse(fs.readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
  const version = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  const client = createClient({ token: githubToken(), log: (m) => process.stderr.write(`[effort] ${m}\n`) });
  const now = Date.now();
  const repos = [];
  for (const { name, source } of selectRepos(catalog)) {
    try {
      const meta = (await client.request(`https://api.github.com/repos/${name}`)).data;
      if (!meta) throw new Error('repo not found');
      const repo = slim(meta);
      const scan = await scanRepo(client, repo.full_name, { kind: classify(repo) });
      repos.push({ name: repo.full_name, source, kind: classify(repo), pushedAt: repo.pushedAt, effort: { ...scan.effortFacts, ...advise(scan.effortFacts, { pushedAt: repo.pushedAt, now }) } });
    } catch (e) { repos.push({ name, source, error: e.message }); }
    process.stderr.write(`[effort] ${name}: ${repos.at(-1).effort?.advice || repos.at(-1).error}\n`);
  }
  const results = { generatedAt: new Date(now).toISOString(), version, seed: SEED, repos };
  fs.mkdirSync(new URL('../../docs/eval/', import.meta.url), { recursive: true });
  fs.writeFileSync(REVIEW_JSON, `${JSON.stringify(results, null, 2)}\n`);
  fs.writeFileSync(REVIEW_MD, renderReview(results));
  console.log(`Wrote ${REVIEW_MD} (${client.state.requests} GitHub requests)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

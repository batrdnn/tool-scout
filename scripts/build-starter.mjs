// npm run starter: regenerate data/starter-catalog.json from a fresh crawl of GitHub, keeping only
// repos whose content scan has no high flag. It is product data, kept apart from the data the ranking is scored on
// (nothing is shared), and /release runs it at each release. Needs the network (a GitHub token makes it much faster).
//
//   node scripts/build-starter.mjs [--max-pages 1] [--limit 150] [--candidates 450] [--out data/starter-catalog.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crawl } from './lib/crawl.mjs';
import { createClient, githubToken } from './lib/github.mjs';
import { scanRepo } from './lib/scan.mjs';

const KEEP_KINDS = new Set(['skill', 'plugin', 'mcp-server', 'tool']);

/** The crawl's catalog narrowed to a small starter: the most-starred scannable repos with no high flag. */
export async function buildStarter({ dataDir, maxPages = 1, limit = 150, candidates = 450, crawlFn = crawl, scanFn = scanRepo, client = null, log = () => {} } = {}) {
  const cat = await crawlFn({ dataDir, maxPages, log });
  const pool = Object.values(cat.repos)
    .filter((r) => !r.archived && !r.fork && KEEP_KINDS.has(r.kind))
    .sort((a, b) => b.stars - a.stars || a.full_name.localeCompare(b.full_name))
    .slice(0, candidates);
  const repos = {}; let scanned = 0; let dropped = 0;
  for (const r of pool) {
    if (Object.keys(repos).length >= limit) break;
    scanned++;
    let res;
    try { res = await scanFn(client, r.full_name, { kind: r.kind, description: r.description }); } catch (e) { dropped++; log(`skipped ${r.full_name}: ${e.message}`); continue; }
    if ((res?.flags || []).some((f) => f.severity === 'high')) { dropped++; log(`dropped ${r.full_name}: high flag`); continue; }
    repos[r.full_name] = { ...r, history: (r.history || []).slice(-1) };
  }
  return {
    starter: true,
    note: 'A small snapshot of public GitHub repos for Claude Code skills, plugins and MCP servers, so the first run can rank at once. The first real crawl refreshes it.',
    updatedAt: cat.updatedAt,
    scan: { rule: 'no high flags', at: new Date().toISOString(), scanned, kept: Object.keys(repos).length, dropped },
    repos,
  };
}

const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const out = path.resolve(arg('out', fileURLToPath(new URL('../data/starter-catalog.json', import.meta.url))));
  const log = (m) => process.stderr.write(`[starter] ${m}\n`);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-starter-build-')); // the crawl's own catalog: never the user's data folder
  const client = createClient({ token: githubToken(), log });
  buildStarter({ dataDir, maxPages: Number(arg('max-pages', 1)), limit: Number(arg('limit', 150)), candidates: Number(arg('candidates', 450)), client, log })
    .then((s) => {
      if (Object.keys(s.repos).length < 40) throw new Error(`only ${Object.keys(s.repos).length} repos kept: not writing a starter that small`);
      fs.writeFileSync(out, JSON.stringify(s));
      log(`wrote ${out}: ${s.scan.kept} repos kept of ${s.scan.scanned} scanned (${s.scan.dropped} dropped)`);
    })
    .catch((e) => { log(e.message); process.exit(1); })
    .finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
}

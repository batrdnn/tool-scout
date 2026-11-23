// Standalone trust check for any one repo: content scan (scan.mjs), metadata trust and the
// Claude Code install hint, folded into a verdict. Uses only the repo name in requests.
// Injection-type findings never carry the repo's text (file and line only).

import { normalizeRepo } from './feedback.mjs';
import { scanRepo } from './scan.mjs';
import { slim, classify } from './crawl.mjs';
import { trust } from './rank.mjs';

const NO_TEXT = new Set(['prompt-injection', 'hidden-instructions', 'invisible-unicode', 'exfiltration', 'obfuscated-exec']);
const SEV = { high: 3, medium: 2, low: 1 };

export async function checkRepo(client, input, { now = Date.now() } = {}) {
  const name = normalizeRepo(input);
  if (!name) throw new Error(`not a GitHub repo: ${input} (expected owner/repo or a github.com URL)`);
  const res = await client.request(`https://api.github.com/repos/${name}`);
  if (res.status === 404 || !res.data) throw new Error(`${name}: repo not found (or private)${res.status && res.status !== 404 ? `, GitHub returned ${res.status}` : ''}`);
  const repo = slim(res.data);
  const kind = classify(repo);
  const meta = trust(repo, now);
  const scan = await scanRepo(client, repo.full_name, { kind });
  const flags = scan.flags
    .map(({ excerpt, ...f }) => (NO_TEXT.has(f.id) || !excerpt ? f : { ...f, excerpt }))
    .sort((a, b) => SEV[b.severity] - SEV[a.severity]);
  const worst = Math.max(0, ...flags.map((f) => SEV[f.severity] || 0));
  const reasons = [];
  if (worst === 3) reasons.push('high-severity content flags');
  if (worst === 2) reasons.push('medium-severity content flags');
  if (repo.archived) reasons.push('archived');
  if (meta.tier === 'low') reasons.push(`low metadata trust (${meta.notes.join(', ') || `score ${meta.score}`})`);
  if (!scan.scannedFiles.length) reasons.push('nothing could be read (no README or files)');
  const verdict = worst === 3 ? 'do not install' : reasons.length ? 'review' : 'safe-looking';
  return {
    name: repo.full_name, url: repo.url, kind, description: repo.description, verdict, reasons, flags,
    scannedFiles: scan.scannedFiles,
    metadata: { stars: repo.stars, forks: repo.forks, license: repo.license, ownerType: repo.ownerType, createdAt: repo.createdAt, pushedAt: repo.pushedAt, archived: repo.archived, score: meta.score, tier: meta.tier, notes: meta.notes },
    install: { commands: scan.install || [], ...(scan.installNote ? { note: scan.installNote } : {}) },
  };
}

export function formatCheck(r) {
  const m = r.metadata;
  const lines = [
    `${r.name}  [${r.kind}]  ${r.url}`,
    `Verdict: ${r.verdict}${r.reasons.length ? ` (${r.reasons.join('; ')})` : ''}`,
    `Metadata trust: ${m.tier} (${m.score}/100). ${m.stars}★, ${m.forks} forks, ${m.license || 'no license'}, ${m.ownerType === 'Organization' ? 'organization' : 'personal'} account, created ${String(m.createdAt).slice(0, 10)}, last push ${String(m.pushedAt).slice(0, 10)}${m.archived ? ', ARCHIVED' : ''}${m.notes.length ? `. Notes: ${m.notes.join(', ')}` : ''}`,
    `Scanned: ${r.scannedFiles.join(', ') || 'nothing'}`,
  ];
  if (!r.flags.length) lines.push('Flags: none.');
  for (const f of r.flags) lines.push(`  ⚑ ${f.severity.toUpperCase()} ${f.id}: ${f.detail} (${f.file}${f.line ? `:${f.line}` : ''})${f.excerpt ? ` → ${f.excerpt}` : ''}`);
  lines.push(r.install.commands.length
    ? `Install (from the README; review before running): ${r.install.commands.join(' then ')}${r.install.note ? `, ${r.install.note}` : ''}`
    : `Install: no Claude Code command in the README. See the README: ${r.url}#readme`);
  lines.push('No flags does not mean safe: this is a heuristic scan of the README, SKILL.md files, install scripts, hooks and MCP config, not a security review.');
  return lines.join('\n');
}

#!/usr/bin/env node
// tool-scout: recommend trending Claude Code skills, plugins and MCP servers
// based on how you actually work. Zero dependencies, Node 18+.
//
//   scout.mjs profile   [--days 30] [--show]
//   scout.mjs crawl     [--max-pages 1]
//   scout.mjs recommend [--top 8] [--kind skill,plugin,mcp-server] [--include-low] [--json]
//   scout.mjs all       [--refresh] [...]     profile + crawl (if stale) + recommend
//   recommend/all also measure 7-day star momentum for the top 25 (cached 20h); --offline skips it
//   scout.mjs dismiss   <owner/repo>          never recommend this repo again (no arg: list)
//   scout.mjs undismiss <owner/repo> | --all  bring it back
//
// Common: --data DIR (default $SCOUT_DATA or ~/.tool-scout), --home DIR (default ~)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProfile } from './lib/profile.mjs';
import { crawl, loadCatalog } from './lib/crawl.mjs';
import { recommend } from './lib/rank.mjs';
import { createClient, githubToken } from './lib/github.mjs';
import { measureShortlist } from './lib/momentum.mjs';
import { scanRecommendations } from './lib/scan.mjs';
import { dismiss, undismiss, loadDismissed, dismissedSet } from './lib/feedback.mjs';

const SHORTLIST = 25; // network work (momentum, trust scan) is limited to this many candidates

function parseArgs(argv) {
  const [cmd = 'help', ...rest] = argv;
  const opts = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) { opts._.push(a); continue; }
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else { opts[key] = next; i++; }
  }
  return { cmd, opts };
}

const { cmd, opts } = parseArgs(process.argv.slice(2));
const home = opts.home || os.homedir();
const dataDir = opts.data || process.env.SCOUT_DATA || path.join(home, '.tool-scout');
const log = (m) => process.stderr.write(`[scout] ${m}\n`);

function writeJSON(name, obj) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, name), JSON.stringify(obj, null, 2));
}
function readJSON(name) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')); } catch { return null; }
}

function showProfile(p) {
  const top = (o, n = 6) => Object.entries(o).slice(0, n).map(([k, v]) => `${k} (${v})`).join(', ') || '—';
  console.log(`Profile from ${p.sessions} sessions across ${p.projects} projects (last ${p.windowDays} days)`);
  console.log(`  Topics (sessions):  ${top(p.topics, 8)}`);
  console.log(`  Friction (sessions): ${top(p.friction)}`);
  console.log(`  Languages (edits):  ${top(p.languages)}`);
  console.log(`  Repeated commands:  ${p.repeatedCommands.slice(0, 6).map((c) => `${c.command} ×${c.count}`).join(', ') || '—'}`);
  console.log(`  Already installed:  ${p.installed.names.slice(0, 12).join(', ') || '—'}`);
  console.log(`Stored counts only (no prompt text) in ${path.join(dataDir, 'profile.json')}`);
}

function showRecs(recs) {
  if (!recs.length) {
    console.log('No matches yet. Use Claude Code for a few sessions, or run `crawl` to refresh the catalog.');
    return;
  }
  recs.forEach((r, i) => {
    const ev = r.evidence.map((e) => `${e.topic} in ${e.sessions}/${e.ofSessions} sessions${e.friction ? `, friction in ${e.friction}` : ''}`).join('; ');
    const mom = r.starsLast7d != null
      ? `+${r.starsLast7d}${r.momentumComplete ? '' : '+'}★ last 7d (${r.starsPerDay}/day)`
      : `${r.momentumSource === 'measured' ? '+' : '~'}${r.starsPerDay}★/day`;
    console.log(`\n${i + 1}. ${r.name}  [${r.kind}]  ${r.stars}★  ${mom}  trust: ${r.trust.tier}`);
    if (r.description) console.log(`   ${r.description}`);
    console.log(`   Why: ${ev}`);
    if (r.trust.notes.length) console.log(`   Watch out: ${r.trust.notes.join(', ')}`);
    for (const f of r.trust.flags || []) {
      console.log(`   ⚑ ${f.severity.toUpperCase()} ${f.id}: ${f.detail} (${f.file}${f.line ? `:${f.line}` : ''})${f.excerpt ? ` → ${f.excerpt}` : ''}`);
    }
    if (r.trust.scanned === false && r.trust.flags) console.log('   (content not scanned)');
    console.log(`   Install: ${r.install}`);
  });
}

async function main() {
  const days = Number(opts.days || 30);
  switch (cmd) {
    case 'profile': {
      const p = buildProfile({ home, days });
      writeJSON('profile.json', p);
      if (opts.json) console.log(JSON.stringify(p, null, 2)); else showProfile(p);
      break;
    }
    case 'crawl': {
      await crawl({ dataDir, maxPages: Number(opts['max-pages'] || 1), log });
      break;
    }
    case 'recommend':
    case 'all': {
      let p = readJSON('profile.json');
      if (cmd === 'all' || !p) { p = buildProfile({ home, days }); writeJSON('profile.json', p); }
      let cat = loadCatalog(dataDir);
      const ageH = cat.updatedAt ? (Date.now() - new Date(cat.updatedAt)) / 36e5 : Infinity;
      if (cmd === 'all' && (opts.refresh || ageH > 20)) cat = await crawl({ dataDir, maxPages: Number(opts['max-pages'] || 1), log });
      else if (!cat.updatedAt) { log('catalog is empty; run `crawl` first'); }
      const top = Number(opts.top || 8);
      const dismissed = dismissedSet(dataDir);
      const rankOpts = {
        kinds: typeof opts.kind === 'string' ? opts.kind.split(',') : null,
        includeLow: !!opts['include-low'],
        exclude: dismissed,
      };
      const offline = !!opts.offline;
      const client = offline ? null : createClient({ token: githubToken(), log });
      if (client && cat.updatedAt) {
        // Measure real 7-day momentum for the shortlist only, then re-rank with it.
        const first = recommend(p, cat, { ...rankOpts, top: Math.max(top, SHORTLIST) });
        try {
          const st = await measureShortlist(first.slice(0, SHORTLIST).map((r) => r.name), cat, { client, dataDir, log });
          log(`momentum: ${st.measured} measured, ${st.cached} cached, ${st.unavailable} unavailable, ${st.skipped} skipped`);
        } catch (e) { log(`momentum measurement skipped: ${e.message}`); }
      }
      const recs = recommend(p, cat, { ...rankOpts, top });
      if (client && recs.length) {
        // Read the final candidates' content (README, SKILL.md, install scripts, hooks).
        try {
          const st = await scanRecommendations(recs.slice(0, SHORTLIST), cat, { client, dataDir, log });
          log(`trust scan: ${st.scanned} scanned, ${st.cached} cached, ${st.skipped} skipped, ${st.failed} failed`);
        } catch (e) { log(`trust scan skipped: ${e.message}`); }
      }
      const out = { generatedAt: new Date().toISOString(), catalogUpdatedAt: cat.updatedAt, catalogSize: Object.keys(cat.repos).length, dismissedCount: dismissed.size, profile: { sessions: p.sessions, topics: p.topics, friction: p.friction, languages: p.languages, repeatedCommands: p.repeatedCommands, installed: p.installed.names }, recommendations: recs };
      writeJSON('last-recommendations.json', out);
      if (opts.json) console.log(JSON.stringify(out, null, 2));
      else { if (cmd === 'all') showProfile(p); showRecs(recs); }
      break;
    }
    case 'dismiss': {
      if (!opts._.length) {
        const d = Object.entries(loadDismissed(dataDir).repos);
        if (opts.json) console.log(JSON.stringify(Object.fromEntries(d), null, 2));
        else console.log(d.length ? d.map(([n, v]) => `${n}  (dismissed ${v.at.slice(0, 10)})`).join('\n') : 'Nothing dismissed.');
        break;
      }
      for (const a of opts._) {
        const r = dismiss(dataDir, a);
        console.log(r.added ? `Dismissed ${r.name}. It won't be recommended again (undo: undismiss ${r.name}).` : `${r.name} was already dismissed.`);
      }
      break;
    }
    case 'undismiss': {
      if (!opts._.length && !opts.all) throw new Error('usage: undismiss <owner/repo> | --all');
      const names = opts.all ? [null] : opts._;
      for (const a of names) {
        const removed = undismiss(dataDir, a);
        console.log(removed.length ? `Undismissed ${removed.join(', ')}.` : `${a} wasn't dismissed.`);
      }
      break;
    }
    default:
      console.log('Usage: scout.mjs <profile|crawl|recommend|all|dismiss|undismiss> [owner/repo] [--days N] [--top N] [--kind skill,plugin,mcp-server] [--json] [--refresh] [--offline] [--data DIR]');
  }
}

main().catch((e) => { log(e.message); process.exit(1); });

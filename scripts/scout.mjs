#!/usr/bin/env node
// tool-scout: recommend trending Claude Code skills, plugins and MCP servers
// based on how you actually work. Zero dependencies, Node 18+.
//
//   scout.mjs profile   [--days 30] [--show]
//   scout.mjs crawl     [--max-pages 1]
//   scout.mjs recommend [--top 8] [--kind skill,plugin,mcp-server] [--include-low] [--json]
//   scout.mjs all       [--refresh] [...]     profile + crawl (if stale) + recommend
//
// Common: --data DIR (default $SCOUT_DATA or ~/.tool-scout), --home DIR (default ~)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProfile } from './lib/profile.mjs';
import { crawl, loadCatalog } from './lib/crawl.mjs';
import { recommend } from './lib/rank.mjs';

function parseArgs(argv) {
  const [cmd = 'help', ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
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
    const mom = `${r.momentumSource === 'measured' ? '+' : '~'}${r.starsPerDay}★/day`;
    console.log(`\n${i + 1}. ${r.name}  [${r.kind}]  ${r.stars}★  ${mom}  trust: ${r.trust.tier}`);
    if (r.description) console.log(`   ${r.description}`);
    console.log(`   Why: ${ev}`);
    if (r.trust.notes.length) console.log(`   Watch out: ${r.trust.notes.join(', ')}`);
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
      const recs = recommend(p, cat, {
        top: Number(opts.top || 8),
        kinds: typeof opts.kind === 'string' ? opts.kind.split(',') : null,
        includeLow: !!opts['include-low'],
      });
      const out = { generatedAt: new Date().toISOString(), catalogUpdatedAt: cat.updatedAt, catalogSize: Object.keys(cat.repos).length, profile: { sessions: p.sessions, topics: p.topics, friction: p.friction, languages: p.languages, repeatedCommands: p.repeatedCommands, installed: p.installed.names }, recommendations: recs };
      writeJSON('last-recommendations.json', out);
      if (opts.json) console.log(JSON.stringify(out, null, 2));
      else { if (cmd === 'all') showProfile(p); showRecs(recs); }
      break;
    }
    default:
      console.log('Usage: scout.mjs <profile|crawl|recommend|all> [--days N] [--top N] [--kind skill,plugin,mcp-server] [--json] [--refresh] [--data DIR]');
  }
}

main().catch((e) => { log(e.message); process.exit(1); });

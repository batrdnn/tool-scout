#!/usr/bin/env node
// Offline evaluation of the script shortlist against hand labels.
//
//   npm run eval                 table of precision@5, precision@25, recall@25 per persona
//   npm run eval -- --verbose    also list each persona's shortlist with labels
//   npm run eval -- --json       machine-readable results
//   npm run eval -- --live DIR   also print (unscored) top 25 from a live catalog in DIR,
//                                to eyeball generalization beyond the labeled set
//
// precision@k = relevant / min(k, returned). An empty shortlist scores 0.
// recall@25 is reported so precision can't be "improved" by returning nothing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSONAS, materialize } from './personas.mjs';
import { buildProfile } from '../../scripts/lib/profile.mjs';
import { loadCatalog } from '../../scripts/lib/crawl.mjs';
import { recommend } from '../../scripts/lib/rank.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const LABELS = JSON.parse(fs.readFileSync(path.join(here, 'labels.json'), 'utf8'));
delete LABELS._comment;
const CATALOG = JSON.parse(fs.readFileSync(path.join(here, 'catalog.json'), 'utf8'));
const NOW = new Date(CATALOG.updatedAt).getTime(); // freeze time so trust/momentum are reproducible

export function precisionAt(names, persona, k) {
  const top = names.slice(0, k);
  if (!top.length) return 0;
  return top.filter((n) => LABELS[n]?.[persona] === 1).length / top.length;
}
export function recallAt(names, persona, k) {
  const total = Object.values(LABELS).filter((l) => l[persona] === 1).length;
  return total ? names.slice(0, k).filter((n) => LABELS[n]?.[persona] === 1).length / total : 0;
}

export function runEval() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-eval-'));
  const rows = [];
  try {
    for (const persona of Object.keys(PERSONAS)) {
      const home = materialize(persona, tmp);
      const profile = buildProfile({ home, days: 36500, cwd: home });
      const recs = recommend(profile, CATALOG, { top: 25, now: NOW });
      const names = recs.map((r) => r.name);
      rows.push({
        persona, profile, recs, names,
        p5: precisionAt(names, persona, 5),
        p25: precisionAt(names, persona, 25),
        r25: recallAt(names, persona, 25),
        returned: names.length,
      });
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return rows;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const rows = runEval();
  const f = (x) => x.toFixed(2);
  const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  if (args.includes('--json')) {
    console.log(JSON.stringify(rows.map(({ persona, p5, p25, r25, returned, names }) => ({ persona, p5, p25, r25, returned, names })), null, 2));
  } else {
    console.log(`Eval: ${Object.keys(LABELS).length} labeled repos, ${rows.length} personas (catalog frozen ${CATALOG.frozenFrom})\n`);
    console.log('persona      p@5    p@25   recall@25  returned');
    for (const r of rows) console.log(`${r.persona.padEnd(12)} ${f(r.p5)}   ${f(r.p25)}   ${f(r.r25)}       ${r.returned}`);
    console.log(`${'MEAN'.padEnd(12)} ${f(mean('p5'))}   ${f(mean('p25'))}   ${f(mean('r25'))}`);
    if (args.includes('--verbose')) {
      for (const r of rows) {
        console.log(`\n== ${r.persona}`);
        r.recs.forEach((x, i) => console.log(`${String(i + 1).padStart(2)}. ${LABELS[x.name]?.[r.persona] ? '✔' : '✘'} ${x.name} {${x.matchedTopics.join(',')}} ${x.score}`));
        const missed = Object.keys(LABELS).filter((n) => LABELS[n][r.persona] === 1 && !r.names.includes(n));
        if (missed.length) console.log(`   missed: ${missed.join(', ')}`);
      }
    }
  }
  const li = args.indexOf('--live');
  if (li >= 0) {
    const live = loadCatalog(args[li + 1] || path.join(os.homedir(), '.tool-scout'));
    for (const r of rows) {
      console.log(`\n== live top 25 for ${r.persona} (unscored; ✔/✘ only where labeled)`);
      recommend(r.profile, live, { top: 25 }).forEach((x, i) => {
        const l = LABELS[x.name]?.[r.persona];
        console.log(`${String(i + 1).padStart(2)}. ${l === undefined ? '?' : l ? '✔' : '✘'} ${x.name} [${x.kind}] {${x.matchedTopics.join(',')}} ${x.description.slice(0, 90)}`);
      });
    }
  }
}

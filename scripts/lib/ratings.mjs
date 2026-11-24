// Local feedback: was a shown pick useful? Stored in the data dir as ratings.json (repo names
// and ratings only). `stats` turns it into the real-world metric for testers; `stats --share`
// prints the only thing a tester is asked to share: counts, the rated repo names and the animal's name.

import fs from 'node:fs';
import path from 'node:path';
import { normalizeRepo } from './feedback.mjs';
import { whoAmI } from './me.mjs';

const FILE = 'ratings.json';
const VALUES = { useful: 'useful', yes: 'useful', y: 'useful', good: 'useful', '+': 'useful', not: 'not', no: 'not', n: 'not', bad: 'not', '-': 'not', clear: null };

export function loadRatings(dataDir) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dataDir, FILE), 'utf8'));
    return d && typeof d.repos === 'object' ? d : { repos: {} };
  } catch { return { repos: {} }; }
}
function save(dataDir, d) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, FILE), JSON.stringify(d, null, 2));
}

/** Record (or clear) a rating. Returns { name, rating, changed }. */
export function rate(dataDir, repo, value, now = new Date()) {
  const name = normalizeRepo(repo);
  if (!name) throw new Error(`not a GitHub repo: ${repo} (expected owner/repo)`);
  const key = String(value || '').trim().toLowerCase();
  if (!(key in VALUES)) throw new Error(`rating must be useful or not (got ${value})`);
  const rating = VALUES[key];
  const d = loadRatings(dataDir);
  const changed = (d.repos[name]?.rating ?? null) !== rating;
  if (rating) d.repos[name] = { rating, at: now.toISOString() }; else delete d.repos[name];
  save(dataDir, d);
  return { name, rating, changed };
}

export function ratingStats(dataDir) {
  const vals = Object.values(loadRatings(dataDir).repos).map((r) => r.rating);
  const useful = vals.filter((v) => v === 'useful').length;
  const not = vals.filter((v) => v === 'not').length;
  const rated = useful + not;
  return { rated, useful, not, usefulShare: rated ? useful / rated : null };
}

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

/** The animal's name from the saved profile, or null. Never reads history; nothing else of the profile is used. */
function savedAnimal(dataDir) {
  try { return whoAmI(JSON.parse(fs.readFileSync(path.join(dataDir, 'profile.json'), 'utf8'))).animal; } catch { return null; }
}

/** The exact text `stats --share` prints: aggregate counts, rated repo names and the animal's name, nothing else. */
export function shareText(dataDir, { version = '?', now = new Date() } = {}) {
  const s = ratingStats(dataDir);
  const repos = loadRatings(dataDir).repos;
  const names = (r) => Object.keys(repos).filter((n) => repos[n].rating === r).sort();
  return [
    `tool-scout ${version} ratings (${now.toISOString().slice(0, 10)})`,
    `animal: ${savedAnimal(dataDir) || '—'}`,
    `rated: ${s.rated}`,
    `useful: ${s.useful} (${pct(s.usefulShare)})`,
    `not useful: ${s.not}`,
    `useful repos: ${names('useful').join(', ') || '—'}`,
    `not useful repos: ${names('not').join(', ') || '—'}`,
  ].join('\n');
}

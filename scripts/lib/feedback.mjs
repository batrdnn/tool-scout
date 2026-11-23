// User feedback: repos the user dismissed ("not interested") are excluded from future
// results. Stored locally in the data dir as dismissed.json. Repo names only.

import fs from 'node:fs';
import path from 'node:path';

const FILE = 'dismissed.json';

/** "Owner/Repo", "https://github.com/owner/repo(.git)(/...)" -> "owner/repo", else null. */
export function normalizeRepo(input) {
  const raw = String(input || '').trim();
  const isUrl = /^https?:\/\/(www\.)?github\.com\//i.test(raw);
  const s = raw.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '');
  // A URL may point inside the repo (/tree/main/...); a bare name must be exactly owner/repo.
  const m = s.match(isUrl ? /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?:\/.*)?$/ : /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

export function loadDismissed(dataDir) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dataDir, FILE), 'utf8'));
    return d && typeof d.repos === 'object' ? d : { repos: {} };
  } catch { return { repos: {} }; }
}

function save(dataDir, d) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, FILE), JSON.stringify(d, null, 2));
}

/** Returns { name, added } or throws on an invalid name. */
export function dismiss(dataDir, input, now = new Date()) {
  const name = normalizeRepo(input);
  if (!name) throw new Error(`not a GitHub repo: ${input} (expected owner/repo)`);
  const d = loadDismissed(dataDir);
  const added = !d.repos[name];
  if (added) d.repos[name] = { at: now.toISOString() };
  save(dataDir, d);
  return { name, added };
}

/** Undismiss one repo, or all when `input` is null. Returns the names removed. */
export function undismiss(dataDir, input) {
  const d = loadDismissed(dataDir);
  let removed;
  if (input == null) { removed = Object.keys(d.repos); d.repos = {}; }
  else {
    const name = normalizeRepo(input);
    if (!name) throw new Error(`not a GitHub repo: ${input} (expected owner/repo)`);
    removed = d.repos[name] ? [name] : [];
    delete d.repos[name];
  }
  save(dataDir, d);
  return removed;
}

/** Lowercased names for fast exclusion. */
export const dismissedSet = (dataDir) => new Set(Object.keys(loadDismissed(dataDir).repos));

// Persistent user settings in the data dir (settings.json). Local only.
// excludeProjects: project names or paths whose sessions are left out of the profile
// (e.g. while developing this plugin). Stored as given; never sent anywhere.

import fs from 'node:fs';
import path from 'node:path';

const FILE = 'settings.json';

export function loadSettings(dataDir) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(dataDir, FILE), 'utf8'));
    return { ...s, excludeProjects: Array.isArray(s?.excludeProjects) ? s.excludeProjects.filter((x) => typeof x === 'string') : [] };
  } catch { return { excludeProjects: [] }; }
}

export function saveSettings(dataDir, s) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, FILE), JSON.stringify(s, null, 2));
}

const clean = (name) => String(name || '').trim().replace(/[\\/]+$/, '');

/** Returns { name, added }. */
export function excludeProject(dataDir, name) {
  const n = clean(name);
  if (!n) throw new Error('usage: exclude-project <name or path>');
  const s = loadSettings(dataDir);
  const added = !s.excludeProjects.includes(n);
  if (added) s.excludeProjects.push(n);
  saveSettings(dataDir, s);
  return { name: n, added };
}

/** Remove one name, or all when `name` is null. Returns the names removed. */
export function includeProject(dataDir, name) {
  const s = loadSettings(dataDir);
  const n = name == null ? null : clean(name);
  const removed = n == null ? s.excludeProjects : s.excludeProjects.filter((x) => x === n);
  s.excludeProjects = n == null ? [] : s.excludeProjects.filter((x) => x !== n);
  saveSettings(dataDir, s);
  return removed;
}

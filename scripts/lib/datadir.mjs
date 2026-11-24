// Where Tool Scout keeps its files. Order: --data, $SCOUT_DATA, the installed plugin's data
// folder (~/.claude/plugins/data/tool-scout-*), then ~/.tool-scout. Local only.

import fs from 'node:fs';
import path from 'node:path';

// Claude Code names a plugin's data folder after `plugin@marketplace` with symbols as '-'.
const MARKETPLACE = 'tool-scout-tool-scout';

export const SOURCE_LABELS = { '--data': '--data', SCOUT_DATA: 'SCOUT_DATA', plugin: 'installed plugin', default: 'default' };

function pluginDataDir(home) {
  const root = path.join(home, '.claude', 'plugins', 'data');
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
  const dirs = entries.filter((e) => e.isDirectory() && e.name.startsWith('tool-scout-')).map((e) => e.name);
  if (dirs.includes(MARKETPLACE)) return path.join(root, MARKETPLACE);
  const newest = dirs.map((n) => ({ n, t: fs.statSync(path.join(root, n)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  return newest ? path.join(root, newest.n) : null;
}

/** Returns { dir, source } with source one of '--data' | 'SCOUT_DATA' | 'plugin' | 'default'. */
export function resolveDataDir({ data, env = process.env, home }) {
  if (typeof data === 'string' && data) return { dir: data, source: '--data' };
  if (env.SCOUT_DATA) return { dir: env.SCOUT_DATA, source: 'SCOUT_DATA' };
  const plugin = pluginDataDir(home);
  if (plugin) return { dir: plugin, source: 'plugin' };
  return { dir: path.join(home, '.tool-scout'), source: 'default' };
}

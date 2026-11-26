// Where Tool Scout keeps its files. Order: --data, $SCOUT_DATA, the installed plugin's data
// folder (~/.claude/plugins/data/tool-scout-*), then ~/.tool-scout. Local only.

import fs from 'node:fs';
import path from 'node:path';
import { KEPT } from './kept.mjs';

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

/** The marker file that says a folder is Tool Scout's own (see claimDataDir). */
export const MARKER = '.tool-scout-data';
const OWNED = new Set(KEPT.map((k) => k.path.split('/')[0]));

/**
 * Review D6: Tool Scout changes file permissions in its data folder, so it must be sure the folder
 * is its own and never a project someone pointed --data at. Own = it has the marker, or it is new or
 * empty, or it holds only files Tool Scout itself writes (a folder from before the marker). Anything
 * else is refused. Returns { ok, created? } or { ok: false, reason }.
 */
export function claimDataDir(dir) {
  let st;
  try { st = fs.statSync(dir); } catch { st = null; }
  if (!st) {
    try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(dir, MARKER), ''); } catch (e) { return { ok: false, reason: `cannot create ${dir}: ${e.message}` }; }
    return { ok: true, created: true };
  }
  if (!st.isDirectory()) return { ok: false, reason: `${dir} is not a folder` };
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { return { ok: false, reason: `cannot read ${dir}: ${e.message}` }; }
  if (names.includes(MARKER)) return { ok: true };
  const strangers = names.filter((n) => !OWNED.has(n));
  if (strangers.length) return { ok: false, reason: `${dir} is not Tool Scout's data folder: it has files Tool Scout didn't make (${strangers.slice(0, 3).join(', ')}${strangers.length > 3 ? ', …' : ''}) and no ${MARKER} file. Tool Scout changes file permissions in its data folder, so it won't use this one. Use an empty folder (or one that doesn't exist yet) with --data.` };
  try { fs.writeFileSync(path.join(dir, MARKER), ''); } catch { /* read-only: still only its own files in there */ }
  return { ok: true };
}

/**
 * Keeps the data folder private to the user (security review M6): the folder is 0700, and on exit
 * nothing of Tool Scout's own inside it is readable or writable by group or others (owner bits kept).
 * Only files Tool Scout owns are touched (v0.17.1, review D6), symlinks are never followed, and a
 * folder that isn't Tool Scout's is refused: the result is { ok: false, reason }. Best effort otherwise.
 */
export function keepDataDirPrivate(dir) {
  const claim = claimDataDir(dir);
  if (!claim.ok) return claim;
  // A folder someone else owns is left alone: its contents are theirs to swap under us.
  try { const st = fs.lstatSync(dir); if (process.getuid && !st.isSymbolicLink() && st.uid !== process.getuid()) return claim; } catch { return claim; }
  const own = () => {
    tighten(dir);
    let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const walk = (d) => { let xs; try { xs = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of xs) { const f = path.join(d, e.name); if (e.isSymbolicLink()) continue; tighten(f); if (e.isDirectory()) walk(f); } };
    for (const e of es) {
      if (!OWNED.has(e.name) && e.name !== MARKER) continue;
      const f = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      tighten(f);
      if (e.isDirectory()) walk(f);
    }
  };
  own();
  process.once('exit', own);
  return claim;
}
// chmod through a descriptor opened without following links, so a path swapped for a symlink
// between the check and the change is never followed (no O_NOFOLLOW, e.g. Windows: lstat check only).
function tighten(f) {
  const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK = 0 } = fs.constants; // O_NONBLOCK: a FIFO never blocks the open
  let fd;
  try {
    if (O_NOFOLLOW === undefined) { const st = fs.lstatSync(f); if (!st.isSymbolicLink() && st.mode & 0o077) fs.chmodSync(f, st.mode & 0o700); return; }
    fd = fs.openSync(f, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    const st = fs.fstatSync(fd);
    if (st.mode & 0o077) fs.fchmodSync(fd, st.mode & 0o700);
  } catch { /* a symlink, not ours, unreadable, or gone */ } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* closed */ } }
}

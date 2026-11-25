// --replace: swap an installed or built item in one step. Each file is written next to its target
// and renamed over it, so the item never disappears (there is no moment with nothing installed).
// The current version is copied into the data folder first (backups/<planId>/), and undo puts it
// back the same way, one file at a time.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * What is at `root` now (a folder, or one file): { root, files: [{ path, sha256, mode }] }, or
 * { error } when it holds something other than plain files and folders.
 */
export function currentVersion(root) {
  const files = [];
  const walk = (p) => {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) throw new Error(`${p} is a symlink`);
    if (st.isDirectory()) { for (const e of fs.readdirSync(p).sort()) walk(path.join(p, e)); return; }
    if (!st.isFile()) throw new Error(`${p} is not a plain file`);
    files.push({ path: p, sha256: sha256(fs.readFileSync(p)), mode: st.mode & 0o777 });
  };
  try { if (fs.existsSync(root)) walk(root); } catch (e) { return { error: `${e.message}: Tool Scout won't replace it` }; }
  return { root, files };
}

/** Write `buf` to `file` by renaming a temp file over it: readers see the old or the new file, never neither. */
export function swapIn(file, buf, mode = 0o644) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tool-scout-swap`);
  fs.writeFileSync(tmp, buf, { mode });
  fs.renameSync(tmp, file);
}

/** Missing parent folders of `file`, created and logged in `dirs`. */
function mkdirs(dirs, file) {
  const missing = [];
  for (let d = path.dirname(file); !fs.existsSync(d); d = path.dirname(d)) missing.push(d);
  for (const m of missing.reverse()) { fs.mkdirSync(m); dirs.push(m); }
}

/**
 * Replace the planned current version (`rep`, from currentVersion) with `writes` ([{ path, buf, mode }]).
 * Fills entry.files / entry.dirs like a plain install, and entry.replaced for undo.
 */
export function replaceFiles(entry, rep, writes, { dataDir, id }) {
  const backupDir = path.join(dataDir, 'backups', id);
  fs.mkdirSync(backupDir, { recursive: true });
  const old = rep.files.map((f, i) => {
    const backup = path.join(backupDir, String(i));
    fs.copyFileSync(f.path, backup);
    if (sha256(fs.readFileSync(backup)) !== f.sha256) throw new Error(`${f.path} changed since the plan`);
    return { ...f, backup };
  });
  entry.replaced = { root: rep.root, files: old, removedDirs: [] };
  for (const w of writes) {
    mkdirs(entry.dirs, w.path);
    swapIn(w.path, w.buf, w.mode);
    entry.files.push({ path: w.path, sha256: sha256(w.buf) });
  }
  // Files only the old version had go last, once the new version is complete.
  const keep = new Set(writes.map((w) => w.path));
  for (const f of old.filter((x) => !keep.has(x.path))) {
    fs.unlinkSync(f.path);
    for (let d = path.dirname(f.path); d.startsWith(rep.root + path.sep) && !fs.readdirSync(d).length; d = path.dirname(d)) {
      fs.rmdirSync(d); entry.replaced.removedDirs.push(d);
    }
  }
}

/** Put the replaced version back. Files changed since the replace are left in place and returned. */
export function restoreReplaced(entry) {
  const kept = [];
  const old = new Map(entry.replaced.files.map((f) => [f.path, f]));
  for (const f of entry.files) {
    if (!fs.existsSync(f.path)) continue;
    if (sha256(fs.readFileSync(f.path)) !== f.sha256) { kept.push(f.path); continue; }
    const o = old.get(f.path);
    if (o) { swapIn(f.path, fs.readFileSync(o.backup), o.mode); old.delete(f.path); } else fs.unlinkSync(f.path);
  }
  for (const d of [...entry.replaced.removedDirs].reverse()) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  for (const o of old.values()) { if (!fs.existsSync(o.path)) { fs.mkdirSync(path.dirname(o.path), { recursive: true }); swapIn(o.path, fs.readFileSync(o.backup), o.mode); } }
  for (const d of [...entry.dirs].reverse()) { try { fs.rmdirSync(d); } catch { /* holds files */ } }
  return kept;
}

/** The log entry `entry` replaces (same name, still active) is marked, so only the new one is listed. */
export function supersede(log, entry) {
  const prev = [...log.installs].reverse().find((e) => e.name === entry.name && !e.undoneAt && !e.replacedBy);
  if (prev) { prev.replacedBy = entry.planId; entry.replacesEntry = prev.planId; }
}

/** After undoing a replace: the entry it replaced is active again. */
export function reinstate(log, entry) {
  const prev = log.installs.find((e) => e.planId === entry.replacesEntry && e.replacedBy === entry.planId);
  if (prev) delete prev.replacedBy;
}

export const replaceLine = (rep, t) => rep.files.length
  ? `Replaces:  ${t(rep.root)} (${rep.files.length} file${rep.files.length === 1 ? '' : 's'} now): swapped one file at a time, so it never disappears; undo puts the current version back`
  : `Replaces:  nothing (${t(rep.root)} isn't there yet)`;

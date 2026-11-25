// Shared by the build tests (not a test file): a sandbox with HOME, a project and the data folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const NOW = Date.parse('2026-11-25T12:00:00Z');

export function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-build-'));
  const home = path.join(root, 'home'), cwd = path.join(root, 'project'), dataDir = path.join(root, 'data');
  for (const d of [home, cwd, dataDir, path.join(home, '.claude', 'skills')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ theme: 'dark' }, null, 2));
  return { root, home, cwd, dataDir };
}
export function snapshot(sb) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (p === sb.dataDir) continue;
      if (e.isDirectory()) { out[`${path.relative(sb.root, p)}/`] = 'dir'; walk(p); } else out[path.relative(sb.root, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(sb.root);
  return out;
}
export const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
export function draft(sb, name, files) {
  const dir = path.join(sb.dataDir, 'drafts', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
  return dir;
}
export const SKILL = (name, extra = '') => `---\nname: ${name}\ndescription: Writes pytest fixtures for this project. Use when the user asks for test fixtures or factories.\n---\n\n# Fixtures\n\nWrite fixtures in conftest.py.\n${extra}`;
export const ctx = (sb, extra = {}) => ({ home: sb.home, cwd: sb.cwd, dataDir: sb.dataDir, now: NOW, ...extra });

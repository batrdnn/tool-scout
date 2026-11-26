// The starter catalog (review E1): a small snapshot of public repos that ships with Tool Scout
// (data/starter-catalog.json), so the first run ranks at once instead of crawling GitHub for about two
// minutes. The real crawl refreshes it in the background, or in the foreground with --refresh.
import fs from 'node:fs';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const STARTER_FILE = fileURLToPath(new URL('../../data/starter-catalog.json', import.meta.url));
const LOCK = 'crawl.lock';
const LOCK_MIN = 10;

/** Save the starter as the catalog when there is none. Returns { seeded, updatedAt }. */
export function seedStarter(dataDir, { file = STARTER_FILE } = {}) {
  const dest = path.join(dataDir, 'catalog.json');
  try { if (JSON.parse(fs.readFileSync(dest, 'utf8'))?.updatedAt) return { seeded: false }; } catch { /* none, or unreadable: seed it */ }
  let starter;
  try { starter = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { seeded: false, missing: true }; }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(starter));
  return { seeded: true, updatedAt: starter.updatedAt };
}

/** A real crawl has merged into the catalog: it is no longer just the starter. */
export function finishCrawl(dataDir) {
  const f = path.join(dataDir, 'catalog.json');
  try { const c = JSON.parse(fs.readFileSync(f, 'utf8')); if (c.starter) { delete c.starter; delete c.note; fs.writeFileSync(f, JSON.stringify(c)); } } catch { /* nothing to clear */ }
}

/**
 * Start `crawl` as a detached process that outlives this command, unless one was started in the last
 * 10 minutes. Off under the test runner and with SCOUT_NO_BACKGROUND (an injected spawn always works).
 * Returns true when one was started.
 */
export function startBackgroundRefresh(dataDir, { spawn = null, env = process.env, script = process.argv[1] } = {}) {
  if (!spawn) { if (env.SCOUT_NO_BACKGROUND || env.NODE_TEST_CONTEXT || process.env.NODE_TEST_CONTEXT) return false; spawn = nodeSpawn; }
  else if (env.SCOUT_NO_BACKGROUND || env.NODE_TEST_CONTEXT) return false;
  const lock = path.join(dataDir, LOCK);
  try { if (Date.now() - Number(fs.readFileSync(lock, 'utf8')) < LOCK_MIN * 60e3) return false; } catch { /* no lock */ }
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(lock, String(Date.now()));
    const child = spawn(process.execPath, [script, 'crawl', '--plain', '--data', dataDir], { detached: true, stdio: 'ignore' });
    child.on?.('error', () => {});
    child.unref?.();
    return true;
  } catch { return false; }
}

export const starterNote = (updatedAt, { refreshing }) => `Starter catalog from ${String(updatedAt).slice(0, 10)}: Tool Scout starts from a small snapshot of public repos so you don't wait for a crawl. ${refreshing ? 'A fresh crawl is running in the background; the next run will use it.' : 'Run with --refresh (online) for a fresh crawl.'}`;

// Runs the test suite: `node test/run-tests.mjs [spec]`. It lists test/*.test.mjs itself, because
// `node --test test/*.test.mjs` needs a shell that expands the glob (PowerShell doesn't) and Node 20
// has no glob of its own. Quiet reporter by default; `spec` for every test with the full output.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const testFiles = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f));
export const testArgs = (argv, files) => ['--test', `--test-reporter=${argv[0] === 'spec' ? 'spec' : './test/reporter.mjs'}`, ...files];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = spawnSync(process.execPath, testArgs(process.argv.slice(2), testFiles(HERE)), { stdio: 'inherit', cwd: path.join(HERE, '..'), env: { ...process.env, SCOUT_NO_OPEN: '1' } });
  process.exit(r.status ?? 1);
}

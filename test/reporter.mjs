// The `npm test` reporter: prints each failure (name, where, message) and one summary line, and
// nothing about passing tests. `npm run test:verbose` uses the built-in spec reporter instead.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rel = (f) => (f ? path.relative(process.cwd(), f.startsWith('file:') ? fileURLToPath(new URL(f)) : f) : '');
const indent = (s, n = 4) => String(s).split('\n').map((l) => ' '.repeat(n) + l).join('\n');

export default async function* quiet(source) {
  const start = Date.now();
  let passed = 0; let failed = 0; let skipped = 0;
  const hadChild = new Map(); // `${file}|${nesting}` → a test at nesting+1 finished since
  for await (const { type, data } of source) {
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    if (data.details?.type === 'suite') continue;
    const key = `${data.file}|${data.nesting}`;
    const parent = hadChild.get(key);
    hadChild.delete(key);
    hadChild.set(`${data.file}|${data.nesting - 1}`, true);
    if (parent) {
      // A test with subtests: its children are counted; it is reported only for its own error.
      if (type === 'test:fail' && data.details?.error?.failureType !== 'subtestsFailed') { failed++; yield failure(data); }
      continue;
    }
    if (data.skip || data.todo) skipped++;
    else if (type === 'test:pass') passed++;
    else { failed++; yield failure(data); }
  }
  const total = passed + failed + skipped;
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  const extra = skipped ? `, ${skipped} skipped` : '';
  yield failed ? `${failed} of ${total} tests failed${extra} (${secs}s)\n` : `${passed} test${passed === 1 ? '' : 's'} passed${extra} (${secs}s)\n`;
}

function failure(data) {
  const err = data.details?.error;
  const cause = err?.cause ?? err;
  const where = data.file ? `${rel(data.file)}${data.line ? `:${data.line}` : ''}` : '';
  const msg = String(cause?.message ?? cause ?? 'failed').trimEnd();
  const frame = String(cause?.stack || '').split('\n').find((l) => /\.test\.mjs:\d+/.test(l) && !l.includes('node:'));
  const lines = msg.split('\n');
  const shown = lines.length > 40 ? [...lines.slice(0, 40), `… ${lines.length - 40} more lines (npm run test:verbose)`] : lines;
  return `✖ ${data.name}${where ? `  (${where})` : ''}\n${indent(shown.join('\n'))}${frame ? `\n    ${frame.trim()}` : ''}\n\n`;
}

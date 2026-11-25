// Lean to Install when most of the work lives elsewhere: a thin wrapper around one big library,
// or an official repo maintained by the vendor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateEffort, THRESHOLDS, OFFICIAL_ORGS, BYTES_PER_LINE as L, BYTES_PER_MD_LINE as M } from '../scripts/lib/effort.mjs';

const blob = (path, size = 1000) => ({ path, type: 'blob', size });
const est = (o) => estimateEffort({ readme: '', files: {}, kind: 'mcp-server', pushedAt: '2025-06-01T00:00:00Z', now: Date.parse('2026-11-25T00:00:00Z'), ...o });
const pkg = (deps) => ({ 'package.json': JSON.stringify({ dependencies: Object.fromEntries(deps.map((d) => [d, '1'])) }) });

test('THIN_MAX_LOC and OFFICIAL_ORGS are documented', () => {
  assert.equal(THRESHOLDS.THIN_MAX_LOC, 1000);
  for (const o of ['microsoft', 'github', 'anthropics', 'awslabs', 'modelcontextprotocol']) assert.ok(OFFICIAL_ORGS.has(o), o);
});

test('thin wrapper: small own code around one big library → Install, "most of the work is in …"', () => {
  const tree = [blob('package.json'), blob('src/index.ts', 600 * L)];
  const e = est({ name: 'someone/playwright-mcp', tree, files: pkg(['playwright', 'zod']) });
  assert.equal(e.wraps, 'playwright');
  assert.equal(e.advice, 'install');
  assert.match(e.reason, /^Most of the work is in playwright/);
  const big = est({ name: 'someone/x', tree, files: pkg(['puppeteer']) });
  assert.equal(big.wraps, 'puppeteer', 'a known big library, whatever the repo is called');
});

test('not a thin wrapper: small own code with small dependencies, or lots of own code', () => {
  const small = est({ name: 'someone/notes-mcp', tree: [blob('package.json'), blob('src/index.ts', 200 * L)], files: pkg(['zod', '@modelcontextprotocol/sdk']) });
  assert.equal(small.wraps, null);
  assert.equal(small.advice, 'build');
  const own = est({ name: 'someone/playwright-mcp', tree: [blob('package.json'), blob('src/index.ts', (THRESHOLDS.THIN_MAX_LOC + 200) * L)], files: pkg(['playwright']) });
  assert.equal(own.wraps, null);
});

test('official repo from the vendor → Install, "maintained by the vendor"', () => {
  const e = est({ name: 'microsoft/playwright-mcp', tree: [blob('package.json'), blob('src/index.ts', 600 * L)], files: pkg(['playwright', 'playwright-core']) });
  assert.equal(e.vendor, 'microsoft');
  assert.equal(e.advice, 'install');
  assert.match(e.reason, /maintained by the vendor \(microsoft\)/i);
  const skill = est({ name: 'Anthropics/frontend-design', kind: 'skill', tree: [blob('SKILL.md', 120 * M)] });
  assert.equal(skill.advice, 'install', 'even instructions: the vendor keeps them current');
  assert.equal(est({ name: 'someone/frontend-design', kind: 'skill', tree: [blob('SKILL.md', 120 * M)] }).vendor, null);
});

test('a vendor collection is still judged per part, and leans to installing the part you need', () => {
  const tree = ['pdf', 'docx', 'xlsx', 'webapp-testing'].map((n) => blob(`skills/${n}/SKILL.md`, 100 * M));
  const e = est({ name: 'anthropics/skills', kind: 'skill', tree });
  assert.equal(e.type, 'collection');
  assert.equal(e.advice, 'install');
  assert.match(e.reason, /^Collection of 4 skills: a typical one is ~100 lines of Markdown\. Maintained by the vendor \(anthropics\): install the part you need\.$/);
});

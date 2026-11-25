// v0.11.1 follow-up: "polish the docs / write a post" is "nothing needed", not a docs skill build or
// install, unless the plan asks for a repeatable docs workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runKickoff } from '../scripts/lib/kickoff.mjs';
import { sandbox, NOW, catalogRepo } from './kickoff-helpers.mjs';

const kickWith = (plan) => {
  const sb = sandbox({ plan });
  const f = path.join(sb.dataDir, 'catalog.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = catalogRepo('acme/docs-writer', 'Documentation skill: writes READMEs, API docs and changelogs for your project');
  c.repos[r.full_name] = r; fs.writeFileSync(f, JSON.stringify(c));
  return runKickoff({ planFile: sb.planFile, home: sb.home, dataDir: sb.dataDir, now: NOW, client: null });
};

test('polishing the README or writing docs is nothing needed, even with a docs tool in the catalog', async () => {
  for (const plan of ['- Polish the README and write a FAQ\n- Write the API docs\n', '- Update the docs and the changelog before release\n']) {
    const { toolkit } = await kickWith(plan);
    const d = toolkit.items.find((i) => i.topic === 'docs');
    assert.equal(d.action, 'nothing', plan);
    assert.ok(!JSON.stringify(toolkit).includes('acme/docs-writer'));
  }
});

test('a repeatable docs workflow still gets a match', async () => {
  const { toolkit } = await kickWith('- Generate the API docs automatically on every release\n- Keep the README docs up to date as the code changes\n');
  const d = toolkit.items.find((i) => i.topic === 'docs');
  assert.notEqual(d.action, 'nothing');
});

test('USAGE describes the docs rule', () => {
  assert.match(fs.readFileSync(new URL('../docs/USAGE.md', import.meta.url), 'utf8').replace(/\s+/g, ' '), /Docs work[^.]*"nothing needed"[^.]*unless the plan asks for a repeatable docs workflow/);
});

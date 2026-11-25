// v0.10.0 item 0: every place that says what leaves the machine also says that install plans may
// look up package versions on npm or PyPI, with the package name only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const flat = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
const REGISTRIES = /npm (?:or|and|\/) PyPI[^.]*\(?the package name only\)?/;

test('README: requirements and Privacy name the npm/PyPI version lookups (package name only)', () => {
  const md = flat('README.md');
  const priv = md.slice(md.indexOf('## Privacy'), md.indexOf('## ', md.indexOf('## Privacy') + 3));
  assert.match(priv, REGISTRIES, priv);
  assert.match(md, /registry\.npmjs\.org[^.]*pypi\.org/, 'the hosts, in the requirements');
});

for (const [file, cut] of [['TESTING.md', '## 2.'], ['skills/scout/SKILL.md', '## Privacy rules'], ['skills/check/SKILL.md', '## Steps'], ['docs/USAGE.md', null]]) {
  test(`${file}: no "only GitHub" claim without the npm/PyPI lookups`, () => {
    const md = flat(file);
    const sec = cut ? md.slice(md.indexOf(cut), md.indexOf('## ', md.indexOf(cut) + 3)) : md;
    assert.match(sec, REGISTRIES, file);
  });
}

// Collections: repos holding several skills, agents, MCP servers or plugins are judged per part
// (the typical part and the largest), never by their total size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateEffort, effortLine, matchPart, THRESHOLDS, BYTES_PER_LINE as L, BYTES_PER_MD_LINE as M } from '../scripts/lib/effort.mjs';

const NOW = Date.parse('2026-11-25T00:00:00Z');
const OLD = '2025-06-01T00:00:00Z';
const blob = (path, size = 1000) => ({ path, type: 'blob', size });
const est = (o) => estimateEffort({ readme: '', files: {}, kind: 'skill', pushedAt: OLD, now: NOW, ...o });
const TOPICS = { testing: ['test', 'testing', 'playwright', 'e2e'], docs: ['documentation', 'readme', 'markdown'], frontend: ['react', 'css', 'frontend'] };

test('COLLECTION_MIN is a documented threshold', () => {
  assert.equal(THRESHOLDS.COLLECTION_MIN, 3);
});

test('a repo of 5 skills is a "collection of 5 skills": typical and largest part, advice from the typical part', () => {
  const tree = [blob('README.md', 9000),
    ...['commit', 'review', 'docs', 'release'].map((n) => blob(`skills/${n}/SKILL.md`, 100 * M)),
    blob('skills/pdf/SKILL.md', 150 * M), blob('skills/pdf/scripts/extract.py', 900 * L)];
  const e = est({ tree });
  assert.equal(e.type, 'collection');
  assert.equal(e.typeLabel, 'collection of 5 skills');
  assert.equal(e.collection.unit, 'skill');
  assert.equal(e.collection.count, 5);
  assert.deepEqual(e.collection.typical, { name: 'release', loc: 0, instructionLines: 100 }, 'the median part, ties by name');
  assert.deepEqual(e.collection.largest, { name: 'pdf', loc: 900, instructionLines: 150 });
  assert.equal(e.advice, 'build', 'a typical part is 100 lines of instructions');
  assert.equal(e.buildForm, 'skill');
  assert.equal(e.collection.largestAdvice.advice, 'either', 'the 900-line part on its own');
  assert.match(e.reason, /^Collection of 5 skills: a typical one is ~100 lines of Markdown; the largest, pdf, ~900 lines of Python/);
});

test('never judged by total size: 40 small parts adding up to a large repo are still small parts', () => {
  const tree = Array.from({ length: 40 }, (_, i) => [blob(`skills/s${i}/SKILL.md`, 60 * M), blob(`skills/s${i}/run.py`, (120 + i) * L)]).flat();
  const e = est({ tree });
  assert.ok(e.loc >= THRESHOLDS.LARGE_LOC, `total ${e.loc} is large`);
  assert.equal(e.collection.count, 40);
  assert.equal(e.advice, 'build');
  assert.doesNotMatch(e.reason, /4,800/);
});

test('agents and MCP servers make collections too; plugins in plugins/<name>/ as well', () => {
  const agents = est({ kind: 'plugin', tree: Array.from({ length: 12 }, (_, i) => blob(`agents/agent-${i}.md`, (40 + i) * M)) });
  assert.equal(agents.typeLabel, 'collection of 12 agents');
  assert.equal(agents.buildForm, 'subagent');
  const servers = est({ kind: 'mcp-server', tree: ['aws-docs', 'aws-cost', 'aws-iam', 'aws-s3'].flatMap((n, i) => [blob(`src/${n}-mcp-server/pyproject.toml`, 900), blob(`src/${n}-mcp-server/server.py`, (400 + 200 * i) * L)]) });
  assert.equal(servers.typeLabel, 'collection of 4 MCP servers');
  assert.equal(servers.collection.largest.name, 'aws-s3-mcp-server');
  const plugins = est({ kind: 'plugin', tree: ['guard', 'lint', 'stamp'].flatMap((n) => [blob(`plugins/${n}/.claude-plugin/plugin.json`, 300), blob(`plugins/${n}/hooks/hooks.json`, 300), blob(`plugins/${n}/hook.js`, 150 * L)]) });
  assert.equal(plugins.typeLabel, 'collection of 3 plugins');
  assert.equal(plugins.buildForm, 'hook');
});

test('fewer than COLLECTION_MIN parts is not a collection', () => {
  const e = est({ tree: [blob('skills/a/SKILL.md', 50 * M), blob('skills/b/SKILL.md', 50 * M)] });
  assert.notEqual(e.type, 'collection');
  assert.equal(e.collection, null);
});

test('matchPart points to the part that fits the user\'s topic', () => {
  const names = ['pdf', 'docx', 'webapp-testing', 'frontend-design', 'readme-writer'];
  assert.deepEqual(matchPart(names, ['testing'], TOPICS), { name: 'webapp-testing', topic: 'testing' });
  assert.deepEqual(matchPart(names, ['docs', 'testing'], TOPICS), { name: 'readme-writer', topic: 'docs' });
  assert.equal(matchPart(names, ['ml'], TOPICS), null);
  assert.equal(matchPart(['a', 'b'], [], TOPICS), null);
});

test('the Effort line names the matching part when there is one', () => {
  const e = est({ tree: ['pdf', 'webapp-testing', 'docx'].map((n) => blob(`skills/${n}/SKILL.md`, 80 * M)) });
  e.collection.match = { name: 'webapp-testing', topic: 'testing' };
  assert.match(effortLine(e), /For your testing work: webapp-testing\.$/);
});

test('matchCollections: each collection pick points to the part for its own evidence topics first, then the profile\'s', async () => {
  const { matchCollections } = await import('../scripts/lib/effort.mjs');
  const coll = (names) => ({ effort: { collection: { names } } });
  const recs = [
    { ...coll(['pdf', 'webapp-testing', 'readme-writer']), evidence: [{ topic: 'docs' }] },
    { ...coll(['pdf', 'webapp-testing']), evidence: [] },
    { effort: { type: 'instructions' }, evidence: [{ topic: 'testing' }] },
    { evidence: [] },
  ];
  matchCollections(recs, ['testing'], TOPICS);
  assert.deepEqual(recs[0].effort.collection.match, { name: 'readme-writer', topic: 'docs' });
  assert.deepEqual(recs[1].effort.collection.match, { name: 'webapp-testing', topic: 'testing' });
  assert.equal(recs[2].effort.collection, undefined);
});

test('check in a terminal shows a collection by its parts, not its total', async () => {
  const { prettyCheck } = await import('../scripts/lib/pretty.mjs');
  const { painter, stripAnsi } = await import('../scripts/lib/term.mjs');
  const effort = est({ tree: [...['a', 'b', 'c'].map((n) => blob(`skills/${n}/SKILL.md`, 80 * M)), blob('skills/big/SKILL.md', 90 * M), blob('skills/big/x.py', 5000 * L)] });
  const r = { name: 'o/x', kind: 'skill', url: 'https://github.com/o/x', verdict: 'safe-looking', reasons: [], flags: [], coverage: { line: 'Checked 1 file: README', notes: [] },
    metadata: { tier: 'high', score: 90, stars: 1, forks: 1, license: 'MIT', ownerType: 'Organization', createdAt: '2025', pushedAt: '2026', archived: false, notes: [] }, install: { commands: [] }, effort };
  const text = stripAnsi(prettyCheck(r, painter({ pretty: true, color: false, unicode: true }, { width: 100 })));
  assert.match(text, /Parts\s+4 skills; typical ~80 lines of Markdown; largest big, ~5,000 lines of Python/);
  assert.doesNotMatch(text, /Size\s/);
});

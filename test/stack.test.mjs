import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { librariesIn, parseManifest, stackMatches } from '../scripts/lib/stack.mjs';
import { buildProfile } from '../scripts/lib/profile.mjs';
import { recommend } from '../scripts/lib/rank.mjs';
import { mergeRepos } from '../scripts/lib/crawl.mjs';

test('manifest parsers return library names only', () => {
  assert.deepEqual(parseManifest('package.json', JSON.stringify({ name: 'app', dependencies: { next: '15', '@prisma/client': '6' }, devDependencies: { '@playwright/test': '1', '@types/node': '22' } })).sort(),
    ['@playwright/test', '@prisma/client', 'next']);
  assert.deepEqual(parseManifest('requirements-dev.txt', '# dev\npytest>=8\npandas[performance]==2.2 ; python_version>"3.9"\n-r base.txt\n-e .\nnumpy\n'), ['pytest', 'pandas', 'numpy']);
  assert.deepEqual(parseManifest('pyproject.toml', '[project]\nname = "x"\ndependencies = [\n  "fastapi>=0.1",\n  "sqlalchemy",\n]\n[project.optional-dependencies]\ntest = ["pytest"]\n[tool.poetry.dependencies]\npython = "^3.11"\npolars = "*"\n').sort(),
    ['fastapi', 'polars', 'pytest', 'sqlalchemy']);
  assert.deepEqual(parseManifest('Package.swift', 'dependencies: [\n .package(url: "https://github.com/pointfreeco/swift-composable-architecture.git", from: "1.0"),\n .package(url: "https://github.com/Alamofire/Alamofire", from: "5.0")\n]'), ['swift-composable-architecture', 'alamofire']);
  assert.deepEqual(parseManifest('Podfile', "target 'App' do\n  pod 'Firebase/Analytics'\n  pod 'SnapKit', '~> 5'\nend"), ['firebase', 'snapkit']);
  assert.deepEqual(parseManifest('go.mod', 'module example.com/svc\n\ngo 1.22\n\nrequire (\n\tk8s.io/client-go v0.31.0\n\tgithub.com/spf13/cobra/v2 v2.0.0 // indirect\n)\nrequire github.com/prometheus/client_golang v1.20.0\n'), ['client-go', 'cobra', 'client_golang']);
  assert.deepEqual(parseManifest('Cargo.toml', '[package]\nname = "x"\n[dependencies]\ntokio = { version = "1" }\nserde = "1"\n[dev-dependencies]\ninsta = "1"\n'), ['tokio', 'serde', 'insta']);
  assert.deepEqual(parseManifest('Gemfile', "source 'https://rubygems.org'\ngem 'rails', '~> 7'\ngem \"rspec-rails\"\n"), ['rails', 'rspec-rails']);
});

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-stack-proj-'));
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), body);
  return dir;
}
function homeWith(cwds) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-stack-'));
  const proj = path.join(home, '.claude', 'projects', '-p');
  fs.mkdirSync(proj, { recursive: true });
  cwds.forEach((cwd, i) => fs.writeFileSync(path.join(proj, `s${i}.jsonl`), [
    JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: 'run the tests' } }),
    JSON.stringify({ type: 'assistant', cwd, message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'pytest -q' } }] } }),
  ].join('\n')));
  return home;
}

test('librariesIn reads every manifest in a project folder', () => {
  const dir = project({ 'requirements.txt': 'pytest\npandas\n', 'package.json': '{"devDependencies":{"vitest":"1"}}' });
  assert.deepEqual([...librariesIn(dir)].sort(), ['pandas', 'pytest', 'vitest']);
  assert.deepEqual([...librariesIn(path.join(dir, 'missing'))], []);
});

test('the profile counts projects per library, and nothing else mentions them', () => {
  const a = project({ 'requirements.txt': 'pytest\npandas-ta-classic\n' });
  const b = project({ 'pyproject.toml': '[project]\ndependencies = ["pytest", "numpy"]\n' });
  const p = buildProfile({ home: homeWith([a, a, b]), days: 30, cwd: os.tmpdir(), excludeSessions: [] });
  assert.deepEqual(p.stack, { pytest: 2, 'pandas-ta-classic': 1, numpy: 1 });
  const { stack, ...rest } = p;
  assert.ok(!JSON.stringify(rest).includes('pandas-ta-classic'), 'library names live only in profile.stack');
});

test('a repo naming one of your libraries outranks generic topic matches, with an evidence line', () => {
  const stack = { pytest: 2, 'next': 1 };
  assert.deepEqual(stackMatches({ name: 'pytest-mcp', description: 'Run pytest from Claude' }, stack), [{ library: 'pytest', projects: 2 }]);
  assert.deepEqual(stackMatches({ name: 'nextjs-devtools', description: 'Next.js devtools MCP' }, stack), [{ library: 'next', projects: 1 }]);
  assert.deepEqual(stackMatches({ name: 'x', description: 'The next generation of testing tools' }, stack), [], '"next" the word is not Next.js');
  assert.deepEqual(stackMatches({ name: 'x', description: 'Testing toolkit. Works with pytest, jest and more.' }, stack), [], 'only the name or the description head counts');

  const gh = (name, description, stars) => ({ full_name: `o/${name}`, name, owner: { login: 'o', type: 'Organization' }, html_url: `https://github.com/o/${name}`, description,
    topics: ['mcp-server'], language: 'Python', stargazers_count: stars, forks_count: 50, license: { spdx_id: 'MIT' }, archived: false, fork: false, created_at: '2025-06-01T00:00:00Z', pushed_at: new Date().toISOString() });
  const cat = { repos: {} };
  mergeRepos(cat, [gh('test-toolkit-mcp', 'Testing toolkit MCP server for e2e testing and unit test generation', 30000), gh('pytest-runner-mcp', 'pytest runner MCP server', 300)]);
  const profile = { sessions: 6, topics: { testing: 5 }, topicWeights: { testing: 5 }, friction: {}, languages: {}, installed: { names: [], repos: [] }, stack: { pytest: 2 } };
  const recs = recommend(profile, cat, { top: 5 });
  assert.equal(recs[0].name, 'o/pytest-runner-mcp');
  assert.deepEqual(recs[0].stackEvidence, [{ library: 'pytest', projects: 2 }]);
  assert.equal(recs[1].stackEvidence, undefined);
});

test('CLI: library names reach stdout and profile.json, never last-recommendations.json', () => {
  const lib = 'pytest';
  const dir = project({ 'requirements.txt': `${lib}\nzzlibmarker\n` });
  const home = homeWith([dir, dir]);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-stack-data-'));
  const cat = { updatedAt: new Date().toISOString(), repos: {} };
  mergeRepos(cat, [{ full_name: 'o/pytest-mcp', name: 'pytest-mcp', owner: { login: 'o', type: 'Organization' }, html_url: 'https://github.com/o/pytest-mcp', description: 'pytest MCP server',
    topics: ['mcp-server'], language: 'Python', stargazers_count: 900, forks_count: 9, license: { spdx_id: 'MIT' }, archived: false, fork: false, created_at: '2025-06-01T00:00:00Z', pushed_at: new Date().toISOString() }]);
  fs.writeFileSync(path.join(data, 'catalog.json'), JSON.stringify(cat));
  const out = execFileSync(process.execPath, [new URL('../scripts/scout.mjs', import.meta.url).pathname, 'all', '--json', '--offline', '--include-current', '--home', home, '--data', data], { encoding: 'utf8' });
  assert.match(out, /you use pytest in 1 project/);
  for (const f of fs.readdirSync(data)) {
    const body = fs.readFileSync(path.join(data, f), 'utf8');
    if (f === 'profile.json') assert.match(body, /zzlibmarker/);
    else if (f !== 'catalog.json') assert.ok(!body.includes('zzlibmarker') && !/you use pytest/.test(body), `${f} must not contain library names`);
  }
});

// v0.4.1 regressions: the two real false picks, reproduced with synthetic names.
// A vendor SDK ("acmeai") used in one project; the user's real actions are docs and git.
const vendorProfile = (projects = 1) => ({
  sessions: 5, topics: { docs: 3, git: 2, 'offensive-security': 1 }, friction: {},
  topicSources: { actions: { docs: 3, git: 2 }, mentions: { docs: 1, git: 2, 'offensive-security': 1 } },
  topicWeights: { docs: 3.3, git: 2.6, 'offensive-security': 0.3 },
  languages: {}, installed: { names: [], repos: [] }, stack: { acmeai: projects },
});
const vgh = (full, description, stars = 3000) => {
  const [owner, name] = full.split('/');
  return { full_name: full, name, owner: { login: owner, type: 'User' }, html_url: `https://github.com/${full}`, description, topics: ['claude-skills'],
    language: 'Python', stargazers_count: stars, forks_count: 50, license: { spdx_id: 'MIT' }, archived: false, fork: false, created_at: '2025-06-01T00:00:00Z', pushed_at: new Date().toISOString() };
};

test('a vendor brand inside a provider list is not a stack match', () => {
  const desc = 'A multi-provider AI copilot hub for Blender—bring OpenAI, AcmeAI Claude, Google Gemini, OpenRouter and local models';
  assert.deepEqual(stackMatches({ name: 'blender-ai-copilot-hub', description: desc }, { acmeai: 1 }), []);
  assert.deepEqual(stackMatches({ name: 'x', description: 'AcmeAI SDK helpers for agents' }, { acmeai: 1 }).map((e) => e.library), ['acmeai'], 'outside a list it still matches');
});

test('a vendor brand in a repo name gets no stack bonus without action-backed topic evidence or 2+ projects', () => {
  const cat = { repos: {} };
  mergeRepos(cat, [
    vgh('someone/AcmeAI-Cybersecurity-Skills', '817 structured cybersecurity skills for AI agents, mapped to MITRE ATT&CK and NIST: pentest and red team playbooks', 9000),
    vgh('someone/blender-ai-copilot-hub', 'A multi-provider AI copilot hub for Blender—bring OpenAI, AcmeAI Claude, Google Gemini, OpenRouter and local models', 4000),
    vgh('docs-org/readme-writer-skill', 'Claude skill that writes and fixes README documentation', 400),
  ]);
  const recs = recommend(vendorProfile(1), cat, { top: 5 });
  const names = recs.map((r) => r.name);
  assert.ok(!names.includes('someone/blender-ai-copilot-hub'), 'provider-list mention: no match at all');
  assert.equal(names[0], 'docs-org/readme-writer-skill');
  const cyber = recs.find((r) => r.name === 'someone/AcmeAI-Cybersecurity-Skills');
  assert.ok(!cyber || (!cyber.stackNote && cyber.thinEvidence), 'no bonus, no stack evidence, and not counted as support');
  // With only the vendor match and limited history, it must not become a pick on its own.
  const thin = { ...vendorProfile(1), sessions: 1, topics: { docs: 1 }, topicSources: { actions: { docs: 1 }, mentions: {} }, topicWeights: { docs: 1 } };
  const only = recommend(thin, cat, { top: 5 }).map((r) => r.name);
  assert.ok(!only.includes('someone/AcmeAI-Cybersecurity-Skills'), only.join(', '));
});

test('the stack bonus still applies with action-backed topic evidence, or when the library is in 2+ projects', () => {
  const cat = { repos: {} };
  mergeRepos(cat, [
    vgh('acme/acmeai-docs-skill', 'AcmeAI docs skill: write documentation for AcmeAI SDK projects', 300),
    vgh('big/readme-writer-skill', 'Claude skill that writes and fixes README documentation', 20000),
    vgh('acme/acmeai-mcp', 'AcmeAI MCP server', 300),
  ]);
  const recs = recommend(vendorProfile(1), cat, { top: 5 });
  assert.equal(recs[0].name, 'acme/acmeai-docs-skill', 'docs is backed by actions (weight 3.3)');
  assert.match(recs[0].stackNote, /you use acmeai in 1 project/);
  assert.ok(!recs.some((r) => r.name === 'acme/acmeai-mcp' && r.stackNote), 'no action-backed topic, 1 project: no bonus');
  const two = recommend(vendorProfile(2), cat, { top: 5 });
  assert.match(two.find((r) => r.name === 'acme/acmeai-mcp')?.stackNote || '', /2 projects/, '2+ projects: bonus without topic evidence');
});

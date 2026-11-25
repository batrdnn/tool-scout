// "Reference: read it, copy what you need" for specs, example/demo collections and API-companion
// skills. The three n's of the v0.8.1 review (rows 1, 16 and 14) are the regression tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateEffort, effortLine, BYTES_PER_LINE as L, BYTES_PER_MD_LINE as M } from '../scripts/lib/effort.mjs';

const blob = (p, size = 1000) => ({ path: p, type: 'blob', size });
const est = (o) => estimateEffort({ readme: '', files: {}, kind: 'skill', pushedAt: '2025-06-01T00:00:00Z', now: Date.parse('2026-11-25T00:00:00Z'), ...o });

test('regression: agentskills/agentskills is a spec → Reference', () => {
  const e = est({
    name: 'agentskills/agentskills', description: 'Specification and documentation for Agent Skills',
    readme: '# Agent Skills\nA standardized way to give AI agents new capabilities and expertise.',
    tree: [blob('README.md'), blob('docs/specification.mdx', 30000), blob('skills-ref/pyproject.toml'), blob('skills-ref/src/skills_ref/validator.py', 150 * L), blob('skills-ref/src/skills_ref/parser.py', 300 * L)],
  });
  assert.equal(e.advice, 'reference');
  assert.equal(e.adviceLabel, 'Reference');
  assert.deepEqual(e.reference, { kind: 'spec' });
  assert.equal(e.judgment, null);
  assert.equal(e.buildForm, null);
  assert.match(effortLine(e), /^Reference: read it, copy what you need\. A specification/);
});

test('regression: disler/claude-code-hooks-mastery is an examples collection → Reference', () => {
  const e = est({
    name: 'disler/claude-code-hooks-mastery', kind: 'tool', description: 'Master Claude Code Hooks',
    readme: '# Claude Code Hooks Mastery\n[Claude Code Hooks](https://docs.anthropic.com) - Quickly master how to use Claude Code hooks.\n## What This Shows\nSet ANTHROPIC_API_KEY and OPENAI_API_KEY.',
    tree: [blob('.claude/settings.json'), ...Array.from({ length: 12 }, (_, i) => blob(`.claude/hooks/h${i}.py`, (400 + i) * L)), blob('apps/demo.ts', 1000 * L)],
  });
  assert.equal(e.advice, 'reference', e.reason);
  assert.equal(e.reference.kind, 'examples');
  assert.match(e.reason, /^Examples for learning/);
  assert.match(e.reason, /copy the hook you want/);
});

test('regression: ScrapeCreators/social-media-research-skills is an API companion → Reference', () => {
  const e = est({
    name: 'ScrapeCreators/social-media-research-skills',
    description: 'AI agent skills for social media research. Powered by ScrapeCreators. Works with Claude Code, Cursor, Codex.',
    readme: '# Social Media Research Skills for AI Agents\nPractical AI agent skills, powered by [ScrapeCreators](https://scrapecreators.com).\nSet SCRAPECREATORS_API_KEY.',
    tree: ['trend-discovery', 'comment-mining', 'outlier-posts', 'scrapecreators-api'].map((n) => blob(`skills/${n}/SKILL.md`, 80 * M)),
  });
  assert.equal(e.type, 'collection');
  assert.equal(e.advice, 'reference', e.reason);
  assert.deepEqual(e.reference, { kind: 'api-companion', api: 'ScrapeCreators' });
  assert.match(e.reason, /^Companion skills for the ScrapeCreators API, which you need either way/);
});

test('not reference: ordinary skills, vendor collections, MCP servers that wrap an API, words in passing', () => {
  const skill = est({ name: 'someone/commit-helper', description: 'Writes commit messages', readme: '# Commit helper\nFor example, it reads your diff.', tree: [blob('SKILL.md', 80 * M)] });
  assert.notEqual(skill.advice, 'reference', '"for example" in the text is not an examples collection');
  const vendor = est({ name: 'anthropics/skills', description: 'Public repository for Agent Skills', tree: ['pdf', 'docx', 'xlsx'].map((n) => blob(`skills/${n}/SKILL.md`, 90 * M)) });
  assert.equal(vendor.advice, 'install');
  const mcp = est({ name: 'stripe/agent-toolkit', kind: 'mcp-server', description: 'Stripe MCP server', readme: '# Stripe\nSet STRIPE_SECRET_KEY.', tree: [blob('server.ts', 900 * L)] });
  assert.notEqual(mcp.advice, 'reference', 'a server for its own API is the product, not a companion to read');
  const specServer = est({ name: 'someone/openapi-mcp', kind: 'mcp-server', description: 'MCP server that turns any OpenAPI spec into tools', tree: [blob('server.py', 2000 * L)] });
  assert.notEqual(specServer.advice, 'reference', 'a tool that reads specs is not a spec');
});

test('regression: a tool that helps you learn (mohi-devhub/antivibe) is not an examples collection', () => {
  const e = est({ name: 'mohi-devhub/antivibe', description: 'Learn what AI writes, not just accept it. A Claude Code skill that turns AI-generated code into educational deep dives.', readme: '# AntiVibe', tree: [blob('SKILL.md', 100 * M), blob('hooks/hooks.json'), blob('hooks/explain.sh', 250 * L)] });
  assert.equal(e.reference, null);
  assert.notEqual(e.advice, 'reference');
});

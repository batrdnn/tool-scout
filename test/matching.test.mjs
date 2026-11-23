import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repoTopicEvidence, splitHead, toolAffinity, toolKeywordsIn, toolForCommand, topicsIn } from '../scripts/lib/taxonomy.mjs';

const ev = (description, extra = {}) => repoTopicEvidence({ name: extra.name || 'x', description, topics: extra.topics || [] });

test('splitHead takes the first clause, extending past a short "Name:" prefix', () => {
  assert.equal(splitHead('Point Claude at any game. Skills and tools for testing.').head, 'Point Claude at any game');
  assert.equal(splitHead('BAMA: Build Any Mac App. Agent skills for Swift.').head, 'BAMA: Build Any Mac App');
});

test('what the repo is (head) beats an incidental later mention', () => {
  assert.ok(ev('Claude skill that writes and fixes pytest test suites').testing.inHead);
  assert.equal(ev('A comprehensive logo-design skill for AI agents: principles, process, SVG craft, testing tools and a reference library.').testing, undefined);
});

test('negative context switches the sense of a keyword', () => {
  assert.equal(ev('Mod any PC game you own. Recon, reverse engineering, art, in-game testing, showcase videos.').testing, undefined);
  assert.equal(ev('Agent skills for solving CTF challenges - web exploitation, binary pwn, crypto, forensics').finance, undefined);
  assert.ok(ev('MCP server for crypto trading and backtesting').finance);
  assert.equal(ev('Rust vulnerability scanner for XSS and SQL injection in your app').database, undefined);
  assert.equal(ev('Java agent framework built on the ReAct pattern with tool calling').frontend, undefined);
  assert.ok(ev('Generate React components with Tailwind from a prompt').frontend);
});

test('vague words and lone tags are not enough', () => {
  assert.equal(ev('Build agentic workflows. Deploy on cloud, VPC, or self-hosted.').devops, undefined);
  assert.equal(ev('A video editor for agents', { topics: ['html', 'react'] }).frontend, undefined, 'one strong + one weak tag');
  assert.ok(ev('A video editor for agents', { topics: ['react', 'nextjs'] }).frontend, 'two strong tags corroborate');
});

test('keywords inside a comma list in the head count as integrations, not purpose', () => {
  const libre = ev('Enhanced ChatGPT Clone: Features Agents, MCP, Skills, DeepSeek, Anthropic, AWS, OpenAI, Azure, Groq, Mistral.');
  assert.equal(libre.devops, undefined);
  assert.ok(ev('Trail of Bits skills for security research, vulnerability detection, and audit workflows').security.inHead);
});

test('mobile platform topics need developer context', () => {
  assert.equal(ev('Poki uses your iPhone like you do: an agent app that taps and swipes in real apps.').ios, undefined);
  assert.ok(ev('MCP server for agents working on iOS and macOS projects').ios);
});

test('offensive security is its own topic and suppresses the security match', () => {
  const e = ev('A curated library of offensive security skills for red-team work and exploit development');
  assert.ok(e['offensive-security']);
  assert.equal(e.security, undefined);
  assert.ok(topicsIn('run a pentest on staging').has('offensive-security'));
});

test('tool affinity discounts a sibling tool the user never uses', () => {
  const pytestUser = { pytest: 5 };
  assert.equal(toolAffinity('testing', ['playwright'], pytestUser), 0.6);
  assert.equal(toolAffinity('testing', ['playwright'], { playwright: 2 }), 1);
  assert.equal(toolAffinity('testing', ['playwright', 'testing'], pytestUser), 1, 'generic evidence keeps full weight');
  assert.equal(toolAffinity('testing', ['playwright'], {}), 1, 'no known tools -> no penalty');
  assert.equal(toolAffinity('finance', ['trading'], pytestUser), 1);
});

test('tool keywords come only from the fixed vocabulary', () => {
  assert.deepEqual([...toolKeywordsIn('fix my secret-project pytest run with prisma')].sort(), ['prisma', 'pytest']);
  assert.equal(toolForCommand('kubectl get'), 'kubernetes');
  assert.equal(toolForCommand('my-private-script'), null);
});

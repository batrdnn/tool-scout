// Shared by the kickoff tests (not a test file): a project plan, a project folder with dependency
// files, and a small local catalog.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const NOW = Date.parse('2026-11-25T12:00:00Z');
// A phrase that appears only in the plan, so any copy of plan text can be found anywhere.
export const MARKER = 'zebra-ledger-7731';

export const PLAN = `# Project: Ledger (${MARKER})

We are building a trading backtest service for ${MARKER} clients.

## Tasks
- Write pytest tests for every strategy
- Add tests for the order book edge cases
- Store trades in Postgres, with migrations for each schema change
- Deploy with Docker on every merge
- Backtest strategies against five years of OHLC data
- Compare portfolio returns across strategies
- Write a README and the API docs
- Rotate the exchange API secrets every month

## Conventions
- Always use type hints in Python code
- Never commit secrets; keep them in .env files
- Prefer small pull requests with one strategy each
`;

const DAY = 86400e3;
const repo = (full, description, o = {}) => {
  const [owner, name] = full.split('/');
  return {
    full_name: full, name, owner, ownerType: 'Organization', url: `https://github.com/${full}`, description,
    topics: ['claude-code', 'claude-skills'], language: 'Python', stars: 900, forks: 60, openIssues: 3, license: 'MIT',
    archived: false, fork: false, createdAt: new Date(NOW - 400 * DAY).toISOString(), pushedAt: new Date(NOW - 5 * DAY).toISOString(), ...o,
  };
};

export function catalog() {
  const repos = [
    repo('acme/pytest-helper', 'Pytest helper skill: writes and fixes pytest tests for Python projects'),
    repo('quantlab/backtest-mcp', 'Backtesting MCP server: run trading strategy backtests on OHLC data', { topics: ['mcp-server'] }),
    repo('acme/postgres-mcp', 'Postgres MCP server: query your database and plan schema migrations', { topics: ['mcp-server'] }),
    repo('acme/docker-deploy', 'Docker deploy plugin: build images and deploy containers from Claude Code', { topics: ['claude-code-plugin'] }),
    repo('acme/figma-kit', 'Figma design kit for UI mockups', { topics: ['claude-skills'] }),
    // Only mentions docs in passing: not good enough for a docs need.
    repo('misc/everything-kit', 'A big kit of agents for many things. There are some notes on documentation at the end.'),
  ];
  return { updatedAt: new Date(NOW - 3600e3).toISOString(), repos: Object.fromEntries(repos.map((r) => [r.full_name, r])) };
}

export function sandbox({ plan = PLAN } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-kickoff-'));
  const home = path.join(root, 'home'), project = path.join(root, 'ledger'), dataDir = path.join(root, 'data');
  for (const d of [home, project, dataDir]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(project, 'requirements.txt'), 'pytest==8.0\npandas\nsqlalchemy\n');
  fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog()));
  const planFile = path.join(root, 'PLAN.md');
  fs.writeFileSync(planFile, plan);
  return { root, home, project, dataDir, planFile };
}

/** Every file under `dir` with its text. */
export function filesUnder(dir) {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[p] = fs.readFileSync(p, 'utf8'); } };
  walk(dir);
  return out;
}

export { repo as catalogRepo };

/** Mark plugins as installed for the user (what detectInstalled reads). */
export function installPlugins(home, ...names) {
  const dir = path.join(home, '.claude', 'plugins');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: Object.fromEntries(names.map((n) => [n, [{ scope: 'user' }]])) }));
}

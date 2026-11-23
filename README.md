# Tool Scout

Personalized recommendations for trending **Claude Code skills, plugins and MCP servers**,
based on how you actually work, not just what's popular.

Type `/tool-scout:scout` in Claude Code and get up to 5 picks, each with the reason it fits *you*:

> **1. daveebbelaar/bama** (plugin, ★1,950, ~65★/day). Agent skills to build and test native apps with Swift and SwiftUI.
> *Why you:* iOS work came up in 6 of your last 20 sessions, and you hit trouble with it in 2.
> *Install:* `/plugin marketplace add daveebbelaar/bama`

## How it works

```
/tool-scout:scout
  ├─ profile   reads your local Claude Code history (~/.claude/projects) → counts only
  ├─ crawl     GitHub topic search: mcp-server, claude-skills, agent-skills, claude-code-plugin …
  │            saves daily star snapshots → real momentum (stars/day), not just total stars
  ├─ momentum  for the top 25 only: stars actually given in the last 7 days (cached 20h)
  ├─ rank      matches your topics, friction, languages, skips what you already have,
  │            adds basic trust signals (maintenance, license, age, archived)
  └─ Claude    reads the shortlist, drops keyword coincidences, explains the best 5
```

**What it learns from your history:** which topics come up in your sessions (testing, iOS,
databases, trading …), where you hit friction ("still failing", "same error"), which
languages you edit, and which shell commands you run by hand over and over.

## Privacy

- Your session history is analyzed **locally**. The profile keeps **counts only**: no prompt
  text, file paths or command arguments.
- GitHub is queried with **fixed topic searches**. Nothing about you is sent.
- Data lives in the plugin's data folder (`~/.claude/plugins/data/tool-scout…/`) and is deleted
  when you uninstall.

## Install

```
/plugin marketplace add <your-github-user>/tool-scout
/plugin install tool-scout@tool-scout
```

Then run `/tool-scout:scout` (optionally with a focus: `/tool-scout:scout mcp`, `… testing`, `… refresh`).

Requires Node 18+ (already there if you use Claude Code). No other dependencies.
The first run crawls GitHub, which takes about 1 to 3 minutes without a token. Set `GITHUB_TOKEN`
or log in with `gh auth login` to make it faster.

## Command line

```bash
node scripts/scout.mjs profile --show          # see exactly what it learned about you
node scripts/scout.mjs crawl                   # refresh the GitHub catalog
node scripts/scout.mjs recommend --top 10      # ranked list in the terminal
node scripts/scout.mjs all --json              # everything, as JSON
node scripts/scout.mjs dismiss owner/repo      # never recommend this repo again
node scripts/scout.mjs undismiss owner/repo    # bring it back (--all to clear; `dismiss` alone lists)
```

In Claude Code, just say "not interested in owner/repo" after a scout run.

Options: `--days 30`, `--kind skill,plugin,mcp-server`, `--include-low` (show low-trust repos),
`--offline` (no network after the crawl: no momentum or trust scan), `--data DIR`. Behind a proxy,
use `NODE_USE_ENV_PROXY=1`.

**Momentum** for the shortlist is measured, not guessed: Tool Scout first asks the stargazers API
(`Accept: application/vnd.github.star+json`, which has `starred_at`). GitHub currently serves
stargazer lists only to a repo's owner, so when that's refused it counts `WatchEvent`s (stars) in the
repo's public events feed instead. The feed holds the newest 300 events, so for very busy repos the
window can be shorter than 7 days; that's shown as `+N+★`.

## Safety

Trust has two parts. Metadata (maintenance, license, age, archived) for every candidate, and a
**content scan** for the final candidates: Tool Scout reads each one's README, `SKILL.md` files,
install scripts, plugin hooks, `package.json` install scripts and `.mcp.json` through the GitHub API
and sets `trust.flags`:

| flag | what it catches |
|---|---|
| `pipe-to-shell` | `curl … \| sh`, `irm … \| iex`. `low` for the repo's own installer or a well-known one (uv, bun, rustup …), `high` when it runs from a script or skill |
| `prompt-injection` | "ignore previous instructions", "don't tell the user about …", fake system prompts. Quoted examples in a README are `low` |
| `hidden-instructions` | HTML / Markdown comments that address an AI with instructions |
| `invisible-unicode` | bidirectional controls, Unicode tag characters, zero-width characters inside ASCII text |
| `base64-blob` | 200+ character encoded blobs (inline images excluded) |
| `network-call` | calls in scripts / skills / hooks to hosts the README never mentions. Uploads are `medium` |

A `high` flag drops the repo to the low trust tier. Test fixtures and examples aren't scanned
(they aren't installed). Flags for injection-type findings carry file and line only, never the
repo's text. Results are cached per repo until it's pushed again.

This is still a heuristic, **not** a security review: no flags doesn't mean safe. Skills and MCP
servers run with your permissions. Tool Scout never installs anything on its own.

## Development

```bash
npm test     # node --test, no dependencies
```

## Roadmap

- Deeper trust checks: follow scripts that installers download; scan MCP server source, not just configs
- One-click install with a confirmation prompt
- Weekly digest via a Claude Code hook ("3 new tools match your work")
- Learn from feedback: down-weight topics whose picks keep getting dismissed

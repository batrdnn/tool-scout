# Tool Scout

Picks trending Claude Code skills, plugins and MCP servers that fit how you actually work, and checks them before you install.

> **Early beta.** Expect rough edges, and please rate the picks: that's how it gets better.

## Install

In Claude Code:

```text
/plugin marketplace add <your-github-user>/tool-scout
/plugin install tool-scout@tool-scout
```

It works in local Claude Code: the terminal or the desktop app. It doesn't work in cloud
sessions, because it reads your local session history. To drive it from a browser, run
`/remote-control` in a local session.

## Requirements

- **Claude Code, running locally** (terminal or desktop app), not a cloud session.
- **Node.js 18 or newer.** Check with `node --version`. If it's missing or older, install it
  from [nodejs.org](https://nodejs.org) or with `brew install node`. No other dependencies.
- **Internet access to `api.github.com`** for the crawl, momentum and trust checks (`audit`
  needs none). Behind a proxy, set `NODE_USE_ENV_PROXY=1`.
- **Optional: a GitHub token** (`GITHUB_TOKEN`, or `gh auth login`) makes the first crawl faster
  than the usual 1 to 3 minutes.

## Quick start

1. **Scout:** run `/tool-scout:scout`. The first run crawls GitHub (1 to 3 minutes; set
   `GITHUB_TOKEN` or run `gh auth login` to make it faster).
2. **Rate:** reply like `1 useful, 2 not, 3 useful`.
3. **Repeat weekly:** new tools trend every week, and your ratings show whether it helps.

## Commands

| command | what it does |
|---|---|
| `/tool-scout:scout` | up to 5 picks, each with why it fits you, trust flags and the install command |
| `/tool-scout:scout mcp` · `skills` · `plugins` | only that kind |
| `/tool-scout:scout testing` (any topic) | prefer picks for that topic |
| `/tool-scout:scout refresh` | crawl GitHub again first |
| `/tool-scout:check owner/repo` | trust check of one repo before you install it |

Or just ask, in plain language:

| say | runs |
|---|---|
| "1 useful, 2 not" | `rate` |
| "not interested in owner/repo" | `dismiss` |
| "bring back owner/repo" | `undismiss` |
| "leave the tool-scout project out" | `exclude-project` |
| "audit what I have installed" | `audit` |
| "show my scout stats" | `stats` |
| "show my share stats" | `stats --share` |
| "show my scout profile" | `profile --show` |

## Privacy

- Your session history is read **locally** and kept as **counts only**: no prompt text, file
  paths or command arguments.
- GitHub gets fixed topic searches and public repo names. Nothing about you is sent.
- Data lives in the plugin's data folder (`~/.claude/plugins/data/tool-scout-…`) and is deleted
  when you uninstall. `profile --show` shows exactly what it learned and where it's stored.

## Check before you install

Found a skill, plugin or MCP server somewhere else? Run `/tool-scout:check owner/repo` (or
`node scripts/scout.mjs check owner/repo`; a github.com URL works too). It scans the repo's
README, `SKILL.md` files, install scripts, hooks and MCP config, and gives a verdict:

| verdict | meaning |
|---|---|
| `safe-looking` | no medium or high flags, maintained, not archived |
| `review` | medium flags, archived, low metadata trust, or nothing readable: look at the flagged file and line first |
| `do not install` | at least one high flag (prompt injection, hidden instructions, exfiltration, decode-and-run, a download piped into a shell from a script) |

`node scripts/scout.mjs audit` checks what you **already** have (personal skills, installed
plugins, MCP server commands, hooks) from disk, with no network at all.

Both are heuristics: no flags doesn't mean safe. Skills and MCP servers run with your
permissions, and Tool Scout never installs anything on its own.

## Command line

```bash
node scripts/scout.mjs all                # profile + crawl (if stale) + picks
node scripts/scout.mjs profile --show     # what it learned about you, and the data folder in use
node scripts/scout.mjs check owner/repo   # trust check of one repo
node scripts/scout.mjs audit              # local scan of what you have installed
node scripts/scout.mjs rate owner/repo useful|not|clear
node scripts/scout.mjs dismiss owner/repo # also: undismiss, exclude-project, include-project
node scripts/scout.mjs stats [--share]
```

Data folder: `--data DIR`, else `$SCOUT_DATA`, else the installed plugin's folder, else
`~/.tool-scout`. All options, how ranking and trust scoring work, and the eval setup:
[docs/USAGE.md](docs/USAGE.md).

## Development

```bash
npm test     # node --test, no dependencies
```

Testers: see [TESTING.md](TESTING.md). Eval setup: [docs/USAGE.md](docs/USAGE.md#eval-setup).

## Roadmap

- Deeper trust checks: follow scripts that installers download; scan MCP server source, not just configs
- One-click install with a confirmation prompt
- Weekly digest via a Claude Code hook ("3 new tools match your work")
- Learn from feedback: down-weight topics whose picks keep getting dismissed

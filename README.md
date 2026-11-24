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
`/remote-control` in a local session. Needs Node 18+ (already there with Claude Code).

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
plugins, MCP server commands) from disk, with no network at all.

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
`~/.tool-scout`.

## Development

```bash
npm test     # node --test, no dependencies
```

Testers: see [TESTING.md](TESTING.md).

## Roadmap

- Deeper trust checks: follow scripts that installers download; scan MCP server source, not just configs
- One-click install with a confirmation prompt
- Weekly digest via a Claude Code hook ("3 new tools match your work")
- Learn from feedback: down-weight topics whose picks keep getting dismissed

## Details (moving to docs/USAGE.md)

### How it works

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

### All CLI options

```bash
node scripts/scout.mjs profile --show          # see exactly what it learned about you
node scripts/scout.mjs crawl                   # refresh the GitHub catalog
node scripts/scout.mjs recommend --top 10      # ranked list in the terminal
node scripts/scout.mjs all --json              # everything, as JSON
node scripts/scout.mjs dismiss owner/repo      # never recommend this repo again
node scripts/scout.mjs undismiss owner/repo    # bring it back (--all to clear; `dismiss` alone lists)
node scripts/scout.mjs exclude-project tool-scout   # leave a project's sessions out of the profile (persisted)
node scripts/scout.mjs include-project tool-scout   # undo (--all to clear; `exclude-project` alone lists)
node scripts/scout.mjs all --exclude-project tool-scout   # one run only
node scripts/scout.mjs rate owner/repo useful   # or: not | clear (local ratings.json)
node scripts/scout.mjs stats [--share]          # share of rated picks that were useful
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

### Trust scan

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
| `obfuscated-exec` | an encoded payload decoded and executed in one step (`base64 -d \| sh`, `eval(atob(…))`, `powershell -enc`) |
| `exfiltration` | one file reads env vars, SSH keys or credentials and sends data to a host that isn't a known registry. Always `high` |
| `network-call` | calls in scripts / skills / hooks to hosts the README never mentions. Uploads are `medium` |

The same README read gives the **install hint**: the repo's real Claude Code command when there
is one (`claude mcp add …`, `/plugin marketplace add …` + `/plugin install …`, or a copy/clone into
`~/.claude/skills`). For a marketplace with several plugins it's the `marketplace add` plus
"then choose a plugin with /plugin". Lines aimed at another agent (Codex, Cursor, Gemini, …) are
rejected, and so is anything that chains commands (`;`, `&&`, `|`, `$(…)`). With no such command
the hint is a link to the README, never a guess. It's shown, never run.

A `high` flag drops the repo to the low trust tier. Test fixtures and examples aren't scanned
(they aren't installed). Flags for injection-type findings carry file and line only, never the
repo's text. Results are cached per repo until it's pushed again.

This is still a heuristic, **not** a security review: no flags doesn't mean safe. Skills and MCP
servers run with your permissions. Tool Scout never installs anything on its own.

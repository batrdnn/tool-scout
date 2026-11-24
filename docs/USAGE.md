# Tool Scout: full usage

The [README](../README.md) covers install and everyday use. This page has the details: every
CLI option, how ranking and trust scoring work, and the eval setup.

## CLI reference

All commands: `node scripts/scout.mjs <command> [options]`.

| command | what it does |
|---|---|
| `profile [--show] [--json]` | build the profile from local history and save it (counts only); prints it and the data folder in use |
| `crawl [--max-pages N]` | refresh the GitHub catalog (fixed topic searches) and save a daily star snapshot |
| `recommend [--top 8]` | ranked picks from the saved profile and catalog |
| `all [--refresh]` | profile + crawl (if older than 20 h, or `--refresh`) + recommend |
| `check <owner/repo \| URL> [--json]` | trust check of one repo before installing |
| `audit [--json]` | local scan of installed skills, plugins and MCP server commands; no network |
| `dismiss [owner/repo]` | never recommend this repo again; no argument lists dismissed repos |
| `undismiss <owner/repo> \| --all` | bring it back |
| `exclude-project [name\|path]` | leave a project's sessions out of the profile (persisted); no argument lists them |
| `include-project <name\|path> \| --all` | undo |
| `rate <owner/repo> useful\|not\|clear` | was a shown pick useful? (local `ratings.json`) |
| `me [--json] [--card out.svg]` | your Claude Code animal from the saved profile (counts only); `--card` writes a shareable SVG; see [Your Claude Code animal](#your-claude-code-animal) |
| `stats [--share] [--json]` | share of rated picks that were useful, and the data folder; `--share` prints the only text a tester is asked to share |

Options:

| option | for | meaning |
|---|---|---|
| `--days N` | profile, recommend, all | history window (default 30) |
| `--top N` | recommend, all | number of picks (default 8) |
| `--kind skill,plugin,mcp-server,tool,app` | recommend, all | only these kinds; standalone apps (chat UIs, editors) are left out unless `app` is listed |
| `--include-low` | recommend, all | show low-trust repos too |
| `--offline` | recommend, all | no network after the crawl: no momentum or trust scan |
| `--exclude-project a,b` | profile, recommend, all | leave these projects out for one run |
| `--include-current` | profile, recommend, all | count the session you run it from (left out by default: it's the request, not your work) |
| `--json` | most | machine-readable output |
| `--data DIR` | all | data folder (see below) |
| `--home DIR` | all | home folder to read history from (default `~`) |

**Data folder.** `--data DIR`, else `$SCOUT_DATA`, else the installed plugin's data folder
(`~/.claude/plugins/data/tool-scout-tool-scout`, or the newest `tool-scout-*` folder there), else
`~/.tool-scout`. `profile --show` and `stats` print which one is in use and why.

Behind a proxy, use `NODE_USE_ENV_PROXY=1`. A GitHub token (`GITHUB_TOKEN`, or `gh auth login`)
makes the crawl faster.

## How ranking works

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
languages you edit, which libraries your projects declare (`package.json`,
`requirements.txt`, `go.mod`, …), and which shell commands you run by hand over and over.
Topics you act on (edit such files, run such commands) weigh more than topics you only talk about.

**Momentum** for the shortlist is measured, not guessed: Tool Scout first asks the stargazers API
(`Accept: application/vnd.github.star+json`, which has `starred_at`). GitHub currently serves
stargazer lists only to a repo's owner, so when that's refused it counts `WatchEvent`s (stars) in the
repo's public events feed instead. The feed holds the newest 300 events, so for very busy repos the
window can be shorter than 7 days; that's shown as `+N+★`.

## How trust scoring works

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

A `high` flag drops the repo to the low trust tier. Test fixtures and examples aren't scanned
(they aren't installed). Flags for injection-type findings carry file and line only, never the
repo's text. Results are cached per repo until it's pushed again.

The same README read gives the **install hint**: the repo's real Claude Code command when there
is one (`claude mcp add …`, `/plugin marketplace add …` + `/plugin install …`, or a copy/clone into
`~/.claude/skills`). For a marketplace with several plugins it's the `marketplace add` plus
"then choose a plugin with /plugin". Lines aimed at another agent (Codex, Cursor, Gemini, …) are
rejected, and so is anything that chains commands (`;`, `&&`, `|`, `$(…)`). With no such command
the hint is a link to the README, never a guess. It's shown, never run.

`check` turns the same scan plus metadata into a verdict (`safe-looking`, `review`,
`do not install`) and shows how many files it read. `audit` reads your personal skills
(`~/.claude/skills`), installed plugin folders (`~/.claude/plugins`), the MCP server commands
in `~/.claude.json` and project `.mcp.json` files, and the hooks in `~/.claude/settings.json`,
`~/.claude/settings.local.json` and each project's `.claude/settings.json` (plus any script a hook
runs) from disk, with no network. It lists every hook by event and matcher, and anything medium or
high with file and line (never MCP arguments or hook commands, which can hold tokens).

This is a heuristic, **not** a security review: no flags doesn't mean safe.

## Your Claude Code animal

`scout.mjs me` (and `/tool-scout:me`) reads the saved profile (counts only; it builds one if
there is none) and maps it to one animal. It's just for fun and doesn't change ranking or
recommendations: the only link is one text line, "Tools that fit a Beaver: run
/tool-scout:scout". The same profile always gives the same animal, text and card.

**How the animal is picked.** Each animal gets a score = its signal ÷ its threshold, capped at 2
(so 1 means the threshold is reached). The highest score wins; a tie goes to the earlier animal in
this order: Beaver, Owl, Bee, Octopus, Ant, Fox, Turtle. A second animal ("Close second") is shown
when its score is at least 0.85 of the winner's. Under 10 sessions in the window, it is always the
Egg; if the top score behind it is at least 1, the Egg also shows "Hatching into… <animal>?" (in the
text and on the card), next to "come back after 10 sessions".

| animal | title | signal (from the profile) | threshold (score 1) |
|---|---|---|---|
| **Beaver** | The Builder | edits and new files (`Edit`, `MultiEdit`, `Write`, `NotebookEdit`) ÷ all tool calls | 0.4 |
| **Owl** | The Debugger | (sessions where debugging came up + sessions with friction on the top friction topic) ÷ sessions | 0.3 |
| **Bee** | The Tester | sessions running the most-used test command (`npm test`, `pytest`, `go test`, …) ÷ sessions | 0.5 |
| **Octopus** | The Orchestrator | MCP servers used, scaled by projects ÷ 3 when there are fewer than 3 projects | 3 servers, 3 projects |
| **Ant** | The Grinder | distinct commands repeated in 3+ sessions, not counting everyday shell utilities (`ls`, `cat`, `grep`, `sed`, …) | 6 commands |
| **Fox** | The Explorer | average of (topics in 2+ sessions ÷ 8) and (languages edited ÷ 3) | 8 topics, 3 languages |
| **Turtle** | The Deep Diver | tool calls per session, scaled by 2 ÷ projects when there are more than 2 projects | 40 calls, 2 projects |
| **Egg** | Not hatched yet | fewer sessions than the threshold; "come back after 10 sessions" | 10 sessions |

**What it shows:** the animal's ASCII art, its title, the time window ("Your last 30 days: N
sessions across M projects"), up to 3 evidence lines, a
superpower, a blind spot, a close second if there is one, and the link line. Evidence lines
must support the animal: each candidate line has a strength (its signal ÷ a reference value), a
line whose value is 0 or whose strength is under 0.5 is never shown, and the 3 strongest are kept.
With thin history that can be fewer than 3. The text uses counts,
topic names and language names only: never commands, MCP servers, libraries, installed tools,
projects or paths. `--json` gives the same plus every animal's score.

**The card.** `me --card out.svg` also writes a self-contained SVG (no scripts, fonts or links)
with the animal, its title and 3 general stats: sessions, top language and top topic. The language
and topic are shown only when they are names from Tool Scout's fixed vocabulary, so a hand-edited
profile can't put other text on it. A test fails if any other profile string appears on the card.

## Eval setup

```bash
npm test                                   # unit and CLI tests, no network
npm run eval                               # shortlist precision on frozen personas and catalog
npm run eval -- --set holdout              # blind-labeled holdout set (reporting only)
npm run eval:e2e -- --samples 3            # end-to-end with Claude as judge; cached per sample
npm run eval:e2e -- --samples 3 --cache-only   # replay the cache without calling the judge
```

The offline eval scores the script's shortlist (before Claude's judgment step) against 3
synthetic personas and a frozen 55-repo catalog. Files, metrics and results are in
[test/eval/README.md](../test/eval/README.md); the holdout set is described in
[test/eval/holdout/README.md](../test/eval/holdout/README.md). Release reports are in
[docs/reports](reports/).

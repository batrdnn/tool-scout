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
| `head <owner/repo> [--part NAME] [--json]` | the first 40 lines of the SKILL.md(s) a close call rests on, as fenced data, from the scan's cache; refuses repos the content scan flagged for injection-type content. The skills use it to decide Build your own vs Install |
| `install <owner/repo> [--part NAME] [--scope user\|project] [--replace] --plan` | writes nothing: prints the plan (files, settings, commands, scope, pinned commit, check verdict and coverage, credentials to set yourself) and its ID, valid for 15 minutes. For an MCP server not from a known vendor it looks up npx/uvx package versions on npm or PyPI (the package name only) to pin them. `--replace` (skill folders): swap the skill that is there now for this version in one step, one file at a time, so it never disappears; `undo` puts the previous version back |
| `install <owner/repo> --confirm <planId>` | does exactly that plan, and only if nothing changed (re-checked at the pinned commit) and the verdict isn't "do not install"; logged in the data folder |
| `build --start --form F --name N [--fresh]` | makes `drafts/N/` in the data folder (refuses a folder left by an earlier run; `--fresh` clears it) and says which files form F needs (skill, command, subagent, hook, memory) |
| `build --form F --name N --from DIR [--scope user\|project\|personal] [--replace] [--source owner/repo] --plan` | writes nothing: checks Claude's draft and prints the plan (files and where they go, the trust scan, any source repo's license) and its ID, valid for 15 minutes. Scope `personal` (hooks only): the hook runs in this project for you alone; its entry goes into the project's `.claude/settings.local.json` and its script into `~/.claude/hooks/<name>/`, so nothing is shared through the repo. `--replace` (skill, command, subagent, memory): swap the current version for the draft in one step; `undo` puts the previous version back |
| `build --confirm <planId>` | writes exactly that plan, logged like an install |
| `build --confirm-hook <hookId>` | a hook's second, separate confirmation, with the ID that `--confirm` printed: `--confirm` alone only records the first yes and writes nothing |
| `kickoff --plan-file <path> [--project DIR] [--json]` | a project plan becomes a needs list (tasks, stack, domain, conventions), saved only in the data folder (`kickoff/needs.json`), and a toolkit of at most 5 items; proposes only, never installs |
| `kickoff --rematch` | matches the saved needs list again, after Claude corrected it |
| `kickoff --summary [--json]` | what was installed or built since the kickoff, each with its undo command |
| `undo <name>` | removes exactly what an install logged and restores the logged settings; after a `--replace`, puts the previous version back |
| `installed [--json]` | what Tool Scout installed and hasn't undone |
| `dismiss [owner/repo]` | never recommend this repo again; no argument lists dismissed repos |
| `undismiss <owner/repo> \| --all` | bring it back |
| `exclude-project [name\|path]` | leave a project's sessions out of the profile (persisted); no argument lists them |
| `include-project <name\|path> \| --all` | undo |
| `rate <owner/repo> useful\|not\|clear` | was a shown pick useful? (local `ratings.json`) |
| `me [--json] [--card [out.svg]] [--open]` | your Claude Code animal from the saved profile (counts only); `--card` writes a shareable SVG, `--open` then opens it; see [Your Claude Code animal](#your-claude-code-animal) |
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
| `--plain` | all | plain text even in a terminal. Without it, output to a terminal (a TTY) has colors, boxes and aligned columns; `NO_COLOR` turns the colors off, and without a UTF-8 locale it's drawn in ASCII. Pipes, files and Claude Code always get plain text |
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

## Build or install

For each final pick (and for `check`), the content scan also reads the repo's file tree and up to
6 small manifests (`package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`,
`.env.example`, a compose file, `.mcp.json`). `scripts/lib/effort.mjs` turns them into:

- **What it is:** instructions-only skill (just `.md` files), skill with scripts, plugin with hooks
  or agents, MCP server, or app.
- **Size:** files, approximate lines of code (file bytes ÷ 35; docs, tests, examples, vendored and
  generated code, lockfiles and assets don't count), main languages, runtime dependencies.
- **Needs:** credentials, network, and running services (a compose file, `docker run` when it's the
  only way to run it, a database driver or image). Only names that look like secrets count:
  `*_API_KEY`, `*_TOKEN`, `*_SECRET`, `*_ACCESS_KEY`, `*_PAT`, OAuth client IDs; plus "API key" or
  "OAuth" when the README asks the user for one. Not counted: settings that merely end like one
  (`AGENT_MAX_CONCURRENT_JOBS_PER_TOKEN`: MAX, TIMEOUT, CONCURRENT, PER, EXPIRE…), passwords, an
  app's own secrets (`SECRET_KEY`, `JWT_SECRET`), and keys an example file ships with a working
  default value (those connect the app's own containers). An API is named only from a known list
  (`KNOWN_APIS` in effort.mjs) or a prefix whose domain the README links (`BALE_BOT_TOKEN` +
  `bale.ai`); otherwise the advice says "needs N credentials"

| advice | when |
|---|---|
| Build your own | instructions only, or at most `SMALL_LOC` = 300 lines of code, and no external API or service |
| Either | medium size (301 to 2,999 lines), or small but tied to one API or service |
| Install | at least `LARGE_LOC` = 3,000 lines; or over 300 lines wrapping an API or needing a service; or pushed in the last `ACTIVE_DAYS` = 14 days with at least `ACTIVE_MIN_LOC` = 1,000 lines |

**Collections.** A repo with at least `COLLECTION_MIN` = 3 skills, agents, MCP servers or plugins
is a "collection of N skills" (the most numerous kind decides). It is judged by its typical
(median) part, and the largest part is named with its own advice: never by the total size. When a
part's name fits one of your profile topics (e.g. `webapp-testing` for testing), the advice points
to it.

**Reference: read it, copy what you need.** Some repos are material to read rather than a tool:
a spec (its description or title says specification), examples for learning (examples, demos,
cookbook, tutorial, mastery, templates…), or companion skills for the owner's own API (the only
credentials are for an API named after the repo's owner, so you need that API either way). Only the
repo's description and the README's first heading are read for this, and MCP servers are never
Reference.

**Leaning to Install.** Two cases go to Install whatever the size: an official repo from the
vendor (`OFFICIAL_ORGS` in effort.mjs: anthropics, microsoft, github, awslabs, …), "maintained by
the vendor"; and a thin wrapper, at most `THIN_MAX_LOC` = 1,000 lines of its own code around one
big library (Playwright, Puppeteer, LangChain, boto3, …) or the library it's named after, "most of
the work is in …". A vendor collection still names its typical and largest parts.

**Close calls are Claude's.** For instructions-only and small repos (at most `SMALL_LOC` lines of
code, no running service), and for a collection's typical part, the script doesn't advise: it
reports the facts with `advice: "judge"` ("Judgment needed"), the form and time if built, and the
rules' fallback in `judgment.ruleAdvice`. The scout and check skills then read the head of the
SKILL.md(s) with `scout.mjs head` and decide: general knowledge Claude already has → Build your
own; specialized or curated expertise, or tricky domain rules → Install ("text only, low risk,
check passed" when the scan raised no medium or high flags). Vendor repos, thin wrappers, large
and service-backed repos keep the rules' advice.

"Build your own" and "Either" come with a form (hook, subagent, slash command, a CLAUDE.md note
for up to `NOTE_MAX_LINES` = 40 lines of instructions, a skill, or a skill with a script) and a
time. The facts are cached with the scan; the advice is worked out when read. It's advice:
Nothing is built or installed without a plan and your yes. Results are in `effort` in the JSON, an "Effort"
line in the text output, and `check`.

## Project kickoff

`/tool-scout:kickoff` (or `kickoff --plan-file <path> [--project DIR]`) turns a project plan into a
toolkit. It only proposes: each item is then installed or built through its own plan and yes/no.

**The plan text stays local.** It is read from the file (a pasted plan is first written to
`kickoff/plan.md` in the data folder, then moved) and kept in one place: `kickoff/needs.json` in the
data folder. It never goes into a network request, the catalog or its caches, or a log. The only
network traffic is the scout's own: a catalog refresh with the fixed topic searches when the
catalog is over 20 hours old, and the content scan of matched repos by name (`--offline` skips both).

**Needs.** Each line of the plan is matched against the shared topic list (the same one the
profile uses). Lines that start with always, never, must, should, prefer or avoid, or sit under a
heading like Conventions, are conventions. The stack comes from the project's dependency files
(the same parser as the profile's stack). The domain is the most-mentioned domain topic (finance,
iOS, ML, data and the like). Claude reads the plan too and can correct the needs list in the file,
then match again with `--rematch`. The needs file has a format version: `--rematch` on an older one
derives the needs again from the saved plan text and says so.

**Matching.** Each need is ranked on its own with the same ranking as the scout (`recommend`,
unchanged), as if the user's history held only that need: its topic, the specific tools its lines
name, and the project's libraries for it. A match is good enough when the repo says it is about
the need in its name or first clause, or is built around one of the project's libraries. With
network, the match then gets the scout's content scan: a high trust flag rules it out, and its
effort estimate decides Install or Build your own (Build your own and Reference picks become a
build, with the repo as the idea's source).

**Docs work** (polish the README, write a FAQ or API docs, a post) is "nothing needed", never a docs
tool, unless the plan asks for a repeatable docs workflow (generated, automated, kept up to date).

**Without a good match:** everyday work (git, docs, testing, debugging, refactoring, frontend,
backend, database, data, security, planning) is "nothing needed: Claude handles this without a
tool"; other work that takes two or more lines of the plan is a proposal to build a small skill.

**Candidates first.** Before the catalog, each need is checked against Anthropic's official
marketplace (`anthropics/claude-plugins-official`, its `marketplace.json`, fetched by repo name only
and cached for a week) and a short list of built-in Claude Code features (`/ultrareview`,
`/security-review`, `/simplify`). They are preferred over trending repos for the same need. An
official plugin gets the same install plan as `/tool-scout:check` (hooks, settings changed, pinned
commit, license, scope) shown before its one yes/no; a built-in
feature is something you type yourself.

**Judgment.** Before showing the toolkit, Claude applies the scout skill's filtering (steps 2-4) to
every match. A repo it calls weak goes into `rejects` in the needs file and `--rematch` offers the
next fit, "nothing needed" or a build proposal: a weak fit is never shown.

**Not tool needs.** CI config files, icons and posts are listed apart as `toolkit.direct`: "nothing
needed: Claude does this directly", with one line on how. They are not among the 5 items.

**Setup cost.** A match that needs a local service, or more than 3 credentials, that the plan
doesn't mention is labeled "heavy setup", counts 0.6 of its impact, and loses to a lighter match
for the same need.

**The memory note** has only the conventions not already in CLAUDE.md (a convention counts as covered
when most of its words are in one paragraph there). If all are covered, no note is offered and the
output says so. An item with `doubts` (heavy setup, a middling trust tier, or Claude's own) gets
"Skip (recommended)" first in its yes/no.

**The list.** Items are ordered by impact (the plan lines a need covers, half a point per project
library, one more for the domain; installs count fully, builds 0.9, nothing needed 0.4). The list has
at most 5 items: the memory note takes one slot unless all its conventions are covered, so at most 4 others.
`kickoff --summary` lists what was installed or built since the kickoff, each with its undo command.

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

**The card.** `me --card out.svg` also writes a self-contained SVG (plain `--card` saves `./tool-scout-me.svg`
and prints the full path) (no scripts, fonts or links)
with the animal, its title and 3 general stats: sessions, top language and top topic. The language
and topic are shown only when they are names from Tool Scout's fixed vocabulary, so a hand-edited
profile can't put other text on it. A test fails if any other profile string appears on the card.

**Pixel art.** Each animal is a 16×16 sprite stored in `scripts/lib/sprites.mjs` (no images, no
dependencies). A color terminal draws it with half-block characters (24-bit color when `COLORTERM` allows it,
else 256 colors). Plain output (`--plain`, pipes, Claude Code) and `NO_COLOR` draw it in two tones plus an
accent (█, ▓ and blank) with no escape codes; an ASCII-only terminal keeps the old ASCII art. The SVG card
draws the same sprite as crisp pixel squares.

**Opening the card.** `me --card out.svg --open` opens the saved card with the system opener (`open` on macOS,
`xdg-open` on Linux) so you see the full-color version; if there is no opener, it is skipped without a message.
The `/tool-scout:me` skill saves the card in the plugin's data folder and opens it this way.

## Eval setup

```bash
npm test                                   # unit and CLI tests, no network: failures and a one-line summary
npm run test:verbose                       # the same, with every test listed
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

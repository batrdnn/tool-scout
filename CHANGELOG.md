# Changelog

One short entry per release. Details, numbers and commits are in [docs/reports](docs/reports/).

## v0.17.1 (2026-11-26)

Review findings that apply with the installer off. No ranking change.

- `--data` (and `SCOUT_DATA`) now refuse a folder that isn't Tool Scout's own: it needs the
  `.tool-scout-data` marker, or must be new, empty, or hold only files Tool Scout writes. Permissions
  are only ever changed on Tool Scout's own files, never on a project's.
- A project you left out now contributes nothing: not its sessions (as before), and now not the tools
  installed in its folder or its hooks in `audit` either.
- `--offline` makes no network request at all, which a test checks. `all` uses the saved catalog and says
  how old it is, instead of crawling; `check`, `crawl` and `line` say they need the network.
- A small starter catalog ships with Tool Scout, so the first run ranks at once instead of waiting about
  two minutes. The real crawl runs in the background (or first, with `--refresh`).
- `kickoff` no longer prints your plan text, the plan's path or the project's path and name into Claude's
  context. The needs file on disk still keeps the plan.
- Running the tests no longer opens a browser tab (the `me --open` test).

## v0.17.0 (2026-11-26)

Safe mode, after an independent review of v0.16.1. Tool Scout now only recommends and checks. No
ranking change.

- Installing, building and turning on hooks are off by default. `scout`, `check`, `audit`, `me` and
  `kickoff` still work, read-only, and show manual install steps instead of "Install it" or "Build my
  own". The installer is still in the code, behind `scout.mjs experimental on` (off by default, you turn
  it on yourself, and every run prints a warning). `undo` and `installed` always work.
- The review's C1, C2, C5 and C6 (a plan can be confirmed by the agent that made it, a marketplace name
  can bring in a different plugin, a symlink can redirect a project write, undo can report success when
  it failed) are reproduced as skipped tests, "known, fixed in v0.18".
- The README, FAQ, SECURITY.md, TESTING.md, USAGE, the launch post and the skills no longer claim that
  "every install can be undone" or that nothing about you leaves the machine. They say what Tool Scout
  keeps, and that a summary goes into Claude's context when you run a skill.
- New `privacy` command: every file Tool Scout keeps, what is in it and how to delete it (it never
  prints contents). Expired install and build plans are now deleted by every command.
- Anything that writes defaults to project scope, never user. `--scope user` is only honored when asked.

## v0.16.1 (2026-11-26)

Three fixes from a real check and install of a hosted MCP server. No ranking change.

- The check now looks at every flagged line before it offers a plan. A new command,
  `scout.mjs line <owner/repo> <file>:<line>`, prints that one line fenced as data, with invisible
  characters written out. The skill shows it and says what it is. It never offers "Install it" with
  an unexamined medium or high flag. Text from injection-type flags is still never shown, and a file with one never has any line shown.
- The plan for a hosted MCP server says in plain words "Data you send through it goes to <host>",
  and that the service was not scanned. When the verdict is "review", the question offers
  "Skip (recommended)" first.
- A hosted MCP server is now planned at project scope (this project's `.mcp.json`) unless you ask
  for `--scope user`. Local servers and everything else keep the user default.

## v0.16.0 (2026-11-26)

A polish round before the tester round. No ranking change.

- The plugin has an icon: an original pixel-art compass in the style of the animals, made by a
  script with no dependencies. The missing-icon warning from `claude plugin validate` is gone.
- A demo for the README: `docs/demo.tape` records `all` for a made-up user in a clean terminal
  (`brew install vhs && vhs docs/demo.tape`). The README shows the recorded GIF.
- The README has a FAQ: privacy, installs, offline use, Windows, the animal, how to uninstall
  everything and how to report a security issue. A launch post draft is in `docs/launch-post.md`.
- Kickoff: a plugin switched on in the project's own `.claude/settings.json` or
  `settings.local.json` now counts as already installed (a plan line about GitHub issues answers
  "already installed: github" there).
- TESTING.md is refreshed for testers: install, what to try (scout, check, me, kickoff), how to
  rate, how to file a GitHub issue, and what `stats --share` contains.

## v0.15.0 (2026-11-26)

Tool Scout now runs and is tested on Windows, and every push is checked on three systems.

- GitHub Actions runs the tests and `claude plugin validate` on ubuntu, macOS and Windows with
  Node 20, 22 and 24 on every push and pull request (9 jobs, offline, no secrets). A status badge
  is on the README.
- The minimum is now Node 20 (it was 18). The startup check, `package.json`, the README, TESTING.md
  and every skill's "Node is too old" text say the same.
- Windows fixes found by the CI logs: `npm test` works with Node 20 in PowerShell, file URLs
  become real paths, hook commands quote Windows paths (with forward slashes), `audit` finds a
  hook's script, plans show `~/...` paths the same way everywhere, and `me --card --open` opens
  the card with `start`. Text files are pinned to LF with a `.gitattributes`.
- What can't work on Windows now fails with a message, and the README Requirements say so:
  installs that run the `claude` CLI need `claude.exe` (a `claude.cmd` shim is refused, since
  Tool Scout never runs a shell), and POSIX file modes (0600/0700) don't exist there.
- The README Requirements now say "Tested on macOS, Linux and Windows."

## v0.14.1 (2026-11-26)

Kickoff answers every line of your plan, and stops matching tools to tasks that are not tool work.

- Recruiting people, submitting or publishing, recording a demo GIF, writing a post or a FAQ and
  drawing icons or sprites are never matched to a tool now, even when the line mentions GitHub or
  git. Your v1.0 plan no longer gets a code-review tool for "bug reports as GitHub issues".
- Every task line gets an answer: a tool, "nothing needed: Claude does this directly", "already
  installed: <name>", or "outside Claude Code: <one line>" (for example a terminal recorder for a
  demo GIF). No line is skipped silently.
- A status line in the plan is answered by the built-in `/statusline`: nothing to install, you
  type it yourself.
- Needs files saved by older versions are re-derived from the saved plan text on the next
  `--rematch`; your rejects are kept.

## v0.14.0 (2026-11-26)

Your animal's blind spot now points at a tool.

- Each animal's blind spot maps to one topic: Owl testing, Beaver docs, Bee debugging, Octopus
  security, Ant refactoring, Fox planning, Turtle git. The map is in docs/USAGE.md. The Egg has no
  blind-spot tool; it still says to come back after 10 sessions.
- `me --blind-spot` prints one line, "Your blind spot (<topic>): <tool> (<why>)", with the single
  best tool for that topic: official plugins and built-in features first, then the catalog, with
  the content scan applied. If nothing is good enough it says "nothing needed: Claude covers this
  directly".
- `/tool-scout:me` has a new option, "Look at my blind-spot tool". It goes through
  `/tool-scout:check`, then "Install it" with the usual plan and one yes/no, and never installs on
  its own.
- Nothing new leaves your machine: matching is local, and the only request is the existing content
  scan of the one matched repo, by name. It is covered by the network-capture test.
- The README roadmap lists v1.1: animal evolution and a status line companion.

## v0.12.2 (2026-11-25)

Security release: update with `claude plugin update tool-scout@tool-scout`.

- An MCP server added over http or sse must point at an `http(s)://` URL; a README line that puts
  an option there instead is refused.
- The scan now catches injection phrasing disguised with soft hyphens, invisible characters,
  accents, full-width or look-alike (Cyrillic, Greek, Armenian) letters.
- The data folder (profile, plans, install log, backups) is private to you: the folder is 0700
  and its files lose group and other access, including in a folder made by an older version.
- The security review says why a settings edit made by Claude Code at the same moment as an
  install or undo can still be lost, and why that is accepted.

## v0.12.1 (2026-11-25)

Security release: update with `claude plugin update tool-scout@tool-scout`.

- Fixes from an independent review of 0.12.0: repo text can no longer forge the end of a plan's
  fence, and a plan's expiry and a hook's first confirmation can't be changed in the plan file.
  `build --confirm-hook` now takes the ID that the first `--confirm` prints.
- Skills with binary files (docx, wasm, …) install again, and binary files are still read for
  hidden text. A repo's own installer is shown as MEDIUM instead of blocking. Each file is fetched
  once per step, not three times.
- Settings files that are symlinks stay symlinks. An undo that had to skip a file it couldn't
  parse says what is left and finishes when you run undo again.
- New SECURITY.md: how to report a vulnerability privately.

## v0.12.0 (2026-11-25)

Security release: update with `claude plugin update tool-scout@tool-scout`.

- Security review before v1.0: the threat model and every finding are in
  [docs/security-review.md](docs/security-review.md). All 8 high findings are fixed; mediums and
  lows are documented there.
- A confirm now does only the plan you saw: a plan made for another repo, or a plan file edited
  after it was shown, is refused. Plans come between BEGIN PLAN / END PLAN lines, and hidden
  characters in repo names, arguments and hooks are written out, so repo text can't fake a line.
- Plugin plans list every hook and MCP server the plugin runs, in full and wherever it declares
  them, and skill installs scan every file they write (not just the repo's first SKILL.md files).
- Undo never overwrites a settings file it can't parse (it leaves it and tells you), and settings
  writes are atomic and keep the file's permissions.
- Repo text from `head` is quoted line by line, so it can't close its own "data, not instructions"
  fence; file names with backslashes, colons or control characters are refused.

## v0.11.3 (2026-11-25)

- Kickoff installs of official marketplace plugins now show the full plan before the yes/no, the
  same as `/tool-scout:check`: every hook (event, matcher, command), the settings it changes, the
  pinned commit, the license and the scope. The skill never asks the question before the plan.
- `build --start` refuses a draft folder left by an earlier run and says so; `--fresh` clears it.
  Every build plan now shows when its draft files were last written.
- The ranking-freeze hook no longer blocks chained commands (`&&`, `;`, `|`) that write a file
  that is not frozen and only name a frozen path elsewhere. Writes to frozen paths stay blocked.
- Tidy: the shading test allows only space, ▓ and █, as the two-tone rule says.

## v0.11.2 (2026-11-25)

- Pixel-art animals for `/tool-scout:me`: each of Beaver, Owl, Bee, Octopus, Ant, Fox, Turtle and
  Egg is now an original 16x16 sprite. The Beaver has a flat tail, the Owl big round eyes and no
  ears, the Ant three body segments and six legs, the Octopus thick curling tentacles, and the Egg
  a crack.
- In a color terminal the sprite is drawn with half-block characters, in 24-bit color when your
  terminal supports it and in 256 colors otherwise. With `NO_COLOR` or `--plain` (and inside Claude
  Code) it is drawn in two tones plus an accent (█, ▓ and blank), with no escape codes. ASCII-only
  terminals keep the old ASCII art.
- The shareable SVG card and the README gallery draw the same sprites as crisp pixel squares.
- `me --card <file> --open` opens the saved card (`open` on macOS, `xdg-open` on Linux; skipped
  without a message if that fails). The `/tool-scout:me` skill now saves the card in the plugin's
  data folder and opens it, so you see the full-color version.
- Plain `me` output changes: the old ASCII art is replaced by the shaded sprite.

## v0.11.1 (2026-11-25)

- Kickoff fix round after a first run where none of the 5 items was worth keeping. Claude now
  judges every match with the scout's own filtering before showing it, and never shows one it calls
  weak: that need becomes "nothing needed" or a build proposal.
- New candidates, preferred over trending repos: Anthropic's official marketplace (by repo name
  only) and a short list of built-in Claude Code features such as /ultrareview.
- CI config files, icons and posts are "nothing needed: Claude does this directly", with one line
  on how. A match that needs a local service or more than 3 credentials the plan doesn't mention is
  ranked down and labeled "heavy setup".
- The CLAUDE.md note holds only conventions not already in CLAUDE.md (none is offered when all are
  covered), and an item with doubts gets "Skip (recommended)" first in its yes/no.
- Polishing docs or writing a post is "nothing needed" unless the plan asks for a repeatable docs
  workflow. Saved needs files have a format version: `--rematch` on an older one derives the needs
  again from the saved plan text and says so. The README and USAGE describe all of this.

## v0.11.0 (2026-11-25)

- Project kickoff: `/tool-scout:kickoff` takes a plan (pasted or a file) and turns it into a needs
  list (tasks, stack, domain, conventions), kept only in the data folder and never sent anywhere.
- It proposes at most 5 items, by impact, each with one reason tied to the plan: a catalog match
  (same ranking, effort and trust as the scout), something to build, or "nothing needed", plus a
  CLAUDE.md note with the plan's conventions. You choose; each item gets its own plan and yes/no,
  and a summary lists what was set up with undo commands.
- `--replace` swaps an installed skill, or a built skill, command, subagent or memory section, in
  one step (never missing in between); undo puts the previous version back.
- Hooks can be personal: the entry goes into the project's `.claude/settings.local.json`.

## v0.10.0 (2026-11-25)

- Build your own, with consent: "Build my own" for Build your own picks, or "build me a skill
  that …" without one. Claude asks at most 2 questions, writes a draft in its own words into the
  data folder (never straight into `~/.claude` or the project), then `build --plan` (files and
  where they go, the trust scan, the source repo's license) → one yes → `build --confirm`, logged
  like an install so `undo` works.
- Forms: skill, slash command, subagent, CLAUDE.md memory (a section between markers; undo removes
  exactly that) and hook (project scope by default, the whole script shown, no network, and a
  second, separate confirmation with `--confirm-hook`).
- Drafts must pass the trust scan with nothing above low, and no network call or pipe-to-shell.
  No text from an unlicensed source repo; a permissive one allows adapting with an attribution line.
- Privacy: the README and skills say install plans may look up package versions on npm or PyPI
  (the package name only).

## v0.9.1 (2026-11-25)

- When Tool Scout can install a pick itself (a skill folder, a plugin marketplace, a README
  `claude mcp add`), check and scout say "Tool Scout can install this for you (you'll see a plan
  first)" and offer "Install it", never "no install command".
- An outdated plugin: the skills say to run `claude plugin update tool-scout@tool-scout` and
  restart, never to use a working copy of the repo; the CLI says so for an unknown command.
- MCP servers not from a known vendor: npx/uvx packages are pinned to their current version in the
  plan (`@latest` becomes `@1.2.3`), with the reason.
- Plugin plans list each hook (event, matcher, what it runs), shown next to the yes/no question.
- Plans warn "No license: you have no formal permission to use or copy this."
- Undo now puts back a setting the user had for the same key (a plugin they had disabled); tested
  with marketplaces and settings that existed before the install.
- `npm test` prints only failures and a one-line summary; `npm run test:verbose` prints everything.

## v0.9.0 (2026-11-25)

- Install with consent: `install owner/repo --plan` writes nothing and shows the exact files,
  settings, commands, scope, pinned commit, check verdict and the credentials you set yourself.
  `--confirm <planId>` (within 15 minutes) does exactly that plan, and refuses on "do not install"
  or any change. Skills are copied from the pinned commit; plugins and MCP servers go through the
  claude CLI. Nothing from the repo is ever run, and API keys are never asked for.
- Every install is logged; `undo <name>` removes exactly that, `installed` lists them.
- Claude offers "Install it" per pick (plan, plain words, one yes/no question, then confirm).
- New advice "Reference: read it, copy what you need" for specs, examples and API companions.

## v0.8.1 (2026-11-25)

- Collections (3+ skills, agents, MCP servers or plugins) are judged per part: "collection of 20
  skills", the typical part and the largest, never the total. The advice points to the part that
  fits your topics when one does.
- Credentials: only secret-looking names count (not settings like `…_MAX_…_PER_TOKEN`, passwords or
  keys shipped with a working default). APIs are named only when known; otherwise "needs N
  credentials".
- Thin wrappers around one big library, and official vendor repos, lean to Install.
- Close calls (instructions-only and small repos) are Claude's: the script flags "Judgment needed",
  Claude reads the head of the SKILL.md (`scout.mjs head`) and decides Build your own or Install.
- New 20-repo review with Claude's decisions in `docs/eval/effort-review.md`. Ranking is unchanged.

## v0.8.0 (2026-11-25)

- Build-or-install advice for each pick and for `check`: what the repo is (instructions-only
  skill, skill with scripts, plugin with hooks or agents, MCP server, app), its size, what it needs
  (credentials, network, docker or a database), and Build your own / Either / Install with one
  plain reason. In `--json` (`effort`), an "Effort" line in the text output, and the skills.
  Advice only: nothing is built or installed.
- Claude's per-pick question now offers "Why build vs install?" (it ends with the install steps).
- The CLI titles its list "Shortlist (unfiltered)" and points to `/tool-scout:scout`.
- `docs/eval/effort-review.md`: the estimate on 20 real repos, for human review
  (`npm run eval:effort`). Ranking is unchanged.

## v0.7.0 (2026-11-25)

- Run in a terminal, output has colors, boxes, dividers and aligned columns (`all`, `recommend`,
  `profile`, `me`, `check`, `audit`, `stats`). Pipes, files, `--json` and Claude Code get the plain
  text, unchanged. `--plain` forces it; `NO_COLOR` turns colors off; ASCII without a UTF-8 locale.
- Skills always run the script with `--json` or `--plain`, so Claude never sees escape codes.
- After the picks, Claude asks a multiple-choice question per pick: show install steps, check it
  first, rate useful / not, or not interested. `/tool-scout:me` offers "See recommendations" and
  "Save my card". Nothing is installed.
- README "In a terminal" section with a screenshot (`npm run screenshot`). Ranking is unchanged.

## v0.6.1 (2026-11-24)

- `/tool-scout:me`: evidence lines must support the animal (no zero values, the 3 strongest).
- An Egg shows "Hatching into… <animal>?" when its top score is at least 1, in the text and on the card.
- `me --card` with no path saves `./tool-scout-me.svg` and prints the full path.
- README gallery of example cards for all 7 animals and the Egg (`npm run gallery`).
- `stats --share` includes the animal's name, and nothing else from the profile.
- README "Updating" section; versions in sync, checked by a test.

## v0.6 (2026-11-24)

- `scout.mjs me [--json] [--card out.svg]` and `/tool-scout:me`: your Claude Code animal (Beaver,
  Owl, Bee, Octopus, Ant, Fox, Turtle; Egg under 10 sessions), picked the same way every time from
  the saved profile.
- A shareable SVG card with the animal, its title, sessions, top language and top topic only, and a test that it holds no other profile string.
- Thresholds and the mapping are documented in docs/USAGE.md. Ranking is unchanged.

## v0.5.1 (2026-11-23)

- `check` shows "Checked N files: …" under the verdict, and notes that MCP server source and
  container images are not scanned.

## v0.5 (2026-11-23)

- `scout.mjs check <owner/repo | URL>` and `/tool-scout:check`: a trust verdict (safe-looking,
  review, do not install) before installing.
- `scout.mjs audit`: a local scan of the skills, plugins, MCP server commands and hooks you have installed, with no network.
- `eval:e2e --samples N` for judge-noise ranges. README "Check before you install" section.

## v0.4.1 (2026-11-23)

- Vendor-SDK false matches fixed: lists of providers and lone library mentions no longer count as stack evidence.
- Fixed-denominator precision (fp@k) in both evals.
- The skill shows 3 picks when 3 have solid evidence.
- About 100 well-known libraries map to topics.

## v0.4 (2026-11-23)

- `npm run eval:e2e`: the top 25 go through the skill's judgment step, scored against frozen labels.
- Repeated commands come only from real command heads, never quoted bodies or heredocs.
- Topics weighted by source: what you act on counts more than what you only talk about.
- Stack signals from local dependency files.
- `rate` and `stats` for rating picks; `TESTING.md` and `stats --share` for testers.

## v0.3 (2026-11-23)

- Trust tier filtered after the content scan, with backfill.
- Momentum measured for every final pick.
- Install hints only from real Claude Code commands.
- Kind detection, including a new `app` kind left out by default. Platform fit.
- One repo per job in the top 5.
- Thin-history rules and a "limited history" note under 10 sessions.
- `exclude-project` to leave a project out of the profile.
- A blind-labeled holdout eval set.
- Must-catch malicious fixtures (exfiltration, decode-and-run, zero-width characters).

## v0.2 (2026-11-23)

- An offline eval harness (3 personas, 55 labeled repos).
- Better ranking precision: mean p@5 went from 0.27 to 0.80.
- Measured 7-day star momentum.
- A content trust scan of the final candidates.
- `dismiss` / `undismiss`.
- Real install commands taken from each repo's README.
- The running session is left out of the profile.

## v0.1 (2026-11-23)

- Baseline:
  - a local, counts-only profile of your Claude Code sessions
  - a GitHub topic crawl for skills, plugins and MCP servers
  - ranking by your topics, friction and languages, with basic trust signals
  - the `/tool-scout:scout` skill

# Changelog

One short entry per release. Details, numbers and commits are in [docs/reports](docs/reports/).

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

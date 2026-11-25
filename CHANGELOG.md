# Changelog

One short entry per release. Details, numbers and commits are in [docs/reports](docs/reports/).

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

---
name: scout
description: Recommend trending Claude Code skills, plugins and MCP servers that fit how this user actually works, based on their local session history. Use when the user runs /scout, or asks what tools, skills, plugins or MCP servers they should install, or what's trending that would help them.
argument-hint: "[focus, e.g. testing | mcp | refresh]"
---

# Tool Scout

You recommend GitHub-hosted Claude Code extensions that fit this user's real workflow.
A bundled script does the counting and crawling; your job is judgment: reject keyword
false positives, pick the few that genuinely help, and explain why in terms of the
user's own work.

## Privacy rules (tell the user if they ask)

- The script reads `~/.claude/projects/*.jsonl` locally and keeps **counts only**
  (topics, languages, command names). No prompt text, file paths or arguments are stored.
- GitHub is queried with fixed topic searches. Nothing about the user is sent anywhere.
- Do not read the user's session transcripts yourself. Work only from the script's output.

## Steps

1. Run the scout (add `--refresh` if the user said "refresh" or the catalog is over a day old):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/scout.mjs" all --top 25 --json --data "${CLAUDE_PLUGIN_DATA}"
   ```

   If the user named a focus (e.g. "mcp", "skills", "testing"), add `--kind mcp-server`,
   `--kind skill`, or `--kind plugin` where it fits, or prefer that topic when you choose.
   The first run crawls GitHub (about 1 to 3 minutes without a GitHub token; set `GITHUB_TOKEN`
   or log in with `gh` to make it faster). If GitHub can't be reached and the user is behind
   a proxy, retry with `NODE_USE_ENV_PROXY=1` in front of the command.

2. Read the JSON. `profile` shows what the user does (`topics` = sessions touching it,
   `friction` = sessions where they hit trouble with it, `repeatedCommands`, `languages`,
   `installed`). `recommendations` is a keyword-ranked shortlist with `evidence`, momentum
   (`starsPerDay`, `momentumSource`: `measured` means real stars per day between crawls,
   `estimated` means lifetime average) and basic `trust`.

3. **Filter the shortlist.** For each candidate, read its description and ask: would this
   actually help with what the profile shows? Drop:
   - keyword coincidences (e.g. a game-modding kit matched "testing" because it mentions
     "in-game testing"; a social-media scraper matched "git" because it lists GitHub as a source)
   - consumer apps that aren't developer or agent tools
   - anything that duplicates something in `installed`
   - offensive-security or other risky tooling unless the profile clearly shows that work

4. **Pick at most 5.** Favor, in this order: friction topics, repeated manual commands an
   extension would automate, the user's top topics. Prefer variety over five picks on one theme.

5. **Present** each pick as:

   **N. owner/repo** (kind, ★ stars, momentum): one sentence on what it does.
   *Why you:* tie it to concrete evidence ("testing came up in 10 of your 20 sessions, and
   you hit trouble with it in 2").
   *Install:* the `install` hint. For skills and MCP servers, say to check the README for
   the exact command.
   *Check first:* any `trust.notes`.

   Then add one short line: "Skipped N shortlist matches that only matched on keywords." Also mention
   anything notable in `repeatedCommands` that no pick covers (it might be worth writing a
   small skill for it).

6. End with a short safety reminder: skills and MCP servers run with your permissions.
   Skim the repo (especially `SKILL.md`, install scripts and any network calls) before
   installing. Never install anything yourself unless the user explicitly asks.

If `profile.sessions` is 0 or very small, say the recommendations are based on very little
history, and show the top trending picks for their languages instead.

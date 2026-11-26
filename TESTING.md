# Testing Tool Scout

Thanks for trying Tool Scout. It takes about 15 minutes. We ask for your ratings, for a GitHub
issue when something is wrong, and for one short block of text, shown in full below **before**
you share anything.

## 1. Install

You need Claude Code running locally (terminal or desktop app) and Node 20 or newer. Inside
Claude Code:

```text
/plugin marketplace add batrdnn/tool-scout
/plugin install tool-scout@tool-scout
```

Prefer a local copy of this repo? Use `/plugin marketplace add ./tool-scout` (the path to your
copy) instead of the first line. Restart Claude Code, or run `/reload-plugins`, if the skills
don't show up. Optional: set `GITHUB_TOKEN`, or log in with `gh auth login`, to make the first run
faster (it crawls public GitHub search results).

## 2. Run it

In any project, ask Claude:

```text
/tool-scout:scout
```

or just "what Claude Code tools should I install?". The first run starts from a small starter catalog and refreshes it from GitHub in the background (1 to 3 minutes), so you don't wait.

What happens on your machine:

Tool Scout doesn't upload your history. When you run a skill, a summary goes into Claude's context like anything else you show Claude.

- Your recent Claude Code sessions (`~/.claude/projects`) and your projects' dependency files
  (`package.json`, `requirements.txt`, `go.mod`, …) are read **locally**. Tool Scout saves a
  profile: counts of topics and languages, the first word of commands you repeat, and the names of
  the tools and libraries your projects use. No prompt text, no file contents.
- GitHub gets fixed topic searches, then the names of public repos it checks. With the experimental
  installer (off by default), an install plan for an MCP server may also look up a package's current
  version on npm or PyPI (the package name only).
- Tool Scout doesn't install anything in this version (safe mode). It shows manual steps for you to
  read and follow yourself, at project scope. `node scripts/scout.mjs privacy` lists every file it
  keeps and how to delete it.

If you're working on this plugin itself, leave that project out first:
"tool-scout: exclude the tool-scout project" (or
`node scripts/scout.mjs exclude-project tool-scout` from the repo).

## 3. What to try

Do these in any order, in a project you really work on. Each takes a few minutes.

- **Scout:** `/tool-scout:scout`. Do the picks fit how you work? Is the "why" true for you? Try
  `/tool-scout:scout mcp` or a topic, like `/tool-scout:scout testing`.
- **Check:** `/tool-scout:check owner/repo` on a skill, plugin or MCP server you've been
  wondering about. Is the verdict fair? Does it point at the file and line behind each flag?
  Heuristics aren't proof: tell us when it flags something harmless, or misses something.
- **Me:** `/tool-scout:me`. Does your animal match how you work? Ask for "a card" if you like it.
  It's for fun and doesn't change your picks.
- **Kickoff:** `/tool-scout:kickoff` and paste a few lines of a plan, for a real project or a
  made-up one, for example "Write pytest tests for every strategy. Deploy with Docker on every
  merge. Track bugs as GitHub issues." You get at most 5 items. Each one you choose gets its
  manual steps; nothing is installed or built for you. Are the steps clear? Would you follow them?
- **Privacy:** `node scripts/scout.mjs privacy` (or ask Claude "what does Tool Scout keep about me?").
  Does the list match what you expected, and is it clear how to delete each file?

## 4. Rate every pick

After the picks, Claude asks whether each one was useful. Answer in one line, for example:

```text
1 useful, 2 not, 3 useful
```

Rate honestly: "not" is just as useful to us. Changed your mind? "rate #2 as useful".
Run the scout again on other days or in other projects and rate those picks too.

## 5. File an issue

Something wrong, confusing or missing? Open an issue:
https://github.com/batrdnn/tool-scout/issues/new

Please include:

- the version (`version` in `package.json`, or the first line of `stats --share`)
- the command you ran, or what you asked Claude
- what happened, with any error text
- what you expected instead

Don't paste your profile, `profile.json`, prompts or screenshots of your picks into an issue:
the words above are enough, and a repo name you rated is fine. A **security** problem is
different: don't open a public issue, report it privately as described in
[SECURITY.md](SECURITY.md).

## 6. Share your stats, and only those

When you're done, ask Claude: "show my tool scout share stats". It runs `stats --share` and
prints the text below. This is the **only** thing we ask you to share. It holds aggregate counts,
the names of the public repos you rated, and the name of your Claude Code animal (just the name,
like `Bee`; see `/tool-scout:me`). It doesn't include your profile, topics, libraries,
project names, prompts or anything else from your machine. Tool Scout never sends it: you copy and
paste it yourself, if you agree with what you see.

Example of exactly what you'll see and share:

<!-- share-example -->
```text
This is everything that would be shared: aggregate counts, the rated repo names and your Claude Code animal.
No profile, topics, libraries, projects or prompts. Nothing is sent: copy it yourself if you agree.

tool-scout 0.17.1 ratings (2026-11-26)
animal: Bee
rated: 3
useful: 2 (67%)
not useful: 1
useful repos: agentskills/agentskills, microsoft/playwright-mcp
not useful repos: hkuds/vibe-trading
```

If a repo name in that list feels private to you (for example, it hints at what you work on),
delete that line before sharing. The counts alone are still useful.

Please don't send screenshots of the picks, `profile.json`, or any other file from the data
folder.

## Undo everything

Tool Scout v0.17 installs nothing, so there is normally nothing to undo. Please don't turn on the
experimental installer to test it: it has known problems (see [SECURITY.md](SECURITY.md)). If an
older version installed things for you, in this order, because the list lives in the data folder:

1. `node scripts/scout.mjs installed` lists what it installed or built for you (run it from your
   copy of the repo), and `node scripts/scout.mjs undo <name>` tries to remove each one. Then check
   by hand that it's gone: undo can say it worked when it didn't.
2. `/plugin uninstall tool-scout@tool-scout` removes the plugin. It can leave the data folder behind.
3. Delete the data folder: `node scripts/scout.mjs privacy` prints where it is and the command
   (`~/.tool-scout` if you ran it from a copy of the repo).

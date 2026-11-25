# Testing Tool Scout

Thanks for trying Tool Scout. It takes about 10 minutes, and the only thing we ask you to send
back is one short block of text, shown in full below **before** you share anything.

## 1. Install

You need Claude Code and Node 18 or newer. From a local copy of this repo, inside Claude Code:

```text
/plugin marketplace add ./tool-scout
/plugin install tool-scout@tool-scout
```

Use the path to your copy instead of `./tool-scout` if it lives elsewhere. Restart Claude Code if
the skill doesn't show up. Optional: set `GITHUB_TOKEN`, or log in with `gh auth login`, to make
the first run faster (it crawls public GitHub search results).

## 2. Run it

In any project, ask Claude:

```text
/tool-scout:scout
```

or just "what Claude Code tools should I install?". The first run takes 1 to 3 minutes.

What happens on your machine:
- Your recent Claude Code sessions (`~/.claude/projects`) and your projects' dependency files
  (`package.json`, `requirements.txt`, `go.mod`, …) are read **locally**. Only counts are kept.
- GitHub gets fixed topic searches and public repo names. An install plan for an MCP server may
  also look up a package's current version on npm or PyPI (the package name only). Nothing about
  you is sent.
- Tool Scout installs only after you approve a plan, and every install can be undone. Without your yes to a plan, it only shows install steps for you to review.

If you're working on this plugin itself, leave that project out first:
"tool-scout: exclude the tool-scout project" (or
`node scripts/scout.mjs exclude-project tool-scout` from the repo).

## 3. Rate every pick

After the picks, Claude asks whether each one was useful. Answer in one line, for example:

```text
1 useful, 2 not, 3 useful
```

Rate honestly: "not" is just as useful to us. Changed your mind? "rate #2 as useful".
Run the scout again on other days or in other projects and rate those picks too.

## 4. Share your stats, and only those

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

tool-scout 0.12.1 ratings (2026-11-25)
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

- `/plugin uninstall tool-scout@tool-scout` removes the plugin.
- Everything Tool Scout stored is in its data folder (the plugin's data directory, or
  `~/.tool-scout` when run from the repo). Delete that folder to remove it all.

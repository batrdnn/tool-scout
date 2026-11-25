---
name: kickoff
description: Start a new project with the right Claude Code tools. Turns the user's project plan (pasted text or a file) into a needs list and proposes a toolkit of at most 5 items (catalog matches, things to build, a CLAUDE.md note), then installs or builds only what the user chooses, one item at a time. Use when the user runs /tool-scout:kickoff, or shares a project plan, spec or README and asks which tools, skills, plugins or MCP servers to set up for it, or how to kick off a project with Claude Code.
argument-hint: "[path to the plan] [project folder]"
---

# Tool Scout: project kickoff

The user gives a plan for a project. You turn it into a needs list, and Tool Scout matches each
need against its local catalog with the same ranking, effort estimate and trust checks as the
scout. Your job is judgment: correct the needs list, explain the toolkit plainly, and take each
chosen item through its own plan and its own yes/no.

## Privacy rules (tell the user if they ask)

- The plan text is never sent anywhere. It is read locally and kept in one file only: the needs
  file, `kickoff/needs.json` in Tool Scout's data folder. It never goes into a network request,
  the catalog or its caches, or a log.
- Matching uses only the local catalog and the project's dependency files (package.json,
  requirements.txt, pyproject.toml, go.mod, Cargo.toml, Gemfile, Package.swift, Podfile).
- The only network traffic is the scout's own: refreshing the catalog with its fixed topic
  searches when it is over a day old, and scanning matched repos by their public names.
- Never paste the plan into a web search, a GitHub query or any other tool that sends it out.

## Running the script

Always pass `--json` or `--plain` when you run the script. Run by a person in a terminal it draws
colors and boxes, and its escape codes would show up here as garbage like `[31m`. `--plain` is the
same text without them; `--json` is for reading results.

Below, `…` stands for running the bundled script: node, `${CLAUDE_PLUGIN_ROOT}/scripts/scout.mjs`,
the command, and `--data "${CLAUDE_PLUGIN_DATA}"` at the end.

## Steps

1. **Get the plan.** If the user named a file, use its path. If they pasted the plan, write the
   pasted text exactly as given, with the Write tool, to `${CLAUDE_PLUGIN_DATA}/kickoff/plan.md`
   (the data folder; Tool Scout moves it into the needs file and deletes that copy). If there is
   no plan yet, ask for it in one line. The project folder is the one they named, or the current
   working directory when the plan is for this project; if neither fits, leave it out.

2. **Make the needs list and the toolkit:**
   `… kickoff --plan-file <path> --project <folder> --json`
   (leave out `--project` when there is no folder). The first run of a day may refresh the catalog
   (about 1 to 3 minutes without a GitHub token).

3. **Check the needs list.** Read the plan yourself and compare it with `needs`: `needs[].topic`
   (from the shared topic list), `lines` (the plan's lines for it), `libraries` (from the project's
   dependency files), `domain` and `conventions`. If a need is wrong (a keyword coincidence) or
   missing, or a convention was missed, edit `needsFile` with the Edit tool: remove the need, add
   `{ "topic": "<topic>", "kind": "task", "lines": ["<the plan's line>"], "libraries": [], "impact": <number of lines> }`,
   or add the convention's line to `conventions`. Topics must be from the shared list (the error
   names them). Then match again: `… kickoff --rematch --json`. Don't rematch if nothing changed.

4. **Present the toolkit**, at most 5 items, in the order given (by impact). For each:
   **N. what** (Install `owner/repo`, Build your own `<form>`, CLAUDE.md note, or Nothing needed):
   its `reason` line, which ties it to the plan. For an install, add the kind, ★ stars, `trust`
   tier and `effort` label when present; for a build with a `source`, say the idea comes from that
   repo. Say "nothing needed: Claude handles this without a tool" for `nothing` items as given.
   If `omitted` is above 0, say how many smaller needs were left out. Relay every entry in `notes`.

5. **Next.** Each item names its own plan command in `next`. Offer to take the items the user wants
   through "Installing, with consent" or "Building your own, with consent" in the scout skill, one at
   a time, each with its own plan and its own yes/no.

## If the script fails

If running the script fails because Node.js is missing (`node: command not found`) or too old
(the script prints "Tool Scout needs Node.js 18 or newer"), tell the user in plain words: Tool
Scout needs Node.js 18 or newer; they can check with `node --version` and install it from
nodejs.org or with `brew install node`, then try again. Don't try to install Node yourself.

If the script says `Unknown command` for `kickoff`, the installed Tool Scout is older than this
skill: tell the user to run `claude plugin update tool-scout@tool-scout` and then restart Claude
Code. Never run another copy of `scout.mjs` instead.

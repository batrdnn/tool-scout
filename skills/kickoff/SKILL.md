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

Below, `…` stands for running the bundled script as in the Final summary block: node,
`${CLAUDE_PLUGIN_ROOT}/scripts/scout.mjs`, the command, and `--data "${CLAUDE_PLUGIN_DATA}"` at the end.

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

5. **Selection.** With AskUserQuestion, ask "Which of these should I set up?", header `Toolkit`,
   `multiSelect: true`, one option per item, labeled like "1. Install owner/repo".
   "Nothing needed" items are not options. A question takes at most 4 options: with 5 items, ask about items 1 to 4,
   then item 5 in a second question in the same call. If the user picks nothing, stop: say they can
   run the kickoff again later. Without AskUserQuestion, ask in one line ("Reply with the numbers,
   like `1, 3`") and wait.

## Each chosen item, one item at a time

Take the chosen items in toolkit order, one item at a time, and finish each before starting the
next. Never in bulk: never one plan, one question or one confirmation for several items.

- **Install** items: follow "Installing, with consent" in the scout skill (`/tool-scout:scout`):
  make the plan with the item's `next` command (`… install <owner/repo> --scope project --plan --plain`),
  show it in plain words (what gets written or run and where, settings, the pinned commit, the check
  verdict and coverage, credentials to set yourself, and the license line), ask one yes/no question
  for that item only ("Install <name> as planned?", options "Yes, install it" and "No"), and only
  after "Yes" run `… install <owner/repo> --confirm <planId> --plain`.
- **Build** items: follow "Building your own, with consent" in the scout skill. Start the draft with
  the item's `next` command (`… build --start --form <form> --name <name> --plain`), write it in your
  own words, tailored to the plan's needs and stack, then make the plan with
  `… build --form <form> --name <name> --from <folder> --scope project --plan --plain` (add
  `--source <owner/repo>` when the item has a `source`), show it in plain words, ask one yes/no
  question ("Build <name> as planned?", "Yes, build it" and "No"), and only after "Yes" run
  `… build --confirm <planId> --plain`. A hook also needs its second, separate confirmation.
- **The CLAUDE.md note**: a memory build. Start it with the item's `next` command, write the
  section with the plan's `conventions` (one short bullet each, in the plan's own terms) plus one
  line on the stack and domain, then plan it with `--scope project`, show the section text in plain
  words, ask one yes/no question, and only after "Yes" confirm it. If the project's CLAUDE.md
  already has that section, plan with `--replace`.

Each item gets its own yes/no, after its own plan. If an item's plan says "Blocked", explain why
and go on to the next item. If the user says "No" to one, skip it and go on. Never pass --confirm
without that item's yes for that exact plan ID.

## Final summary

When every chosen item is done, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/scout.mjs" kickoff --summary --plain --data "${CLAUDE_PLUGIN_DATA}"
```

and show what was installed or built, each with its undo command (`… undo <name> --plain`), and
which chosen items were skipped or blocked, in a few lines. Mention credentials to set by name
only. Remind them that the needs file (`kickoff/needs.json` in the data folder) holds the plan
text, and they can delete it.

## If the script fails

If running the script fails because Node.js is missing (`node: command not found`) or too old
(the script prints "Tool Scout needs Node.js 18 or newer"), tell the user in plain words: Tool
Scout needs Node.js 18 or newer; they can check with `node --version` and install it from
nodejs.org or with `brew install node`, then try again. Don't try to install Node yourself.

If the script says `Unknown command` for `kickoff`, the installed Tool Scout is older than this
skill: tell the user to run `claude plugin update tool-scout@tool-scout` and then restart Claude
Code. Never run another copy of `scout.mjs` instead.

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

4. **Judge every match.** Before showing anything, read the `/tool-scout:scout` skill's steps 2-4
   (the shortlist filtering) and apply those rules to every `install` and `build` item that has a
   repo: a keyword coincidence, a consumer app, a duplicate of something installed, a repo for
   another OS, risky tooling the plan doesn't call for, a high trust flag, or simply a tool that
   doesn't do what the plan's lines ask. Read the repo's description against the plan's lines, as
   the scout does. If you would call a match weak, write its `owner/repo` into a `rejects` list in
   `needsFile` (with the Edit tool) and run `… kickoff --rematch --json`: the script then offers
   the next fit, or "nothing needed", or a build proposal. Repeat until you would stand behind
   every item. Never show an item you yourself call weak, and never show one with a caveat like
   "probably not useful".

5. **Present the toolkit**, at most 5 items, in the order given (by impact). For each:
   **N. what** (Install `owner/repo`, Build your own `<form>`, CLAUDE.md note, or Nothing needed):
   its `reason` line, which ties it to the plan. For an install, add the kind, ★ stars, `trust`
   tier and `effort` label when present, and label it "heavy setup" with its `heavy` text when that is set (it needs a local service or more than 3 credentials the plan doesn't mention; the script already ranked it lower); for a build with a `source`, say the idea comes from that
   repo. An `install` item with `kind: official-plugin` comes from Anthropic's official marketplace
   (`anthropics/claude-plugins-official`): say so, and show its `command`. A `builtin` item is a
   Claude Code feature (like `/ultrareview`): nothing to install, the user types it themselves; say
   so, including any cost noted in its `reason`. Say "nothing needed: Claude handles this without a tool" for `nothing` items as given.
   After the items, list `toolkit.direct` (CI config files, icons, posts: needs that are not tool
   needs) as "nothing needed: Claude does this directly", each with its one line on how. They
   are not among the 5 and not options.
   If `omitted` is above 0, say how many smaller needs were left out. Relay every entry in `notes`.

6. **Selection.** With AskUserQuestion, ask "Which of these should I set up?", header `Toolkit`,
   `multiSelect: true`, one option per item, labeled like "1. Install owner/repo".
   "Nothing needed" items are not options. Built-in items are not options either. A question takes at most 4 options: with 5 items, ask about items 1 to 4,
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
- **Official plugin** items (`kind: official-plugin`): they get the same plan as any install, the
  one `/tool-scout:check` gives. Make it with the item's `next` command
  (`… install anthropics/claude-plugins-official --part <plugin> --scope project --plan --plain`),
  then show it in plain words before anything else: every hook (event, matcher, command), the
  settings it changes, the pinned commit or version, the license line and the scope (this project).
  Never ask the yes/no question before the plan has been shown. Then ask one yes/no question for
  that item only ("Install <plugin> as planned?", "Yes, install it" and "No"), and only after
  "Yes" run `… install anthropics/claude-plugins-official --confirm <planId> --plain`. The plan runs
  `claude plugin install <plugin>@claude-plugins-official --scope project` for you; never run that
  `command` yourself. Undo is `… undo <plugin>@claude-plugins-official --plain`.
- **Build** items: follow "Building your own, with consent" in the scout skill. Start the draft with
  the item's `next` command (`… build --start --form <form> --name <name> --plain`), write it in your
  own words, tailored to the plan's needs and stack, then make the plan with
  `… build --form <form> --name <name> --from <folder> --scope project --plan --plain` (add
  `--source <owner/repo>` when the item has a `source`), show it in plain words, ask one yes/no
  question ("Build <name> as planned?", "Yes, build it" and "No"), and only after "Yes" run
  `… build --confirm <planId> --plain`. A hook also needs its second, separate confirmation.
- **The CLAUDE.md note**: a memory build. Start it with the item's `next` command, write the
  section with only the conventions in the item's `conventions` (the ones not already in the
  project's CLAUDE.md; one short bullet each, in the plan's own terms) plus one
  line on the stack and domain, then plan it with `--scope project`, show the section text in plain
  words, ask one yes/no question, and only after "Yes" confirm it. If the project's CLAUDE.md
  already has that section, plan with `--replace`. When there is no CLAUDE.md note item, every
  convention is already in CLAUDE.md: relay that from `notes` and offer no note.

**Doubts.** An item has doubts when its `doubts` list is not empty (heavy setup, a middling trust
tier) or when you have any of your own after the plan (something in the plan's verdict, a license
or credential you would not want in this project). Then its one yes/no question lists
"Skip (recommended)" first, ahead of "Yes, install it" / "Yes, build it", and says the doubt in
one line. With no doubts, the options are the usual two.

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

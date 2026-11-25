---
name: me
description: Show the user's Claude Code animal (Beaver, Owl, Bee, Octopus, Ant, Fox, Turtle, or Egg before 10 sessions), worked out from their local Tool Scout profile. Use when the user runs /tool-scout:me, or asks what their Claude Code animal, archetype or working style is.
---

# Tool Scout: your Claude Code animal

A bundled script maps the user's local profile (counts only, built from their recent Claude Code
sessions) to one animal. The mapping is fixed: the same profile always gives the same animal.
Nothing leaves the machine.

## Running the script

Always pass `--json` or `--plain` when you run the script. Run by a person in a terminal it draws
colors and boxes, and its escape codes would show up here as garbage like `[31m`. `--plain` is the
same text without them; `--json` is for reading results.

## Steps

1. Run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/scout.mjs" me --plain --data "${CLAUDE_PLUGIN_DATA}"
   ```

2. Show the output exactly as printed, in a `text` code block, so the shaded pixel-art animal keeps its shape.
   Don't change the animal, the evidence lines or the counts, and don't add a different animal.
   You may add one short sentence afterwards in your own words about what the evidence says.
3. Keep the last line ("Tools that fit a … : run /tool-scout:scout") as it is. Don't run the
   scout yourself unless they pick "See recommendations" below, and don't suggest specific tools
   here; the animal doesn't change recommendations.
4. If it is the Egg (under 10 sessions), say they can come back after 10 sessions. If it shows
   "Hatching into… <animal>?", present that as an early hint, not their animal yet.

## Ask what's next

After the animal, ask one multiple-choice question with the AskUserQuestion tool: "What next?",
header `Next`, single choice, with these options:
- "See recommendations": run the `/tool-scout:scout` skill and follow its steps.
- "Save my card": make the card as in Shareable card below and give the user the full path.

Skip this question if the user already asked for the card. If they skip it, do nothing more. A
typed "Other" answer is a normal message. If AskUserQuestion isn't available, don't ask: the last
line already points to `/tool-scout:scout`. Neither option installs anything.

## Shareable card

When the user asks for a card, image or something to share, add `--card`. With no path it saves
`tool-scout-me.svg` in the current folder; if the user names a path, put it right after `--card`.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/scout.mjs" me --card --plain --data "${CLAUDE_PLUGIN_DATA}"
```

The script prints "Card saved to <full path>": give the user that full path, so they can find it.
Tell them where it was saved and what is on it: the animal, its title, the session count, the
top language and the top topic. Nothing else: no project, library or repo names, paths or
prompt text. Don't add anything to the file yourself.

## If the script fails

If running the script fails because Node.js is missing (`node: command not found`) or too old
(the script prints "Tool Scout needs Node.js 18 or newer"), tell the user in plain words: Tool
Scout needs Node.js 18 or newer; they can check with `node --version` and install it from
nodejs.org or with `brew install node`, then try again. Don't try to install Node yourself.

If the script says `Unknown command`, or prints its usage line instead of a result, for a command
this skill describes, the installed Tool Scout is older than this skill. Tell the user to run
`claude plugin update tool-scout@tool-scout` and then restart Claude Code. Never run another copy
of `scout.mjs` instead, such as a working copy of the repo: it isn't what they installed or
approved.

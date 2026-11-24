---
name: me
description: Show the user's Claude Code animal (Beaver, Owl, Bee, Octopus, Ant, Fox, Turtle, or Egg before 10 sessions), worked out from their local Tool Scout profile. Use when the user runs /tool-scout:me, or asks what their Claude Code animal, archetype or working style is.
---

# Tool Scout: your Claude Code animal

A bundled script maps the user's local profile (counts only, built from their recent Claude Code
sessions) to one animal. The mapping is fixed: the same profile always gives the same animal.
Nothing leaves the machine.

## Steps

1. Run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/scout.mjs" me --data "${CLAUDE_PLUGIN_DATA}"
   ```

2. Show the output exactly as printed, in a `text` code block, so the ASCII art keeps its shape.
   Don't change the animal, the evidence lines or the counts, and don't add a different animal.
   You may add one short sentence afterwards in your own words about what the evidence says.
3. Keep the last line ("Tools that fit a … : run /tool-scout:scout") as it is. Don't run the
   scout yourself or suggest specific tools here; the animal doesn't change recommendations.
4. If it is the Egg (under 10 sessions), say they can come back after 10 sessions. If it shows
   "Hatching into… <animal>?", present that as an early hint, not their animal yet.

## Shareable card

When the user asks for a card, image or something to share, add `--card <file>.svg` (the path
they name, else `claude-code-animal.svg` in the current folder):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/scout.mjs" me --card claude-code-animal.svg --data "${CLAUDE_PLUGIN_DATA}"
```

Tell them where it was saved and what is on it: the animal, its title, the session count, the
top language and the top topic. Nothing else: no project, library or repo names, paths or
prompt text. Don't add anything to the file yourself.

## If the script fails

If running the script fails because Node.js is missing (`node: command not found`) or too old
(the script prints "Tool Scout needs Node.js 18 or newer"), tell the user in plain words: Tool
Scout needs Node.js 18 or newer; they can check with `node --version` and install it from
nodejs.org or with `brew install node`, then try again. Don't try to install Node yourself.

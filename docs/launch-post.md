# Tool Scout: Claude Code tools that fit how you actually work

New Claude Code skills, plugins and MCP servers appear every day, and most lists rank them by popularity, not by what you need. Tool Scout is a Claude Code plugin that picks from what is trending on GitHub, based on how you really use Claude Code.

## What it does

Run `/tool-scout:scout` and you get up to five picks. Each one says why it fits you, shows trust flags, and gives the manual install steps. You rate them ("1 useful, 2 not"), and that is how it improves.

- `/tool-scout:check owner/repo` checks any skill, plugin or MCP server before you install it.
- `/tool-scout:kickoff` takes a project plan and proposes a toolkit of at most five items.
- `/tool-scout:me` names your Claude Code animal: Beaver, Owl, Bee, Octopus, Ant, Fox or Turtle. It is just for fun.

## Why history, and why vetting

A recommendation that ignores your work is a guess. So Tool Scout reads your last 30 days of local Claude Code sessions and keeps a profile of topics, languages and friction. Someone who debugs a lot gets different picks from someone who ships iOS apps.

Fit is only half of it. Skills and MCP servers run with your permissions, so every pick is also scanned for prompt injection, hidden instructions, exfiltration and download-and-run tricks. Those checks are heuristics, not a guarantee: no flags doesn't mean safe, which is why you see the flagged file and line.

## Privacy, in plain words

Tool Scout doesn't upload your history. When you run a skill, a summary goes into Claude's context like anything else you show Claude. What it saves locally is a profile: counts of topics and languages, the first word of commands you repeat, and the names of the tools and libraries you use, with no prompt text or file contents. GitHub receives fixed topic searches and the names of public repos it checks.

It installs nothing. An independent review found problems in its installer, so v0.17 only recommends and checks, and shows manual steps. The installer is off by default and experimental. `privacy` lists every file it keeps and how to delete it.

## Install

```text
/plugin marketplace add batrdnn/tool-scout
/plugin install tool-scout@tool-scout
```

It needs Claude Code running locally, Node.js 20 or newer, and about 20 sessions of history. macOS, Linux and Windows are tested.

## Early beta, honestly

This is an early beta. The ranking is tuned on a small set of made-up users, so expect picks that miss, and please tell me when they do.

The most useful thing you can do is rate the picks, and then share one short block of text: `stats --share` shows exactly what would be shared, before you copy anything. Problems and ideas go to GitHub issues. Security reports go to the private channel in SECURITY.md.

Source and docs: https://github.com/batrdnn/tool-scout

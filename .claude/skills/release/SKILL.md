---
name: release
description: Cut a Tool Scout release. Bumps the version, writes the CHANGELOG entry and the docs/reports file, commits, checks CI on a release branch, makes the tag only when CI is green, and asks before pushing. Use when the user runs /release, optionally with a version (e.g. /release 0.10.1), or asks to cut, tag or ship a release of this repo.
---

# /release

Cuts a release of Tool Scout from `main`. Never push without the user's explicit yes (steps 9 and 11), and never tag, or ask about pushing main, until CI is green on the release branch (step 9).

## 1. Preflight (stop and report if any check fails)

- `git status` is clean, the branch is `main`, and `git fetch origin` shows main isn't behind.
- Last tag: `git describe --tags --abbrev=0`. Commits since then: `git log <last tag>..HEAD --oneline`.
  If there are none, say there's nothing to release and stop.
- `npm test` passes and `claude plugin validate .` passes.
- Ranking freeze (see CLAUDE.md): `git diff <last tag> HEAD -- scripts/lib/{rank,taxonomy,profile,stack,pipeline,momentum,crawl}.mjs test/eval`
  prints nothing, and `npm run eval` still gives mean p@3 0.67 and p@5 0.67. If the freeze is broken, stop and tell the user. Don't release anyway.

## 1b. Regenerate the starter catalog

Run `npm run starter` (needs the network; a GitHub token makes it much faster). It writes
`data/starter-catalog.json` from a fresh crawl, keeping only repos with no high scan flag, and it never
reads `test/eval`. Check `git diff --stat data/starter-catalog.json`, and that it kept at least 40 repos.
It is part of the release commit. If the crawl or the scan fails, say so and ask before releasing
with the old starter.

## 2. Version

Use the version from the arguments. If there is none, propose one from the commits (patch for
fixes and docs, minor for new features) and confirm it with AskUserQuestion. Tags look like
`v0.10.1`, and the version in files is `0.10.1`.

## 3. Bump

Change the version string, and nothing else, in:
- `package.json` (`"version"`)
- `.claude-plugin/plugin.json` (`"version"`)
- `TESTING.md`: the `tool-scout X ratings (date)` line in the share example (version and today's date)

Then search for any other copy of the old version outside `docs/reports`, `CHANGELOG.md` and
`test/`, e.g. `git grep -n '<old version>'`, and update it.

## 4. CHANGELOG.md

Add `## vX.Y.Z (YYYY-MM-DD)` just below the intro paragraph, above the previous entry. Write
3 to 6 bullets in plain words, describing what changed for the user rather than the code, and
wrap them at about 100 columns. Match the tone of the existing entries.

## 5. docs/reports/vX.Y.Z.md

Follow the shape of the latest report (`ls docs/reports`, then read the newest one):
- `# Tool Scout vX.Y.Z: <short theme>`
- One line on ranking: "Ranking is still frozen: no ranking file changed." It should also say
  whether each item's tests were written first.
- An `| item | commit | change |` table with one row per commit since the last tag (short hash in
  backticks).
- Optional sections for anything notable, such as "Found by the tests".
- `## Tests and validation`: the real numbers from step 1, i.e. the `npm test` count (and how many
  are new since the last tag), the plugin validate result, the freeze diff and the eval p@3/p@5.
  Never write a number you didn't see.

## 6. Check again

Run `npm test` again, because some tests read the README, CHANGELOG and TESTING. Fix anything it
catches before going on.

## 7. Commit (local only)

- Stage only the files changed above, then `git commit -m "Release X.Y.Z: <theme>"`, ending the
  message with the session's attribution trailer. Do not tag yet: the tag comes after CI (step 10).

## 8. Review the report with the report-reviewer subagent

Before the CI step, run the Agent tool with `subagent_type: "report-reviewer"`. Pass it:
- the report path, `docs/reports/vX.Y.Z.md`;
- this stage's criteria as a list: the items the user gave for this stage (the numbered list in
  their request), word for word. If you don't have them, ask the user for them; don't make any up.

Show its output to the user. If it lists anything under Missing or Wrong, fix the report (or
whatever it found), run `npm test` again, then `git commit --amend --no-edit` with the fixed files.
Then run the reviewer again. Only go on to step 9 when it lists nothing missing or wrong, or after
the user has seen the remaining findings and said to go on. Never push before asking, whatever the
review says.

## 9. CI on a release branch (before any tag)

Tests that pass on this machine have failed on Windows before, so the release candidate runs on every
CI job first, from a branch that is not `main`:

1. Ask with AskUserQuestion: "Push the release candidate to branch release/vX.Y.Z so CI can run?"
   ("Yes, push the branch" and "No, keep it local"). On "No", stop: nothing is tagged.
2. `git push origin HEAD:refs/heads/release/vX.Y.Z`, then find its run:
   `gh run list --branch release/vX.Y.Z --limit 1 --json databaseId`, and wait for it:
   `gh run watch <id> --exit-status`.
3. Every job must pass (all three systems and every Node version), shown with
   `gh run view <id> --json jobs`. If any job fails: don't tag, don't push main, and don't ask about pushing
   it. Read `gh run view <id> --log-failed`, fix one cause at a time with a test, and for each
   cause say whether it affects real users (for example real Windows users) or only the tests.
   Commit the fix (a new commit, or amend the release commit, then re-run `npm test` and the reviewer
   if the report changed), push the branch again, and wait again.

## 10. Tag (only after CI is green)

Only after every job has passed on the release branch's last commit:
`git tag -a vX.Y.Z -m "Tool Scout X.Y.Z"`. That commit must be the one that will be pushed to main.

## 11. Ask before pushing

Show `git log -1 --stat`, the tag and the CI result (the run's link and "all N jobs passed"), then ask
with AskUserQuestion: "Push main and tag vX.Y.Z to origin?", with the options "Yes, push" and "No,
keep it local". Only after "Yes, push" run `git push origin main`, then `git push origin vX.Y.Z`, then
delete the release branch: `git push origin --delete release/vX.Y.Z`. On "No", say how to push later,
or how to undo it (`git tag -d vX.Y.Z && git reset --soft HEAD~1`), and that the release branch is
still on origin.

## Report

End with 10 lines or fewer: the version, the commit, the tag, the test count, the eval numbers,
the report review's result (e.g. "review: all 7 criteria met"), the CI result (e.g. "CI: 9 of 9 jobs
passed on release/vX.Y.Z"), and whether it was pushed.

---
description: Summarize the commits since the last tag (or since a given tag) in 10 lines or fewer
argument-hint: "[tag]"
allowed-tools: Bash(git describe:*), Bash(git log:*), Bash(git diff:*), Bash(git tag:*)
---

Summarize what changed since a tag in this repo. Use read-only git only, and don't edit anything.

1. Base: use `$ARGUMENTS` if it names a tag. Otherwise take the newest tag by version from
   `git tag --sort=-v:refname | head -1` (newest by version, not by date). If there are no tags,
   say so and stop.
2. Commits: `git log <base>..HEAD --format='%h %s'`. If there are none, reply
   "No commits since <base>." and stop.
3. Size: `git diff --shortstat <base> HEAD`. Also note whether any of these changed:
   `git diff --stat <base> HEAD -- scripts/lib/{rank,taxonomy,profile,stack,pipeline,momentum,crawl}.mjs test/eval`
   (the ranking freeze).

Reply in 10 lines or fewer, with nothing before or after:

```
<base>..HEAD: N commits, <files/insertions/deletions from shortstat>
- <short hash> <what it did, in plain words, up to ~90 chars>
...
Ranking freeze: intact | broken (<files>)
```

Give one bullet per commit. If there are more than 8 commits, group related ones into a single
bullet (e.g. "3 commits: build sandbox tests") so the total stays at 10 lines. Describe what each
change does for the user, not how the code changed, and keep the project's own terms (scout,
check, build, plan, undo).

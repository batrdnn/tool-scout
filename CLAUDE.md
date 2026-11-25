<!-- tool-scout:begin working-rules -->
## Working rules

**Ranking freeze.** Don't change these files:
- `scripts/lib/{rank,taxonomy,profile,stack,pipeline,momentum,crawl}.mjs`
- the eval catalog, labels and personas (`test/eval/`, including `test/eval/holdout/`)
- steps 2–4 of `skills/scout/SKILL.md` (a hash test pins them; the rest of the file may change)
- the e2e judge prompt (it must stay byte-identical)

Before each release, check that `git diff <last tag> HEAD` on these paths prints nothing and that `npm run eval` still gives mean p@3 0.67 and p@5 0.67.

**Tests first, commit per item.** For each item, write its tests and run them so they fail, then implement until they pass. Make one commit per item.

**Report in 10 lines max.** Keep the end-of-round report in chat to 10 lines or fewer.

**Use Sonnet for routine rounds.** For routine work (small fixes, doc updates, test runs, mechanical changes), use Sonnet. That includes subagents. Save Opus for design work and for anything that touches ranking.

**Never bypass the freeze hook.** If it blocks something harmless, report it as a hook bug.

**Stage files by name.** Never use `git add -A` or `git add .`; stage files by name.
<!-- tool-scout:end working-rules -->

<!-- tool-scout:begin tool-scout-conventions -->
## Tool Scout v1.0 conventions

Stack: Node.js 18+, plain ES modules (.mjs), tests with node:test. Domain: security-sensitive install and build code, being prepared for a public v1.0 launch.

- Never add runtime dependencies.
- Tests first, one commit per item; chain commands with && so nothing runs after a failure.
- The ranking freeze stays until the tester round ends.
- Ask before every push.
<!-- tool-scout:end tool-scout-conventions -->

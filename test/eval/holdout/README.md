# Holdout set (frozen 2026-11-23, before any v0.3 rule change)

**For reporting only. Never tune matching or ranking rules against these labels.**
`test/eval.test.mjs` checks the SHA-256 of both files so an edit can't go unnoticed.

| file | what |
|---|---|
| `catalog.json` | 55 repos from the live crawl of 2026-11-23, none in the main eval set |
| `labels.json` | relevant (1) / irrelevant (0) per persona, with a one-line reason |
| `persona-descriptions.json` | the only persona information the labeler saw |

**How the repos were picked** (selection script run once, not kept as a tool):
v0.2's live top 14 per persona that weren't already labeled (where the false positives are),
2 repos per persona theme by plain substring match (backtest, swiftui, xcode, next.js, prisma,
postgres, playwright, kubernetes, terraform, github actions, vercel, secrets), and 12 random
repos (fixed seed). The order was then shuffled.

**How they were labeled:** by a separate subagent that saw only `persona-descriptions.json`
and each repo's name, description, topics and language. It never saw `taxonomy.mjs`,
`rank.mjs`, the main labels or any ranker output. Rule given: 1 = the persona would plausibly
install it into Claude Code for that work; 0 = off-topic, a standalone app rather than an agent
extension, a different platform, or a different sense of a keyword.

Positives: quant-ios 2, webdev 7, platform 2. With so few positives, p@25 has a low
ceiling (at most positives ÷ returned), so compare versions, not absolute values.

Hashes: labels `098a2bdd049851bfcef2ff32d17bca3430c90fef6cbd12293d5a668b93fc4a95`, catalog `0e1b383ae7a6c615855379ec61b42580250c8b324d8eac7f315c94d053d49e26`.

Run: `npm run eval -- --set holdout [--verbose]`

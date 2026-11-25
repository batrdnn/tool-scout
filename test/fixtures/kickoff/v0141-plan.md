# Tool Scout: road to v1.0 and v1.1

Goal: launch Tool Scout v1.0 publicly within 2–3 weeks, then ship v1.1.

## Tasks
- CI: GitHub Actions on ubuntu, macos and windows × Node 18, 20 and 22, running
  npm test and claude plugin validate on every push and pull request.
- Windows support: fix paths, CRLF, HOME vs USERPROFILE, opening the card, and hook
  quoting, using the CI logs.
- Polish: an icon for the plugin, a short demo GIF of /tool-scout:scout in a terminal
  for the README, a FAQ section, and a launch post explaining what Tool Scout does
  and how privacy works.
- Tester round: recruit 5–10 Claude Code users with mixed profiles, collect their
  `stats --share` results and bug reports as GitHub issues, and triage them weekly
  for 2 weeks.
- v1.0: fix what testers find, then submit to Anthropic's community marketplace.
- v1.1: animal evolution (Egg → hatchling → adult → legendary) with new pixel-art
  sprites, and a status line companion that shows the user's animal.

## Stack
- Node.js 18+, plain ES modules, zero runtime dependencies
- node:test (about 690 tests), GitHub for hosting, issues and releases

## Conventions
- Never add runtime dependencies.
- Tests first, one commit per item; chain commands with && so nothing runs after a failure.
- The ranking freeze stays until the tester round ends.
- Ask before every push.
- Prefer Sonnet for routine rounds, Opus for security and design.

# Tool Scout v1.0 launch prep

Goal: ship Tool Scout v1.0 publicly within 3 weeks, based on tester feedback.

## Tasks
- Collect tester feedback: track bug reports and feature requests as GitHub issues,
  and triage them weekly.
- Set up CI: run `npm test` and `claude plugin validate .` on every push and pull
  request with GitHub Actions, on macOS, Linux and Windows.
- Fix Windows support: the Unicode detection and paths are untested there.
- Security review of the install and build code before launch (plans, undo,
  hooks, MCP server pinning).
- Polish the README: a short demo GIF of /tool-scout:scout, clearer install steps,
  and a FAQ.
- Write a launch post explaining what Tool Scout does and how privacy works.
- Submit the plugin to Anthropic's community marketplace.
- Add an icon (the validator still warns ICON_MISSING).

## Stack
- Node.js 18+, plain ES modules (.mjs), zero runtime dependencies
- Tests with node:test (about 500 tests), GitHub for hosting and releases

## Conventions
- Never add runtime dependencies.
- Always write tests first, one commit per item.
- Never change the ranking files without an explicit unfreeze.
- Keep reports to 10 lines max.
- Prefer Sonnet for routine work.

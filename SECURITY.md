# Security

## Report a vulnerability

Report it privately with GitHub private vulnerability reporting:
https://github.com/batrdnn/tool-scout/security/advisories/new
(the "Report a vulnerability" button on the repo's Security tab).

Don't open a public issue for a vulnerability.

Please include:

- the repo or input that triggers it
- the command you ran
- what happened, and what should have happened
- the Tool Scout version (`version` in `package.json`)

## Fixes

Security fixes are announced in [CHANGELOG.md](CHANGELOG.md). Their entries start with
"Security release:". To update:

```bash
claude plugin update tool-scout@tool-scout
```

## Safe mode (v0.17) and the experimental installer

An independent review of v0.16.1 reproduced failures in the
installer (full independent review: coming soon; [docs/security-review.md](docs/security-review.md) is the published one), so since v0.17 Tool Scout only recommends and checks. Installing, building and turning on
hooks are off by default; the installer is still in the code, behind a setting you turn on yourself
(`scout.mjs experimental on`), which warns on every run. Reports about the experimental installer are
welcome, but these four are **known, fixed in v0.18**, so they are not new:

- **C1:** confirming a plan is not a human decision. The plan ID proves the plan wasn't changed, not
  that a person agreed, so an agent that makes a plan can confirm it.
- **C2:** an existing marketplace name registered from another source makes the install skip the
  `marketplace add` and its commit check, so a different plugin than the reviewed one can be installed.
- **C5:** a `.claude` folder that is a symlink redirects a project-scoped build outside the project.
- **C6:** undo can report success when the inverse command failed and the change is still there.

The content scan is a heuristic (it can be bypassed with differently worded text, and it reads a README
and up to eight files, not an MCP server's full source), so "no flags" is not "safe". What Tool Scout
keeps and what goes into Claude's context: `scout.mjs privacy`.

## Known issues

[docs/security-review.md](docs/security-review.md) has the threat model and the known issues.
The mediums and lows documented there are known, so they are not new reports.

## Supported versions

The latest release only.

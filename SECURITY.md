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

## Known issues

[docs/security-review.md](docs/security-review.md) has the threat model and the known issues.
The mediums and lows documented there are known, so they are not new reports.

## Supported versions

The latest release only.

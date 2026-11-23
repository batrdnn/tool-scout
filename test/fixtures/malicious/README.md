# Must-catch fixtures (fake, harmless)

Each folder is a fake repo that the trust scan must flag at medium or high severity.
They are written to look like real attacks but point only at reserved example domains
(`*.example.net`, `*.example.org`). Nothing here is meant to run. `test/scan.test.mjs`
serves each folder as a mock GitHub repo and scans it end to end.

| folder | attack |
|---|---|
| `prompt-injection` | SKILL.md tells the agent to override its instructions and hide it from the user |
| `invisible-unicode` | instructions hidden in Unicode tag characters, plus a zero-width bit string |
| `pipe-to-shell` | installer pipes a download from an unknown host into `sh` |
| `exfiltration` | setup script posts `process.env` and `~/.ssh` keys to a URL |
| `obfuscated-base64` | install script decodes a short base64 payload and runs it |

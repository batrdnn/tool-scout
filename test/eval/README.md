# Evaluation harness

Offline, reproducible check of how precise the **script shortlist** is (before Claude's
judgment step). No network access.

```bash
npm run eval                 # p@5, p@25, recall@25 per persona
npm run eval -- --verbose    # plus each shortlist with ✔/✘ labels and missed positives
npm run eval -- --live ~/.tool-scout   # also eyeball the live catalog (unscored)
```

| file | what |
|---|---|
| `personas.json` | 3 synthetic personas, 16 sessions each (prompts, bash commands, edited files) |
| `personas.mjs`  | turns a persona into a fake `~/.claude` home that `buildProfile` reads |
| `catalog.json`  | 55 repos frozen from a live crawl (2026-11-23) so results don't drift |
| `labels.json`   | relevant (1) / irrelevant (0) per persona, with a one-line reason |

Personas: **quant-ios** (Python backtesting + SwiftUI app), **webdev** (Next.js/Tailwind,
Prisma/Postgres, Playwright, Vercel, GitHub PRs), **platform** (Go, Kubernetes, Terraform/AWS,
GitHub Actions, security).

Metrics: `precision@k = relevant / min(k, returned)`, empty shortlist = 0. `recall@25` is
reported alongside so precision can't be bought by returning nothing.

The labeled set was built from the v0.1 shortlists on the live catalog (which is where
the false positives are) plus genuinely relevant repos found by searching the catalog per
persona theme. It's small; treat a change of one item (0.04 at p@25, 0.2 at p@5) as noise,
and check `--live` output before trusting a gain.

## Results

| persona | v0.1 p@5 | v0.1 p@25 | v0.1 recall@25 | v0.2 p@5 | v0.2 p@25 | v0.2 recall@25 |
|---|---|---|---|---|---|---|
| quant-ios | 0.40 | 0.36 | 0.82 | 0.80 | 0.52 | 1.00 |
| webdev    | 0.20 | 0.32 | 0.80 | 0.80 | 0.50 | 1.00 |
| platform  | 0.20 | 0.20 | 0.63 | 0.80 | 0.50 | 1.00 |
| **mean**  | **0.27** | **0.29** | **0.75** | **0.80** | **0.51** | **1.00** |

p@25 is capped by the fixture: once false positives are filtered, the shortlist is shorter
than 25 (15–21 items), and every persona's remaining errors are on-topic but debatable
(a Windows test sandbox, an options-trading terminal, a stealth Playwright fork).

What changed in v0.2 (all general rules in `scripts/lib/taxonomy.mjs`, none name a repo):
positional evidence (name + first clause ≫ later mentions; tags need corroboration),
weak vs. specific keywords, sense rules (in-game/A-B testing, crypto in CTF context, SQL
injection, ReAct), comma-list detection inside the head, developer context for iOS/Android,
a separate `offensive-security` topic, tool affinity (pytest user ≠ Playwright pick), and a
soft diversity penalty instead of a hard per-topic cap.

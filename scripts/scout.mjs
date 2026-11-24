#!/usr/bin/env node
// tool-scout entry point. Checks the Node version first, in syntax old Node versions can
// parse, then loads the CLI (scripts/lib/cli.mjs, which lists every command).
import { nodeProblem } from './lib/node-check.mjs';

var problem = nodeProblem(process.versions.node);
if (problem) {
  console.error(problem);
  process.exit(1);
} else {
  import('./lib/cli.mjs');
}

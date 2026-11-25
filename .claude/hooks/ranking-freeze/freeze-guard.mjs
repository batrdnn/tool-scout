#!/usr/bin/env node
// PreToolUse hook: block edits to the frozen ranking files unless SCOUT_UNFREEZE=1.
// Reads the tool call as JSON on stdin. Exit 2 blocks the call and shows stderr to Claude.
// No network, no writes. Allows the call if anything here goes wrong.
import { relative, resolve, isAbsolute } from 'node:path';

if (process.env.SCOUT_UNFREEZE === '1') process.exit(0);

const FROZEN = [
  /^scripts\/lib\/(rank|taxonomy|profile|stack|pipeline|momentum|crawl)\.mjs$/,
  /^test\/eval\/(catalog|labels|personas)\.json$/,
  /^test\/eval\/personas\.mjs$/,
  /^test\/eval\/e2e\.mjs$/, // holds the e2e judge prompt
  /^test\/eval\/holdout\//,
];
// The same paths as plain text, for spotting them inside shell commands.
const FROZEN_TEXT = /scripts\/lib\/(rank|taxonomy|profile|stack|pipeline|momentum|crawl)\.mjs|test\/eval\/(catalog\.json|labels\.json|personas\.(json|mjs)|e2e\.mjs|holdout)/;
// Redirects that write no file: to /dev/null, or one stream into another (2>&1).
const HARMLESS_REDIRECT = /(\d*|&)>{1,2}\s*(\/dev\/null\b|&\d+|&-)/g;
// Shell commands that write, move or delete files.
const WRITES = /(^|[\s;&|])(sed\s+-i|perl\s+-[a-z]*i|tee|mv|cp|rm|truncate|git\s+(checkout|restore|apply|mv|rm))\b|>{1,2}/;

function block(what) {
  process.stderr.write(
    `Blocked by the ranking freeze: ${what} is frozen (see CLAUDE.md, "Working rules"). ` +
    `Don't work around this. If the user really means to change ranking, they restart Claude Code with SCOUT_UNFREEZE=1 set.\n`
  );
  process.exit(2);
}

let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let call;
  try { call = JSON.parse(input); } catch { process.exit(0); }
  const root = process.env.CLAUDE_PROJECT_DIR || call.cwd || process.cwd();
  const tool = call.tool_name;
  const args = call.tool_input || {};

  if (tool === 'Bash') {
    const cmd = String(args.command || '').replace(HARMLESS_REDIRECT, ' ');
    if (FROZEN_TEXT.test(cmd) && WRITES.test(cmd)) block('a file this command writes');
    process.exit(0);
  }

  const target = args.file_path || args.notebook_path;
  if (!target) process.exit(0);
  const abs = isAbsolute(target) ? target : resolve(call.cwd || root, target);
  const rel = relative(root, abs).split('\\').join('/');
  if (FROZEN.some((re) => re.test(rel))) block(rel);
  process.exit(0);
});

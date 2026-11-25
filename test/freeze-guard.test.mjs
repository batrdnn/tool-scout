// The ranking-freeze hook is a personal hook (script in ~/.claude/hooks/ranking-freeze/, entry in
// .claude/settings.local.json), so it is not in the repo. These tests run it where it is installed,
// or at $FREEZE_GUARD, and skip when there is no such file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GUARD = process.env.FREEZE_GUARD || path.join(os.homedir(), '.claude', 'hooks', 'ranking-freeze', 'freeze-guard.mjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opts = { skip: fs.existsSync(GUARD) ? false : `no freeze hook at ${GUARD}` };

function run(tool_name, tool_input) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT };
  delete env.SCOUT_UNFREEZE;
  const r = spawnSync('node', [GUARD], { input: JSON.stringify({ tool_name, tool_input, cwd: ROOT }), env, encoding: 'utf8' });
  return r.status;
}
const bash = (command) => run('Bash', { command });

test('edits to frozen files are blocked, other edits pass', opts, () => {
  assert.equal(run('Edit', { file_path: path.join(ROOT, 'scripts/lib/rank.mjs') }), 2);
  assert.equal(run('Write', { file_path: 'test/eval/holdout/x.json' }), 2);
  assert.equal(run('Edit', { file_path: path.join(ROOT, 'scripts/lib/output.mjs') }), 0);
});

test('Bash writes to frozen files are still blocked', opts, () => {
  for (const c of [
    'echo x > scripts/lib/rank.mjs',
    'echo "a > b" > scripts/lib/rank.mjs',
    'echo x >> test/eval/labels.json',
    'sed -i "" s/a/b/ scripts/lib/stack.mjs',
    "sed -i 's/>/x/' scripts/lib/stack.mjs",
    'rm test/eval/catalog.json',
    'git checkout v0.10.0 -- scripts/lib/pipeline.mjs',
    'cat > scripts/lib/rank.mjs <<EOF\nhello\nEOF',
    'bash -c "echo x > scripts/lib/rank.mjs"',
    'tee scripts/lib/crawl.mjs < /tmp/x',
  ]) assert.equal(bash(c), 2, c);
});

test('Bash: a > inside quotes or => is not a write', opts, () => {
  assert.equal(bash('node -e "a => b"'), 0);
  assert.equal(bash('node -e "const f = x => x" scripts/lib/rank.mjs'), 0);
  assert.equal(bash("node -e 'x => x' scripts/lib/rank.mjs"), 0);
  assert.equal(bash('node -e x=>x scripts/lib/rank.mjs'), 0);
  assert.equal(bash('grep "a > b" scripts/lib/rank.mjs'), 0);
  assert.equal(bash('cat scripts/lib/rank.mjs 2>&1 | head'), 0);
  assert.equal(bash('cat scripts/lib/rank.mjs > /dev/null'), 0);
});

test('Bash: a heredoc that names a frozen path but writes elsewhere passes', opts, () => {
  assert.equal(bash('cat > /tmp/notes.md <<EOF\nDo not touch scripts/lib/rank.mjs\nEOF'), 0);
  assert.equal(bash("cat > /tmp/notes.md <<'EOF'\nsed -i x scripts/lib/rank.mjs\nEOF"), 0);
  assert.equal(bash('git commit -F - <<-EOT\n\tfreeze: test/eval/labels.json => untouched\n\tEOT'), 0);
});

// v0.11.3 item 3: a chained command is judged one piece at a time (split on && || ; | and newlines,
// outside quotes). A piece that writes a non-frozen file but only names a frozen path passes.
test('Bash: chained commands that write a non-frozen file but merely name a frozen path pass', opts, () => {
  for (const c of [
    'echo x > /tmp/out.txt && cat scripts/lib/rank.mjs',
    'cat scripts/lib/rank.mjs > /tmp/copy.txt',
    'git diff v0.11.2 HEAD -- scripts/lib/rank.mjs > /tmp/rank.diff',
    'git diff v0.11.2 HEAD -- scripts/lib/rank.mjs test/eval/ > /tmp/d; echo done',
    'npm run eval > /tmp/eval.txt; git diff v0.11.2 HEAD --stat -- scripts/lib/rank.mjs',
    'sed -i "" s/a/b/ notes.md && cat scripts/lib/stack.mjs',
    'cat scripts/lib/rank.mjs | tee /tmp/copy.txt',
    'git diff v0.11.2 HEAD -- test/eval/labels.json > /tmp/l.diff && echo "checked scripts/lib/crawl.mjs" >> /tmp/log.txt',
    'echo x > /tmp/a\ngrep -n foo scripts/lib/momentum.mjs',
  ]) assert.equal(bash(c), 0, c);
});

test('Bash: a write to a frozen path stays blocked wherever it sits in a chain', opts, () => {
  for (const c of [
    'echo ok && echo x > scripts/lib/rank.mjs',
    'echo x > /tmp/a; echo y >> test/eval/labels.json',
    'cat notes.md; sed -i s/a/b/ scripts/lib/stack.mjs',
    'echo x > /tmp/a && rm test/eval/catalog.json',
    'true && git checkout v0.10.0 -- scripts/lib/pipeline.mjs',
    'echo x >| scripts/lib/rank.mjs',
    'cat a | tee scripts/lib/crawl.mjs',
    'echo x > /tmp/a && bash -c "echo x > scripts/lib/rank.mjs"',
    'echo "a;b" > scripts/lib/rank.mjs',
    'cat scripts/lib/rank.mjs > scripts/lib/stack.mjs',
    'echo hi || cp /tmp/x scripts/lib/taxonomy.mjs',
    'echo x > /tmp/a\necho y > scripts/lib/profile.mjs',
  ]) assert.equal(bash(c), 2, c);
});

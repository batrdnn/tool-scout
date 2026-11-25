// The ranking-freeze hook is a personal hook (script in ~/.claude/hooks/ranking-freeze/, entry in
// .claude/settings.local.json), so it is not in the repo. These tests run it where it is installed,
// or at $FREEZE_GUARD, and skip when there is no such file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const GUARD = process.env.FREEZE_GUARD || path.join(os.homedir(), '.claude', 'hooks', 'ranking-freeze', 'freeze-guard.mjs');
const ROOT = path.resolve(import.meta.dirname, '..');
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

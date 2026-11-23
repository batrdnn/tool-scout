import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandHeads } from '../scripts/lib/profile.mjs';

test('a multi-line node -e / python -c body is one command, not many', () => {
  assert.deepEqual(commandHeads(`node -e '\nconst fs = require("fs");\nfor (const f of fs.readdirSync(".")) console.log(f);\n' && ls`), ['node', 'ls']);
  assert.deepEqual(commandHeads('python3 -c "\nimport json\nprint(json.dumps({}))\n"'), ['python3']);
  assert.deepEqual(commandHeads(`node --input-type=module -e '\nimport x from "y";\nawait x();'`), ['node']);
});

test('heredoc bodies are not commands', () => {
  assert.deepEqual(commandHeads("cat > a.mjs <<'EOF'\nconst a = 1;\ngrep x | head\nEOF\nnode a.mjs"), ['cat', 'node']);
  assert.deepEqual(commandHeads('python3 - <<EOF\nimport os\nfor x in os.listdir():\n  print(x)\nEOF'), ['python3']);
  assert.deepEqual(commandHeads('cat <<-END\n\tsed -i x\n\tEND\ngit status'), ['cat', 'git status']);
});

test('pipes and separators inside quotes or $(…) do not split', () => {
  assert.deepEqual(commandHeads('grep -E "a|b;c" file | head -3'), ['grep', 'head']);
  assert.deepEqual(commandHeads('X=$(git rev-parse HEAD | cut -c1-7) && echo "$X"'), ['echo']);
  assert.deepEqual(commandHeads("awk '{print $1}' f && sed 's/a;b/c/' g"), ['awk', 'sed']);
});

test('shell keywords are not commands; the command after them is', () => {
  assert.deepEqual(commandHeads('for f in *.md; do wc -l "$f"; done'), ['wc']);
  assert.deepEqual(commandHeads('if [ -f x ]; then npm test; else echo "no"; fi'), ['npm test', 'echo']);
  assert.deepEqual(commandHeads('while read l; do echo "$l"; done < f'), ['read', 'echo']);
});

test('still: args and env stripped, subcommands kept', () => {
  assert.deepEqual(commandHeads('FOO=1 git rebase -i HEAD~3 && npm test | tee x'), ['git rebase', 'npm test', 'tee']);
  assert.deepEqual(commandHeads('/usr/bin/python3 script.py'), ['python3']);
  assert.deepEqual(commandHeads('cd /tmp\npytest -q'), ['cd', 'pytest']);
});

// Turns the compact persona specs in personas.json into fake ~/.claude homes
// (one .jsonl transcript per session) so buildProfile can read them like real history.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PERSONAS = JSON.parse(fs.readFileSync(path.join(here, 'personas.json'), 'utf8'));
delete PERSONAS._comment;

const line = (o) => JSON.stringify(o);

/** Materialize one persona; returns the fake home directory. */
export function materialize(name, base = os.tmpdir()) {
  const p = PERSONAS[name];
  if (!p) throw new Error(`unknown persona ${name}`);
  const home = fs.mkdtempSync(path.join(base, `scout-eval-${name}-`));
  const proj = path.join(home, '.claude', 'projects', `-home-${name}`);
  fs.mkdirSync(proj, { recursive: true });
  // The persona's project folder, with its dependency files; sessions record it as their cwd.
  const cwd = path.join(home, 'work', name);
  fs.mkdirSync(cwd, { recursive: true });
  for (const [f, body] of Object.entries(p.manifests || {})) fs.writeFileSync(path.join(cwd, f), body);
  const user = (text) => line({ type: 'user', cwd, message: { role: 'user', content: text } });
  const tool = (n, input) => line({ type: 'assistant', cwd, message: { role: 'assistant', content: [{ type: 'tool_use', name: n, input }] } });
  p.sessions.forEach((s, i) => {
    const lines = [
      ...s.prompts.map(user),
      ...s.bash.map((command) => tool('Bash', { command })),
      ...s.files.map((f) => tool('Edit', { file_path: `/work/${f}` })),
    ];
    fs.writeFileSync(path.join(proj, `s${String(i).padStart(2, '0')}.jsonl`), lines.join('\n'));
  });
  for (const sk of p.installed?.skills || []) fs.mkdirSync(path.join(home, '.claude', 'skills', sk), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: p.installed?.mcpServers || {} }));
  return home;
}

// Example cards for the README: one synthetic profile per animal (plus the Egg), rendered with
// the current card renderer into docs/assets/animals/<animal>.svg.
//   npm run gallery            regenerate the files
// test/gallery.test.mjs fails when a file is missing or differs from what the renderer makes now.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { whoAmI, meCard } from '../scripts/lib/me.mjs';

export const GALLERY_DIR = fileURLToPath(new URL('../docs/assets/animals/', import.meta.url));

const base = (o) => ({
  generatedAt: '2026-11-24T00:00:00.000Z', windowDays: 30, prompts: 0, topicSources: { actions: {}, mentions: {} },
  friction: {}, repeatedCommands: [], installed: { names: [], repos: [] }, stack: {}, ...o,
});
const cmd = (command, count, sessions) => ({ command, count, sessions });

/** Synthetic profiles, one per card. Each must map to its animal on its own (no forcing). */
export const GALLERY = {
  Beaver: base({ sessions: 24, projects: 3, prompts: 90, languages: { TypeScript: 300, JavaScript: 40 }, topics: { frontend: 18, testing: 6, design: 4 },
    tools: { Edit: 300, Write: 60, Read: 250, Bash: 110 } }),
  Owl: base({ sessions: 30, projects: 2, prompts: 160, languages: { Python: 120 }, topics: { debugging: 14, backend: 12, database: 5 },
    friction: { backend: 7, database: 3 }, tools: { Read: 500, Bash: 300, Edit: 120, Grep: 200 } }),
  Bee: base({ sessions: 20, projects: 2, prompts: 70, languages: { Python: 90 }, topics: { testing: 17, data: 6 },
    topicSources: { actions: { testing: 17 }, mentions: {} }, repeatedCommands: [cmd('pytest', 64, 15), cmd('git commit', 20, 9)],
    tools: { Read: 260, Bash: 250, Edit: 90 } }),
  Octopus: base({ sessions: 28, projects: 6, prompts: 110, languages: { TypeScript: 80 }, topics: { productivity: 12, browser: 8, git: 7 },
    tools: { Read: 220, Bash: 180, Edit: 80, 'mcp:a': 60, 'mcp:b': 40, 'mcp:c': 30, 'mcp:d': 25, 'mcp:e': 10 } }),
  Ant: base({ sessions: 25, projects: 2, prompts: 80, languages: { Go: 60 }, topics: { devops: 15, git: 9 },
    repeatedCommands: [cmd('make build', 90, 20), cmd('go test', 40, 8), cmd('docker compose', 40, 12), cmd('kubectl apply', 30, 10),
      cmd('git push', 30, 15), cmd('terraform plan', 20, 6), cmd('npm run', 12, 4)],
    tools: { Bash: 600, Read: 200, Edit: 60 } }),
  Fox: base({ sessions: 26, projects: 5, prompts: 100, languages: { Rust: 50, Python: 40, Swift: 30, Go: 20 },
    topics: { ml: 6, ios: 5, data: 5, backend: 4, devops: 3, docs: 3, media: 3, planning: 2, git: 2 },
    tools: { Read: 300, Bash: 200, Edit: 140 } }),
  Turtle: base({ sessions: 14, projects: 1, prompts: 140, languages: { 'C++': 260 }, topics: { refactoring: 10, debugging: 4 },
    tools: { Read: 900, Grep: 400, Bash: 300, Edit: 260 } }),
  Egg: base({ sessions: 6, projects: 1, prompts: 20, languages: { JavaScript: 30 }, topics: { testing: 5, frontend: 3 },
    repeatedCommands: [cmd('npm test', 14, 4)], tools: { Read: 60, Bash: 40, Edit: 25 } }),
};

export const galleryFile = (animal) => path.join(GALLERY_DIR, `${animal.toLowerCase()}.svg`);
export const galleryCard = (animal) => meCard(whoAmI(GALLERY[animal]), GALLERY[animal]);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(GALLERY_DIR, { recursive: true });
  for (const a of Object.keys(GALLERY)) {
    const r = whoAmI(GALLERY[a]);
    if (r.animal !== a) throw new Error(`${a} profile maps to ${r.animal}: ${JSON.stringify(r.scores)}`);
    fs.writeFileSync(galleryFile(a), galleryCard(a));
    console.log(`${path.relative(process.cwd(), galleryFile(a))}  ${r.animal}${r.hatching ? ` (hatching into ${r.hatching})` : ''}  ${JSON.stringify(r.scores)}`);
  }
}

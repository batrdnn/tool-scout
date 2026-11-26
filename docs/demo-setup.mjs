// Sets up the README demo (docs/demo.tape): a clean, synthetic home and data folder, so the
// recording shows no real history. The home is the eval's "webdev" persona (made-up sessions); the
// data folder holds a copy of the eval's frozen catalog dated now, so `all` doesn't crawl.
// It writes only under its base folder (default: a new temp folder) and prints the two exports.
//   eval "$(node docs/demo-setup.mjs)" && node scripts/scout.mjs all --offline
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materialize } from '../test/eval/personas.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PERSONA = 'webdev';

const base = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'tool-scout-demo-'));
fs.mkdirSync(base, { recursive: true });
const home = materialize(PERSONA, base);
const data = path.join(base, 'data');
fs.mkdirSync(data, { recursive: true });
const catalog = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'test', 'eval', 'catalog.json'), 'utf8'));
fs.writeFileSync(path.join(data, 'catalog.json'), JSON.stringify({ ...catalog, updatedAt: new Date().toISOString() }));
console.log(`export HOME='${home}' USERPROFILE='${home}'\nexport SCOUT_DATA='${data}'`);

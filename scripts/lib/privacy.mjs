// `privacy`: every file Tool Scout keeps, what is in it, and how to delete it (review D4); and the
// pruning of expired plans (review D5). It prints names, sizes and dates, never the contents: its
// output goes into Claude's context like any other command's.
import fs from 'node:fs';
import path from 'node:path';
import { PLAN_TTL_MIN } from './installer.mjs';

export const PRIVACY_LINE = "Tool Scout doesn't upload your history. When you run a skill, a summary goes into Claude's context like anything else you show Claude.";

// sensitivity: public = public GitHub data; low = your choices; personal = how you work; high = your own text or paths.
export const KEPT = [
  { path: 'profile.json', sensitivity: 'personal', created: 'scout, me, profile',
    contains: 'What your Claude Code history showed, from your last 30 days: counts per topic and language, the first word of commands you repeat (for example "pytest", "git"), the names of the tools, plugins and libraries your projects use, and session and project counts. No prompt text, no file contents.',
    loses: 'It is rebuilt the next time you run scout, me or profile.' },
  { path: 'last-recommendations.json', sensitivity: 'personal', created: 'scout',
    contains: 'The last picks, with the profile summary they were based on (topics, installed tool names, repeated command names) and why each was picked.',
    loses: 'Nothing: it is rebuilt by the next scout run.' },
  { path: 'settings.json', sensitivity: 'low', created: 'exclude-project, experimental',
    contains: 'The project names or paths you left out of your profile, and the experimental-installer setting (off by default).',
    loses: 'Your exclusions come back into the profile, and the installer goes back to off.' },
  { path: 'dismissed.json', sensitivity: 'low', created: 'dismiss',
    contains: 'The repos you said "not interested" in, with the date.',
    loses: 'Those repos can be recommended again.' },
  { path: 'ratings.json', sensitivity: 'low', created: 'rate',
    contains: 'Your useful / not useful ratings of repos (repo names and the date).',
    loses: 'Your stats start from zero.' },
  { path: 'catalog.json', sensitivity: 'public', created: 'crawl, scout',
    contains: 'The public GitHub repos the crawl found (names, descriptions, star counts, topics) and a daily star snapshot. Nothing about you.',
    loses: 'The next scout crawls again (1 to 3 minutes).' },
  { path: 'momentum-cache.json', sensitivity: 'public', created: 'scout',
    contains: 'Public star activity for the repos in your shortlists, kept about 20 hours. It shows which repos were looked up.',
    loses: 'Nothing: it is fetched again.' },
  { path: 'trust-cache.json', sensitivity: 'public', created: 'scout, check',
    contains: 'The content scan of each repo that was checked: flags, effort facts and the first lines of its SKILL.md files (public repo text). It shows which repos were checked.',
    loses: 'Nothing: the repos are scanned again.' },
  { path: 'kickoff/needs.json', sensitivity: 'high', created: 'kickoff',
    contains: 'The project plan you gave /tool-scout:kickoff, in full, its project folder, and the needs list made from it. This is the only copy of your plan text.',
    loses: 'The saved needs list: run kickoff again with the plan.' },
  { path: 'kickoff/plan.md', sensitivity: 'high', created: 'kickoff',
    contains: 'A pasted plan, until kickoff moves it into needs.json (normally deleted at once, so you should not see it).',
    loses: 'Nothing.' },
  { path: 'kickoff/official.json', sensitivity: 'public', created: 'kickoff',
    contains: 'The cached list of plugins in Anthropic\'s official marketplace.',
    loses: 'Nothing: it is fetched again.' },
  { path: 'installs.json', sensitivity: 'high', created: 'the experimental installer',
    contains: 'Only if you turned the experimental installer on: every install or build it did, with the paths it wrote, the settings it changed and what undo needs to put them back.',
    loses: 'The ability to undo those installs with Tool Scout: you would remove them by hand.' },
  { path: 'plans/', sensitivity: 'high', created: 'the experimental installer',
    contains: 'Only with the experimental installer: install and build plans (destinations, commands, settings). They last 15 minutes and are deleted automatically after that.',
    loses: 'Nothing that is still needed: plans expire anyway.' },
  { path: 'drafts/', sensitivity: 'personal', created: 'the experimental installer',
    contains: 'Only with the experimental builder: the draft skills, commands, hook scripts and notes written for you before they were built.',
    loses: 'The drafts.' },
  { path: 'backups/', sensitivity: 'personal', created: 'the experimental installer (--replace)',
    contains: 'Only after a --replace: the previous version of a skill folder, so undo can put it back.',
    loses: 'The ability to undo that --replace.' },
];

const KNOWN = new Set(KEPT.map((k) => k.path.replace(/\/$/, '')));
const rmCmd = (p, dir) => (dir ? `rm -r "${p}"` : `rm "${p}"`);

function sizeOf(p) {
  let files = 0; let bytes = 0; let newest = 0;
  const walk = (f) => {
    let st; try { st = fs.lstatSync(f); } catch { return; }
    if (st.isDirectory()) { for (const e of fs.readdirSync(f)) walk(path.join(f, e)); return; }
    files++; bytes += st.size; newest = Math.max(newest, st.mtimeMs);
  };
  walk(p);
  return { files, bytes, newest };
}

/** Every kept file with its facts, and what is in the folder that this version does not list. */
export function privacyReport(dataDir) {
  const files = KEPT.map((k) => {
    const dir = k.path.endsWith('/');
    const rel = k.path.replace(/\/$/, '');
    const full = path.join(dataDir, rel);
    const exists = fs.existsSync(full);
    const s = exists ? sizeOf(full) : { files: 0, bytes: 0, newest: 0 };
    return { path: k.path, exists, files: s.files, bytes: s.bytes, modified: s.newest ? new Date(s.newest).toISOString().slice(0, 10) : null,
      sensitivity: k.sensitivity, created: k.created, contains: k.contains, loses: k.loses, delete: rmCmd(full, dir) };
  });
  const unlisted = [];
  const walk = (rel) => {
    let es; try { es = fs.readdirSync(path.join(dataDir, rel), { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (KNOWN.has(r)) continue;
      if (e.isDirectory() && [...KNOWN].some((k) => k.startsWith(`${r}/`))) { walk(r); continue; } // kickoff/: look inside
      if (e.isDirectory()) { for (const f of fs.readdirSync(path.join(dataDir, r), { recursive: true, withFileTypes: true })) if (f.isFile()) unlisted.push(`${r}/${path.relative(path.join(dataDir, r), path.join(f.parentPath ?? f.path, f.name)).split(path.sep).join('/')}`); } else unlisted.push(r);
    }
  };
  walk('');
  return { dir: dataDir, files, unlisted: unlisted.sort() };
}

const kb = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function formatPrivacy(r, { dataLine = '' } = {}) {
  const out = ['Tool Scout privacy: what it keeps, and what it shows Claude', '', PRIVACY_LINE, ''];
  if (dataLine) out.push(dataLine);
  out.push(`Everything it keeps is in that one folder, private to your user where the system supports file modes. To delete all of it: rm -r "${r.dir}" (Windows: rmdir /s "${r.dir}"). To keep working, delete single files instead:`, '');
  for (const f of r.files) {
    out.push(`${f.path}  [${f.sensitivity}]  ${f.exists ? `${f.files > 1 || f.path.endsWith('/') ? `${f.files} files, ` : ''}${kb(f.bytes)}, last changed ${f.modified}` : 'not there'}`);
    out.push(`  In it: ${f.contains}`);
    out.push(`  Delete: ${f.delete}${f.exists ? '' : ' (nothing to delete)'}`, `  If you do: ${f.loses}`);
  }
  if (r.unlisted.length) out.push('', `Not in this list (this version does not know them, so Tool Scout did not make them, or an older one did): ${r.unlisted.join(', ')}`);
  out.push('',
    "What goes into Claude's context when you run a skill: scout shows Claude your profile summary (topics, languages, friction, the first word of repeated commands, installed tool names) and the picks; check shows the repo's scan; me shows your animal and its evidence; kickoff shows your needs list, which quotes lines from your plan. Claude's context is sent to the model provider your Claude Code uses; Tool Scout does not control that.",
    '',
    'What goes over the network: only to api.github.com, with your GitHub token if you set one (fixed topic searches; then the names of public repos being checked, their files and star activity, which can show what you are interested in), and, with the experimental installer, to npm or PyPI (a package name). There is no Tool Scout server, account or telemetry.',
    '',
    'Outside the data folder: a card made with me --card is written where you ask (tool-scout-me.svg by default), with your animal, session count, top language and top topic: delete it like any file. The experimental installer writes into your projects and home folder: installs.json lists everything it wrote.');
  return out.join('\n');
}

// ---- expired plans (D5) --------------------------------------------------------------------------

const PLAN_NAME = /^[0-9a-f]{12}\.json$/;
/** Delete plans past their 15 minutes (and plan files too old to tell). Returns the removed IDs. Touches only plans/<12 hex>.json. */
export function pruneExpiredPlans(dataDir, now = Date.now()) {
  const dir = path.join(dataDir, 'plans');
  let names; try { names = fs.readdirSync(dir); } catch { return []; }
  const removed = [];
  for (const n of names.filter((x) => PLAN_NAME.test(x))) {
    const f = path.join(dir, n);
    let created = NaN;
    try { created = Date.parse(JSON.parse(fs.readFileSync(f, 'utf8'))?.createdAt); } catch { /* malformed */ }
    if (Number.isNaN(created)) { try { created = fs.statSync(f).mtimeMs; } catch { continue; } }
    if (now <= created + PLAN_TTL_MIN * 60e3) continue;
    try { fs.unlinkSync(f); removed.push(n.slice(0, -5)); } catch { /* gone, or not ours to remove */ }
  }
  return removed;
}

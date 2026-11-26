// Project kickoff: a project plan becomes a needs list, and the needs a toolkit of at most 5 items.
//
// Privacy: the plan text is read locally and kept in ONE place, the needs file in the data folder
// (kickoff/needs.json). Matching uses only the local catalog and the project's dependency files.
// Nothing derived from the plan goes into a network request, the catalog or its caches, or a log
// line: the only network traffic is the scout's own (a catalog refresh with its fixed topic
// searches, and the content scan of matched repos, by repo name).
//
// Kickoff only proposes. Each item the user chooses is then installed or built through its own
// plan and its own yes/no (install --plan / build --start …), exactly as from the scout.

import fs from 'node:fs';
import path from 'node:path';
import { TOPICS, EVIDENCE, topicsIn, toolKeywordsIn, repoTopicEvidence } from './taxonomy.mjs';
import { librariesIn, LIBRARY_TOPICS } from './stack.mjs';
import { recommend } from './rank.mjs';
import { detectInstalled } from './profile.mjs';
import { scanRecommendations } from './scan.mjs';
import { crawl, loadCatalog } from './crawl.mjs';
import { dismissedSet } from './feedback.mjs';
import { loadLog } from './installer.mjs';
import { OFFICIAL_REPO, OFFICIAL_MARKETPLACE, loadOfficial, pickCandidate, BUILTINS, builtinsForLine } from './kickoff-sources.mjs';

export const MAX_ITEMS = 5;
export const NEEDS_VERSION = 3; // 3: outside needs, built-ins by line, unmatched lines; 2: direct needs, rejects, wrapped bullets, stack headings
const MAX_PLAN_BYTES = 200_000;
const STALE_HOURS = 20;
// Topics that are a project's domain (what it is about) rather than a kind of task.
const DOMAIN_TOPICS = new Set(['finance', 'ios', 'android', 'ml', 'data', 'media', 'office', 'browser', 'design', 'productivity', 'security', 'offensive-security']);
// Everyday software work Claude does well with no extra tool: without a strong match, nothing is needed.
const NATIVE = new Set(['git', 'docs', 'refactoring', 'debugging', 'planning', 'frontend', 'backend', 'testing', 'database', 'data', 'security']);
const CONVENTION_LINE = /^(?:always|never|must|should|don'?t|do not|prefer|avoid|only use|use \S+(?: \S+)? (?:for|instead|only)\b)/i;
const CONVENTION_HEADING = /\b(?:conventions?|rules|guidelines|style|standards)\b/i;
// A match is good enough when the repo says it is about the need (in its name or first clause), or
// is built around one of the project's own libraries.
const GOOD_STRENGTH = EVIDENCE.headWeak; // the taxonomy's own bar for a head mention, even of a weak keyword
const HEAVY_WEIGHT = 0.6; // a heavy setup ranks below a light one of the same impact
const ACTION_WEIGHT = { install: 1, builtin: 0.9, build: 0.9, nothing: 0.4 };
const FORM_OF = { hook: 'hook', subagent: 'subagent', 'slash command': 'command', 'CLAUDE.md note': 'memory', skill: 'skill', 'skill with a script': 'skill' };

const FILLER = new Set('a an the to of for in on at and or with without when is are be it its that this every each always never must should dont do not prefer avoid only use keep write add one two by as from into all any more most per than then so'.split(' '));
const COVERED_SHARE = 0.6; // of a convention's words found in one paragraph of CLAUDE.md
const words = (t) => [...new Set(String(t).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w)).map((w) => w.replace(/(?:ing|ed|es|s)$/, '')))].filter(Boolean);

/** The conventions the project's CLAUDE.md doesn't already say: a convention is covered when most of its words are in one paragraph. */
export function uncoveredConventions(conventions, claudeText) {
  const paras = String(claudeText || '').split(/\n\s*\n/).map((p) => new Set(words(p)));
  return conventions.filter((c) => {
    const w = words(c);
    return !w.length || !paras.some((p) => w.filter((x) => p.has(x)).length / w.length >= COVERED_SHARE);
  });
}

/** Plugins the project's own settings switch on (settings.json, settings.local.json): detectInstalled reads only the user's. */
export function projectPlugins(project) {
  if (!project) return [];
  const names = new Set();
  for (const f of ['settings.json', 'settings.local.json']) {
    let j = null;
    try { j = JSON.parse(fs.readFileSync(path.join(project, '.claude', f), 'utf8')); } catch { continue; }
    for (const [k, on] of Object.entries(j?.enabledPlugins || {})) if (on === true) names.add(k.split('@')[0]);
  }
  return [...names];
}

function claudeMdOf(project) {
  if (!project) return '';
  return ['CLAUDE.md', path.join('.claude', 'CLAUDE.md')].map((f) => { try { return fs.readFileSync(path.join(project, f), 'utf8'); } catch { return ''; } }).join('\n\n');
}

export const needsPath = (dataDir) => path.join(dataDir, 'kickoff', 'needs.json');
const scratchPath = (dataDir) => path.join(dataDir, 'kickoff', 'plan.md');
const clip = (s, n = 70) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';

/** The plan's lines as plain text: bullets, numbers and heading marks removed; a wrapped bullet is one line. */
function segments(text) {
  const out = [];
  let heading = '';
  let open = null; // the last bullet, which an indented line below it continues
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { open = null; continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { heading = h[1]; open = null; continue; }
    const body = line.replace(/^(?:[-*+]|\d+[.)])\s+/, '').replace(/^\[[ xX]\]\s+/, '');
    const bullet = body !== line;
    if (!bullet && open && /^\s/.test(raw)) { open.text = `${open.text.replace(/[.;]$/, '')} ${body}`.replace(/[.;]$/, ''); continue; }
    open = null;
    for (const s of bullet ? [body] : body.split(/(?<=[.!?])\s+/)) if (s.trim()) out.push({ text: s.trim().replace(/[.;]$/, ''), heading, bullet });
    if (bullet) open = out[out.length - 1];
  }
  return out;
}

// Needs Claude meets directly, with no tool: a CI config file, an icon, a post. One line on how.
const DIRECT = [
  { id: 'ci', label: 'CI config', re: /\bCI\b|\bCI\/CD\b|continuous integration|GitHub Actions/i, how: 'Claude writes the workflow file (.github/workflows/*.yml) and runs the same commands locally to check them' },
  { id: 'icon', label: 'icon', re: /\b(?:icons?|logo|favicon)\b/i, how: 'Claude draws it as an SVG, or writes a small script that renders the PNG sizes, and saves it in the repo' },
  { id: 'post', label: 'launch post', re: /\b(?:write|draft)\b[^.]{0,40}\b(?:posts?|blog|announcement|article|newsletter|tweet|thread)\b|\blaunch (?:posts?|announcement)\b/i, how: 'Claude drafts the text in the chat from your README and plan; you edit and publish it' },
  { id: 'faq', label: 'FAQ', re: /\bFAQs?\b/, how: 'Claude drafts the questions and answers from your README and the code; you review them' },
  { id: 'art', label: 'artwork', re: /\b(?:sprites?|pixel[- ]art|illustrations?|mascots?)\b/i, how: 'Claude draws it as SVG or pixel data in a small script and saves the files in the repo' },
];
// Tasks that happen outside Claude Code, or between people: never a tool need, even when the line
// mentions GitHub or git. One line on what to do instead.
const OUTSIDE = [
  { id: 'recruit', label: 'recruiting', re: /\brecruit\w*|\binvit\w* (?:testers?|users?|people)\b|\bfind (?:testers|volunteers)\b/i, how: 'finding and asking people happens between you and them; Claude can draft the invitation message' },
  { id: 'submit', label: 'submission', re: /\b(?:submit\w*|publish\w*)\b/i, how: 'you submit or publish it yourself in the marketplace or registry; Claude can prepare the files and the description' },
  { id: 'recording', label: 'recording', re: /\b(?:GIF|screencast|screen recording)\b/i, how: 'record it with a terminal recorder such as asciinema or VHS, then Claude can add the file to the README' },
];
const STACK_HEADING = /\b(?:stack|tech(?:nology)?|built with)\b/i;

/**
 * Local only: the needs in a plan. Tasks by topic (the plan's lines that mention it), the stack (the
 * project's dependency files), the domain (the most-mentioned domain topic) and the conventions.
 */
export function extractNeeds(text, { project = null } = {}) {
  const tasks = {}; const conventions = []; const direct = {}; const outside = {}; const builtins = {}; const other = [];
  for (const s of segments(text)) {
    if (CONVENTION_LINE.test(s.text) || (CONVENTION_HEADING.test(s.heading) && !/\btasks?\b/i.test(s.heading))) { conventions.push(s.text); continue; }
    if (STACK_HEADING.test(s.heading) && !/\btasks?\b/i.test(s.heading)) continue; // describes the stack, not a task
    const ds = DIRECT.filter((x) => x.re.test(s.text)); const os = OUTSIDE.filter((x) => x.re.test(s.text));
    const bs = builtinsForLine(s.text);
    if (ds.length || os.length || bs.length) { // not a tool need, whatever else the line mentions
      for (const b of bs) (builtins[b.name] ||= []).push(s.text);
      for (const d of ds) (direct[d.id] ||= []).push(s.text);
      for (const o of os) (outside[o.id] ||= []).push(s.text);
      continue;
    }
    const ts = topicsIn(s.text);
    for (const t of ts) (tasks[t] ||= []).push(s.text);
    if (!ts.length && s.bullet) other.push(s.text); // no topic, no tool: still answered, never skipped
  }
  const libraries = project ? [...librariesIn(project)].sort() : [];
  const libTopics = [...new Set(libraries.flatMap((l) => LIBRARY_TOPICS[l] || []))].sort();
  const domain = Object.keys(tasks).filter((t) => DOMAIN_TOPICS.has(t)).sort((a, b) => tasks[b].length - tasks[a].length)[0] || null;
  const needs = [...new Set([...Object.keys(tasks), ...libTopics])].map((topic) => {
    const lines = tasks[topic] || [];
    const libs = libraries.filter((l) => (LIBRARY_TOPICS[l] || []).includes(topic));
    return { topic, kind: topic === domain ? 'domain' : lines.length ? 'task' : 'stack', lines, libraries: libs, impact: Number((lines.length + 0.5 * libs.length + (topic === domain ? 1 : 0)).toFixed(2)) };
  }).sort((a, b) => b.impact - a.impact);
  return {
    tasks: Object.entries(tasks).map(([topic, lines]) => ({ topic, lines })).sort((a, b) => b.lines.length - a.lines.length),
    stack: { libraries, topics: libTopics },
    domain,
    conventions: conventions.slice(0, 20),
    direct: DIRECT.filter((d) => direct[d.id]).map((d) => ({ id: d.id, label: d.label, lines: direct[d.id], how: d.how })),
    outside: OUTSIDE.filter((o) => outside[o.id]).map((o) => ({ id: o.id, label: o.label, lines: outside[o.id], how: o.how })),
    builtins: Object.entries(builtins).map(([name, lines]) => ({ name, lines })),
    other,
    needs,
  };
}

/** A needs list Claude corrected by hand must still use the shared topic vocabulary. */
function validate(n) {
  if (!n || !Array.isArray(n.needs)) throw new Error('the needs file has no needs list');
  for (const x of n.needs) {
    if (!TOPICS[x?.topic]) throw new Error(`unknown topic "${x?.topic}" in the needs file: use one of ${Object.keys(TOPICS).join(', ')}`);
    x.lines = Array.isArray(x.lines) ? x.lines.map(String) : [];
    x.libraries = Array.isArray(x.libraries) ? x.libraries.map(String) : [];
    x.impact = Number.isFinite(x.impact) ? x.impact : x.lines.length;
  }
  n.conventions = Array.isArray(n.conventions) ? n.conventions.map(String) : [];
  if (n.rejects != null && !Array.isArray(n.rejects)) throw new Error('rejects in the needs file must be a list of owner/repo names');
  n.rejects = (n.rejects || []).map(String);
  const group = (g) => (Array.isArray(g) ? g.filter((d) => d?.id && d?.how).map((d) => ({ id: String(d.id), label: String(d.label || d.id), lines: (d.lines || []).map(String), how: String(d.how) })) : []);
  n.direct = group(n.direct);
  n.outside = group(n.outside);
  n.builtins = Array.isArray(n.builtins) ? n.builtins.filter((b) => BUILTINS.some((x) => x.name === b?.name)).map((b) => ({ name: String(b.name), lines: (b.lines || []).map(String) })) : [];
  n.other = Array.isArray(n.other) ? n.other.map(String) : [];
}

/** The profile one need stands for: only its topic, its plan words and its libraries. */
export function needProfile(need, installed) {
  const w = Math.max(1, need.lines.length) * 10;
  return {
    sessions: 10, windowDays: 30, topics: { [need.topic]: w }, topicWeights: { [need.topic]: w },
    topicSources: { actions: { [need.topic]: w }, mentions: {} }, friction: {}, languages: {}, repeatedCommands: [],
    toolKeywords: Object.fromEntries([...toolKeywordsIn(need.lines.join('\n'))].map((k) => [k, 1])),
    installed, stack: Object.fromEntries(need.libraries.map((l) => [l, 2])),
  };
}

export const goodEnough = (rec, repo, topic) => {
  if (rec.stackEvidence?.length) return true;
  const ev = repoTopicEvidence(repo)[topic];
  return !!ev && ev.inHead && ev.strength >= GOOD_STRENGTH;
};
const SERVICE_WORDS = { docker: /docker|container/i, database: /postgres|mysql|sqlite|mongo|redis|database|\bdb\b|\bsql\b/i };
const CREDENTIAL_WORDS = /\b(?:api[ -]?keys?|tokens?|credentials?|secrets?|passwords?)\b/i;
const MAX_FREE_CREDENTIALS = 3;
/** What makes a match heavy to set up: a local service, or more than 3 credentials, that the plan doesn't mention. */
export function heavySetup(rec, planText) {
  const nd = rec.effort?.needs;
  if (!nd) return null;
  const parts = [];
  const svc = (nd.services || []).filter((x) => !(SERVICE_WORDS[x] || new RegExp(x, 'i')).test(planText));
  if (svc.length) parts.push(`needs ${svc.join(' and ')} running`);
  const cc = nd.credentialCount ?? nd.credentials?.length ?? 0;
  if (cc > MAX_FREE_CREDENTIALS && !CREDENTIAL_WORDS.test(planText)) parts.push(`${cc} credentials to set`);
  return parts.length ? parts.join(', ') : null;
}
/** What the script itself has doubts about; Claude adds its own from the judgment step. */
const doubtsOf = (rec, heavy) => [...(heavy ? [`heavy setup: ${heavy}`] : []), ...(rec.trust?.tier && rec.trust.tier !== 'high' ? [`trust tier is ${rec.trust.tier}`] : [])];
// Docs work Claude does directly (polish a README, write a FAQ or API docs) unless the plan wants a
// repeatable docs workflow: something automated, generated or kept up to date.
const REPEATABLE_DOCS = /\b(?:automat\w*|generat\w*|every (?:release|commit|merge|push|pr)|each (?:release|commit|merge)|on every|up to date|in sync|pipeline|workflow|repeatabl\w*|recurring)\b/i;
export const flaggedHigh = (rec) => rec.trust?.tier === 'low' || (rec.trust?.flags || []).some((f) => f.severity === 'high');

/** The toolkit for a needs list: at most MAX_ITEMS items, ordered by impact, one reason line each. */
export async function buildToolkit(n, catalog, { home, project = null, dataDir, now = Date.now(), platform = process.platform, scan = null, official = null } = {}) {
  const installed = detectInstalled(home, project || home);
  installed.names = [...new Set([...installed.names, ...projectPlugins(project)])].sort();
  // Repos Claude judged a weak fit (the scout skill's steps 2-4) are never offered, whatever their rank.
  const exclude = new Set([...(dataDir ? dismissedSet(dataDir) : []), ...(n.rejects || []).map((r) => String(r).toLowerCase())]);
  const used = new Set();
  const name = slug(project ? path.basename(project) : 'project');
  const libsHere = n.stack?.libraries || [];
  const planText = n.plan?.text || n.needs.flatMap((x) => x.lines).join('\n');
  const items = [];
  for (const need of n.needs.filter((x) => x.lines.length)) {
    const ex = `"${clip(need.lines[0])}"`;
    const said = `Your plan has ${plural(need.lines.length, `${need.topic} line`)} (${ex})`;
    // Anthropic's official plugins and the built-in features come first: they beat trending repos for the same need.
    const cand = pickCandidate(need, { official, installed: new Set(installed.names), used });
    if (cand?.type === 'installed') {
      used.add(cand.name);
      items.push({ topic: need.topic, impact: Number((need.impact * ACTION_WEIGHT.nothing).toFixed(2)), action: 'nothing', installed: cand.name, reason: `${said}: already installed: ${cand.name}.` });
      continue;
    }
    if (cand) {
      used.add(cand.name);
      const base = { topic: need.topic, impact: Number((need.impact * ACTION_WEIGHT[cand.type === 'builtin' ? 'builtin' : 'install']).toFixed(2)), scope: 'project' };
      items.push(cand.type === 'builtin'
        ? { ...base, action: 'builtin', name: cand.name, reason: `${said}; Claude Code has ${cand.name} built in: ${cand.what}; you type ${cand.name} yourself (${cand.note}).` }
        : { ...base, action: 'install', kind: 'official-plugin', plugin: cand.name, repo: OFFICIAL_REPO, trust: 'official',
          command: `claude plugin install ${cand.name}@${OFFICIAL_MARKETPLACE} --scope project`,
          next: `install ${OFFICIAL_REPO} --part ${cand.name} --scope project --plan`,
          reason: `${said}; ${cand.name} in Anthropic's official marketplace is ${cand.what}.` });
      continue;
    }
    // The best good-enough match; a heavy one (see heavySetup) only when no lighter one fits.
    const pick = async (skip) => {
      let match = null; let heavy = null;
      for (const r of recommend(needProfile(need, installed), catalog, { top: 3, exclude: skip, now, platform })) {
        if (used.has(r.name) || r.thinEvidence || !goodEnough(r, catalog.repos[r.name], need.topic)) continue;
        if (scan) await scan([r]);
        if (flaggedHigh(r)) continue;
        const h = heavySetup(r, planText);
        if (!h) return { match: r, heavy: null };
        if (!match) { match = r; heavy = h; }
      }
      return { match, heavy };
    };
    const direct = need.topic === 'docs' && !need.lines.some((l) => REPEATABLE_DOCS.test(l));
    let { match, heavy } = direct ? { match: null, heavy: null } : await pick(exclude);
    if (match && heavy) { // the ranking keeps one repo per job: look for a lighter one past it
      const other = await pick(new Set([...exclude, match.name.toLowerCase()]));
      if (other.match && !other.heavy) ({ match, heavy } = other);
    }
    const uses = need.libraries.length ? `, and you use ${need.libraries.join(', ')} in this project` : '';
    let item;
    if (match) {
      used.add(match.name);
      const adv = match.effort?.advice;
      if (adv === 'build' || adv === 'reference') {
        const form = FORM_OF[match.effort.buildForm] || 'skill';
        const nm = `${name}-${need.topic}`;
        item = { action: 'build', form, name: nm, source: match.name, scope: 'project', next: `build --start --form ${form} --name ${nm}`,
          reason: `${said}${uses}; ${match.name} fits, and it is small enough to build your own (${form}${match.effort.buildTime ? `, ${match.effort.buildTime}` : ''}).` };
      } else {
        item = { action: 'install', repo: match.name, kind: match.kind, scope: 'project', next: `install ${match.name} --scope project --plan`,
          ...(match.effort ? { effort: match.effort.adviceLabel } : {}), trust: match.trust?.tier, ...(heavy ? { heavy } : {}),
          ...(doubtsOf(match, heavy).length ? { doubts: doubtsOf(match, heavy) } : {}),
          reason: `${said}${uses}; ${match.name} is built for that (${match.kind}, ★ ${match.stars}).${heavy ? ` Heavy setup: ${heavy}.` : ''}` };
      }
    } else if (!NATIVE.has(need.topic) && need.lines.length >= 2) {
      const nm = `${name}-${need.topic}`;
      item = { action: 'build', form: 'skill', name: nm, scope: 'project', next: `build --start --form skill --name ${nm}`,
        reason: `${said} and no catalog tool fits well enough: a small skill written for this project.` };
    } else {
      item = { action: 'nothing', reason: `${said}: nothing needed: Claude handles this without a tool.` };
    }
    items.push({ topic: need.topic, impact: Number((need.impact * ACTION_WEIGHT[item.action] * (item.heavy ? HEAVY_WEIGHT : 1)).toFixed(2)), ...item });
  }
  for (const b of n.builtins || []) { // a built-in feature the plan names in its own words
    const f = BUILTINS.find((x) => x.name === b.name); const lines = b.lines.length ? b.lines : [b.name];
    if (used.has(b.name)) continue;
    used.add(b.name);
    items.push({ topic: f.name.slice(1), action: 'builtin', name: b.name, scope: 'project', impact: Number((lines.length * ACTION_WEIGHT.builtin).toFixed(2)),
      reason: `Your plan has ${plural(lines.length, 'line')} ("${clip(lines[0])}"); Claude Code has ${b.name} built in: ${f.what}; you type ${b.name} yourself (${f.note}).` });
  }
  items.sort((a, b) => b.impact - a.impact);
  const all = n.conventions || [];
  const c = uncoveredConventions(all, claudeMdOf(project));
  const covered = all.length > 0 && c.length === 0;
  const kept = items.slice(0, covered ? MAX_ITEMS : MAX_ITEMS - 1);
  const memory = covered ? null : { topic: 'conventions', action: 'memory', form: 'memory', name: `${name}-conventions`, scope: 'project', conventions: c,
    impact: c.length + 1, next: `build --start --form memory --name ${name}-conventions`,
    reason: c.length
      ? `Your plan sets ${c.length < all.length ? `${c.length} of ${plural(all.length, 'convention')} that are not in your CLAUDE.md yet` : plural(c.length, 'convention')} ("${clip(c[0], 50)}"): a CLAUDE.md note keeps ${c.length === 1 ? 'it' : 'them'} in front of Claude in every session.`
      : `Your plan states no conventions; a CLAUDE.md note with its stack${libsHere.length ? ` (${libsHere.slice(0, 4).join(', ')})` : ''}${n.domain ? ` and domain (${n.domain})` : ''} still helps every session.` };
  const out = [...kept, ...(memory ? [memory] : [])].sort((a, b) => b.impact - a.impact);
  const notes = [];
  if (covered) notes.push(`Every convention in your plan is already in CLAUDE.md, so no CLAUDE.md note is offered.`);
  if (!Object.keys(catalog.repos || {}).length) notes.push('The local catalog is empty, so nothing could be matched: run /tool-scout:scout once (it fetches the catalog with fixed topic searches), then kickoff again.');
  // Needs that are not tool needs: listed apart (they are not among the items to set up).
  const direct = (n.direct || []).map((d) => ({ id: d.id, topic: d.label, action: 'nothing', direct: true,
    reason: `Your plan has ${plural(d.lines.length, `${d.label} line`)} ("${clip(d.lines[0], 60)}"): nothing needed: Claude does this directly: ${d.how}.` }));
  const outside = (n.outside || []).map((d) => ({ id: d.id, topic: d.label, action: 'nothing', outside: true,
    reason: `Your plan has ${plural(d.lines.length, `${d.label} line`)} ("${clip(d.lines[0], 60)}"): outside Claude Code: ${d.how}.` }));
  const other = (n.other || []).map((l) => ({ topic: 'other', action: 'nothing', direct: true,
    reason: `Your plan line "${clip(l, 60)}": nothing needed: Claude does this directly: it is ordinary work in this project.` }));
  return { items: out, direct, outside, other, omitted: items.length - kept.length, notes };
}

export function loadNeeds(dataDir) {
  try { return JSON.parse(fs.readFileSync(needsPath(dataDir), 'utf8')); } catch { return null; }
}

function readPlan(file) {
  const st = fs.statSync(file);
  if (!st.isFile()) throw new Error(`${file} is not a file`);
  if (st.size > MAX_PLAN_BYTES) throw new Error(`${file} is over 200 KB: give the plan itself, not a whole document folder`);
  return fs.readFileSync(file, 'utf8');
}

/**
 * Kickoff: read the plan (or, with rematch, the saved needs list as Claude corrected it), match it,
 * and save the needs and the toolkit to the needs file. With a client, a stale catalog is refreshed
 * (fixed topic searches) and each match gets the scout's content scan (effort and trust).
 */
export async function runKickoff({ planFile = null, rematch = false, project = null, home, dataDir, now = Date.now(), client = null, fetchImpl, log = () => {}, platform = process.platform, scan = null }) {
  let n; let reextracted = false;
  const scratch = planFile && path.resolve(planFile) === scratchPath(dataDir);
  if (rematch) {
    n = loadNeeds(dataDir);
    if (!n) throw new Error('no saved needs list: run kickoff --plan-file <path> first');
    if ((n.v || 1) < NEEDS_VERSION) { // an older format: derive the needs again from the saved plan text
      if (typeof n.plan?.text !== 'string') throw new Error('the saved needs list is in an older format and has no plan text: run kickoff --plan-file <path> again');
      n = { ...n, v: NEEDS_VERSION, ...extractNeeds(n.plan.text, { project: n.project }), rejects: n.rejects };
      reextracted = true;
    }
    validate(n);
  } else {
    if (!planFile) throw new Error('usage: kickoff --plan-file <path> [--project DIR]');
    const text = readPlan(planFile);
    const proj = project ? path.resolve(project) : null;
    n = { v: NEEDS_VERSION, createdAt: new Date(now).toISOString(), planFile: scratch ? 'pasted' : path.resolve(planFile), project: proj, plan: { text }, ...extractNeeds(text, { project: proj }) };
  }
  let catalog = loadCatalog(dataDir);
  const ageH = catalog.updatedAt ? (now - Date.parse(catalog.updatedAt)) / 36e5 : Infinity;
  if (client && ageH > STALE_HOURS) {
    try { catalog = await crawl({ dataDir, maxPages: 1, log, fetchImpl }); } catch (e) { log(`catalog refresh skipped: ${e.message}`); }
  }
  const memo = new Map();
  const scanner = scan || (client ? (recs) => scanRecommendations(recs, catalog, { client, dataDir, log, now, memo }).catch((e) => log(`trust scan skipped: ${e.message}`)) : null);
  const official = await loadOfficial({ client, dataDir, now, log });
  const toolkit = await buildToolkit(n, catalog, { home, project: n.project, dataDir, now, platform, scan: scanner, official });
  if (reextracted) toolkit.notes.unshift('The saved needs list was in an older format, so the needs were derived again from the saved plan text (your earlier hand edits to the needs, other than rejects, are replaced).');
  n.toolkit = toolkit;
  n.matchedAt = new Date(now).toISOString();
  fs.mkdirSync(path.dirname(needsPath(dataDir)), { recursive: true });
  fs.writeFileSync(needsPath(dataDir), JSON.stringify(n, null, 2), { mode: 0o600 });
  if (scratch) fs.unlinkSync(planFile); // the pasted copy: the needs file is now the only one
  return { needsFile: needsPath(dataDir), needs: n, toolkit };
}

const ACTION_LABEL = { install: 'Install', builtin: 'Use built-in', build: 'Build your own', memory: 'CLAUDE.md note', nothing: 'Nothing needed' };

export function formatKickoff({ needsFile, needs: n, toolkit }) {
  const out = [`Needs from your plan (${plural(n.needs.filter((x) => x.lines.length).length, 'task topic')}):`];
  for (const x of n.needs.filter((y) => y.lines.length)) out.push(`  ${x.topic}${x.kind === 'domain' ? ' (domain)' : ''}: ${plural(x.lines.length, 'line')}${x.libraries.length ? `; uses ${x.libraries.join(', ')}` : ''}`);
  out.push(`  stack: ${n.stack?.libraries?.length ? n.stack.libraries.join(', ') : 'none found (no --project, or no dependency files)'}`);
  out.push(`  conventions: ${n.conventions.length}`);
  out.push('', `Toolkit (${toolkit.items.length} of at most ${MAX_ITEMS}, by impact):`);
  toolkit.items.forEach((i, k) => {
    const what = i.kind === 'official-plugin' ? `${i.plugin} (official plugin)` : i.action === 'install' ? i.repo : i.action === 'builtin' ? i.name : i.action === 'nothing' ? i.topic : `${i.form} ${i.name}${i.source ? ` (idea from ${i.source})` : ''}`;
    out.push(`${k + 1}. ${ACTION_LABEL[i.action]}: ${what}`, `   ${i.reason}`);
    if (i.manual) out.push(`   Manual steps: ${i.manual}`);
    if (i.next) out.push(`   Next: scout.mjs ${i.next}`);
    if (i.command) out.push(`   Command: ${i.command}`);
  });
  if (toolkit.direct?.length) {
    out.push('', 'Claude does these directly (no tool needed):');
    for (const d of toolkit.direct) out.push(`- ${d.topic}: ${d.reason}`);
  }
  if (toolkit.outside?.length) {
    out.push('', 'Outside Claude Code (not a tool need):');
    for (const d of toolkit.outside) out.push(`- ${d.topic}: ${d.reason}`);
  }
  if (toolkit.other?.length) {
    out.push('', 'Other plan lines, nothing to set up:');
    for (const d of toolkit.other) out.push(`- ${d.reason}`);
  }
  if (toolkit.omitted) out.push(`(${plural(toolkit.omitted, 'smaller need')} left out to keep it to ${MAX_ITEMS}.)`);
  for (const note of toolkit.notes) out.push(`Note: ${note}`);
  out.push('', `Saved locally: ${needsFile} (the only copy of the plan text; never sent anywhere).`);
  return out.join('\n');
}

/** What was installed or built since the kickoff, with undo commands. */
export function kickoffSummary(dataDir) {
  const n = loadNeeds(dataDir);
  if (!n) return { done: [], text: 'No kickoff yet: run kickoff --plan-file <path> first.' };
  const since = Date.parse(n.createdAt);
  const done = loadLog(dataDir).installs.filter((e) => Date.parse(e.at) >= since && !e.undoneAt && !e.replacedBy);
  const line = (e) => e.method === 'build'
    ? `Built ${e.name} (${e.form}, ${e.scope} scope). Undo: scout.mjs undo ${e.name}`
    : `Installed ${e.name} (${e.method === 'mcp' ? 'MCP server' : e.method}, ${e.scope} scope) from ${e.repo}. Undo: scout.mjs undo ${e.name}`;
  return { done, text: done.length ? [`Since the kickoff (${n.createdAt.slice(0, 16).replace('T', ' ')} UTC):`, ...done.map((e) => `- ${line(e)}`)].join('\n') : 'Nothing installed or built since the kickoff.' };
}

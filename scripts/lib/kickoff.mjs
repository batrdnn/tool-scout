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

export const MAX_ITEMS = 5;
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
const ACTION_WEIGHT = { install: 1, build: 0.9, nothing: 0.4 };
const FORM_OF = { hook: 'hook', subagent: 'subagent', 'slash command': 'command', 'CLAUDE.md note': 'memory', skill: 'skill', 'skill with a script': 'skill' };

export const needsPath = (dataDir) => path.join(dataDir, 'kickoff', 'needs.json');
const scratchPath = (dataDir) => path.join(dataDir, 'kickoff', 'plan.md');
const clip = (s, n = 70) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';

/** The plan's lines as plain text: bullets, numbers and heading marks removed. */
function segments(text) {
  const out = [];
  let heading = '';
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { heading = h[1]; continue; }
    const body = line.replace(/^(?:[-*+]|\d+[.)])\s+/, '').replace(/^\[[ xX]\]\s+/, '');
    const bullet = body !== line;
    for (const s of bullet ? [body] : body.split(/(?<=[.!?])\s+/)) if (s.trim()) out.push({ text: s.trim().replace(/[.;]$/, ''), heading });
  }
  return out;
}

/**
 * Local only: the needs in a plan. Tasks by topic (the plan's lines that mention it), the stack (the
 * project's dependency files), the domain (the most-mentioned domain topic) and the conventions.
 */
export function extractNeeds(text, { project = null } = {}) {
  const tasks = {}; const conventions = [];
  for (const s of segments(text)) {
    if (CONVENTION_LINE.test(s.text) || (CONVENTION_HEADING.test(s.heading) && !/\btasks?\b/i.test(s.heading))) { conventions.push(s.text); continue; }
    for (const t of topicsIn(s.text)) (tasks[t] ||= []).push(s.text);
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
}

/** The profile one need stands for: only its topic, its plan words and its libraries. */
function needProfile(need, installed) {
  const w = Math.max(1, need.lines.length) * 10;
  return {
    sessions: 10, windowDays: 30, topics: { [need.topic]: w }, topicWeights: { [need.topic]: w },
    topicSources: { actions: { [need.topic]: w }, mentions: {} }, friction: {}, languages: {}, repeatedCommands: [],
    toolKeywords: Object.fromEntries([...toolKeywordsIn(need.lines.join('\n'))].map((k) => [k, 1])),
    installed, stack: Object.fromEntries(need.libraries.map((l) => [l, 2])),
  };
}

const goodEnough = (rec, repo, topic) => {
  if (rec.stackEvidence?.length) return true;
  const ev = repoTopicEvidence(repo)[topic];
  return !!ev && ev.inHead && ev.strength >= GOOD_STRENGTH;
};
const flaggedHigh = (rec) => rec.trust?.tier === 'low' || (rec.trust?.flags || []).some((f) => f.severity === 'high');

/** The toolkit for a needs list: at most MAX_ITEMS items, ordered by impact, one reason line each. */
export async function buildToolkit(n, catalog, { home, project = null, dataDir, now = Date.now(), platform = process.platform, scan = null } = {}) {
  const installed = detectInstalled(home, project || home);
  // Repos Claude judged a weak fit (the scout skill's steps 2-4) are never offered, whatever their rank.
  const exclude = new Set([...(dataDir ? dismissedSet(dataDir) : []), ...(n.rejects || []).map((r) => String(r).toLowerCase())]);
  const used = new Set();
  const name = slug(project ? path.basename(project) : 'project');
  const libsHere = n.stack?.libraries || [];
  const items = [];
  for (const need of n.needs.filter((x) => x.lines.length)) {
    const ex = `"${clip(need.lines[0])}"`;
    const said = `Your plan has ${plural(need.lines.length, `${need.topic} line`)} (${ex})`;
    const recs = recommend(needProfile(need, installed), catalog, { top: 3, exclude, now, platform });
    let match = null;
    for (const r of recs) {
      if (used.has(r.name) || r.thinEvidence || !goodEnough(r, catalog.repos[r.name], need.topic)) continue;
      if (scan) await scan([r]);
      if (flaggedHigh(r)) continue;
      match = r; break;
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
          ...(match.effort ? { effort: match.effort.adviceLabel } : {}), trust: match.trust?.tier,
          reason: `${said}${uses}; ${match.name} is built for that (${match.kind}, ★ ${match.stars}).` };
      }
    } else if (!NATIVE.has(need.topic) && need.lines.length >= 2) {
      const nm = `${name}-${need.topic}`;
      item = { action: 'build', form: 'skill', name: nm, scope: 'project', next: `build --start --form skill --name ${nm}`,
        reason: `${said} and no catalog tool fits well enough: a small skill written for this project.` };
    } else {
      item = { action: 'nothing', reason: `${said}: nothing needed: Claude handles this without a tool.` };
    }
    items.push({ topic: need.topic, impact: Number((need.impact * ACTION_WEIGHT[item.action]).toFixed(2)), ...item });
  }
  items.sort((a, b) => b.impact - a.impact);
  const kept = items.slice(0, MAX_ITEMS - 1);
  const c = n.conventions || [];
  const memory = { topic: 'conventions', action: 'memory', form: 'memory', name: `${name}-conventions`, scope: 'project', conventions: c,
    impact: c.length + 1, next: `build --start --form memory --name ${name}-conventions`,
    reason: c.length
      ? `Your plan sets ${plural(c.length, 'convention')} ("${clip(c[0], 50)}"): a CLAUDE.md note keeps them in front of Claude in every session.`
      : `Your plan states no conventions; a CLAUDE.md note with its stack${libsHere.length ? ` (${libsHere.slice(0, 4).join(', ')})` : ''}${n.domain ? ` and domain (${n.domain})` : ''} still helps every session.` };
  const out = [...kept, memory].sort((a, b) => b.impact - a.impact);
  const notes = [];
  if (!Object.keys(catalog.repos || {}).length) notes.push('The local catalog is empty, so nothing could be matched: run /tool-scout:scout once (it fetches the catalog with fixed topic searches), then kickoff again.');
  return { items: out, omitted: items.length - kept.length, notes };
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
  let n;
  const scratch = planFile && path.resolve(planFile) === scratchPath(dataDir);
  if (rematch) {
    n = loadNeeds(dataDir);
    if (!n) throw new Error('no saved needs list: run kickoff --plan-file <path> first');
    validate(n);
  } else {
    if (!planFile) throw new Error('usage: kickoff --plan-file <path> [--project DIR]');
    const text = readPlan(planFile);
    const proj = project ? path.resolve(project) : null;
    n = { v: 1, createdAt: new Date(now).toISOString(), planFile: scratch ? 'pasted' : path.resolve(planFile), project: proj, plan: { text }, ...extractNeeds(text, { project: proj }) };
  }
  let catalog = loadCatalog(dataDir);
  const ageH = catalog.updatedAt ? (now - Date.parse(catalog.updatedAt)) / 36e5 : Infinity;
  if (client && ageH > STALE_HOURS) {
    try { catalog = await crawl({ dataDir, maxPages: 1, log, fetchImpl }); } catch (e) { log(`catalog refresh skipped: ${e.message}`); }
  }
  const memo = new Map();
  const scanner = scan || (client ? (recs) => scanRecommendations(recs, catalog, { client, dataDir, log, now, memo }).catch((e) => log(`trust scan skipped: ${e.message}`)) : null);
  const toolkit = await buildToolkit(n, catalog, { home, project: n.project, dataDir, now, platform, scan: scanner });
  n.toolkit = toolkit;
  n.matchedAt = new Date(now).toISOString();
  fs.mkdirSync(path.dirname(needsPath(dataDir)), { recursive: true });
  fs.writeFileSync(needsPath(dataDir), JSON.stringify(n, null, 2), { mode: 0o600 });
  if (scratch) fs.unlinkSync(planFile); // the pasted copy: the needs file is now the only one
  return { needsFile: needsPath(dataDir), needs: n, toolkit };
}

const ACTION_LABEL = { install: 'Install', build: 'Build your own', memory: 'CLAUDE.md note', nothing: 'Nothing needed' };

export function formatKickoff({ needsFile, needs: n, toolkit }) {
  const out = [`Needs from your plan (${plural(n.needs.filter((x) => x.lines.length).length, 'task topic')}):`];
  for (const x of n.needs.filter((y) => y.lines.length)) out.push(`  ${x.topic}${x.kind === 'domain' ? ' (domain)' : ''}: ${plural(x.lines.length, 'line')}${x.libraries.length ? `; uses ${x.libraries.join(', ')}` : ''}`);
  out.push(`  stack: ${n.stack?.libraries?.length ? n.stack.libraries.join(', ') : 'none found (no --project, or no dependency files)'}`);
  out.push(`  conventions: ${n.conventions.length}`);
  out.push('', `Toolkit (${toolkit.items.length} of at most ${MAX_ITEMS}, by impact):`);
  toolkit.items.forEach((i, k) => {
    const what = i.action === 'install' ? i.repo : i.action === 'nothing' ? i.topic : `${i.form} ${i.name}${i.source ? ` (idea from ${i.source})` : ''}`;
    out.push(`${k + 1}. ${ACTION_LABEL[i.action]}: ${what}`, `   ${i.reason}`);
    if (i.next) out.push(`   Next: scout.mjs ${i.next}`);
  });
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

// `scout.mjs me`: maps the saved profile (counts only) to one Claude Code animal.
// Deterministic: the same profile always gives the same result. Reads the profile, never
// changes it, and has nothing to do with ranking. Output uses counts, topic and language
// names only: never commands, MCP servers, libraries, installed tools, projects or paths.
// The SVG card (meCard) holds only the animal, its title, the session count, and the top
// language and topic, and those two only when they are names from the fixed taxonomy.
// Thresholds and the mapping are documented in docs/USAGE.md ("Your Claude Code animal").

import { TOPICS, EXT_HINTS } from './taxonomy.mjs'; // read-only: the fixed topic and language names

export const EGG_SESSIONS = 10; // under this many sessions: Egg, not hatched yet
export const CLOSE = 0.85; // a second animal is shown when its score is at least this share of the winner's
export const MAX_SCORE = 2; // scores are signal ÷ threshold, capped here
export const ORDER = ['Beaver', 'Owl', 'Bee', 'Octopus', 'Ant', 'Fox', 'Turtle']; // also breaks ties

// A score of 1 means the signal reaches its threshold.
export const THRESHOLDS = {
  Beaver: 0.4, // edits + new files (Edit, MultiEdit, Write, NotebookEdit) ÷ all tool calls
  Owl: 0.3, // (sessions with debugging + sessions with friction on the top friction topic) ÷ sessions
  Bee: 0.5, // sessions running the most-used test command ÷ sessions
  Octopus: 3, // MCP servers used, scaled down when there are fewer than OCTOPUS_PROJECTS projects
  Ant: 6, // distinct commands repeated in 3+ sessions, not counting everyday shell utilities
  Fox: { topics: 8, languages: 3 }, // average of (topics in 2+ sessions ÷ 8) and (languages edited ÷ 3)
  Turtle: 40, // tool calls per session, scaled down when there are more than TURTLE_PROJECTS projects
};
export const OCTOPUS_PROJECTS = 3;
export const TURTLE_PROJECTS = 2;

const EDIT_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'];
const TEST_RE = /^(pytest|jest|vitest|mocha|rspec|phpunit|tox|nox|ctest|ava|karma)\b|\stest$/;
// Shell utilities Claude runs to look around; repeating them isn't a habit worth automating.
const EVERYDAY = new Set(['ls', 'cd', 'cat', 'head', 'tail', 'grep', 'rg', 'sed', 'awk', 'echo', 'find', 'wc', 'sort', 'uniq',
  'pwd', 'which', 'mkdir', 'cp', 'mv', 'rm', 'printf', 'xargs', 'tr', 'cut', 'diff', 'touch', 'chmod', 'sleep', 'date', 'env',
  'export', 'source', 'true', 'test', 'read', 'open', 'less', 'file', 'stat', 'basename', 'dirname', 'tee', 'jq']);

export const ANIMALS = {
  Beaver: {
    title: 'The Builder',
    art: ['    .-"""-.', '   / o   o \\', '  |   ===   |', '   \\  |_|  /___', '    `-----\'|###|', '     /   \\  `--\''],
    superpower: 'You turn ideas into files fast and ship.',
    blindSpot: 'Building before reading: a quick look at the existing code and tests can save a rebuild.',
  },
  Owl: {
    title: 'The Debugger',
    art: ['   ,_     _,', '   |\\\\___//|', '   |=(o v o)=|', '    \\  ===  /', '    /|^^^^^|\\', '      "   "'],
    superpower: 'Patient root-causing: you stay with a bug until it makes sense.',
    blindSpot: 'The same fight twice: friction that keeps coming back is a sign a test or tool could catch it earlier.',
  },
  Bee: {
    title: 'The Tester',
    art: ['     \\   /', '   __(o.o)__', '  (__|###|__)~>', '     |###|', '      \\_/'],
    superpower: 'A safety net: your tests catch breakage before anyone else does.',
    blindSpot: 'Slow loops: running the whole suite every time, where a targeted run or watch mode would do.',
  },
  Octopus: {
    title: 'The Orchestrator',
    art: ['     .-""-.', '    / o  o \\', '    \\  __  /', '   _/||||||\\_', '  (_/ /||\\ \\_)', '    ~  ~~  ~'],
    superpower: 'Many arms: you wire tools, servers and projects together.',
    blindSpot: 'Spread thin: many tools and projects can crowd the context and hide what is slow.',
  },
  Ant: {
    title: 'The Grinder',
    art: ['    \\  /', '    (oo)', '  __/  \\__', ' /  (##)  \\', '   _(##)_', '  /      \\'],
    superpower: 'Relentless: the same commands, run reliably, session after session.',
    blindSpot: 'Manual toil: commands you repeat by hand are candidates for a script, hook or skill.',
  },
  Fox: {
    title: 'The Explorer',
    art: ['   /\\     /\\', '  /  \\___/  \\', '  \\  o   o  /', '   \\   w   /', '    \\_____/~~~~'],
    superpower: 'Range: you move between topics and languages with ease.',
    blindSpot: 'Breadth over depth: a few go-to tools per area beat a new setup every time.',
  },
  Turtle: {
    title: 'The Deep Diver',
    art: ['       _____', '     /\\_/ \\_/\\', '  __/ /   \\   \\__', ' (o_|  \\_/ \\_/  |>', '     `--\'  `--\''],
    superpower: 'Focus: long, deep sessions in a few projects.',
    blindSpot: 'Tunnel vision: long sessions drift; checkpoints and fresh context help.',
  },
  Egg: {
    title: 'Not hatched yet',
    art: ['     .--.', '    /    \\', '   |  ??  |', '   |      |', '    \\____/'],
    superpower: 'A fresh start: no habits yet.',
    blindSpot: 'Too little history to tell.',
  },
};

const VOWEL = /^[AEIOU]/;
/** The one line that links to recommendations. Text only: ranking is untouched. */
export const nextLine = (animal) => `Tools that fit ${VOWEL.test(animal) ? 'an' : 'a'} ${animal}: run /tool-scout:scout`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const r3 = (x) => Math.round(x * 1000) / 1000;
/** Entries of a count map, most first, ties by name: independent of the map's key order. */
const ranked = (o) => Object.entries(o || {}).filter(([, v]) => typeof v === 'number' && v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

const count = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const windowDays = (p) => (Number.isInteger(p.windowDays) && p.windowDays > 0 ? p.windowDays : 30);

/** The raw counts every animal is scored from. */
export function signals(p) {
  const S = count(p.sessions);
  const tools = p.tools || {};
  const toolCalls = Object.values(tools).reduce((a, b) => a + (Number(b) || 0), 0);
  const edits = EDIT_TOOLS.reduce((a, t) => a + (tools[t] || 0), 0);
  const tests = (p.repeatedCommands || []).filter((c) => TEST_RE.test(c.command));
  const repeated = (p.repeatedCommands || []).filter((c) => !EVERYDAY.has(c.command.split(' ')[0]));
  const friction = ranked(p.friction);
  return {
    sessions: S, projects: count(p.projects), prompts: count(p.prompts), toolCalls, edits, newFiles: tools.Write || 0,
    distinctTools: Object.keys(tools).length,
    mcpServers: Object.keys(tools).filter((k) => k.startsWith('mcp:')).length,
    debugSessions: p.topics?.debugging || 0,
    frictionTop: friction[0]?.[1] || 0, frictionTopics: friction.length, frictionTopic: friction[0]?.[0] || null,
    testSessions: Math.max(0, ...tests.map((c) => c.sessions)), testRuns: tests.reduce((a, c) => a + c.count, 0),
    testingSessions: p.topicSources?.actions?.testing || 0,
    repeated: repeated.length, repeatedRuns: repeated.reduce((a, c) => a + c.count, 0),
    repeatedTop: [...repeated].sort((a, b) => b.count - a.count)[0] || null,
    topics: ranked(p.topics), broadTopics: ranked(p.topics).filter(([, v]) => v >= 2).length,
    languages: ranked(p.languages),
  };
}

/** Score per animal: signal ÷ threshold, capped at MAX_SCORE, rounded so ties are exact. */
export function scores(sig) {
  const T = THRESHOLDS;
  const S = sig.sessions || 1;
  const raw = {
    Beaver: (sig.toolCalls ? sig.edits / sig.toolCalls : 0) / T.Beaver,
    Owl: (sig.debugSessions + sig.frictionTop) / S / T.Owl,
    Bee: sig.testSessions / S / T.Bee,
    Octopus: (sig.mcpServers / T.Octopus) * Math.min(1, sig.projects / OCTOPUS_PROJECTS),
    Ant: sig.repeated / T.Ant,
    Fox: (sig.broadTopics / T.Fox.topics + sig.languages.length / T.Fox.languages) / 2,
    Turtle: (sig.toolCalls / S / T.Turtle) * (sig.projects > TURTLE_PROJECTS ? TURTLE_PROJECTS / sig.projects : 1),
  };
  return Object.fromEntries(ORDER.map((a) => [a, r3(Math.min(MAX_SCORE, raw[a]))]));
}

function evidence(animal, s) {
  const lang = s.languages[0];
  const topic = s.topics[0];
  const lines = {
    Beaver: [
      `Edits and new files: ${s.edits} of ${s.toolCalls} tool calls (${pct(s.edits, s.toolCalls)}%)`,
      `${plural(s.newFiles, 'new file')} written`,
      lang ? `Most edited language: ${lang[0]} (${plural(lang[1], 'edit')})` : 'No language edits recorded',
    ],
    Owl: [
      `Debugging came up in ${s.debugSessions} of ${plural(s.sessions, 'session')}`,
      `Friction ("still failing", "same error") in ${s.frictionTop} of ${plural(s.sessions, 'session')}${s.frictionTopic ? `, most around ${s.frictionTopic}` : ''}`,
      `${plural(s.frictionTopics, 'topic')} with friction`,
    ],
    Bee: [
      `Test runs in ${s.testSessions} of ${plural(s.sessions, 'session')}`,
      `${plural(s.testRuns, 'test command')} run`,
      `Testing work (test files or commands) in ${plural(s.testingSessions, 'session')}`,
    ],
    Octopus: [
      `${plural(s.mcpServers, 'MCP server')} used`,
      `${plural(s.distinctTools, 'distinct tool')} called`,
      `Work across ${plural(s.projects, 'project')}`,
    ],
    Ant: [
      `${plural(s.repeated, 'command')} repeated in 3+ sessions (everyday shell utilities not counted)`,
      `${plural(s.repeatedRuns, 'run')} of those commands`,
      s.repeatedTop ? `The most repeated one: ${plural(s.repeatedTop.count, 'run')} over ${plural(s.repeatedTop.sessions, 'session')}` : 'No single command stands out',
    ],
    Fox: [
      `${plural(s.broadTopics, 'topic')} in 2+ sessions`,
      `${plural(s.languages.length, 'language')} edited`,
      topic ? `Top topic: ${topic[0]} (${plural(topic[1], 'session')})` : 'No topics recorded',
    ],
    Turtle: [
      `Work in ${plural(s.projects, 'project')}`,
      `${Math.round(s.toolCalls / (s.sessions || 1))} tool calls per session`,
      `${Math.round((10 * s.prompts) / (s.sessions || 1)) / 10} prompts per session`,
    ],
    Egg: [
      `${plural(s.sessions, 'session')} so far (${EGG_SESSIONS} needed)`,
      `Work in ${plural(s.projects, 'project')}`,
      `${plural(s.toolCalls, 'tool call')} in all`,
    ],
  };
  return lines[animal];
}

/** The animal for a profile. `as` forces one animal (for its evidence lines; used by tests). */
export function whoAmI(p, { as } = {}) {
  const sig = signals(p);
  const sc = scores(sig);
  const byScore = [...ORDER].sort((a, b) => sc[b] - sc[a] || ORDER.indexOf(a) - ORDER.indexOf(b));
  const hatched = sig.sessions >= EGG_SESSIONS;
  const animal = as || (hatched ? byScore[0] : 'Egg');
  const runnerUp = byScore.find((a) => a !== animal);
  const close = animal !== 'Egg' && runnerUp && sc[runnerUp] > 0 && sc[runnerUp] >= CLOSE * sc[animal];
  const a = ANIMALS[animal];
  return {
    animal, title: a.title, hatched, art: a.art,
    window: { days: windowDays(p), sessions: sig.sessions, projects: sig.projects },
    evidence: evidence(animal, sig),
    superpower: a.superpower, blindSpot: a.blindSpot,
    second: close ? { animal: runnerUp, title: ANIMALS[runnerUp].title } : null,
    scores: sc,
    next: nextLine(animal),
  };
}

export function formatMe(r) {
  const w = r.window;
  const out = [...r.art.map((l) => `  ${l}`), '',
    `  ${r.animal.toUpperCase()} · ${r.title}`,
    `  Your last ${w.days} days: ${plural(w.sessions, 'session')} across ${plural(w.projects, 'project')}`];
  if (!r.hatched) out.push(`  Come back after ${EGG_SESSIONS} sessions to see your animal.`);
  out.push('', '  Evidence', ...r.evidence.map((e) => `  - ${e}`), '',
    `  Superpower: ${r.superpower}`, `  Blind spot: ${r.blindSpot}`);
  if (r.second) out.push(`  Close second: ${r.second.animal} (${r.second.title})`);
  out.push('', r.next);
  return out.join('\n');
}

// ---- Shareable SVG card ----------------------------------------------------------------

const KNOWN_TOPICS = new Set(Object.keys(TOPICS));
const KNOWN_LANGUAGES = new Set(Object.values(EXT_HINTS).map((h) => h.lang).filter(Boolean));

/** The only profile facts the card shows. Names outside the fixed vocabulary are skipped. */
export function cardStats(p) {
  return {
    sessions: count(p.sessions),
    topLanguage: ranked(p.languages).map(([k]) => k).find((k) => KNOWN_LANGUAGES.has(k)) || null,
    topTopic: ranked(p.topics).map(([k]) => k).find((k) => KNOWN_TOPICS.has(k)) || null,
  };
}

const COLORS = { // background, accent
  Beaver: ['#f3e6d8', '#8a5a2b'], Owl: ['#e8e3f6', '#5b4a9e'], Bee: ['#fff4c7', '#8a6800'], Octopus: ['#fde3e6', '#b23a48'],
  Ant: ['#e4e8eb', '#3d4a55'], Fox: ['#ffe6d1', '#b4520f'], Turtle: ['#dff2e4', '#2f7a45'], Egg: ['#f4f1ea', '#7a7368'],
};
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A self-contained 600×315 SVG card: original ASCII artwork, animal, title, 3 general stats. */
export function meCard(r, p) {
  const st = cardStats(p);
  const [bg, accent] = COLORS[r.animal];
  const sans = 'font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif"';
  const mono = 'font-family="ui-monospace, Menlo, Consolas, monospace"';
  const artW = Math.max(...r.art.map((l) => l.length)) * 10.8; // monospace 18px ≈ 10.8px per character
  const artTop = 158 - (r.art.length * 24) / 2 + 17;
  const art = r.art.map((l, i) => `    <text x="${(24 + (240 - artW) / 2).toFixed(1)}" y="${artTop + i * 24}" xml:space="preserve">${esc(l)}</text>`);
  const rows = [['Sessions', st.sessions], ['Top language', st.topLanguage || '—'], ['Top topic', st.topTopic || '—']]
    .map(([k, v], i) => `  <text x="296" y="${190 + i * 30}" font-size="15" fill="#57606a" ${sans}>${k}</text>\n  <text x="576" y="${190 + i * 30}" font-size="15" font-weight="700" text-anchor="end" fill="#1f2328" ${sans}>${esc(v)}</text>`);
  const footer = r.hatched ? `My last ${windowDays(p)} days in Claude Code · tool-scout` : `My last ${windowDays(p)} days · come back after ${EGG_SESSIONS} sessions`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="315" viewBox="0 0 600 315" role="img" aria-label="' + esc(`My Claude Code animal: ${r.animal}, ${r.title}`) + '">',
    `  <rect width="600" height="315" rx="20" fill="${bg}"/>`,
    '  <rect x="24" y="24" width="240" height="267" rx="14" fill="#ffffff" fill-opacity="0.7"/>',
    `  <g font-size="18" fill="${accent}" ${mono}>`, ...art, '  </g>',
    `  <text x="296" y="62" font-size="12" font-weight="700" letter-spacing="2" fill="${accent}" ${sans}>MY CLAUDE CODE ANIMAL</text>`,
    `  <text x="296" y="112" font-size="44" font-weight="800" fill="#1f2328" ${sans}>${esc(r.animal)}</text>`,
    `  <text x="296" y="142" font-size="20" fill="${accent}" ${sans}>${esc(r.title)}</text>`,
    `  <line x1="296" y1="162" x2="576" y2="162" stroke="${accent}" stroke-opacity="0.3"/>`,
    ...rows,
    `  <text x="296" y="281" font-size="11" fill="#57606a" ${sans}>${esc(footer)}</text>`,
    '</svg>', '',
  ].join('\n');
}

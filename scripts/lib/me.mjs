// `scout.mjs me`: maps the saved profile (counts only) to one Claude Code animal.
// Deterministic: the same profile always gives the same result. Reads the profile, never
// changes it, and has nothing to do with ranking. Output uses counts, topic and language
// names only: never commands, MCP servers, libraries, installed tools, projects or paths.
// Thresholds and the mapping are documented in docs/USAGE.md ("Your Claude Code animal").

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

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const r3 = (x) => Math.round(x * 1000) / 1000;
/** Entries of a count map, most first, ties by name: independent of the map's key order. */
const ranked = (o) => Object.entries(o || {}).filter(([, v]) => typeof v === 'number' && v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

/** The raw counts every animal is scored from. */
export function signals(p) {
  const S = p.sessions || 0;
  const tools = p.tools || {};
  const toolCalls = Object.values(tools).reduce((a, b) => a + (Number(b) || 0), 0);
  const edits = EDIT_TOOLS.reduce((a, t) => a + (tools[t] || 0), 0);
  const tests = (p.repeatedCommands || []).filter((c) => TEST_RE.test(c.command));
  const repeated = (p.repeatedCommands || []).filter((c) => !EVERYDAY.has(c.command.split(' ')[0]));
  const friction = ranked(p.friction);
  return {
    sessions: S, projects: p.projects || 0, prompts: p.prompts || 0, toolCalls, edits, newFiles: tools.Write || 0,
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
    window: { days: p.windowDays || 30, sessions: sig.sessions, projects: sig.projects },
    evidence: evidence(animal, sig),
    superpower: a.superpower, blindSpot: a.blindSpot,
    second: close ? { animal: runnerUp, title: ANIMALS[runnerUp].title } : null,
    scores: sc,
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
  return out.join('\n');
}

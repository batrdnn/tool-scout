// Pretty terminal output: the same facts as the plain text (output.mjs, check.mjs, audit.mjs,
// me.mjs), drawn with colors, boxes, dividers and aligned columns. Only used when stdout is a
// TTY (see term.mjs: detectStyle); every function takes a painter P from term.mjs.

import { evidenceText, leftOutText, SHORTLIST_TITLE, SHORTLIST_HINT } from './output.mjs';
import { EGG_SESSIONS } from './me.mjs';
import { NBSP } from './term.mjs';
import { effortLine } from './effort.mjs';

const SEV = { high: 'red', medium: 'yellow', low: 'dim' };
const TRUST = { high: 'green', medium: 'yellow', low: 'red' };
const VERDICT = { 'safe-looking': 'green', review: 'yellow', 'do not install': 'red' };
const ADVICE = { build: 'green', either: 'yellow', install: 'cyan' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : String(n ?? '—'));
/** Short momentum for the picks table: "+84★ in 7d", "at least 9★ in 7d", "+210.5★/day", "~4★/day". */
function momentum(r) {
  if (r.starsLast7d != null) return r.momentumComplete ? `+${r.starsLast7d}★ in 7d` : `at least ${r.starsLast7d}★ in 7d`;
  return `${r.momentumSource === 'measured' ? '+' : '~'}${r.starsPerDay}★/day`;
}
const loc = (f) => `${f.file}${f.line ? `:${f.line}` : ''}`;

/** "⚑ HIGH pipe-to-shell: detail (README:42) → excerpt", wrapped under itself, colored by severity. */
function flagLines(P, f, { indent = 0, w = P.width - indent } = {}) {
  const text = `⚑ ${f.severity.toUpperCase()} ${f.id}: ${f.detail} (${loc(f)})${f.excerpt ? ` → ${f.excerpt}` : ''}`;
  return P.wrap(text, w - 2).map((l, i) => ' '.repeat(indent) + (i ? '  ' : '') + P[SEV[f.severity] || 'dim'](l));
}

const indented = (P, text, indent = 2, tone) => P.wrap(text, P.width - indent).map((l) => ' '.repeat(indent) + (tone ? P[tone](l) : l));

// ---- profile + picks ------------------------------------------------------------------

export function prettyProfile(p, { profilePath }, P) {
  const top = (o, n = 6) => Object.entries(o || {}).slice(0, n).map(([k, v]) => `${k}${NBSP}(${v})`).join(', ') || '—';
  const st = Object.entries(p.stack || {});
  const left = leftOutText(p);
  const head = [plural(p.sessions, 'session'), plural(p.projects, 'project'), `last ${p.windowDays} days`].join(' · ');
  const rows = [
    ['Topics', top(p.topics, 8)],
    ['Friction', top(p.friction)],
    ['Languages', top(p.languages)],
    ['Commands', (p.repeatedCommands || []).slice(0, 6).map((c) => `${c.command}${NBSP}×${c.count}`).join(', ') || '—'],
    ['Installed', (p.installed?.names || []).slice(0, 12).join(', ') || '—'],
    ['Stack', `${st.slice(0, 10).map(([k, v]) => `${k}${NBSP}(${v})`).join(', ') || '—'}${st.length > 10 ? ` …${NBSP}${st.length}${NBSP}libraries` : ''}`],
  ];
  return [
    ...P.box('Tool Scout · your profile', [P.bold(head), ...(left ? [P.dim(`not counting ${left}`)] : []), '', ...P.fields(rows, { w: P.inner })], { tone: 'cyan' }),
    ...indented(P, `Counts only, no prompt text: ${profilePath}`, 2, 'dim'),
  ];
}

function pickBox(P, r, i) {
  const body = [];
  if (r.description) body.push(...P.wrap(r.description, P.inner), '');
  const rows = [['Why', [r.stackNote, evidenceText(r)].filter(Boolean).join('; ') || '—']];
  if (r.trust.notes.length) rows.push(['Watch out', r.trust.notes.join(', '), 'yellow', 'yellow']);
  if (r.effort) rows.push(['Effort', effortLine(r.effort), ADVICE[r.effort.advice] || 'magenta', ADVICE[r.effort.advice] || 'magenta']);
  rows.push(['Install', `${r.install}${r.installSource === 'readme' ? '  (from README; review before running)' : ''}`]);
  body.push(...P.fields(rows, { w: P.inner }));
  const flags = r.trust.flags || [];
  if (flags.length) body.push('', ...flags.flatMap((f) => flagLines(P, f, { w: P.inner })));
  if (r.trust.scanned === false && r.trust.flags) body.push('', P.dim('(content not scanned)'));
  const worst = flags.some((f) => f.severity === 'high') ? 'red' : flags.some((f) => f.severity === 'medium') ? 'yellow' : 'dim';
  return P.box(`${i + 1}  ${r.name}`, body, { tone: worst });
}

export function prettyRecs(recs, notes, P) {
  const out = [];
  for (const n of notes) out.push(...P.fields([['Note', n, null, 'yellow']], { indent: 2 }));
  if (notes.length) out.push('');
  if (!recs.length) return [...out, ...indented(P, 'No matches yet. Use Claude Code for a few sessions, or run `crawl` to refresh the catalog.')];
  out.push(P.divider(`${SHORTLIST_TITLE} · ${plural(recs.length, 'repo')}`), ...indented(P, SHORTLIST_HINT, 2, 'dim'), '');
  out.push(...P.table([
    { title: '#', align: 'right', tone: 'dim' },
    { title: 'Repo', tone: 'cyan', flex: true },
    { title: 'Kind' },
    { title: 'Stars', align: 'right', tone: 'yellow' },
    { title: 'Momentum' },
    { title: 'Trust', tone: (v) => TRUST[v] },
  ], recs.map((r, i) => [String(i + 1), r.name, r.kind, num(r.stars), momentum(r), r.trust.tier])));
  recs.forEach((r, i) => out.push('', ...pickBox(P, r, i)));
  return out;
}

/** `all` (and `recommend` with withProfile: false). */
export function prettyAll(p, notes, recs, { profilePath, withProfile = true }, P) {
  return [...(withProfile ? [...prettyProfile(p, { profilePath }, P), ''] : []), ...prettyRecs(recs, notes, P)].join('\n');
}

// ---- me ---------------------------------------------------------------------------------

export function prettyMe(r, P) {
  const w = r.window;
  const aw = Math.max(...r.art.map((l) => l.length));
  const infoW = P.inner - aw - 3;
  const info = [
    P.bold(P.magenta(r.animal.toUpperCase())), P.magenta(r.title), '',
    ...(r.hatching ? P.wrap(`Hatching into… ${r.hatching}?`, infoW).map((l) => P.yellow(l)) : []),
    ...P.wrap(`Your last ${w.days} days: ${plural(w.sessions, 'session')} across ${plural(w.projects, 'project')}`, infoW),
    ...(!r.hatched ? P.wrap(`Come back after ${EGG_SESSIONS} sessions to see your animal.`, infoW).map((l) => P.dim(l)) : []),
  ];
  const n = Math.max(r.art.length, info.length);
  const artTop = Math.floor((n - r.art.length) / 2);
  const rows = Array.from({ length: n }, (_, i) => {
    const a = r.art[i - artTop] ?? '';
    return `${P.magenta(a.padEnd(aw))}   ${info[i] ?? ''}`.trimEnd();
  });
  const out = [...P.box('Your Claude Code animal', rows, { tone: 'magenta' }), ''];
  if (r.evidence.length) {
    out.push(P.divider('Evidence'));
    for (const e of r.evidence) out.push(...P.wrap(e, P.width - 4).map((l, i) => `${i ? '    ' : `  ${P.magenta(P.t('•'))} `}${l}`));
    out.push('');
  }
  out.push(...P.fields([
    ['Superpower', r.superpower, null, 'green'],
    ['Blind spot', r.blindSpot, null, 'yellow'],
    ...(r.second ? [['Close second', `${r.second.animal} (${r.second.title})`]] : []),
  ], { indent: 2 }));
  out.push('', ...indented(P, r.next, 0, 'cyan'));
  return out.join('\n');
}

// ---- check ------------------------------------------------------------------------------

/** What it is, how big, what it needs, and the advice: one aligned block. */
function effortFields(e, P) {
  const size = e.loc
    ? `${e.truncated ? 'at least ' : ''}${num(e.codeFiles)} code files, ~${num(e.loc)} lines of ${e.languages.join(', ') || 'code'}`
    : `~${num(e.instructionLines)} lines of Markdown, no code`;
  const needs = [
    e.needs.credentials.length ? `credentials: ${e.needs.credentials.join(', ')}` : null,
    e.needs.services.length ? `running: ${e.needs.services.join(', ')}` : null,
    e.needs.network ? 'network' : null,
  ].filter(Boolean).join(' · ') || 'nothing external';
  const c = e.collection;
  const part = (p) => (p.loc ? `~${num(p.loc)} lines of ${e.languages[0] || 'code'}` : `~${num(p.instructionLines)} lines of Markdown`);
  const sizeRow = c
    ? ['Parts', `${c.count} ${e.typeLabel.replace(/^collection of \d+ /, '')}; typical ${part(c.typical)}; largest ${c.largest.name}, ${part(c.largest)}${c.match ? `; for your ${c.match.topic} work: ${c.match.name}` : ''}`]
    : null;
  return P.fields([
    ['What', e.typeLabel],
    sizeRow || ['Size', `${size}${e.dependencies != null ? ` · ${e.dependencies} ${e.dependencies === 1 ? 'dependency' : 'dependencies'}` : ''}`],
    ['Needs', needs, e.needs.credentials.length || e.needs.services.length ? 'yellow' : null],
    ['Advice', e.advice === 'install' ? e.adviceLabel : e.advice === 'judge' ? `${e.adviceLabel} (${e.buildForm} if built, ${e.buildTime}): Claude decides in /tool-scout:check` : `${e.adviceLabel} (${e.buildForm}, ${e.buildTime})`, ADVICE[e.advice] || 'magenta', ADVICE[e.advice] || 'magenta'],
    ['Why', e.reason],
  ], { indent: 2 });
}

export function prettyCheck(r, P) {
  const m = r.metadata;
  const tone = VERDICT[r.verdict] || 'yellow';
  const head = [
    P.dim(`${r.kind} · ${r.url}`), '',
    ...P.fields([
      ['Verdict', `${r.verdict}${r.reasons.length ? ` (${r.reasons.join('; ')})` : ''}`, tone, tone],
      ['Coverage', r.coverage.line],
      ...r.coverage.notes.map((n) => ['', n, 'yellow']),
    ], { w: P.inner }),
  ];
  const out = [...P.box(r.name, head, { tone }), ''];
  out.push(P.divider('Metadata'));
  out.push(...P.fields([
    ['Trust', `${m.tier} (${m.score}/100)`, TRUST[m.tier]],
    ['Stars', `${num(m.stars)} ★ · ${num(m.forks)} forks`],
    ['License', m.license || 'no license', m.license ? null : 'yellow'],
    ['Owner', m.ownerType === 'Organization' ? 'organization' : 'personal account'],
    ['Created', String(m.createdAt).slice(0, 10)],
    ['Last push', `${String(m.pushedAt).slice(0, 10)}${m.archived ? ' · ARCHIVED' : ''}`, m.archived ? 'red' : null],
    ...(m.notes.length ? [['Notes', m.notes.join(', '), 'yellow']] : []),
  ], { indent: 2 }), '');
  out.push(P.divider(r.flags.length ? `Flags (${r.flags.length})` : 'Flags'));
  if (!r.flags.length) out.push(`  ${P.green('none')}`);
  for (const f of r.flags) out.push(...flagLines(P, f, { indent: 2 }));
  if (r.effort) out.push('', P.divider('Build or install'), ...effortFields(r.effort, P));
  out.push('', P.divider('Install'));
  if (r.install.commands.length) {
    out.push(...indented(P, 'From the README; review before running:', 2, 'dim'));
    for (const c of r.install.commands) out.push(...indented(P, c, 4, 'cyan'));
    if (r.install.note) out.push(...indented(P, r.install.note, 4, 'dim'));
  } else out.push(...indented(P, `No Claude Code command in the README. See the README: ${r.url}#readme`));
  out.push('', ...indented(P, 'No flags does not mean safe: this is a heuristic scan of the README, SKILL.md files, install scripts, hooks and MCP config, not a security review.', 0, 'dim'));
  return out.join('\n');
}

// ---- audit ------------------------------------------------------------------------------

export function prettyAudit(r, P) {
  const k = r.checked;
  const tone = r.counts.high ? 'red' : r.counts.medium ? 'yellow' : 'green';
  const summary = [
    ...P.wrap(`Checked ${plural(k.skills, 'personal skill')}, ${plural(k.plugins, 'installed plugin')}, ${plural(k.mcpServers, 'MCP server command')} and ${plural(k.hooks ?? 0, 'hook')}.`, P.inner),
    '',
    `${P.red(`${r.counts.high} high`)}   ${P.yellow(`${r.counts.medium} medium`)}   ${P.dim(`${r.counts.low} low (not listed)`)}`,
  ];
  const out = [...P.box('Audit · what is installed', summary, { tone }), ''];
  if (!r.findings.length) out.push(`  ${P.green('Nothing medium or high.')}`, '');
  else {
    out.push(P.divider('Findings'));
    for (const f of r.findings) {
      out.push('', `  ${P.dim(f.type)} ${P.bold(f.name)}${f.matcher ? ` [${f.matcher}]` : ''}  ${P.dim(f.where)}`);
      for (const x of f.flags) out.push(...flagLines(P, x, { indent: 4 }));
    }
    out.push('');
  }
  if (r.hooks?.length) {
    out.push(P.divider('Hooks'), ...indented(P, 'Commands are not shown.', 2, 'dim'), '');
    out.push(...P.table([
      { title: 'Event', tone: 'bold' }, { title: 'Matcher' }, { title: 'Where', flex: true }, { title: 'Runs' },
      { title: 'Flags', tone: (v) => (v === 'none' ? 'dim' : 'red') },
    ], r.hooks.map((h) => [h.event, h.matcher || '', h.where, h.script || (h.kind === 'prompt' ? '(prompt hook)' : ''), h.flagged ? `⚑ ${h.flagged}` : 'none'])), '');
  }
  out.push(...indented(P, 'No network was used: everything was read from local files. No flags does not mean safe.', 0, 'dim'));
  return out.join('\n');
}

// ---- stats ------------------------------------------------------------------------------

export function prettyStats(s, dataLine, P) {
  if (!s.rated) return [...indented(P, 'No ratings yet. Rate a pick with: rate <owner/repo> useful|not', 0), ...indented(P, dataLine, 0, 'dim')].join('\n');
  const pct = Math.round(s.usefulShare * 100);
  const barW = Math.min(30, P.inner - 20);
  const full = Math.round((pct / 100) * barW);
  const bar = P.green('█'.repeat(full)) + P.dim('░'.repeat(barW - full));
  return [
    ...P.box('Ratings', [
      ...P.fields([['Rated', `${s.rated} picks`], ['Useful', `${s.useful} (${pct}%)`, 'green'], ['Not useful', String(s.not)]], { w: P.inner }),
      '', `${bar} ${pct}%`,
    ], { tone: 'cyan' }),
    ...indented(P, dataLine, 2, 'dim'),
  ].join('\n');
}

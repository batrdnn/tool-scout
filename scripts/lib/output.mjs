// Plain text output of `profile` and `recommend`/`all`: what pipes, Claude Code and --plain get.
// Moved out of cli.mjs unchanged; test/snapshots/*.plain.txt pin it byte for byte.
// The pretty terminal version of the same facts is in pretty.mjs.

import { effortLine } from './effort.mjs';

/** "+84★ last 7d (12/day)", "+9+★ last 7d (partial window: …)", "+210.5★/day" or "~4★/day". */
export function momentumText(r) {
  return r.starsLast7d != null
    ? `+${r.starsLast7d}${r.momentumComplete ? `★ last 7d (${r.starsPerDay}/day)` : '+★ last 7d (partial window: at least this many)'}`
    : `${r.momentumSource === 'measured' ? '+' : '~'}${r.starsPerDay}★/day`;
}

/** "testing in 16/16 sessions, friction in 1; …" */
export const evidenceText = (r) => r.evidence.map((e) => `${e.topic} in ${e.sessions}/${e.ofSessions} sessions${e.friction ? `, friction in ${e.friction}` : ''}`).join('; ');

/** "⚑ HIGH pipe-to-shell: … (README:42) → excerpt" */
export const flagText = (f) => `⚑ ${f.severity.toUpperCase()} ${f.id}: ${f.detail} (${f.file}${f.line ? `:${f.line}` : ''})${f.excerpt ? ` → ${f.excerpt}` : ''}`;

/** "this session or 2 excluded projects" (what the profile leaves out), or null. */
export function leftOutText(p) {
  const left = [p.excludedCurrentSession && 'this session', p.excludedProjects && `${p.excludedProjects} excluded project${p.excludedProjects > 1 ? 's' : ''}`].filter(Boolean);
  return left.length ? left.join(' or ') : null;
}

export function formatProfile(p, { dataLine, profilePath }) {
  const top = (o, n = 6) => Object.entries(o).slice(0, n).map(([k, v]) => `${k} (${v})`).join(', ') || '—';
  const left = leftOutText(p);
  const out = [`Profile from ${p.sessions} sessions across ${p.projects} projects (last ${p.windowDays} days)${left ? `, not counting ${left}` : ''}`];
  out.push(`  Topics (sessions):  ${top(p.topics, 8)}`);
  if (p.topicWeights) out.push(`  Topic weight (did + 0.3 × talked about): ${top(p.topicWeights, 8)}`);
  out.push(`  Friction (sessions): ${top(p.friction)}`);
  out.push(`  Languages (edits):  ${top(p.languages)}`);
  out.push(`  Repeated commands:  ${p.repeatedCommands.slice(0, 6).map((c) => `${c.command} ×${c.count}`).join(', ') || '—'}`);
  out.push(`  Already installed:  ${p.installed.names.slice(0, 12).join(', ') || '—'}`);
  const st = Object.entries(p.stack || {});
  out.push(`  Stack (projects):   ${st.slice(0, 10).map(([k, v]) => `${k} (${v})`).join(', ') || '—'}${st.length > 10 ? ` … ${st.length} libraries` : ''}`);
  out.push(`Stored counts only (no prompt text) in ${profilePath}`);
  out.push(dataLine);
  return out.join('\n');
}

/** The CLI lists the keyword-ranked shortlist; Claude's judgment step is in the scout skill. */
export const SHORTLIST_TITLE = 'Shortlist (unfiltered)';
export const SHORTLIST_HINT = "Run /tool-scout:scout in Claude Code for Claude's filtered picks.";

export function formatRecs(recs) {
  if (!recs.length) return 'No matches yet. Use Claude Code for a few sessions, or run `crawl` to refresh the catalog.';
  const out = [`\n${SHORTLIST_TITLE}`, SHORTLIST_HINT];
  recs.forEach((r, i) => {
    out.push(`\n${i + 1}. ${r.name}  [${r.kind}]  ${r.stars}★  ${momentumText(r)}  trust: ${r.trust.tier}`);
    if (r.description) out.push(`   ${r.description}`);
    out.push(`   Why: ${[r.stackNote, evidenceText(r)].filter(Boolean).join('; ')}`);
    if (r.trust.notes.length) out.push(`   Watch out: ${r.trust.notes.join(', ')}`);
    for (const f of r.trust.flags || []) out.push(`   ${flagText(f)}`);
    if (r.trust.scanned === false && r.trust.flags) out.push('   (content not scanned)');
    if (r.effort) out.push(`   Effort: ${effortLine(r.effort)}`);
    out.push(`   Install: ${r.install}${r.installSource === 'readme' ? '  (from README; review before running)' : ''}`);
  });
  return out.join('\n');
}

/** `all`: profile, notes, picks. `recommend` prints the same without the profile. */
export function formatAll(p, notes, recs, { dataLine, profilePath, withProfile = true }) {
  return [...(withProfile ? [formatProfile(p, { dataLine, profilePath })] : []), ...notes.map((n) => `\nNote: ${n}`), formatRecs(recs)].join('\n');
}

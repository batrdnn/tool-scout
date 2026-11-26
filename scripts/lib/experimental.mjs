// v0.17 safe mode. Installing, building and turning on hooks are OFF by default. The installer
// (installer.mjs, builder.mjs) is still in the code, behind one explicit setting in the data folder's
// settings.json: experimentalInstaller, which is only on when it is exactly `true`.
//
// This is a switch for people, not a security boundary: anything that can run commands as you can
// also write that file. The skills never turn it on. Fixing that (a human decision outside the
// agent's reach) is the work of v0.18; see the independent review's C1.
import { loadSettings, saveSettings } from './settings.mjs';

export const isExperimental = (dataDir) => loadSettings(dataDir).experimentalInstaller === true;

export function setExperimental(dataDir, on) {
  const s = loadSettings(dataDir);
  if (on) s.experimentalInstaller = true; else delete s.experimentalInstaller;
  saveSettings(dataDir, s);
  return on;
}

export const SWITCHED_OFF = 'Installing, building and turning on hooks are switched off in this version (safe mode).';

export const EXPERIMENTAL_WARNING = [
  'EXPERIMENTAL INSTALLER IS ON. It is not a safe way to install things yet:',
  'a plan\'s confirmation is not enforced as a human decision (an agent can confirm its own plan),',
  'it can end up with a different plugin than the one you reviewed, a project-scoped write can follow a symlink out of the project,',
  'and "undo" can report success while the change is still there. Use it at your own risk, and check the result yourself.',
  'Turn it off: scout.mjs experimental off',
].join(' ');

/** What a gated command says when the installer is off: what happened, what to do by hand, how to turn it on (by the user, in their own terminal). */
export function switchedOffMessage(what) {
  return [
    `${SWITCHED_OFF} Nothing was ${what}.`,
    'Tool Scout still recommends and checks: install by hand, in your own terminal, after reading the repo (the check and the README show the manual steps), and choose project scope.',
    'The experimental installer is the user\'s decision, not Claude\'s: to try it anyway, type this yourself in your own terminal (in Claude Code, start the line with !): scout.mjs experimental on',
  ].join('\n');
}

// ---- manual steps: what the read-only commands show instead of an install offer --------------------

const PATHS = { skill: (n) => `.claude/skills/${n}/SKILL.md`, command: (n) => `.claude/commands/${n}.md`, subagent: (n) => `.claude/agents/${n}.md` };

/** What to do by hand for one kickoff or blind-spot item (null when there is nothing to set up). Always project scope. */
export function manualSteps(i) {
  if (!i) return null;
  if (i.kind === 'official-plugin' || i.action === 'official-plugin') {
    const cmd = /--scope\b/.test(i.command || '') ? i.command : `${i.command} --scope project`;
    return `Read the plugin's hooks and MCP servers first, then run this yourself, in your own terminal: ${cmd}`;
  }
  if (i.action === 'install') return `Read it first (/tool-scout:check ${i.repo}), then follow its README's install steps yourself, at project scope (this project only, not user scope).`;
  const own = 'Ask Claude to draft it in chat, read it, then save it yourself';
  if (i.action === 'build' && PATHS[i.form]) return `${own} as ${PATHS[i.form](i.name)} in this project (project scope).`;
  if (i.action === 'build' && i.form === 'hook') return 'A hook runs automatically on Claude Code events, without asking: write it yourself, read exactly what it runs, and add it to this project\'s .claude/settings.json (project scope) only if you want that.';
  if (i.action === 'memory' || i.form === 'memory') return 'Ask Claude to draft the note in chat, read it, then add it to this project\'s CLAUDE.md yourself.';
  return null;
}

/**
 * Kickoff and blind-spot items for the read-only commands. With the installer off, the Tool Scout
 * commands (`next`) are removed and each item that needs setting up gets `manual` steps; with it on, items stay as they are.
 */
export function withManualSteps(items, experimental) {
  if (experimental) return items;
  return items.map(({ next, ...rest }) => { const manual = manualSteps(rest); return manual ? { ...rest, manual } : rest; });
}

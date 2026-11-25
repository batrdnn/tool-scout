// Terminal styling, zero dependencies. Pretty output (colors, boxes, aligned columns) is only
// for a person at a real terminal. Pipes, Claude Code's Bash tool, --plain and --json get the
// plain text, unchanged, so nothing that reads the output ever sees an escape code.

const ANSI = /\u001b\[[0-9;]*m/g;

export const stripAnsi = (s) => String(s).replace(ANSI, '');

function cpWidth(cp) {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60)
    || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}

/** Columns a string takes in a terminal: escape codes take none, CJK and emoji take two. */
export function strWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) w += cpWidth(ch.codePointAt(0));
  return w;
}

/** Can this terminal draw box characters, ★ and ⚑? Locale first, then known terminals. */
export function supportsUnicode(env = {}, platform = process.platform) {
  if (platform === 'win32') {
    return !!(env.WT_SESSION || env.TERM_PROGRAM === 'vscode' || env.ConEmuTask
      || env.TERMINAL_EMULATOR === 'JetBrains-JediTerm' || env.TERM === 'xterm-256color' || env.TERM === 'alacritty');
  }
  if (env.TERM === 'linux') return false; // the Linux virtual console lacks most of the glyphs
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG;
  if (locale) return /utf-?8/i.test(locale);
  return platform === 'darwin';
}

/**
 * pretty: only when stdout is a TTY and nobody asked for --plain or --json. Never inside Claude
 * Code (CLAUDECODE is set in its shells), so the model never sees escape codes even if a
 * terminal is attached. color: off with NO_COLOR (https://no-color.org: any non-empty value).
 */
export function detectStyle({ isTTY, env = {}, opts = {}, platform = process.platform } = {}) {
  const pretty = !!isTTY && !opts.plain && !opts.json && env.TERM !== 'dumb' && !env.CLAUDECODE;
  if (!pretty) return { pretty: false, color: false, unicode: false };
  return { pretty, color: !env.NO_COLOR, unicode: supportsUnicode(env, platform) };
}

const ASCII = { '★': '*', '⚑': '!', '·': '-', '×': 'x', '…': '...', '—': '-', '–': '-', '→': '->', '✓': 'ok', '‘': "'", '’': "'", '“': '"', '”': '"', '•': '*', '█': '#', '░': '.', '\u00a0': ' ' };
/** ASCII-only text: known symbols get a stand-in, anything else becomes '?'. */
export const asciiFold = (s) => String(s).replace(/[^\x00-\x7f]/gu, (c) => ASCII[c] ?? '?');

const BOX = {
  unicode: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  ascii: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
};
const SGR = { bold: [1, 22], dim: [2, 22], red: [31, 39], green: [32, 39], yellow: [33, 39], blue: [34, 39], magenta: [35, 39], cyan: [36, 39] };

/** Never hard-broken: URLs and paths, so they still work when copied. */
const UNBREAKABLE = /^\S*:\/\/|^[~.]?\//;
/** Keeps two words on one line (`devops${NBSP}(3)`); printed as a normal space. */
export const NBSP = '\u00a0';

/** Split text into lines of at most `width` columns, at spaces. URLs and paths are never broken. */
export function wrap(text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (let word of para.split(/ +/).filter(Boolean)) {
      while (strWidth(word) > width && !UNBREAKABLE.test(word)) { // hard-break long words, but not URLs or paths
        const room = line ? width - strWidth(line) - 1 : width;
        if (room < 8 && line) { out.push(line); line = ''; continue; }
        let head = '';
        for (const ch of word) { if (strWidth(head + ch) > room) break; head += ch; }
        out.push(line ? `${line} ${head}` : head);
        line = '';
        word = word.slice(head.length);
      }
      if (!line) line = word;
      else if (strWidth(line) + 1 + strWidth(word) <= width) line += ` ${word}`;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out.map((l) => l.replaceAll(NBSP, ' '));
}

const pad = (s, w) => s + ' '.repeat(Math.max(0, w - strWidth(s)));
const padStart = (s, w) => ' '.repeat(Math.max(0, w - strWidth(s))) + s;

/**
 * The drawing kit for one style. Every helper folds text to ASCII first when the terminal has
 * no Unicode, so widths are measured on what is actually printed.
 */
export function painter(style, { width = 80 } = {}) {
  const W = Math.max(40, width);
  const t = style.unicode ? (s) => String(s) : asciiFold;
  const b = style.unicode ? BOX.unicode : BOX.ascii;
  const paint = (name) => (s) => (style.color && s !== '' ? `\u001b[${SGR[name][0]}m${s}\u001b[${SGR[name][1]}m` : String(s));
  const c = Object.fromEntries(Object.keys(SGR).map((k) => [k, paint(k)]));

  /** A full-width box. Body lines are wrapped; `title` sits in the top border. */
  function box(title, body, { tone = 'dim', titleTone = 'bold' } = {}) {
    const inner = W - 4;
    const head = title ? `${b.h} ${t(title)} ` : '';
    const top = c[tone](b.tl) + (title ? `${c[tone](b.h)} ${c[titleTone](t(title))} ` : '') + c[tone](b.h.repeat(Math.max(0, W - 2 - strWidth(head))) + b.tr);
    const rows = [];
    for (const raw of body) for (const l of raw === '' ? [''] : wrapKeep(t(raw), inner)) rows.push(`${c[tone](b.v)} ${pad(l, inner)} ${c[tone](b.v)}`);
    return [top, ...rows, c[tone](b.bl + b.h.repeat(W - 2) + b.br)];
  }

  /** Wrap text that may already carry escape codes: wrap on the visible text, keep codes per word. */
  function wrapKeep(s, w) { return strWidth(s) <= w ? [s] : wrap(s, w); }

  /** ── title ───────── across the width. */
  const divider = (title = '') => {
    if (!title) return c.dim(b.h.repeat(W));
    const lead = `${b.h}${b.h} ${t(title)} `;
    return `${c.dim(b.h + b.h)} ${c.bold(t(title))} ${c.dim(b.h.repeat(Math.max(0, W - strWidth(lead))))}`;
  };

  /**
   * Label/value rows with the labels padded to one column; values wrap under themselves.
   * `w` is the room available (default: the full width, minus `indent`).
   */
  function fields(rows, { indent = 0, w = W - indent, labelTone = 'dim' } = {}) {
    const lw = Math.max(0, ...rows.map(([k]) => strWidth(t(k))));
    const out = [];
    for (const [k, v, tone, kTone = labelTone] of rows) {
      const lines = wrap(t(v), Math.max(10, w - lw - 2));
      lines.forEach((l, i) => out.push(' '.repeat(indent) + (i ? ' '.repeat(lw + 2) : c[kTone](pad(t(k), lw)) + '  ') + (tone ? c[tone](l) : l)));
    }
    return out;
  }

  /**
   * Aligned columns. cols: [{ title, align: 'left'|'right', tone?, flex? }]; tone is a color
   * name or (cell, rowIndex) => name. The one `flex` column is cut with … so a row fits.
   */
  function table(cols, rows, { indent = 2, gap = 2 } = {}) {
    const cells = rows.map((r) => r.map((v) => t(v ?? '')));
    const widths = cols.map((col, i) => Math.max(strWidth(t(col.title)), ...cells.map((r) => strWidth(r[i]))));
    const flex = cols.findIndex((col) => col.flex);
    const total = indent + widths.reduce((a, x) => a + x, 0) + gap * (cols.length - 1);
    if (flex >= 0 && total > W) widths[flex] = Math.max(6, widths[flex] - (total - W));
    const ell = style.unicode ? '…' : '~';
    const cut = (s, w) => { if (strWidth(s) <= w) return s; let o = ''; for (const ch of s) { if (strWidth(o + ch) > w - 1) break; o += ch; } return o + ell; };
    const line = (r, tones) => ' '.repeat(indent) + r.map((v, i) => {
      const s = cut(v, widths[i]);
      const p = cols[i].align === 'right' ? padStart(s, widths[i]) : (i === r.length - 1 ? s : pad(s, widths[i]));
      return tones[i] ? c[tones[i]](p) : p;
    }).join(' '.repeat(gap));
    const tone = (col, v, j) => (typeof col.tone === 'function' ? col.tone(v, j) : col.tone);
    return [line(cols.map((col) => t(col.title)), cols.map(() => 'dim')), ...cells.map((r, j) => line(r, cols.map((col, i) => tone(col, r[i], j))))];
  }

  return { style, width: W, inner: W - 4, t, ...c, box, divider, fields, table, wrap: (s, w = W) => wrap(t(s), w) };
}

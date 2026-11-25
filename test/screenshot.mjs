// The README's terminal screenshot: `all` in a terminal (pretty, colored), for the fixture
// profile and its top 3 picks, drawn as an SVG terminal window at docs/assets/terminal.svg.
//   npm run screenshot         regenerate the file
// test/screenshot.test.mjs fails when the file is missing or differs from what this makes now.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { painter, strWidth } from '../scripts/lib/term.mjs';
import { prettyAll } from '../scripts/lib/pretty.mjs';

export const SCREENSHOT_FILE = fileURLToPath(new URL('../docs/assets/terminal.svg', import.meta.url));
const fx = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/output/${f}`, import.meta.url), 'utf8'));

const THEME = { bg: '#0d1117', bar: '#161b22', fg: '#c9d1d9', dim: '#8b949e', red: '#ff7b72', green: '#7ee787', yellow: '#e3b341', blue: '#79c0ff', magenta: '#d2a8ff', cyan: '#56d4dd' };
const FG = { 31: 'red', 32: 'green', 33: 'yellow', 34: 'blue', 35: 'magenta', 36: 'cyan' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Each line of ANSI text as <tspan>s placed at their column (cw px per column). */
export function ansiToSvgLines(text, { cw }) {
  return text.split('\n').map((line) => {
    const st = { fg: null, bold: false, dim: false };
    let col = 0;
    const out = [];
    for (const part of line.split(/(\u001b\[\d+m)/)) {
      const m = part.match(/^\u001b\[(\d+)m$/);
      if (m) {
        const n = Number(m[1]);
        if (n === 0) Object.assign(st, { fg: null, bold: false, dim: false });
        else if (n === 1) st.bold = true;
        else if (n === 2) st.dim = true;
        else if (n === 22) { st.bold = false; st.dim = false; } else if (n === 39) st.fg = null;
        else if (FG[n]) st.fg = FG[n];
        continue;
      }
      if (!part) continue;
      // One tspan per run of text between 2+ spaces, at its own column and with its exact width,
      // so alignment never depends on how a renderer treats spaces or on the font's advance.
      const fill = THEME[st.fg || (st.dim ? 'dim' : 'fg')];
      for (const chunk of part.split(/( {2,}|^ +| +$)/)) {
        if (chunk.trim()) {
          const x = +(col * cw).toFixed(1), len = +(strWidth(chunk) * cw).toFixed(1);
          out.push(`<tspan x="${x}" fill="${fill}"${st.bold ? ' font-weight="700"' : ''}${st.dim && st.fg ? ' fill-opacity="0.75"' : ''} textLength="${len}" lengthAdjust="spacingAndGlyphs">${esc(chunk)}</tspan>`);
        }
        col += strWidth(chunk);
      }
    }
    return out.join('');
  });
}

export function screenshotSvg() {
  const cols = 80;
  const rec = fx('recommend.json');
  const P = painter({ pretty: true, color: true, unicode: true }, { width: cols });
  const body = prettyAll(fx('profile.json'), rec.notes, rec.recommendations.slice(0, 3), { profilePath: '~/.tool-scout/profile.json' }, P);
  const prompt = `${P.green('$')} node scripts/scout.mjs all`;
  const lines = ansiToSvgLines(`${prompt}\n${body}`, { cw: 7.8 });
  const pad = 16, top = 40, lh = 18;
  const w = Math.round(cols * 7.8 + pad * 2), h = top + pad + lines.length * lh;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Tool Scout in a terminal: profile, aligned table of picks and one box per pick">`,
    `  <rect width="${w}" height="${h}" rx="10" fill="${THEME.bg}"/>`,
    `  <path d="M0 10a10 10 0 0 1 10-10h${w - 20}a10 10 0 0 1 10 10v18h-${w}z" fill="${THEME.bar}"/>`,
    ...['#ff5f57', '#febc2e', '#28c840'].map((c, i) => `  <circle cx="${18 + i * 20}" cy="14" r="6" fill="${c}"/>`),
    `  <text x="${w / 2}" y="18" font-size="12" text-anchor="middle" fill="${THEME.dim}" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">tool-scout</text>`,
    `  <g font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" xml:space="preserve" transform="translate(${pad} ${top})">`,
    ...lines.map((l, i) => (l ? `    <text y="${i * lh + 13}">${l}</text>` : null)).filter(Boolean),
    '  </g>',
    '</svg>', '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  fs.mkdirSync(new URL('../docs/assets/', import.meta.url), { recursive: true });
  fs.writeFileSync(SCREENSHOT_FILE, screenshotSvg());
  console.log(`Wrote ${SCREENSHOT_FILE}`);
}

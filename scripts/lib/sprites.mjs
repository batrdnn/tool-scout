// Original 16x16 pixel-art sprites for the Claude Code animals, stored as palette-indexed grids.
// Each row is 16 characters: "." is empty, any other character is a key into that sprite's
// palette. Zero dependencies and no imports, so the terminal and the SVG card share one source.

export const SIZE = 16;

// `tones` tell the plain (monochrome) version how to print each palette key: `dark` keys as █,
// `accent` keys as ▓, everything else as blank. Two tones plus one accent, no mid-grays.
export const SPRITES = {
  Beaver: { // side view, facing left, with a flat tail
    palette: { K: '#3b2412', B: '#8a5a2b', L: '#c99a62', N: '#1f1209', W: '#fffaf0', T: '#6b4423' },
    tones: { dark: 'KN', accent: 'BT' },
    rows: [
      '................',
      '................',
      '..KKK...........',
      '.KBBBKKKKK......',
      '.KBBBBBBBK......',
      'KBBBKBBBBBBK....',
      'NLLBBBBBBBBK....',
      'KLLBBBBBBBBK....',
      'KWLBBBBBBBBKKKKK',
      '.KWLLBBBBBBKTTTK',
      '..KLLLLBBBBKTKTK',
      '...KKLLLLLLKTTTK',
      '.....KKKKKKKKKKK',
      '................',
      '................',
      '................',
    ],
  },
  Owl: { // front view: big round eyes, round head, no ear tufts
    palette: { D: '#3a2f66', P: '#6b5a9e', C: '#e4dcf5', Y: '#ffd24a', W: '#ffffff', K: '#161025', O: '#f08a24' },
    tones: { dark: 'DKO', accent: 'P' },
    rows: [
      '................',
      '....KKKKKKKK....',
      '...KPPPPPPPPK...',
      '..KPPPPPPPPPPK..',
      '.KPPYYYPPYYYPPK.',
      '.KPYWWWYYWWWYPK.',
      '.KPYWKWYYWKWYPK.',
      '.KPYWWWYYWWWYPK.',
      '.KPPYYYPPYYYPPK.',
      '..KPPPPOOPPPPK..',
      '.KDPPCCCCCCPPDK.',
      '.KDPCDCDCDCDPDK.',
      '.KDPCCCCCCCCPDK.',
      '..KDPCCCCCCPDK..',
      '...KKDDDDDDKK...',
      '....OO....OO....',
    ],
  },
  Bee: {
    palette: { K: '#2a2214', Y: '#ffcf2e', W: '#e3f1ff', B: '#7aa6d6' },
    tones: { dark: 'K', accent: 'B' },
    rows: [
      '..K..........K..',
      '...K........K...',
      '....K......K....',
      '.....KKKKKK.....',
      '...BKYYYYYYKB...',
      '..BWKYKYYKYKWB..',
      '..BWKYYYYYYKWB..',
      '...BKYYKKYYKB...',
      '....KKKKKKKK....',
      '...BKYYYYYYKB...',
      '....KKKKKKKK....',
      '....KYYYYYYK....',
      '....KKKKKKKK....',
      '.....KYYYYK.....',
      '......KKKK......',
      '.......KK.......',
    ],
  },
  Octopus: { // dome head and four thick tentacles that curl out to the edges
    palette: { D: '#8f2236', R: '#d6455d', L: '#f08aa0', W: '#ffffff', K: '#2b0f16' },
    tones: { dark: 'DK', accent: 'R' },
    rows: [
      '................',
      '....DDDDDDDD....',
      '..DDRRRRRRRRDD..',
      '.DRRLLRRRRRRRRD.',
      '.DRLLRRRRRRRRRD.',
      '.DRRRRRRRRRRRRD.',
      '.DRRWWRRRRWWRRD.',
      '.DRRKKRRRRKKRRD.',
      '.DRRRRRRRRRRRRD.',
      '..DRRRRRRRRRRD..',
      '..DRRRRRRRRRRD..',
      '.DRRDRRDRRDRRD..',
      '.DRRDRRDRRDRRD..',
      'DRRD.RRDRRD.RRD.',
      'DRD...RDRD...DRD',
      '.D.....DD.....D.',
    ],
  },
  Ant: { // side view, facing left: head, thorax, abdomen, six legs, two antennae
    palette: { K: '#2b1a14', A: '#a0452c', W: '#ffffff', H: '#d98a6a' },
    tones: { dark: 'K', accent: 'A' },
    rows: [
      '................',
      '................',
      '.K...K..........',
      '..K.K...........',
      '..KKK.KKK.KKKK..',
      '.KAAAKHAAKHAAAK.',
      '.KAAAKAAAKHAAAK.',
      '.KWAAKAAAKAAAAK.',
      '.KAAAKAAAKAAAAK.',
      '..KKK.KKK.KKKK..',
      '...K.K.K.K.K.K..',
      '..K..K.K.K.K..K.',
      '.K...K.K.K.K...K',
      '................',
      '................',
      '................',
    ],
  },
  Fox: {
    palette: { K: '#201510', O: '#e8731f', W: '#fff3e0' },
    tones: { dark: 'K', accent: 'O' },
    rows: [
      '................',
      '................',
      '..KK........KK..',
      '..KOK......KOK..',
      '..KOOK....KOOK..',
      '..KOOOKKKKOOOK..',
      '..KOOOOOOOOOOK..',
      '..KOKOOOOOOKOK..',
      '..KOOOOOOOOOOK..',
      '..KWWOOOOOOWWK..',
      '...KWWWOOWWWK...',
      '....KWWKKWWK....',
      '.....KWWWWK.....',
      '......KKKK......',
      '................',
      '................',
    ],
  },
  Turtle: {
    palette: { D: '#1d4a2b', G: '#2f7a45', L: '#6fbf73', S: '#a4d27a', K: '#10200f' },
    tones: { dark: 'DK', accent: 'GS' },
    rows: [
      '......DDDD......',
      '.....DSSSSD.....',
      '.....DKSSKD.....',
      '..DD.DSSSSD.DD..',
      '.DSSDDGGGGDDSSD.',
      '.DSDGGLDDLGGDSD.',
      '..DGGDLGGLDGGD..',
      '..DGLGDGGDGLGD..',
      '..DGGGDLLDGGGD..',
      '..DDGGGDDGGGDD..',
      '.DSDDGGGGGGDDSD.',
      '.DSSD.DDDD.DSSD.',
      '..DD..DSSD..DD..',
      '.......DD.......',
      '................',
      '................',
    ],
  },
  Egg: { // a zigzag crack: not hatched yet, but something is coming
    palette: { D: '#7a7368', W: '#f4efe3', H: '#ffffff', S: '#cfc6b0', B: '#b58a5b', K: '#3a342b' },
    tones: { dark: 'DK', accent: 'SB' },
    rows: [
      '................',
      '.....DDDDDD.....',
      '...DDWWWWWWDD...',
      '..DWHHWWWKWWWD..',
      '.DWHWWWWKWWWWWD.',
      '.DWWWWWWWKWWWSD.',
      '.DWWBWWWKWWWWSD.',
      '.DWWWWWWWKKWWSD.',
      '.DWWWWWWWWWWSSD.',
      '.DWWWBWWWWWWSSD.',
      '..DWWWWWWWWSSD..',
      '..DSWWWWWWSSSD..',
      '...DDSSSSSSDD...',
      '.....DDDDDD.....',
      '................',
      '................',
    ],
  },
};

/** The sprite as a 16x16 array of '#rrggbb' strings, or null for an empty cell. */
export function pixels(name) {
  const { palette, rows } = SPRITES[name];
  return rows.map((row) => [...row].map((ch) => (ch === '.' ? null : palette[ch])));
}

// ---- Terminal: half-block characters with 24-bit color, or the 256-color palette -----------

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const CUBE = [0, 95, 135, 175, 215, 255];

/** The nearest xterm-256 color (cube 16-231 or grey ramp 232-255) to a '#rrggbb' color. */
export function ansi256(hex) {
  const c = rgb(hex);
  const near = (v) => CUBE.reduce((best, lvl, i) => (Math.abs(lvl - v) < Math.abs(CUBE[best] - v) ? i : best), 0);
  const ci = c.map(near);
  const cube = ci.map((i) => CUBE[i]);
  const g = Math.min(23, Math.max(0, Math.round((((c[0] + c[1] + c[2]) / 3) - 8) / 10)));
  const grey = 8 + 10 * g;
  const dist = (p) => p.reduce((s, v, i) => s + (v - c[i]) ** 2, 0);
  return dist([grey, grey, grey]) < dist(cube) ? 232 + g : 16 + 36 * ci[0] + 6 * ci[1] + ci[2];
}

/** COLORTERM=truecolor or 24bit: the terminal takes 24-bit color. Otherwise use 256 colors. */
export const supportsTruecolor = (env = {}) => /^(truecolor|24bit)$/i.test(env.COLORTERM || '');

/**
 * The sprite as 8 text rows of 16 columns: each row covers two pixel rows, drawn with ▀ (top
 * pixel as foreground, bottom as background), ▄ (only the bottom pixel) and █ (both the same).
 */
export function halfBlocks(name, { truecolor = true } = {}) {
  const px = pixels(name);
  const fg = (h) => (truecolor ? `38;2;${rgb(h).join(';')}` : `38;5;${ansi256(h)}`);
  const bg = (h) => (truecolor ? `48;2;${rgb(h).join(';')}` : `48;5;${ansi256(h)}`);
  const out = [];
  for (let y = 0; y < SIZE; y += 2) {
    let line = '';
    let cur = '';
    for (let x = 0; x < SIZE; x++) {
      const top = px[y][x], bot = px[y + 1][x];
      let sgr = '', ch = ' ';
      if (top && bot && top === bot) { sgr = fg(top); ch = '█'; }
      else if (top && bot) { sgr = `${fg(top)};${bg(bot)}`; ch = '▀'; }
      else if (top) { sgr = fg(top); ch = '▀'; }
      else if (bot) { sgr = fg(bot); ch = '▄'; }
      if (sgr !== cur) { line += (cur ? '\u001b[0m' : '') + (sgr ? `\u001b[${sgr}m` : ''); cur = sgr; }
      line += ch;
    }
    out.push(line + (cur ? '\u001b[0m' : ''));
  }
  return out;
}

// ---- Plain text: monochrome, no escape codes --------------------------------------------------

/** The sprite as 16 text rows of 32 columns: two characters per pixel, so it keeps its proportions.
 *  Outline and dark parts are █, the accent tone is ▓, light parts and empty cells are blank. */
export function shaded(name) {
  const { rows, tones } = SPRITES[name];
  const cell = (k) => (k === '.' ? '  ' : tones.dark.includes(k) ? '██' : tones.accent.includes(k) ? '▓▓' : '  ');
  return rows.map((row) => [...row].map(cell).join(''));
}

// ---- SVG: one <rect> per horizontal run of the same color ----------------------------------

/** `<rect>` lines for the sprite at (x, y), each pixel `scale` units square. Use inside shape-rendering="crispEdges". */
export function svgRects(name, { x = 0, y = 0, scale = 1 } = {}) {
  const out = [];
  pixels(name).forEach((row, r) => {
    for (let c = 0; c < SIZE;) {
      if (!row[c]) { c++; continue; }
      let end = c;
      while (end + 1 < SIZE && row[end + 1] === row[c]) end++;
      out.push(`<rect x="${x + c * scale}" y="${y + r * scale}" width="${(end - c + 1) * scale}" height="${scale}" fill="${row[c]}"/>`);
      c = end + 1;
    }
  });
  return out;
}

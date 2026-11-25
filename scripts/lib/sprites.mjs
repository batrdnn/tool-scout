// Original 16x16 pixel-art sprites for the Claude Code animals, stored as palette-indexed grids.
// Each row is 16 characters: "." is empty, any other character is a key into that sprite's
// palette. Zero dependencies and no imports, so the terminal and the SVG card share one source.

export const SIZE = 16;

export const SPRITES = {
  Beaver: {
    palette: { K: '#3b2412', B: '#8a5a2b', L: '#c99a62', N: '#1f1209', W: '#fffaf0' },
    rows: [
      '................',
      '...KKK....KKK...',
      '..KBBBK..KBBBK..',
      '..KBBBKKKKBBBK..',
      '...KBBBBBBBBBK..',
      '..KBBBBBBBBBBBK.',
      '..KBBKBBBBKBBBK.',
      '..KBBBBBBBBBBBK.',
      '..KBBBLLLLBBBBK.',
      '..KBBLLNNLLBBBK.',
      '...KBLLLLLLLBK..',
      '...KBLLWWLLBK...',
      '....KLLWWLLK....',
      '....KKLWWLKK....',
      '.....KKKKKK.....',
      '................',
    ],
  },
  Owl: {
    palette: { D: '#3a2f66', P: '#6b5a9e', C: '#e4dcf5', Y: '#ffd24a', W: '#ffffff', K: '#161025', O: '#f08a24' },
    rows: [
      '................',
      '..DD........DD..',
      '..DPD......DPD..',
      '..DPPDDDDDDPPD..',
      '..DPPPPPPPPPPD..',
      '.DPYYYYPPYYYYPD.',
      '.DPYWWKPPKWWYPD.',
      '.DPYWKKPPKKWYPD.',
      '.DPPYYYOOYYYPPD.',
      '.DPPPPPOOPPPPPD.',
      '.DPPCCCCCCCCPPD.',
      '.DPPCDCDCDCDPPD.',
      '.DPPCCCCCCCCPPD.',
      '..DPPCCCCCCPPD..',
      '...DDDDDDDDDD...',
      '....OO....OO....',
    ],
  },
  Bee: {
    palette: { K: '#2a2214', Y: '#ffcf2e', W: '#e3f1ff', B: '#8fbfe8' },
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
  Octopus: {
    palette: { D: '#8f2236', R: '#d6455d', L: '#f08aa0', W: '#ffffff', K: '#2b0f16' },
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
      '...DRRRRRRRRD...',
      '.DRRDRRDDRRDRRD.',
      'DRR.DRR..RRD.RRD',
      'DR..DR....RD..RD',
      'D...R......R...D',
      '................',
    ],
  },
  Ant: {
    palette: { K: '#2b1a14', A: '#a0452c', W: '#ffffff' },
    rows: [
      '...K........K...',
      '....K......K....',
      '.....K....K.....',
      '....KKKKKKKK....',
      '...KAAAAAAAAK...',
      '..KAAAAAAAAAAK..',
      '..KAWKAAAAKWAK..',
      '..KAAAAAAAAAAK..',
      '...KAAKKKKAAK...',
      '....KKK..KKK....',
      '.....KKKKKK.....',
      '....KAAAAAAK....',
      '..K.KAAAAAAK.K..',
      '.K..KAAAAAAK..K.',
      'K....KAAAAK....K',
      '......KKKK......',
    ],
  },
  Fox: {
    palette: { K: '#201510', O: '#e8731f', W: '#fff3e0' },
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
  Egg: {
    palette: { D: '#7a7368', W: '#f4efe3', H: '#ffffff', S: '#cfc6b0', B: '#b58a5b' },
    rows: [
      '................',
      '.....DDDDDD.....',
      '...DDWWWWWWDD...',
      '..DWHHWWWWWWWD..',
      '.DWHWWWWBWWWWWD.',
      '.DWWWWWWWWWWWSD.',
      '.DWWBWWWWWWWWSD.',
      '.DWWWWWWWWWBWSD.',
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

import type { SceneDef, StateSet } from '../types';
import { twoLane, type ExtraProp } from '../layouts';
import { esc } from '../parts';

// Alcohol and drugs, manual pages 54 (what alcohol does; other drugs), 55 (BAC), 56 (only time lowers BAC) and 57
// (zero tolerance for drivers under 21). The pictures are still diagrams on a plain light background: big word cards
// and simple drawings that appear, and are ringed, while their words are said. Times are in ms and follow the word
// timings in public/audio/card-alcohol-*.json (the word each time is tied to is named next to it). Every number drawn
// ("0.08", "21") is one the card's quote gives, and each is on screen before it is said.

const set = (id: string, state: string, t = 0): StateSet => ({ t, id, state });
const BG = `<rect x="0" y="0" width="300" height="300" fill="#eceff1"/>`;
const DARK = '#212121';
const RED = '#d32f2f';
const GREEN = '#2e7d32';

/** About how wide a bold Arial capital, digit or mark is, in ems (for sizing boxes around text). */
const EM: Record<string, number> = { ' ': 0.28, '.': 0.28, I: 0.28, M: 0.83, W: 0.94, '+': 0.58, '?': 0.61 };
const textW = (s: string, size: number) => [...s].reduce((w, c) => w + (EM[c] ?? (c >= '0' && c <= '9' ? 0.56 : 0.72)), 0) * size;
/** The biggest size, up to `size`, at which every line fits in `w` px. */
const fit = (lines: string[], w: number, size: number) => Math.min(size, ...lines.map((l) => Math.floor((w / textW(l, 1)) * 10) / 10));
/** A word (or a few) in big bold letters on a white box sized to fit them, centered at (x, y). */
const word = (x: number, y: number, s: string, size: number) => {
  const w = Math.round(textW(s, size) + size * 0.7), h = Math.round(size * 1.35);
  return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="8" fill="#fff" stroke="${DARK}" stroke-width="2.5"/>` + txt(x, y + size * 0.04, s, size);
};
/** Bold text centered at (x, y). */
const txt = (x: number, y: number, s: string, size: number, color = DARK) =>
  `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="700" font-size="${size}" fill="${color}">${esc(s)}</text>`;
/** Any drawing as a prop (`highlight` rings it, `hidden` hides it). */
const pic = (id: string, svg: string): ExtraProp => ({ id, svg: `<g class="pic" data-prop="${id}">${svg}</g>` });
/** A drawing made at (0, 0), moved to (x, y) and scaled by k. */
const at = (x: number, y: number, k: number, svg: string) => `<g transform="translate(${x} ${y}) scale(${k})">${svg}</g>`;

interface Box { x: number; y: number; w: number; h: number }
/**
 * A white card with an icon and one or two lines of big text. By default the icon is in the top part (at `iconAt`,
 * relative to the card) and the text below it. With `side`, the icon is centered in a space at the card's left (as
 * wide as the card is tall, or `side` px if it is a number), and the text is centered in the space to its right. The
 * text shrinks from `size` (default 20) to fit.
 */
function card(id: string, b: Box, icon: string, lines: string[], o: { iconAt?: [number, number]; side?: boolean | number; size?: number } = {}): ExtraProp {
  const iconW = o.side === true ? b.h : o.side || 0;
  const room = o.side ? b.w - iconW - 8 : b.w - 12;
  const size = fit(lines, room, o.size ?? 20);
  const lh = size * 1.15;
  const [ix, iy] = o.side ? [iconW / 2 + 4, b.h / 2] : o.iconAt ?? [b.w / 2, (b.h - lines.length * lh) / 2 + 2];
  const tx = b.x + (o.side ? iconW + room / 2 : b.w / 2);
  const ty = b.y + (o.side ? b.h / 2 - ((lines.length - 1) * lh) / 2 : b.h - 10 - size / 2 - (lines.length - 1) * lh);
  return pic(id,
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="#fff" stroke="${DARK}" stroke-width="2.5"/>` +
    at(b.x + ix, b.y + iy, 1, icon) +
    lines.map((l, i) => txt(tx, ty + i * size * 1.15, l, size)).join(''));
}

// ---------------------------------------------------------------------------------------------
// Icons, each drawn around (0, 0) and about 50 px across.

/** A glass of beer: amber, with white foam and a handle. */
const GLASS =
  `<path d="M14 -8 h6 a5 5 0 0 1 5 5 v10 a5 5 0 0 1 -5 5 h-6" fill="none" stroke="${DARK}" stroke-width="4"/>` +
  `<rect x="-14" y="-16" width="28" height="36" rx="3" fill="#ffb300" stroke="${DARK}" stroke-width="2.5"/>` +
  `<path d="M-16 -14 a6 6 0 0 1 6 -8 a7 7 0 0 1 12 -2 a6 6 0 0 1 14 4 v6 z" fill="#fff" stroke="${DARK}" stroke-width="2"/>`;
/** A turtle seen from the side (slow). */
const TURTLE =
  `<rect x="-17" y="4" width="8" height="10" rx="3" fill="#9ccc65" stroke="${DARK}" stroke-width="1.5"/>` +
  `<rect x="9" y="4" width="8" height="10" rx="3" fill="#9ccc65" stroke="${DARK}" stroke-width="1.5"/>` +
  `<circle cx="25" cy="-1" r="7" fill="#9ccc65" stroke="${DARK}" stroke-width="1.5"/><circle cx="27" cy="-3" r="1.6" fill="${DARK}"/>` +
  `<path d="M-24 8 A24 22 0 0 1 24 8 Z" fill="#558b2f" stroke="${DARK}" stroke-width="2"/>` +
  `<path d="M-12 8 L-8 -6 L8 -6 L12 8 M-8 -6 L0 -14 L8 -6" fill="none" stroke="#33691e" stroke-width="2"/>`;
/** An eye, drawn blurry (see less clearly). `blur` is the id of its (document-unique) blur filter. */
const blurryEye = (blur: string) =>
  `<filter id="${blur}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>` +
  `<g filter="url(#${blur})"><path d="M-26 0 Q0 -22 26 0 Q0 22 -26 0 Z" fill="#fff" stroke="${DARK}" stroke-width="2.5"/>` +
  `<circle r="10" fill="#1e88e5"/><circle r="4.5" fill="${DARK}"/>` +
  `<path d="M-20 -1 Q0 -18 20 -1" transform="translate(5 3)" fill="none" stroke="${DARK}" stroke-width="2" opacity="0.5"/></g>`;
/** A car, then a two-headed "how far?" arrow with a big red question mark over it (judge speed and distance). */
const SPEED_DIST =
  `<rect x="-30" y="0" width="22" height="12" rx="3" fill="#90a4ae" stroke="${DARK}" stroke-width="1.5"/>` +
  `<circle cx="-24" cy="13" r="3" fill="${DARK}"/><circle cx="-14" cy="13" r="3" fill="${DARK}"/>` +
  `<line x1="-2" y1="8" x2="26" y2="8" stroke="${DARK}" stroke-width="2.5"/>` +
  `<polygon points="-4,8 3,3 3,13" fill="${DARK}"/><polygon points="28,8 21,3 21,13" fill="${DARK}"/>` +
  txt(12, -10, '?', 26, RED);
/** Two dice (taking chances). */
const die = (x: number, y: number, a: number, dots: [number, number][]) =>
  `<g transform="translate(${x} ${y}) rotate(${a})"><rect x="-11" y="-11" width="22" height="22" rx="4" fill="#fff" stroke="${DARK}" stroke-width="2.5"/>` +
  dots.map(([dx, dy]) => `<circle cx="${dx}" cy="${dy}" r="2.4" fill="${DARK}"/>`).join('') + `</g>`;
const DICE = die(-12, 2, -14, [[-5, -5], [0, 0], [5, 5]]) + die(13, 0, 12, [[-5, -5], [5, -5], [-5, 5], [5, 5]]);
/** A marijuana leaf: seven green leaflets on a stem. */
const LEAF =
  `<line x1="0" y1="12" x2="0" y2="24" stroke="#2e7d32" stroke-width="3"/>` +
  ([[-80, 12], [-52, 18], [-26, 24], [0, 28], [26, 24], [52, 18], [80, 12]] as const)
    .map(([a, l]) => `<ellipse cx="0" cy="${-l / 2}" rx="4.5" ry="${l / 2}" transform="translate(0 12) rotate(${a})" fill="#43a047" stroke="#1b5e20" stroke-width="1.2"/>`).join('');
/** A capsule pill, two colors, at (x, y) turned by a degrees. */
const capsule = (x: number, y: number, a: number, c: string) =>
  `<g transform="translate(${x} ${y}) rotate(${a})"><rect x="-12" y="-5" width="24" height="10" rx="5" fill="#fff" stroke="${DARK}" stroke-width="1.8"/>` +
  `<path d="M0 -5 H7 A5 5 0 0 1 7 5 H0 Z" fill="${c}" stroke="${DARK}" stroke-width="1.8"/></g>`;
/** A few loose capsules (illegal drugs). */
const PILLS = capsule(-10, -8, -25, '#8e24aa') + capsule(10, 4, 20, '#e53935') + capsule(-8, 12, 5, '#ff9800');
/** A medicine bottle from the pharmacy: orange, with a white cap and a white label with a red cross. */
const BOTTLE =
  `<rect x="-13" y="-22" width="26" height="9" rx="2" fill="#fff" stroke="${DARK}" stroke-width="2"/>` +
  `<rect x="-15" y="-13" width="30" height="36" rx="4" fill="#ff9800" stroke="${DARK}" stroke-width="2"/>` +
  `<rect x="-11" y="-5" width="22" height="18" rx="2" fill="#fff"/>` +
  `<path d="M-2 -2 h4 v4 h4 v4 h-4 v4 h-4 v-4 h-4 v-4 h4 z" fill="${RED}"/>`;
/** A clock at about ten past two. */
const CLOCK =
  `<circle r="22" fill="#fff" stroke="${DARK}" stroke-width="3"/>` +
  [0, 90, 180, 270].map((a) => `<line x1="0" y1="-18" x2="0" y2="-14" stroke="${DARK}" stroke-width="2.5" transform="rotate(${a})"/>`).join('') +
  `<line x1="0" y1="0" x2="0" y2="-15" stroke="${DARK}" stroke-width="3" stroke-linecap="round" transform="rotate(60)"/>` +
  `<line x1="0" y1="0" x2="0" y2="-10" stroke="${DARK}" stroke-width="3.5" stroke-linecap="round" transform="rotate(70)"/>` +
  `<circle r="2.5" fill="${DARK}"/>`;
/** A cup of hot coffee, with steam. */
const COFFEE =
  `<path d="M-6 -22 q-4 5 0 10 M4 -22 q-4 5 0 10" fill="none" stroke="#78909c" stroke-width="2.5" stroke-linecap="round"/>` +
  `<path d="M14 -4 h4 a6 6 0 0 1 0 12 h-4" fill="none" stroke="${DARK}" stroke-width="3.5"/>` +
  `<path d="M-16 -8 H16 V10 a8 8 0 0 1 -8 8 H-8 a8 8 0 0 1 -8 -8 Z" fill="#fff" stroke="${DARK}" stroke-width="2.5"/>` +
  `<rect x="-14" y="-6" width="28" height="5" fill="#6d4c41"/>`;
/** A dumbbell (exercise). */
const DUMBBELL =
  `<rect x="-18" y="-2.5" width="36" height="5" fill="#607d8b" stroke="${DARK}" stroke-width="1.5"/>` +
  [-1, 1].map((s) => `<rect x="${s < 0 ? -26 : 16}" y="-13" width="10" height="26" rx="2" fill="#455a64" stroke="${DARK}" stroke-width="2"/>` +
    `<rect x="${s < 0 ? -31 : 26}" y="-8" width="5" height="16" rx="1.5" fill="#455a64" stroke="${DARK}" stroke-width="1.5"/>`).join('');
/** A shower head spraying cold (light blue) water. */
const SHOWER =
  `<path d="M-4 -24 H10 V-16" fill="none" stroke="#78909c" stroke-width="4"/>` +
  `<path d="M-6 -12 A12 8 0 0 1 18 -12 Z" transform="translate(-6 0)" fill="#90a4ae" stroke="${DARK}" stroke-width="2"/>` +
  [-14, -6, 2, 10, 18].map((x, i) => `<line x1="${x - 6}" y1="${-8 + (i % 2) * 5}" x2="${x - 8}" y2="${6 + (i % 2) * 5}" stroke="#29b6f6" stroke-width="3" stroke-linecap="round"/>`).join('') +
  [-12, 4, 16].map((x) => `<line x1="${x - 7}" y1="14" x2="${x - 8}" y2="20" stroke="#29b6f6" stroke-width="3" stroke-linecap="round"/>`).join('');
/** A red drop of blood. */
const DROP = `<path d="M0 -18 C8 -6 14 2 14 8 A14 14 0 0 1 -14 8 C-14 2 -8 -6 0 -18 Z" fill="${RED}" stroke="${DARK}" stroke-width="2"/>` +
  `<path d="M-6 6 a6 6 0 0 0 4 6" fill="none" stroke="#ffcdd2" stroke-width="2.5" stroke-linecap="round"/>`;
/** A small grey car seen from the side. */
const SIDE_CAR =
  `<path d="M-22 4 V-2 L-12 -4 L-6 -12 H8 L14 -4 L22 -2 V4 Z" fill="#90a4ae" stroke="${DARK}" stroke-width="2"/>` +
  `<circle cx="-12" cy="5" r="5" fill="${DARK}"/><circle cx="12" cy="5" r="5" fill="${DARK}"/>`;
/** A thick red circle with a slash across it, over `inside` ("no ..."). */
const noSign = (inside: string, r = 30) =>
  `<circle r="${r}" fill="#fff"/>` + inside +
  `<circle r="${r}" fill="none" stroke="${RED}" stroke-width="6"/>` +
  `<line x1="${-r * 0.7}" y1="${-r * 0.7}" x2="${r * 0.7}" y2="${r * 0.7}" stroke="${RED}" stroke-width="6"/>`;
/** A big green check mark and a big red X, each in a circle (for "this works" / "this does not"). */
const CHECK = `<circle r="17" fill="${GREEN}" stroke="#fff" stroke-width="3"/><path d="M-8 0 L-2 7 L9 -7" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
const CROSS = `<circle r="17" fill="${RED}" stroke="#fff" stroke-width="3"/><path d="M-7 -7 L7 7 M7 -7 L-7 7" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;

/** A scene of still props on the light background, with a `teach` step and a `question` still. */
function stillScene(id: string, props: ExtraProp[], hidden: ExtraProp[], teach: { ms: number; states: StateSet[] }, question: StateSet[]): SceneDef {
  return {
    id, width: 300, height: 300,
    background: BG + props.map((p) => p.svg).join(''),
    lanes: [], zones: [], lines: [], props: props.map((p) => p.id), actors: [],
    initialStates: Object.fromEntries(hidden.map((p) => [p.id, 'hidden'])),
    steps: [
      { id: 'teach', duration: teach.ms, states: teach.states },
      { id: 'question', duration: 500, states: question },
    ],
  };
}
/** Show a prop ringed from `on`, and stop ringing it (still shown) at `off`. */
const ringFrom = (id: string, [on, off]: readonly [number, number]) => [set(id, 'highlight', on), set(id, '', off)];

// ---------------------------------------------------------------------------------------------
// 1. What alcohol does (card alcohol-effects). "ALCOHOL" and a glass at the top, ringed while the first sentence is
// said. Then four cards appear one at a time, each on the first word of its sentence and ringed while it is said:
// a turtle ("react more slowly"), a blurry eye ("do not see as clearly"), a car and a "how far?" arrow with a question
// mark ("judge speed and distance wrong") and dice ("take more chances"). The question picture has only the title.
// Clip: "Alcohol makes your driving skills weaker." 111–2472, "You react more slowly." 2930–4235,
// "You do not see as clearly." 4694–6111, "You judge speed and distance wrong." 6569–8457,
// "You take more chances." 8916–10054.
export const EFFECTS_T = { title: [111, 2472], react: [2930, 4235], see: [4694, 6111], judge: [6569, 8457], chances: [8916, 10054], ms: 10500 } as const;
const E_TITLE = pic('title', at(52, 34, 1, GLASS) + word(172, 34, 'ALCOHOL', 34));
const tile = (col: number, row: number, top = 70): Box => ({ x: col ? 155 : 10, y: row ? (top + 290) / 2 + 3 : top, w: 135, h: (290 - top) / 2 - 3 });
/** An icon 1.35 times its drawn size. */
const big = (icon: string) => at(0, 0, 1.35, icon);
const E_TILES = [
  card('react', tile(0, 0), big(TURTLE), ['REACT', 'SLOWLY']),
  card('see', tile(1, 0), big(blurryEye('alcohol-effects-blur')), ['SEE LESS', 'CLEARLY']),
  card('judge', tile(0, 1), big(SPEED_DIST), ['SPEED?', 'DISTANCE?']),
  card('chances', tile(1, 1), big(DICE), ['TAKE MORE', 'CHANCES']),
];
const [E_REACT, E_SEE, E_JUDGE, E_CHANCES] = E_TILES;

export const alcoholEffects = stillScene('alcohol-effects', [E_TITLE, ...E_TILES], E_TILES,
  {
    ms: EFFECTS_T.ms,
    states: [
      ...ringFrom(E_TITLE.id, EFFECTS_T.title),
      ...ringFrom(E_REACT.id, EFFECTS_T.react), ...ringFrom(E_SEE.id, EFFECTS_T.see),
      ...ringFrom(E_JUDGE.id, EFFECTS_T.judge), ...ringFrom(E_CHANCES.id, EFFECTS_T.chances),
    ],
  },
  [set(E_TITLE.id, ''), ...E_TILES.map((p) => set(p.id, 'hidden'))]);

// ---------------------------------------------------------------------------------------------
// 2. Drugs (card alcohol-drugs). "DRUGS" at the top, ringed while the first sentence is said. Then four wide cards,
// one under another, each appearing ringed on its word: a leaf, "MARIJUANA" ("marijuana"); loose pills, "ILLEGAL
// DRUGS" ("illegal drugs"); a medicine bottle, "SOME MEDICINES" / "FROM A DOCTOR" (from "some"); and last a glass +
// pills, "ALCOHOL + DRUGS" / "EVEN WORSE", ringed from "Alcohol" to the end. (The question about drugs uses the road picture, so no teach card gives it away.)
// Clip: "Drugs can make your driving unsafe too." 97–2444, "This includes" 2916–3527, "marijuana," 3541–4249,
// "illegal drugs," 4500–5443, "and some medicines from a doctor." 5680–7235 ("some" 5805),
// "Alcohol and drugs together are even worse." 7694–10679.
export const DRUGS_T = { title: [97, 2444], leaf: [3541, 4249], pills: [4500, 5443], bottle: [5805, 7235], both: 7694, ms: 11100 } as const;
const D_TITLE = pic('title', word(150, 34, 'DRUGS', 36));
/** Four wide cards, one under another, below the title. */
const row = (i: number): Box => ({ x: 10, y: 64 + i * 57, w: 280, h: 52 });
const D_ICON_W = 96;
const D_LEAF = card('leaf', row(0), at(0, 0, 1.05, LEAF), ['MARIJUANA'], { side: D_ICON_W, size: 26 });
const D_PILLS = card('pills', row(1), at(0, 0, 1.05, PILLS), ['ILLEGAL DRUGS'], { side: D_ICON_W, size: 26 });
const D_BOTTLE = card('bottle', row(2), at(0, 0, 0.95, BOTTLE), ['SOME MEDICINES', 'FROM A DOCTOR'], { side: D_ICON_W, size: 20 });
const D_BOTH = card('both', row(3),
  at(-24, 0, 0.72, GLASS) + txt(2, 2, '+', 26) + at(28, 0, 0.8, PILLS), ['ALCOHOL + DRUGS', 'EVEN WORSE'], { side: D_ICON_W, size: 20 });
const D_CARDS = [D_LEAF, D_PILLS, D_BOTTLE, D_BOTH];

export const alcoholDrugs = stillScene('alcohol-drugs', [D_TITLE, ...D_CARDS], D_CARDS,
  {
    ms: DRUGS_T.ms,
    states: [
      ...ringFrom(D_TITLE.id, DRUGS_T.title),
      ...ringFrom(D_LEAF.id, DRUGS_T.leaf), ...ringFrom(D_PILLS.id, DRUGS_T.pills), ...ringFrom(D_BOTTLE.id, DRUGS_T.bottle),
      set(D_BOTH.id, 'highlight', DRUGS_T.both),
    ],
  },
  [set(D_TITLE.id, ''), ...D_CARDS.map((p) => set(p.id, 'hidden'))]);

// ---------------------------------------------------------------------------------------------
// 3. BAC (card alcohol-bac). A big "BAC" card, ringed while the first sentence is said, with "ALCOHOL IN YOUR BLOOD"
// and a drop of blood under it from "means". On "A" (before "0.08", whose timing is long), a big "0.08 OR MORE" card
// appears, ringed until "more" ends; then an arrow down to a big "DRUNK" card, ringed from "shows" to the end.
// The question picture shows "BAC", its meaning and "0.08 OR MORE", but not "DRUNK".
// Clip: "B.A.C." 111–513, "means how much alcohol is in your blood." 527–2499, "A B.A.C. of 0.08 or more" 2944–5694,
// "shows that a driver is drunk." 5708–7486.
export const BAC_T = { bac: [111, 2499], means: 527, limit: [2944, 5694], drunk: 5708, ms: 8000 } as const;
const B_BAC = pic('bac', word(150, 40, 'BAC', 50));
const B_MEANS = card('means', { x: 30, y: 80, w: 240, h: 64 }, at(0, 3, 0.9, DROP), ['ALCOHOL IN', 'YOUR BLOOD'], { side: true, size: 22 });
const B_LIMIT = pic('limit', word(150, 180, '0.08 OR MORE', 36));
const B_DRUNK = pic('drunk',
  `<line x1="150" y1="206" x2="150" y2="224" stroke="${DARK}" stroke-width="5"/><polygon points="139,222 161,222 150,236" fill="${DARK}"/>` +
  word(150, 264, 'DRUNK', 40));

export const alcoholBac = stillScene('alcohol-bac', [B_BAC, B_MEANS, B_LIMIT, B_DRUNK], [B_MEANS, B_LIMIT, B_DRUNK],
  {
    ms: BAC_T.ms,
    states: [
      ...ringFrom(B_BAC.id, BAC_T.bac), set(B_MEANS.id, '', BAC_T.means),
      ...ringFrom(B_LIMIT.id, BAC_T.limit), set(B_DRUNK.id, 'highlight', BAC_T.drunk),
    ],
  },
  [set(B_BAC.id, ''), set(B_MEANS.id, ''), set(B_LIMIT.id, ''), set(B_DRUNK.id, 'hidden')]);

// ---------------------------------------------------------------------------------------------
// 4. Only time lowers BAC (card alcohol-time). Four cards, all shown from the start: a clock (TIME), coffee, a
// dumbbell (EXERCISE) and a cold shower. On "time" the clock is ringed and gets a green check; then coffee, exercise
// and the cold shower are each ringed on their word and get a red X that stays. The question picture is the four
// cards with no marks.
// Clip: "Only time lowers the alcohol in your blood." 111–2527 ("time" 375), "Coffee," 2986–3486,
// "exercise," 3722–4541, "and cold showers" 4722–5694 ("cold" 4888), "do not lower it." 5708–6568.
export const TIME_T = { time: [375, 2527], coffee: [2986, 3722], exercise: [3722, 4722], shower: [4888, 5708], ms: 7000 } as const;
const T_TILES = [tile(0, 0, 10), tile(1, 0, 10), tile(0, 1, 10), tile(1, 1, 10)];
const T_CARDS = [
  card('time', T_TILES[0], at(0, 0, 1.6, CLOCK), ['TIME']),
  card('coffee', T_TILES[1], at(0, 0, 1.6, COFFEE), ['COFFEE']),
  card('exercise', T_TILES[2], at(0, 0, 1.6, DUMBBELL), ['EXERCISE']),
  card('shower', T_TILES[3], at(0, 0, 1.6, SHOWER), ['COLD SHOWER']),
];
/** The mark on each card, at its top-right corner. */
const mark = (id: string, b: Box, svg: string) => pic(`${id}-mark`, at(b.x + b.w - 22, b.y + 22, 1, svg));
const T_MARKS = T_CARDS.map((c, i) => mark(c.id, T_TILES[i], i === 0 ? CHECK : CROSS));
const [T_TIME, T_COFFEE, T_EXERCISE, T_SHOWER] = T_CARDS;
const markOn = (i: number, t: number) => set(T_MARKS[i].id, '', t);

export const alcoholTime = stillScene('alcohol-time', [...T_CARDS, ...T_MARKS], T_MARKS,
  {
    ms: TIME_T.ms,
    states: [
      ...ringFrom(T_TIME.id, TIME_T.time), markOn(0, TIME_T.time[0]),
      ...ringFrom(T_COFFEE.id, TIME_T.coffee), markOn(1, TIME_T.coffee[0]),
      ...ringFrom(T_EXERCISE.id, TIME_T.exercise), markOn(2, TIME_T.exercise[0]),
      ...ringFrom(T_SHOWER.id, TIME_T.shower), markOn(3, TIME_T.shower[0]),
    ],
  },
  [...T_CARDS.map((c) => set(c.id, '')), ...T_MARKS.map((m) => set(m.id, 'hidden'))]);

// ---------------------------------------------------------------------------------------------
// 5. Under 21 (card alcohol-under-21). A big "UNDER 21" card, ringed while "You are under 21" is said. Then a card with
// a drop of blood, "NO ALCOHOL" / "IN YOUR BLOOD", ringed from "You may not" to "find."; then a card with a glass and
// a car in a red "no" circle, "NEVER DRIVE" / "AFTER DRINKING", ringed from just after "find." ("Never" and "drive"
// get no timing) to the end. The question picture has only "UNDER 21".
// Clip: "You are under 21." 111–1208, "You may not drive with any alcohol in your blood that a test can find."
// 1666–5569, "Never drive after drinking." (about 5900)–7374 ("after" 6638).
export const UNDER21_T = { under: [111, 1208], none: [1666, 5569], never: 5800, ms: 7800 } as const;
const U_UNDER = pic('under-21', word(150, 40, 'UNDER 21', 48));
const wide = (y: number): Box => ({ x: 10, y, w: 280, h: 98 });
const U_NONE = card('no-alcohol', wide(86), at(0, 4, 1.5, DROP), ['NO ALCOHOL', 'IN YOUR BLOOD'], { side: true, size: 24 });
const U_NEVER = card('never', wide(192), noSign(at(-13, -11, 0.85, GLASS) + at(13, 17, 0.9, SIDE_CAR), 42), ['NEVER DRIVE', 'AFTER DRINKING'], { side: true, size: 24 });

export const alcoholUnder21 = stillScene('alcohol-under-21', [U_UNDER, U_NONE, U_NEVER], [U_NONE, U_NEVER],
  {
    ms: UNDER21_T.ms,
    states: [...ringFrom(U_UNDER.id, UNDER21_T.under), ...ringFrom(U_NONE.id, UNDER21_T.none), set(U_NEVER.id, 'highlight', UNDER21_T.never)],
  },
  [set(U_UNDER.id, ''), set(U_NONE.id, 'hidden'), set(U_NEVER.id, 'hidden')]);

// ---------------------------------------------------------------------------------------------
// 6. A plain road with blue driving along it, for the question about which things can make driving unsafe (no word
// or drawing on it gives the answer away).
export const alcoholRoad: SceneDef = {
  id: 'alcohol-road', width: 300, height: 300,
  ...twoLane(),
  actors: [{ id: 'blue', kind: 'car', you: true, start: { x: 150, y: 170, heading: 90 } }],
  steps: [{ id: 'question', duration: 500 }],
};

export const alcoholScenes: SceneDef[] = [alcoholEffects, alcoholDrugs, alcoholBac, alcoholTime, alcoholUnder21, alcoholRoad];

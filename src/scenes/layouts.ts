import type { ActorKind, Lane, Pose, SceneDef, StopLine, Zone } from './types';
import { SIZES } from './engine';
import { grass, line, road, sign, stopBar, trafficLight, yieldTeeth, COLORS, type SignKind, type SignOpts } from './parts';

export type Dir = 'nb' | 'sb' | 'eb' | 'wb';
export type Control = 'stop' | 'yield' | 'light';

/**
 * Standard 300×300 four-way intersection.
 * Horizontal road y 120–180, vertical road x 120–180, junction box 120–180 both ways.
 * Lane centers: nb x=165, sb x=135, eb y=165, wb y=135 (US right-hand traffic).
 */
const LINE: Record<Dir, StopLine> = {
  nb: { id: 'line-nb', x: 165, y: 188, heading: 0 },
  sb: { id: 'line-sb', x: 135, y: 112, heading: 180 },
  eb: { id: 'line-eb', x: 112, y: 165, heading: 90 },
  wb: { id: 'line-wb', x: 188, y: 135, heading: 270 },
};
const BAR: Record<Dir, [number, number, number, number]> = {
  nb: [150, 186, 180, 186], sb: [120, 114, 150, 114], eb: [114, 150, 114, 180], wb: [186, 120, 186, 150],
};
const TEETH: Record<Dir, { seg: [number, number, number, number]; point: 'up' | 'down' | 'left' | 'right' }> = {
  nb: { seg: [151, 186, 179, 186], point: 'down' },
  sb: { seg: [121, 114, 149, 114], point: 'up' },
  eb: { seg: [114, 151, 114, 179], point: 'left' },
  wb: { seg: [186, 121, 186, 149], point: 'right' },
};
/** On the grass, to the right of each approach, just before the junction. */
const SIGN_POS: Record<Dir, [number, number]> = { nb: [198, 208], sb: [102, 92], eb: [92, 198], wb: [208, 102] };

/**
 * Crosswalk mode (`fourWay({ crosswalks: true })`): each approach gets a crosswalk (two parallel white
 * lines across the road, as the manual describes, 5.5 px wide) 4 and 24 px outside the junction. Its stop
 * bar (drawn 8 px thick, so it is clearly the thickest line) and yield teeth move 31 px further out,
 * behind the crosswalk, and its `line-*` stop line moves 34 px out, to the bar's outer edge.
 * An extra `crosswalk-*` stop line sits just outside each crosswalk, for "no stop line" pictures.
 */
const CW_BAR_SHIFT = 31;
const CW_LINE_SHIFT = 34;
const CW_BAR_W = 8;
const CROSSWALK_AT = [4, 24];
const CROSSWALK_W = 5.5;
const CROSSWALK_STOP = 29;
const DIRS: Dir[] = ['nb', 'sb', 'eb', 'wb'];
/** Unit vector pointing away from the junction along approach `d` (toward where its traffic comes from). */
const OUT: Record<Dir, [number, number]> = { nb: [0, 1], sb: [0, -1], eb: [-1, 0], wb: [1, 0] };
const shiftLine = (l: StopLine, d: Dir, by: number): StopLine => ({ ...l, x: l.x + OUT[d][0] * by, y: l.y + OUT[d][1] * by });
const shiftSeg = (s: [number, number, number, number], d: Dir, by: number): [number, number, number, number] =>
  [s[0] + OUT[d][0] * by, s[1] + OUT[d][1] * by, s[2] + OUT[d][0] * by, s[3] + OUT[d][1] * by];
/** Point on approach `d`'s lane center, `dist` px outside the junction edge. */
function outside(d: Dir, dist: number): { x: number; y: number } {
  const ex = d === 'eb' ? 120 : d === 'wb' ? 180 : LINE[d].x;
  const ey = d === 'nb' ? 180 : d === 'sb' ? 120 : LINE[d].y;
  return { x: ex + OUT[d][0] * dist, y: ey + OUT[d][1] * dist };
}
function crosswalkLine(d: Dir): StopLine {
  return { id: `crosswalk-${d}`, ...outside(d, CROSSWALK_STOP), heading: LINE[d].heading };
}

export const FOURWAY = {
  start: {
    nb: { x: 165, y: 340, heading: 0 }, sb: { x: 135, y: -40, heading: 180 },
    eb: { x: -40, y: 165, heading: 90 }, wb: { x: 340, y: 135, heading: 270 },
  } as Record<Dir, Pose>,
  exit: {
    nb: { x: 165, y: -40, heading: 0 }, sb: { x: 135, y: 340, heading: 180 },
    eb: { x: 340, y: 165, heading: 90 }, wb: { x: -40, y: 135, heading: 270 },
  } as Record<Dir, Pose>,
  lineId: (d: Dir) => LINE[d].id,
  signId: (d: Dir) => `sign-${d}`,
  lightId: (d: Dir) => `light-${d}`,
  /** Crosswalk mode only: the stop bar / yield teeth prop (state `hidden` shows a crosswalk with no stop line). */
  barId: (d: Dir) => `bar-${d}`,
  /** Crosswalk mode only: the crosswalk prop on approach `d` (state `highlight` makes it glow). */
  crosswalkId: (d: Dir) => `walk-${d}`,
  /** Crosswalk mode only: the stop line just outside the crosswalk. */
  crosswalkLineId: (d: Dir) => `crosswalk-${d}`,
};

export interface StopPoseOpts {
  /** Match a `fourWay({ crosswalks: true })` layout. */
  crosswalks?: boolean;
  /** With crosswalks: stop behind the stop bar (`'line'`, the default) or just before the crosswalk. */
  before?: 'line' | 'crosswalk';
}

/** Pose with the vehicle's front 4px behind the stop/yield line of approach `dir` (or its crosswalk). */
export function stopPose(dir: Dir, kind: ActorKind = 'car', opts: StopPoseOpts = {}): Pose {
  const half = SIZES[kind].length / 2 + 4;
  const l = !opts.crosswalks ? LINE[dir] : opts.before === 'crosswalk' ? crosswalkLine(dir) : shiftLine(LINE[dir], dir, CW_LINE_SHIFT);
  switch (dir) {
    case 'nb': return { x: 165, y: l.y + half, heading: 0 };
    case 'sb': return { x: 135, y: l.y - half, heading: 180 };
    case 'eb': return { x: l.x - half, y: 165, heading: 90 };
    case 'wb': return { x: l.x + half, y: 135, heading: 270 };
  }
}

export interface Layout { background: string; lanes: Lane[]; zones: Zone[]; lines: StopLine[]; props: string[] }

/**
 * `crosswalks` (default off) draws a crosswalk on every approach and moves the stop lines behind them
 * (see the crosswalk-mode notes above). Use `stopPose(dir, kind, { crosswalks: true })` with it.
 */
export function fourWay(opts: { controls?: Partial<Record<Dir, Control>>; crosswalks?: boolean } = {}): Layout {
  const cw = !!opts.crosswalks;
  const shift = cw ? CW_BAR_SHIFT : 0;
  const barW = cw ? CW_BAR_W : 4;
  let bg = grass(300, 300) + road(0, 120, 300, 60) + road(120, 0, 60, 300);
  const y = { color: COLORS.yellow, dash: true };
  // In crosswalk mode the center lines stop short of the crosswalks.
  const gap = cw ? CROSSWALK_AT[1] + CROSSWALK_W / 2 + 2 : 0;
  bg += line(150, 0, 150, 120 - gap, y) + line(150, 180 + gap, 150, 300, y) + line(0, 150, 120 - gap, 150, y) + line(180 + gap, 150, 300, 150, y);
  const props: string[] = [];
  let lines: StopLine[] = Object.values(LINE);
  if (cw) {
    lines = [];
    for (const d of DIRS) {
      let walk = '';
      for (const at of CROSSWALK_AT) {
        const p = outside(d, at);
        walk += d === 'nb' || d === 'sb' ? line(120, p.y, 180, p.y, { width: CROSSWALK_W }) : line(p.x, 120, p.x, 180, { width: CROSSWALK_W });
      }
      bg += `<g class="marking" data-prop="${FOURWAY.crosswalkId(d)}">${walk}</g>`;
      props.push(FOURWAY.crosswalkId(d));
      lines.push(shiftLine(LINE[d], d, CW_LINE_SHIFT), crosswalkLine(d));
    }
  }
  // In crosswalk mode each bar is its own prop, so a scene can hide it.
  const bar = (d: Dir, svg: string) => {
    if (!cw) return svg;
    props.push(FOURWAY.barId(d));
    return `<g class="marking" data-prop="${FOURWAY.barId(d)}">${svg}</g>`;
  };
  for (const [d, c] of Object.entries(opts.controls ?? {}) as [Dir, Control][]) {
    const [sx, sy] = SIGN_POS[d];
    if (c === 'stop') { bg += bar(d, stopBar(...shiftSeg(BAR[d], d, shift), barW)) + sign('stop', sx, sy, { id: FOURWAY.signId(d) }); props.push(FOURWAY.signId(d)); }
    if (c === 'yield') { bg += bar(d, yieldTeeth(...shiftSeg(TEETH[d].seg, d, shift), TEETH[d].point)) + sign('yield', sx, sy, { id: FOURWAY.signId(d) }); props.push(FOURWAY.signId(d)); }
    if (c === 'light') { bg += bar(d, stopBar(...shiftSeg(BAR[d], d, shift), barW)) + trafficLight(FOURWAY.lightId(d), sx, sy); props.push(FOURWAY.lightId(d)); }
  }
  return {
    background: bg,
    lanes: [
      { id: 'nb', x: 150, y: -100, w: 30, h: 500, heading: 0 },
      { id: 'sb', x: 120, y: -100, w: 30, h: 500, heading: 180 },
      { id: 'eb', x: -100, y: 150, w: 500, h: 30, heading: 90 },
      { id: 'wb', x: -100, y: 120, w: 500, h: 30, heading: 270 },
    ],
    zones: [{ id: 'junction', x: 120, y: 120, w: 60, h: 60 }],
    lines,
    props,
  };
}

export type CenterLine = 'broken-yellow' | 'solid-yellow' | 'double-yellow' | 'solid-and-broken';

/** Road markings on straight roads: thick, with long dashes, so "broken" and "solid" are easy to tell apart. */
const MARK_W = 4;
const MARK_DASH = '18 12';
/** Offset of each line of a pair (double / solid-and-broken) from y 150, leaving a clear gap between them. */
const PAIR = 3.5;

/**
 * Standard 300×300 two-lane road, running left–right.
 * Road y 110–190. Eastbound lane y 150–190 (center 170); westbound lane y 110–150 (center 130).
 * `center` picks the yellow center line at y 150 (default `broken-yellow`). For `solid-and-broken`,
 * the solid line is on the eastbound side (y 153.5) and the broken line on the westbound side (y 146.5).
 * The center line is the prop `center-line`. Don't give it `highlight`: the white glow makes yellow lines look white.
 */
export const TWOLANE = {
  start: { eb: { x: -40, y: 170, heading: 90 }, wb: { x: 340, y: 130, heading: 270 } } as Record<'eb' | 'wb', Pose>,
  exit: { eb: { x: 340, y: 170, heading: 90 }, wb: { x: -40, y: 130, heading: 270 } } as Record<'eb' | 'wb', Pose>,
  centerId: 'center-line',
};

export function twoLane(opts: { center?: CenterLine } = {}): Layout {
  const center = opts.center ?? 'broken-yellow';
  const y = (at: number, broken: boolean) => line(0, at, 300, at, { color: COLORS.yellow, width: MARK_W, dash: broken ? MARK_DASH : false });
  const marks =
    center === 'broken-yellow' ? y(150, true) :
    center === 'solid-yellow' ? y(150, false) :
    center === 'double-yellow' ? y(150 - PAIR, false) + y(150 + PAIR, false) :
    y(150 + PAIR, false) + y(150 - PAIR, true);
  return {
    background: grass(300, 300) + road(0, 110, 300, 80) + `<g class="marking" data-prop="${TWOLANE.centerId}">${marks}</g>`,
    lanes: [
      { id: 'eb', x: -100, y: 150, w: 500, h: 40, heading: 90 },
      { id: 'wb', x: -100, y: 110, w: 500, h: 40, heading: 270 },
    ],
    zones: [], lines: [], props: [TWOLANE.centerId],
  };
}

/**
 * 300×300 road with two lanes both going east (right), split by a broken white lane line at y 150.
 * Same size as `twoLane()`: right lane `eb-right` y 150–190 (center 170), left lane `eb-left` y 110–150 (center 130).
 * The lane line is the prop `lane-line` (state `highlight` gives it a white glow).
 */
export const SAMEWAY = {
  start: { right: { x: -40, y: 170, heading: 90 }, left: { x: -40, y: 130, heading: 90 } } as Record<'right' | 'left', Pose>,
  exit: { right: { x: 340, y: 170, heading: 90 }, left: { x: 340, y: 130, heading: 90 } } as Record<'right' | 'left', Pose>,
  laneLineId: 'lane-line',
};

export function sameWay(): Layout {
  return {
    background: grass(300, 300) + road(0, 110, 300, 80) +
      `<g class="marking" data-prop="${SAMEWAY.laneLineId}">${line(0, 150, 300, 150, { width: MARK_W, dash: MARK_DASH })}</g>`,
    lanes: [
      { id: 'eb-right', x: -100, y: 150, w: 500, h: 40, heading: 90 },
      { id: 'eb-left', x: -100, y: 110, w: 500, h: 40, heading: 90 },
    ],
    zones: [], lines: [], props: [SAMEWAY.laneLineId],
  };
}

/** Plain light backdrop used behind sign close-ups. */
const CLOSEUP_BG = `<rect x="0" y="0" width="300" height="300" fill="#eceff1"/>`;

/** Still steps for a close-up: `show` (500 ms, for questions) plus an optional `teach` step for a card's narration. */
function closeupSteps(teachMs?: number): SceneDef['steps'] {
  return teachMs ? [{ id: 'show', duration: 500 }, { id: 'teach', duration: teachMs }] : [{ id: 'show', duration: 500 }];
}

/**
 * A single large sign on a plain background, for "what does this sign mean?" questions.
 * Pass `teachMs` to add a `teach` still step sized to a card's narration clip.
 */
export function signCloseup(
  id: string, kind: SignKind,
  opts: Omit<SignOpts, 'size' | 'post' | 'id'> & { teachMs?: number } = {},
): SceneDef {
  const { teachMs, ...signOpts } = opts;
  return {
    id, width: 300, height: 300,
    background: CLOSEUP_BG + sign(kind, 150, 150, { ...signOpts, size: 170, post: false }),
    lanes: [], zones: [], lines: [], props: [], actors: [],
    steps: closeupSteps(teachMs),
  };
}

export interface PairSign { kind: SignKind; text?: string }

/** Two signs side by side on the close-up background, with a single `teach` still step of `teachMs`. */
export function signPair(id: string, left: PairSign, right: PairSign, teachMs: number): SceneDef {
  const one = (p: PairSign, x: number) => sign(p.kind, x, 150, { size: 120, post: false, ...(p.text ? { text: p.text } : {}) });
  return {
    id, width: 300, height: 300,
    background: CLOSEUP_BG + one(left, 80) + one(right, 220),
    lanes: [], zones: [], lines: [], props: [], actors: [],
    steps: [{ id: 'teach', duration: teachMs }],
  };
}

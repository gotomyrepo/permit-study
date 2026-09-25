import type { ActorKind, Lane, Pose, SceneDef, StopLine, Zone } from './types';
import { SIZES } from './engine';
import { dir } from './geometry';
import { turnControl } from './paths';
import { doubleYellow, grass, hydrant as drawHydrant, label, line, measure, road, sign, stopBar, trafficLight, yieldTeeth, COLORS, type SignKind, type SignOpts } from './parts';

export type Dir = 'nb' | 'sb' | 'eb' | 'wb';
export type Control = 'stop' | 'yield' | 'light';

/** Junction box edges: both roads run from BOX.min to BOX.max (60 px wide), centered on BOX.mid. */
const BOX = { min: 120, max: 180, mid: 150, size: 60 };
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
  /**
   * Crosswalk mode only: a lane (`heading: 'any'`) for people walking across approach `d`'s crosswalk.
   * It covers the crosswalk band and 30 px of grass on each side of the road. Add it with `withExtras`.
   */
  walkLane: (d: Dir): Lane => ({ id: `walk-lane-${d}`, ...walkBand(d, 30), heading: 'any' }),
  /** Crosswalk mode only: a zone over the part of approach `d`'s crosswalk that is on the road (for `entersAfter`). */
  walkZone: (d: Dir): Zone => ({ id: `walk-zone-${d}`, ...walkBand(d, 0) }),
  /** Junction box edges: both roads run from `box.min` to `box.max`. */
  box: BOX,
};

/** Rectangle over approach `d`'s crosswalk band, reaching `extra` px past each side of the road. */
export function walkBand(d: Dir, extra: number): { x: number; y: number; w: number; h: number } {
  const a = outside(d, CROSSWALK_AT[0]), b = outside(d, CROSSWALK_AT[1]);
  const half = CROSSWALK_W / 2;
  if (d === 'nb' || d === 'sb') {
    const y = Math.min(a.y, b.y) - half;
    return { x: BOX.min - extra, y, w: BOX.size + 2 * extra, h: Math.abs(a.y - b.y) + 2 * half };
  }
  const x = Math.min(a.x, b.x) - half;
  return { x, y: BOX.min - extra, w: Math.abs(a.x - b.x) + 2 * half, h: BOX.size + 2 * extra };
}

export interface StopPoseOpts {
  /** Match a `fourWay({ crosswalks: true })` layout (implied by `before: 'crosswalk'`). */
  crosswalks?: boolean;
  /** With crosswalks: stop behind the stop bar (`'line'`, the default) or just before the crosswalk. */
  before?: 'line' | 'crosswalk';
}

/** Pose with the vehicle's front 4px behind the stop/yield line of approach `dir` (or its crosswalk). */
export function stopPose(dir: Dir, kind: ActorKind = 'car', opts: StopPoseOpts = {}): Pose {
  const half = SIZES[kind].length / 2 + 4;
  const cw = opts.crosswalks || opts.before === 'crosswalk';
  const l = !cw ? LINE[dir] : opts.before === 'crosswalk' ? crosswalkLine(dir) : shiftLine(LINE[dir], dir, CW_LINE_SHIFT);
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

/**
 * A prop to add with `LayoutExtras`. `parts` names pieces inside it that are props of their own (their svg carries
 * their own `data-prop`), each with the state it starts in, e.g. a `trafficLightProp`'s lamps. `withExtras` lists
 * them as props right after `id`; put `partStates(props)` in the scene's `initialStates` so they start in that state.
 */
export interface ExtraProp { id: string; svg: string; parts?: Record<string, string> }

/** The starting states of every prop's `parts`, for a scene's `initialStates`. */
export function partStates(props: ExtraProp[]): Record<string, string> {
  return Object.assign({}, ...props.map((p) => p.parts ?? {}));
}

/**
 * Extra things a lesson can add to any layout: props drawn on top of the road (under the cars, e.g. a sign or a
 * `planArrow`), lanes (e.g. `FOURWAY.walkLane`), zones, and stop lines for `stopsBehind`.
 */
export interface LayoutExtras {
  props?: ExtraProp[];
  lanes?: Lane[];
  zones?: Zone[];
  lines?: StopLine[];
}

/**
 * The one way to add `LayoutExtras` to a layout. Each prop's svg is appended to the background and its id to `props`,
 * so steps can set its state. `twoLane()` and `sameWay()` take the same extras as options and use this.
 */
export function withExtras(base: Layout, o: LayoutExtras): Layout {
  return {
    background: base.background + (o.props ?? []).map((p) => p.svg).join(''),
    lanes: [...base.lanes, ...(o.lanes ?? [])],
    zones: [...base.zones, ...(o.zones ?? [])],
    lines: [...base.lines, ...(o.lines ?? [])],
    props: [...base.props, ...(o.props ?? []).flatMap((p) => [p.id, ...Object.keys(p.parts ?? {})])],
  };
}

/**
 * "Where this car will go" arrow: a thick line in the car's `color` with a dark edge and an arrowhead,
 * from `from` to `to`. If the headings differ it follows the same curve as `turnPath(from, to)`.
 * It is a prop: give it state `hidden` to hide it (e.g. set `hidden` in `initialStates` and '' in a question step).
 * Pass `via` to bend it through a middle pose (two `turnPath`-style curves), e.g. `uTurnApex(from, to)` for a U-turn.
 */
export function planArrow(id: string, from: Pose, to: Pose, color: string, via?: Pose): ExtraProp {
  const d = dir(to.heading);
  const r = { x: -d.y, y: d.x };
  const tip = { x: to.x + d.x * 10, y: to.y + d.y * 10 };
  const f = (v: number) => +v.toFixed(2);
  const q = (a: Pose, b: Pose) => { const c = turnControl(a, b); return ` Q${f(c.x)} ${f(c.y)} ${f(b.x)} ${f(b.y)}`; };
  const path = `M${f(from.x)} ${f(from.y)}` + (via ? q(from, via) + q(via, to) : q(from, to));
  const head = `${f(tip.x)},${f(tip.y)} ${f(to.x + r.x * 8)},${f(to.y + r.y * 8)} ${f(to.x - r.x * 8)},${f(to.y - r.y * 8)}`;
  return {
    id,
    svg: `<g class="plan" data-prop="${id}">` +
      `<path d="${path}" fill="none" stroke="#212121" stroke-width="8" stroke-linecap="round"/>` +
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>` +
      `<polygon points="${head}" fill="${color}" stroke="#212121" stroke-width="1.5" stroke-linejoin="round"/></g>`,
  };
}

/** Which of an approach's two lanes in `wideFourWay()`: `left` is next to the center line, `right` is next to the curb. */
export type WideLane = 'left' | 'right';

/** Junction box edges of `wideFourWay()`: both roads run from WIDE_BOX.min to WIDE_BOX.max (120 px wide). */
const WIDE_BOX = { min: 90, max: 210, mid: 150, size: 120 };
const WIDE_LANE_W = 30;
/** Travel heading of each road direction in `wideFourWay()`. */
const WIDE_HEADING: Record<Dir, number> = { nb: 0, sb: 180, eb: 90, wb: 270 };
/** Stop lines sit 8 px outside the junction (like `fourWay`'s); stop bars are drawn 2 px inside that. */
const WIDE_LINE_OUT = 8;
const WIDE_BAR_OUT = 6;
/** On the grass, to the right of each approach, just before the junction. */
const WIDE_SIGN_POS: Record<Dir, [number, number]> = { nb: [228, 238], sb: [72, 62], eb: [62, 228], wb: [238, 72] };

/** Lane center across the road: `left` lanes are 15 px from the center line, `right` lanes 45 px (US right-hand traffic). */
function wideCenter(d: Dir, lane: WideLane): number {
  const off = lane === 'left' ? WIDE_LANE_W / 2 : WIDE_LANE_W * 1.5;
  return d === 'nb' || d === 'eb' ? WIDE_BOX.mid + off : WIDE_BOX.mid - off;
}
function wideLine(d: Dir): StopLine {
  const { min, max, mid } = WIDE_BOX;
  const heading = WIDE_HEADING[d];
  switch (d) {
    case 'nb': return { id: `line-${d}`, x: mid + WIDE_LANE_W, y: max + WIDE_LINE_OUT, heading };
    case 'sb': return { id: `line-${d}`, x: mid - WIDE_LANE_W, y: min - WIDE_LINE_OUT, heading };
    case 'eb': return { id: `line-${d}`, x: min - WIDE_LINE_OUT, y: mid + WIDE_LANE_W, heading };
    case 'wb': return { id: `line-${d}`, x: max + WIDE_LINE_OUT, y: mid - WIDE_LANE_W, heading };
  }
}
/** The stop bar / yield teeth segment across approach `d`'s two lanes (inset by `inset` px at each end). */
function wideBar(d: Dir, inset = 0): [number, number, number, number] {
  const { min, max, mid } = WIDE_BOX;
  switch (d) {
    case 'nb': return [mid + inset, max + WIDE_BAR_OUT, max - inset, max + WIDE_BAR_OUT];
    case 'sb': return [min + inset, min - WIDE_BAR_OUT, mid - inset, min - WIDE_BAR_OUT];
    case 'eb': return [min - WIDE_BAR_OUT, mid + inset, min - WIDE_BAR_OUT, max - inset];
    case 'wb': return [max + WIDE_BAR_OUT, min + inset, max + WIDE_BAR_OUT, mid - inset];
  }
}
const WIDE_TEETH_POINT: Record<Dir, 'up' | 'down' | 'left' | 'right'> = { nb: 'down', sb: 'up', eb: 'left', wb: 'right' };
const perLane = <T>(f: (d: Dir, lane: WideLane) => T) =>
  Object.fromEntries(DIRS.map((d) => [d, { left: f(d, 'left'), right: f(d, 'right') }])) as Record<Dir, Record<WideLane, T>>;

/**
 * Bigger 300×300 four-way intersection with two lanes each way, for "which lane do you turn from?" pictures.
 * Both roads run from 90 to 210 (junction box 90–210); a double yellow center line at 150 splits the directions,
 * and a broken white line splits each direction's two 30 px lanes. Lane ids are `<dir>-left` (next to the center
 * line) and `<dir>-right` (next to the curb). Lane centers: nb x 165 / 195, sb x 135 / 105, eb y 165 / 195, wb y 135 / 105.
 */
export const WIDEFOUR = {
  start: perLane((d, lane): Pose => {
    const c = wideCenter(d, lane);
    return d === 'nb' ? { x: c, y: 340, heading: 0 } : d === 'sb' ? { x: c, y: -40, heading: 180 } :
      d === 'eb' ? { x: -40, y: c, heading: 90 } : { x: 340, y: c, heading: 270 };
  }),
  exit: perLane((d, lane): Pose => {
    const c = wideCenter(d, lane);
    return d === 'nb' ? { x: c, y: -40, heading: 0 } : d === 'sb' ? { x: c, y: 340, heading: 180 } :
      d === 'eb' ? { x: 340, y: c, heading: 90 } : { x: -40, y: c, heading: 270 };
  }),
  /** Lane center across the road (x for nb/sb, y for eb/wb). */
  center: wideCenter,
  laneId: (d: Dir, lane: WideLane) => `${d}-${lane}`,
  lineId: (d: Dir) => `line-${d}`,
  signId: (d: Dir) => `sign-${d}`,
  lightId: (d: Dir) => `light-${d}`,
  /**
   * Rectangle over lane `lane` of road direction `d`, on the grass-to-junction stretch where that traffic arrives
   * (`part: 'in'`, before the junction) or leaves (`'out'`, after it). For `laneGlow`.
   */
  laneRect(d: Dir, lane: WideLane, part: 'in' | 'out'): { x: number; y: number; w: number; h: number } {
    const c = wideCenter(d, lane) - WIDE_LANE_W / 2;
    const { min, max } = WIDE_BOX;
    // nb and wb traffic arrive from the high-coordinate side (bottom / right); sb and eb leave toward it.
    const high = (d === 'nb' || d === 'wb') === (part === 'in');
    const [a, len] = high ? [max, 300 - max] : [0, min];
    return d === 'nb' || d === 'sb' ? { x: c, y: a, w: WIDE_LANE_W, h: len } : { x: a, y: c, w: len, h: WIDE_LANE_W };
  },
  box: WIDE_BOX,
};

/** Pose with the vehicle's front 4 px behind the stop line of approach `d`, in lane `lane` of `wideFourWay()`. */
export function wideStopPose(d: Dir, lane: WideLane, kind: ActorKind = 'car'): Pose {
  const half = SIZES[kind].length / 2 + 4;
  const l = wideLine(d), c = wideCenter(d, lane);
  switch (d) {
    case 'nb': return { x: c, y: l.y + half, heading: 0 };
    case 'sb': return { x: c, y: l.y - half, heading: 180 };
    case 'eb': return { x: l.x - half, y: c, heading: 90 };
    case 'wb': return { x: l.x + half, y: c, heading: 270 };
  }
}

/**
 * Two lanes each way (see `WIDEFOUR`). `controls` work as in `fourWay`: a stop bar (or yield teeth) across both lanes
 * of that approach, with its sign or light (`WIDEFOUR.signId/lightId`) on the grass to the right. Every approach has a
 * stop line `WIDEFOUR.lineId(d)` for `stopsBehind`; use `wideStopPose` to stop behind it. Takes `LayoutExtras` too.
 */
export function wideFourWay(opts: { controls?: Partial<Record<Dir, Control>> } & LayoutExtras = {}): Layout {
  const { controls = {}, ...extras } = opts;
  const { min, max, mid, size } = WIDE_BOX;
  let bg = grass(300, 300) + road(0, min, 300, size) + road(min, 0, size, 300);
  bg += doubleYellow(mid, 0, mid, min) + doubleYellow(mid, max, mid, 300) + doubleYellow(0, mid, min, mid) + doubleYellow(max, mid, 300, mid);
  for (const at of [mid - WIDE_LANE_W, mid + WIDE_LANE_W]) {
    bg += line(at, 0, at, min, { dash: true }) + line(at, max, at, 300, { dash: true }) +
      line(0, at, min, at, { dash: true }) + line(max, at, 300, at, { dash: true });
  }
  const props: string[] = [];
  for (const [d, c] of Object.entries(controls) as [Dir, Control][]) {
    const [sx, sy] = WIDE_SIGN_POS[d];
    if (c === 'yield') bg += yieldTeeth(...wideBar(d, 1), WIDE_TEETH_POINT[d]);
    else bg += stopBar(...wideBar(d));
    if (c === 'light') { bg += trafficLight(WIDEFOUR.lightId(d), sx, sy); props.push(WIDEFOUR.lightId(d)); }
    else { bg += sign(c, sx, sy, { id: WIDEFOUR.signId(d) }); props.push(WIDEFOUR.signId(d)); }
  }
  const lanes: Lane[] = [];
  for (const d of DIRS) for (const lane of ['left', 'right'] as WideLane[]) {
    const lo = wideCenter(d, lane) - WIDE_LANE_W / 2;
    const heading = WIDE_HEADING[d];
    lanes.push(d === 'nb' || d === 'sb'
      ? { id: WIDEFOUR.laneId(d, lane), x: lo, y: -100, w: WIDE_LANE_W, h: 500, heading }
      : { id: WIDEFOUR.laneId(d, lane), x: -100, y: lo, w: 500, h: WIDE_LANE_W, heading });
  }
  return withExtras({
    background: bg, lanes,
    zones: [{ id: 'junction', x: min, y: min, w: size, h: size }],
    lines: DIRS.map(wideLine),
    props,
  }, extras);
}

/**
 * A see-through glow over a lane (e.g. `WIDEFOUR.laneRect(...)`), with a thick edge in `color` (default bright yellow),
 * to point at "this lane" while it is named. It is a prop drawn under the cars: hide it with `hidden` until needed.
 */
export function laneGlow(id: string, r: { x: number; y: number; w: number; h: number }, color = '#ffeb3b'): ExtraProp {
  const i = 2;
  return {
    id,
    svg: `<g class="lane-glow" data-prop="${id}"><rect x="${r.x + i}" y="${r.y + i}" width="${r.w - 2 * i}" height="${r.h - 2 * i}" ` +
      `fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="3.5" rx="3"/></g>`,
  };
}

/** Driveway lane center (the same x as the `nb` lane) and its stop line, 2 px below the street's edge. */
const DRIVE_X = LINE.nb.x;
const DRIVE_LINE_Y = BOX.max + 2;
export const DRIVEWAY = {
  lineId: 'line-drive',
  zoneId: 'street',
  /** Pose with the vehicle's front 4 px behind `DRIVEWAY.lineId` (y 182, 2 px below the street's edge at y 180). */
  stop: (kind: ActorKind = 'car'): Pose => ({ x: DRIVE_X, y: DRIVE_LINE_Y + SIZES[kind].length / 2 + 4, heading: 0 }),
};

/**
 * 300×300 street with a parking lot below it. The street is the same as `fourWay()`'s horizontal road
 * (y 120–180, lanes `eb` center y 165 and `wb` center y 135, so `FOURWAY.start/exit.eb/wb` work).
 * The driveway (x 140–190) runs from the lot (y 228–300) up to the street; its lane `drive` (center x 165) heads north.
 * `DRIVEWAY.lineId` is an unpainted stop line at the street's edge; `DRIVEWAY.zoneId` is the near street lane in front of the driveway.
 */
export function driveway(): Layout {
  const lot = '#8d8d8d';
  let bg = grass(300, 300) + road(0, BOX.min, 300, BOX.size) + line(0, BOX.mid, 300, BOX.mid, { color: COLORS.yellow, dash: true });
  bg += `<rect x="140" y="180" width="50" height="50" fill="${lot}"/><rect x="40" y="228" width="250" height="72" fill="${lot}"/>`;
  for (const x of [40, 70, 100, 130, 200, 230, 260, 290]) bg += line(x, 250, x, 300, { width: 2 });
  // Two parked grey cars, so the lot reads as a parking lot.
  for (const x of [85, 245]) bg += `<rect x="${x - 9}" y="258" width="18" height="36" rx="5" fill="#b0bec5" stroke="#0004"/>`;
  return {
    background: bg,
    lanes: [
      { id: 'eb', x: -100, y: BOX.mid, w: 500, h: BOX.size / 2, heading: 90 },
      { id: 'wb', x: -100, y: BOX.min, w: 500, h: BOX.size / 2, heading: 270 },
      { id: 'drive', x: BOX.mid, y: BOX.max, w: BOX.size / 2, h: 140, heading: 0 },
    ],
    zones: [{ id: DRIVEWAY.zoneId, x: 130, y: BOX.mid, w: 100, h: BOX.size / 2 }],
    lines: [{ id: DRIVEWAY.lineId, x: DRIVE_X, y: DRIVE_LINE_Y, heading: 0 }],
    props: [],
  };
}

export type CenterLine = 'broken-yellow' | 'solid-yellow' | 'double-yellow' | 'solid-and-broken';

/** Road markings on straight roads: thick, with long dashes, so "broken" and "solid" are easy to tell apart. */
const MARK_W = 4;
const MARK_DASH = '18 12';
/** Offset of each line of a pair (double / solid-and-broken) from y 150, leaving a clear gap between them. */
const PAIR = 3.5;

/**
 * Shared base for `twoLane()` and `sameWay()`: 300×300 grass, road y 110–190, the divider line(s) at y 150
 * wrapped as the `marking` prop `dividerId`, and a far lane (y 110–150) and near lane (y 150–190), 500 px long.
 */
function straightRoad(o: {
  dividerId: string; divider: string;
  far: { id: string; heading: number }; near: { id: string; heading: number };
}): Layout {
  return {
    background: grass(300, 300) + road(0, 110, 300, 80) +
      `<g class="marking" data-prop="${o.dividerId}">${o.divider}</g>`,
    lanes: [
      { id: o.near.id, x: -100, y: 150, w: 500, h: 40, heading: o.near.heading },
      { id: o.far.id, x: -100, y: 110, w: 500, h: 40, heading: o.far.heading },
    ],
    zones: [], lines: [], props: [o.dividerId],
  };
}

/**
 * Standard 300×300 two-lane road, running left–right.
 * Road y 110–190. Eastbound lane y 150–190 (center 170); westbound lane y 110–150 (center 130).
 * `center` picks the yellow center line at y 150 (default `broken-yellow`). For `solid-and-broken`,
 * the solid line is on the eastbound side (y 153.5) and the broken line on the westbound side (y 146.5).
 * The center line is the prop `center-line`. Don't give it `highlight`: the white glow makes yellow lines look white.
 * The other options are `LayoutExtras` (props, lanes, zones, stop lines), added with `withExtras`.
 */
export const TWOLANE = {
  start: { eb: { x: -40, y: 170, heading: 90 }, wb: { x: 340, y: 130, heading: 270 } } satisfies Record<'eb' | 'wb', Pose>,
  exit: { eb: { x: 340, y: 170, heading: 90 }, wb: { x: -40, y: 130, heading: 270 } } satisfies Record<'eb' | 'wb', Pose>,
  centerId: 'center-line',
};

export function twoLane(opts: { center?: CenterLine } & LayoutExtras = {}): Layout {
  const { center = 'broken-yellow', ...extras } = opts;
  const y = (at: number, broken: boolean) => line(0, at, 300, at, { color: COLORS.yellow, width: MARK_W, dash: broken ? MARK_DASH : false });
  const divider =
    center === 'broken-yellow' ? y(150, true) :
    center === 'solid-yellow' ? y(150, false) :
    center === 'double-yellow' ? y(150 - PAIR, false) + y(150 + PAIR, false) :
    y(150 + PAIR, false) + y(150 - PAIR, true);
  return withExtras(straightRoad({
    dividerId: TWOLANE.centerId, divider,
    near: { id: 'eb', heading: 90 }, far: { id: 'wb', heading: 270 },
  }), extras);
}

/**
 * 300×300 road with two lanes both going east (right), split by a broken white lane line at y 150.
 * Same size as `twoLane()`: right lane `eb-right` y 150–190 (center 170), left lane `eb-left` y 110–150 (center 130).
 * The lane line is the prop `lane-line` (state `highlight` gives it a white glow).
 * The other options are `LayoutExtras` (props, lanes, zones, stop lines), added with `withExtras`.
 */
export const SAMEWAY = {
  start: { right: { x: -40, y: 170, heading: 90 }, left: { x: -40, y: 130, heading: 90 } } satisfies Record<'right' | 'left', Pose>,
  exit: { right: { x: 340, y: 170, heading: 90 }, left: { x: 340, y: 130, heading: 90 } } satisfies Record<'right' | 'left', Pose>,
  laneLineId: 'lane-line',
};

export function sameWay(opts: LayoutExtras = {}): Layout {
  return withExtras(straightRoad({
    dividerId: SAMEWAY.laneLineId, divider: line(0, 150, 300, 150, { width: MARK_W, dash: MARK_DASH }),
    near: { id: 'eb-right', heading: 90 }, far: { id: 'eb-left', heading: 90 },
  }), opts);
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

/**
 * Two signs side by side on the close-up background, with a single `teach` still step of `teachMs`.
 * Pass `ids` to make the two signs props (so a step can `highlight` each one while it is named).
 */
export function signPair(id: string, left: PairSign, right: PairSign, teachMs: number, opts: { ids?: [string, string] } = {}): SceneDef {
  const ids = opts.ids;
  if (ids && (!ids[0] || !ids[1] || ids[0] === ids[1])) throw new Error(`signPair: ids must be two different, non-empty ids (got ${JSON.stringify(ids)})`);
  const one = (p: PairSign, x: number, pid?: string) =>
    sign(p.kind, x, 150, { size: 120, post: false, ...(p.text ? { text: p.text } : {}), ...(pid ? { id: pid } : {}) });
  return {
    id, width: 300, height: 300,
    background: CLOSEUP_BG + one(left, 80, ids?.[0]) + one(right, 220, ids?.[1]),
    lanes: [], zones: [], lines: [], props: ids ? [...ids] : [], actors: [],
    steps: [{ id: 'teach', duration: teachMs }],
  };
}

/**
 * A road sign as a prop (`ExtraProp`), e.g. a speed limit sign on the grass beside a `twoLane()` road, so a step can
 * `highlight` it while it is named. `size` defaults to 26 px as in `fourWay`; pass a bigger size for a sign the
 * narration talks about. Put it on the driver's right: for eastbound traffic, on the grass below the road (y > 190).
 */
export function signProp(id: string, kind: SignKind, x: number, y: number, o: Omit<SignOpts, 'id'> = {}): ExtraProp {
  if (!id) throw new Error('signProp: id must not be empty');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`signProp: x and y must be numbers (got ${x}, ${y})`);
  return { id, svg: sign(kind, x, y, { ...o, id }) };
}

/**
 * A traffic light as a prop, drawn upright at (x, y) and `scale` times the normal size (e.g. 1.6 for one the
 * narration names). `highlight` on `id` rings it. Its lamps are the part `<id>-lamps` (see `ExtraProp.parts`), which
 * starts in state `lamps`: the lit lamps, as for `trafficLight` (e.g. 'red', or 'red yellow green' for "a traffic
 * light" that is no one color). Default '' (all dark). Throws on an empty id, a position that isn't numbers, or a
 * scale that isn't more than 0.
 */
export function trafficLightProp(id: string, x: number, y: number, o: { scale?: number; lamps?: string } = {}): ExtraProp {
  const { scale = 1, lamps = '' } = o;
  if (!id) throw new Error('trafficLightProp: id must not be empty');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`trafficLightProp: x and y must be numbers (got ${x}, ${y})`);
  if (!(scale > 0) || !Number.isFinite(scale)) throw new Error(`trafficLightProp: scale must be a number more than 0 (got ${scale})`);
  const lampsId = `${id}-lamps`;
  return {
    id,
    svg: `<g class="pic" data-prop="${id}"><g transform="translate(${x} ${y}) scale(${scale})">${trafficLight(lampsId, 0, 0)}</g></g>`,
    parts: { [lampsId]: lamps },
  };
}

/** How far `fogBank`'s soft edge puffs reach out past its ends (px). */
export const FOG_EDGE_PX = 22;

/**
 * A bank of fog as a prop: a grey-white cover (opacity `opacity`, default 0.85) from x `x0` to `x1`, the full height
 * of the scene, over the road and the grass, with a soft, lumpy left edge (and right edge, if it ends before x 300)
 * reaching `FOG_EDGE_PX` past x0, so drivers can see it coming. It is drawn under the cars, so they stay easy to see.
 * `label` (e.g. 'FOG') writes a big word near the top of the bank, centered between x0 and x1. The prop takes
 * `highlight` (a yellow ring around the bank) for when the fog is named.
 * Throws unless 0 ≤ x0 < x1 ≤ 300, the bank is at least 20 px wide and 0 < opacity ≤ 1.
 */
export function fogBank(id: string, x0: number, x1: number, o: { label?: string; opacity?: number } = {}): ExtraProp {
  if (!id) throw new Error('fogBank: id must not be empty');
  if (!Number.isFinite(x0) || !Number.isFinite(x1) || x0 < 0 || x1 > 300 || x1 - x0 < 20) {
    throw new Error(`fogBank: need 0 ≤ x0 < x1 ≤ 300, at least 20 px apart (got ${x0} and ${x1})`);
  }
  const opacity = o.opacity ?? 0.85;
  if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) throw new Error(`fogBank: opacity must be more than 0 and at most 1 (got ${opacity})`);
  if (o.label !== undefined && !o.label.trim()) throw new Error('fogBank: label must not be empty');
  const puff = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  const edge = (x: number) => [15, 55, 95, 135, 175, 215, 255, 295].map((cy, i) => puff(x, cy, i % 2 ? FOG_EDGE_PX : 16)).join('');
  // Fill and edge puffs share one see-through group, so where they overlap they don't look thicker.
  return {
    id,
    svg: `<g class="pic fog" data-prop="${id}"><g fill="#e6e9ec" opacity="${opacity}">` +
      `<rect x="${x0}" y="0" width="${x1 - x0}" height="300"/>${edge(x0)}${x1 < 300 ? edge(x1) : ''}</g>` +
      // A few grey wisps so it reads as fog, not a white patch.
      [95, 130, 225, 270].map((wy) => line(x0 + 12, wy, x1 - 8, wy + 6, { color: '#90a4ae', width: 3, dash: '26 14' })).join('') +
      (o.label ? label((x0 + x1) / 2, 60, o.label, 22) : '') +
      `</g>`,
  };
}

/**
 * A car speedometer dial as a prop: a white dial with a thick ring (default blue, for the blue car), unlabeled ticks,
 * a red needle pointing at `mph` on a dial from 0 to `max` (default 80), and `mph` written big in the middle with
 * "mph" under it. Only `mph` is written, so the picture shows no other number. `r` is the dial radius (default 46).
 * Throws unless 0 ≤ mph ≤ max, max > 0 and r ≥ 20.
 */
export function speedGauge(id: string, cx: number, cy: number, mph: number, o: { max?: number; r?: number; ring?: string } = {}): ExtraProp {
  const max = o.max ?? 80, r = o.r ?? 46, ring = o.ring ?? COLORS.you;
  if (!id) throw new Error('speedGauge: id must not be empty');
  if (!Number.isFinite(max) || max <= 0) throw new Error(`speedGauge: max must be more than 0 (got ${max})`);
  if (!Number.isFinite(mph) || mph < 0 || mph > max) throw new Error(`speedGauge: mph must be from 0 to ${max} (got ${mph})`);
  if (!Number.isFinite(r) || r < 20) throw new Error(`speedGauge: r must be 20 or more (got ${r})`);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) throw new Error(`speedGauge: cx and cy must be numbers (got ${cx}, ${cy})`);
  const f = (v: number) => +v.toFixed(2);
  // The needle turns about a hub a little above the middle, so the number below it stays clear.
  const hy = cy - r * 0.15;
  // The dial sweeps 270°, from lower left (0) over the top to lower right (max). Angles are SVG-style: 0 = right, clockwise.
  const ang = (v: number) => ((135 + (270 * v) / max) * Math.PI) / 180;
  const on = (v: number, rr: number, y0 = cy) => ({ x: f(cx + Math.cos(ang(v)) * rr), y: f(y0 + Math.sin(ang(v)) * rr) });
  let ticks = '';
  for (let k = 0; k <= 8; k++) {
    const v = (max * k) / 8, a = on(v, r - 6), b = on(v, r - (k % 2 ? 11 : 15));
    ticks += line(a.x, a.y, b.x, b.y, { color: '#212121', width: k % 2 ? 2 : 3 });
  }
  const tip = on(mph, r * 0.62, hy);
  const text = (y: number, size: number, s: string) =>
    `<text x="${f(cx)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="700" font-size="${size}" fill="#212121">${s}</text>`;
  return {
    id,
    svg: `<g class="pic" data-prop="${id}">` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r}" fill="#ffffff" stroke="${ring}" stroke-width="6"/>${ticks}` +
      line(cx, hy, tip.x, tip.y, { color: '#d32f2f', width: 4 }) + `<circle cx="${f(cx)}" cy="${f(hy)}" r="5" fill="#212121"/>` +
      text(cy + r * 0.36, Math.round(r * 0.5), String(mph)) + text(cy + r * 0.72, Math.round(r * 0.26), 'mph') + `</g>`,
  };
}

/**
 * An unpainted stop line just in front of a vehicle of `kind` standing at pose `p`: `gap` px (default 2) ahead of its
 * front, facing its heading. Add it to a layout with `lines` and use it in a `stopsBehind` expect to prove the vehicle
 * stays stopped there (e.g. pulled over at the edge of the road, or waiting behind a stopped school bus).
 */
export function stopLineAhead(id: string, p: Pose, kind: ActorKind = 'car', gap = 2): StopLine {
  const d = dir(p.heading);
  const ahead = SIZES[kind].length / 2 + gap;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { id, x: r(p.x + d.x * ahead), y: r(p.y + d.y * ahead), heading: p.heading };
}

/**
 * A paved shoulder along the bottom (right-hand, for eastbound traffic) edge of `twoLane()` / `sameWay()`:
 * a lighter grey strip y 190–216 with a solid white edge line where it meets the road. It is `LayoutExtras`: it adds
 * the prop `SHOULDER.id` and the zone `SHOULDER.zoneId`, so a vehicle parked on the shoulder (center y `SHOULDER.y`,
 * any heading) passes the lane check. Spreading it into the road's options (`twoLane({ ...shoulder() })`) only works
 * when you pass no other `props` or `zones`, since a later `props:` key replaces the shoulder's. To add your own too,
 * merge them: `const sh = shoulder(); sameWay({ props: [...sh.props, myGlow], zones: sh.zones })`.
 */
export const SHOULDER = { id: 'shoulder', zoneId: 'shoulder', top: 190, bottom: 216, y: 203 };
export function shoulder(): Required<Pick<LayoutExtras, 'props' | 'zones'>> {
  const { id, zoneId, top, bottom } = SHOULDER;
  return {
    props: [{
      id,
      svg: `<g data-prop="${id}"><rect x="0" y="${top}" width="300" height="${bottom - top}" fill="#7b7b7b"/>` +
        line(0, top + 1.5, 300, top + 1.5, { width: 3 }) + `</g>`,
    }],
    zones: [{ id: zoneId, x: -100, y: top, w: 500, h: bottom - top }],
  };
}

/**
 * Colors of the roof light in `lampCarCloseup`: volunteer fire fighters' cars show blue, volunteer ambulance
 * members' cars green, and hazard vehicles such as tow trucks amber (manual page 35).
 */
export const LAMP_COLORS = {
  blue: { lamp: '#1565c0', halo: '#64b5f6' },
  green: { lamp: '#2e7d32', halo: '#81c784' },
  amber: { lamp: '#ff8f00', halo: '#ffd54f' },
};
export type LampColor = keyof typeof LAMP_COLORS;
/** A close-up vehicle: a car or a tow truck, with a roof light of the given color. A bare color means a car. */
export type LampVehicle = LampColor | { lamp: LampColor; kind: 'car' | 'tow-truck' };
const lampKind = (v: LampVehicle) => (typeof v === 'string' ? 'car' : v.kind);
const lampColor = (v: LampVehicle) => (typeof v === 'string' ? v : v.lamp);
/** Prop id of a close-up vehicle: `lamp-car-<color>` or `lamp-truck-<color>`. */
export const lampPropId = (v: LampVehicle) => `lamp-${lampKind(v) === 'car' ? 'car' : 'truck'}-${lampColor(v)}`;

const LAMP_W = 66, LAMP_L = 132;
/** The roof light: a big lamp that stays lit, with a halo that blinks (class `lamp-halo`). */
const roofLamp = (cx: number, cy: number, color: LampColor) =>
  `<circle class="lamp-halo" cx="${cx}" cy="${cy}" r="27" fill="${LAMP_COLORS[color].halo}" fill-opacity="0.85"/>` +
  `<circle cx="${cx}" cy="${cy}" r="16" fill="${LAMP_COLORS[color].lamp}" stroke="#212121" stroke-width="3"/>`;

/** A big light-grey car seen from above (pointing up), centered on (cx, cy), with a roof light. */
function lampCar(id: string, cx: number, cy: number, color: LampColor): string {
  const W = LAMP_W, L = LAMP_L;
  const x = cx - W / 2, y = cy - L / 2;
  const glass = (gy: number, gh: number) => `<rect x="${x + 9}" y="${gy}" width="${W - 18}" height="${gh}" rx="6" fill="#e3f2fd" stroke="#546e7a" stroke-width="2"/>`;
  return `<g class="pic" data-prop="${id}">` +
    `<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="16" fill="#cfd8dc" stroke="#37474f" stroke-width="3"/>` +
    glass(y + 20, 28) + glass(y + L - 34, 18) + roofLamp(cx, cy + 8, color) + `</g>`;
}

/**
 * A big tow truck seen from above (pointing up), centered on (cx, cy): a grey cab with a windshield and a roof light,
 * a flat bed behind it, and a dark tow arm with a hook sticking out the back.
 */
function lampTowTruck(id: string, cx: number, cy: number, color: LampColor): string {
  const W = LAMP_W, L = LAMP_L;
  const x = cx - W / 2, y = cy - L / 2;
  const cab = 52;
  return `<g class="pic" data-prop="${id}">` +
    `<rect x="${cx - 5}" y="${y + L - 8}" width="10" height="22" fill="#37474f"/>` +
    `<path d="M${cx - 9} ${y + L + 12} a9 9 0 0 0 18 0" fill="none" stroke="#37474f" stroke-width="5"/>` +
    `<rect x="${x + 3}" y="${y + cab + 4}" width="${W - 6}" height="${L - cab - 4}" rx="4" fill="#90a4ae" stroke="#37474f" stroke-width="3"/>` +
    `<rect x="${cx - 4}" y="${y + cab + 10}" width="8" height="${L - cab - 12}" fill="#37474f"/>` +
    `<rect x="${x}" y="${y}" width="${W}" height="${cab}" rx="12" fill="#cfd8dc" stroke="#37474f" stroke-width="3"/>` +
    `<rect x="${x + 9}" y="${y + 8}" width="${W - 18}" height="14" rx="5" fill="#e3f2fd" stroke="#546e7a" stroke-width="2"/>` +
    roofLamp(cx, y + 36, color) + `</g>`;
}

/**
 * Close-up of one to three big vehicles (grey cars, or a tow truck), each with a colored roof light, on the plain
 * close-up background. Props are `lampPropId(v)` (`highlight` rings one). Steps: `show` (500 ms), plus `teach`
 * when `teachMs` is given.
 */
export function lampCarCloseup(id: string, vehicles: LampVehicle[], opts: { teachMs?: number } = {}): SceneDef {
  const xs = vehicles.length === 1 ? [150] : vehicles.length === 2 ? [80, 220] : [55, 150, 245];
  const props = vehicles.map(lampPropId);
  const draw = (v: LampVehicle, i: number) =>
    (lampKind(v) === 'car' ? lampCar : lampTowTruck)(props[i], xs[i], lampKind(v) === 'car' ? 150 : 140, lampColor(v));
  return {
    id, width: 300, height: 300,
    background: CLOSEUP_BG + vehicles.map(draw).join(''),
    lanes: [], zones: [], lines: [], props, actors: [],
    steps: closeupSteps(opts.teachMs),
  };
}

/**
 * A grass median down the middle of `twoLane()`, so it reads as a divided highway: a green strip y 143–157 (over the
 * center line) with a solid yellow edge line on each side (y 142 and 158). It stays clear of both lanes' cars
 * (bodies y 121–139 and 161–179). It is `LayoutExtras` with one prop, `MEDIAN.id`; merge it with other props as for
 * `shoulder()`.
 */
export const MEDIAN = { id: 'median', top: 142, bottom: 158 };
export function median(): Required<Pick<LayoutExtras, 'props'>> {
  const { id, top, bottom } = MEDIAN;
  return {
    props: [{
      id,
      svg: `<g data-prop="${id}"><rect x="0" y="${top + 1}" width="300" height="${bottom - top - 2}" fill="${COLORS.grass}"/>` +
        line(0, top, 300, top, { color: COLORS.yellow, width: 3 }) + line(0, bottom, 300, bottom, { color: COLORS.yellow, width: 3 }) + `</g>`,
    }],
  };
}

/**
 * The distance scale for road scenes: a 36 px car stands for a 15-foot car, so 1 foot is 2.4 px. Use `feetPx` and
 * `inchesPx` for any distance the manual quotes (e.g. `feetPx(20)` is 48 px, `inchesPx(12)` is 2.4 px).
 */
export const FOOT_PX = 2.4;
const scaled = (what: string, v: number, px: number) => {
  if (!Number.isFinite(v) || v < 0) throw new Error(`${what}: the distance must be a number 0 or more (got ${v})`);
  return Math.round(v * px * 1000) / 1000;
};
export const feetPx = (ft: number) => scaled('feetPx', ft, FOOT_PX);
export const inchesPx = (inches: number) => scaled('inchesPx', inches, FOOT_PX / 12);

export type MeasureLabel = 'above' | 'below' | 'left' | 'right';
/** Ends closer than this get inward-pointing heads outside the ends (two heads don't fit between them). */
const MEASURE_SHORT = 20;
/**
 * A "this far" measuring arrow as a prop: a double-headed dark arrow with a white label (e.g. "20 feet") and a short
 * tick across each end. Use it to show a distance while the narration says it; hide it with `hidden` until then.
 * - Horizontal (default): from (a, at) to (b, at). `label` is `'above'` (default) or `'below'`.
 * - `vertical: true`: from (at, a) to (at, b), e.g. a car's side to the curb. `label` is `'right'` (default) or `'left'`.
 * - `reach: [ra, rb]` adds a dashed dark guide from each end to that y (horizontal) or x (vertical), to tie the arrow
 *   to the two things it measures between (e.g. a car's front and a bus's back in the lane below).
 * - Ends closer than 20 px (a short quoted distance such as inches to the curb) get their heads just outside the
 *   ends, pointing in; the label stays beside the arrow, clear of it.
 * Throws if the ends are the same (or not numbers), the text is empty, or `label` doesn't suit the direction.
 */
export function measureProp(
  id: string, a: number, b: number, at: number, text: string,
  o: { vertical?: boolean; label?: MeasureLabel; reach?: [number, number] } = {},
): ExtraProp {
  const len = Math.abs(b - a);
  if (!Number.isFinite(len) || !Number.isFinite(at) || len === 0) {
    throw new Error(`measureProp: the two ends must be different numbers (got ${a} and ${b}, at ${at})`);
  }
  if (!text.trim()) throw new Error('measureProp: text must not be empty');
  const vertical = !!o.vertical;
  const side = o.label ?? (vertical ? 'right' : 'above');
  const ok: MeasureLabel[] = vertical ? ['left', 'right'] : ['above', 'below'];
  if (!ok.includes(side)) {
    throw new Error(`measureProp: a ${vertical ? 'vertical' : 'horizontal'} arrow's label goes ${ok.join(' or ')} (got '${side}')`);
  }
  const dark = '#212121';
  const pt = (v: number) => (vertical ? { x: at, y: v } : { x: v, y: at });
  const p1 = pt(a), p2 = pt(b);
  const tick = (p: { x: number; y: number }) =>
    vertical ? line(p.x - 7, p.y, p.x + 7, p.y, { color: dark, width: 2 }) : line(p.x, p.y - 7, p.x, p.y + 7, { color: dark, width: 2 });
  const guide = (p: { x: number; y: number }, to: number) =>
    vertical ? line(p.x, p.y, to, p.y, { color: dark, width: 1.5, dash: '4 3' }) : line(p.x, p.y, p.x, to, { color: dark, width: 1.5, dash: '4 3' });
  const guides = o.reach ? guide(p1, o.reach[0]) + guide(p2, o.reach[1]) : '';
  const inward = len < MEASURE_SHORT;
  const mid = (a + b) / 2;
  // Label width as `label()` draws it (12 px text), so a side label clears the arrow and its ticks.
  const halfW = (text.length * 12 * 0.6 + 10) / 2;
  const labelAt =
    side === 'above' ? undefined :
    side === 'below' ? { x: mid, y: at + 12 } :
    side === 'left' ? { x: at - 9 - halfW, y: mid } : { x: at + 9 + halfW, y: mid };
  const opts = { ...(labelAt ? { labelAt } : {}), ...(inward ? { inward } : {}) };
  return {
    id,
    svg: `<g class="measure" data-prop="${id}">${guides}${tick(p1)}${tick(p2)}${measure(p1.x, p1.y, p2.x, p2.y, text, opts)}</g>`,
  };
}

/** How far `wheelsProp`'s tires stick out past each side of the car (px). */
export const WHEEL_OUT = 2;
const CURB_Y = 214;
/**
 * `curbStreet()` geometry. The street is `twoLane()`'s road (y 110–190, lanes `eb` center 170 and `wb` center 130)
 * with a parking lane below it (y 190–214, no line between them), then the curb (y 214–217) and a sidewalk
 * (y 217–236). `parkY` is where a parked car's center goes: its wheels (`wheelsProp`) 1 foot from the curb.
 * With a corner, a cross street runs down the right side (x `crossX`–300) and a crosswalk (two white lines, x
 * `crosswalkX[0]`–`crosswalkX[1]`) crosses the street and the parking lane just before it; `'stop'` adds a STOP sign
 * on the sidewalk corner for eastbound traffic, at (`signX`, `signY`).
 */
export const CURB = {
  laneId: 'parking',
  parkTop: 190, curbY: CURB_Y, curbBottom: 217, sidewalkBottom: 236,
  hydrantId: 'hydrant', hydrantX: 100, hydrantY: 226,
  curbId: 'curb',
  crosswalkId: 'crosswalk', crosswalkX: [232, 248] as [number, number],
  crossX: 254,
  signId: 'sign-stop', signX: 222, signY: 242, signSize: 38,
  parkY: Math.round((CURB_Y - feetPx(1) - WHEEL_OUT - SIZES.car.width / 2) * 1000) / 1000,
};
/** What stands at the right end of `curbStreet()`: nothing, a crosswalk at an intersection, or that plus a STOP sign. */
export type CurbCorner = 'none' | 'crosswalk' | 'stop';

/**
 * A 300×300 street with a parking lane along the curb (see `CURB`). The parking lane is the lane `CURB.laneId`
 * (`heading: 'any'`), so a car parked there with an `at` pose (center y `CURB.parkY`) passes the lane check.
 * - `hydrant`: x of a fire hydrant on the sidewalk (prop `CURB.hydrantId`, `highlight` rings it), or `false` for none.
 *   Default `CURB.hydrantX`.
 * - `corner` (default `'stop'`): `'crosswalk'` adds the cross street and the crosswalk (prop `CURB.crosswalkId`, a
 *   `marking`: `highlight` gives it a white glow); `'stop'` adds the STOP sign too (prop `CURB.signId`); `'none'` has neither.
 * The curb is the prop `CURB.curbId` (`highlight` rings it). The other options are `LayoutExtras`, added with `withExtras`.
 * Throws if the hydrant is off the sidewalk or on the corner.
 */
export function curbStreet(opts: { hydrant?: number | false; corner?: CurbCorner } & LayoutExtras = {}): Layout {
  const { hydrant = CURB.hydrantX, corner = 'stop', ...extras } = opts;
  const C = CURB;
  const end = corner === 'none' ? 300 : C.crosswalkX[0];
  if (hydrant !== false && (!Number.isFinite(hydrant) || hydrant < 10 || hydrant > end - 10)) {
    throw new Error(`curbStreet: the hydrant must be on the sidewalk, from x 10 to ${end - 10} (got ${hydrant})`);
  }
  const base = twoLane();
  // The parking lane starts 1 px up, under the road's edge, so no seam shows between them.
  let bg = `<rect x="0" y="${C.parkTop - 1}" width="300" height="${C.curbY - C.parkTop + 1}" fill="${COLORS.road}"/>` +
    `<rect x="0" y="${C.curbBottom}" width="300" height="${C.sidewalkBottom - C.curbBottom}" fill="#d7d7d7"/>` +
    `<g class="pic" data-prop="${C.curbId}"><rect x="0" y="${C.curbY}" width="300" height="${C.curbBottom - C.curbY}" fill="#9e9e9e"/></g>`;
  const props: string[] = [C.curbId];
  if (corner !== 'none') {
    bg += road(C.crossX, 0, 300 - C.crossX, 300) +
      line((C.crossX + 300) / 2, 0, (C.crossX + 300) / 2, 104, { color: COLORS.yellow, width: MARK_W, dash: MARK_DASH }) +
      line((C.crossX + 300) / 2, 242, (C.crossX + 300) / 2, 300, { color: COLORS.yellow, width: MARK_W, dash: MARK_DASH });
    // The street's center line stops at the crosswalk.
    bg += `<rect x="${C.crosswalkX[0] - 3}" y="144" width="${C.crossX - C.crosswalkX[0] + 5}" height="12" fill="${COLORS.road}"/>`;
    const walk = C.crosswalkX.map((x) => line(x, 110, x, C.curbY, { width: 4 })).join('');
    bg += `<g class="marking" data-prop="${C.crosswalkId}">${walk}</g>`;
    props.push(C.crosswalkId);
    if (corner === 'stop') {
      bg += sign('stop', C.signX, C.signY, { id: C.signId, size: C.signSize });
      props.push(C.signId);
    }
  }
  if (hydrant !== false) {
    const hx = hydrant, hy = C.hydrantY;
    bg += `<g class="pic" data-prop="${C.hydrantId}">${drawHydrant(hx, hy)}</g>`;
    props.push(C.hydrantId);
  }
  return withExtras({
    background: base.background + bg,
    lanes: [...base.lanes, { id: C.laneId, x: -100, y: C.parkTop, w: 500, h: C.curbY - C.parkTop, heading: 'any' }],
    zones: base.zones, lines: base.lines, props: [...base.props, ...props],
  }, extras);
}

/**
 * The four tires of a car of `kind` standing at pose `p`, as a prop drawn just under it: dark tires that stick out
 * `WHEEL_OUT` px past each side at the front and back axles, so a picture about "your wheels" shows them. `highlight`
 * rings them. Only for a car that stays at `p` (e.g. parked with an `at` pose).
 */
export function wheelsProp(id: string, p: Pose, kind: ActorKind = 'car'): ExtraProp {
  if (!id) throw new Error('wheelsProp: id must not be empty');
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.heading)) {
    throw new Error(`wheelsProp: the pose must be numbers (got ${JSON.stringify(p)})`);
  }
  const { length: L, width: W } = SIZES[kind];
  const tw = 4, tl = Math.round(L * 0.22), axle = L / 2 - tl;
  const tire = (sx: number, sy: number) =>
    `<rect x="${sx > 0 ? W / 2 + WHEEL_OUT - tw : -W / 2 - WHEEL_OUT}" y="${sy * axle - tl / 2}" width="${tw}" height="${tl}" rx="1.5" fill="#212121"/>`;
  return {
    id,
    svg: `<g class="pic" data-prop="${id}"><g transform="translate(${p.x} ${p.y}) rotate(${p.heading})">` +
      tire(-1, -1) + tire(1, -1) + tire(-1, 1) + tire(1, 1) + `</g></g>`,
  };
}

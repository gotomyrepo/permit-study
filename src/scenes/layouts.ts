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
};

/** Pose with the vehicle's front 4px behind the stop/yield line of approach `dir`. */
export function stopPose(dir: Dir, kind: ActorKind = 'car'): Pose {
  const half = SIZES[kind].length / 2 + 4;
  const l = LINE[dir];
  switch (dir) {
    case 'nb': return { x: 165, y: l.y + half, heading: 0 };
    case 'sb': return { x: 135, y: l.y - half, heading: 180 };
    case 'eb': return { x: l.x - half, y: 165, heading: 90 };
    case 'wb': return { x: l.x + half, y: 135, heading: 270 };
  }
}

export interface Layout { background: string; lanes: Lane[]; zones: Zone[]; lines: StopLine[]; props: string[] }

export function fourWay(opts: { controls?: Partial<Record<Dir, Control>> } = {}): Layout {
  let bg = grass(300, 300) + road(0, 120, 300, 60) + road(120, 0, 60, 300);
  const y = { color: COLORS.yellow, dash: true };
  bg += line(150, 0, 150, 120, y) + line(150, 180, 150, 300, y) + line(0, 150, 120, 150, y) + line(180, 150, 300, 150, y);
  const props: string[] = [];
  for (const [d, c] of Object.entries(opts.controls ?? {}) as [Dir, Control][]) {
    const [sx, sy] = SIGN_POS[d];
    if (c === 'stop') { bg += stopBar(...BAR[d]) + sign('stop', sx, sy, { id: FOURWAY.signId(d) }); props.push(FOURWAY.signId(d)); }
    if (c === 'yield') { bg += yieldTeeth(...TEETH[d].seg, TEETH[d].point) + sign('yield', sx, sy, { id: FOURWAY.signId(d) }); props.push(FOURWAY.signId(d)); }
    if (c === 'light') { bg += stopBar(...BAR[d]) + trafficLight(FOURWAY.lightId(d), sx, sy); props.push(FOURWAY.lightId(d)); }
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
    lines: Object.values(LINE),
    props,
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

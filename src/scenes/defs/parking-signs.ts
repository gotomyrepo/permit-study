import type { Pose, SceneDef, StateSet } from '../types';
import { SIZES } from '../engine';
import {
  CURB, curbStreet, laneGlow, partStates, signCloseup, signProp, stopLineAhead, trafficLightProp, type ExtraProp,
} from '../layouts';
import { changeSpeed, driveInTo, driveUntil, kf, SPEED } from '../paths';
import { grass, line, road, type SignKind } from '../parts';

// Parking signs, manual pages 43 (NO PARKING, NO STANDING and NO STOPPING signs) and 44 (reserved parking for people
// with disabilities). Times are in ms and follow the word timings in public/audio/card-parking-signs-*.json (the word
// each time is tied to is named next to it).

const set = (id: string, state: string, t = 0): StateSet => ({ t, id, state });
const last = <T>(a: T[]) => a[a.length - 1];
const CAR_HALF = SIZES.car.length / 2;
const RED = '#e53935';
const GREY = '#90a4ae';
const east = (x: number, y: number): Pose => ({ x, y, heading: 90 });
/** A still frame of the given poses, for a question. */
const still = (id: string, at: Record<string, Pose>, states: StateSet[]) => ({ id, duration: 500, at, states });

// ---------------------------------------------------------------------------------------------
// The three sign pictures are a `curbStreet()` with no corner and no hydrant, and one big sign on the grass below the
// sidewalk, on blue's right. The sign is ringed while its name is said.

/** Where the sign stands: its board is 88 px wide and fills the grass from the sidewalk down, ahead of where blue stops. */
const SIGN = { x: 222, y: 268, size: 88 };
const signOf = (kind: SignKind) => signProp(`sign-${kind}`, kind, SIGN.x, SIGN.y, { size: SIGN.size, post: false });
/** The top of the sidewalk: the box and the person stand from here down, spilling onto the grass. */
const WALK_TOP = CURB.curbBottom;
/** How big the box is (px square). */
export const BOX_PX = 28;

/** A cardboard box (something unloaded), `BOX_PX` square, its top edge at `top`. */
function boxProp(id: string, x: number, top: number): ExtraProp {
  const h = BOX_PX / 2;
  return {
    id,
    svg: `<g class="pic" data-prop="${id}"><rect x="${x - h}" y="${top}" width="${BOX_PX}" height="${BOX_PX}" rx="2" fill="#a1662f" stroke="#3e2723" stroke-width="2"/>` +
      line(x - h, top + h, x + h, top + h, { color: '#e0c08a', width: 5 }) + `</g>`,
  };
}

/** How wide the person is (px): about 1.6 times a `pedestrian` seen from above. */
export const FRIEND_W = 24;
/**
 * A person standing, seen from the front (`FRIEND_W` wide, about 40 px tall, head at the top), in an orange shirt
 * like a `pedestrian`; `highlight` rings them. `top` is the top of the head.
 */
function friendProp(id: string, x: number, top: number): ExtraProp {
  const dark = '#212121', shirt = '#ff7043', pants = '#37474f', skin = '#f1c27d';
  const g = (v: string) => `<g transform="translate(${x} ${top})">${v}</g>`;
  return {
    id,
    svg: `<g class="pic" data-prop="${id}">` + g(
      `<rect x="-7" y="25" width="6" height="15" rx="2" fill="${pants}" stroke="${dark}" stroke-width="1.2"/>` +
      `<rect x="1" y="25" width="6" height="15" rx="2" fill="${pants}" stroke="${dark}" stroke-width="1.2"/>` +
      `<path d="M-9 14 L-12 27 M9 14 L12 27" stroke="${shirt}" stroke-width="5" stroke-linecap="round"/>` +
      `<rect x="-9" y="11" width="18" height="17" rx="4" fill="${shirt}" stroke="${dark}" stroke-width="1.5"/>` +
      `<circle cx="0" cy="5.5" r="5.5" fill="${skin}" stroke="${dark}" stroke-width="1.2"/>` +
      `<path d="M-5.5 4 Q0 -3 5.5 4" fill="#3e2723" stroke="${dark}" stroke-width="1"/>`,
    ) + `</g>`,
  };
}

// 1–2. Blue stops by the curb next to the sign (card parking-signs-no-parking / -no-standing). Blue drives in along
// the parking lane at SPEED and, on "stop", slows steadily to a stop a little before the sign. Then what may be loaded
// or unloaded appears on the sidewalk beside blue, ringed, on its word: a box on "things" (NO PARKING only; its ring
// goes off on "people") and a person on "people". For NO STANDING, the person's ring moves to blue on "stay" ("You
// must stay in the car."). The question picture has blue driving along its lane toward the sign, with nothing on the
// sidewalk.
const STOP_X = 120;
const SLOW_FWD = 40;
const STOP_POSE = east(STOP_X, CURB.parkY);
/** The box and the person stand on the sidewalk beside blue, far enough apart that their rings don't touch. */
export const BOX_X = STOP_X - 40, FRIEND_X = STOP_X + 10;

function stopScene(o: {
  id: string; kind: SignKind;
  t: { signOn: number; signOff: number; stop: number; things?: number; people: number; stay?: number; ms: number };
}): SceneDef {
  const sign = signOf(o.kind);
  const box = boxProp('box', BOX_X, WALK_TOP);
  const friend = friendProp('friend', FRIEND_X, WALK_TOP);
  const props = o.t.things === undefined ? [sign, friend] : [sign, box, friend];
  const inTo = driveInTo(east(-30, CURB.parkY), east(STOP_X - SLOW_FWD, CURB.parkY), o.t.stop);
  const down = changeSpeed(last(inTo.track), SLOW_FWD, o.t.stop, SPEED, 0);
  const stopT = last(down).t;
  if (stopT > (o.t.things ?? o.t.people)) throw new Error(`${o.id}: blue must stop before anything is unloaded`);
  const stop = stopLineAhead('stop-curb', STOP_POSE);
  return {
    id: o.id, width: 300, height: 300,
    ...curbStreet({ hydrant: false, corner: 'none', props, lines: [stop] }),
    initialStates: { friend: 'hidden', ...(o.t.things === undefined ? {} : { [box.id]: 'hidden' }) },
    actors: [{ id: 'blue', kind: 'car', you: true, start: inTo.start }],
    steps: [
      {
        id: 'teach', duration: o.t.ms,
        states: [
          set(sign.id, 'highlight', o.t.signOn), set(sign.id, '', o.t.signOff),
          ...(o.t.things === undefined ? [] : [set(box.id, 'highlight', o.t.things), set(box.id, '', o.t.people)]),
          set('friend', 'highlight', o.t.people),
          ...(o.t.stay === undefined ? [] : [set('friend', '', o.t.stay), set('blue', 'highlight', o.t.stay)]),
        ],
        tracks: { blue: [...inTo.track, ...down, kf(STOP_POSE, o.t.ms)] },
        expect: [{ type: 'stopsBehind', actor: 'blue', line: stop.id, from: stopT, to: o.t.ms }],
      },
      still('question', { blue: east(40, 170) }, [
        set('blue', ''), set(sign.id, ''), set('friend', 'hidden'), ...(o.t.things === undefined ? [] : [set(box.id, 'hidden')]),
      ]),
    ],
  };
}

// Clip: "This sign says" 111–1138, "NO PARKING." 1291–1999, "You may stop" 2458–3041 ("stop" 2736),
// "for a short time," 3055–4040, "to load or unload" 4430–5888, "things" 5902, "or people." 6277–6832 ("people" 6388).
export const psNoParking = stopScene({
  id: 'parking-signs-no-parking', kind: 'no-parking',
  t: { signOn: 1291, signOff: 1999, stop: 2736, things: 5902, people: 6388, ms: 7300 },
});

// Clip: "This sign says" 125–1055, "NO STANDING." 1180–2041, "You may stop" 2513–3041 ("stop" 2750),
// "for a short time," 3055–3999, "only to pick up or drop off" 4500–6069, "people." 6083–6471,
// "You must stay in the car." 6930–8082 ("stay" 7263).
export const psNoStanding = stopScene({
  id: 'parking-signs-no-standing', kind: 'no-standing',
  t: { signOn: 1180, signOff: 2041, stop: 2750, people: 6083, stay: 7263, ms: 8500 },
});

// ---------------------------------------------------------------------------------------------
// 3. NO STOPPING (card parking-signs-no-stopping). Blue drives past the sign without stopping, slowly enough to stay
// in view for the whole clip. The things you may stop for appear one by one on a white card above the road, each on
// its word and ringed while it is named: a STOP sign ("traffic sign"), a traffic light with its red lamp lit
// ("traffic light") and a police officer ("officer"). A red car drives in the other lane and is ringed on "another
// car". The question picture has only blue and the sign.
// Clip: "This sign says" 125–1027, "NO STOPPING." 1152–1943, "You may stop here only to obey" 2402–4208
// ("obey" 3736), "a traffic sign," 4222–5235 ("traffic" 4291), "a traffic light," 5694–6555 ("traffic" 5736),
// "or an officer." 7027–7777 ("an" 7111), "Or to avoid a crash" 8236–9486, "with another car." 9500–10401
// ("another" 9680).
const ST = {
  signOn: 1152, signOff: 1943, panelOn: 3736, stopOn: 4291, stopOff: 5235, lightOn: 5736, lightOff: 6555,
  officerOn: 7111, officerOff: 7777, redGo: 7500, redOn: 9680, ms: 10900,
};
const BLUE_SLOW = 26;
const PANEL = { x: 12, y: 8, w: 276, h: 96 };
const PANEL_Y = PANEL.y + PANEL.h / 2;

function panelProp(id: string): ExtraProp {
  return {
    id,
    svg: `<g class="pic" data-prop="${id}"><rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.w}" height="${PANEL.h}" rx="10" ` +
      `fill="#fff" stroke="#212121" stroke-width="2"/></g>`,
  };
}

/** A police officer standing, seen from the front (about 76 px tall), one hand raised; `highlight` rings them. */
function officerProp(id: string, x: number, y: number): ExtraProp {
  const navy = '#1a237e', skin = '#f1c27d', dark = '#212121';
  const g = (s: string) => `<g transform="translate(${x} ${y})">${s}</g>`;
  return {
    id,
    svg: `<g class="pic" data-prop="${id}">` + g(
      // Legs, body, arms (the right one raised, palm out), head, cap with a brim, and a gold badge.
      `<rect x="-9" y="10" width="7" height="26" rx="2" fill="${navy}" stroke="${dark}" stroke-width="1.2"/>` +
      `<rect x="2" y="10" width="7" height="26" rx="2" fill="${navy}" stroke="${dark}" stroke-width="1.2"/>` +
      `<rect x="-12" y="-18" width="24" height="32" rx="5" fill="${navy}" stroke="${dark}" stroke-width="1.5"/>` +
      `<path d="M-11 -14 L-17 8" stroke="${navy}" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M11 -14 L19 -32" stroke="${navy}" stroke-width="6" stroke-linecap="round"/>` +
      `<circle cx="20" cy="-35" r="4" fill="${skin}" stroke="${dark}" stroke-width="1"/>` +
      `<circle cx="0" cy="-27" r="8" fill="${skin}" stroke="${dark}" stroke-width="1.2"/>` +
      `<rect x="-9" y="-40" width="18" height="7" rx="2" fill="${navy}" stroke="${dark}" stroke-width="1"/>` +
      `<rect x="-11" y="-34.5" width="22" height="3" rx="1.5" fill="${dark}"/>` +
      `<circle cx="-5" cy="-9" r="3" fill="#ffd600" stroke="${dark}" stroke-width="0.8"/>`,
    ) + `</g>`,
  };
}

const NS_SIGN = signOf('no-stopping');
const NS_PANEL = panelProp('card');
const NS_STOP = signProp('card-stop', 'stop', 62, PANEL_Y, { size: 66, post: false });
const NS_LIGHT = trafficLightProp('card-light', 150, PANEL_Y, { scale: 1.9, lamps: 'red' });
const NS_OFFICER = officerProp('card-officer', 234, PANEL_Y + 6);
const NS_MORE = [NS_PANEL, NS_STOP, NS_LIGHT, NS_OFFICER];
const NS_BLUE_START = east(-20, 170);
const NS_RED_START: Pose = { x: 360, y: 130, heading: 270 };

export const psNoStopping: SceneDef = {
  id: 'parking-signs-no-stopping', width: 300, height: 300,
  ...curbStreet({ hydrant: false, corner: 'none', props: [NS_SIGN, ...NS_MORE] }),
  initialStates: { ...Object.fromEntries(NS_MORE.map((p) => [p.id, 'hidden'])), ...partStates(NS_MORE) },
  actors: [
    { id: 'blue', kind: 'car', you: true, start: NS_BLUE_START },
    { id: 'red', kind: 'car', color: RED, start: NS_RED_START },
  ],
  steps: [
    {
      id: 'teach', duration: ST.ms,
      states: [
        set(NS_SIGN.id, 'highlight', ST.signOn), set(NS_SIGN.id, '', ST.signOff), set(NS_PANEL.id, '', ST.panelOn),
        set(NS_STOP.id, 'highlight', ST.stopOn), set(NS_STOP.id, '', ST.stopOff),
        set(NS_LIGHT.id, 'highlight', ST.lightOn), set(NS_LIGHT.id, '', ST.lightOff),
        set(NS_OFFICER.id, 'highlight', ST.officerOn), set(NS_OFFICER.id, '', ST.officerOff),
        set('red', 'highlight', ST.redOn),
      ],
      tracks: {
        blue: driveUntil(NS_BLUE_START, 0, ST.ms, { speed: BLUE_SLOW }),
        red: [kf(NS_RED_START, ST.redGo), ...driveUntil(NS_RED_START, ST.redGo, ST.ms)],
      },
    },
    still('question', { blue: east(40, 170), red: NS_RED_START }, [
      set('blue', ''), set('red', ''), set(NS_SIGN.id, ''), ...NS_MORE.map((p) => set(p.id, 'hidden')),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// 4–5. A parking lot in front of a sidewalk (cards parking-signs-reserved and -stripes). One row of spaces faces the
// sidewalk: a reserved space with the reserved parking sign (as pictured on manual p.44) in front of it on the
// sidewalk, and next to it a space with diagonal white stripes. Blue and two other cars are parked in ordinary
// spaces, noses toward the sidewalk; the reserved and striped spaces are empty.
// - teach-reserved. Clip: "This space" 125–749 ("space" 291), "is reserved." 875–1624 ("reserved" 1013),
//   "You may park here only with a permit or plates for persons with disabilities." 2097–6499,
//   "The person who got them must be in the car." 6972–8971. The reserved space glows from "space" to the end; the
//   sign is ringed while "reserved" is said.
// - teach-stripes. Clip: "Next to it" 111–652, "is a space with diagonal stripes." 666–2791 ("space" 875),
//   "Do not park there." 3250–4082, "It gives room for people with wheelchairs," 4541–6735,
//   "and for cars with special equipment." 6944–8846. The reserved space glows on "Next to it"; the striped space
//   glows from "space" to the end.
// - question: blue driving along the lane in front of the spaces; nothing glows.
const LOT = {
  top: 20, rowTop: 128, curbY: 184, sidewalkY: 188, spaceW: 32, firstX: 22, spaces: 8,
  laneId: 'lot', rowId: 'spaces',
};
const spaceX = (i: number) => LOT.firstX + i * LOT.spaceW;
const RESERVED_I = 3, STRIPES_I = 4;
const RES_X = spaceX(RESERVED_I), STR_X = spaceX(STRIPES_I);
/** A parked car's center: nose toward the sidewalk, 3 px short of the curb. */
const parkedIn = (i: number): Pose => ({ x: spaceX(i) + LOT.spaceW / 2, y: LOT.curbY - 3 - CAR_HALF, heading: 180 });
const RT = { resOn: 291, resSignOn: 1013, resSignOff: 1624, resMs: 9400, nextOn: 111, nextOff: 860, stripesOn: 875, stripesMs: 9300 };

function stripes(x: number, y: number, w: number, h: number): string {
  const clip = 'lot-stripes-clip';
  let s = `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#${clip})">`;
  for (let d = -h; d < w + h; d += 10) s += line(x + d, y + h, x + d + h, y, { width: 3.5 });
  return s + `</g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#fff" stroke-width="2.5"/>`;
}

function lotLayout(extra: ExtraProp[]) {
  const h = LOT.curbY - LOT.rowTop;
  const spaceLines = Array.from({ length: LOT.spaces + 1 }, (_, i) => line(spaceX(i), LOT.rowTop, spaceX(i), LOT.curbY, { width: 2.5 })).join('');
  const sign = signProp('sign-reserved', 'reserved-parking', RES_X + LOT.spaceW / 2, 244, { size: 106, post: false });
  const props = [sign, ...extra];
  return {
    sign,
    layout: {
      background: grass(300, 300) + road(0, LOT.top, 300, LOT.curbY - LOT.top) +
        `<rect x="0" y="${LOT.curbY}" width="300" height="${LOT.sidewalkY - LOT.curbY}" fill="#9e9e9e"/>` +
        `<rect x="0" y="${LOT.sidewalkY}" width="300" height="${300 - LOT.sidewalkY}" fill="#d7d7d7"/>` +
        spaceLines + stripes(STR_X, LOT.rowTop, LOT.spaceW, h) + props.map((p) => p.svg).join(''),
      lanes: [
        { id: LOT.laneId, x: -100, y: LOT.top, w: 500, h: LOT.rowTop - LOT.top, heading: 'any' as const },
        { id: LOT.rowId, x: 0, y: LOT.rowTop, w: 300, h, heading: 'any' as const },
      ],
      zones: [], lines: [], props: props.map((p) => p.id),
    },
  };
}

const GLOW_RES = laneGlow('glow-reserved', { x: RES_X, y: LOT.rowTop, w: LOT.spaceW, h: LOT.curbY - LOT.rowTop });
const GLOW_STR = laneGlow('glow-stripes', { x: STR_X, y: LOT.rowTop, w: LOT.spaceW, h: LOT.curbY - LOT.rowTop });
const LOT_L = lotLayout([GLOW_RES, GLOW_STR]);
const L_BLUE = parkedIn(1);
const L_RED = parkedIn(5);
const L_GREY = parkedIn(7);
const L_STOP = stopLineAhead('stop-park', L_BLUE);

export const psLot: SceneDef = {
  id: 'parking-signs-lot', width: 300, height: 300,
  ...LOT_L.layout, lines: [L_STOP],
  initialStates: { [GLOW_RES.id]: 'hidden', [GLOW_STR.id]: 'hidden' },
  actors: [
    { id: 'blue', kind: 'car', you: true, start: L_BLUE },
    { id: 'red', kind: 'car', color: RED, start: L_RED },
    { id: 'grey', kind: 'car', color: GREY, start: L_GREY },
  ],
  steps: [
    {
      id: 'teach-reserved', duration: RT.resMs,
      states: [
        set(GLOW_RES.id, '', RT.resOn), set(LOT_L.sign.id, 'highlight', RT.resSignOn), set(LOT_L.sign.id, '', RT.resSignOff),
      ],
      expect: [{ type: 'stopsBehind', actor: 'blue', line: L_STOP.id, from: 0, to: RT.resMs }],
    },
    {
      id: 'teach-stripes', duration: RT.stripesMs,
      at: { blue: L_BLUE },
      states: [
        set(GLOW_RES.id, 'hidden'), set(LOT_L.sign.id, ''),
        set(GLOW_RES.id, '', RT.nextOn), set(GLOW_RES.id, 'hidden', RT.nextOff), set(GLOW_STR.id, '', RT.stripesOn),
      ],
      expect: [{ type: 'stopsBehind', actor: 'blue', line: L_STOP.id, from: 0, to: RT.stripesMs }],
    },
    still('question', { blue: east(RES_X - 10, 80) }, [set(GLOW_RES.id, 'hidden'), set(GLOW_STR.id, 'hidden'), set(LOT_L.sign.id, '')]),
  ],
};

export const parkingSignsScenes: SceneDef[] = [
  psNoParking, psNoStanding, psNoStopping, psLot,
  signCloseup('parking-signs-reserved-sign', 'reserved-parking'),
];

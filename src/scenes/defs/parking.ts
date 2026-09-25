import type { ActorDef, Pose, SceneDef, StateSet } from '../types';
import { SIZES } from '../engine';
import {
  CURB, curbStreet, feetPx, laneGlow, measureProp, partStates, signProp, stopLineAhead, trafficLightProp, WHEEL_OUT, wheelsProp,
  type ExtraProp,
} from '../layouts';
import { changeSpeed, driveInTo, kf, SPEED } from '../paths';
import { set } from '../steps';

// Parking, manual pages 42 (How to Park) and 43 (Parking Regulations). Times are in ms and follow the word timings in
// public/audio/card-parking-*.json (the word each time is tied to is named next to it). Digits often get no word
// timing, so every "N feet" arrow shows on the word before the number is said.
// Every scene is a `curbStreet()`: blue's street runs east (lane center y 170) with a parking lane along the curb
// below it. Parked cars stand still in the parking lane (center y CURB.parkY, wheels 1 foot from the curb), placed
// with `at` poses. Every distance is drawn to scale with `feetPx` (a 36 px car stands for 15 feet) and labeled exactly
// as the card's quote gives it. Every parked car in a picture is parked legally by all the rules in this lesson.

const last = <T>(a: T[]) => a[a.length - 1];
const LANE_Y = 170;
const CAR_HALF = SIZES.car.length / 2;
const CAR_SIDE = SIZES.car.width / 2;
const GREY = '#90a4ae';
const RED = '#e53935';
const east = (x: number, y = LANE_Y): Pose => ({ x, y, heading: 90 });
const parked = (x: number): Pose => east(x, CURB.parkY);
const car = (id: string, start: Pose, color?: string): ActorDef =>
  id === 'blue' ? { id, kind: 'car', you: true, start } : { id, kind: 'car', color, start };
/** A still frame of the given poses, for a question. */
const still = (id: string, at: Record<string, Pose>, states: StateSet[], expect?: SceneDef['steps'][number]['expect']) =>
  ({ id, duration: 500, at, states, ...(expect ? { expect } : {}) });

// ---------------------------------------------------------------------------------------------
// 1. Getting ready to parallel park (card parking-start): find a space, check mirrors and signal, stop next to the car
//    in front of the space, about 2 feet from it. Only the manual's step 1 is shown.
// Clip: "Find a space" 152–874 ("space" 416), "big enough for your car." 888–2055, "Check your mirrors" 2513–3430,
// "and signal." 3583–4263 ("signal" 3736), "Stop" 4722, "next to the car in front of the space." 5111–7055
// ("car" 5625), "Leave about" 7500–7985 ("about" 7680), "2 feet" (no timing) 7985–8638, "between the cars." 8638–9652.
// A red car is parked in front of an empty space and a grey car behind it. The space glows while it is named. Blue
// drives in at SPEED, close to the right edge of its lane, turns on its right signal on "signal", and on "Stop"
// slows steadily to a stop next to the red car (ringed from "car" to "space."), its side 2 feet from red's side.
// The "about 2 feet" arrow shows on "about", far enough right of the cars that blue's signal lamps don't cover it.
// Blue's signal stays on to the end.
const S = { spaceOn: 416, spaceOff: 2055, signal: 3736, slow: 4722, redOn: 5625, redOff: 7055, gapOn: 7680, ms: 10100 };
const S_RED = parked(160);
const S_GREY = parked(70);
/** Blue's side is 2 feet (feetPx(2) px) from red's side. */
const S_BLUE_Y = CURB.parkY - 2 * CAR_SIDE - feetPx(2);
const S_BLUE_STOP = east(S_RED.x, S_BLUE_Y);
const S_SLOW_FWD = 40;
const S_IN = driveInTo(east(-60, S_BLUE_Y), east(S_BLUE_STOP.x - S_SLOW_FWD, S_BLUE_Y), S.slow);
const S_DOWN = changeSpeed(last(S_IN.track), S_SLOW_FWD, S.slow, SPEED, 0);
/** When blue has stopped next to red (for tests). */
export const S_STOP_T = last(S_DOWN).t;
const S_LINE = stopLineAhead('stop-park', S_BLUE_STOP);
const S_SPACE = laneGlow('glow-space', { x: S_GREY.x + CAR_HALF, y: CURB.parkTop, w: S_RED.x - S_GREY.x - 2 * CAR_HALF, h: CURB.curbY - CURB.parkTop });
const S_GAP = measureProp('gap-2', S_BLUE_Y + CAR_SIDE, CURB.parkY - CAR_SIDE, S_RED.x + CAR_HALF + 16, 'about 2 feet',
  { vertical: true, reach: [S_RED.x + CAR_HALF - 2, S_RED.x + CAR_HALF - 2] });

export const parkingStart: SceneDef = {
  id: 'parking-start', width: 300, height: 300,
  ...curbStreet({ hydrant: false, corner: 'none', props: [S_SPACE, S_GAP], lines: [S_LINE] }),
  initialStates: { [S_SPACE.id]: 'hidden', [S_GAP.id]: 'hidden' },
  actors: [car('blue', S_IN.start), car('red', S_RED, RED), car('grey', S_GREY, GREY)],
  steps: [
    {
      id: 'teach', duration: S.ms,
      states: [
        set(S_SPACE.id, '', S.spaceOn), set(S_SPACE.id, 'hidden', S.spaceOff), set('blue', 'signal-right', S.signal),
        set('red', 'highlight', S.redOn), set('red', '', S.redOff), set(S_GAP.id, '', S.gapOn),
      ],
      tracks: { blue: [...S_IN.track, ...S_DOWN, kf(S_BLUE_STOP, S.ms)] },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: S_LINE.id, from: S_STOP_T, to: S.ms }],
    },
    // Blue driving along, clearly behind the grey car (not beside any car); the space ahead is empty. No signal, glow or arrow.
    still('question-where', { blue: east(15), red: S_RED, grey: S_GREY },
      [set('blue', ''), set('red', ''), set(S_SPACE.id, 'hidden'), set(S_GAP.id, 'hidden')]),
    // Blue stopped next to the red car, signal still on, with no arrow or number.
    still('question-gap', { blue: S_BLUE_STOP, red: S_RED, grey: S_GREY },
      [set('blue', 'signal-right'), set('red', ''), set(S_SPACE.id, 'hidden'), set(S_GAP.id, 'hidden')],
      [{ type: 'stopsBehind', actor: 'blue', line: S_LINE.id, from: 0, to: 500 }]),
  ],
};

// ---------------------------------------------------------------------------------------------
// 2. Parked: your wheels no more than 1 foot from the curb (card parking-curb).
// Clip: "You are parked" 111–749, "next to the curb." 763–1610 ("curb" 1208), "Your wheels" 2069–2611
// ("wheels" 2236), "must be no more than" 2625–3749 ("than" 3583), "1 foot" 3763–4374, "from the curb." 4388–5096.
// Blue is parked between a grey car and a red car, with room ahead and behind. Every parked car's tires show, 1 foot
// from the curb. Blue is ringed while "You are parked" is said, the curb on "curb", blue's tires on "wheels"; the
// "1 foot" arrow (its heads outside the ends, pointing in) shows on "than".
const C = { blueOn: 111, blueOff: 749, curbOn: 1208, curbOff: 1610, wheelsOn: 2236, wheelsOff: 3583, gapOn: 3583, ms: 5500 };
const C_BLUE = parked(150);
const C_GREY = parked(60);
const C_RED = parked(262);
const C_WHEELS = wheelsProp('wheels-blue', C_BLUE);
const C_GAP = measureProp('curb-1', CURB.parkY + CAR_SIDE + WHEEL_OUT, CURB.curbY, C_BLUE.x + CAR_HALF + 8, '1 foot',
  { vertical: true, reach: [C_BLUE.x + CAR_HALF - 4, C_BLUE.x + CAR_HALF - 4] });
const C_LINE = stopLineAhead('stop-park', C_BLUE);

export const parkingCurb: SceneDef = {
  id: 'parking-curb', width: 300, height: 300,
  ...curbStreet({
    hydrant: false, corner: 'none', lines: [C_LINE],
    props: [wheelsProp('wheels-grey', C_GREY), C_WHEELS, wheelsProp('wheels-red', C_RED), C_GAP],
  }),
  initialStates: { [C_GAP.id]: 'hidden' },
  actors: [car('blue', C_BLUE), car('red', C_RED, RED), car('grey', C_GREY, GREY)],
  steps: [
    {
      id: 'teach', duration: C.ms,
      states: [
        set('blue', 'highlight', C.blueOn), set('blue', '', C.blueOff), set(CURB.curbId, 'highlight', C.curbOn), set(CURB.curbId, '', C.curbOff),
        set(C_WHEELS.id, 'highlight', C.wheelsOn), set(C_WHEELS.id, '', C.wheelsOff), set(C_GAP.id, '', C.gapOn),
      ],
      expect: [{ type: 'stopsBehind', actor: 'blue', line: C_LINE.id, from: 0, to: C.ms }],
    },
    // Blue parked by the curb, with no arrow or number.
    still('question', { blue: C_BLUE, red: C_RED, grey: C_GREY },
      [set('blue', ''), set(CURB.curbId, ''), set(C_WHEELS.id, ''), set(C_GAP.id, 'hidden')],
      [{ type: 'stopsBehind', actor: 'blue', line: C_LINE.id, from: 0, to: 500 }]),
  ],
};

// ---------------------------------------------------------------------------------------------
// The next three pictures share one pattern: blue parked with its front exactly the quoted distance short of the thing
// named (a fire hydrant, a crosswalk, a STOP sign), a grey car parked well behind it, and a "N feet" arrow on the
// grass below, with dashed guides up to blue's front and to the thing. The thing is ringed while it is named, blue
// from "Park" to the end, and the arrow shows on "least" (the number itself gets no timing). The question picture
// has blue driving along its lane toward the thing, with the parking lane empty in front of it and no arrow.
function distanceScene(o: {
  id: string; layout: Parameters<typeof curbStreet>[0]; thing: string; thingX: number; reachTo: number; feet: number;
  arrowY: number; label: 'above' | 'below';
  t: { thingOn: number; thingOff: number; park: number; parkOff?: number; gapOn: number; ms: number };
  /**
   * Extra props shown only in `teach` (hidden at first and in the question), with their teach states. Their `parts`
   * (e.g. a traffic light's lamps) keep their starting state throughout.
   */
  more?: { props: ExtraProp[]; states: StateSet[] };
}): SceneDef {
  const more = o.more ?? { props: [], states: [] };
  const hideMore = Object.fromEntries(more.props.map((p) => [p.id, 'hidden']));
  const blue = parked(o.thingX - feetPx(o.feet) - CAR_HALF);
  const grey = parked(40);
  const gap = measureProp(`gap-${o.feet}`, blue.x + CAR_HALF, o.thingX, o.arrowY, `${o.feet} feet`,
    { label: o.label, reach: [CURB.parkY, o.reachTo] });
  const stop = stopLineAhead('stop-park', blue);
  const layout = curbStreet({ ...o.layout, props: [gap, ...more.props], lines: [stop] });
  return {
    id: o.id, width: 300, height: 300,
    ...layout,
    initialStates: { [gap.id]: 'hidden', ...hideMore, ...partStates(more.props) },
    actors: [car('blue', blue), car('grey', grey, GREY)],
    steps: [
      {
        id: 'teach', duration: o.t.ms,
        states: [
          set(o.thing, 'highlight', o.t.thingOn), set(o.thing, '', o.t.thingOff),
          set('blue', 'highlight', o.t.park), ...(o.t.parkOff ? [set('blue', '', o.t.parkOff)] : []), set(gap.id, '', o.t.gapOn),
          ...more.states,
        ],
        expect: [{ type: 'stopsBehind', actor: 'blue', line: stop.id, from: 0, to: o.t.ms }],
      },
      still('question', { blue: east(60), grey }, [
        set('blue', ''), set(o.thing, ''), set(gap.id, 'hidden'), ...more.props.map((p) => set(p.id, 'hidden')),
      ]),
    ],
  };
}

// 3. A fire hydrant: park at least 15 feet away (card parking-hydrant).
// Clip: "This is a fire hydrant." 125–1485 ("fire" 513), "Park at least" 1958–2554 ("least" 2291),
// "15 feet" (no timing) 2554–3333, "away from it." 3333–3985.
const H_X = 170;
export const parkingHydrant = distanceScene({
  id: 'parking-hydrant', layout: { hydrant: H_X, corner: 'none' }, thing: CURB.hydrantId, thingX: H_X,
  reachTo: CURB.hydrantY, feet: 15, arrowY: 252, label: 'below',
  t: { thingOn: 513, thingOff: 1485, park: 1958, gapOn: 2291, ms: 4400 },
});

// 4. A crosswalk at an intersection: park at least 20 feet away (card parking-crosswalk). No STOP sign here, so
//    blue can park at exactly 20 feet.
// Clip: "This crosswalk" 125–1041 ("crosswalk" 291), "is at an intersection." 1166–2221, "Park at least" 2694–3318
// ("least" 3041), "20 feet" (no timing) 3318–3888, "away from it." 3888–4582.
export const parkingCrosswalk = distanceScene({
  id: 'parking-crosswalk', layout: { hydrant: false, corner: 'crosswalk' }, thing: CURB.crosswalkId,
  thingX: CURB.crosswalkX[0], reachTo: CURB.curbY, feet: 20, arrowY: 252, label: 'below',
  t: { thingOn: 291, thingOff: 2221, park: 2694, gapOn: 3041, ms: 5000 },
});

// 5. A STOP sign: park at least 30 feet away; the same goes for a YIELD sign or a traffic light (card
//    parking-stop-sign). Blue's front is then more than 20 feet from the crosswalk too.
// Clip: "This is a STOP sign." 125–1193 ("STOP" 444), "Park at least" 1666–2319 ("least" 2000),
// "30 feet" (no timing) 2319–2944, "away from it." 2944–3638, "Also park" (no timing) 3638–4750,
// "at least 30 feet from" 4750–5957, "a YIELD sign" 5972–6846 ("YIELD" 6013), "or a traffic light." 7013–7943
// ("traffic" 7180). Blue's ring goes off after "it.", before "Also". A big YIELD sign and a traffic light (all
// three lamps lit, so it reads as "a traffic light", not one color) appear on the grass across the street, each
// ringed on its name; the YIELD sign's ring goes off on "or", the light's stays on to the end.
const Y_SIGN = signProp('sign-yield', 'yield', 95, 58, { size: 46, post: false });
const T_LIGHT = trafficLightProp('traffic-light', 170, 58, { scale: 1.6, lamps: 'red yellow green' });
/** `parkOff`: blue's ring goes off in the gap after "it." (ends 3638), before "Also" (no timing). */
const sp = { parkOff: 3900, yieldOn: 6013, yieldOff: 7013, lightOn: 7180 };
export const parkingStopSign = distanceScene({
  id: 'parking-stop-sign', layout: { hydrant: false, corner: 'stop' }, thing: CURB.signId, thingX: CURB.signX,
  reachTo: 284, feet: 30, arrowY: 291, label: 'above',
  t: { thingOn: 444, thingOff: 1193, park: 1666, parkOff: sp.parkOff, gapOn: 2000, ms: 8400 },
  more: {
    props: [Y_SIGN, T_LIGHT],
    states: [
      set(Y_SIGN.id, 'highlight', sp.yieldOn), set(Y_SIGN.id, '', sp.yieldOff), set(T_LIGHT.id, 'highlight', sp.lightOn),
    ],
  },
});

export const parkingScenes: SceneDef[] = [parkingStart, parkingCurb, parkingHydrant, parkingCrosswalk, parkingStopSign];

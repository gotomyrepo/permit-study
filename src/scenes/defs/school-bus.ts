import type { ActorDef, Pose, SceneDef, StateSet, Zone } from '../types';
import { SIZES } from '../engine';
import { laneGlow, measureProp, median, stopLineAhead, twoLane } from '../layouts';
import { changeSpeed, drive, driveUntil, kf, SPEED } from '../paths';

// School buses, manual page 40. Times are in ms and follow the word timings in
// public/audio/card-school-bus-*.json (the word each time is tied to is named next to it). Digits get no word
// timing of their own, so "20 feet" is placed in the gap between the words around it.
// Blue always drives east (lane center y 170). Every vehicle drives at a steady SPEED (45 px/s), except where the
// lesson is about slowing: blue slows to a stop with `changeSpeed`, starting on the word "stop", and later drives
// on slowly past the children. A stopped bus has state `stop-arm flashing`: its stop arm is out and its red roof
// lights are lit (only their halos blink, so a still picture shows them on). `warning` lights its yellow lights.
// Blue always stops with its front FEET_20 px (20 feet at this scale, where a 36 px car is 15 feet) or more from the
// bus, and a stop line 2 px in front of it (`stopLineAhead`) lets `stopsBehind` prove it stays there.

const set = (id: string, state: string, t = 0): StateSet => ({ t, id, state });
const last = <T>(a: T[]) => a[a.length - 1];
const RED = 'stop-arm flashing';
const RED_ON = 'stop-arm flashing highlight';
const YELLOW = 'warning';
const YELLOW_ON = 'warning highlight';

/** 20 feet in scene px: a 36 px car stands for a 15-foot car, so 1 foot is 2.4 px. */
export const FEET_20 = 48;
const LANE_Y = 170;
const WB_Y = 130;
const CAR_HALF = SIZES.car.length / 2;
const BUS_HALF = SIZES.bus.length / 2;
/** Where a pose's front is, along x (all poses here face straight east or west). */
const frontX = (p: Pose, half: number) => p.x + (p.heading === 90 ? half : -half);

const blueCar = (start: Pose): ActorDef => ({ id: 'blue', kind: 'car', you: true, start });
const bus = (start: Pose): ActorDef => ({ id: 'bus', kind: 'bus', start });
const child = (id: string, x: number): ActorDef => ({ id, kind: 'pedestrian', start: { x, y: 214, heading: 0 } });

/** Blue slows steadily from SPEED to a stop over `fwd` px, starting at t0, ending at `stop`. */
function slowToStop(stop: Pose, fwd: number, t0: number) {
  const from: Pose = { ...stop, x: stop.x - fwd };
  return changeSpeed(from, fwd, t0, SPEED, 0);
}
/** Blue waits off screen at x -60 (in its lane), then drives at SPEED so it reaches `to` at `t1`. */
function driveInTo(to: Pose, t1: number) {
  const start: Pose = { x: -60, y: LANE_Y, heading: 90 };
  const go = t1 - Math.round(((to.x - start.x) / SPEED) * 1000);
  if (go <= 0) throw new Error(`driveInTo: blue would have to start before t=0 (t=${go})`);
  const track = drive(start, to.x - start.x, go);
  track[track.length - 1].t = t1; // absorb rounding so the slow-down can start exactly at t1
  return { start, track: [kf(start, go), ...track] };
}

// ---------------------------------------------------------------------------------------------
// 1. Yellow lights: the bus is getting ready to stop, so slow down and get ready to stop too.
// Clip: "school bus ahead" 194–1300, "flashing yellow lights." 1486–3000, "getting ready to stop." 3569–4600,
// "Slow down," 5152–5900, "get ready to stop too." 6263–7471.
// The bus drives ahead at SPEED with its yellow lights on, ringed while it and its lights are named. On "getting"
// it slows down to a crawl (8 px/s). Blue follows 70 px behind at SPEED and slows to the same crawl on "Slow".
const Y_BUS_START: Pose = { x: 32, y: LANE_Y, heading: 90 }; // rear at x 0: fully on screen when named
const Y_BLUE_START: Pose = { x: Y_BUS_START.x - BUS_HALF - 70 - CAR_HALF, y: LANE_Y, heading: 90 };
const Y_BUS_ON = 194;
const Y_BUS_OFF = 3000;
const Y_BUS_SLOW = 3569; // "getting"
const Y_BLUE_SLOW = 5152; // "Slow"
const CRAWL = 8;
const Y_MS = 7900;
const Y_BUS_TO = drive(Y_BUS_START, (SPEED * Y_BUS_SLOW) / 1000, 0);
const Y_BUS_DOWN = changeSpeed(last(Y_BUS_TO), 35, Y_BUS_SLOW, SPEED, CRAWL);
const Y_BUS_TRACK = [...Y_BUS_TO, ...Y_BUS_DOWN, ...driveUntil(last(Y_BUS_DOWN), last(Y_BUS_DOWN).t, Y_MS, { speed: CRAWL })];
const Y_BLUE_TO = drive(Y_BLUE_START, (SPEED * Y_BLUE_SLOW) / 1000, 0);
const Y_BLUE_DOWN = changeSpeed(last(Y_BLUE_TO), 30, Y_BLUE_SLOW, SPEED, CRAWL);
const Y_BLUE_TRACK = [...Y_BLUE_TO, ...Y_BLUE_DOWN, ...driveUntil(last(Y_BLUE_DOWN), last(Y_BLUE_DOWN).t, Y_MS, { speed: CRAWL })];
/** When the bus and blue start slowing (for tests). */
export const Y_TIMES = { busSlow: Y_BUS_SLOW, blueSlow: Y_BLUE_SLOW };

export const schoolBusYellow: SceneDef = {
  id: 'school-bus-yellow', width: 300, height: 300,
  ...twoLane(),
  initialStates: { bus: YELLOW },
  actors: [blueCar(Y_BLUE_START), bus(Y_BUS_START)],
  steps: [
    {
      id: 'teach', duration: Y_MS,
      states: [set('bus', YELLOW_ON, Y_BUS_ON), set('bus', YELLOW, Y_BUS_OFF)],
      tracks: { bus: Y_BUS_TRACK, blue: Y_BLUE_TRACK },
    },
    {
      // Blue driving behind the bus, which has its yellow lights on.
      id: 'question-yellow', duration: 500,
      states: [set('bus', YELLOW)],
      at: { blue: { x: 110, y: LANE_Y, heading: 90 }, bus: { x: 200, y: LANE_Y, heading: 90 } },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 2. The bus has stopped with its red lights flashing: stop at least 20 feet away (card school-bus-stop, `teach`),
//    stay stopped until it moves, then drive slowly past the children (card school-bus-wait, `wait`).
// Stop clip: "school bus has stopped." 194–1500, "red lights are flashing." 2125–3300, "You must stop" 3763–4400
// ("stop" 4111), "before you reach the bus." 4416–5600, "Stop at least" 6180–6860, "20 feet" 6860–7444, "away." 7444–7805.
// The bus stands still with its stop arm out and red lights on, ringed from "school bus" to "flashing". Two children
// stand at the side of the road by it. Blue drives in at SPEED and, on "stop", slows steadily to a stop 50 px behind
// the bus; the "20 feet" arrow between them shows on "20".
const S_BUS: Pose = { x: 230, y: LANE_Y, heading: 90 };
const S_BUS_REAR = S_BUS.x - BUS_HALF;
export const S_BLUE_STOP: Pose = { x: S_BUS_REAR - FEET_20 - 2 - CAR_HALF, y: LANE_Y, heading: 90 };
const S_LINE = stopLineAhead('stop-bus', S_BLUE_STOP);
const S_SLOW = 4111; // "stop"
const S_SLOW_FWD = 45;
const S_DOWN = slowToStop(S_BLUE_STOP, S_SLOW_FWD, S_SLOW);
const S_IN = driveInTo({ ...S_BLUE_STOP, x: S_BLUE_STOP.x - S_SLOW_FWD }, S_SLOW);
/** When blue has stopped (before "Stop at least"). */
export const S_STOP_T = last(S_DOWN).t;
const S_BUS_ON = 194;
const S_BUS_OFF = 3300;
const S_GAP_ON = 6860; // "20"
const S_MS = 8200;
const S_GAP = measureProp('gap-20', frontX(S_BLUE_STOP, CAR_HALF), S_BUS_REAR, 200, '20 feet', { reach: [LANE_Y, LANE_Y] });
/** Where the bus stood: it must drive out of it before blue drives into it. */
const S_SPOT: Zone = { id: 'bus-spot', x: S_BUS_REAR, y: 150, w: SIZES.bus.length, h: 40 };
/** The grass at the side of the road, where the children stand. */
const S_ROADSIDE: Zone = { id: 'roadside', x: 0, y: 192, w: 300, h: 40 };
const KIDS = ['kid-1', 'kid-2'];
// Wait clip: "Stay stopped until the bus" 125–1600, "starts moving again." 1750–2900, "Then" 3263,
// "look for children" 3402–4150, "by the side of the road." 4194–5400, "Drive slowly" 5763–6500,
// "until you pass them." 6569–7541.
// The bus's stop arm folds and its red lights go off on "starts", and it pulls away at SPEED. Blue stays stopped
// until "Then", then drives on slowly (20 px/s) toward the children, who are ringed while they are named.
const W_BUS_GO = 1750; // "starts"
const W_BLUE_GO = 3263; // "Then"
const W_KIDS_ON = 3402;
const W_KIDS_OFF = 5400;
const W_SLOW = 20;
const W_MS = 7900;
const W_BUS_OUT: Pose = { ...S_BUS, x: 370 };
const W_BUS_TRACK = [...drive(S_BUS, W_BUS_OUT.x - S_BUS.x, W_BUS_GO, { fromStop: true }), kf(W_BUS_OUT, W_MS)];

export const schoolBusStop: SceneDef = {
  id: 'school-bus-stop', width: 300, height: 300,
  ...twoLane({ lines: [S_LINE], zones: [S_SPOT, S_ROADSIDE], props: [S_GAP] }),
  initialStates: { bus: RED, [S_GAP.id]: 'hidden' },
  actors: [blueCar(S_IN.start), bus(S_BUS), child('kid-1', 215), child('kid-2', 242)],
  steps: [
    {
      id: 'teach', duration: S_MS,
      states: [set('bus', RED_ON, S_BUS_ON), set('bus', RED, S_BUS_OFF), set(S_GAP.id, '', S_GAP_ON)],
      tracks: { blue: [...S_IN.track, ...S_DOWN, kf(S_BLUE_STOP, S_MS)] },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: S_LINE.id, from: S_STOP_T, to: S_MS }],
    },
    {
      id: 'wait', duration: W_MS,
      states: [
        set(S_GAP.id, 'hidden'), set('bus', '', W_BUS_GO),
        ...KIDS.flatMap((k) => [set(k, 'highlight', W_KIDS_ON), set(k, '', W_KIDS_OFF)]),
      ],
      tracks: {
        bus: W_BUS_TRACK,
        blue: [kf(S_BLUE_STOP, W_BLUE_GO), ...driveUntil(S_BLUE_STOP, W_BLUE_GO, W_MS, { fromStop: true, speed: W_SLOW })],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: S_LINE.id, from: 0, to: W_BLUE_GO },
        { type: 'entersAfter', actor: 'blue', other: 'bus', zone: S_SPOT.id },
      ],
    },
    {
      // Blue driving up behind the stopped bus (stop arm out, red lights on). No distance is shown.
      id: 'question-stop', duration: 500,
      states: [set('bus', RED), set(S_GAP.id, 'hidden')],
      at: { blue: { x: 60, y: LANE_Y, heading: 90 }, bus: S_BUS },
    },
    {
      // Blue stopped behind the bus, whose red lights are still on.
      id: 'question-wait', duration: 500,
      states: [set('bus', RED), set(S_GAP.id, 'hidden')],
      at: { blue: S_BLUE_STOP, bus: S_BUS },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: S_LINE.id, from: 0, to: 500 }],
    },
    {
      // The bus has gone; blue is still stopped, and the children are at the side of the road.
      id: 'question-after', duration: 500,
      states: [set('bus', 'hidden'), set(S_GAP.id, 'hidden')],
      at: { blue: S_BLUE_STOP, bus: W_BUS_OUT },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: S_LINE.id, from: 0, to: 500 }],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 3. A bus stopped in the other lane: stop for it too, at least 20 feet away.
// Clip: "school bus has stopped" 180–1400, "in the other lane." 1402–2200, "red lights are flashing." 2777–3900,
// "You must stop" 4416–5000 ("stop" 4736), "for it too," 5041–5708, "at least" 6000–6416, "20 feet" 6416–6958, "away." 6958–7319.
// The bus stands still in the westbound lane (stop arm out toward blue's lane, red lights on), ringed while it and
// its lights are named; the other lane glows on "other lane". Blue drives in at SPEED and, on "stop", slows to a
// stop with its front 48 px short of the bus's front; the "20 feet" arrow shows on "20".
const O_BUS: Pose = { x: 200, y: WB_Y, heading: 270 };
const O_BUS_FRONT = frontX(O_BUS, BUS_HALF);
const O_BLUE_STOP: Pose = { x: O_BUS_FRONT - FEET_20 - CAR_HALF, y: LANE_Y, heading: 90 };
export const O_LINE = stopLineAhead('stop-bus', O_BLUE_STOP);
const O_SLOW = 4736; // "stop"
const O_SLOW_FWD = 40;
const O_DOWN = slowToStop(O_BLUE_STOP, O_SLOW_FWD, O_SLOW);
const O_IN = driveInTo({ ...O_BLUE_STOP, x: O_BLUE_STOP.x - O_SLOW_FWD }, O_SLOW);
const O_STOP_T = last(O_DOWN).t;
const O_MS = 7700;
const O_GLOW = laneGlow('glow-other', { x: 0, y: 110, w: 300, h: 40 });
const O_GAP = measureProp('gap-20', frontX(O_BLUE_STOP, CAR_HALF), O_BUS_FRONT, 200, '20 feet', { reach: [LANE_Y, WB_Y] });

export const schoolBusOncoming: SceneDef = {
  id: 'school-bus-oncoming', width: 300, height: 300,
  ...twoLane({ lines: [O_LINE], props: [O_GLOW, O_GAP] }),
  initialStates: { bus: RED, [O_GLOW.id]: 'hidden', [O_GAP.id]: 'hidden' },
  actors: [blueCar(O_IN.start), bus(O_BUS)],
  steps: [
    {
      id: 'teach', duration: O_MS,
      states: [
        set('bus', RED_ON, 180), set('bus', RED, 2200), set(O_GLOW.id, '', 1402), set(O_GLOW.id, 'hidden', 2777),
        set('bus', RED_ON, 2777), set('bus', RED, 3900), set(O_GAP.id, '', 6416),
      ],
      tracks: { blue: [...O_IN.track, ...O_DOWN, kf(O_BLUE_STOP, O_MS)] },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: O_LINE.id, from: O_STOP_T, to: O_MS }],
    },
    {
      // Blue driving toward the bus stopped in the other lane (stop arm out, red lights on).
      id: 'question-oncoming', duration: 500,
      states: [set('bus', RED), set(O_GLOW.id, 'hidden'), set(O_GAP.id, 'hidden')],
      at: { blue: { x: 40, y: LANE_Y, heading: 90 } },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 4. A divided highway (a grass median down the middle): the bus is on the other side, and blue still stops.
// Clip: "school bus" 291–1000, "is on the other side of a divided highway." 1069–3300 ("other" 1430),
// "red lights are flashing." 3861–5300, "You must still stop" 5500–6300 ("stop" 6000), "for it." 6319–6693.
// The bus stands still on the far side of the median, ringed while it and its lights are named; the far side glows
// from "other" to the end of "highway". Blue drives in at SPEED and, on "stop", slows to a stop 48 px short of the
// bus's front.
const D_SLOW = 6000; // "stop"
const D_SLOW_FWD = 30;
const D_DOWN = slowToStop(O_BLUE_STOP, D_SLOW_FWD, D_SLOW);
const D_IN = driveInTo({ ...O_BLUE_STOP, x: O_BLUE_STOP.x - D_SLOW_FWD }, D_SLOW);
const D_STOP_T = last(D_DOWN).t;
const D_MS = 7800;
const D_MED = median();
const D_GLOW = laneGlow('glow-other', { x: 0, y: 110, w: 300, h: 31 });

export const schoolBusDivided: SceneDef = {
  id: 'school-bus-divided', width: 300, height: 300,
  ...twoLane({ lines: [O_LINE], props: [...D_MED.props, D_GLOW] }),
  initialStates: { bus: RED, [D_GLOW.id]: 'hidden' },
  actors: [blueCar(D_IN.start), bus(O_BUS)],
  steps: [
    {
      id: 'teach', duration: D_MS,
      states: [
        set('bus', RED_ON, 291), set('bus', RED, 1069), set(D_GLOW.id, '', 1430), set(D_GLOW.id, 'hidden', 3694),
        set('bus', RED_ON, 3861), set('bus', RED, 5300),
      ],
      tracks: { blue: [...D_IN.track, ...D_DOWN, kf(O_BLUE_STOP, D_MS)] },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: O_LINE.id, from: D_STOP_T, to: D_MS }],
    },
    {
      // Blue driving toward the bus stopped on the far side of the median (stop arm out, red lights on).
      id: 'question-divided', duration: 500,
      states: [set('bus', RED), set(D_GLOW.id, 'hidden')],
      at: { blue: { x: 40, y: LANE_Y, heading: 90 } },
    },
  ],
};

export const schoolBusScenes: SceneDef[] = [schoolBusYellow, schoolBusStop, schoolBusOncoming, schoolBusDivided];

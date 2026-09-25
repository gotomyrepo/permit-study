import type { ActorDef, Pose, SceneDef, StateSet } from '../types';
import { SIZES } from '../engine';
import { label } from '../parts';
import { FOG_EDGE_PX, fogBank, signCloseup, signPair, signProp, speedGauge, twoLane, type ExtraProp } from '../layouts';
import { changeSpeed, changeSpeedMs, driveInTo, driveUntil, SPEED } from '../paths';

// Speed, manual pages 47 (Speed) and 62 (Expressway Driving: 55 and 65 mph). Times are in ms and follow the word
// timings in public/audio/card-speed-*.json (the word each time is tied to is named next to it). Digits get no word
// timing of their own, so anything showing a number ("55", "25") appears before the gap where the number is said.
// Blue always drives east (lane center y 170). In these pictures SPEED (45 px/s) stands for 55 mph; blue drives at
// a steady speed, except where the lesson is about slowing, and then it slows with `changeSpeed`, starting on the
// word "Slow". Every number drawn (on a sign or a speedometer) is one the card's quote gives.

const set = (id: string, state: string, t = 0): StateSet => ({ t, id, state });
const last = <T>(a: T[]) => a[a.length - 1];
const LANE_Y = 170;
const CAR_HALF = SIZES.car.length / 2;
const blueCar = (start: Pose): ActorDef => ({ id: 'blue', kind: 'car', you: true, start });
const east = (x: number): Pose => ({ x, y: LANE_Y, heading: 90 });

/** A car waits off screen at x -60 (in blue's lane), then drives at SPEED so it reaches `to` at `t1`. */
const driveEastTo = (to: Pose, t1: number) => driveInTo(east(-60), to, t1);

// ---------------------------------------------------------------------------------------------
// 1. No speed limit sign: drive no more than 55 mph (card speed-no-sign).
// Clip: "obey the speed limit." 486–1763, "If there is no speed limit sign," 2222–4068, "drive no more than" 4388–5360
// ("than" 5222), "55 miles" (no timing) 5360–6541, "per hour." 6541–7097.
// An empty road (no sign anywhere); blue drives across at SPEED. Blue's speedometer (a dial with a blue ring, on the
// grass below the road) shows "55" from "than", before "55" is said.
const N = { gaugeOn: 5222, ms: 7500 };
const N_GAUGE = speedGauge('gauge-55', 150, 246, 55);

export const speedNoSign: SceneDef = {
  id: 'speed-no-sign', width: 300, height: 300,
  ...twoLane({ props: [N_GAUGE] }),
  initialStates: { [N_GAUGE.id]: 'hidden' },
  actors: [blueCar(east(-60))],
  steps: [
    {
      id: 'teach', duration: N.ms,
      states: [set(N_GAUGE.id, '', N.gaugeOn)],
      tracks: { blue: driveUntil(east(-60), 0, N.ms) },
    },
    {
      // Blue on an empty road: no sign, no speedometer.
      id: 'question', duration: 500,
      states: [set(N_GAUGE.id, 'hidden')],
      at: { blue: east(120) },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 2. Expressway speed limits: usually 55, 65 in some rural areas (card speed-expressway), and a 65 sign alone for
//    "What does this sign mean?".
// Clip: "On an expressway," 111–1166, "the speed limit is usually" 1500–2999 ("speed" 1611), "55 miles" (no timing)
// 2999–4180, "per hour." 4180–4736, "In some country areas," 5194–6596, "the sign can say 65." 6833–8624 ("sign" 6958).
// The 55 sign is ringed from "speed" to the end of "hour.", the 65 sign from "sign" to the end.
const E = { on55: 1611, off55: 4736, on65: 6958, ms: 9000 };
const PAIR = signPair('speed-expressway-signs', { kind: 'speed', text: '55' }, { kind: 'speed', text: '65' }, E.ms, { ids: ['sign-55', 'sign-65'] });
export const speedExpresswaySigns: SceneDef = {
  ...PAIR,
  steps: [{ ...PAIR.steps[0], states: [set('sign-55', 'highlight', E.on55), set('sign-55', '', E.off55), set('sign-65', 'highlight', E.on65)] }],
};
export const speedSign65 = signCloseup('speed-sign-65', 'speed', { text: '65' });

// ---------------------------------------------------------------------------------------------
// 3. Fog ahead: the sign says 55, but the safe speed is much lower, so slow down (card speed-fog).
// A 55 speed limit sign stands on the grass at blue's right (below the road), ringed while it is named. A grey-white fog bank
// labeled "FOG" (ringed on "foggy ahead") covers the road and grass on the right side of the scene from x FOG_X. Blue drives in at SPEED and, on "Slow", slows steadily to a crawl,
// with its front still short of the fog; it then creeps on slowly into the fog.
// Clip: "It is foggy ahead." 111–1221, "The sign says" 1694–2347 ("sign" 1763), "55 miles" (no timing) 2347–3444,
// "per hour." 3444–4000, "The safe speed is much lower." 4472–6291, "Slow down." 6750–7347 ("Slow" 6750).
const FOG_X = 215;
const F = { fogOn: 333, fogOff: 1221, signOn: 1763, signOff: 4000, slow: 6750, ms: 8600 };
const F_CRAWL = 12;
const F_SLOW_FWD = 40;
const F_FOG = fogBank('fog', FOG_X, 300, { label: 'FOG', opacity: 0.92 });
const F_SIGN = signProp('sign-55', 'speed', 96, 232, { text: '55', size: 60 });
/** Where blue starts slowing: so that it has slowed with its front 4 px short of the fog's soft edge. */
export const F_SLOW_AT: Pose = east(FOG_X - FOG_EDGE_PX - 4 - F_SLOW_FWD - CAR_HALF);
const F_IN = driveEastTo(F_SLOW_AT, F.slow);
const F_DOWN = changeSpeed(F_SLOW_AT, F_SLOW_FWD, F.slow, SPEED, F_CRAWL);
const F_TRACK = [...F_IN.track, ...F_DOWN, ...driveUntil(last(F_DOWN), last(F_DOWN).t, F.ms, { speed: F_CRAWL })];
/** When blue starts and ends slowing (for tests). */
export const F_TIMES = { slow: F.slow, slowed: last(F_DOWN).t, fogEdge: FOG_X - FOG_EDGE_PX, crawl: F_CRAWL };

export const speedFog: SceneDef = {
  id: 'speed-fog', width: 300, height: 300,
  ...twoLane({ props: [F_FOG, F_SIGN] }),
  actors: [blueCar(F_IN.start)],
  steps: [
    {
      id: 'teach', duration: F.ms,
      states: [set(F_FOG.id, 'highlight', F.fogOn), set(F_FOG.id, '', F.fogOff), set(F_SIGN.id, 'highlight', F.signOn), set(F_SIGN.id, '', F.signOff)],
      tracks: { blue: F_TRACK },
    },
    {
      // Blue past the sign, before the fog.
      id: 'question', duration: 500,
      states: [set(F_FOG.id, ''), set(F_SIGN.id, '')],
      at: { blue: east(125) },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 4. Driving too slow gets in the way of other cars (card speed-too-slow).
// Clip: "You are driving very slowly." 111–1583, "That can be as dangerous as driving too fast." 2055–4735,
// "It gets in the way" 5194–5888 ("way" 5694), "of other cars." 5902–6791.
// Blue creeps along at T_CRAWL the whole time, ringed while "You are driving very slowly" is said. The red car drives
// in behind at SPEED and, on "way", has to slow down steadily to blue's crawl, ending T_GAP px behind blue.
const T = { blueOn: 111, blueOff: 1583, redSlow: 5694, ms: 7400 };
const T_CRAWL = 10;
const T_GAP = 16;
const T_BLUE_START = east(130);
const T_RED_SLOW_FWD = 40;
const T_BLUE_TRACK = driveUntil(T_BLUE_START, 0, T.ms, { speed: T_CRAWL });
/** Blue's x at time t (it crawls at a steady T_CRAWL). */
const tBlueX = (t: number) => T_BLUE_START.x + (T_CRAWL * t) / 1000;
/** Red starts slowing on "way" from here, so that when it has slowed to T_CRAWL it is T_GAP px behind blue. */
const T_RED_SLOWED_T = T.redSlow + Math.round(changeSpeedMs(T_RED_SLOW_FWD, SPEED, T_CRAWL));
const T_RED_SLOW_AT = east(tBlueX(T_RED_SLOWED_T) - 2 * CAR_HALF - T_GAP - T_RED_SLOW_FWD);
const T_RED_IN = driveEastTo(T_RED_SLOW_AT, T.redSlow);
const T_RED_DOWN = changeSpeed(T_RED_SLOW_AT, T_RED_SLOW_FWD, T.redSlow, SPEED, T_CRAWL);
const T_RED_TRACK = [...T_RED_IN.track, ...T_RED_DOWN, ...driveUntil(last(T_RED_DOWN), last(T_RED_DOWN).t, T.ms, { speed: T_CRAWL })];
const T_RED_START = T_RED_IN.start;
/** When red starts and ends slowing, and its final gap behind blue (for tests). */
export const T_TIMES = { redSlow: T.redSlow, redSlowed: last(T_RED_DOWN).t, gap: T_GAP };

export const speedTooSlow: SceneDef = {
  id: 'speed-too-slow', width: 300, height: 300,
  ...twoLane(),
  actors: [blueCar(T_BLUE_START), { id: 'red', kind: 'car', color: '#e53935', start: T_RED_START }],
  steps: [
    {
      id: 'teach', duration: T.ms,
      states: [set('blue', 'highlight', T.blueOn), set('blue', '', T.blueOff)],
      tracks: { blue: T_BLUE_TRACK, red: T_RED_TRACK },
    },
    {
      // Blue creeping along, red close behind it.
      id: 'question', duration: 500,
      states: [set('blue', '')],
      at: { blue: east(190), red: east(190 - 2 * CAR_HALF - T_GAP) },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 5. New York City: 25 mph unless a sign says otherwise (card speed-city).
// Clip: "Some cities have lower speed limits that are not always on a sign." 125–3763, "In New York City," 4222–5068,
// "the speed limit is" 5375–6346 ("is" 6194), "25 miles" (no timing) 6346–7430, "per hour," 7430–8013,
// "if no sign says different." 8305–9860.
// City blocks (grey rooftops) line both sides of the road, with a "NEW YORK CITY" label over them, and no sign.
// Blue drives across at C_SPEED (25/55 of SPEED, as the limit is 25 here). Its speedometer shows "25" from "is", before "25" is said.
const C = { gaugeOn: 6194, ms: 10300 };
const C_SPEED = Math.round((SPEED * 25) / 55);
const C_GAUGE = speedGauge('gauge-25', 150, 246, 25);
const block = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="#455a64" stroke-width="2"/>`;
const C_CITY: ExtraProp = {
  id: 'city',
  svg: `<g data-prop="city">` +
    block(6, 14, 60, 84, '#b0bec5') + block(78, 30, 70, 68, '#cfd8dc') + block(160, 8, 56, 90, '#90a4ae') + block(228, 26, 66, 72, '#b0bec5') +
    block(6, 200, 44, 90, '#cfd8dc') + block(250, 200, 44, 90, '#90a4ae') +
    label(150, 52, 'NEW YORK CITY', 20) + `</g>`,
};

export const speedCity: SceneDef = {
  id: 'speed-city', width: 300, height: 300,
  ...twoLane({ props: [C_CITY, C_GAUGE] }),
  initialStates: { [C_GAUGE.id]: 'hidden' },
  actors: [blueCar(east(-20))],
  steps: [
    {
      id: 'teach', duration: C.ms,
      states: [set(C_GAUGE.id, '', C.gaugeOn)],
      tracks: { blue: driveUntil(east(-20), 0, C.ms, { speed: C_SPEED }) },
    },
    {
      // Blue on a city street with no sign; no speedometer.
      id: 'question', duration: 500,
      states: [set(C_GAUGE.id, 'hidden')],
      at: { blue: east(120) },
    },
  ],
};

export const speedScenes: SceneDef[] = [speedNoSign, speedExpresswaySigns, speedSign65, speedFog, speedTooSlow, speedCity];

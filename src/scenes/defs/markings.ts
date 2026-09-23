import type { Pose, SceneDef } from '../types';
import { fourWay, FOURWAY, SAMEWAY, sameWay, stopPose, twoLane } from '../layouts';
import { kf, laneChange } from '../paths';

// Step durations and state times are sized to each card's narration (public/audio/card-markings-*.json).
// Moving cars run at a steady ~45 px/s so they stay on screen through the narration.
// The only exception is the slow green car that blue passes in markings-broken (12 px/s).

const LANE_LINE = SAMEWAY.laneLineId;
const on = (id: string, t = 0) => ({ t, id, state: 'highlight' });

/** Yellow center line: blue goes east while the red car comes the other way. */
export const markingsYellow: SceneDef = {
  id: 'markings-yellow', width: 300, height: 300, ...twoLane({ center: 'broken-yellow' }),
  actors: [
    { id: 'blue', kind: 'car', you: true, start: { x: 20, y: 170, heading: 90 } },
    { id: 'red', kind: 'car', color: '#e53935', start: { x: 280, y: 130, heading: 270 } },
  ],
  steps: [
    {
      // Clip 5.8 s. Both cars stay on screen the whole time (about 45 px/s).
      id: 'teach', duration: 6300,
      tracks: { blue: [kf({ x: 300, y: 170, heading: 90 }, 6300)], red: [kf({ x: 0, y: 130, heading: 270 }, 6300)] },
    },
    {
      id: 'question-freeze', duration: 500,
      at: { blue: { x: 90, y: 170, heading: 90 }, red: { x: 210, y: 130, heading: 270 } },
    },
  ],
};

/** White lane line: blue and the green car both go east, in side-by-side lanes. */
export const markingsWhite: SceneDef = {
  id: 'markings-white', width: 300, height: 300, ...sameWay(),
  actors: [
    { id: 'blue', kind: 'car', you: true, start: { x: 10, y: 170, heading: 90 } },
    { id: 'green', kind: 'car', color: '#43a047', start: { x: 60, y: 130, heading: 90 } },
  ],
  steps: [
    {
      // Clip 4.8 s. Both cars stay on screen the whole time (about 45 px/s).
      id: 'teach', duration: 5400,
      tracks: { blue: [kf({ x: 250, y: 170, heading: 90 }, 5400)], green: [kf({ x: 300, y: 130, heading: 90 }, 5400)] },
    },
    {
      id: 'question-freeze', duration: 500,
      at: { blue: { x: 110, y: 170, heading: 90 }, green: { x: 190, y: 130, heading: 90 } },
    },
  ],
};

// Word times in the 6.0 s clip: "A broken line has gaps" 0.1–1.6 s, "Do it only when it is safe" 4.5–6.0 s.
// The lane line glows while "A broken line has gaps" is spoken. Blue drives at a steady 45 px/s; its lane change
// starts on "Do it" and it finishes passing the slow green car (12 px/s) after the narration.
const T_GAPS_END = 1700;
const T_CROSS = 4500;
const T_CROSSED = 8500;
const BROKEN_MS = 9500;
const BLUE_V = 45 / 1000;
const GREEN_V = 12 / 1000;
const CROSS_AT: Pose = { x: 105, y: 170, heading: 90 };
const CROSS_LEN = BLUE_V * (T_CROSSED - T_CROSS);
/** Blue follows a slow green car, then crosses the broken white line into the empty left lane and passes. */
export const markingsBroken: SceneDef = {
  id: 'markings-broken', width: 300, height: 300, ...sameWay(),
  actors: [
    { id: 'blue', kind: 'car', you: true, start: { ...CROSS_AT, x: CROSS_AT.x - BLUE_V * T_CROSS } },
    { id: 'green', kind: 'car', color: '#43a047', start: { x: 162, y: 170, heading: 90 } },
  ],
  steps: [
    {
      id: 'teach', duration: BROKEN_MS,
      states: [on(LANE_LINE), { t: T_GAPS_END, id: LANE_LINE, state: '' }],
      tracks: {
        green: [kf({ x: 162 + GREEN_V * BROKEN_MS, y: 170, heading: 90 }, BROKEN_MS)],
        blue: [
          kf(CROSS_AT, T_CROSS),
          ...laneChange(CROSS_AT, -40, CROSS_LEN, T_CROSS, T_CROSSED),
          kf({ x: CROSS_AT.x + CROSS_LEN + BLUE_V * (BROKEN_MS - T_CROSSED), y: 130, heading: 90 }, BROKEN_MS),
        ],
      },
    },
    {
      id: 'question-freeze', duration: 500,
      at: { blue: { x: 90, y: 170, heading: 90 }, green: { x: 190, y: 170, heading: 90 } },
    },
  ],
};

/** Double solid yellow: blue stays in its lane behind the green car while the red car comes the other way. */
export const markingsDouble: SceneDef = {
  id: 'markings-double', width: 300, height: 300, ...twoLane({ center: 'double-yellow' }),
  actors: [
    { id: 'blue', kind: 'car', you: true, start: { x: -20, y: 170, heading: 90 } },
    { id: 'green', kind: 'car', color: '#43a047', start: { x: 60, y: 170, heading: 90 } },
    { id: 'red', kind: 'car', color: '#e53935', start: { x: 320, y: 130, heading: 270 } },
  ],
  steps: [
    {
      // Clip 5.2 s. Blue keeps the same gap behind the green car; all cars stay on screen through "behind the green car".
      id: 'teach', duration: 5700,
      tracks: {
        blue: [kf({ x: 236, y: 170, heading: 90 }, 5700)],
        green: [kf({ x: 316, y: 170, heading: 90 }, 5700)],
        red: [kf({ x: 64, y: 130, heading: 270 }, 5700)],
      },
    },
    {
      id: 'question-freeze', duration: 500,
      at: { blue: { x: 80, y: 170, heading: 90 }, green: { x: 180, y: 170, heading: 90 }, red: { x: 240, y: 130, heading: 270 } },
    },
  ],
};

const CW = fourWay({ controls: { nb: 'stop' }, crosswalks: true });
const SIGN = FOURWAY.signId('nb');
const BAR = FOURWAY.barId('nb');
const WALK = FOURWAY.crosswalkId('nb');
const AT_BAR = stopPose('nb', 'car', { crosswalks: true });
const AT_CROSSWALK = stopPose('nb', 'car', { crosswalks: true, before: 'crosswalk' });
/** Blue still coming up the road, well before the stop line. */
const APPROACH: Pose = { x: 165, y: 272, heading: 0 };
// Word times in the 6.2 s clip: "stop sign" 0.3 s, "white stop line" 2.1 s, "No stop line?" 3.5 s,
// "Then stop before" 4.7 s, "crosswalk" 5.5 s.
const T_LINE_WORD = 2100;
const T_STOPPED = 2800;
const T_NO_LINE = 3500;
const T_ROLL = 4700;
const T_AT_CROSSWALK = 5400;
const T_WALK_WORD = 5500;
const STOP_LINE_MS = 6800;

/** Stop sign with a stop line and a crosswalk. Blue stops behind the stop line; then the line goes away and blue stops before the crosswalk. */
export const markingsStopLine: SceneDef = {
  id: 'markings-stop-line', width: 300, height: 300, ...CW,
  actors: [{ id: 'blue', kind: 'car', you: true, start: FOURWAY.start.nb }],
  steps: [
    {
      id: 'teach', duration: STOP_LINE_MS,
      states: [
        on(SIGN), { t: T_LINE_WORD, id: SIGN, state: '' }, on(BAR, T_LINE_WORD),
        { t: T_NO_LINE, id: BAR, state: 'hidden' }, on(WALK, T_WALK_WORD),
      ],
      tracks: {
        blue: [
          kf(AT_BAR, T_STOPPED, 'out'), kf(AT_BAR, T_ROLL),
          kf(AT_CROSSWALK, T_AT_CROSSWALK, 'inOut'), kf(AT_CROSSWALK, STOP_LINE_MS),
        ],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: FOURWAY.lineId('nb'), from: T_STOPPED, to: T_ROLL },
        { type: 'stopsBehind', actor: 'blue', line: FOURWAY.crosswalkLineId('nb'), from: T_AT_CROSSWALK, to: STOP_LINE_MS },
      ],
    },
    {
      id: 'freeze-line', duration: 500,
      states: [{ t: 0, id: SIGN, state: '' }, on(BAR), { t: 0, id: WALK, state: '' }],
      at: { blue: APPROACH },
    },
    {
      id: 'freeze-crosswalk', duration: 500,
      states: [{ t: 0, id: SIGN, state: '' }, { t: 0, id: BAR, state: 'hidden' }, { t: 0, id: WALK, state: '' }],
      at: { blue: APPROACH },
    },
  ],
};

export const markingsScenes: SceneDef[] = [markingsYellow, markingsWhite, markingsBroken, markingsDouble, markingsStopLine];

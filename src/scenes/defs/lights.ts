import type { Pose, SceneDef } from '../types';
import { fourWay, FOURWAY, stopPose } from '../layouts';
import { kf, turnPath } from '../paths';

const L = fourWay({ controls: { nb: 'light' } });
const LIGHT = FOURWAY.lightId('nb');
const LINE = FOURWAY.lineId('nb');
/** Blue coming up to the light, still well before the stop line. */
const APPROACH: Pose = { x: 165, y: 245, heading: 0 };
/** End of the green-arrow left turn: in the westbound lane, just past the junction. */
const WEST: Pose = { x: 100, y: 135, heading: 270 };
/** The red car frozen mid-way along the eastbound lane, left of the junction. */
const MID_EB: Pose = { x: 70, y: 165, heading: 90 };
const ARROW = 'red green-arrow';

// Question-freeze `states` below restate the light for clarity; they are harmless. Only lightYellow's is required (its teach step ends on red).

const blue = { id: 'blue', kind: 'car' as const, you: true, start: FOURWAY.start.nb };
const red = { id: 'red', kind: 'car' as const, color: '#e53935', start: FOURWAY.start.eb };

/** Steady red: blue stops behind the line and waits while the red car crosses. */
export const lightRed: SceneDef = {
  id: 'light-red', width: 300, height: 300, ...L,
  initialStates: { [LIGHT]: 'red' },
  actors: [blue, red],
  steps: [
    {
      id: 'red-stop', duration: 6500,
      tracks: {
        blue: [kf(stopPose('nb'), 3000, 'out'), kf(stopPose('nb'), 6500)],
        red: [kf(FOURWAY.exit.eb, 6000)],
      },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: LINE, from: 3000, to: 6500 }],
    },
    {
      id: 'question-freeze', duration: 500,
      states: [{ t: 0, id: LIGHT, state: 'red' }],
      at: { blue: stopPose('nb'), red: MID_EB },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: LINE, from: 0, to: 500 }],
    },
  ],
};

/** Blue waits at red while the red car clears; the light turns green and blue goes after it. */
export const lightGreen: SceneDef = {
  id: 'light-green', width: 300, height: 300, ...L,
  initialStates: { [LIGHT]: 'red' },
  actors: [{ ...blue, start: stopPose('nb') }, { ...red, start: { x: 40, y: 165, heading: 90 } }],
  steps: [
    {
      // Red clears the junction by ~1320 ms; the light turns green just after "means go" (ends 1346 ms), before "But yield" (1805 ms).
      id: 'green-go', duration: 6000,
      states: [{ t: 1500, id: LIGHT, state: 'green' }],
      tracks: {
        blue: [kf(stopPose('nb'), 1500), kf(FOURWAY.exit.nb, 6000, 'in')],
        red: [kf(FOURWAY.exit.eb, 2500)],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: LINE, from: 0, to: 1500 },
        { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
      ],
    },
    {
      id: 'question-freeze', duration: 500,
      states: [{ t: 0, id: LIGHT, state: 'green' }],
      at: { blue: APPROACH },
    },
  ],
};

/** Green turns yellow as blue comes up; blue slows and stops behind the line, then it turns red. */
export const lightYellow: SceneDef = {
  id: 'light-yellow', width: 300, height: 300, ...L,
  initialStates: { [LIGHT]: 'green' },
  actors: [blue],
  steps: [
    {
      // The light turns red as "turn red soon" is spoken (about 4 s into the clip).
      id: 'yellow-ready', duration: 5000,
      states: [{ t: 500, id: LIGHT, state: 'yellow' }, { t: 4000, id: LIGHT, state: 'red' }],
      tracks: { blue: [kf(stopPose('nb'), 3500, 'out'), kf(stopPose('nb'), 5000)] },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: LINE, from: 3500, to: 5000 }],
    },
    {
      id: 'question-freeze', duration: 500,
      states: [{ t: 0, id: LIGHT, state: 'yellow' }],
      at: { blue: APPROACH },
    },
  ],
};

/** Flashing red works like a stop sign: full stop, let the red car cross, then go. */
export const lightFlashRed: SceneDef = {
  id: 'light-flash-red', width: 300, height: 300, ...L,
  initialStates: { [LIGHT]: 'flash-red' },
  actors: [blue, red],
  steps: [
    {
      id: 'stop-then-go', duration: 9000,
      tracks: {
        blue: [kf(stopPose('nb'), 3000, 'out'), kf(stopPose('nb'), 6500), kf(FOURWAY.exit.nb, 9000, 'in')],
        red: [kf(FOURWAY.exit.eb, 5500)],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: LINE, from: 3000, to: 6500 },
        { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
      ],
    },
    {
      id: 'question-freeze', duration: 500,
      states: [{ t: 0, id: LIGHT, state: 'flash-red' }],
      at: { blue: stopPose('nb'), red: MID_EB },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: LINE, from: 0, to: 500 }],
    },
  ],
};

/** Red with a green left arrow: blue waits behind the line, then turns left into the westbound lane. */
export const lightArrow: SceneDef = {
  id: 'light-arrow', width: 300, height: 300, ...L,
  initialStates: { [LIGHT]: ARROW },
  actors: [{ ...blue, start: stopPose('nb') }],
  steps: [
    {
      // Blue waits until "Here, you turn left" (about 5.5 s into the 9 s clip), then turns.
      id: 'arrow-turn', duration: 10000,
      tracks: {
        blue: [kf(stopPose('nb'), 5500), ...turnPath(stopPose('nb'), WEST, 5500, 8500), kf(FOURWAY.exit.wb, 10000)],
      },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: LINE, from: 0, to: 5500 }],
    },
    {
      id: 'question-freeze', duration: 500,
      states: [{ t: 0, id: LIGHT, state: ARROW }],
      at: { blue: stopPose('nb') },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: LINE, from: 0, to: 500 }],
    },
  ],
};

/** The light is out (no state set, so every lamp is unlit). Blue is stopped behind the bar, as at a stop sign. */
export const lightOut: SceneDef = {
  id: 'light-out', width: 300, height: 300, ...L,
  actors: [{ ...blue, start: stopPose('nb') }],
  steps: [
    {
      id: 'question-freeze', duration: 500,
      expect: [{ type: 'stopsBehind', actor: 'blue', line: LINE, from: 0, to: 500 }],
    },
  ],
};

export const lightsScenes: SceneDef[] = [lightRed, lightGreen, lightYellow, lightFlashRed, lightArrow, lightOut];

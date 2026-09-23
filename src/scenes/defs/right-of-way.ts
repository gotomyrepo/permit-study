import type { Pose, SceneDef, StateSet } from '../types';
import { driveway, DRIVEWAY, fourWay, FOURWAY, planArrow, stopPose, withExtras } from '../layouts';
import { COLORS } from '../parts';
import { drive, driveUntil, kf, SPEED, turnMs, turnPath } from '../paths';

// Every scenario is an example from manual page 34. Times are in ms and follow the word timings in
// public/audio/card-row-*.json (the word each time is tied to is named next to it).
// Cars move at a steady SPEED (45 px/s); `drive` eases in/out over 25 px when a car starts or stops.
// "Plan" arrows show where a car will go. They are hidden unless a step turns them on.
// Blue's arrows are listed last so they are drawn on top where two arrows cross.

const RED = '#e53935';
const V = SPEED / 1000;
const set = (id: string, state: string, t = 0): StateSet => ({ t, id, state });
const on = (id: string, t = 0) => set(id, 'highlight', t);
const off = (id: string, t = 0) => set(id, '', t);
const hidden = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, 'hidden']));
const last = <T>(a: T[]) => a[a.length - 1];

const blueCar = (start: Pose) => ({ id: 'blue', kind: 'car' as const, you: true, start });
const redCar = (start: Pose) => ({ id: 'red', kind: 'car' as const, color: RED, start });

const LIGHT = FOURWAY.lightId('nb');
const LINE_NB = FOURWAY.lineId('nb');
const STOP_NB = stopPose('nb');
/** Blue coming up to the junction (question pictures). */
const BLUE_NEAR: Pose = { x: 165, y: 215, heading: 0 };
/** The red car coming down toward the junction from the far side (question pictures), as far out as BLUE_NEAR. */
const RED_NEAR: Pose = { x: 135, y: 85, heading: 180 };
const BLUE_UP = planArrow('plan-blue-straight', { x: 165, y: 197, heading: 0 }, { x: 165, y: 60, heading: 0 }, COLORS.you);

// ---------------------------------------------------------------------------------------------
// 1. Traffic already in the intersection goes first.
// "Your light is green" 111–1152, "The red car" 1694, "already in the middle, turning" 2388–4290,
// "Let it finish its turn" 4750–5902, "Then you go" 6361.
// The red car is inside the junction from t=0 and turns slowly (19 px/s, the same speed the whole step)
// so it is still in the middle, turning, while that is said, and clears the junction as "Let it finish" starts.
const IN_RED_ON = 1694;
const IN_RED_OFF = 5902;
const IN_TURN_AT = 300;
const IN_RED_SPEED = 19;
const IN_GO = 6361;
const IN_MS = 8000;
/** The red car's left turn: from the southbound lane into the eastbound lane. */
const IN_TURN_FROM: Pose = { x: 135, y: 128, heading: 180 };
const IN_TURN_TO: Pose = { x: 185, y: 165, heading: 90 };
const IN_TURN_END = IN_TURN_AT + turnMs(IN_TURN_FROM, IN_TURN_TO, IN_RED_SPEED);
const IN_RED_START: Pose = { ...IN_TURN_FROM, y: IN_TURN_FROM.y - (IN_RED_SPEED / 1000) * IN_TURN_AT };
/** The red car half-way through its turn, for the question picture. */
const IN_RED_MID: Pose = (() => { const k = turnPath(IN_TURN_FROM, IN_TURN_TO, 0, 1)[3]; return { x: k.x, y: k.y, heading: k.heading }; })();
const IN_BLUE_START: Pose = { x: 165, y: 290, heading: 0 };
const IN_BLUE_STOP = drive(IN_BLUE_START, IN_BLUE_START.y - STOP_NB.y, 0, { toStop: true });
const IN_RED_TURN = planArrow('plan-red-turn', IN_RED_MID, { x: 200, y: 165, heading: 90 }, RED);

/** Green light: the red car is already in the junction, turning left. Blue waits behind the line, then goes. */
export const rowInside: SceneDef = {
  id: 'row-inside', width: 300, height: 300,
  ...withExtras(fourWay({ controls: { nb: 'light' } }), { props: [IN_RED_TURN, BLUE_UP] }),
  initialStates: { [LIGHT]: 'green', ...hidden(BLUE_UP.id, IN_RED_TURN.id) },
  actors: [blueCar(IN_BLUE_START), redCar(IN_RED_START)],
  steps: [
    {
      id: 'teach', duration: IN_MS,
      states: [on('red', IN_RED_ON), off('red', IN_RED_OFF)],
      tracks: {
        blue: [...IN_BLUE_STOP, kf(STOP_NB, IN_GO), ...driveUntil(STOP_NB, IN_GO, IN_MS, { fromStop: true })],
        red: [
          kf(IN_TURN_FROM, IN_TURN_AT),
          ...turnPath(IN_TURN_FROM, IN_TURN_TO, IN_TURN_AT, IN_TURN_END),
          ...driveUntil(IN_TURN_TO, IN_TURN_END, IN_MS, { speed: IN_RED_SPEED }),
        ],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: LINE_NB, from: last(IN_BLUE_STOP).t, to: IN_GO },
        { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
      ],
    },
    {
      id: 'question-freeze', duration: 500,
      states: [set(LIGHT, 'green'), off('red'), off(BLUE_UP.id), off(IN_RED_TURN.id)],
      at: { blue: BLUE_NEAR, red: IN_RED_MID },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 2. Turning left: let traffic coming straight toward you go first.
// "You want to turn left" 111, "The red car comes toward you" 1638, "going straight" 3236–3958,
// "Let it go first" 4416–5361, "Then you turn left" 5833.
const LT_BLUE_PLAN_ON = 111;
const LT_RED_ON = 1638;
const LT_RED_OFF = 3958;
const LT_RED_PLAN_ON = 3236;
const LT_RED_PLAN_OFF = 4416;
const LT_GO = 5833;
const LT_MS = 9500;
/** The red car's front reaches the junction at this time. */
const LT_RED_IN = 3000;
const LT_RED_START: Pose = { x: 135, y: 102 - V * LT_RED_IN, heading: 180 };
const LT_BLUE_START: Pose = { x: 165, y: 300, heading: 0 };
const LT_BLUE_STOP = drive(LT_BLUE_START, LT_BLUE_START.y - STOP_NB.y, 0, { toStop: true });
/** Blue pulls 20 px forward (speeding up), then turns left into the westbound lane. */
const LT_PULL = drive(STOP_NB, 20, LT_GO, { fromStop: true });
const LT_TURN_FROM: Pose = { x: 165, y: STOP_NB.y - 20, heading: 0 };
const LT_TURN_TO: Pose = { x: 110, y: 135, heading: 270 };
const LT_TURN_END = last(LT_PULL).t + turnMs(LT_TURN_FROM, LT_TURN_TO);
const LT_BLUE_LEFT = planArrow('plan-blue-left', { x: 165, y: 197, heading: 0 }, { x: 100, y: 135, heading: 270 }, COLORS.you);
const LT_RED_DOWN = planArrow('plan-red-straight', { x: 135, y: 103, heading: 180 }, { x: 135, y: 285, heading: 180 }, RED);
const LT_RED_LEFT = planArrow('plan-red-left', { x: 135, y: 103, heading: 180 }, { x: 200, y: 165, heading: 90 }, RED);
const LT_PLANS = [LT_RED_DOWN, LT_RED_LEFT, LT_BLUE_LEFT, BLUE_UP];

/** Green light. Blue wants to turn left; the red car comes straight toward it. Blue waits, then turns. */
export const rowLeftTurn: SceneDef = {
  id: 'row-left-turn', width: 300, height: 300,
  ...withExtras(fourWay({ controls: { nb: 'light' } }), { props: LT_PLANS }),
  initialStates: { [LIGHT]: 'green', ...hidden(...LT_PLANS.map((p) => p.id)) },
  actors: [blueCar(LT_BLUE_START), redCar(LT_RED_START)],
  steps: [
    {
      id: 'teach', duration: LT_MS,
      states: [
        off(LT_BLUE_LEFT.id, LT_BLUE_PLAN_ON), set(LT_BLUE_LEFT.id, 'hidden', LT_GO),
        on('red', LT_RED_ON), off('red', LT_RED_OFF),
        off(LT_RED_DOWN.id, LT_RED_PLAN_ON), set(LT_RED_DOWN.id, 'hidden', LT_RED_PLAN_OFF),
      ],
      tracks: {
        blue: [
          ...LT_BLUE_STOP, kf(STOP_NB, LT_GO), ...LT_PULL,
          ...turnPath(LT_TURN_FROM, LT_TURN_TO, last(LT_PULL).t, LT_TURN_END),
          ...driveUntil(LT_TURN_TO, LT_TURN_END, LT_MS),
        ],
        red: driveUntil(LT_RED_START, 0, LT_MS),
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: LINE_NB, from: last(LT_BLUE_STOP).t, to: LT_GO },
        { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
      ],
    },
    {
      // Blue turns left, the red car goes straight: the red car goes first.
      id: 'question-you-turn', duration: 500,
      states: [set(LIGHT, 'green'), off('red'), off(LT_BLUE_LEFT.id), off(LT_RED_DOWN.id), set(BLUE_UP.id, 'hidden'), set(LT_RED_LEFT.id, 'hidden')],
      at: { blue: BLUE_NEAR, red: RED_NEAR },
    },
    {
      // Blue goes straight, the red car turns left: blue goes first.
      id: 'question-red-turns', duration: 500,
      states: [set(LIGHT, 'green'), off('red'), set(LT_BLUE_LEFT.id, 'hidden'), set(LT_RED_DOWN.id, 'hidden'), off(BLUE_UP.id), off(LT_RED_LEFT.id)],
      at: { blue: BLUE_NEAR, red: RED_NEAR },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 3. Two cars stop at stop signs at the same time: the car on the right goes first.
// "stop signs" 1597–2360, "at the same time" 2472–3250, "The red car is on your right" 3722–5055,
// "The car on the right goes first" 5527–7194, "Then you go" 7652 ("go." 7875).
const OR_SIGNS_ON = 1597;
const OR_SIGNS_OFF = 2360;
const OR_RED_ON = 3805;
const OR_RED_OFF = 5055;
const OR_RED_GO = 5400;
const OR_GO = 7875;
const OR_MS = 9500;
const STOP_WB = stopPose('wb');
const STOP_EB = stopPose('eb');
const OR_BLUE_START: Pose = { ...STOP_NB, y: STOP_NB.y + 90 };
const OR_RED_START: Pose = { ...STOP_WB, x: STOP_WB.x + 90 };
const OR_BLUE_STOP = drive(OR_BLUE_START, 90, 0, { toStop: true });
const OR_RED_STOP = drive(OR_RED_START, 90, 0, { toStop: true });
const OR_RED_RIGHT = planArrow('plan-red-east', { x: 108, y: 165, heading: 90 }, { x: 240, y: 165, heading: 90 }, RED);
const OR_BLUE_UP = planArrow('plan-blue-north', { x: 165, y: 192, heading: 0 }, { x: 165, y: 60, heading: 0 }, COLORS.you);
const SIGN_NB = FOURWAY.signId('nb');
const SIGN_WB = FOURWAY.signId('wb');

/** Stop signs on every road. Blue and the red car (on blue's right) stop at the same time; the red car goes first. */
export const rowOnRight: SceneDef = {
  id: 'row-on-right', width: 300, height: 300,
  ...withExtras(fourWay({ controls: { nb: 'stop', sb: 'stop', eb: 'stop', wb: 'stop' } }), { props: [OR_RED_RIGHT, OR_BLUE_UP] }),
  initialStates: hidden(OR_BLUE_UP.id, OR_RED_RIGHT.id),
  actors: [blueCar(OR_BLUE_START), redCar(OR_RED_START)],
  steps: [
    {
      id: 'teach', duration: OR_MS,
      states: [
        on(SIGN_NB, OR_SIGNS_ON), on(SIGN_WB, OR_SIGNS_ON), off(SIGN_NB, OR_SIGNS_OFF), off(SIGN_WB, OR_SIGNS_OFF),
        on('red', OR_RED_ON), off('red', OR_RED_OFF),
      ],
      tracks: {
        blue: [...OR_BLUE_STOP, kf(STOP_NB, OR_GO), ...driveUntil(STOP_NB, OR_GO, OR_MS, { fromStop: true })],
        red: [...OR_RED_STOP, kf(STOP_WB, OR_RED_GO), ...driveUntil(STOP_WB, OR_RED_GO, OR_MS, { fromStop: true })],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: LINE_NB, from: last(OR_BLUE_STOP).t, to: OR_GO },
        { type: 'stopsBehind', actor: 'red', line: FOURWAY.lineId('wb'), from: last(OR_RED_STOP).t, to: OR_RED_GO },
        { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
      ],
    },
    {
      // Both stopped at the same time; this time the red car is on blue's LEFT, so blue goes first.
      id: 'question-freeze', duration: 500,
      states: [off('red'), off(OR_BLUE_UP.id), off(OR_RED_RIGHT.id)],
      at: { blue: STOP_NB, red: STOP_EB },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: LINE_NB, from: 0, to: 500 },
        { type: 'stopsBehind', actor: 'red', line: FOURWAY.lineId('eb'), from: 0, to: 500 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 4. Leaving a parking lot: stop, and let the car on the street pass.
// "leaving a parking lot" 333–1458, "Stop before the street" 1916–3138, "A red car comes from your left" 3597–5304,
// "Wait for it to pass" 5763–6777, "Then turn right" 7250.
const DW_RED_ON = 3680;
const DW_RED_OFF = 5304;
const DW_BLUE_MOVE = 400;
const DW_GO = 7300;
const DW_MS = 9500;
const DW_STOP = DRIVEWAY.stop();
const DW_BLUE_START: Pose = { x: 165, y: 280, heading: 0 };
const DW_BLUE_STOP = drive(DW_BLUE_START, DW_BLUE_START.y - DW_STOP.y, DW_BLUE_MOVE, { toStop: true });
/** The red car passes in front of the driveway (x 165) at this time. */
const DW_RED_PASS = 5500;
const DW_RED_START: Pose = { x: 165 - V * DW_RED_PASS, y: 165, heading: 90 };
/** Blue edges 12 px forward (speeding up), then turns right into the near (eastbound) lane. */
const DW_PULL = drive(DW_STOP, 12, DW_GO, { fromStop: true });
const DW_TURN_FROM: Pose = { x: 165, y: DW_STOP.y - 12, heading: 0 };
const DW_TURN_TO: Pose = { x: 200, y: 165, heading: 90 };
const DW_TURN_END = last(DW_PULL).t + turnMs(DW_TURN_FROM, DW_TURN_TO);
const DW_BLUE_RIGHT = planArrow('plan-blue-right', { x: 165, y: 186, heading: 0 }, { x: 215, y: 165, heading: 90 }, COLORS.you);
const DW_RED_EAST = planArrow('plan-red-east', { x: 78, y: 165, heading: 90 }, { x: 280, y: 165, heading: 90 }, RED);

/** Blue drives out of a parking lot, stops before the street, lets the red car (from the left) pass, then turns right. */
export const rowDriveway: SceneDef = {
  id: 'row-driveway', width: 300, height: 300,
  ...withExtras(driveway(), { props: [DW_RED_EAST, DW_BLUE_RIGHT] }),
  initialStates: hidden(DW_BLUE_RIGHT.id, DW_RED_EAST.id),
  actors: [blueCar(DW_BLUE_START), redCar(DW_RED_START)],
  steps: [
    {
      id: 'teach', duration: DW_MS,
      states: [on('red', DW_RED_ON), off('red', DW_RED_OFF)],
      tracks: {
        blue: [
          kf(DW_BLUE_START, DW_BLUE_MOVE), ...DW_BLUE_STOP, kf(DW_STOP, DW_GO), ...DW_PULL,
          ...turnPath(DW_TURN_FROM, DW_TURN_TO, last(DW_PULL).t, DW_TURN_END),
          ...driveUntil(DW_TURN_TO, DW_TURN_END, DW_MS),
        ],
        red: driveUntil(DW_RED_START, 0, DW_MS),
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: DRIVEWAY.lineId, from: last(DW_BLUE_STOP).t, to: DW_GO },
        { type: 'entersAfter', actor: 'blue', other: 'red', zone: DRIVEWAY.zoneId },
      ],
    },
    {
      id: 'question-freeze', duration: 500,
      states: [off('red'), off(DW_BLUE_RIGHT.id), off(DW_RED_EAST.id)],
      at: { blue: DW_STOP, red: { x: 60, y: 165, heading: 90 } },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: DRIVEWAY.lineId, from: 0, to: 500 }],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 5. A person in the crosswalk goes first, even when your light turns green.
// "Your light is red" 111–1097, "A person" 1555–2054, "steps into the crosswalk" 2069–3527,
// "Now your light turns green" 3986–5666 ("green." 5250), "Wait for the person to cross" 6125–7638, "Then go" 8111.
const WK_PERSON_ON = 1652;
const WK_PERSON_OFF = 3527;
const WK_WALK_ON = 2791;
const WK_WALK_OFF = 3986;
const WK_GREEN = 5250;
const WK_GO = 8111;
const WK_MS = 10000;
/** The person starts walking as they are named and reaches the far corner as "cross" ends. */
const WK_WALK_FROM: Pose = { x: 104, y: 194, heading: 90 };
/** Far enough that the person (18 px long) is fully off the road, next to the light pole. */
const WK_WALK_TO: Pose = { x: 192, y: 194, heading: 90 };
const WK_ARRIVE = 7600;
const WK_STOP = stopPose('nb', 'car', { crosswalks: true });
const WALK = FOURWAY.crosswalkId('nb');
const WK_BLUE_UP = planArrow('plan-blue-north', { x: WK_STOP.x, y: WK_STOP.y - 18, heading: 0 }, { x: 165, y: 60, heading: 0 }, COLORS.you);

/** Blue waits at a red light; a person steps into the crosswalk; the light turns green; blue waits until the person is across. */
export const rowWalker: SceneDef = {
  id: 'row-walker', width: 300, height: 300,
  ...withExtras(fourWay({ controls: { nb: 'light' }, crosswalks: true }), {
    props: [WK_BLUE_UP],
    lanes: [FOURWAY.walkLane('nb')],
    zones: [FOURWAY.walkZone('nb')],
  }),
  initialStates: { [LIGHT]: 'red', ...hidden(WK_BLUE_UP.id) },
  actors: [blueCar(WK_STOP), { id: 'person', kind: 'pedestrian', start: WK_WALK_FROM }],
  steps: [
    {
      id: 'teach', duration: WK_MS,
      states: [
        on('person', WK_PERSON_ON), off('person', WK_PERSON_OFF),
        on(WALK, WK_WALK_ON), off(WALK, WK_WALK_OFF),
        set(LIGHT, 'green', WK_GREEN),
      ],
      tracks: {
        blue: [kf(WK_STOP, WK_GO), ...driveUntil(WK_STOP, WK_GO, WK_MS, { fromStop: true })],
        person: [kf(WK_WALK_FROM, WK_PERSON_ON), kf(WK_WALK_TO, WK_ARRIVE)],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: LINE_NB, from: 0, to: WK_GO },
        { type: 'entersAfter', actor: 'blue', other: 'person', zone: FOURWAY.walkZone('nb').id },
      ],
    },
    {
      id: 'question-freeze', duration: 500,
      states: [set(LIGHT, 'green'), off('person'), off(WALK), off(WK_BLUE_UP.id)],
      at: { blue: WK_STOP, person: { x: 158, y: 194, heading: 90 } },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: LINE_NB, from: 0, to: 500 }],
    },
  ],
};

export const rightOfWayScenes: SceneDef[] = [rowInside, rowLeftTurn, rowOnRight, rowDriveway, rowWalker];

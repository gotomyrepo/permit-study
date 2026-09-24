import type { Keyframe, Pose, SceneDef, StateSet } from '../types';
import { laneGlow, planArrow, WIDEFOUR, wideFourWay, type Dir, type WideLane } from '../layouts';
import { drive, driveUntil, kf, SPEED, turnMs, turnPath, uTurnMs, uTurnPath } from '../paths';

// Turns and U-turns, manual pages 36–37, on the two-lanes-each-way `wideFourWay()`.
// Times are in ms and follow the word timings in public/audio/card-turn-*.json (the word each time is tied to is
// named next to it). Blue drives at a steady SPEED (45 px/s) and its turn signal is on until its turn is done.
// Question pictures hide blue and show two "plan" arrows (orange and purple) so the picture doesn't give the answer.

const ORANGE = '#fb8c00';
const PURPLE = '#8e24aa';
const RED_GLOW = '#e53935';
const set = (id: string, state: string, t = 0): StateSet => ({ t, id, state });
const hidden = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, 'hidden']));
const last = <T>(a: T[]) => a[a.length - 1];
/** Glow over lane `lane` of road direction `d` where that traffic arrives (`in`) or leaves (`out`). */
const glow = (id: string, d: Dir, lane: WideLane, part: 'in' | 'out', color?: string) => laneGlow(id, WIDEFOUR.laneRect(d, lane, part), color);

const blueCar = (start: Pose) => ({ id: 'blue', kind: 'car' as const, you: true, start });

/**
 * Blue waits just off the bottom edge (at `start`), then drives straight up at SPEED so it reaches `turnFrom`
 * exactly at `turnAt`, and turns (a normal turn, or a U-turn when `u` is set) toward `turnTo`.
 * Returns the keyframes up to the end of the turn and the time the turn ends.
 */
function upAndTurn(start: Pose, turnFrom: Pose, turnTo: Pose, turnAt: number, u = false): { track: Keyframe[]; end: number } {
  const dist = start.y - turnFrom.y;
  const go = turnAt - Math.round((dist / SPEED) * 1000);
  const up = drive(start, dist, go);
  const t0 = last(up).t;
  const end = t0 + (u ? uTurnMs(turnFrom, turnTo) : turnMs(turnFrom, turnTo));
  return {
    track: [kf(start, go), ...up, ...(u ? uTurnPath(turnFrom, turnTo, t0, end) : turnPath(turnFrom, turnTo, t0, end))],
    end,
  };
}
/** Round a step length up to the next 100 ms. */
const upTo100 = (t: number) => Math.ceil(t / 100) * 100;

// Turn start and end poses. Turns start where blue's lane meets the junction (y 210).
const EDGE = WIDEFOUR.box.max;
const NB_LEFT_X = WIDEFOUR.center('nb', 'left');
const NB_RIGHT_X = WIDEFOUR.center('nb', 'right');
const LEFT_FROM: Pose = { x: NB_LEFT_X, y: EDGE, heading: 0 };
/** Into the westbound lane next to the center line, at the junction's far (west) edge. */
const LEFT_TO: Pose = { x: WIDEFOUR.box.min, y: WIDEFOUR.center('wb', 'left'), heading: 270 };
const RIGHT_FROM: Pose = { x: NB_RIGHT_X, y: EDGE, heading: 0 };
/** Into the eastbound right lane, right at the corner: a tight turn, not a wide one. */
const RIGHT_TO: Pose = { x: EDGE, y: WIDEFOUR.center('eb', 'right'), heading: 90 };

// ---------------------------------------------------------------------------------------------
// 1. Signal before you turn.
// "Always signal before you turn." 111–1693 ("signal" 472), "Turn on your turn signal" 2152–3388,
// "at least 100 feet" 3666–5166, "before the turn." 5166–5944 ("turn." 5583).
// Blue's left signal is on from "signal", so it is already blinking when blue comes into view (about 3.2 s, the
// picture is too small to show it sooner at SPEED). Blue is ringed from then through "100 feet", drives on with the
// signal blinking, and starts its left turn on the word "turn.".
const SG_ON = 472;
const SG_HL_ON = 3200;
const SG_HL_OFF = 5166;
const SG_TURN = 5583; // "turn."
const SG = upAndTurn(WIDEFOUR.start.nb.left, LEFT_FROM, LEFT_TO, SG_TURN);
const SG_MS = upTo100(SG.end + 400);

/** Blue drives up with its left turn signal on, well before the corner, then turns left. */
export const turnSignal: SceneDef = {
  id: 'turn-signal', width: 300, height: 300,
  ...wideFourWay(),
  actors: [blueCar(WIDEFOUR.start.nb.left)],
  steps: [
    {
      id: 'teach', duration: SG_MS,
      states: [
        set('blue', 'signal-left', SG_ON), set('blue', 'highlight signal-left', SG_HL_ON),
        set('blue', 'signal-left', SG_HL_OFF), set('blue', '', SG.end),
      ],
      tracks: { blue: [...SG.track, ...driveUntil(LEFT_TO, SG.end, SG_MS)] },
    },
    {
      // Blue coming up to the corner with its left signal on (no distance is shown).
      id: 'question-freeze', duration: 500,
      states: [set('blue', 'signal-left')],
      at: { blue: { x: NB_LEFT_X, y: 285, heading: 0 } },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 2. Right turn: from the right lane into the right lane.
// "To turn right," 125–805, "get as far right as you can." 1125–2554, "Then turn into" 3027–3721 ("turn" 3263),
// "the right lane of the new road." 3736–5388 ("right" 3861).
const RT_IN_ON = 1125;
const RT_TURN = 3263;
const RT_OUT_ON = 3861;
const RT = upAndTurn(WIDEFOUR.start.nb.right, RIGHT_FROM, RIGHT_TO, RT_TURN);
const RT_MS = 6000;
const RT_IN = glow('glow-in', 'nb', 'right', 'in');
const RT_OUT = glow('glow-out', 'eb', 'right', 'out');
/** Question arrows: orange from the right lane into the right lane (correct); purple from the lane next to the center line. */
const RT_ORANGE = planArrow('plan-orange', { x: NB_RIGHT_X, y: 230, heading: 0 }, { x: 230, y: WIDEFOUR.center('eb', 'right'), heading: 90 }, ORANGE);
const RT_PURPLE = planArrow('plan-purple', { x: NB_LEFT_X, y: 230, heading: 0 }, { x: 230, y: WIDEFOUR.center('eb', 'left'), heading: 90 }, PURPLE);
const RT_PROPS = [RT_IN, RT_OUT, RT_ORANGE, RT_PURPLE];

/** Blue, in the right lane with its right signal on, turns tightly into the right lane of the new road. */
export const turnRight: SceneDef = {
  id: 'turn-right', width: 300, height: 300,
  ...wideFourWay({ props: RT_PROPS }),
  initialStates: { blue: 'signal-right', ...hidden(...RT_PROPS.map((p) => p.id)) },
  actors: [blueCar(WIDEFOUR.start.nb.right)],
  steps: [
    {
      id: 'teach', duration: RT_MS,
      states: [
        set(RT_IN.id, '', RT_IN_ON), set(RT_IN.id, 'hidden', RT_OUT_ON), set(RT_OUT.id, '', RT_OUT_ON),
        set('blue', '', RT.end),
      ],
      tracks: { blue: [...RT.track, ...driveUntil(RIGHT_TO, RT.end, RT_MS)] },
    },
    {
      id: 'question-arrows', duration: 500,
      states: [set('blue', 'hidden'), set(RT_IN.id, 'hidden'), set(RT_OUT.id, 'hidden'), set(RT_ORANGE.id, ''), set(RT_PURPLE.id, '')],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 3. Left turn: from the lane next to the center line into the lane next to the center line.
// "To turn left," 125–861, "use the lane next to the center line." 1277–3166, "Turn into" 3625–4027,
// "the lane next to the center line." 4041–5957 ("lane" 4180), "Stay on the right side of that line." 6430–8055.
const LT_IN_ON = 1277;
const LT_TURN = 3625;
const LT_OUT_ON = 4180;
const LT = upAndTurn(WIDEFOUR.start.nb.left, LEFT_FROM, LEFT_TO, LT_TURN);
const LT_MS = 8500;
const LT_IN = glow('glow-in', 'nb', 'left', 'in');
const LT_OUT = glow('glow-out', 'wb', 'left', 'out');
/** Question arrows: purple from the lane next to the center line into the same kind of lane (correct); orange from the right lane into the far lane. */
const LT_ORANGE = planArrow('plan-orange', { x: NB_RIGHT_X, y: 230, heading: 0 }, { x: 70, y: WIDEFOUR.center('wb', 'right'), heading: 270 }, ORANGE);
const LT_PURPLE = planArrow('plan-purple', { x: NB_LEFT_X, y: 230, heading: 0 }, { x: 70, y: WIDEFOUR.center('wb', 'left'), heading: 270 }, PURPLE);
const LT_PROPS = [LT_IN, LT_OUT, LT_ORANGE, LT_PURPLE];

/** Blue, in the lane next to the center line with its left signal on, turns into the lane next to the center line. */
export const turnLeft: SceneDef = {
  id: 'turn-left', width: 300, height: 300,
  ...wideFourWay({ props: LT_PROPS }),
  initialStates: { blue: 'signal-left', ...hidden(...LT_PROPS.map((p) => p.id)) },
  actors: [blueCar(WIDEFOUR.start.nb.left)],
  steps: [
    {
      id: 'teach', duration: LT_MS,
      states: [
        set(LT_IN.id, '', LT_IN_ON), set(LT_IN.id, 'hidden', LT_OUT_ON), set(LT_OUT.id, '', LT_OUT_ON),
        set('blue', '', LT.end),
      ],
      tracks: { blue: [...LT.track, ...driveUntil(LEFT_TO, LT.end, LT_MS)] },
    },
    {
      id: 'question-arrows', duration: 500,
      states: [set('blue', 'hidden'), set(LT_IN.id, 'hidden'), set(LT_OUT.id, 'hidden'), set(LT_ORANGE.id, ''), set(LT_PURPLE.id, '')],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 4. U-turn: only from the left side of the lane next to the center line, never from the right lane.
// "You want to make a U-turn." 111–1194, "Never start it from the right lane." 1652–3138,
// "Use the lane next to the center line." 3597–5471 ("lane" 3972), "Stay on the left side of that lane." 5944–7499
// ("left" 6416), "Then make your U-turn." 7972–8972 (the U-turn starts on "Then").
// Blue comes into view in the glowing lane, keeps to its left side (x 160, 5 px left of the lane center), and makes its U-turn as "Then make your U-turn" is said.
const U_RIGHT_ON = 1652;
const U_RIGHT_OFF = 3138;
const U_LANE_ON = 3972;
const U_SIDE_ON = 6416;
const U_LANE_OFF = 7499;
const U_TURN = 7972; // "Then"
const U_X = NB_LEFT_X - 5;
const U_START: Pose = { ...WIDEFOUR.start.nb.left, x: U_X };
const U_FROM: Pose = { x: U_X, y: EDGE - 5, heading: 0 };
/** Into the far southbound lane: the U needs that much room to stay round. */
const U_TO: Pose = { x: WIDEFOUR.center('sb', 'right'), y: EDGE - 5, heading: 180 };
const U = upAndTurn(U_START, U_FROM, U_TO, U_TURN, true);
const U_MS = upTo100(U.end + 500);
const U_RIGHT = glow('glow-right', 'nb', 'right', 'in', RED_GLOW);
const U_LANE = glow('glow-lane', 'nb', 'left', 'in');
/** The left half of the lane next to the center line. */
const U_SIDE = laneGlow('glow-side', { ...WIDEFOUR.laneRect('nb', 'left', 'in'), w: 16 });
const U_PROPS = [U_RIGHT, U_LANE, U_SIDE];

/** Blue, on the left side of the lane next to the center line with its left signal on, makes a U-turn. */
export const turnU: SceneDef = {
  id: 'turn-u', width: 300, height: 300,
  ...wideFourWay({ props: U_PROPS }),
  initialStates: { blue: 'signal-left', ...hidden(...U_PROPS.map((p) => p.id)) },
  actors: [blueCar(U_START)],
  steps: [
    {
      id: 'teach', duration: U_MS,
      states: [
        set(U_RIGHT.id, '', U_RIGHT_ON), set(U_RIGHT.id, 'hidden', U_RIGHT_OFF),
        set(U_LANE.id, '', U_LANE_ON), set(U_SIDE.id, '', U_SIDE_ON),
        set(U_LANE.id, 'hidden', U_LANE_OFF), set(U_SIDE.id, 'hidden', U_LANE_OFF),
        set('blue', '', U.end),
      ],
      tracks: { blue: [...U.track, ...driveUntil(U_TO, U.end, U_MS)] },
    },
    {
      // Just the road: both lanes, nothing marked.
      id: 'question-road', duration: 500,
      states: [set('blue', 'hidden'), ...U_PROPS.map((p) => set(p.id, 'hidden'))],
    },
  ],
};

export const turnsScenes: SceneDef[] = [turnSignal, turnRight, turnLeft, turnU];

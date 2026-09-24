import type { ActorDef, Pose, SceneDef, StateSet, StopLine, Zone } from '../types';
import { lampCarCloseup, laneGlow, sameWay, shoulder, SHOULDER, twoLane } from '../layouts';
import { changeSpeed, changeSpeedMs, drive, driveUntil, kf, laneChange, SPEED } from '../paths';
import { SIZES } from '../engine';

// Emergency vehicles, manual page 35. Times are in ms and follow the word timings in
// public/audio/card-emergency-*.json (the word each time is tied to is named next to it).
// Every vehicle moves at a steady SPEED (45 px/s). Blue pulls over with `changeSpeed`: an S-curve 10 px to the
// right while it slows steadily to a stop, so it ends at y 180 (its body y 171–189), still inside its lane
// (y 150–190) at the right edge of the road. There is not room in one 40 px lane for blue and the ambulance side
// by side, so the ambulance swings 19 px left (to y 151, its body over the center line) to get past.
// The ambulance's roof lights are on (`flashing`) the whole time: the lamps stay lit and only their halos blink.

const set = (id: string, state: string, t = 0): StateSet => ({ t, id, state });
const last = <T>(a: T[]) => a[a.length - 1];
const FLASH = 'flashing';
const FLASH_ON = 'flashing highlight';

const blueCar = (start: Pose): ActorDef => ({ id: 'blue', kind: 'car', you: true, start });
const ambulance = (start: Pose): ActorDef => ({ id: 'amb', kind: 'ambulance', start });

/** Blue's lane center (eastbound) and where it stops at the right edge of the road. */
const LANE_Y = 170;
const EDGE_Y = 180;
/** Pulling over: 50 px ahead and 10 px right, slowing from SPEED to a stop (atan(15/50) ≈ 17°, under the 20° lane check). */
const PULL_FWD = 50;
const PULL_SIDE = EDGE_Y - LANE_Y;
const PULL_MS = changeSpeedMs(PULL_FWD, SPEED, 0);
const pullOver = (from: Pose, t0: number) => changeSpeed(from, PULL_FWD, t0, SPEED, 0, { side: PULL_SIDE });
/** An unpainted stop line 2 px in front of a car stopped at `p` (heading east), for `stopsBehind`. */
const stopLineAhead = (id: string, p: Pose): StopLine => ({ id, x: p.x + SIZES.car.length / 2 + 2, y: p.y, heading: 90 });
/** Where the ambulance drives while it passes: 19 px left of the lane center. */
const PASS_Y = 151;
const PASS_FWD = 85; // atan(1.5 × 19 / 85) ≈ 18.5°
/** Distance covered at SPEED in `ms`. */
const at = (ms: number) => (SPEED * ms) / 1000;

// ---------------------------------------------------------------------------------------------
// 1. An ambulance behind you: pull over to the right edge and stop (card emergency-pull-over, step `teach`),
//    then wait until it passes before you drive on (card emergency-wait, step `wait`).
// Pull-over clip: "ambulance" 250, "behind you!" 1055–1900, "Pull over" 2180, "right edge" 2833, "stop." 4402, end 4874.
// Blue and the ambulance (17 px behind it) drive at SPEED; the ambulance is ringed while it is named. It starts
// swinging left early (on "behind") so it is clear of blue by the time blue slows. Blue starts pulling over on
// "Pull" and is stopped at the right edge on "stop.". The ambulance comes up beside blue as the clip ends.
// Wait clip: "Wait until" 111, "goes past you." 1291–2400, "Then" 2611, "drive on." 2958–3582.
// The ambulance drives on past blue and off the road; blue, still stopped, pulls away on "Then".
const B_AMB_ON = 250;
const B_AMB_OFF = 1900;
const B_SWING = 1000; // "behind"
const B_PULL = 2180; // "Pull"
const B_MS = 5000;
const B_START: Pose = { x: 55, y: LANE_Y, heading: 90 };
const B_AMB_START: Pose = { x: 0, y: LANE_Y, heading: 90 };
const B_PULL_FROM: Pose = { ...B_START, x: B_START.x + at(B_PULL) };
const B_PULL_TRACK = pullOver(B_PULL_FROM, B_PULL);
const B_STOPPED: Pose = last(B_PULL_TRACK);
const B_STOP_T = B_PULL + PULL_MS;
const B_SWING_FROM: Pose = { ...B_AMB_START, x: B_AMB_START.x + at(B_SWING) };
const B_SWING_TRACK = laneChange(B_SWING_FROM, PASS_Y - LANE_Y, PASS_FWD, B_SWING, B_SWING + (PASS_FWD / SPEED) * 1000);
const B_AMB_TRACK = [...drive(B_AMB_START, at(B_SWING), 0), ...B_SWING_TRACK, ...driveUntil(last(B_SWING_TRACK), last(B_SWING_TRACK).t, B_MS)];
/** Where the ambulance is when the pull-over clip ends (beside blue); it drives on from here in `wait`. */
const B_AMB_END: Pose = last(B_AMB_TRACK);
const B_LINE = stopLineAhead('stop-edge', B_STOPPED);
/** The road ahead of blue's stopping place, in blue's lane: the ambulance must leave it before blue enters it. */
const B_AHEAD: Zone = { id: 'ahead', x: B_LINE.x + 1, y: 150, w: 300 - B_LINE.x - 1, h: 40 };
const W_GO = 2611; // "Then"
const W_MS = 4300;

export const emergencyBehind: SceneDef = {
  id: 'emergency-behind', width: 300, height: 300,
  ...twoLane({ lines: [B_LINE], zones: [B_AHEAD] }),
  initialStates: { amb: FLASH },
  actors: [blueCar(B_START), ambulance(B_AMB_START)],
  steps: [
    {
      id: 'teach', duration: B_MS,
      states: [set('amb', FLASH_ON, B_AMB_ON), set('amb', FLASH, B_AMB_OFF)],
      tracks: {
        blue: [...drive(B_START, at(B_PULL), 0), ...B_PULL_TRACK, kf(B_STOPPED, B_MS)],
        amb: B_AMB_TRACK,
      },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: B_LINE.id, from: Math.ceil(B_STOP_T), to: B_MS }],
    },
    {
      id: 'wait', duration: W_MS,
      states: [set('amb', FLASH)],
      tracks: {
        // On at SPEED until it is off the road (x 360), then out of sight.
        amb: [...drive(B_AMB_END, 360 - B_AMB_END.x, 0), kf({ ...B_AMB_END, x: 360 }, W_MS)],
        blue: [kf(B_STOPPED, W_GO), ...driveUntil(B_STOPPED, W_GO, W_MS, { fromStop: true })],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: B_LINE.id, from: 0, to: W_GO },
        { type: 'entersAfter', actor: 'blue', other: 'amb', zone: B_AHEAD.id },
      ],
    },
    {
      // Blue driving in its lane with the ambulance (lights on) close behind.
      id: 'question-behind', duration: 500,
      states: [set('amb', FLASH), set('blue', '')],
      at: { blue: { x: 150, y: LANE_Y, heading: 90 }, amb: { x: 85, y: LANE_Y, heading: 90 } },
    },
    {
      // Blue stopped at the right edge; the ambulance still behind it.
      id: 'question-stopped', duration: 500,
      states: [set('amb', FLASH), set('blue', '')],
      at: { blue: B_STOPPED, amb: { x: 120, y: LANE_Y, heading: 90 } },
    },
  ],
};
// ---------------------------------------------------------------------------------------------
// 2. An ambulance coming toward you in the other lane: pull over and stop anyway.
// Clip: "Pull over and stop" 125–1150, "ambulance," 1527, "comes toward you" 3097–3900, "other lane." 4138–4721.
// Blue starts pulling over at once and is stopped at the right edge by 2.2 s. The ambulance comes the other way
// at SPEED, ringed while it is named; the other lane glows on "other lane" as the ambulance comes by.
const O_START: Pose = { x: 30, y: LANE_Y, heading: 90 };
const O_PULL_TRACK = pullOver(O_START, 0);
const O_STOPPED: Pose = last(O_PULL_TRACK);
const O_STOP_T = PULL_MS;
const O_AMB_START: Pose = { x: 300, y: 130, heading: 270 };
const O_AMB_ON = 1527;
const O_AMB_OFF = 3097;
const O_LANE_ON = 4138;
const O_MS = 5400;
const O_LINE = stopLineAhead('stop-edge', O_STOPPED);
const O_GLOW = laneGlow('glow-other', { x: 0, y: 110, w: 300, h: 40 });

export const emergencyOncoming: SceneDef = {
  id: 'emergency-oncoming', width: 300, height: 300,
  ...twoLane({ lines: [O_LINE], props: [O_GLOW] }),
  initialStates: { amb: FLASH, [O_GLOW.id]: 'hidden' },
  actors: [blueCar(O_START), ambulance(O_AMB_START)],
  steps: [
    {
      id: 'teach', duration: O_MS,
      states: [set('amb', FLASH_ON, O_AMB_ON), set('amb', FLASH, O_AMB_OFF), set(O_GLOW.id, '', O_LANE_ON)],
      tracks: {
        blue: [...O_PULL_TRACK, kf(O_STOPPED, O_MS)],
        amb: driveUntil(O_AMB_START, 0, O_MS),
      },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: O_LINE.id, from: Math.ceil(O_STOP_T), to: O_MS }],
    },
    {
      // Blue driving in its lane; the ambulance (lights on) coming toward it in the other lane.
      id: 'question-freeze', duration: 500,
      states: [set('amb', FLASH), set(O_GLOW.id, 'hidden')],
      at: { blue: { x: 90, y: LANE_Y, heading: 90 }, amb: { x: 235, y: 130, heading: 270 } },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 3. Move Over: an ambulance stopped on the shoulder with its lights on. On a highway with 2 or more lanes your
//    way, move over 1 lane if it is safe; on every road, slow down.
// Clip: "ambulance" 236, "stopped at the side of the road," 958–2444, "lights flashing." 2861–3666,
// "2 or more lanes your way," 4958–6600, "move over 1 lane," 7152–8300, "if it is safe." 8750–9500,
// "On every road," 10041–10900, "slow down." 12027–12763.
// The ambulance is parked on the shoulder, ringed while it is named. Both lanes glow on "2 or more lanes your way"
// while blue drives into view in the right lane. Blue moves over to the left lane on "move", keeps SPEED, and
// slows down (to 20 px/s) on "slow", as it goes by the ambulance.
const M_SH = shoulder();
const M_GLOW = laneGlow('glow-lanes', { x: 0, y: 110, w: 300, h: 80 });
const M_AMB: Pose = { x: 250, y: SHOULDER.y, heading: 90 };
const M_AMB_ON = 236;
const M_AMB_OFF = 3666;
const M_LANES_ON = 4958;
const M_MOVE = 7152; // "move"
const M_SLOW = 12027; // "slow"
const M_SLOW_V = 20;
const M_START: Pose = { x: -40, y: LANE_Y, heading: 90 };
const M_MOVE_FROM: Pose = { x: 14, y: LANE_Y, heading: 90 }; // blue's nose comes into view on "way," (6444)
const M_GO = M_MOVE - (M_MOVE_FROM.x - M_START.x) / SPEED * 1000;
const M_LC_FWD = 165; // 40 px over: atan(1.5 × 40 / 165) ≈ 20°
const M_LC = laneChange(M_MOVE_FROM, -40, M_LC_FWD, M_MOVE, M_MOVE + (M_LC_FWD / SPEED) * 1000);
const M_SLOW_FROM: Pose = { ...last(M_LC), x: last(M_LC).x + at(M_SLOW - last(M_LC).t) };
const M_SLOW_TRACK = changeSpeed(M_SLOW_FROM, 40, M_SLOW, SPEED, M_SLOW_V);
const M_MS = 13300;

export const emergencyMoveOver: SceneDef = {
  id: 'emergency-move-over', width: 300, height: 300,
  ...sameWay({ props: [...M_SH.props, M_GLOW], zones: M_SH.zones }),
  initialStates: { amb: FLASH, [M_GLOW.id]: 'hidden' },
  actors: [blueCar(M_START), ambulance(M_AMB)],
  steps: [
    {
      id: 'teach', duration: M_MS,
      states: [
        set('amb', FLASH_ON, M_AMB_ON), set('amb', FLASH, M_AMB_OFF),
        set(M_GLOW.id, '', M_LANES_ON), set(M_GLOW.id, 'hidden', M_MOVE),
      ],
      tracks: {
        blue: [
          kf(M_START, M_GO), ...drive(M_START, M_MOVE_FROM.x - M_START.x, M_GO), ...M_LC,
          kf(M_SLOW_FROM, M_SLOW), ...M_SLOW_TRACK,
          ...driveUntil(last(M_SLOW_TRACK), last(M_SLOW_TRACK).t, M_MS, { speed: M_SLOW_V }),
        ],
      },
    },
    {
      // Blue in the right lane; the ambulance (lights on) parked on the shoulder ahead.
      id: 'question-freeze', duration: 500,
      states: [set('amb', FLASH), set(M_GLOW.id, 'hidden')],
      at: { blue: { x: 70, y: LANE_Y, heading: 90 } },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// 4. Blue and green lights (close-ups of a car with a roof light).
// Clip: "blue light" 194–700, "volunteer firefighter" 1861–3300, "green light" 4458–5100,
// "volunteer ambulance worker" 5472–7100, "You do not have to yield to them." 8208–9800, end 12499.
// Each car is ringed while its light is named; both are ringed from "You do not have to yield".
const L_BLUE = 'lamp-car-blue';
const L_GREEN = 'lamp-car-green';
const L_MS = 12900;
const lightsPair = lampCarCloseup('emergency-lights', ['blue', 'green'], { teachMs: L_MS });
export const emergencyLights: SceneDef = {
  ...lightsPair,
  steps: lightsPair.steps.map((s) => s.id !== 'teach' ? s : {
    ...s,
    states: [
      set(L_BLUE, 'highlight', 194), set(L_BLUE, '', 4375), set(L_GREEN, 'highlight', 4458),
      set(L_BLUE, 'highlight', 8208),
    ],
  }),
};
export const emergencyLightGreen = lampCarCloseup('emergency-light-green', ['green']);
export const emergencyLightBlue = lampCarCloseup('emergency-light-blue', ['blue']);

export const emergencyScenes: SceneDef[] = [
  emergencyBehind, emergencyOncoming, emergencyMoveOver, emergencyLights, emergencyLightGreen, emergencyLightBlue,
];

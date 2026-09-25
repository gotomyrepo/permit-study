import { describe, test, expect } from 'vitest';
import { parkingCrosswalk, parkingCurb, parkingHydrant, parkingStart, parkingStopSign, S_STOP_T } from '../src/scenes/defs/parking';
import { frameAt, SIZES } from '../src/scenes/engine';
import { CURB, feetPx, WHEEL_OUT } from '../src/scenes/layouts';
import type { SceneDef } from '../src/scenes/types';

const HALF = SIZES.car.length / 2, SIDE = SIZES.car.width / 2;
const pose = (s: SceneDef, id: string, step = 0, t = 0) => frameAt(s, step, t).poses[id];

describe('parking lesson distances', () => {
  test('blue stops next to the red car, its side about 2 feet from red\'s', () => {
    const blue = pose(parkingStart, 'blue', 0, S_STOP_T), red = pose(parkingStart, 'red');
    expect(blue.x).toBeCloseTo(red.x, 3);
    expect((red.y - SIDE) - (blue.y + SIDE)).toBeCloseTo(feetPx(2), 3);
  });
  test('parked wheels are 1 foot from the curb', () => {
    expect(CURB.curbY - (pose(parkingCurb, 'blue').y + SIDE + WHEEL_OUT)).toBeCloseTo(feetPx(1), 3);
  });
  test('blue parks exactly 15 feet from the hydrant, 20 from the crosswalk and 30 from the STOP sign', () => {
    const front = (s: SceneDef) => pose(s, 'blue').x + HALF;
    // The hydrant's x, read from where it is drawn.
    const drawn = new RegExp(`data-prop="${CURB.hydrantId}">.*?cx="([0-9.]+)"`).exec(parkingHydrant.background);
    expect(drawn).not.toBeNull();
    expect(Number(drawn![1]) - front(parkingHydrant)).toBeCloseTo(feetPx(15), 3);
    expect(CURB.crosswalkX[0] - front(parkingCrosswalk)).toBeCloseTo(feetPx(20), 3);
    expect(CURB.signX - front(parkingStopSign)).toBeCloseTo(feetPx(30), 3);
    // Parked by the STOP sign, blue is more than 20 feet from the crosswalk too.
    expect(CURB.crosswalkX[0] - front(parkingStopSign)).toBeGreaterThan(feetPx(20));
  });
});

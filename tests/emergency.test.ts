import { describe, test, expect } from 'vitest';
import { B_STOP_T, emergencyBehind, M_SLOW_FROM_X } from '../src/scenes/defs/emergency';
import { frameAt, SIZES } from '../src/scenes/engine';

describe('emergency lesson order of events', () => {
  test('blue has stopped at the right edge before the ambulance comes up beside it', () => {
    const f = frameAt(emergencyBehind, 0, B_STOP_T);
    const ambNose = f.poses.amb.x + SIZES.ambulance.length / 2;
    const blueRear = f.poses.blue.x - SIZES.car.length / 2;
    expect(ambNose).toBeLessThan(blueRear);
    // and blue really is stopped then
    const later = frameAt(emergencyBehind, 0, B_STOP_T + 200).poses.blue;
    expect(later.x).toBeCloseTo(f.poses.blue.x, 3);
  });
  test('blue starts slowing for the parked ambulance before it reaches it', () => {
    expect(M_SLOW_FROM_X).toBeLessThan(200);
  });
});

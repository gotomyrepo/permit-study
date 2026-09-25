import { describe, test, expect } from 'vitest';
import { F_SLOW_AT, F_TIMES, speedCity, speedFog, speedNoSign, speedTooSlow, T_TIMES } from '../src/scenes/defs/speed';
import { frameAt, SIZES } from '../src/scenes/engine';
import { SPEED } from '../src/scenes/paths';

const CAR = SIZES.car.length / 2;
/** Speed (px/s) of `id` around time t in step 0 of `scene`. */
const speedAt = (scene: typeof speedFog, id: string, t: number) =>
  (frameAt(scene, 0, t + 50).poses[id].x - frameAt(scene, 0, t - 50).poses[id].x) * 10;

describe('speed lesson', () => {
  test('fog: blue drives at SPEED until "Slow", then slows steadily and has slowed before the fog', () => {
    expect(speedAt(speedFog, 'blue', F_TIMES.slow - 200)).toBeCloseTo(SPEED, 0);
    expect(frameAt(speedFog, 0, F_TIMES.slow).poses.blue.x).toBeCloseTo(F_SLOW_AT.x, 1);
    let prev = SPEED + 1;
    for (let t = F_TIMES.slow + 60; t < F_TIMES.slowed - 60; t += 100) {
      const v = speedAt(speedFog, 'blue', t);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
    const slowed = frameAt(speedFog, 0, F_TIMES.slowed).poses.blue;
    expect(slowed.x + CAR).toBeLessThan(F_TIMES.fogEdge);
    expect(speedAt(speedFog, 'blue', F_TIMES.slowed + 150)).toBeCloseTo(F_TIMES.crawl, 0);
  });
  test('too slow: red slows down behind blue, on "way", and never gets closer than the gap', () => {
    const ms = speedTooSlow.steps[0].duration;
    expect(speedAt(speedTooSlow, 'red', T_TIMES.redSlow - 200)).toBeCloseTo(SPEED, 0);
    for (let t = 0; t <= ms; t += 25) {
      const p = frameAt(speedTooSlow, 0, t).poses;
      expect((p.blue.x - CAR) - (p.red.x + CAR)).toBeGreaterThanOrEqual(T_TIMES.gap - 0.01);
    }
    const end = frameAt(speedTooSlow, 0, ms).poses;
    expect((end.blue.x - CAR) - (end.red.x + CAR)).toBeCloseTo(T_TIMES.gap, 0);
    // Blue crawls far slower than normal the whole time.
    expect(speedAt(speedTooSlow, 'blue', 3000)).toBeLessThan(SPEED / 3);
  });
  test('the city car drives slower than the 55 mph car, in proportion to 25 and 55', () => {
    const v55 = speedAt(speedNoSign, 'blue', 3000);
    const v25 = speedAt(speedCity, 'blue', 3000);
    expect(v55).toBeCloseTo(SPEED, 0);
    expect(v25 / v55).toBeCloseTo(25 / 55, 1);
  });
});

import { describe, test, expect } from 'vitest';
import { FEET_20, O_LINE, S_BLUE_STOP, S_STOP_T, schoolBusDivided, schoolBusOncoming, schoolBusStop, schoolBusYellow, Y_TIMES } from '../src/scenes/defs/school-bus';
import { frameAt, SIZES } from '../src/scenes/engine';

const CAR = SIZES.car.length / 2, BUS = SIZES.bus.length / 2;

describe('school bus lesson', () => {
  test('behind the bus, blue stops at least 20 feet (FEET_20 px) from its back', () => {
    const f = frameAt(schoolBusStop, 0, S_STOP_T);
    expect(f.poses.blue.x).toBeCloseTo(S_BLUE_STOP.x, 3);
    expect((f.poses.bus.x - BUS) - (f.poses.blue.x + CAR)).toBeGreaterThanOrEqual(FEET_20);
  });
  test('facing a stopped bus in the other lane (and across a median), blue stops at least 20 feet short of its front', () => {
    for (const scene of [schoolBusOncoming, schoolBusDivided]) {
      const f = frameAt(scene, 0, scene.steps[0].duration);
      expect((f.poses.bus.x - BUS) - (f.poses.blue.x + CAR)).toBeGreaterThanOrEqual(FEET_20);
      expect(f.poses.blue.x + CAR).toBeLessThanOrEqual(O_LINE.x);
    }
  });
  test('yellow lights: the bus slows first, then blue; blue keeps a clear gap and both stay on screen', () => {
    expect(Y_TIMES.busSlow).toBeLessThan(Y_TIMES.blueSlow);
    const ms = schoolBusYellow.steps[0].duration;
    for (let t = 0; t <= ms; t += 50) {
      const p = frameAt(schoolBusYellow, 0, t).poses;
      expect((p.bus.x - BUS) - (p.blue.x + CAR)).toBeGreaterThan(10);
      expect(p.bus.x + BUS).toBeLessThanOrEqual(300);
    }
  });
  test('blue waits until the bus has started moving before it drives on', () => {
    const w = schoolBusStop.steps[1];
    const busGo = w.tracks!.bus[0];
    const blueHold = w.tracks!.blue[0];
    expect(busGo.t).toBeLessThan(blueHold.t);
  });
});

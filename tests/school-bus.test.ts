import { describe, test, expect } from 'vitest';
import { FEET_20, O_LINE, S_BLUE_STOP, S_STOP_T, schoolBusDivided, schoolBusOncoming, schoolBusStop, schoolBusYellow, Y_TIMES } from '../src/scenes/defs/school-bus';
import { frameAt, SIZES } from '../src/scenes/engine';

const CAR = SIZES.car.length / 2, BUS = SIZES.bus.length / 2;

describe('school bus lesson', () => {
  test('behind the bus, blue stops at least 20 feet (FEET_20 px) from its back', () => {
    const f = frameAt(schoolBusStop, 0, S_STOP_T);
    expect(f.poses.blue.x).toBeCloseTo(S_BLUE_STOP.x, 3);
    expect((f.poses.bus.x - BUS) - (f.poses.blue.x + CAR)).toBeGreaterThanOrEqual(FEET_20);
    const line = schoolBusStop.lines.find((l) => l.id === 'stop-bus')!;
    expect((f.poses.bus.x - BUS) - line.x).toBeGreaterThanOrEqual(FEET_20);
  });
  test('facing a stopped bus in the other lane (and across a median), blue stops at least 20 feet short of its front', () => {
    for (const scene of [schoolBusOncoming, schoolBusDivided]) {
      const f = frameAt(scene, 0, scene.steps[0].duration);
      expect((f.poses.bus.x - BUS) - (f.poses.blue.x + CAR)).toBeGreaterThanOrEqual(FEET_20);
      expect(f.poses.blue.x + CAR).toBeLessThanOrEqual(O_LINE.x);
      // The stop line itself is the full 20 feet short of the bus's front.
      expect((f.poses.bus.x - BUS) - O_LINE.x).toBeGreaterThanOrEqual(FEET_20);
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
  test('blue stays still until the bus is moving, and the bus is still moving when blue starts', () => {
    const wi = schoolBusStop.steps.findIndex((s) => s.id === 'wait');
    const ms = schoolBusStop.steps[wi].duration;
    const at = (t: number) => frameAt(schoolBusStop, wi, t).poses;
    const start = at(0);
    let busMovedAt = -1, blueMovedAt = -1;
    for (let t = 0; t <= ms; t += 25) {
      const p = at(t);
      if (busMovedAt < 0 && Math.abs(p.bus.x - start.bus.x) > 0.5) busMovedAt = t;
      if (blueMovedAt < 0 && Math.abs(p.blue.x - start.blue.x) > 0.5) blueMovedAt = t;
    }
    expect(busMovedAt).toBeGreaterThan(0);
    expect(blueMovedAt).toBeGreaterThan(busMovedAt);
    // Blue is still at its stop the whole time before the bus moves.
    for (let t = 0; t < busMovedAt; t += 25) expect(at(t).blue.x).toBeCloseTo(start.blue.x, 3);
    // When blue starts, the bus has already pulled well away from its stopping place.
    expect(at(blueMovedAt).bus.x - start.bus.x).toBeGreaterThan(SIZES.bus.length / 2);
  });
});

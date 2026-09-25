import { describe, test, expect } from 'vitest';
import { BOX_X, FRIEND_X, psLot, psNoParking, psNoStanding, psNoStopping } from '../src/scenes/defs/parking-signs';
import { frameAt, SIZES } from '../src/scenes/engine';
import { CURB } from '../src/scenes/layouts';
import type { SceneDef } from '../src/scenes/types';

const pose = (s: SceneDef, id: string, step = 0, t = 0) => frameAt(s, step, t).poses[id];
const stateAt = (s: SceneDef, id: string, t: number, step = 0) => frameAt(s, step, t).states[id] ?? '';

describe('parking signs lesson pictures', () => {
  test('blue has stopped by the curb before anything is unloaded, and the box and person stand apart on the sidewalk', () => {
    for (const s of [psNoParking, psNoStanding]) {
      const shown = s === psNoParking ? 5902 : 6083;
      const a = pose(s, 'blue', 0, shown - 50), b = pose(s, 'blue', 0, shown);
      expect(a).toEqual(b);
      expect(b.y).toBe(CURB.parkY);
      expect(stateAt(s, 'friend', shown - 1)).toContain('hidden');
    }
    // The 18 px box and the 24 px wide person don't touch.
    expect(FRIEND_X - SIZES.pedestrian.width / 2 - (BOX_X + 9)).toBeGreaterThan(0);
    expect(psNoStanding.background).not.toContain('data-prop="box"');
  });
  test('NO STOPPING: blue never stops and stays on screen for the whole clip', () => {
    const ms = psNoStopping.steps[0].duration;
    let prev = pose(psNoStopping, 'blue', 0, 0).x;
    for (let t = 100; t <= ms; t += 100) {
      const x = pose(psNoStopping, 'blue', 0, t).x;
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
    expect(prev + SIZES.car.length / 2).toBeLessThan(300);
    // The red car is on screen when "another car" is said.
    expect(pose(psNoStopping, 'red', 0, 9680).x).toBeLessThan(300 - SIZES.car.length / 2);
  });
  test('the lot: the reserved and striped spaces are empty', () => {
    const glows = ['glow-reserved', 'glow-stripes'];
    expect(glows.every((g) => psLot.props.includes(g))).toBe(true);
    const spaces = [...psLot.background.matchAll(/data-prop="glow-(reserved|stripes)"><rect x="([\d.]+)"/g)].map((m) => Number(m[2]) - 2);
    expect(spaces).toHaveLength(2);
    for (const a of psLot.actors) {
      const x = pose(psLot, a.id).x;
      for (const left of spaces) expect(x < left || x > left + 32).toBe(true);
    }
  });
});

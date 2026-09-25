import { describe, test, expect } from 'vitest';
import {
  BOX_PX, BOX_X, FRIEND_W, FRIEND_X, LOT, NO_PARKING_T, NO_STANDING_T, RES_X, ST, STR_X, psLot, psNoParking, psNoStanding, psNoStopping,
} from '../src/scenes/defs/parking-signs';
import { frameAt, SIZES } from '../src/scenes/engine';
import { CURB } from '../src/scenes/layouts';
import type { SceneDef } from '../src/scenes/types';
import { stateAt } from './helpers';

const pose = (s: SceneDef, id: string, step = 0, t = 0) => frameAt(s, step, t).poses[id];

describe('parking signs lesson pictures', () => {
  test('blue has stopped by the curb before anything is unloaded, and the box and person stand apart on the sidewalk', () => {
    for (const s of [psNoParking, psNoStanding]) {
      const shown = s === psNoParking ? NO_PARKING_T.things : NO_STANDING_T.people;
      const a = pose(s, 'blue', 0, shown - 50), b = pose(s, 'blue', 0, shown);
      expect(a).toEqual(b);
      expect(b.y).toBe(CURB.parkY);
      expect(stateAt(s, 'friend', shown - 1)).toContain('hidden');
    }
    // The box and the person are well apart, so their rings (about 4 px each) don't touch.
    expect(FRIEND_X - FRIEND_W / 2 - (BOX_X + BOX_PX / 2)).toBeGreaterThan(10);
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
    expect(pose(psNoStopping, 'red', 0, ST.redOn).x).toBeLessThan(300 - SIZES.car.length / 2);
  });
  test('the lot: the reserved and striped spaces are empty', () => {
    const glows = ['glow-reserved', 'glow-stripes'];
    expect(glows.every((g) => psLot.props.includes(g))).toBe(true);
    for (const a of psLot.actors) {
      const x = pose(psLot, a.id).x;
      for (const left of [RES_X, STR_X]) expect(x < left || x > left + LOT.spaceW).toBe(true);
    }
    // The stripes' clipPath id is the scene's own, so it can't clash with another picture on the same page.
    expect(psLot.background).toContain(`<clipPath id="${psLot.id}-stripes-clip">`);
  });
});

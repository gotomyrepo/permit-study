import { describe, test, expect } from 'vitest';
import { ALL_SCENES } from '../src/scenes/registry';
import { checkScene } from '../src/scenes/check';

describe('every registered scene', () => {
  test('scene ids are unique', () => {
    const ids = ALL_SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const scene of ALL_SCENES) {
    test(`${scene.id} passes behavior checks`, () => {
      expect(checkScene(scene)).toEqual([]);
    });
  }
});

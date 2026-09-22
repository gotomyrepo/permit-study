import { describe, test, expect } from 'vitest';
import { angleDiff, corners, dir, front, obbOverlap, rectContains } from '../src/scenes/geometry';

describe('geometry', () => {
  test('dir: heading 0 is up, 90 is right', () => {
    expect(dir(0).x).toBeCloseTo(0); expect(dir(0).y).toBeCloseTo(-1);
    expect(dir(90).x).toBeCloseTo(1); expect(dir(90).y).toBeCloseTo(0);
  });
  test('front of a north-facing car is above its center', () => {
    const f = front({ x: 100, y: 100, heading: 0 }, 36);
    expect(f.x).toBeCloseTo(100); expect(f.y).toBeCloseTo(82);
  });
  test('cars in adjacent lanes do not overlap', () => {
    const a = corners({ x: 135, y: 100, heading: 0 }, 36, 18);
    const b = corners({ x: 165, y: 100, heading: 0 }, 36, 18);
    expect(obbOverlap(a, b)).toBe(false);
  });
  test('crossing cars at the same point overlap', () => {
    const a = corners({ x: 150, y: 150, heading: 0 }, 36, 18);
    const b = corners({ x: 150, y: 150, heading: 90 }, 36, 18);
    expect(obbOverlap(a, b)).toBe(true);
  });
  test('angleDiff wraps around 360', () => {
    expect(angleDiff(350, 10)).toBeCloseTo(20);
    expect(angleDiff(0, 180)).toBeCloseTo(180);
  });
  test('rectContains', () => {
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5 })).toBe(true);
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 5 })).toBe(false);
  });
});

import { describe, test, expect } from 'vitest';
import { frameAt } from '../src/scenes/engine';
import { kf, turnPath } from '../src/scenes/paths';
import type { SceneDef } from '../src/scenes/types';

const scene: SceneDef = {
  id: 't', width: 300, height: 300, background: '', lanes: [], zones: [], lines: [], props: [],
  actors: [{ id: 'a', kind: 'car', start: { x: 0, y: 100, heading: 0 } }],
  steps: [
    { id: 'move', duration: 1000, tracks: { a: [{ t: 1000, x: 0, y: 0, heading: 0 }] } },
    { id: 'hold', duration: 500 },
    { id: 'jump', duration: 500, at: { a: { x: 50, y: 50, heading: 90 } }, states: [{ t: 250, id: 'a', state: 'hidden' }] },
    { id: 'spin', duration: 1000, tracks: { a: [{ t: 1000, x: 50, y: 50, heading: 10 }] }, at: { a: { x: 50, y: 50, heading: 350 } } },
    { id: 'eased', duration: 1000, at: { a: { x: 0, y: 0, heading: 90 } }, tracks: { a: [{ t: 1000, x: 100, y: 0, heading: 90, ease: 'out' }] } },
  ],
};

describe('frameAt', () => {
  test('interpolates linearly within a step', () => {
    expect(frameAt(scene, 0, 500).poses.a.y).toBeCloseTo(50);
  });
  test('carries the end pose into the next step', () => {
    expect(frameAt(scene, 1, 0).poses.a.y).toBeCloseTo(0);
  });
  test('holds the last keyframe after it ends', () => {
    expect(frameAt(scene, 1, 400).poses.a.y).toBeCloseTo(0);
  });
  test('`at` overrides the starting pose', () => {
    const p = frameAt(scene, 2, 0).poses.a;
    expect(p.x).toBe(50); expect(p.heading).toBe(90);
  });
  test('timed states apply once their time is reached', () => {
    expect(frameAt(scene, 2, 100).states.a).toBeUndefined();
    expect(frameAt(scene, 2, 300).states.a).toBe('hidden');
  });
  test('states carry into later steps', () => {
    expect(frameAt(scene, 3, 0).states.a).toBe('hidden');
  });
  test('heading takes the short way around', () => {
    expect(frameAt(scene, 3, 500).poses.a.heading).toBeCloseTo(0);
  });
  test('ease out is past halfway at the midpoint', () => {
    expect(frameAt(scene, 4, 500).poses.a.x).toBeGreaterThan(50);
  });
  test('clamps t to the step duration', () => {
    expect(frameAt(scene, 0, 5000).poses.a.y).toBeCloseTo(0);
  });
});

describe('paths', () => {
  test('kf builds a keyframe from a pose', () => {
    expect(kf({ x: 1, y: 2, heading: 90 }, 500, 'in')).toEqual({ x: 1, y: 2, heading: 90, t: 500, ease: 'in' });
  });
  test('turnPath ends exactly at the target pose, marked turning', () => {
    const k = turnPath({ x: 165, y: 210, heading: 0 }, { x: 100, y: 135, heading: 270 }, 1000, 3000, 8);
    expect(k).toHaveLength(8);
    const last = k[k.length - 1];
    expect(last).toMatchObject({ x: 100, y: 135, heading: 270, t: 3000 });
    expect(k.every((f) => f.turning)).toBe(true);
    for (let i = 1; i < k.length; i++) expect(k[i].t).toBeGreaterThan(k[i - 1].t);
  });
});

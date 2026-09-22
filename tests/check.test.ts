import { describe, test, expect } from 'vitest';
import { checkScene } from '../src/scenes/check';
import type { SceneDef } from '../src/scenes/types';

const base = (): Omit<SceneDef, 'actors' | 'steps'> => ({
  id: 'x', width: 300, height: 300, background: '', props: [],
  lanes: [
    { id: 'nb', x: 150, y: -100, w: 30, h: 500, heading: 0 },
    { id: 'sb', x: 120, y: -100, w: 30, h: 500, heading: 180 },
    { id: 'eb', x: -100, y: 150, w: 500, h: 30, heading: 90 },
  ],
  zones: [{ id: 'junction', x: 120, y: 120, w: 60, h: 60 }],
  lines: [{ id: 'line-nb', x: 165, y: 188, heading: 0 }],
});

const blue = { id: 'blue', kind: 'car' as const, you: true, start: { x: 165, y: 340, heading: 0 } };
const red = { id: 'red', kind: 'car' as const, start: { x: -40, y: 165, heading: 90 } };

describe('checkScene', () => {
  test('correct yield: blue stops, red passes, blue goes', () => {
    const s: SceneDef = { ...base(), actors: [blue, red], steps: [
      { id: 'approach', duration: 3000, tracks: { blue: [{ t: 3000, x: 165, y: 210, heading: 0, ease: 'out' }] } },
      { id: 'wait-then-go', duration: 7000,
        tracks: { red: [{ t: 3500, x: 340, y: 165, heading: 90 }],
                  blue: [{ t: 4500, x: 165, y: 210, heading: 0 }, { t: 7000, x: 165, y: -40, heading: 0, ease: 'in' }] },
        expect: [
          { type: 'stopsBehind', actor: 'blue', line: 'line-nb', from: 0, to: 4500 },
          { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
        ] },
    ] };
    expect(checkScene(s)).toEqual([]);
  });

  test('flags a collision', () => {
    const s: SceneDef = { ...base(), actors: [blue, red], steps: [
      { id: 'crash', duration: 2000, tracks: {
        blue: [{ t: 2000, x: 165, y: -40, heading: 0 }],
        red: [{ t: 2000, x: 340, y: 165, heading: 90 }] } },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('overlap'))).toBe(true);
  });

  test('flags stopping past the line', () => {
    const s: SceneDef = { ...base(), actors: [blue], steps: [
      { id: 'overshoot', duration: 2000, tracks: { blue: [{ t: 1000, x: 165, y: 195, heading: 0 }] },
        expect: [{ type: 'stopsBehind', actor: 'blue', line: 'line-nb', from: 1000, to: 2000 }] },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('past line'))).toBe(true);
  });

  test('flags moving when it should be stopped', () => {
    const s: SceneDef = { ...base(), actors: [blue], steps: [
      { id: 'rolling', duration: 2000, tracks: { blue: [{ t: 2000, x: 165, y: 220, heading: 0 }] },
        expect: [{ type: 'stopsBehind', actor: 'blue', line: 'line-nb', from: 0, to: 1000 }] },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('moving'))).toBe(true);
  });

  test('flags driving the wrong way in a lane', () => {
    const s: SceneDef = { ...base(), actors: [{ ...blue, start: { x: 135, y: 340, heading: 0 } }], steps: [
      { id: 'wrong-way', duration: 1000, tracks: { blue: [{ t: 1000, x: 135, y: 250, heading: 0 }] } },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('lane'))).toBe(true);
  });

  test('flags entering the junction before the other car has left', () => {
    const s: SceneDef = { ...base(), actors: [blue, red], steps: [
      { id: 'cut-off', duration: 4000,
        tracks: { blue: [{ t: 4000, x: 165, y: -40, heading: 0 }], red: [{ t: 1000, x: 60, y: 165, heading: 90 }, { t: 4000, x: 340, y: 165, heading: 90 }] },
        expect: [{ type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' }] },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('entered'))).toBe(true);
  });

  test('flags entersAfter when one actor never enters the zone', () => {
    const s: SceneDef = { ...base(), actors: [blue, red], steps: [
      { id: 'ghost-crossing', duration: 4000,
        tracks: { blue: [{ t: 4000, x: 165, y: -40, heading: 0 }], red: [{ t: 1000, x: 60, y: 165, heading: 90 }, { t: 4000, x: 60, y: 165, heading: 90 }] },
        expect: [{ type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' }] },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('never entered'))).toBe(true);
  });

  test('linear stopsBehind: actor leaving exactly at `to` is not flagged as moving', () => {
    const s: SceneDef = { ...base(), actors: [blue], steps: [
      { id: 'depart-linear', duration: 2000,
        at: { blue: { x: 165, y: 210, heading: 0 } },
        tracks: { blue: [{ t: 1000, x: 165, y: 210, heading: 0 }, { t: 2000, x: 165, y: 100, heading: 0 }] },
        expect: [{ type: 'stopsBehind', actor: 'blue', line: 'line-nb', from: 0, to: 1000 }] },
    ] };
    expect(checkScene(s)).toEqual([]);
  });

  test('flags moving into a zero-length stopsBehind window', () => {
    const s: SceneDef = { ...base(), actors: [blue], steps: [
      { id: 'arrive-instant', duration: 2000,
        tracks: { blue: [{ t: 1000, x: 165, y: 210, heading: 0 }] },
        expect: [{ type: 'stopsBehind', actor: 'blue', line: 'line-nb', from: 1000, to: 1000 }] },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('moving'))).toBe(true);
  });

  test('flags structural errors', () => {
    const s: SceneDef = { ...base(), actors: [blue], steps: [
      { id: 'a', duration: 1000, tracks: { ghost: [{ t: 500, x: 0, y: 0, heading: 0 }] } },
      { id: 'a', duration: 1000, tracks: { blue: [{ t: 2000, x: 165, y: 300, heading: 0 }] }, states: [{ t: 0, id: 'nope', state: 'x' }] },
    ] };
    const msgs = checkScene(s).map((v) => v.message).join('\n');
    expect(msgs).toContain('unknown actor "ghost"');
    expect(msgs).toContain('duplicate step id "a"');
    expect(msgs).toContain('keyframe time');
    expect(msgs).toContain('unknown state target "nope"');
  });
});

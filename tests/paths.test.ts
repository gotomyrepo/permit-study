import { describe, test, expect } from 'vitest';
import { frameAt } from '../src/scenes/engine';
import { changeSpeed, changeSpeedMs, drive, driveUntil, SPEED, turnMs, turnPath, uTurnApex, uTurnMs, uTurnPath } from '../src/scenes/paths';
import { dir } from '../src/scenes/geometry';
import type { Keyframe, Pose, SceneDef } from '../src/scenes/types';

/** One car following `track` in a single step, so speeds can be measured with the real engine. */
function sceneWith(start: Pose, track: Keyframe[]): SceneDef {
  return {
    id: 't', width: 300, height: 300, background: '', lanes: [], zones: [], lines: [], props: [],
    actors: [{ id: 'a', kind: 'car', start }],
    steps: [{ id: 's', duration: track[track.length - 1].t, tracks: { a: track } }],
  };
}
/** Speed in px/s around time t, measured over ±5 ms. */
function speedAt(scene: SceneDef, t: number): number {
  const a = frameAt(scene, 0, t - 5).poses.a, b = frameAt(scene, 0, t + 5).poses.a;
  return Math.hypot(b.x - a.x, b.y - a.y) * 100;
}

const FROM: Pose = { x: 165, y: 290, heading: 0 };

describe('drive', () => {
  test('steady drive: arrives after dist / SPEED and ends dist px ahead', () => {
    const kfs = drive(FROM, 90, 1000);
    expect(kfs).toHaveLength(1);
    expect(kfs[0]).toMatchObject({ x: 165, y: 200, heading: 0, t: 3000 });
  });
  test('from a stop: eases in over 25 px, then holds SPEED', () => {
    const kfs = drive(FROM, 90, 0, { fromStop: true });
    // 25 px easing in takes 2 × 25 / 45 s; the other 65 px take 65 / 45 s.
    expect(kfs.map((k) => k.t)).toEqual([Math.round(50000 / 45), Math.round(115000 / 45)]);
    expect(kfs[0].ease).toBe('in');
    const scene = sceneWith(FROM, kfs);
    expect(speedAt(scene, 20)).toBeLessThan(5);
    expect(speedAt(scene, kfs[0].t + 50)).toBeCloseTo(SPEED, 0);
    expect(speedAt(scene, kfs[0].t - 10)).toBeCloseTo(SPEED, -1); // no jump in speed where the ramp ends
  });
  test('to a stop: holds SPEED, then eases out over the last 25 px', () => {
    const kfs = drive(FROM, 90, 0, { toStop: true });
    const end = kfs[kfs.length - 1];
    expect(end).toMatchObject({ y: 200, ease: 'out', t: Math.round(115000 / 45) });
    const scene = sceneWith(FROM, kfs);
    expect(speedAt(scene, kfs[0].t - 50)).toBeCloseTo(SPEED, 0);
    expect(speedAt(scene, end.t - 5)).toBeLessThan(1);
  });
  test('a short drive from a stop to a stop splits the distance between the two ramps', () => {
    const kfs = drive(FROM, 20, 0, { fromStop: true, toStop: true });
    expect(kfs).toHaveLength(2);
    expect(kfs[0].y).toBe(280);
    expect(kfs[1].y).toBe(270);
  });
});

describe('driveUntil', () => {
  test('arrives exactly at t1, SPEED × time ahead', () => {
    const kfs = driveUntil(FROM, 1000, 3000);
    expect(kfs[kfs.length - 1]).toMatchObject({ y: 200, t: 3000 });
  });
  test('from a stop: reaches SPEED after the ramp and still lands on t1', () => {
    const kfs = driveUntil(FROM, 0, 4000, { fromStop: true });
    expect(kfs[kfs.length - 1].t).toBe(4000);
    expect(speedAt(sceneWith(FROM, kfs), 3000)).toBeCloseTo(SPEED, 0);
  });
  test('takes a custom speed', () => {
    const kfs = driveUntil(FROM, 0, 2000, { speed: 15 });
    expect(kfs[kfs.length - 1].y).toBeCloseTo(260);
  });
  test('throws a clear error when the time is too short', () => {
    expect(() => driveUntil(FROM, 0, 0)).toThrow(/too short/);
    expect(() => driveUntil(FROM, 0, 1000, { fromStop: true })).toThrow(/too short/);
  });
});

describe('turnMs', () => {
  test('90° turn: arc length / SPEED, between the chord and the two legs', () => {
    const from: Pose = { x: 0, y: 0, heading: 0 };
    const to: Pose = { x: 30, y: -30, heading: 90 };
    // Fine-grained length of the same curve turnPath follows (control point at the corner, (0, -30)).
    let len = 0, px = 0, py = 0;
    for (let k = 1; k <= 10000; k++) {
      const u = k / 10000;
      const x = u * u * 30, y = -(2 * (1 - u) * u * 30 + u * u * 30);
      len += Math.hypot(x - px, y - py); px = x; py = y;
    }
    expect(len).toBeGreaterThan(Math.hypot(30, 30));
    expect(len).toBeLessThan(60);
    expect(Math.abs(turnMs(from, to) - (len / SPEED) * 1000)).toBeLessThanOrEqual(1);
    expect(turnMs(from, to, 15)).toBe(Math.round((len / 15) * 1000));
  });
  test('turnPath over turnMs keeps the average speed at SPEED', () => {
    const from: Pose = { x: 165, y: 190, heading: 0 };
    const to: Pose = { x: 110, y: 135, heading: 270 };
    const kfs = turnPath(from, to, 0, turnMs(from, to), 64);
    let len = 0, prev: Pose = from;
    for (const k of kfs) { len += Math.hypot(k.x - prev.x, k.y - prev.y); prev = k; }
    expect((len / kfs[kfs.length - 1].t) * 1000).toBeCloseTo(SPEED, 0);
  });
});

describe('uTurnPath', () => {
  const from: Pose = { x: 162, y: 205, heading: 0 };
  const to: Pose = { x: 105, y: 205, heading: 180 };
  test('apex faces across the road, half-way between the lanes and half their spacing ahead', () => {
    expect(uTurnApex(from, to)).toEqual({ x: 133.5, y: 176.5, heading: 270 });
    // A U-turn to the driver's right faces the other way at the apex.
    expect(uTurnApex({ x: 0, y: 0, heading: 90 }, { x: 0, y: 40, heading: 270 })).toEqual({ x: 20, y: 20, heading: 180 });
  });
  test('with `to` further ahead or behind, the apex is half the spacing past the further-ahead pose', () => {
    const o: Pose = { x: 0, y: 0, heading: 0 };
    expect(uTurnApex(o, { x: -40, y: -20, heading: 180 })).toEqual({ x: -20, y: -40, heading: 270 });
    expect(uTurnApex(o, { x: -40, y: 20, heading: 180 })).toEqual({ x: -20, y: -20, heading: 270 });
    const behind = { x: -40, y: 20, heading: 180 };
    const kfs = uTurnPath(o, behind, 0, 2000);
    expect(kfs[kfs.length - 1]).toMatchObject({ ...behind, t: 2000 });
    expect(kfs[7]).toMatchObject({ x: -20, y: -20, heading: 270 });
  });
  test('rejects poses that do not face opposite ways, or are not off to one side', () => {
    expect(() => uTurnApex(from, { ...to, heading: 270 })).toThrow();
    expect(() => uTurnApex(from, { x: 162, y: 150, heading: 180 })).toThrow();
  });
  test('ends exactly at `to` at t1, every keyframe turning, times increasing', () => {
    const kfs = uTurnPath(from, to, 1000, 3000);
    expect(kfs[kfs.length - 1]).toMatchObject({ x: to.x, y: to.y, heading: to.heading, t: 3000, turning: true });
    expect(kfs.every((k) => k.turning)).toBe(true);
    for (let i = 1; i < kfs.length; i++) expect(kfs[i].t).toBeGreaterThan(kfs[i - 1].t);
  });
  test('headings follow the path: each short move goes the way the car faces (within 12°)', () => {
    const kfs = uTurnPath(from, to, 0, 2000, 32);
    let prev: Pose = from;
    for (const k of kfs) {
      const a = dir(prev.heading), b = dir(k.heading);
      const mx = k.x - prev.x, my = k.y - prev.y, len = Math.hypot(mx, my);
      const cos = (v: { x: number; y: number }) => (mx * v.x + my * v.y) / len;
      expect(Math.min(cos(a), cos(b))).toBeGreaterThan(Math.cos((12 * Math.PI) / 180));
      prev = k;
    }
  });
  test('over uTurnMs the average speed is SPEED', () => {
    const kfs = uTurnPath(from, to, 0, uTurnMs(from, to), 64);
    let len = 0, prev: Pose = from;
    for (const k of kfs) { len += Math.hypot(k.x - prev.x, k.y - prev.y); prev = k; }
    expect((len / kfs[kfs.length - 1].t) * 1000).toBeCloseTo(SPEED, 0);
  });
});

describe('changeSpeed', () => {
  const EAST: Pose = { x: 50, y: 170, heading: 90 };
  test('slowing down: covers the distance in 2 x dist / (v0 + v1) and ends at v1', () => {
    const kfs = changeSpeed(EAST, 40, 1000, SPEED, 20);
    expect(changeSpeedMs(40, SPEED, 20)).toBeCloseTo(80000 / 65);
    expect(kfs[kfs.length - 1]).toMatchObject({ x: 90, y: 170, heading: 90 });
    expect(kfs[kfs.length - 1].t).toBe(Math.round(1000 + 80000 / 65));
    const scene = sceneWith(EAST, [{ ...EAST, t: 1000 }, ...kfs]);
    const end = kfs[kfs.length - 1].t;
    expect(speedAt(scene, 1030)).toBeCloseTo(SPEED, -1);
    expect(speedAt(scene, end - 30)).toBeCloseTo(20, -1);
    // The speed only ever goes down, in small steps.
    let prev = Infinity;
    for (let t = 1010; t < end - 10; t += 20) {
      const v = speedAt(scene, t);
      expect(v).toBeLessThanOrEqual(prev + 0.5);
      prev = v;
    }
  });
  test('pulling over to a stop: ends side px to the right, heading straight, nearly still', () => {
    const kfs = changeSpeed(EAST, 50, 0, SPEED, 0, { side: 10 });
    const end = kfs[kfs.length - 1];
    expect(end).toMatchObject({ x: 100, y: 180, heading: 90 });
    expect(end.t).toBe(Math.round(changeSpeedMs(50, SPEED, 0)));
    const scene = sceneWith(EAST, kfs);
    expect(speedAt(scene, end.t - 10)).toBeLessThan(5);
    for (let i = 1; i < kfs.length; i++) {
      const a = kfs[i - 1], b = kfs[i];
      const along = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      expect(Math.abs(b.heading - 90)).toBeLessThan(20);
      expect(Math.abs(along - (b.heading - 90))).toBeLessThan(6); // heading follows the path
    }
  });
  test('times are whole ms, like drive', () => {
    for (const k of changeSpeed(EAST, 50, 1000, SPEED, 0, { side: 10 })) expect(Number.isInteger(k.t)).toBe(true);
  });
  test('clear errors for no distance, no speed at all, or a negative speed; a target speed of 0 still works', () => {
    expect(() => changeSpeed(EAST, 0, 0, SPEED, 0)).toThrow(/forward must be more than 0/);
    expect(() => changeSpeed(EAST, 30, 0, 0, 0)).toThrow(/both 0/);
    expect(() => changeSpeed(EAST, 30, 0, -5, 20)).toThrow(/can't be negative/);
    expect(() => changeSpeed(EAST, 30, 0, SPEED, -1)).toThrow(/can't be negative/);
    expect(() => changeSpeed(EAST, 30, 0, SPEED, 0)).not.toThrow();
    expect(() => changeSpeed(EAST, 30, 0, 0, SPEED)).not.toThrow();
  });
});

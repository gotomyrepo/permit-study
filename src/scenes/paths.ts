import type { Ease, Keyframe, Pose } from './types';
import { dir, normHeading } from './geometry';

export function kf(p: Pose, t: number, ease?: Ease): Keyframe {
  return ease ? { x: p.x, y: p.y, heading: p.heading, t, ease } : { x: p.x, y: p.y, heading: p.heading, t };
}

/** Control point of the quadratic Bézier `turnPath` follows: where the two headings' lines cross (the midpoint if parallel). */
export function turnControl(from: Pose, to: Pose): { x: number; y: number } {
  const d1 = dir(from.heading), d2 = dir(to.heading);
  const det = d1.x * d2.y - d1.y * d2.x;
  const rx = to.x - from.x, ry = to.y - from.y;
  let cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2;
  if (Math.abs(det) > 1e-6) {
    const s = (rx * d2.y - ry * d2.x) / det;
    cx = from.x + s * d1.x;
    cy = from.y + s * d1.y;
  }
  return { x: cx, y: cy };
}

/** Smooth turn along a quadratic Bézier from `from` to `to`, arriving at t1. Starts at t0 (the previous keyframe time). */
export function turnPath(from: Pose, to: Pose, t0: number, t1: number, n = 8): Keyframe[] {
  const { x: cx, y: cy } = turnControl(from, to);
  const out: Keyframe[] = [];
  for (let k = 1; k <= n; k++) {
    const u = k / n;
    const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * cx + u * u * to.x;
    const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * cy + u * u * to.y;
    const dx = 2 * (1 - u) * (cx - from.x) + 2 * u * (to.x - cx);
    const dy = 2 * (1 - u) * (cy - from.y) + 2 * u * (to.y - cy);
    const heading = k === n ? to.heading : normHeading((Math.atan2(dx, -dy) * 180) / Math.PI);
    out.push({ t: t0 + (t1 - t0) * u, x: k === n ? to.x : x, y: k === n ? to.y : y, heading, turning: true });
  }
  return out;
}

/**
 * Smooth S-curve lane change starting at `from` (the previous keyframe, at t0) and arriving at t1.
 * Moves `forward` px along `from.heading` and `side` px sideways (positive = to the driver's right),
 * at a steady forward speed. Each keyframe's heading follows the path's real angle, so the car never crabs.
 * Keyframes are not `turning`, so the lane check still applies: keep the peak angle, atan(1.5 × |side| / forward),
 * under 20° (e.g. forward ≥ 180 for a 40 px lane change).
 */
export function laneChange(from: Pose, side: number, forward: number, t0: number, t1: number, n = 12): Keyframe[] {
  const d = dir(from.heading);
  const r = { x: -d.y, y: d.x };
  const out: Keyframe[] = [];
  for (let k = 1; k <= n; k++) {
    const u = k / n;
    const s = u * u * (3 - 2 * u);
    const slope = (side * 6 * u * (1 - u)) / forward;
    out.push({
      t: t0 + (t1 - t0) * u,
      x: from.x + d.x * forward * u + r.x * side * s,
      y: from.y + d.y * forward * u + r.y * side * s,
      heading: normHeading(from.heading + (Math.atan(slope) * 180) / Math.PI),
    });
  }
  return out;
}

/** Normal driving speed in px per second. */
export const SPEED = 45;
/** Distance (px) used to speed up from a stop or slow down to a stop in `drive`. */
const RAMP = 25;

/**
 * Keyframes for driving `dist` px straight ahead from `from` (the previous keyframe, at t0) at a steady `speed`
 * (default `SPEED`). `fromStop` eases in over the first 25 px, so the car reaches full speed with no jump;
 * `toStop` eases out over the last 25 px. The last keyframe's `t` is the arrival time.
 */
export function drive(from: Pose, dist: number, t0: number, o: { fromStop?: boolean; toStop?: boolean; speed?: number } = {}): Keyframe[] {
  const v = (o.speed ?? SPEED) / 1000;
  const d = dir(from.heading);
  const at = (s: number) => ({ x: from.x + d.x * s, y: from.y + d.y * s, heading: from.heading });
  const room = o.fromStop && o.toStop ? dist / 2 : dist;
  const a = o.fromStop ? Math.min(RAMP, room) : 0;
  const b = o.toStop ? Math.min(RAMP, room) : 0;
  const out: Keyframe[] = [];
  let t = t0;
  if (a > 0) { t += (2 * a) / v; out.push({ ...at(a), t: Math.round(t), ease: 'in' }); }
  if (dist - a - b > 0) { t += (dist - a - b) / v; out.push({ ...at(dist - b), t: Math.round(t) }); }
  if (b > 0) { t += (2 * b) / v; out.push({ ...at(dist), t: Math.round(t), ease: 'out' }); }
  return out;
}

/** Time (ms) a `turnPath` from `from` to `to` should take to hold a steady `speed` (default `SPEED`). */
export function turnMs(from: Pose, to: Pose, speed = SPEED): number {
  const c = turnControl(from, to);
  let len = 0, px = from.x, py = from.y;
  for (let k = 1; k <= 64; k++) {
    const u = k / 64;
    const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * c.x + u * u * to.x;
    const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * c.y + u * u * to.y;
    len += Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  return Math.round((len / speed) * 1000);
}

/**
 * Keyframes for driving straight ahead from `from` (at t0) until t1 at a steady `SPEED`, e.g. to keep a car moving
 * to the end of a step. With `fromStop` the first 25 px ease in from a standstill (as in `drive`).
 */
export function driveUntil(from: Pose, t0: number, t1: number, o: { fromStop?: boolean } = {}): Keyframe[] {
  const dist = (SPEED * (t1 - t0)) / 1000 - (o.fromStop ? RAMP : 0);
  const out = drive(from, dist, t0, o);
  out[out.length - 1].t = t1; // absorb rounding so the last keyframe lands exactly on t1
  return out;
}

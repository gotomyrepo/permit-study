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

/**
 * Time (ms) a `turnPath` from `from` to `to` should take for an average `speed` (default `SPEED`): the curve's arc
 * length / speed. `turnPath` spaces its keyframes evenly in the curve parameter, not in distance, so the speed along
 * the curve is only roughly steady: close for a symmetric 90° turn, less so when the turn's two legs differ a lot.
 */
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
export function driveUntil(from: Pose, t0: number, t1: number, o: { fromStop?: boolean; speed?: number } = {}): Keyframe[] {
  const dist = ((o.speed ?? SPEED) * (t1 - t0)) / 1000 - (o.fromStop ? RAMP : 0);
  // With fromStop, the 25 px ramp alone takes 2 x 25 px / speed; a shorter time can't reach full speed.
  if (dist <= (o.fromStop ? RAMP : 0)) {
    throw new Error(`driveUntil: ${t1 - t0} ms (from t=${t0}) is too short${o.fromStop ? ' to speed up from a stop and drive on' : ' to drive'}`);
  }
  const out = drive(from, dist, t0, o);
  out[out.length - 1].t = t1; // absorb rounding so the last keyframe lands exactly on t1
  return out;
}

/** Rounds away floating-point dust (e.g. sin(180°) ≈ 1e-16), so poses print cleanly. */
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Middle pose of a U-turn from `from` to `to` (which must face the opposite way, off to one side): the point where
 * the car faces straight across the road, half-way between the two lanes and half the lanes' spacing ahead of
 * the further-ahead of the two poses. Both halves of the U are equally round only when `to` is level with `from`;
 * if one pose is further back, its half of the U gets a longer, flatter leg to reach the apex.
 */
export function uTurnApex(from: Pose, to: Pose): Pose {
  const d = dir(from.heading);
  const r = { x: -d.y, y: d.x };
  const rx = to.x - from.x, ry = to.y - from.y;
  const side = rx * r.x + ry * r.y;
  const ahead = rx * d.x + ry * d.y;
  const back = Math.abs(normHeading(to.heading - from.heading) - 180);
  if (back > 1 || Math.abs(side) < 1) throw new Error('uTurnApex: `to` must face the opposite way of `from`, off to one side');
  const along = Math.max(0, ahead) + Math.abs(side) / 2;
  return {
    x: round3(from.x + d.x * along + (r.x * side) / 2),
    y: round3(from.y + d.y * along + (r.y * side) / 2),
    heading: normHeading(from.heading + (side < 0 ? -90 : 90)),
  };
}

/**
 * Time (ms) a `uTurnPath` from `from` to `to` should take for an average `speed` (default `SPEED`):
 * the sum of `turnMs` for its two halves.
 */
export function uTurnMs(from: Pose, to: Pose, speed = SPEED): number {
  const apex = uTurnApex(from, to);
  return turnMs(from, apex, speed) + turnMs(apex, to, speed);
}

/**
 * Smooth U-turn from `from` (the previous keyframe, at t0) to `to` (facing the opposite way), arriving at t1:
 * two chained `turnPath` 90° turns through `uTurnApex`, with the time split so the speed stays about the same.
 * Every keyframe is `turning` and its heading follows the path. Use `uTurnMs` for t1 − t0.
 */
export function uTurnPath(from: Pose, to: Pose, t0: number, t1: number, n = 8): Keyframe[] {
  const apex = uTurnApex(from, to);
  const a = turnMs(from, apex), b = turnMs(apex, to);
  const tm = t0 + ((t1 - t0) * a) / (a + b);
  return [...turnPath(from, apex, t0, tm, n), ...turnPath(apex, to, tm, t1, n)];
}

/** Time (ms) `changeSpeed` takes to cover `forward` px while its speed goes steadily from `v0` to `v1` (px/s). */
export function changeSpeedMs(forward: number, v0: number, v1: number): number {
  return (2 * forward * 1000) / (v0 + v1);
}

/**
 * Drive `forward` px ahead from `from` (the previous keyframe, at t0) while the speed changes steadily from `v0` to
 * `v1` px/s (e.g. `SPEED` to 20 to slow down, or to 0 to come to a stop), arriving after `changeSpeedMs`.
 * With `side` it is also an S-curve lane change like `laneChange` (positive = to the driver's right), e.g. pulling
 * over to the edge of the road while stopping. Keyframes are spaced evenly in time, so the speed steps down in
 * `n` small, even steps (no lurch), and each heading follows the path's real angle. Keyframes are not `turning`:
 * keep atan(1.5 × |side| / forward) under 20°.
 */
export function changeSpeed(
  from: Pose, forward: number, t0: number, v0: number, v1: number, o: { side?: number; n?: number } = {},
): Keyframe[] {
  if (!(forward > 0)) throw new Error(`changeSpeed: forward must be more than 0 px (got ${forward})`);
  if (v0 < 0 || v1 < 0) throw new Error(`changeSpeed: speeds can't be negative (got ${v0} → ${v1} px/s)`);
  if (v0 + v1 === 0) throw new Error('changeSpeed: v0 and v1 are both 0, so the car never moves');
  const side = o.side ?? 0, n = o.n ?? 16;
  const T = changeSpeedMs(forward, v0, v1) / 1000;
  const d = dir(from.heading);
  const r = { x: -d.y, y: d.x };
  const out: Keyframe[] = [];
  for (let k = 1; k <= n; k++) {
    const s = (T * k) / n;
    const u = k === n ? 1 : (v0 * s + ((v1 - v0) * s * s) / (2 * T)) / forward;
    const lat = side * u * u * (3 - 2 * u);
    const slope = (side * 6 * u * (1 - u)) / forward;
    out.push({
      t: Math.round(t0 + s * 1000), // whole ms, like `drive`
      x: round3(from.x + d.x * forward * u + r.x * lat),
      y: round3(from.y + d.y * forward * u + r.y * lat),
      heading: normHeading(from.heading + (Math.atan(slope) * 180) / Math.PI),
    });
  }
  return out;
}

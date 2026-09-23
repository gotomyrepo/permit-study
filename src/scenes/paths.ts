import type { Ease, Keyframe, Pose } from './types';
import { dir, normHeading } from './geometry';

export function kf(p: Pose, t: number, ease?: Ease): Keyframe {
  return ease ? { x: p.x, y: p.y, heading: p.heading, t, ease } : { x: p.x, y: p.y, heading: p.heading, t };
}

/** Smooth turn along a quadratic Bézier from `from` to `to`, arriving at t1. Starts at t0 (the previous keyframe time). */
export function turnPath(from: Pose, to: Pose, t0: number, t1: number, n = 8): Keyframe[] {
  const d1 = dir(from.heading), d2 = dir(to.heading);
  const det = d1.x * d2.y - d1.y * d2.x;
  const rx = to.x - from.x, ry = to.y - from.y;
  let cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2;
  if (Math.abs(det) > 1e-6) {
    const s = (rx * d2.y - ry * d2.x) / det;
    cx = from.x + s * d1.x;
    cy = from.y + s * d1.y;
  }
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

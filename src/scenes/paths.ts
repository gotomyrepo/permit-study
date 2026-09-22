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

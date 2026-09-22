import type { Pose } from './types';

export interface Vec { x: number; y: number }
export interface RectLike { x: number; y: number; w: number; h: number }

export function dir(heading: number): Vec {
  const r = (heading * Math.PI) / 180;
  return { x: Math.sin(r), y: -Math.cos(r) };
}

export function normHeading(h: number): number {
  return ((h % 360) + 360) % 360;
}

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normHeading(a) - normHeading(b));
  return d > 180 ? 360 - d : d;
}

export function front(p: Pose, length: number): Vec {
  const d = dir(p.heading);
  return { x: p.x + d.x * (length / 2), y: p.y + d.y * (length / 2) };
}

export function corners(p: Pose, length: number, width: number): Vec[] {
  const f = dir(p.heading);
  const r = { x: -f.y, y: f.x }; // right-hand side
  const hl = length / 2, hw = width / 2;
  return [
    [hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw],
  ].map(([a, b]) => ({ x: p.x + f.x * a + r.x * b, y: p.y + f.y * a + r.y * b }));
}

export function rectCorners(r: RectLike): Vec[] {
  return [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
  ];
}

function project(poly: Vec[], nx: number, ny: number): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const p of poly) { const v = p.x * nx + p.y * ny; if (v < min) min = v; if (v > max) max = v; }
  return [min, max];
}

/** Separating-axis test for two convex quads. Touching edges do not count as overlap. */
export function obbOverlap(a: Vec[], b: Vec[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const nx = p2.y - p1.y, ny = p1.x - p2.x;
      const [amin, amax] = project(a, nx, ny);
      const [bmin, bmax] = project(b, nx, ny);
      if (amax <= bmin || bmax <= amin) return false;
    }
  }
  return true;
}

export function rectContains(r: RectLike, v: Vec): boolean {
  return v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
}

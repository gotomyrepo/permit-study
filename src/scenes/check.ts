import type { SceneDef } from './types';
import { frameAt, SIZES } from './engine';
import { angleDiff, corners, dir, front, obbOverlap, rectContains, rectCorners } from './geometry';

export interface Violation { scene: string; step: string; t: number; message: string }

const LANE_TOLERANCE_DEG = 20;
const STILL_PX = 0.5;
const DT = 50;

export function checkScene(scene: SceneDef, dt = DT): Violation[] {
  const out: Violation[] = [];
  const add = (step: string, t: number, message: string) => out.push({ scene: scene.id, step, t, message });
  const actors = new Map(scene.actors.map((a) => [a.id, a]));
  const lines = new Map(scene.lines.map((l) => [l.id, l]));
  const zones = new Map(scene.zones.map((z) => [z.id, z]));
  const stateTargets = new Set([...actors.keys(), ...scene.props]);

  // Structure
  const seen = new Set<string>();
  for (const step of scene.steps) {
    if (seen.has(step.id)) add(step.id, 0, `duplicate step id "${step.id}"`);
    seen.add(step.id);
    for (const [id, kfs] of Object.entries(step.tracks ?? {})) {
      if (!actors.has(id)) add(step.id, 0, `unknown actor "${id}" in tracks`);
      let prev = 0;
      for (const k of kfs) {
        if (k.t <= prev && !(prev === 0 && k.t === 0) || k.t > step.duration) add(step.id, k.t, `bad keyframe time ${k.t} for "${id}" (must increase and be ≤ ${step.duration})`);
        prev = k.t;
      }
    }
    for (const id of Object.keys(step.at ?? {})) if (!actors.has(id)) add(step.id, 0, `unknown actor "${id}" in at`);
    for (const s of step.states ?? []) if (!stateTargets.has(s.id)) add(step.id, s.t, `unknown state target "${s.id}"`);
    for (const e of step.expect ?? []) {
      if (!actors.has(e.actor)) add(step.id, 0, `unknown actor "${e.actor}" in expectation`);
      if (e.type === 'stopsBehind' && !lines.has(e.line)) add(step.id, 0, `unknown line "${e.line}"`);
      if (e.type === 'entersAfter' && (!zones.has(e.zone) || !actors.has(e.other))) add(step.id, 0, `unknown zone/actor in entersAfter`);
    }
  }
  if (out.length) return out;

  const isHidden = (states: Record<string, string>, id: string) => (states[id] ?? '').split(/\s+/).includes('hidden');

  scene.steps.forEach((step, si) => {
    const times: number[] = [];
    for (let t = 0; t < step.duration; t += dt) times.push(t);
    times.push(step.duration);

    const firstIn = new Map<string, number>();
    const lastIn = new Map<string, number>();

    for (const t of times) {
      const f = frameAt(scene, si, t);
      const visible = scene.actors.filter((a) => !isHidden(f.states, a.id));
      const boxes = new Map(visible.map((a) => [a.id, corners(f.poses[a.id], SIZES[a.kind].length, SIZES[a.kind].width)]));

      for (let i = 0; i < visible.length; i++)
        for (let j = i + 1; j < visible.length; j++)
          if (obbOverlap(boxes.get(visible[i].id)!, boxes.get(visible[j].id)!))
            add(step.id, t, `overlap: "${visible[i].id}" and "${visible[j].id}"`);

      for (const a of visible) {
        const p = f.poses[a.id];
        if (p.turning) continue;
        const ok = scene.zones.some((z) => rectContains(z, p)) ||
          scene.lanes.some((l) => rectContains(l, p) && (l.heading === 'any' || angleDiff(l.heading, p.heading) <= LANE_TOLERANCE_DEG));
        if (!ok) add(step.id, t, `"${a.id}" is not in a lane going its direction (x=${p.x.toFixed(0)}, y=${p.y.toFixed(0)}, heading=${p.heading.toFixed(0)})`);
      }

      for (const e of step.expect ?? []) {
        if (e.type !== 'entersAfter') continue;
        const z = zones.get(e.zone)!;
        for (const id of [e.actor, e.other]) {
          const box = boxes.get(id);
          if (box && obbOverlap(box, rectCorners(z))) {
            if (!firstIn.has(id)) firstIn.set(id, t);
            lastIn.set(id, t);
          }
        }
      }

      for (const e of step.expect ?? []) {
        if (e.type !== 'stopsBehind' || t < e.from || t > e.to) continue;
        const a = actors.get(e.actor)!;
        const p = f.poses[a.id];
        const line = lines.get(e.line)!;
        const fr = front(p, SIZES[a.kind].length);
        const d = dir(line.heading);
        if ((fr.x - line.x) * d.x + (fr.y - line.y) * d.y > 0) add(step.id, t, `"${a.id}" is past line "${line.id}"`);
        if (t + dt > e.to) continue;
        const later = frameAt(scene, si, Math.min(t + dt, step.duration)).poses[a.id];
        if (Math.hypot(later.x - p.x, later.y - p.y) > STILL_PX) add(step.id, t, `"${a.id}" is moving but should be stopped behind "${line.id}"`);
      }
    }

    for (const e of step.expect ?? []) {
      if (e.type !== 'entersAfter') continue;
      const enter = firstIn.get(e.actor);
      const otherLast = lastIn.get(e.other);
      if (enter === undefined || otherLast === undefined) {
        const missing = enter === undefined ? e.actor : e.other;
        add(step.id, 0, `"${missing}" never entered zone "${e.zone}" — both "${e.actor}" and "${e.other}" must cross the zone within the same step`);
      } else if (enter <= otherLast) {
        add(step.id, enter, `"${e.actor}" entered "${e.zone}" at ${enter}ms while "${e.other}" was still there until ${otherLast}ms`);
      }
    }
  });
  return out;
}

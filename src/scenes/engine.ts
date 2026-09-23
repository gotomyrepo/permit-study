import type { ActorKind, Ease, Frame, FramePose, Keyframe, Pose, SceneDef, StepDef } from './types';
import { normHeading } from './geometry';

export const SIZES: Record<ActorKind, { length: number; width: number }> = {
  car: { length: 36, width: 18 },
  bus: { length: 64, width: 22 },
  ambulance: { length: 40, width: 20 },
  truck: { length: 60, width: 22 },
  bike: { length: 16, width: 6 },
  // Seen from above: shoulders across (width), head in the middle.
  pedestrian: { length: 12, width: 16 },
};

function ease(e: Ease | undefined, u: number): number {
  switch (e) {
    case 'in': return u * u;
    case 'out': return 1 - (1 - u) * (1 - u);
    case 'inOut': return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    default: return u;
  }
}

function lerpAngle(a: number, b: number, u: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return normHeading(a + d * u);
}

function trackPose(start: Pose, kfs: Keyframe[] | undefined, t: number): FramePose {
  if (!kfs || kfs.length === 0) return { ...start, turning: false };
  let prev: Pose = start;
  let prevT = 0;
  for (const k of kfs) {
    if (t <= k.t) {
      const span = k.t - prevT;
      const u = span <= 0 ? 1 : ease(k.ease, (t - prevT) / span);
      return {
        x: prev.x + (k.x - prev.x) * u,
        y: prev.y + (k.y - prev.y) * u,
        heading: lerpAngle(prev.heading, k.heading, u),
        turning: !!k.turning && t > prevT,
      };
    }
    prev = k;
    prevT = k.t;
  }
  return { x: prev.x, y: prev.y, heading: normHeading(prev.heading), turning: false };
}

function evalStep(step: StepDef, base: Record<string, Pose>, baseStates: Record<string, string>, t: number): Frame {
  const start: Record<string, Pose> = { ...base, ...(step.at ?? {}) };
  const poses: Record<string, FramePose> = {};
  for (const [id, p] of Object.entries(start)) poses[id] = trackPose(p, step.tracks?.[id], t);
  const states = { ...baseStates };
  const sets = [...(step.states ?? [])].sort((a, b) => a.t - b.t);
  for (const s of sets) if (s.t <= t) states[s.id] = s.state;
  return { poses, states };
}

export function frameAt(scene: SceneDef, stepIndex: number, t: number): Frame {
  let poses: Record<string, Pose> = Object.fromEntries(scene.actors.map((a) => [a.id, { ...a.start }]));
  let states: Record<string, string> = { ...(scene.initialStates ?? {}) };
  for (let i = 0; i < stepIndex; i++) {
    const f = evalStep(scene.steps[i], poses, states, scene.steps[i].duration);
    poses = Object.fromEntries(Object.entries(f.poses).map(([id, p]) => [id, { x: p.x, y: p.y, heading: p.heading }]));
    states = f.states;
  }
  const step = scene.steps[stepIndex];
  return evalStep(step, poses, states, Math.max(0, Math.min(t, step.duration)));
}

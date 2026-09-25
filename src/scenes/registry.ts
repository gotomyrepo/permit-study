import type { SceneDef } from './types';
import { yieldScenes } from './defs/yield';
import { signsScenes } from './defs/signs';
import { lightsScenes } from './defs/lights';
import { markingsScenes } from './defs/markings';
import { rightOfWayScenes } from './defs/right-of-way';
import { turnsScenes } from './defs/turns';
import { emergencyScenes } from './defs/emergency';
import { schoolBusScenes } from './defs/school-bus';
import { speedScenes } from './defs/speed';

// Each lesson task adds its scene list here.
const ALL: SceneDef[] = [...yieldScenes, ...signsScenes, ...lightsScenes, ...markingsScenes, ...rightOfWayScenes, ...turnsScenes, ...emergencyScenes, ...schoolBusScenes, ...speedScenes];

export const SCENES: Record<string, SceneDef> = Object.fromEntries(ALL.map((s) => [s.id, s]));
export const ALL_SCENES: readonly SceneDef[] = ALL;

export function getScene(id: string): SceneDef {
  const s = SCENES[id];
  if (!s) throw new Error(`Unknown scene: ${id}`);
  return s;
}

export function stepIndexOf(scene: SceneDef, stepId: string): number {
  const i = scene.steps.findIndex((s) => s.id === stepId);
  if (i < 0) throw new Error(`Scene ${scene.id} has no step ${stepId}`);
  return i;
}

export function sceneIndex(): Record<string, string[]> {
  return Object.fromEntries(ALL.map((s) => [s.id, s.steps.map((st) => st.id)]));
}

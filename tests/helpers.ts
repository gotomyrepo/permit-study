import { frameAt } from '../src/scenes/engine';
import type { SceneDef } from '../src/scenes/types';

/** The state string of actor or prop `id` at `t` ms into step `step` ('' when none is set). */
export const stateAt = (s: SceneDef, id: string, t: number, step = 0) => frameAt(s, step, t).states[id] ?? '';

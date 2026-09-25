import type { StateSet } from './types';

/** A timed state change: at `t` ms into the step, actor or prop `id` takes `state` (e.g. 'highlight', 'hidden', ''). */
export const set = (id: string, state: string, t = 0): StateSet => ({ t, id, state });

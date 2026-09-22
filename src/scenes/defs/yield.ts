import type { SceneDef } from '../types';
import { fourWay, FOURWAY, signCloseup, stopPose } from '../layouts';
import { kf } from '../paths';

const L = fourWay({ controls: { nb: 'yield' } });

export const yieldIntersection: SceneDef = {
  id: 'yield-intersection', width: 300, height: 300, ...L,
  actors: [
    { id: 'blue', kind: 'car', you: true, start: FOURWAY.start.nb },
    { id: 'red', kind: 'car', color: '#e53935', start: FOURWAY.start.eb },
  ],
  steps: [
    { id: 'show-sign', duration: 2500, states: [{ t: 0, id: FOURWAY.signId('nb'), state: 'highlight' }] },
    {
      id: 'slow-down', duration: 3000,
      states: [{ t: 0, id: FOURWAY.signId('nb'), state: '' }],
      tracks: { blue: [kf(stopPose('nb'), 3000, 'out')] },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: FOURWAY.lineId('nb'), from: 3000, to: 3000 }],
    },
    {
      id: 'wait-then-go', duration: 7000,
      tracks: {
        red: [kf(FOURWAY.exit.eb, 3500)],
        blue: [kf(stopPose('nb'), 4500), kf(FOURWAY.exit.nb, 7000, 'in')],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: FOURWAY.lineId('nb'), from: 0, to: 4500 },
        { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
      ],
    },
    {
      id: 'question-freeze', duration: 500,
      at: { blue: { x: 165, y: 245, heading: 0 }, red: { x: 70, y: 165, heading: 90 } },
    },
  ],
};

export const yieldScenes: SceneDef[] = [yieldIntersection, signCloseup('sign-yield', 'yield')];

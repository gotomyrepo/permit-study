import type { SceneDef } from '../types';
import { fourWay, FOURWAY, signCloseup, stopPose } from '../layouts';
import { sign, type SignKind } from '../parts';
import { kf } from '../paths';

const L = fourWay({ controls: { nb: 'stop' } });

/** Blue comes to a full stop behind the stop line, lets the red car cross, then goes. */
export const stopIntersection: SceneDef = {
  id: 'stop-intersection', width: 300, height: 300, ...L,
  actors: [
    { id: 'blue', kind: 'car', you: true, start: FOURWAY.start.nb },
    { id: 'red', kind: 'car', color: '#e53935', start: FOURWAY.start.eb },
  ],
  steps: [
    {
      id: 'stop-then-go', duration: 9000,
      states: [
        { t: 0, id: FOURWAY.signId('nb'), state: 'highlight' },
        { t: 3000, id: FOURWAY.signId('nb'), state: '' },
      ],
      tracks: {
        blue: [kf(stopPose('nb'), 3000, 'out'), kf(stopPose('nb'), 6500), kf(FOURWAY.exit.nb, 9000, 'in')],
        red: [kf(FOURWAY.exit.eb, 5500)],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: FOURWAY.lineId('nb'), from: 3000, to: 6500 },
        { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
      ],
    },
    {
      id: 'question-freeze', duration: 500,
      at: { blue: stopPose('nb'), red: { x: 70, y: 165, heading: 90 } },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: FOURWAY.lineId('nb'), from: 0, to: 500 }],
    },
  ],
};

/** A sign close-up with an extra still step long enough for its card's narration. */
function teachCloseup(id: string, kind: SignKind, teachMs: number, text?: string): SceneDef {
  const s = signCloseup(id, kind, text ? { text } : {});
  return { ...s, steps: [...s.steps, { id: 'teach', duration: teachMs }] };
}

/** Green destination sign and blue service sign side by side. */
export const signGuide: SceneDef = {
  id: 'sign-guide', width: 300, height: 300,
  background: `<rect x="0" y="0" width="300" height="300" fill="#eceff1"/>` +
    sign('destination', 80, 150, { size: 120, post: false, text: 'ALBANY' }) +
    sign('service', 220, 150, { size: 120, post: false, text: 'GAS' }),
  lanes: [], zones: [], lines: [], props: [], actors: [],
  steps: [{ id: 'teach', duration: 5300 }],
};

export const signsScenes: SceneDef[] = [
  stopIntersection,
  signCloseup('sign-stop', 'stop'),
  teachCloseup('sign-speed', 'speed', 5000, '55'),
  teachCloseup('sign-warning', 'warning', 6000),
  teachCloseup('sign-work-zone', 'work-zone', 4200, 'WORK'),
  signCloseup('sign-destination', 'destination', { text: 'ALBANY' }),
  signCloseup('sign-service', 'service', { text: 'GAS' }),
  signGuide,
];

import type { SceneDef } from '../types';
import { fourWay, FOURWAY, signCloseup, signPair, stopPose } from '../layouts';
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

export const signsScenes: SceneDef[] = [
  stopIntersection,
  signCloseup('sign-stop', 'stop'),
  // teachMs values are hand-sized to each card's narration clip (see public/audio/card-signs-*.json), plus a little slack.
  signCloseup('sign-speed', 'speed', { text: '55', teachMs: 5000 }),
  signCloseup('sign-warning', 'warning', { teachMs: 6000 }),
  signCloseup('sign-work-zone', 'work-zone', { text: 'WORK', teachMs: 4200 }),
  signCloseup('sign-destination', 'destination', { text: 'ITHACA' }),
  signCloseup('sign-service', 'service', { text: 'GAS' }),
  // Green destination and blue service signs side by side; 5700 ms fits the 5.3 s narration.
  signPair('sign-guide', { kind: 'destination', text: 'ITHACA' }, { kind: 'service', text: 'GAS' }, 5700),
];

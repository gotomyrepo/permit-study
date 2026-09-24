import type { ActorDef, ActorKind } from './types';
import { SIZES } from './engine';
import { COLORS, octagonPoints } from './parts';

const DEFAULT_COLOR: Record<ActorKind, string> = {
  car: '#e53935', bus: '#fbc02d', ambulance: '#ffffff', truck: '#78909c', bike: '#8e24aa', pedestrian: '#ff7043',
};

/**
 * Turn-signal lights for a car: a big amber lamp at the front and back corner on each side, with a blinking halo.
 * They are hidden unless the actor's state includes `signal-left` or `signal-right` (see styles.css); the lamps stay
 * lit and only the halo blinks, so a still picture always shows the signal on.
 */
function blinkers(W: number, L: number): string {
  const side = (s: 'left' | 'right', sx: number) =>
    `<g class="blinker blinker-${s}">` +
    [-L / 2 + 4, L / 2 - 4].map((cy) =>
      `<circle class="halo" cx="${sx}" cy="${cy}" r="8" fill="#ffe082" fill-opacity="0.9"/>` +
      `<circle cx="${sx}" cy="${cy}" r="4.5" fill="#ffab00" stroke="#212121" stroke-width="1.5"/>`).join('') +
    `</g>`;
  return side('left', -W / 2) + side('right', W / 2);
}

/** Drawn pointing up (heading 0), centered on the origin. */
export function vehicleSvg(a: ActorDef): string {
  const { length: L, width: W } = SIZES[a.kind];
  const x = -W / 2, y = -L / 2;
  const color = a.you ? COLORS.you : a.color ?? DEFAULT_COLOR[a.kind];
  const glass = (gy: number, gh: number) => `<rect x="${x + 3}" y="${gy}" width="${W - 6}" height="${gh}" rx="2" fill="#e3f2fd"/>`;
  switch (a.kind) {
    case 'car':
      return `<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="5" fill="${color}" stroke="#0004"/>` + glass(y + 6, 8) + glass(L / 2 - 8, 5) +
        blinkers(W, L);
    case 'bus':
      return `<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="4" fill="${color}" stroke="#0006"/>` + glass(y + 4, 7) +
        `<rect x="${x}" y="${y + 20}" width="${W}" height="3" fill="#212121"/>` +
        `<g class="stop-arm"><polygon points="${octagonPoints(x - 8, y + 16, 6)}" fill="#d32f2f" stroke="#fff"/></g>` +
        [[x + 3, y + 2], [-x - 3, y + 2], [x + 3, -y - 2], [-x - 3, -y - 2]]
          .map(([cx, cy]) => `<circle class="beacon" cx="${cx}" cy="${cy}" r="2.5" fill="#f44336"/>`).join('');
    case 'ambulance':
      return `<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="4" fill="${color}" stroke="#9e9e9e"/>` + glass(y + 4, 7) +
        `<rect x="-2.5" y="-6" width="5" height="16" fill="#d32f2f"/><rect x="-8" y="-0.5" width="16" height="5" fill="#d32f2f"/>` +
        `<circle class="beacon" cx="${x + 4}" cy="${y + 14}" r="3" fill="#f44336"/><circle class="beacon" cx="${-x - 4}" cy="${y + 14}" r="3" fill="#2196f3"/>`;
    case 'truck':
      return `<rect x="${x}" y="${y}" width="${W}" height="14" rx="3" fill="${color}" stroke="#0006"/>` + glass(y + 3, 5) +
        `<rect x="${x}" y="${y + 16}" width="${W}" height="${L - 16}" rx="2" fill="#cfd8dc" stroke="#0006"/>`;
    case 'bike':
      return `<rect x="-1.5" y="${y}" width="3" height="${L}" fill="#212121"/><circle r="3.5" fill="${color}"/>`;
    case 'pedestrian':
      // A person seen from above: shoulders (in the shirt color) and a dark head.
      return `<ellipse rx="${W / 2}" ry="${L / 2 - 0.5}" fill="${color}" stroke="#212121" stroke-width="1.5"/><circle r="5.5" fill="#3e2723" stroke="#212121"/>`;
  }
}

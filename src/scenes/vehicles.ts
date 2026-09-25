import type { ActorDef, ActorKind } from './types';
import { SIZES } from './engine';
import { COLORS, octagonPoints } from './parts';

const DEFAULT_COLOR: Record<ActorKind, string> = {
  car: '#e53935', bus: '#f9a825', ambulance: '#ffffff', truck: '#78909c', bike: '#8e24aa', pedestrian: '#ff7043',
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

/**
 * An ambulance's two big roof lights, red on the left and blue on the right, just behind the windshield. They are dim
 * unless the actor's state includes `flashing` (see styles.css); then the lamps stay fully lit and only their
 * halos blink, so a still picture always shows the lights on.
 */
function emergencyLights(): string {
  const lights = [{ cx: -5, lamp: '#f44336', halo: '#ff8a80' }, { cx: 5, lamp: '#2962ff', halo: '#82b1ff' }];
  // Both halos first, so neither lamp is covered by the other's halo.
  return lights.map((l) => `<circle class="siren-halo" cx="${l.cx}" cy="-3" r="8" fill="${l.halo}" fill-opacity="0.9"/>`).join('') +
    lights.map((l) => `<circle class="siren" cx="${l.cx}" cy="-3" r="4.5" fill="${l.lamp}" stroke="#212121" stroke-width="1.2"/>`).join('');
}

/**
 * A school bus's roof lights: a dark lamp bar across the front and back, each with two lamps. The lamps are red
 * (class `beacon`) with yellow ones (class `beacon-amber`) drawn on the same spots. They are dim red unless the
 * actor's state includes `flashing` (red lit) or `warning` (yellow lit); then the lamps stay fully lit and only
 * their halos blink, so a still picture always shows the lights on (see styles.css).
 */
function busLights(L: number): string {
  const spots = [-L / 2 + 4.5, L / 2 - 4.5].flatMap((cy) => [-5.5, 5.5].map((cx) => ({ cx, cy })));
  const bars = [-L / 2 + 1, L / 2 - 8].map((by) => `<rect x="-10" y="${by}" width="20" height="7" rx="2" fill="#263238"/>`).join('');
  const set = (cls: string, lamp: string, halo: string) =>
    spots.map((p) => `<circle class="${cls}-halo" cx="${p.cx}" cy="${p.cy}" r="7.5" fill="${halo}" fill-opacity="0.9"/>`).join('') +
    spots.map((p) => `<circle class="${cls}" cx="${p.cx}" cy="${p.cy}" r="3.5" fill="${lamp}" stroke="#212121" stroke-width="1.2"/>`).join('');
  return bars + set('beacon', '#f44336', '#ff5252') + set('beacon-amber', '#ffea00', '#fff59d');
}

/**
 * A school bus's stop arm: a big red octagon with a white rim on a short hinge, sticking out of the driver's (left)
 * side near the front. It is hidden unless the actor's state includes `stop-arm` (see styles.css).
 */
function stopArm(x: number, y: number): string {
  const cx = x - 10, cy = y + 14;
  return `<g class="stop-arm"><rect x="${x - 3}" y="${cy - 1.5}" width="4" height="3" fill="#424242"/>` +
    `<polygon points="${octagonPoints(cx, cy, 8.5)}" fill="#fff" stroke="#212121" stroke-width="1"/>` +
    `<polygon points="${octagonPoints(cx, cy, 6.5)}" fill="#d32f2f"/></g>`;
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
      // Yellow-orange, with a dark lamp bar at the front and back holding two red and two yellow roof lights, and a
      // folding stop arm on the driver's (left) side (see `busLights` and `stopArm`).
      return `<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="4" fill="${color}" stroke="#4e342e" stroke-width="1.5"/>` +
        glass(y + 9, 6) + `<rect x="${x}" y="${y + 20}" width="${W}" height="3" fill="#212121"/>` +
        stopArm(x, y) + busLights(L);
    case 'ambulance':
      // A red and a blue emergency light on the roof, behind the windshield (see `emergencyLights`), and a red cross.
      return `<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="4" fill="${color}" stroke="#616161" stroke-width="1.5"/>` + glass(y + 4, 7) +
        `<rect x="-2.5" y="4" width="5" height="13" fill="#d32f2f"/><rect x="-6.5" y="8" width="13" height="5" fill="#d32f2f"/>` +
        emergencyLights();
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

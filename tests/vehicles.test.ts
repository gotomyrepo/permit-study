import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { vehicleSvg } from '../src/scenes/vehicles';

describe('turn-signal blinkers', () => {
  const car = vehicleSvg({ id: 'c', kind: 'car', start: { x: 0, y: 0, heading: 0 } });
  test('a car has an amber front and back lamp on each side edge', () => {
    for (const [side, x] of [['left', -9], ['right', 9]] as const) {
      const g = car.match(new RegExp(`<g class="blinker blinker-${side}">(.*?)</g>`));
      expect(g).not.toBeNull();
      expect(g![1].match(/fill="#ffab00"/g)).toHaveLength(2);
      expect(g![1]).toContain(`cx="${x}"`);
    }
  });
  test('the CSS hides blinkers unless the state names that side; only the halo blinks', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toContain('.actor .blinker { display: none; }');
    expect(css).toContain('.actor[data-state~="signal-left"] .blinker-left, .actor[data-state~="signal-right"] .blinker-right { display: inline; }');
    expect(css).toMatch(/signal-left"\] \.blinker-left \.halo.*animation: flash/);
  });
});

describe('ambulance roof lights', () => {
  const amb = vehicleSvg({ id: 'a', kind: 'ambulance', start: { x: 0, y: 0, heading: 0 } });
  test('a big red and a big blue lamp, each with a halo', () => {
    expect(amb.match(/class="siren"/g)).toHaveLength(2);
    expect(amb.match(/class="siren-halo"/g)).toHaveLength(2);
    expect(amb).toContain('fill="#f44336"');
    expect(amb).toContain('fill="#2962ff"');
  });
  test('the CSS lights the lamps when flashing; only the halos blink, so a still picture shows them on', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toContain('.actor[data-state~="flashing"] .siren { opacity: 1; }');
    expect(css).toMatch(/flashing"\] \.siren-halo \{ display: inline; animation: flash/);
  });
});

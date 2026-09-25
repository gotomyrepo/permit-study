import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  alcoholBac, alcoholDrugs, alcoholEffects, alcoholTime, alcoholUnder21,
  BAC_T, DRUGS_T, EFFECTS_T, TIME_T, UNDER21_T,
} from '../src/scenes/defs/alcohol';
import type { SceneDef } from '../src/scenes/types';
import { stateAt } from './helpers';

/** A card's word timings, from the generated audio. */
const clip = (id: string) => {
  const c = JSON.parse(readFileSync(`public/audio/card-alcohol-${id}.json`, 'utf8')) as { text: string; words: { i: number; start: number; end: number }[] };
  const words = c.text.split(/\s+/);
  return { end: Math.max(...c.words.map((w) => w.end)), start: (word: string) => c.words.find((w) => words[w.i] === word)!.start };
};
const shown = (s: SceneDef, id: string, t: number, step = 0) => !stateAt(s, id, t, step).includes('hidden');
const ringed = (s: SceneDef, id: string, t: number) => stateAt(s, id, t).includes('highlight');

describe('alcohol lesson pictures', () => {
  test('each effect card appears ringed on its sentence, and none shows in the question', () => {
    const cards = [['react', EFFECTS_T.react], ['see', EFFECTS_T.see], ['judge', EFFECTS_T.judge], ['chances', EFFECTS_T.chances]] as const;
    for (const [id, [on, off]] of cards) {
      expect(shown(alcoholEffects, id, on - 1)).toBe(false);
      expect(ringed(alcoholEffects, id, on)).toBe(true);
      expect(ringed(alcoholEffects, id, off)).toBe(false);
      expect(shown(alcoholEffects, id, off)).toBe(true);
      expect(shown(alcoholEffects, id, 0, 1)).toBe(false);
    }
  });
  test('drugs: each card appears on its word', () => {
    for (const [id, on] of [['leaf', DRUGS_T.leaf[0]], ['pills', DRUGS_T.pills[0]], ['bottle', DRUGS_T.bottle[0]], ['both', DRUGS_T.both]] as const) {
      expect(shown(alcoholDrugs, id, on - 1)).toBe(false);
      expect(ringed(alcoholDrugs, id, on)).toBe(true);
    }
  });
  test('BAC: "0.08" is on screen before it is said, and the question hides "DRUNK" only', () => {
    expect(alcoholBac.background).toContain('>0.08 OR MORE<');
    expect(BAC_T.limit[0]).toBeLessThan(clip('bac').start('0.08'));
    expect(ringed(alcoholBac, 'limit', BAC_T.limit[0])).toBe(true);
    expect(shown(alcoholBac, 'drunk', BAC_T.drunk - 1)).toBe(false);
    expect(ringed(alcoholBac, 'drunk', BAC_T.drunk)).toBe(true);
    for (const id of ['bac', 'means', 'limit']) expect(shown(alcoholBac, id, 0, 1)).toBe(true);
    expect(shown(alcoholBac, 'drunk', 0, 1)).toBe(false);
  });
  test('time: only the clock gets a check; the question shows the four cards with no marks', () => {
    expect(alcoholTime.background).toMatch(/data-prop="time-mark">.*M-8 0 L-2 7 L9 -7/);
    for (const [id, [on]] of [['time', TIME_T.time], ['coffee', TIME_T.coffee], ['exercise', TIME_T.exercise], ['shower', TIME_T.shower]] as const) {
      expect(shown(alcoholTime, `${id}-mark`, on - 1)).toBe(false);
      expect(shown(alcoholTime, `${id}-mark`, on)).toBe(true);
      expect(ringed(alcoholTime, id, on)).toBe(true);
      expect(shown(alcoholTime, `${id}-mark`, 0, 1)).toBe(false);
      expect(shown(alcoholTime, id, 0, 1)).toBe(true);
    }
  });
  test('under 21: the rule cards are hidden in the question', () => {
    expect(ringed(alcoholUnder21, 'under-21', UNDER21_T.under[0])).toBe(true);
    expect(ringed(alcoholUnder21, 'no-alcohol', UNDER21_T.none[0])).toBe(true);
    expect(ringed(alcoholUnder21, 'never', UNDER21_T.never)).toBe(true);
    expect(shown(alcoholUnder21, 'no-alcohol', 0, 1)).toBe(false);
    expect(shown(alcoholUnder21, 'never', 0, 1)).toBe(false);
  });
  test('each teach step lasts past the end of its clip', () => {
    const scenes: [SceneDef, string][] = [[alcoholEffects, 'effects'], [alcoholDrugs, 'drugs'], [alcoholBac, 'bac'], [alcoholTime, 'time'], [alcoholUnder21, 'under-21']];
    for (const [s, id] of scenes) expect(s.steps[0].duration).toBeGreaterThan(clip(id).end);
  });
});

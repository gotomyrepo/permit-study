import { describe, test, expect } from 'vitest';
import { assembleTest, scoreTest } from '../src/practice/assemble';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pool = (n: number, signs: number) =>
  Array.from({ length: n }, (_, i) => ({ q: { id: `q${i}`, signQuestion: i < signs } }));

describe('assembleTest', () => {
  test('20 questions with exactly 4 sign questions and no duplicates', () => {
    const t = assembleTest(pool(60, 10), new Set(), seeded(1));
    expect(t).toHaveLength(20);
    expect(t.filter((x) => x.q.signQuestion)).toHaveLength(4);
    expect(new Set(t.map((x) => x.q.id)).size).toBe(20);
  });
  test('small pool uses everything available', () => {
    const t = assembleTest(pool(7, 2), new Set(), seeded(2));
    expect(t).toHaveLength(7);
    expect(t.filter((x) => x.q.signQuestion)).toHaveLength(2);
  });
  test('missed questions are picked more often', () => {
    let hits = 0;
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) if (assembleTest(pool(60, 10), new Set(['q40']), rng).some((x) => x.q.id === 'q40')) hits++;
    // unweighted chance is 16/50 = 32%; weighted should be clearly higher
    expect(hits / 200).toBeGreaterThan(0.5);
  });
});

describe('scoreTest', () => {
  const answers = (correct: number, signCorrect: number) =>
    Array.from({ length: 20 }, (_, i) => i < 4
      ? { correct: i < signCorrect, sign: true }
      : { correct: i - 4 < correct - signCorrect, sign: false });
  test('14 right with 2 signs passes', () => {
    expect(scoreTest(answers(14, 2))).toMatchObject({ correct: 14, total: 20, signCorrect: 2, passed: true });
  });
  test('13 right fails', () => expect(scoreTest(answers(13, 4)).passed).toBe(false));
  test('18 right but only 1 sign fails', () => expect(scoreTest(answers(18, 1)).passed).toBe(false));
  test('small test uses 70%', () => {
    expect(scoreTest([{ correct: true, sign: false }, { correct: true, sign: false }, { correct: false, sign: false }]).passed).toBe(false);
    expect(scoreTest([{ correct: true, sign: false }, { correct: true, sign: false }, { correct: true, sign: false }]).passed).toBe(true);
  });
});

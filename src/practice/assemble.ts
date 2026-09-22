export interface TestItem { q: { id: string; signQuestion: boolean } }
export interface TestAnswer { correct: boolean; sign: boolean }
export interface TestScore { correct: number; total: number; signCorrect: number; signTotal: number; passed: boolean }

export const TEST_SIZE = 20;
export const SIGN_COUNT = 4;
const MISSED_WEIGHT = 4;

/** Weighted sampling without replacement (Efraimidis–Spirakis). */
function pick<T extends TestItem>(items: T[], n: number, missed: Set<string>, rng: () => number): T[] {
  return items
    .map((it) => ({ it, key: rng() ** (1 / (missed.has(it.q.id) ? MISSED_WEIGHT : 1)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, n)
    .map((x) => x.it);
}

export function assembleTest<T extends TestItem>(pool: T[], missed: Set<string>, rng: () => number = Math.random): T[] {
  const signs = pool.filter((p) => p.q.signQuestion);
  const others = pool.filter((p) => !p.q.signQuestion);
  const s = pick(signs, Math.min(SIGN_COUNT, signs.length), missed, rng);
  const o = pick(others, Math.min(TEST_SIZE - s.length, others.length), missed, rng);
  const all = [...s, ...o];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export function scoreTest(answers: TestAnswer[]): TestScore {
  const total = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  const signTotal = answers.filter((a) => a.sign).length;
  const signCorrect = answers.filter((a) => a.sign && a.correct).length;
  const passed = total > 0 && (total === TEST_SIZE && signTotal === SIGN_COUNT
    ? correct >= 14 && signCorrect >= 2 // manual p.10
    : correct >= Math.ceil(total * 0.7) && (signTotal === 0 || signCorrect >= Math.ceil(signTotal / 2)));
  return { correct, total, signCorrect, signTotal, passed };
}

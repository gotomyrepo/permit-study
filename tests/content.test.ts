import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { normalizeForMatch } from '../src/content/normalize';
import { validateLessons } from '../src/content/validate';
import { audioLines, audioId, TEXT } from '../src/content/audioLines';
import { LessonSchema, type Lesson } from '../src/content/types';
import type { ManualPage } from '../src/content/validate';

const pages = [
  { page: 29, text: 'MEANING: Decrease speed \nas you reach the intersec-\ntion. Y ou must come to a full stop at \na YIELD sign if traffic conditions require it.' },
  { page: 30, text: 'Traffic signals are usually red, yellow and green.' },
];
const scenes = { 'yield-intersection': ['slow-down', 'question-freeze'] };

// Real pypdf-extracted text, used to guard against normalizeForMatch collapsing distinct numbers.
const realPages: ManualPage[] = JSON.parse(readFileSync('content/manual/pages.json', 'utf8'));
const realPage = (n: number) => [realPages.find((p) => p.page === n)!];

const lesson = (over: Partial<Lesson> = {}): Lesson => LessonSchema.parse({
  id: 'yield', order: 2, title: 'Yield', icon: '🔻',
  cards: [{ id: 'yield-1', say: 'Slow down.', scene: 'yield-intersection', step: 'slow-down',
    source: { page: 29, quote: 'Decrease speed as you reach the intersection.' } }],
  questions: [{ id: 'yield-q1', ask: 'Who goes first?', scene: 'yield-intersection', step: 'question-freeze',
    choices: ['Blue', 'Red'], answer: 1, explainCard: 'yield-1',
    source: { page: 29, quote: 'You must come to a full stop at a YIELD sign if traffic conditions require it.' } }],
  ...over,
});

describe('normalizeForMatch', () => {
  test('ignores PDF artifacts', () => {
    expect(normalizeForMatch('intersec-\ntion')).toBe(normalizeForMatch('intersection'));
    expect(normalizeForMatch('Y ou')).toBe('you');
    expect(normalizeForMatch('ﬁre “hydrant”')).toBe('firehydrant');
  });
  test('keeps punctuation that sits between digits, or next to a digit', () => {
    expect(normalizeForMatch('.08')).toBe('.08');
    expect(normalizeForMatch('1 1⁄2')).toBe('11/2');
  });
});

describe('validateLessons: numbers must match exactly (real manual text)', () => {
  const scenesReal = { s: ['step'] };
  const l = (page: number, quote: string): Lesson => LessonSchema.parse({
    id: 'l', order: 1, title: 'T', icon: '🔻',
    cards: [{ id: 'c1', say: 'say', scene: 's', step: 'step', source: { page, quote } }],
    questions: [{ id: 'q1', ask: 'ask', scene: 's', step: 'step', choices: ['a', 'b'], answer: 0, explainCard: 'c1',
      source: { page, quote } }],
  });

  test('.08 BAC does not match a wrong quote of "0.8 BAC"', () => {
    const bad = l(55, 'a BAC of 0.8 percent or higher is evidence of intoxication');
    expect(validateLessons([bad], realPage(55), scenesReal).join()).toContain('quote not found on page 55');
    const good = l(55, 'a BAC of .08 percent or higher is evidence of intoxication');
    expect(validateLessons([good], realPage(55), scenesReal)).toEqual([]);
  });

  test('55 mph does not match a wrong quote of "5 mph"', () => {
    const bad = l(47, '5 mph (88 km/h)');
    expect(validateLessons([bad], realPage(47), scenesReal).join()).toContain('quote not found on page 47');
    const good = l(47, '55 mph (88 km/h)');
    expect(validateLessons([good], realPage(47), scenesReal)).toEqual([]);
  });

  test('15 feet does not match a wrong quote of "5 feet"', () => {
    const bad = l(43, '5 feet (5 m) of a fire hydrant');
    expect(validateLessons([bad], realPage(43), scenesReal).join()).toContain('quote not found on page 43');
    const good = l(43, '15 feet (5 m) of a fire hydrant');
    expect(validateLessons([good], realPage(43), scenesReal)).toEqual([]);
  });

  test('1 1/2 oz. liquor does not match a wrong quote of "11 2 oz. liquor"', () => {
    const bad = l(55, '11 2 oz. liquor');
    expect(validateLessons([bad], realPage(55), scenesReal).join()).toContain('quote not found on page 55');
    const good = l(55, '1 1⁄2 oz. liquor');
    expect(validateLessons([good], realPage(55), scenesReal)).toEqual([]);
  });

  test('"legal to sound your horn..." does not match inside "illegal to sound your horn..." (p76)', () => {
    const bad = l(76, 'legal to sound your horn when you approach');
    expect(validateLessons([bad], realPage(76), scenesReal).join()).toContain('quote not found on page 76');
    const good = l(76, 'illegal to sound your horn when you approach');
    expect(validateLessons([good], realPage(76), scenesReal)).toEqual([]);
  });

  test('"legal to use portable..." does not match inside "illegal to use portable..." (p52)', () => {
    const bad = l(52, 'legal to use portable electronic devices');
    expect(validateLessons([bad], realPage(52), scenesReal).join()).toContain('quote not found on page 52');
  });
});

describe('validateLessons: quote minimum length', () => {
  test('rejects a short, generic quote', () => {
    const l: Lesson = LessonSchema.parse({
      id: 'l', order: 1, title: 'T', icon: '🔻',
      cards: [{ id: 'c1', say: 'say', scene: 's', step: 'step', source: { page: 29, quote: 'stop sign.' } }],
      questions: [{ id: 'q1', ask: 'ask', scene: 's', step: 'step', choices: ['a', 'b'], answer: 0, explainCard: 'c1',
        source: { page: 29, quote: 'stop sign.' } }],
    });
    const e = validateLessons([l], pages, { s: ['step'] }).join('\n');
    expect(e).toContain('quote too short');
  });
});

describe('validateLessons', () => {
  test('valid lesson has no errors', () => {
    expect(validateLessons([lesson()], pages, scenes)).toEqual([]);
  });
  test('quote not on the cited page', () => {
    const l = lesson();
    l.cards[0].source = { page: 30, quote: 'Decrease speed as you reach the intersection.' };
    expect(validateLessons([l], pages, scenes).join()).toContain('quote not found on page 30');
  });
  test('quote may continue onto the next page', () => {
    const l = lesson();
    l.cards[0].source = { page: 29, quote: 'require it. Traffic signals are usually red' };
    expect(validateLessons([l], pages, scenes)).toEqual([]);
  });
  test('page outside the manual', () => {
    const l = lesson();
    l.cards[0].source = { page: 999, quote: 'Decrease speed as you reach the intersection.' };
    expect(validateLessons([l], pages, scenes).join()).toContain('page 999');
  });
  test('unknown scene and step', () => {
    const l = lesson();
    l.cards[0].scene = 'nope';
    l.questions[0].step = 'nope';
    const e = validateLessons([l], pages, scenes).join('\n');
    expect(e).toContain('unknown scene "nope"');
    expect(e).toContain('has no step "nope"');
  });
  test('answer index out of range and bad explainCard', () => {
    const l = lesson();
    l.questions[0].answer = 5;
    l.questions[0].explainCard = 'missing';
    const e = validateLessons([l], pages, scenes).join('\n');
    expect(e).toContain('answer 5');
    expect(e).toContain('explainCard "missing"');
  });
  test('duplicate ids and orders across lessons', () => {
    const e = validateLessons([lesson(), lesson()], pages, scenes).join('\n');
    expect(e).toContain('duplicate id "yield"');
    expect(e).toContain('duplicate order 2');
  });
});

describe('audioLines', () => {
  test('includes every spoken string with stable ids', () => {
    const l = lesson();
    const lines = audioLines([l]);
    const ids = new Set(lines.map((x) => x.id));
    for (const id of ['phrase-not-quite', 'phrase-num-1', 'card-yield-1', 'q-yield-q1', 'q-yield-q1-c0', 'q-yield-q1-c1',
      'q-yield-q1-yes', 'q-yield-q1-answer', 'end-yield', 'score-14-of-20', 'score-0-of-1']) expect(ids.has(id)).toBe(true);
    expect(ids.size).toBe(lines.length);
  });
  test('feedback text restates the right answer', () => {
    const q = lesson().questions[0];
    expect(TEXT.yes(q)).toBe('Yes! Red.');
    expect(TEXT.answerIs(q)).toBe('The answer is: Red.');
    expect(audioId.choice(q, 1)).toBe('q-yield-q1-c1');
  });
});

describe('validateLessons: audio id collisions', () => {
  test('rejects a question id that collides with another question\'s generated audio id', () => {
    // question "a"'s "yes" audio id is "q-a-yes"; a question literally id'd "a-yes" gets
    // an "ask" audio id of "q-a-yes" too, via audioId.ask = `q-${id}`.
    const l: Lesson = LessonSchema.parse({
      id: 'l', order: 1, title: 'T', icon: '🔻',
      cards: [{ id: 'c1', say: 'say', scene: 'yield-intersection', step: 'slow-down',
        source: { page: 29, quote: 'Decrease speed as you reach the intersection.' } }],
      questions: [
        { id: 'a', ask: 'ask 1', scene: 'yield-intersection', step: 'question-freeze', choices: ['x', 'y'], answer: 1,
          explainCard: 'c1', source: { page: 29, quote: 'Decrease speed as you reach the intersection.' } },
        { id: 'a-yes', ask: 'ask 2', scene: 'yield-intersection', step: 'question-freeze', choices: ['x', 'y'], answer: 1,
          explainCard: 'c1', source: { page: 29, quote: 'Decrease speed as you reach the intersection.' } },
      ],
    });
    expect(validateLessons([l], pages, scenes).join()).toContain('duplicate audio id "q-a-yes"');
  });
});

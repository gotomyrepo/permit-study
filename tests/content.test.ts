import { describe, test, expect } from 'vitest';
import { normalizeForMatch } from '../src/content/normalize';
import { validateLessons } from '../src/content/validate';
import { audioLines, audioId, TEXT } from '../src/content/audioLines';
import { LessonSchema, type Lesson } from '../src/content/types';

const pages = [
  { page: 29, text: 'MEANING: Decrease speed \nas you reach the intersec-\ntion. Y ou must come to a full stop at \na YIELD sign if traffic conditions require it.' },
  { page: 30, text: 'Traffic signals are usually red, yellow and green.' },
];
const scenes = { 'yield-intersection': ['slow-down', 'question-freeze'] };

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

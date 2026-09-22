import type { Lesson, Question } from './types';

export const PHRASES: Record<string, string> = {
  'phrase-home': 'Hi! Tap the green button to keep learning.',
  'phrase-not-quite': "Not quite. Let's watch again.",
  'phrase-num-1': 'Number 1.',
  'phrase-num-2': 'Number 2.',
  'phrase-num-3': 'Number 3.',
  'phrase-num-4': 'Number 4.',
  'phrase-passed': 'You passed! Great job!',
  'phrase-not-yet': "Not yet. Let's keep practicing.",
  'phrase-test-start': "Let's do a practice test. Listen to each question, then tap your answer.",
  'phrase-review-missed': "Let's practice the ones you missed.",
};

const trimEnd = (s: string) => s.trim().replace(/[.!?]+$/, '');

export const TEXT = {
  yes: (q: Question) => `Yes! ${trimEnd(q.choices[q.answer])}.`,
  answerIs: (q: Question) => `The answer is: ${trimEnd(q.choices[q.answer])}.`,
  lessonEnd: (l: Lesson) => `Great job! You're done with ${l.title}.`,
  score: (n: number, t: number) => `You got ${n} out of ${t}.`,
};

export const audioId = {
  card: (c: { id: string }) => `card-${c.id}`,
  ask: (q: { id: string }) => `q-${q.id}`,
  choice: (q: { id: string }, i: number) => `q-${q.id}-c${i}`,
  yes: (q: { id: string }) => `q-${q.id}-yes`,
  answerIs: (q: { id: string }) => `q-${q.id}-answer`,
  lessonEnd: (l: { id: string }) => `end-${l.id}`,
  score: (n: number, t: number) => `score-${n}-of-${t}`,
};

export interface AudioLine { id: string; text: string }

export function audioLines(lessons: Lesson[]): AudioLine[] {
  const out: AudioLine[] = Object.entries(PHRASES).map(([id, text]) => ({ id, text }));
  for (let t = 1; t <= 20; t++) for (let n = 0; n <= t; n++) out.push({ id: audioId.score(n, t), text: TEXT.score(n, t) });
  for (const l of lessons) {
    out.push({ id: audioId.lessonEnd(l), text: TEXT.lessonEnd(l) });
    for (const c of l.cards) out.push({ id: audioId.card(c), text: c.say });
    for (const q of l.questions) {
      out.push({ id: audioId.ask(q), text: q.ask });
      q.choices.forEach((c, i) => out.push({ id: audioId.choice(q, i), text: c }));
      out.push({ id: audioId.yes(q), text: TEXT.yes(q) }, { id: audioId.answerIs(q), text: TEXT.answerIs(q) });
    }
  }
  return out;
}

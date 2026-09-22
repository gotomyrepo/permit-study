import type { Lesson } from '../content/types';
import { PHRASES } from '../content/audioLines';
import { assembleTest, scoreTest, type TestAnswer } from '../practice/assemble';
import type { ProgressStore } from '../progress/store';
import { Caption } from '../ui/caption';
import { clicked, focusMain, h } from '../ui/dom';
import { speak, topBar, type Ctx } from './ctx';
import { askQuestion } from './question';
import { showResults } from './results';

export async function runPractice(ctx: Ctx, lessons: Lesson[], progress: ProgressStore): Promise<void> {
  const pool = lessons.flatMap((lesson) => lesson.questions.map((q) => ({ q, lesson })));
  if (pool.length === 0) {
    // Nothing to ask yet: say so kindly instead of starting an empty test.
    const home = h('button', { class: 'btn go' }, '🏠 Home');
    ctx.root.replaceChildren(
      h('div', { class: 'big-center' }, h('div', { class: 'huge' }, '📝'), h('div', { class: 'caption' }, 'No test yet. Do a lesson first!')),
      h('div', { class: 'bar' }, home),
    );
    focusMain(ctx.root);
    await clicked(home, ctx.signal);
    return;
  }

  const intro = new Caption(PHRASES['phrase-test-start']);
  const start = h('button', { class: 'btn go' }, '▶ Start');
  ctx.root.replaceChildren(h('div', { class: 'big-center' }, h('div', { class: 'huge' }, '📝'), intro.el), h('div', { class: 'bar' }, start));
  focusMain(ctx.root);
  void speak(ctx, 'phrase-test-start', intro).catch(() => {});
  await clicked(start, ctx.signal);
  ctx.player.stop();

  const test = assembleTest(pool, new Set(progress.missed()));
  const answers: TestAnswer[] = [];
  for (const [i, item] of test.entries()) {
    const ok = await askQuestion(ctx, item.lesson, item.q, 'test', i / test.length);
    answers.push({ correct: ok, sign: item.q.signQuestion });
    if (ok) progress.clearMissed(item.q.id); else progress.markMissed(item.q.id);
  }
  const missed = test.filter((_, i) => !answers[i].correct);
  if ((await showResults(ctx, scoreTest(answers), missed.length > 0)) !== 'review') return;

  const cap = new Caption(PHRASES['phrase-review-missed']);
  ctx.root.replaceChildren(topBar(ctx, 0), h('div', { class: 'big-center' }, cap.el));
  focusMain(ctx.root);
  await speak(ctx, 'phrase-review-missed', cap);
  for (const [i, item] of missed.entries()) {
    if (await askQuestion(ctx, item.lesson, item.q, 'teach', i / missed.length)) progress.clearMissed(item.q.id);
  }
}

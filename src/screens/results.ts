import { audioId, PHRASES, TEXT } from '../content/audioLines';
import type { TestScore } from '../practice/assemble';
import { Caption } from '../ui/caption';
import { childController, chooseOne, focusMain, h } from '../ui/dom';
import { speak, type Ctx } from './ctx';

export async function showResults(ctx: Ctx, s: TestScore, canReview: boolean): Promise<'home' | 'review'> {
  const score = new Caption(TEXT.score(s.correct, s.total));
  const verdictId = s.passed ? 'phrase-passed' : 'phrase-not-yet';
  const verdict = new Caption(PHRASES[verdictId]);
  const home = h('button', { class: 'btn soft' }, '🏠 Home');
  const review = h('button', { class: 'btn go' }, '🔁 Practice the ones I missed');
  const buttons = canReview ? [review, home] : [home];
  ctx.root.replaceChildren(
    h('div', { class: 'big-center' }, h('div', { class: 'huge' }, s.passed ? '🎉' : '💪'), score.el, verdict.el),
    h('div', { class: 'bar' }, ...buttons),
  );
  focusMain(ctx.root);
  // Lives only as long as this screen, so no clip from here plays over the next screen.
  const screen = childController(ctx.signal);
  void (async () => {
    if ((await speak(ctx, audioId.score(s.correct, s.total), score, screen.signal)) !== 'ok') return;
    await speak(ctx, verdictId, verdict, screen.signal);
  })().catch(() => {});
  try {
    const i = await chooseOne(buttons, ctx.signal);
    return buttons[i] === review ? 'review' : 'home';
  } finally {
    screen.abort();
  }
}

import type { Lesson, Question } from '../content/types';
import { audioId, PHRASES, TEXT } from '../content/audioLines';
import { getScene, stepIndexOf } from '../scenes/registry';
import { ScenePlayer } from '../scenes/render';
import { Caption } from '../ui/caption';
import { childController, chooseOne, clicked, delay, focusMain, h, speakerIcon } from '../ui/dom';
import { playCard } from './learn';
import { speak, topBar, type Ctx } from './ctx';

export type QuestionMode = 'teach' | 'test';

/** Returns true if answered correctly on the first try. */
export async function askQuestion(ctx: Ctx, lesson: Lesson, q: Question, mode: QuestionMode, fraction: number): Promise<boolean> {
  const stage = h('div', { class: 'stage' });
  const showQuestionScene = () => {
    const scene = getScene(q.scene);
    const si = stepIndexOf(scene, q.step);
    new ScenePlayer(stage, scene, q.ask).showFrame(si, scene.steps[si].duration);
  };
  showQuestionScene();

  const ask = new Caption(q.ask);
  const askSay = h('button', { class: 'btn soft icon', 'aria-label': 'Hear the question' }, speakerIcon());
  const feedback = h('div', { class: 'feedback' });
  const caps = q.choices.map((c) => new Caption(c, 'choice-text'));
  // The 🔊 buttons use `screen`, which stays live until this question ends (a pick aborts only `reader`).
  const screen = childController(ctx.signal);
  let reader = childController(screen.signal);

  const readChoice = async (i: number, signal: AbortSignal) => {
    tiles[i].classList.add('reading');
    try {
      if ((await speak(ctx, `phrase-num-${i + 1}`, undefined, signal)) === 'interrupted') return 'interrupted';
      return await speak(ctx, audioId.choice(q, i), caps[i], signal);
    } finally {
      tiles[i].classList.remove('reading');
    }
  };
  const readAll = async (signal: AbortSignal) => {
    if ((await speak(ctx, audioId.ask(q), ask, signal)) === 'interrupted') return;
    for (let i = 0; i < tiles.length; i++) if ((await readChoice(i, signal)) === 'interrupted') return;
  };

  const tiles = q.choices.map((_, i) => {
    const say = h('span', { class: 'say', role: 'button', 'aria-label': 'Hear this answer' }, speakerIcon());
    say.addEventListener('click', (e) => { e.stopPropagation(); void readChoice(i, screen.signal).catch(() => {}); });
    return h('button', { class: 'tile' }, h('span', { class: 'num' }, String(i + 1)), caps[i].el, say);
  });
  askSay.addEventListener('click', () => void speak(ctx, audioId.ask(q), ask, screen.signal).catch(() => {}));

  ctx.root.replaceChildren(
    topBar(ctx, fraction), stage,
    h('div', { class: 'ask-row' }, ask.el, askSay),
    h('div', { class: 'tiles' }, ...tiles),
    feedback,
  );
  focusMain(ctx.root);
  try {
    return await runQuestion();
  } finally {
    screen.abort();
  }

  async function runQuestion(): Promise<boolean> {
    let tries = 0;
    for (;;) {
      reader = childController(screen.signal);
      void readAll(reader.signal).catch(() => {});
      const open = tiles.filter((t) => !t.hasAttribute('disabled'));
      const pick = tiles.indexOf(open[await chooseOne(open, ctx.signal)]);
      reader.abort();

      if (mode === 'test') {
        tiles[pick].classList.add('picked');
        await delay(400, ctx.signal);
        return pick === q.answer;
      }
      if (pick === q.answer) {
        tiles[pick].classList.add('right');
        const yes = new Caption(TEXT.yes(q));
        feedback.className = 'feedback good';
        feedback.replaceChildren(yes.el);
        await speak(ctx, audioId.yes(q), yes);
        await delay(600, ctx.signal);
        return tries === 0;
      }

      tries++;
      tiles[pick].classList.add('tried');
      tiles[pick].setAttribute('disabled', '');
      if (tries === 1) {
        // Lock all tiles during the replay so a tap can't be silently lost.
        tiles.forEach((t) => t.setAttribute('disabled', ''));
        askSay.setAttribute('disabled', ''); // a tap would cut off "Not quite" and the replay
        const nq = new Caption(PHRASES['phrase-not-quite']);
        feedback.className = 'feedback';
        feedback.replaceChildren(nq.el);
        await speak(ctx, 'phrase-not-quite', nq);
        const card = lesson.cards.find((c) => c.id === q.explainCard)!;
        const cap = new Caption(card.say);
        feedback.replaceChildren(cap.el);
        await playCard(ctx, card, stage, cap);
        feedback.replaceChildren();
        showQuestionScene();
        tiles.forEach((t) => { if (!t.classList.contains('tried')) t.removeAttribute('disabled'); });
        askSay.removeAttribute('disabled');
        focusMain(ctx.root);
        continue;
      }

      tiles[q.answer].classList.add('right');
      const ans = new Caption(TEXT.answerIs(q));
      feedback.className = 'feedback';
      feedback.replaceChildren(ans.el);
      await speak(ctx, audioId.answerIs(q), ans);
      const next = h('button', { class: 'btn go' }, '▶ Next');
      ctx.root.append(h('div', { class: 'bar' }, next));
      next.focus();
      await clicked(next, ctx.signal);
      return false;
    }
  }
}

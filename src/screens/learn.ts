import type { Card } from '../content/types';
import { audioId } from '../content/audioLines';
import { getScene, stepIndexOf } from '../scenes/registry';
import { ScenePlayer } from '../scenes/render';
import { Caption } from '../ui/caption';
import { childController, chooseOne, delay, focusMain, h, speakerIcon } from '../ui/dom';
import { speak, topBar, type Ctx } from './ctx';

const AUDIO_FAIL_UNLOCK_MS = 3000;

/**
 * Plays a card's narration and its scene step together. Resolves when both are done.
 * Aborting `signal` stops both the narration and the scene animation.
 */
export async function playCard(
  ctx: Ctx, card: Card, stage: HTMLElement, caption: Caption, signal: AbortSignal = ctx.signal,
): Promise<'ok' | 'failed' | 'interrupted'> {
  const scene = getScene(card.scene);
  const player = new ScenePlayer(stage, scene, card.say);
  const [said] = await Promise.all([speak(ctx, audioId.card(card), caption, signal), player.play(stepIndexOf(scene, card.step), signal)]);
  return said;
}

export type CardMove = 'next' | 'back' | 'restart';

/** Shows one card. Resolves with where to go next; the card's audio and animation are stopped by then. */
export async function learnCard(ctx: Ctx, card: Card, fraction: number, canGoBack: boolean): Promise<CardMove> {
  const stage = h('div', { class: 'stage' });
  const caption = new Caption(card.say);
  const say = h('button', { class: 'btn soft icon', 'aria-label': 'Hear again' }, speakerIcon());
  const again = h('button', { class: 'btn soft' }, '🔁 Watch again');
  const back = h('button', { class: 'btn soft' }, '◀ Back');
  const next = h('button', { class: 'btn go', disabled: '' }, '▶ Next');
  const restart = h('button', { class: 'btn soft' }, '↺ Start over');
  ctx.root.replaceChildren(
    topBar(ctx, fraction, restart), stage, caption.el,
    h('div', { class: 'bar' }, say, again, ...(canGoBack ? [back] : []), next),
  );
  const autoFocused = focusMain(ctx.root);

  let run = 0;
  let current = childController(ctx.signal); // one per play; aborted when replaced
  const go = async () => {
    const mine = ++run;
    current.abort(); // stop the previous narration and scene animation
    current = childController(ctx.signal);
    const said = await playCard(ctx, card, stage, caption, current.signal);
    if (mine !== run) return;
    if (said === 'failed') {
      say.classList.add('retry-big');
      await delay(AUDIO_FAIL_UNLOCK_MS, ctx.signal);
    }
    next.removeAttribute('disabled');
    // Move focus to Next unless the learner has moved it themselves.
    if (document.activeElement === autoFocused || document.activeElement === document.body) next.focus();
  };
  say.addEventListener('click', () => {
    say.classList.remove('retry-big');
    void speak(ctx, audioId.card(card), caption).catch(() => {});
  });
  again.addEventListener('click', () => void go().catch(() => {}));
  void go().catch(() => {});
  const moves: [HTMLElement, CardMove][] = [[next, 'next'], [restart, 'restart'], ...(canGoBack ? [[back, 'back'] as [HTMLElement, CardMove]] : [])];
  try {
    return moves[await chooseOne(moves.map(([el]) => el), ctx.signal)][1];
  } finally {
    current.abort();
    ctx.player.stop();
  }
}

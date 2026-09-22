import type { AudioPlayer } from '../audio/player';
import type { Caption } from '../ui/caption';
import { h, isAbort } from '../ui/dom';

export interface Ctx { root: HTMLElement; player: AudioPlayer; signal: AbortSignal; goHome: () => void }
export type SpeakResult = 'ok' | 'failed' | 'interrupted';

/** Never rejects unless the whole flow (ctx.signal) was aborted. */
export async function speak(ctx: Ctx, id: string, caption?: Caption, signal: AbortSignal = ctx.signal): Promise<SpeakResult> {
  try {
    await ctx.player.play(id, signal, caption ? (i) => caption.highlight(i) : undefined);
    return 'ok';
  } catch (e) {
    if (ctx.signal.aborted) throw e;
    if (isAbort(e)) return 'interrupted';
    console.warn(e);
    return 'failed';
  }
}

export function topBar(ctx: Ctx, fraction: number): HTMLElement {
  const home = h('button', { class: 'btn soft icon', 'aria-label': 'Home' }, '🏠');
  home.addEventListener('click', () => ctx.goHome());
  const bar = h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(fraction * 100)}%` }));
  return h('div', { class: 'top' }, home, bar);
}

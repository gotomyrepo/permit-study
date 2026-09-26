import type { AudioPlayer } from '../audio/player';
import type { Caption } from '../ui/caption';
import { h, isAbort } from '../ui/dom';

export interface Ctx {
  root: HTMLElement; player: AudioPlayer; signal: AbortSignal; goHome: () => void;
  /** Leaves the current flow the way 🏠 does, then opens the reader at a section. */
  openReader: (section: string) => void;
}
export type SpeakResult = 'ok' | 'failed' | 'interrupted';

/**
 * Never rejects unless the whole flow (ctx.signal) was aborted. `suffix` is appended to the clip's URLs
 * (the reader's `?v=<hash>` version query, see readerClipQuery).
 */
export async function speak(ctx: Ctx, id: string, caption?: Caption, signal: AbortSignal = ctx.signal, suffix = ''): Promise<SpeakResult> {
  try {
    await ctx.player.play(id, signal, caption ? (i) => caption.highlight(i) : undefined, suffix);
    return 'ok';
  } catch (e) {
    if (ctx.signal.aborted) throw e;
    if (isAbort(e)) return 'interrupted';
    console.warn(e);
    return 'failed';
  }
}

/** Home button, progress bar, then any extra buttons (e.g. Start over). */
export function topBar(ctx: Ctx, fraction: number, ...extra: HTMLElement[]): HTMLElement {
  const home = h('button', { class: 'btn soft icon', 'aria-label': 'Home' }, '🏠');
  home.addEventListener('click', () => ctx.goHome());
  const bar = h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(fraction * 100)}%` }));
  return h('div', { class: 'top' }, home, bar, ...extra);
}

/** "📖 Learn more": leaves the lesson like 🏠 (her card is already saved) and opens the reader at `section`. */
export function learnMoreButton(ctx: Ctx, section: string): HTMLElement {
  const b = h('button', { class: 'btn soft learn-more', 'aria-label': 'Learn more' }, h('span', { 'aria-hidden': 'true' }, '📖'), h('span', { class: 'lm-text' }, ' Learn more'));
  b.addEventListener('click', () => ctx.openReader(section));
  return b;
}

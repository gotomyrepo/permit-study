import type { ProgressStore } from '../progress/store';
import { PHRASES, readerClip, readerClipQuery } from '../content/audioLines';
import type { Playlist } from '../reader/playlist';
import { picturePath } from '../reader/types';
import { Caption } from '../ui/caption';
import { childController, chooseOne, clicked, focusMain, h } from '../ui/dom';
import { speak, topBar, type Ctx } from './ctx';

type Move = number | 'end' | 'menu';

const base = import.meta.env.BASE_URL;

/**
 * The manual reader: plays paragraphs back to back from `start` until the flow is aborted (🏠),
 * saving her place as each paragraph starts. It never returns on its own.
 */
export async function runReader(ctx: Ctx, list: Playlist, progress: ProgressStore, start: number): Promise<never> {
  let i = start;
  for (;;) {
    const move = await readParagraph(ctx, list, progress, i);
    if (move === 'menu') i = await chapterMenu(ctx, list, i);
    else if (move === 'end') { await finished(ctx); i = 0; }
    else i = move;
  }
}

/**
 * Starts downloading a clip and its word timings without a Range header, so the service worker's
 * CacheFirst rule stores a full copy (see vite.config.ts) and the next paragraph starts without a gap.
 * `query` is that paragraph's `readerClipQuery()` version string: it must be the exact same query
 * playback below fetches with, or the prefetch caches a different URL than <audio> ever requests.
 */
function prefetch(clip: string, query: string): void {
  for (const ext of ['mp3', 'json']) void fetch(`${base}audio/${clip}.${ext}${query}`).catch(() => {});
}

function picture(list: Playlist, i: number): HTMLElement {
  const pic = list.pictureAt(i);
  const { section } = list.at(i);
  if (!pic) return h('div', { class: 'stage reader-title' }, h('span', {}, section.title));
  return h('div', { class: 'stage reader-pic' }, h('img', { src: `${base}${picturePath(pic)}`, alt: `Picture from the manual: ${section.title}` }));
}

/** Plays paragraph i. Resolves with where to go next; its audio is stopped by then. */
async function readParagraph(ctx: Ctx, list: Playlist, progress: ProgressStore, i: number): Promise<Move> {
  const { chapter, section, paragraph } = list.at(i);
  progress.setReaderPlace(list.placeOf(i));
  const caption = new Caption(paragraph.say, 'caption reader-cap');
  const menu = h('button', { class: 'btn soft icon', 'aria-label': 'Chapters' }, '☰');
  const back = h('button', { class: 'btn soft icon', 'aria-label': 'Back' }, '⏮');
  const pause = h('button', { class: 'btn soft icon', 'aria-label': 'Pause' }, '⏸');
  const next = h('button', { class: 'btn go icon', 'aria-label': 'Next' }, '⏭');
  const note = h('div', { class: 'reader-note', hidden: '' }, "Can't play this part right now");
  ctx.root.replaceChildren(
    topBar(ctx, (i + 1) / list.length, menu),
    h('div', { class: 'reader-where' }, `Chapter ${chapter.number} · ${section.title}`),
    picture(list, i), caption.el, note,
    h('div', { class: 'bar reader-bar' }, back, pause, next),
  );
  // Each paragraph starts at the top; focusing Next must not scroll the page (the bar is sticky, and a
  // scroll-into-view would push the top bar with 🏠 off screen on short phones).
  window.scrollTo(0, 0);
  next.focus({ preventScroll: true });

  const after = list.next(i);
  const clip = readerClip(paragraph);
  const query = readerClipQuery(paragraph);
  prefetch(clip, query); // the CURRENT clip too: a ranged <audio> request alone is never a cacheable 200
  if (after !== null) { const nextP = list.at(after).paragraph; prefetch(readerClip(nextP), readerClipQuery(nextP)); }

  const para = childController(ctx.signal);
  let paused = false;
  pause.addEventListener('click', () => {
    paused = !paused;
    if (paused) ctx.player.pause(); else ctx.player.resume();
    pause.textContent = paused ? '▶' : '⏸';
    pause.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  });
  /** Settles only when this paragraph is left: a failed clip waits for a tap. */
  const untilLeft = () => new Promise<never>((_, reject) => {
    if (para.signal.aborted) reject(para.signal.reason);
    else para.signal.addEventListener('abort', () => reject(para.signal.reason), { once: true });
  });
  const played = speak(ctx, clip, caption, para.signal, query).then((r): Move | Promise<never> => {
    if (r === 'ok') return after ?? 'end';
    if (r === 'failed') { note.hidden = false; pause.setAttribute('disabled', ''); }
    return untilLeft();
  });
  const tapped = chooseOne([back, next, menu], para.signal).then((k): Move =>
    k === 0 ? list.back(i, ctx.player.elapsedMs()) : k === 1 ? (after ?? 'end') : 'menu');
  try {
    return await Promise.race([played, tapped]);
  } finally {
    para.abort();
    ctx.player.stop();
  }
}

/** Chapters and sections; resolves with the paragraph to play (the current one if closed). */
async function chapterMenu(ctx: Ctx, list: Playlist, current: number): Promise<number> {
  const close = h('button', { class: 'btn soft' }, '✕ Close');
  const here = list.at(current).section.id;
  const picks: HTMLElement[] = [];
  const starts: number[] = [];
  const groups = list.chapters.map((ch) => h('section', { class: 'reader-menu-ch' },
    h('h2', {}, `Chapter ${ch.number} · ${ch.title}`),
    ...ch.sections.map((s) => {
      const b = h('button', { class: `btn soft reader-menu-sec${s.id === here ? ' here' : ''}` }, s.title);
      picks.push(b);
      starts.push(list.sectionStart(s.id));
      return b;
    })));
  ctx.root.replaceChildren(topBar(ctx, (current + 1) / list.length, close), h('div', { class: 'reader-menu' }, ...groups));
  (picks.find((b) => b.classList.contains('here')) ?? close).focus();
  const k = await chooseOne([close, ...picks], ctx.signal);
  return k === 0 ? current : starts[k - 1];
}

async function finished(ctx: Ctx): Promise<void> {
  const cap = new Caption(PHRASES['phrase-reader-done']);
  const again = h('button', { class: 'btn go' }, '↺ Start over');
  ctx.root.replaceChildren(topBar(ctx, 1), h('div', { class: 'big-center' }, h('div', { class: 'huge' }, '🎉'), cap.el), h('div', { class: 'bar' }, again));
  focusMain(ctx.root);
  void speak(ctx, 'phrase-reader-done', cap).catch(() => {});
  await clicked(again, ctx.signal);
  ctx.player.stop();
}

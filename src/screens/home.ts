import type { Lesson } from '../content/types';
import type { ProgressStore } from '../progress/store';
import { h } from '../ui/dom';
import { speak, type Ctx } from './ctx';

export type HomeChoice = { kind: 'lesson'; lesson: Lesson } | { kind: 'practice' };

export function showHome(ctx: Ctx, lessons: Lesson[], progress: ProgressStore): Promise<HomeChoice> {
  const next = progress.nextLesson(lessons);
  const tiles = lessons.map((l) => {
    const cls = ['lesson-tile', progress.isCompleted(l.id) ? 'done' : '', l === next ? 'next' : ''].filter(Boolean).join(' ');
    return h('button', { class: cls }, h('span', { class: 'icon' }, l.icon), h('span', {}, l.title));
  });
  const keep = h('button', { class: 'btn go' }, '▶ Keep going');
  const practice = h('button', { class: 'btn soft' }, '📝 Practice test');
  if (!next) keep.setAttribute('disabled', '');
  ctx.root.replaceChildren(h('div', { class: 'home-grid' }, ...tiles), h('div', { class: 'bar' }, keep, practice));
  void speak(ctx, 'phrase-home').catch(() => {});
  return new Promise((resolve, reject) => {
    keep.addEventListener('click', () => next && resolve({ kind: 'lesson', lesson: next }));
    practice.addEventListener('click', () => resolve({ kind: 'practice' }));
    tiles.forEach((t, i) => t.addEventListener('click', () => resolve({ kind: 'lesson', lesson: lessons[i] })));
    ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason), { once: true });
  });
}

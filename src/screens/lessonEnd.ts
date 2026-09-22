import type { Lesson } from '../content/types';
import { audioId, TEXT } from '../content/audioLines';
import { Caption } from '../ui/caption';
import { clicked, h } from '../ui/dom';
import { speak, type Ctx } from './ctx';

export async function lessonEnd(ctx: Ctx, lesson: Lesson): Promise<void> {
  const cap = new Caption(TEXT.lessonEnd(lesson));
  const home = h('button', { class: 'btn go' }, '🏠 Home');
  ctx.root.replaceChildren(h('div', { class: 'big-center' }, h('div', { class: 'huge' }, '✅'), cap.el), h('div', { class: 'bar' }, home));
  void speak(ctx, audioId.lessonEnd(lesson), cap).catch(() => {});
  await clicked(home, ctx.signal);
}

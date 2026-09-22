import '../styles.css';
import { loadLessons } from '../content/load';
import { audioId } from '../content/audioLines';
import type { Source } from '../content/types';
import { getScene, stepIndexOf } from '../scenes/registry';
import { ScenePlayer } from '../scenes/render';
import { h } from '../ui/dom';

const base = import.meta.env.BASE_URL;
const audio = new Audio();
const listen = (id: string, small = false) => {
  const b = h('button', { class: small ? 'listen listen-sm' : 'listen' }, '▶ Listen');
  const warn = h('span', { class: 'audio-warn', hidden: '' }, '⚠ audio missing');
  b.addEventListener('click', () => {
    warn.hidden = true;
    audio.src = `${base}audio/${id}.mp3`;
    audio.play().catch((e: unknown) => { if ((e as { name?: string })?.name !== 'AbortError') warn.hidden = false; });
  });
  return h('span', { class: 'listen-wrap' }, b, warn);
};
const thumb = (sceneId: string, stepId: string) => {
  const d = h('div', { class: 'thumb' });
  const sc = getScene(sceneId);
  const si = stepIndexOf(sc, stepId);
  new ScenePlayer(d, sc).showFrame(si, sc.steps[si].duration);
  return d;
};
const safeThumb = (sceneId: string, stepId: string): HTMLElement => {
  try {
    return thumb(sceneId, stepId);
  } catch (e) {
    return h('div', { class: 'thumb error' }, `⚠ scene error: ${e instanceof Error ? e.message : String(e)}`);
  }
};
const source = (s: Source) => h('div', { class: 'src' },
  h('a', { href: `${base}manual/mv21.pdf#page=${s.page}`, target: '_blank' }, `Manual page ${s.page}`),
  s.quote ? h('blockquote', {}, s.quote) : h('p', { class: 'figure' }, `⚠ Picture in the manual: ${s.figure}. Please check the picture.`));

const root = document.getElementById('app')!;
root.append(
  h('h1', {}, 'Fact check'),
  h('p', {}, "Left: what the app shows and says. Right: the exact words from the NYS Driver's Manual. Click a page link to open the manual on that page."),
);
for (const l of loadLessons()) {
  root.append(h('h2', {}, `${l.icon} ${l.title}`));
  for (const c of l.cards)
    root.append(h('div', { class: 'row' }, safeThumb(c.scene, c.step), h('div', {}, h('p', { class: 'say' }, c.say), listen(audioId.card(c))), source(c.source)));
  for (const q of l.questions) {
    const explain = l.cards.find((c) => c.id === q.explainCard);
    root.append(h('div', { class: 'row' }, safeThumb(q.scene, q.step),
      h('div', {},
        h('p', { class: 'say' }, `❓ ${q.ask}${q.signQuestion ? '  (road sign question)' : ''}`),
        h('ol', {}, ...q.choices.map((c, i) => h('li', { class: i === q.answer ? 'correct' : '' },
          `${c}${i === q.answer ? '  ✔ correct' : ''}  `, listen(audioId.choice(q, i), true)))),
        h('p', { class: 'explain' }, `If wrong, replays: ${explain ? explain.say : q.explainCard}`),
        listen(audioId.ask(q))),
      source(q.source)));
  }
}

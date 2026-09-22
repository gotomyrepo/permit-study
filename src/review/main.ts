import '../styles.css';
import { loadLessons } from '../content/load';
import { audioId } from '../content/audioLines';
import type { Source } from '../content/types';
import { getScene, stepIndexOf } from '../scenes/registry';
import { ScenePlayer } from '../scenes/render';
import { h } from '../ui/dom';

const base = import.meta.env.BASE_URL;
const audio = new Audio();
const listen = (id: string) => {
  const b = h('button', { class: 'listen' }, '▶ Listen');
  b.addEventListener('click', () => { audio.src = `${base}audio/${id}.mp3`; void audio.play(); });
  return b;
};
const thumb = (sceneId: string, stepId: string) => {
  const d = h('div', { class: 'thumb' });
  const sc = getScene(sceneId);
  const si = stepIndexOf(sc, stepId);
  new ScenePlayer(d, sc).showFrame(si, sc.steps[si].duration);
  return d;
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
    root.append(h('div', { class: 'row' }, thumb(c.scene, c.step), h('div', {}, h('p', { class: 'say' }, c.say), listen(audioId.card(c))), source(c.source)));
  for (const q of l.questions)
    root.append(h('div', { class: 'row' }, thumb(q.scene, q.step),
      h('div', {},
        h('p', { class: 'say' }, `❓ ${q.ask}${q.signQuestion ? '  (road sign question)' : ''}`),
        h('ol', {}, ...q.choices.map((c, i) => h('li', { class: i === q.answer ? 'correct' : '' }, i === q.answer ? `${c}  ✔ correct` : c))),
        listen(audioId.ask(q))),
      source(q.source)));
}

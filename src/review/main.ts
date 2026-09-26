import '../styles.css';
import { loadLessons } from '../content/load';
import { audioId, readerClip, readerClipQuery } from '../content/audioLines';
import type { Source } from '../content/types';
import { getScene, stepIndexOf } from '../scenes/registry';
import { ScenePlayer } from '../scenes/render';
import { h } from '../ui/dom';
import { loadChapters } from '../reader/load';
import { Playlist, readerStats } from '../reader/playlist';
import { picturePath } from '../reader/types';

const base = import.meta.env.BASE_URL;
const audio = new Audio();
const listen = (id: string, small = false, query = '') => {
  const b = h('button', { class: small ? 'listen listen-sm' : 'listen' }, '▶ Listen');
  const warn = h('span', { class: 'audio-warn', hidden: '' }, '⚠ audio missing');
  b.addEventListener('click', () => {
    warn.hidden = true;
    audio.src = `${base}audio/${id}.mp3${query}`;
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
const lessonsTab = h('a', { href: '#lessons', class: 'tab' }, 'Lessons');
const readerTab = h('a', { href: '#reader', class: 'tab' }, 'Manual reader');
const lessonsPane = h('div', { class: 'lessons-pane' });
const readerPane = h('div', { class: 'reader-pane' });
root.append(
  h('h1', {}, 'Fact check'),
  h('p', {}, "Left: what the app shows and says. Right: the exact words from the NYS Driver's Manual. Click a page link to open the manual on that page."),
  h('nav', { class: 'tabs' }, lessonsTab, readerTab),
  lessonsPane, readerPane,
);

for (const l of loadLessons()) {
  lessonsPane.append(h('h2', {}, `${l.icon} ${l.title}`));
  for (const c of l.cards)
    lessonsPane.append(h('div', { class: 'row' }, safeThumb(c.scene, c.step), h('div', {}, h('p', { class: 'say' }, c.say), listen(audioId.card(c))), source(c.source)));
  for (const q of l.questions) {
    const explain = l.cards.find((c) => c.id === q.explainCard);
    lessonsPane.append(h('div', { class: 'row' }, safeThumb(q.scene, q.step),
      h('div', {},
        h('p', { class: 'say' }, `❓ ${q.ask}${q.signQuestion ? '  (road sign question)' : ''}`),
        h('ol', {}, ...q.choices.map((c, i) => h('li', { class: i === q.answer ? 'correct' : '' },
          `${c}${i === q.answer ? '  ✔ correct' : ''}  `, listen(audioId.choice(q, i), true)))),
        h('p', { class: 'explain' }, `If wrong, replays: ${explain ? explain.say : q.explainCard}`),
        listen(audioId.ask(q))),
      source(q.source)));
  }
}

const chapters = loadChapters();
const stats = readerStats(chapters);
const list = new Playlist(chapters);
const flagged = list.entries.filter((e) => e.paragraph.source.figure);
if (flagged.length) {
  readerPane.append(h('div', { class: 'flags' },
    h('p', {}, `⚠ ${flagged.length} paragraph${flagged.length === 1 ? '' : 's'} rely on a picture in the manual (no quoted text). Please check these especially:`),
    h('ul', {}, ...flagged.map((e) => {
      const b = h('button', { class: 'flag-link' }, `${e.paragraph.id}: ${e.paragraph.say}`);
      b.addEventListener('click', () => document.getElementById(`p-${e.paragraph.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return h('li', {}, b);
    }))));
}
readerPane.append(h('p', {},
  `${stats.chapters} chapters, ${stats.sections} sections, ${stats.paragraphs} paragraphs, about ${stats.minutes} minutes of listening. ` +
  'Each paragraph retells the manual passage on the right. Check that nothing is missing, changed or added.'));
list.entries.forEach((e, i) => {
  if (e.paragraph === e.chapter.sections[0].paragraphs[0]) readerPane.append(h('h2', {}, `Chapter ${e.chapter.number}: ${e.chapter.title}`));
  if (e.paragraph === e.section.paragraphs[0]) readerPane.append(h('h3', {}, e.section.title));
  const pic = list.pictureAt(i);
  const shown = pic
    ? h('img', { class: 'thumb', src: `${base}${picturePath(pic)}`, alt: pic })
    : h('div', { class: 'thumb title-card' }, e.section.title);
  readerPane.append(h('div', { class: 'row', id: `p-${e.paragraph.id}` },
    shown,
    h('div', {}, h('p', { class: 'say' }, e.paragraph.say), h('p', { class: 'pid' }, e.paragraph.id), listen(readerClip(e.paragraph), false, readerClipQuery(e.paragraph))),
    source(e.paragraph.source)));
});

const show = () => {
  const reader = location.hash === '#reader';
  lessonsPane.hidden = reader;
  readerPane.hidden = !reader;
  lessonsTab.classList.toggle('on', !reader);
  readerTab.classList.toggle('on', reader);
};
window.addEventListener('hashchange', show);
show();

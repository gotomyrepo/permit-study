import '../styles.css';
import { ALL_SCENES, SCENES } from '../scenes/registry';
import { ScenePlayer } from '../scenes/render';
import { h } from '../ui/dom';

const id = new URLSearchParams(location.search).get('scene');
const root = document.getElementById('app')!;
const list = id ? [SCENES[id]].filter(Boolean) : [...ALL_SCENES];
for (const scene of list) {
  root.append(h('h2', {}, scene.id));
  scene.steps.forEach((step, si) => {
    const row = h('div', { class: 'preview-row' }, h('h3', {}, `${step.id} (${step.duration} ms)`));
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      const t = Math.round(step.duration * frac);
      const stage = h('div', {});
      new ScenePlayer(stage, scene).showFrame(si, t);
      row.append(h('div', { class: 'preview-cell' }, stage, h('div', {}, `t=${t}`)));
    }
    root.append(row);
  });
}

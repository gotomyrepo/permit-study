import { h } from './dom';

/** Splits like Python's str.split(), which build_audio.py uses to number word timings. */
export const captionWords = (text: string): string[] => {
  const t = text.trim();
  return t ? t.split(/\s+/) : [];
};

/** Text split on whitespace into word spans; indexes match build_audio.py's text.split(). */
export class Caption {
  readonly el: HTMLDivElement;
  private words: HTMLSpanElement[] = [];

  constructor(text: string, cls = 'caption') {
    this.el = h('div', { class: cls });
    this.words = captionWords(text).map((w) => h('span', { class: 'w' }, w));
    this.words.forEach((s, i) => { if (i) this.el.append(' '); this.el.append(s); });
  }

  highlight(i: number): void { this.words.forEach((s, j) => s.classList.toggle('hl', j === i)); }
}

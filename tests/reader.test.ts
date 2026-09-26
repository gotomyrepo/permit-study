import { describe, test, expect } from 'vitest';
import { ChapterSchema, FigureSchema, ParagraphSchema, picturePath, type Chapter } from '../src/reader/types';
import { BACK_RESTART_MS, Playlist, readerStats } from '../src/reader/playlist';
import { LessonSchema } from '../src/content/types';
import { validateReader } from '../src/content/validate';
import { readChapters } from '../scripts/lib';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const src = { page: 29, quote: 'Traffic signs tell you about traffic rules' };
const para = (id: string, picture?: string) => ({ id, say: `Words for ${id}.`, source: src, ...(picture ? { picture } : {}) });
const ch4: Chapter = ChapterSchema.parse({
  id: 'ch04', number: 4, title: 'Traffic Control', sections: [
    { id: 'ch04-a', title: 'A', paragraphs: [para('ch04-a-1', 'fig-one'), para('ch04-a-2'), para('ch04-a-3', 'fig-two')] },
    { id: 'ch04-b', title: 'B', paragraphs: [para('ch04-b-1'), para('ch04-b-2')] },
  ],
});
const ch5: Chapter = ChapterSchema.parse({
  id: 'ch05', number: 5, title: 'Intersections and Turns', sections: [
    { id: 'ch05-a', title: 'C', paragraphs: [para('ch05-a-1'), para('ch05-a-2')] },
  ],
});
const list = new Playlist([ch5, ch4]); // out of order on purpose
const ids = () => list.entries.map((e) => e.paragraph.id);

describe('Playlist', () => {
  test('orders by chapter number, then section, then paragraph', () => {
    expect(ids()).toEqual(['ch04-a-1', 'ch04-a-2', 'ch04-a-3', 'ch04-b-1', 'ch04-b-2', 'ch05-a-1', 'ch05-a-2']);
    expect(list.length).toBe(7);
    expect(list.chapters.map((c) => c.id)).toEqual(['ch04', 'ch05']);
  });
  test('next and prev cross sections and chapters and stop at the edges', () => {
    expect(list.next(2)).toBe(3);
    expect(list.next(4)).toBe(5);
    expect(list.next(6)).toBeNull();
    expect(list.prev(5)).toBe(4);
    expect(list.prev(0)).toBeNull();
  });
  test('Back: previous paragraph under 2 seconds, else restart this one', () => {
    expect(BACK_RESTART_MS).toBe(2000);
    expect(list.back(3, 1999)).toBe(2);
    expect(list.back(3, 2000)).toBe(3);
    expect(list.back(0, 500)).toBe(0);
  });
  test('placeOf and indexOf round-trip', () => {
    expect(list.placeOf(4)).toEqual({ chapter: 'ch04', section: 'ch04-b', paragraph: 'ch04-b-2' });
    expect(list.indexOf(list.placeOf(4))).toBe(4);
  });
  test('resume falls back to the section, then the chapter, then the start', () => {
    expect(list.resume({ chapter: 'ch04', section: 'ch04-b', paragraph: 'ch04-b-2' })).toBe(4);
    expect(list.resume({ chapter: 'ch04', section: 'ch04-b', paragraph: 'gone' })).toBe(3);
    expect(list.resume({ chapter: 'ch05', section: 'gone', paragraph: 'gone' })).toBe(5);
    expect(list.resume({ chapter: 'gone', section: 'gone', paragraph: 'gone' })).toBe(0);
    expect(list.resume(null)).toBe(0);
  });
  test('sectionStart', () => {
    expect(list.sectionStart('ch04-b')).toBe(3);
    expect(list.sectionStart('ch05-a')).toBe(5);
    expect(list.sectionStart('nope')).toBe(-1);
  });
  test('pictureAt: own picture, else the latest one earlier in the same section, else none', () => {
    expect(list.pictureAt(0)).toBe('fig-one');
    expect(list.pictureAt(1)).toBe('fig-one');
    expect(list.pictureAt(2)).toBe('fig-two');
    expect(list.pictureAt(3)).toBeNull(); // new section: no carry-over
  });
  test('at() throws outside the list', () => {
    expect(() => list.at(7)).toThrow();
  });
});

describe('reader schemas', () => {
  test('picture ids are fig-<id> or scene:<scene-id>', () => {
    expect(ParagraphSchema.safeParse(para('p', 'fig-stop-sign')).success).toBe(true);
    expect(ParagraphSchema.safeParse(para('p', 'scene:yield-intersection')).success).toBe(true);
    expect(ParagraphSchema.safeParse(para('p', 'stop-sign.png')).success).toBe(false);
  });
  test('figure boxes must not be inverted', () => {
    expect(FigureSchema.safeParse({ id: 'fig-a', page: 29, box: [10, 10, 50, 40] }).success).toBe(true);
    expect(FigureSchema.safeParse({ id: 'fig-a', page: 29, box: [50, 10, 10, 40] }).success).toBe(false);
  });
  test('picturePath', () => {
    expect(picturePath('fig-stop-sign')).toBe('reader/figures/fig-stop-sign.png');
    expect(picturePath('scene:yield-intersection')).toBe('reader/scenes/yield-intersection.png');
  });
  test('lessons may name a readerStart section', () => {
    const base = {
      id: 'x', order: 1, title: 'X', icon: '🛑',
      cards: [{ id: 'x-1', say: 'Hi.', scene: 's', step: 't', source: src }],
      questions: [{ id: 'x-q1', ask: 'Q?', scene: 's', step: 't', choices: ['a', 'b'], answer: 0, explainCard: 'x-1', source: src }],
    };
    expect(LessonSchema.parse({ ...base, readerStart: 'ch04-signs' }).readerStart).toBe('ch04-signs');
    expect(LessonSchema.safeParse({ ...base, readerStart: 'Ch 4' }).success).toBe(false);
  });
});

describe('readerStats', () => {
  test('counts chapters, sections, paragraphs and words', () => {
    expect(readerStats([ch4, ch5])).toEqual({ chapters: 2, sections: 3, paragraphs: 7, words: 21, minutes: 0 });
  });
});

describe('validateReader', () => {
  const pages = [{ page: 29, text: 'SIGNS\n Traffic signs tell you about traffic rules, special \nhazards, where you are.' }];
  const pics = new Set(['fig-one', 'fig-two']);
  const lessons = [{ id: 'signs', readerStart: 'ch04-a' }, { id: 'parking' }];
  const figs = new Set(['fig-one', 'fig-two']);
  test('valid chapters have no errors', () => {
    expect(validateReader([ch4], pages, pics, figs, lessons)).toEqual([]);
  });
  test('quote not on the cited page', () => {
    const bad = ChapterSchema.parse(structuredClone(ch4));
    bad.sections[0].paragraphs[0].source = { page: 29, quote: 'Traffic lights are normally red, yellow and green' };
    expect(validateReader([bad], pages, pics, figs, lessons).join()).toContain('ch04/ch04-a/ch04-a-1: quote not found on page 29');
  });
  test('picture with no PNG', () => {
    expect(validateReader([ch4], pages, new Set(['fig-one']), figs, lessons).join()).toContain('picture "fig-two" has no PNG');
  });
  test('fig picture with a PNG but not listed in figures.yaml (a stale PNG)', () => {
    expect(validateReader([ch4], pages, pics, new Set(['fig-one']), lessons).join())
      .toContain('ch04/ch04-a/ch04-a-3: picture "fig-two" is not listed in content/reader/figures.yaml');
  });
  test('readerStart that is not a section', () => {
    expect(validateReader([ch4], pages, pics, figs, [{ id: 'lights', readerStart: 'ch04-nope' }]).join())
      .toContain('lesson lights: readerStart "ch04-nope" is not a reader section');
  });
  test('duplicate ids and chapter numbers', () => {
    const e = validateReader([ch4, ch4], pages, pics, figs, lessons).join('\n');
    expect(e).toContain('duplicate id "ch04-a-1"');
    expect(e).toContain('duplicate number 4');
  });
});

describe('readChapters', () => {
  test('reports a yaml file in content/reader that is not ch<N>.yaml or figures.yaml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'reader-'));
    try {
      writeFileSync(join(dir, 'ch04.yaml'), JSON.stringify(ch4));
      for (const f of ['figures.yaml', 'chapter5.yaml', 'ch06.yml', 'notes.txt']) writeFileSync(join(dir, f), '[]');
      const errors: string[] = [];
      expect(readChapters(errors, dir).map((c) => c.id)).toEqual(['ch04']);
      expect(errors).toEqual([
        `${dir}/ch06.yml: not a chapter file name (chapters are ch<number>.yaml, e.g. ch04.yaml)`,
        `${dir}/chapter5.yaml: not a chapter file name (chapters are ch<number>.yaml, e.g. ch04.yaml)`,
      ]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

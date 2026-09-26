import { PICTURE_NONE, type Chapter, type Paragraph, type ReaderPlace, type Section } from './types';

export interface Entry { chapter: Chapter; section: Section; paragraph: Paragraph }

/** Back restarts the paragraph once it has played this long; before that it goes to the previous paragraph. */
export const BACK_RESTART_MS = 2000;
/** Listening speed for the time estimate (the voice runs at -10%). */
export const WORDS_PER_MINUTE = 140;

/** Every paragraph of every chapter in reading order. Indexes are positions in this flat list. */
export class Playlist {
  readonly chapters: readonly Chapter[];
  readonly entries: readonly Entry[];

  constructor(chapters: readonly Chapter[]) {
    this.chapters = [...chapters].sort((a, b) => a.number - b.number);
    this.entries = this.chapters.flatMap((chapter) =>
      chapter.sections.flatMap((section) => section.paragraphs.map((paragraph) => ({ chapter, section, paragraph }))));
  }

  get length(): number { return this.entries.length; }

  at(i: number): Entry {
    const e = this.entries[i];
    if (!e) throw new RangeError(`no reader paragraph at ${i}`);
    return e;
  }

  next(i: number): number | null { return i + 1 < this.length ? i + 1 : null; }
  prev(i: number): number | null { return i > 0 ? i - 1 : null; }

  /** Where Back goes: the previous paragraph if this one has played under BACK_RESTART_MS, else the start of this one. */
  back(i: number, playedMs: number): number { return playedMs < BACK_RESTART_MS ? (this.prev(i) ?? i) : i; }

  placeOf(i: number): ReaderPlace {
    const e = this.at(i);
    return { chapter: e.chapter.id, section: e.section.id, paragraph: e.paragraph.id };
  }

  /** Paragraph ids are unique across all chapters, so the paragraph id alone finds it even if it moved. */
  indexOf(place: ReaderPlace): number { return this.entries.findIndex((e) => e.paragraph.id === place.paragraph); }
  sectionStart(sectionId: string): number { return this.entries.findIndex((e) => e.section.id === sectionId); }
  chapterStart(chapterId: string): number { return this.entries.findIndex((e) => e.chapter.id === chapterId); }

  /** Where to resume: her paragraph, else the start of its section, else of its chapter, else the first paragraph. */
  resume(place: ReaderPlace | null): number {
    if (!place) return 0;
    for (const i of [this.indexOf(place), this.sectionStart(place.section), this.chapterStart(place.chapter)]) if (i >= 0) return i;
    return 0;
  }

  /**
   * The paragraph's picture, else the latest earlier picture in the same section, else null (show the section title).
   * `none` counts as a picture: it and the paragraphs after it without their own picture show the section title.
   */
  pictureAt(i: number): string | null {
    const { section } = this.at(i);
    for (let j = i; j >= 0 && this.entries[j].section === section; j--) {
      const p = this.entries[j].paragraph.picture;
      if (p) return p === PICTURE_NONE ? null : p;
    }
    return null;
  }
}

export interface ReaderStats { chapters: number; sections: number; paragraphs: number; words: number; minutes: number }

export function readerStats(chapters: readonly Chapter[]): ReaderStats {
  const sections = chapters.flatMap((c) => c.sections);
  const paragraphs = sections.flatMap((s) => s.paragraphs);
  const words = paragraphs.reduce((n, p) => n + p.say.trim().split(/\s+/).filter(Boolean).length, 0);
  return { chapters: chapters.length, sections: sections.length, paragraphs: paragraphs.length, words, minutes: Math.round(words / WORDS_PER_MINUTE) };
}

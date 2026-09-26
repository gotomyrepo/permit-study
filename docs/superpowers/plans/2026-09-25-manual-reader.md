# Manual Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Milestone 1 of the manual reader ("📖 Listen to the manual"): a visual audiobook that plays a plain-language retelling of the NYS Driver's Manual paragraph by paragraph, with word highlighting, the manual's own figures, Back/Pause/Next/Chapters controls, a saved place, "📖 Learn more" links from lessons, offline caching of clips as they play, a parent fact-check tab, and all of Chapter 4 (Signs, Traffic Signals, Pavement Markings, Traffic Officers) written, voiced and checked.

**Architecture:**
- **Content:** `content/reader/ch04.yaml` (chapter → sections → paragraphs). Every paragraph has a `say` retelling, a `source` (page + the contiguous manual passage it retells, checked by the same quote matcher as lessons) and an optional `picture` (`fig-<id>` cropped from the PDF, or `scene:<scene-id>`).
- **Engine:** `src/reader/playlist.ts` is a pure flat list of every paragraph with `next`/`prev`/`back`/`resume`/`sectionStart`/`pictureAt`. All the ordering and fallback logic lives here and is unit-tested.
- **Screen:** `src/screens/reader.ts` follows the `Ctx`/AbortSignal pattern. It plays one paragraph at a time through `speak()` + `Caption`, and races the clip against the buttons. `App` routes a new `HomeChoice` `{ kind: 'reader' }`. Lessons open the reader through `ctx.openReader(section)`, which aborts the lesson flow the way 🏠 does.
- **Audio:** `audioLines()` adds one line per paragraph (`reader-<paragraph id>`, `dir: 'reader'`). `build_audio.py` writes those to `public/audio/reader/`. The PWA excludes that folder from the precache and caches it at runtime (CacheFirst).
- **Figures:** `content/reader/figures.yaml` lists crop boxes in PDF points. `scripts/crop_figures.py` (PyMuPDF) renders them at 2x to `public/reader/figures/`.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright (Edge), zod, yaml, vite-plugin-pwa (Workbox `runtimeCaching`), Python 3 (edge-tts, PyMuPDF, PyYAML, pytest).

**Spec:** `docs/superpowers/specs/2026-09-25-manual-reader-design.md`

---

## Decisions made while planning (read before starting)

- **One `source` per paragraph, quoting the whole passage it retells.** The quote is the contiguous manual text (it may run across several sentences, and across a page break into the next page, which the validator already allows). All 40 Chapter 4 quotes in Task 6 were run through the real `validateLessons` quote matcher on 2026-09-25 and pass. The parent sees the whole passage beside the retelling.
- **Pictures fall back only within a section.** `pictureAt(i)` returns the paragraph's own picture, else the latest earlier picture in the same section, else `null`, which shows a section title card.
- **Scene stills (`scene:<id>`)** are supported by the schema, validator, screen and crop script (copied from `screenshots/<id>.png`, made by `npm run shots`), but Chapter 4 uses only manual figures.
- **Figure boxes** for all 23 Chapter 4 figures were measured on 2026-09-25 by rendering pp. 29–33 with PyMuPDF and looking at the crops. They are listed in Task 5.
- **Learn more** appears in the top bar of lesson *card* screens and on the lesson-end screen (not on question screens, so it can't be used to skip a question). On phones (≤480 px) its label hides and only 📖 shows (its accessible name stays "Learn more").
- **readerStart in this milestone:** only `signs`, `yield` → `ch04-signs`, `lights` → `ch04-signals` and `markings` → `ch04-markings`. The other lessons' sections don't exist yet and the validator would reject them. They are added with their chapters.
- **Offline caching:** an `<audio>` element fetches with `Range` headers and usually gets `206` responses, which Workbox does not cache. So the reader also `fetch()`es the current and the next clip (mp3 + json) without a range. That full `200` response is what the CacheFirst rule stores, and `rangeRequests: true` serves later ranged requests from it.
- **AudioPlayer** gains `pause()`, `resume()` and `elapsedMs()`. The reader needs these for ⏸/▶ and Back's 2-second rule.
- **Left out of Chapter 4:** the chapter-end "QUESTIONS" list (p. 33), cross-references ("see Chapter 5"), and metric conversions ("(40 km/h)"). These count as page furniture.
- **Temp files** go in `.superpowers/tmp/` (gitignored).

## File map

```
content/reader/ch04.yaml            Chapter 4 retelling (Task 6)
content/reader/figures.yaml         figure crop boxes (Task 5)
public/reader/figures/<id>.png      cropped figures (generated, committed)
public/audio/reader/<id>.mp3|json   reader narration (generated, committed)
scripts/crop_figures.py             PyMuPDF crops + scene still copies (Task 5)
scripts/check-sw.ts                 checks dist/sw.js precache/runtime cache (Task 7)
src/reader/types.ts                 zod schemas, ReaderPlace, picturePath
src/reader/load.ts                  browser chapter loading (import.meta.glob)
src/reader/playlist.ts              Playlist, readerStats
src/screens/reader.ts               runReader (screen, chapter menu, finished card)
tests/reader.test.ts                playlist, schema, validator, real content
tests_py/test_crop_figures.py       crop script
e2e/reader.spec.ts, e2e/learn-more.spec.ts, e2e/review.spec.ts
```

---

### Task 1: Reader content model and playlist

**Goal:** Chapter/section/paragraph/figure schemas, browser loading, and a pure `Playlist` with ordering, edges, Back's 2-second rule, resume fallback and picture fallback. Lessons get an optional `readerStart`.

**Files:**
- Modify: `src/content/types.ts`
- Create: `src/reader/types.ts`, `src/reader/load.ts`, `src/reader/playlist.ts`
- Test: `tests/reader.test.ts`

**Acceptance Criteria:**
- [ ] Paragraphs play in chapter-number order (even when chapters are given out of order), then section order, then paragraph order
- [ ] `next` is `null` after the last paragraph and `prev` is `null` before the first; both cross section and chapter boundaries
- [ ] `back(i, ms)` goes to the previous paragraph under 2000 ms, restarts at 2000 ms or more, and restarts paragraph 0
- [ ] `resume` falls back: exact paragraph → start of its section → start of its chapter → 0; `null` → 0
- [ ] `pictureAt` uses the paragraph's picture, else the latest earlier one in the same section, else `null`
- [ ] Bad picture ids and inverted figure boxes are rejected by the schemas; `LessonSchema` accepts `readerStart`

**Verify:** `npx vitest run tests/reader.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Export `Id` and add `readerStart` in `src/content/types.ts`**

Change `const Id = ...` to `export const Id = ...`, and add `readerStart` to `LessonSchema`:

```ts
export const LessonSchema = z.object({
  id: Id,
  order: z.number().int().positive(),
  title: z.string().min(1).max(20),
  icon: z.string().min(1),
  /** Reader section that "📖 Learn more" opens (a section id in content/reader/ch*.yaml). */
  readerStart: Id.optional(),
  cards: z.array(CardSchema).min(1),
  questions: z.array(QuestionSchema).min(1),
});
```

- [ ] **Step 2: Write the failing tests** (`tests/reader.test.ts`)

```ts
import { describe, test, expect } from 'vitest';
import { ChapterSchema, FigureSchema, ParagraphSchema, picturePath, type Chapter } from '../src/reader/types';
import { BACK_RESTART_MS, Playlist, readerStats } from '../src/reader/playlist';
import { LessonSchema } from '../src/content/types';

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
```

Run: `npx vitest run tests/reader.test.ts` → FAIL (cannot find `../src/reader/types`)

- [ ] **Step 3: `src/reader/types.ts`**

```ts
import { z } from 'zod';
import { Id, SourceSchema } from '../content/types';

/** `fig-<id>`: a manual figure from content/reader/figures.yaml. `scene:<scene-id>`: a still of a lesson scene. */
export const PICTURE_RE = /^(fig-[a-z0-9-]+|scene:[a-z0-9-]+)$/;

export const ParagraphSchema = z.object({
  id: Id,
  say: z.string().min(1),
  source: SourceSchema,
  picture: z.string().regex(PICTURE_RE, 'picture is fig-<id> or scene:<scene-id>').optional(),
});

export const SectionSchema = z.object({
  id: Id,
  title: z.string().min(1).max(40),
  paragraphs: z.array(ParagraphSchema).min(1),
});

export const ChapterSchema = z.object({
  id: Id,
  number: z.number().int().positive(),
  title: z.string().min(1).max(40),
  sections: z.array(SectionSchema).min(1),
});

/** A crop of the manual PDF: box is [x0, y0, x1, y1] in PDF points, origin at the top left (PyMuPDF). */
export const FigureSchema = z.object({
  id: z.string().regex(/^fig-[a-z0-9-]+$/, 'figure ids start with fig-'),
  page: z.number().int().positive(),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
}).refine((f) => f.box[0] < f.box[2] && f.box[1] < f.box[3], { message: 'box is [x0, y0, x1, y1] with x0 < x1 and y0 < y1' });
export const FiguresSchema = z.array(FigureSchema);

export type Paragraph = z.infer<typeof ParagraphSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Figure = z.infer<typeof FigureSchema>;

/** Her place in the reader, saved in localStorage. */
export interface ReaderPlace { chapter: string; section: string; paragraph: string }

/** Where a picture's PNG is served from, relative to the app's base URL. */
export function picturePath(picture: string): string {
  return picture.startsWith('scene:') ? `reader/scenes/${picture.slice('scene:'.length)}.png` : `reader/figures/${picture}.png`;
}
```

- [ ] **Step 4: `src/reader/playlist.ts`**

```ts
import type { Chapter, Paragraph, ReaderPlace, Section } from './types';

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

  /** The paragraph's picture, else the latest earlier picture in the same section, else null (show the section title). */
  pictureAt(i: number): string | null {
    const { section } = this.at(i);
    for (let j = i; j >= 0 && this.entries[j].section === section; j--) {
      const p = this.entries[j].paragraph.picture;
      if (p) return p;
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
```

- [ ] **Step 5: `src/reader/load.ts`**

```ts
import YAML from 'yaml';
import { ChapterSchema, type Chapter } from './types';

const raw = import.meta.glob('../../content/reader/ch*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function loadChapters(): Chapter[] {
  return Object.values(raw).map((r) => ChapterSchema.parse(YAML.parse(r))).sort((a, b) => a.number - b.number);
}
```

- [ ] **Step 6: Run the tests.** `npx vitest run tests/reader.test.ts` → PASS. Then `npm test` → PASS, and `npx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/content/types.ts src/reader tests/reader.test.ts
git commit -m "feat(reader): chapter schemas, loading and playlist"
```

---

### Task 2: Saved reader place and pausable audio

**Goal:** `ProgressStore` saves and loads her reader place. `AudioPlayer` can pause, resume and report how far into the clip it is.

**Files:**
- Modify: `src/progress/store.ts`, `src/audio/player.ts`
- Test: `tests/progress.test.ts`, `tests/player.test.ts`

**Acceptance Criteria:**
- [ ] `readerPlace()` is `null` at first; `setReaderPlace()` persists; a new store over the same storage reads it back
- [ ] A malformed stored reader place is dropped without losing lessons, missed questions or places
- [ ] `pause()` keeps `play()` pending; `resume()` continues and the clip can still end normally
- [ ] `elapsedMs()` reports the clip position, and 0 when nothing is playing; `resume()` does nothing when nothing is playing

**Verify:** `npx vitest run tests/progress.test.ts tests/player.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Failing tests.** Append to `tests/progress.test.ts`:

```ts
describe('reader place', () => {
  const place = { chapter: 'ch04', section: 'ch04-signals', paragraph: 'ch04-signals-3' };
  test('starts empty, saves and reloads', () => {
    const kv = memKV();
    const p = new ProgressStore(kv);
    expect(p.readerPlace()).toBeNull();
    p.setReaderPlace(place);
    expect(new ProgressStore(kv).readerPlace()).toEqual(place);
  });
  test('a malformed reader place is dropped and nothing else is lost', () => {
    const raw = JSON.stringify({ completed: ['signs'], missed: ['q1'], places: { yield: { card: 1, seq: 1 } }, reader: { chapter: 'ch04', section: 3 } });
    const p = new ProgressStore(memKV({ [ProgressStore.KEY]: raw }));
    expect(p.readerPlace()).toBeNull();
    expect(p.isCompleted('signs')).toBe(true);
    expect(p.missed()).toEqual(['q1']);
    expect(p.resumeCard({ id: 'yield', cards: [1, 2, 3] })).toBe(1);
  });
  test('the returned place is a copy', () => {
    const p = new ProgressStore(memKV());
    p.setReaderPlace(place);
    p.readerPlace()!.paragraph = 'changed';
    expect(p.readerPlace()).toEqual(place);
  });
});
```

Append inside the `describe('AudioPlayer', ...)` block of `tests/player.test.ts`:

```ts
  test('pause keeps play() pending; resume lets the clip finish', async () => {
    const { AudioPlayer } = await import('../src/audio/player');
    const p = new AudioPlayer('/');
    const s = settled(p.play('a', new AbortController().signal));
    await flush();
    p.pause();
    expect(FakeAudio.last.paused).toBe(true);
    await flush();
    expect(s.done).toBe(false);
    p.resume();
    expect(FakeAudio.last.paused).toBe(false);
    expect(FakeAudio.last.plays).toEqual(['/audio/a.mp3', '/audio/a.mp3']);
    FakeAudio.last.end();
    await flush();
    expect(s).toEqual({ done: true, error: undefined });
  });

  test('elapsedMs is the clip position while playing, else 0', async () => {
    const { AudioPlayer } = await import('../src/audio/player');
    const p = new AudioPlayer('/');
    expect(p.elapsedMs()).toBe(0);
    void p.play('a', new AbortController().signal);
    await flush();
    FakeAudio.last.currentTime = 2.5;
    expect(p.elapsedMs()).toBe(2500);
    FakeAudio.last.end();
    await flush();
    expect(p.elapsedMs()).toBe(0);
  });

  test('resume does nothing when no clip is playing', async () => {
    const { AudioPlayer } = await import('../src/audio/player');
    const p = new AudioPlayer('/');
    p.resume();
    expect(FakeAudio.last.plays).toEqual([]);
  });
```

Run: `npx vitest run tests/progress.test.ts tests/player.test.ts` → FAIL (`readerPlace` / `pause` is not a function)

- [ ] **Step 2: `src/progress/store.ts`.** Add the import and the `reader` field, load it, and add the two methods:

```ts
import type { ReaderPlace } from '../reader/types';
```

```ts
interface Data { completed: string[]; missed: string[]; places: Record<string, Place>; reader: ReaderPlace | null }

const isReaderPlace = (x: unknown): x is ReaderPlace =>
  !!x && typeof x === 'object' && ['chapter', 'section', 'paragraph'].every((k) => typeof (x as Record<string, unknown>)[k] === 'string');
```

In `load()`, the returned object gains `reader: isReaderPlace(d.reader) ? { chapter: d.reader.chapter, section: d.reader.section, paragraph: d.reader.paragraph } : null,` and the fallback becomes `return { completed: [], missed: [], places: {}, reader: null };`.

Add to the class (after `keepGoing`):

```ts
  /** Her place in the manual reader, or null if she has never listened. */
  readerPlace(): ReaderPlace | null { return this.data.reader ? { ...this.data.reader } : null; }
  setReaderPlace(p: ReaderPlace): void {
    const r = this.data.reader;
    if (r && r.chapter === p.chapter && r.section === p.section && r.paragraph === p.paragraph) return;
    this.data.reader = { chapter: p.chapter, section: p.section, paragraph: p.paragraph };
    this.save();
  }
```

- [ ] **Step 3: `src/audio/player.ts`.** Add before `stop()`:

```ts
  /** Pauses the current clip. Its play() stays pending until resume() lets it end, or it is stopped or aborted. */
  pause(): void { if (this.cancelCurrent) this.audio.pause(); }

  /** Continues a paused clip. Does nothing if no clip is playing. */
  resume(): void { if (this.cancelCurrent && this.audio.paused) void this.audio.play().catch(() => {}); }

  /** How far into the current clip playback is, in ms (0 when no clip is playing). */
  elapsedMs(): number { return this.cancelCurrent ? Math.round(this.audio.currentTime * 1000) : 0; }
```

- [ ] **Step 4: Run.** `npx vitest run tests/progress.test.ts tests/player.test.ts` → PASS; `npm test` → PASS; `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/progress/store.ts src/audio/player.ts tests/progress.test.ts tests/player.test.ts
git commit -m "feat(reader): saved reader place; pause, resume and elapsed time in AudioPlayer"
```

---

### Task 3: Reader validation and content counts

**Goal:** `npm run check` validates reader files (schema, unique ids and chapter numbers, quotes on page, pictures have PNGs, lesson `readerStart` names a real section) and prints reader counts and estimated listening time.

**Files:**
- Modify: `src/content/validate.ts`, `scripts/lib.ts`, `scripts/check-content.ts`
- Test: `tests/reader.test.ts`

**Acceptance Criteria:**
- [ ] A bad quote, a missing picture, a bad `readerStart`, a duplicate id and a duplicate chapter number are each reported
- [ ] A valid chapter with an existing picture and a correct `readerStart` gives no errors
- [ ] Lesson validation behaves exactly as before (the source check is shared, not copied)
- [ ] `npm run check` prints the lesson line and a `Reader:` line with chapters, sections, paragraphs, words and minutes

**Verify:** `npx vitest run tests/reader.test.ts tests/content.test.ts` → all pass; `npm run check` → `OK: 12 lessons, ...` then `Reader: 0 chapters, 0 sections, 0 paragraphs, 0 words, about 0 minutes of listening, 0 picture-only sources`

**Steps:**

- [ ] **Step 1: Failing tests.** Append to `tests/reader.test.ts`:

```ts
import { validateReader } from '../src/content/validate';

describe('validateReader', () => {
  const pages = [{ page: 29, text: 'SIGNS\n Traffic signs tell you about traffic rules, special \nhazards, where you are.' }];
  const pics = new Set(['fig-one', 'fig-two']);
  const lessons = [{ id: 'signs', readerStart: 'ch04-a' }, { id: 'parking' }];
  test('valid chapters have no errors', () => {
    expect(validateReader([ch4], pages, pics, lessons)).toEqual([]);
  });
  test('quote not on the cited page', () => {
    const bad = ChapterSchema.parse(structuredClone(ch4));
    bad.sections[0].paragraphs[0].source = { page: 29, quote: 'Traffic lights are normally red, yellow and green' };
    expect(validateReader([bad], pages, pics, lessons).join()).toContain('ch04/ch04-a/ch04-a-1: quote not found on page 29');
  });
  test('picture with no PNG', () => {
    expect(validateReader([ch4], pages, new Set(['fig-one']), lessons).join()).toContain('picture "fig-two" has no PNG');
  });
  test('readerStart that is not a section', () => {
    expect(validateReader([ch4], pages, pics, [{ id: 'lights', readerStart: 'ch04-nope' }]).join())
      .toContain('lesson lights: readerStart "ch04-nope" is not a reader section');
  });
  test('duplicate ids and chapter numbers', () => {
    const e = validateReader([ch4, ch4], pages, pics, lessons).join('\n');
    expect(e).toContain('duplicate id "ch04-a-1"');
    expect(e).toContain('duplicate number 4');
  });
});
```

Run: `npx vitest run tests/reader.test.ts` → FAIL (`validateReader` is not exported)

- [ ] **Step 2: Share the source check in `src/content/validate.ts`.** Move the body of `checkSource` into an exported factory, and use it from `validateLessons` (delete `validateLessons`'s own `indexed` constant and inner `checkSource`):

```ts
/** Returns a checker that pushes an error for a source whose page is unknown or whose quote isn't on that page (or continuing onto the next). */
export function sourceChecker(pages: ManualPage[], errors: string[]): (s: Source, where: string) => void {
  const indexed = new Map(pages.map((p) => [p.page, normalizeIndexed(p.text)]));
  return (s, where) => {
    const here = indexed.get(s.page);
    if (here === undefined) { errors.push(`${where}: page ${s.page} is not in the manual`); return; }
    if (s.quote) {
      const normQuote = normalizeForMatch(s.quote);
      const words = s.quote.trim().split(/\s+/).filter(Boolean).length;
      if (normQuote.length < MIN_QUOTE_NORM_LEN && words < MIN_QUOTE_WORDS) {
        errors.push(`${where}: quote too short to verify (need ${MIN_QUOTE_NORM_LEN}+ characters or ${MIN_QUOTE_WORDS}+ words): "${s.quote}"`);
        return;
      }
      // Concatenate this page with the next so a quote may continue across a page break;
      // idx offsets for the next page's characters shift by here.t.length.
      const next = indexed.get(s.page + 1);
      const t = here.t + (next?.t ?? '');
      const norm = here.norm + (next?.norm ?? '');
      const idx = next ? here.idx.concat(next.idx.map((k) => k + here.t.length)) : here.idx;
      if (!quoteFound(norm, t, idx, normQuote)) errors.push(`${where}: quote not found on page ${s.page}: "${s.quote}"`);
    }
  };
}
```

In `validateLessons`: `const checkSource = sourceChecker(pages, errors);` in place of the old `indexed` + `checkSource`.

Then add at the end of the file:

```ts
/**
 * Reader chapters: unique ids (chapters, sections, paragraphs share one namespace) and chapter numbers,
 * quotes on their pages, pictures that have a PNG (`pictures` holds fig-<id> and scene:<id> ids),
 * and every lesson readerStart naming a real section.
 */
export function validateReader(
  chapters: readonly Chapter[], pages: ManualPage[], pictures: ReadonlySet<string>,
  lessons: readonly { id: string; readerStart?: string }[],
): string[] {
  const errors: string[] = [];
  const checkSource = sourceChecker(pages, errors);
  const ids = new Set<string>();
  const numbers = new Set<number>();
  const checkId = (id: string, where: string) => {
    if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    ids.add(id);
  };
  for (const ch of chapters) {
    checkId(ch.id, `chapter ${ch.id}`);
    if (numbers.has(ch.number)) errors.push(`chapter ${ch.id}: duplicate number ${ch.number}`);
    numbers.add(ch.number);
    for (const s of ch.sections) {
      checkId(s.id, `${ch.id}/${s.id}`);
      for (const p of s.paragraphs) {
        const where = `${ch.id}/${s.id}/${p.id}`;
        checkId(p.id, where);
        checkSource(p.source, where);
        if (p.picture && !pictures.has(p.picture)) errors.push(`${where}: picture "${p.picture}" has no PNG (run: npm run figures)`);
      }
    }
  }
  const sections = new Set(chapters.flatMap((c) => c.sections.map((s) => s.id)));
  for (const l of lessons)
    if (l.readerStart !== undefined && !sections.has(l.readerStart)) errors.push(`lesson ${l.id}: readerStart "${l.readerStart}" is not a reader section`);
  return errors;
}
```

with `import type { Chapter } from '../reader/types';` at the top.

- [ ] **Step 3: `scripts/lib.ts`.** Add:

```ts
import { ChapterSchema, FiguresSchema, type Chapter, type Figure } from '../src/reader/types';

export function readChapters(errors: string[]): Chapter[] {
  const dir = 'content/reader';
  if (!existsSync(dir)) return [];
  const chapters: Chapter[] = [];
  for (const f of readdirSync(dir).filter((f) => /^ch\d+\.yaml$/.test(f)).sort()) {
    try { chapters.push(ChapterSchema.parse(YAML.parse(readFileSync(`${dir}/${f}`, 'utf8')))); }
    catch (e) { errors.push(`${f}: ${(e as Error).message}`); }
  }
  return chapters.sort((a, b) => a.number - b.number);
}

export function readFigures(errors: string[]): Figure[] {
  const f = 'content/reader/figures.yaml';
  if (!existsSync(f)) return [];
  try { return FiguresSchema.parse(YAML.parse(readFileSync(f, 'utf8')) ?? []); }
  catch (e) { errors.push(`figures.yaml: ${(e as Error).message}`); return []; }
}

/** Picture ids that have a PNG: fig-<id> in public/reader/figures, scene:<id> in public/reader/scenes. */
export function readPictureIds(): Set<string> {
  const pngs = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : []);
  return new Set([...pngs('public/reader/figures'), ...pngs('public/reader/scenes').map((id) => `scene:${id}`)]);
}
```

- [ ] **Step 4: `scripts/check-content.ts`.** Replace the file with:

```ts
import { existsSync } from 'node:fs';
import { readChapters, readFigures, readLessons, readPages, readPictureIds } from './lib';
import { validateLessons, validateReader } from '../src/content/validate';
import { audioLines } from '../src/content/audioLines';
import { readerStats } from '../src/reader/playlist';
import { sceneIndex } from '../src/scenes/registry';

const errors: string[] = [];
const lessons = readLessons(errors);
const chapters = readChapters(errors);
const pages = readPages();
const pictures = readPictureIds();
errors.push(...validateLessons(lessons, pages, sceneIndex()));
errors.push(...validateReader(chapters, pages, pictures, lessons));
for (const f of readFigures(errors)) if (!pictures.has(f.id)) errors.push(`figure ${f.id} has no PNG (run: npm run figures)`);
if (process.argv.includes('--audio')) {
  for (const line of audioLines(lessons))
    if (!existsSync(`public/audio/${line.id}.mp3`)) errors.push(`missing audio for ${line.id} (run: npm run audio)`);
}
const figures = lessons.flatMap((l) => [...l.cards, ...l.questions]).filter((x) => !x.source.quote).length;
const questions = lessons.reduce((n, l) => n + l.questions.length, 0);
const signs = lessons.reduce((n, l) => n + l.questions.filter((q) => q.signQuestion).length, 0);
const r = readerStats(chapters);
const readerFigures = chapters.flatMap((c) => c.sections.flatMap((s) => s.paragraphs)).filter((p) => !p.source.quote).length;
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`OK: ${lessons.length} lessons, ${questions} questions (${signs} sign questions), ${figures} picture-only sources for parent review`);
console.log(`Reader: ${r.chapters} chapters, ${r.sections} sections, ${r.paragraphs} paragraphs, ${r.words} words, about ${r.minutes} minutes of listening, ${readerFigures} picture-only sources`);
```

(The `--audio` loop gains reader clips in Task 4.)

- [ ] **Step 5: Run.** `npx vitest run tests/reader.test.ts tests/content.test.ts` → PASS. `npm run check` → the two lines from **Verify**. `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/validate.ts scripts/lib.ts scripts/check-content.ts tests/reader.test.ts
git commit -m "feat(reader): validate reader chapters and print reader counts"
```

---

### Task 4: Reader narration in the audio pipeline

**Goal:** Every reader paragraph becomes an audio line `reader-<paragraph id>` written to `public/audio/reader/`. `build_audio.py` handles subfolders (it writes there and removes stale files there). `check --audio` requires the reader clips. Adds the "finished" phrase.

**Files:**
- Modify: `src/content/audioLines.ts`, `scripts/list-audio-lines.ts`, `scripts/check-content.ts`, `scripts/build_audio.py`
- Test: `tests/content.test.ts`, `tests_py/test_build_audio.py`

**Acceptance Criteria:**
- [ ] `audioLines(lessons, chapters)` adds `{ id: 'reader-<pid>', text: say, dir: 'reader' }` per paragraph; lesson lines keep no `dir`
- [ ] `readerClip(p)` is `reader/reader-<pid>` (the path `AudioPlayer.play()` takes); `audioPath(line)` gives `dir/id` or `id`
- [ ] `PHRASES['phrase-reader-done']` exists
- [ ] `build_audio.py` writes a `dir` line into that subfolder, and deletes stale `.mp3`/`.json` in `public/audio` and in its subfolders, but never `manifest.json`
- [ ] `npm run audio` with no reader content makes only `phrase-reader-done` and leaves every other clip unchanged

**Verify:** `npx vitest run tests/content.test.ts` → pass; `python -m pytest tests_py` → pass; `npm run audio` → `1 generated, <N-1> unchanged, 0 stale files removed`

**Steps:**

- [ ] **Step 1: Failing TS tests.** Append to `tests/content.test.ts`:

```ts
import { audioPath, readerClip, PHRASES } from '../src/content/audioLines';
import { ChapterSchema } from '../src/reader/types';

describe('audioLines: reader', () => {
  const ch = ChapterSchema.parse({
    id: 'ch04', number: 4, title: 'Traffic Control', sections: [{ id: 'ch04-a', title: 'A', paragraphs: [
      { id: 'ch04-a-1', say: 'Traffic signs tell you about the rules.', source: { page: 29, quote: 'Traffic signs tell you about traffic rules' } },
    ] }],
  });
  test('one line per paragraph, in the reader folder', () => {
    const lines = audioLines([lesson()], [ch]);
    expect(lines).toContainEqual({ id: 'reader-ch04-a-1', text: 'Traffic signs tell you about the rules.', dir: 'reader' });
    expect(lines.find((l) => l.id === 'card-yield-1')!.dir).toBeUndefined();
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });
  test('clip paths', () => {
    expect(readerClip({ id: 'ch04-a-1' })).toBe('reader/reader-ch04-a-1');
    expect(audioPath({ id: 'card-yield-1' })).toBe('card-yield-1');
    expect(audioPath({ id: 'reader-x', dir: 'reader' })).toBe('reader/reader-x');
  });
  test('the finished phrase is spoken', () => {
    expect(PHRASES['phrase-reader-done']).toBe('You finished the manual. Great job!');
    expect(audioLines([]).map((l) => l.id)).toContain('phrase-reader-done');
  });
});
```

Run: `npx vitest run tests/content.test.ts` → FAIL

- [ ] **Step 2: `src/content/audioLines.ts`.**

Add `import type { Chapter } from '../reader/types';`. Add to `PHRASES`: `'phrase-reader-done': 'You finished the manual. Great job!',`. Add to `audioId`: `reader: (p: { id: string }) => \`reader-${p.id}\`,`. Then:

```ts
/** Reader clips live in public/audio/reader/, so the PWA can cache them at runtime instead of precaching them. */
export const READER_AUDIO_DIR = 'reader';

export interface AudioLine { id: string; text: string; dir?: string }

/** A clip's path under public/audio without the extension: what AudioPlayer.play() takes. */
export const audioPath = (l: { id: string; dir?: string }): string => (l.dir ? `${l.dir}/${l.id}` : l.id);
export const readerClip = (p: { id: string }): string => audioPath({ id: audioId.reader(p), dir: READER_AUDIO_DIR });

export function audioLines(lessons: Lesson[], chapters: readonly Chapter[] = []): AudioLine[] {
  // ...existing body unchanged, then before `return out;`:
  for (const ch of chapters)
    for (const s of ch.sections)
      for (const p of s.paragraphs) out.push({ id: audioId.reader(p), text: p.say, dir: READER_AUDIO_DIR });
  return out;
}
```

(Replace the old `export interface AudioLine { id: string; text: string }`.)

- [ ] **Step 3: Scripts.** In `scripts/list-audio-lines.ts`: import `readChapters` from `./lib`, then `const chapters = readChapters(errors);` after `readLessons`, and `const lines = audioLines(lessons, chapters);`. In `scripts/check-content.ts`, import `audioPath` too and replace the `--audio` loop with:

```ts
  for (const line of audioLines(lessons, chapters))
    if (!existsSync(`public/audio/${audioPath(line)}.mp3`)) errors.push(`missing audio for ${audioPath(line)} (run: npm run audio)`);
```

- [ ] **Step 4: Failing Python tests.** Change the import line of `tests_py/test_build_audio.py` to `from build_audio import line_dir, match_words, stale_files  # noqa: E402` and append:

```python
def test_line_dir_uses_the_subfolder(tmp_path):
    assert line_dir(tmp_path, {"id": "card-a", "text": "x"}) == tmp_path
    assert line_dir(tmp_path, {"id": "reader-a", "text": "x", "dir": "reader"}) == tmp_path / "reader"


def test_stale_files_looks_in_subfolders(tmp_path):
    (tmp_path / "reader").mkdir()
    for p in ["card-a.mp3", "card-a.json", "card-old.mp3", "manifest.json",
              "reader/reader-a.mp3", "reader/reader-a.json", "reader/reader-old.json", "reader/notes.txt"]:
        (tmp_path / p).write_text("x")
    lines = [{"id": "card-a", "text": "x"}, {"id": "reader-a", "text": "y", "dir": "reader"}]
    stale = sorted(f.relative_to(tmp_path).as_posix() for f in stale_files(tmp_path, lines))
    assert stale == ["card-old.mp3", "reader/reader-old.json"]


def test_a_clip_in_the_wrong_folder_is_stale(tmp_path):
    (tmp_path / "reader").mkdir()
    (tmp_path / "reader-a.mp3").write_text("x")
    lines = [{"id": "reader-a", "text": "y", "dir": "reader"}]
    assert [f.name for f in stale_files(tmp_path, lines)] == ["reader-a.mp3"]
```

Run: `python -m pytest tests_py` → FAIL (ImportError)

- [ ] **Step 5: `scripts/build_audio.py`.** Add after `line_hash`:

```python
def line_dir(out: pathlib.Path, line: dict) -> pathlib.Path:
    """Where a line's files go: `out`, or its subfolder (e.g. public/audio/reader) when the line has a "dir"."""
    return out / line["dir"] if line.get("dir") else out


def stale_files(out: pathlib.Path, lines: list[dict]) -> list[pathlib.Path]:
    """Generated .mp3/.json files in `out` and its subfolders that no line makes any more (never manifest.json)."""
    keep = {(line.get("dir", ""), line["id"]) for line in lines}
    found: list[pathlib.Path] = []
    for folder in [out, *sorted(d for d in out.iterdir() if d.is_dir())]:
        rel = "" if folder == out else folder.name
        for f in sorted(folder.iterdir()):
            if f.is_file() and f.suffix in (".mp3", ".json") and f.name != "manifest.json" and (rel, f.stem) not in keep:
                found.append(f)
    return found
```

In `build_one`, replace the two path lines with:

```python
    folder = line_dir(OUT, line)
    folder.mkdir(parents=True, exist_ok=True)
    mp3 = folder / f"{line['id']}.mp3"
    js = folder / f"{line['id']}.json"
```

In `main`, extend the id check loop:

```python
    for line in lines:
        assert ID_RE.match(line["id"]), f"invalid audio line id: {line['id']!r}"
        if "dir" in line:
            assert ID_RE.match(line["dir"]), f"invalid audio dir: {line['dir']!r}"
```

and replace the whole `removed = 0` / `for f in OUT.iterdir()` block with:

```python
    stale = stale_files(OUT, lines)
    for f in stale:
        f.unlink()
    print(f"{sum(made)} generated, {len(lines) - sum(made)} unchanged, {len(stale)} stale files removed")
```

(The manifest pruning that uses `keep` stays as it is. It is keyed by id, and ids are unique across folders.)

- [ ] **Step 6: Run.** `python -m pytest tests_py` → PASS. `npx vitest run tests/content.test.ts` → PASS. `npm run audio` → `1 generated, ... unchanged, 0 stale files removed` (only `phrase-reader-done`). `npm run check -- --audio` → OK. `npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/content/audioLines.ts scripts/list-audio-lines.ts scripts/check-content.ts scripts/build_audio.py tests/content.test.ts tests_py/test_build_audio.py content/audio-lines.json public/audio/phrase-reader-done.mp3 public/audio/phrase-reader-done.json public/audio/manifest.json
git commit -m "feat(reader): reader narration lines in public/audio/reader"
```

---

### Task 5: Manual figure crops

**Goal:** `content/reader/figures.yaml` with all Chapter 4 figures, and `scripts/crop_figures.py` (PyMuPDF), which renders them at 2x into `public/reader/figures/` and copies any `scene:` stills. The crops are generated, looked at and committed.

**Files:**
- Create: `content/reader/figures.yaml`, `scripts/crop_figures.py`, `tests_py/test_crop_figures.py`, `public/reader/figures/*.png` (generated)
- Modify: `requirements.txt`, `package.json`

**Acceptance Criteria:**
- [ ] `requirements.txt` has `pymupdf>=1.24` and `pyyaml>=6`; `npm run figures` runs the script
- [ ] The script rejects a bad id, a duplicate id or an inverted box; it removes PNGs whose figure was deleted; it exits with an error if a `scene:` picture has no screenshot
- [ ] 23 PNGs exist in `public/reader/figures/`, each looked at: the whole figure, no body text, no neighbouring figure

**Verify:** `python -m pytest tests_py` → all pass; `npm run figures` → prints 23 `public/reader/figures/fig-*.png` lines

**Steps:**

- [ ] **Step 1: Dependencies.** `requirements.txt` becomes:

```
pypdf>=6
edge-tts>=7.2,<8
pytest>=8
pymupdf>=1.24
pyyaml>=6
```

Run `python -m pip install -r requirements.txt`. In `package.json` scripts add `"figures": "python scripts/crop_figures.py",`.

- [ ] **Step 2: `content/reader/figures.yaml`** (boxes in PDF points, top-left origin; measured and checked by eye on 2026-09-25):

```yaml
# Manual figures for the reader. box: [x0, y0, x1, y1] in PDF points (the page is 396 x 612),
# origin at the top left. Regenerate PNGs with: npm run figures. Look at every PNG after a change.
- { id: fig-stop-sign,          page: 29, box: [123, 468, 190, 533] }
- { id: fig-yield-sign,         page: 29, box: [304, 217, 380, 280] }
- { id: fig-regulation-signs,   page: 29, box: [264, 364, 381, 419] }
- { id: fig-warning-signs,      page: 30, box: [86, 76, 192, 167] }
- { id: fig-work-area-signs,    page: 30, box: [68, 245, 194, 287] }
- { id: fig-flag-person,        page: 30, box: [15, 385, 177, 575] }
- { id: fig-destination-sign,   page: 30, box: [291, 74, 377, 112] }
- { id: fig-route-signs,        page: 30, box: [273, 150, 379, 187] }
- { id: fig-service-signs,      page: 30, box: [278, 283, 364, 326] }
- { id: fig-traffic-light,      page: 30, box: [305, 388, 375, 476] }
- { id: fig-light-flashing-red, page: 31, box: [143, 300, 191, 335] }
- { id: fig-light-steady-yellow, page: 31, box: [143, 380, 191, 418] }
- { id: fig-light-steady-green, page: 31, box: [143, 480, 191, 518] }
- { id: fig-light-green-arrow,  page: 31, box: [143, 529, 191, 564] }
- { id: fig-lane-use-lights,    page: 31, box: [204, 221, 372, 296] }
- { id: fig-edge-line-narrows,  page: 31, box: [201, 491, 359, 579] }
- { id: fig-line-broken,        page: 32, box: [17, 201, 161, 251] }
- { id: fig-line-solid-broken,  page: 32, box: [17, 325, 160, 374] }
- { id: fig-line-double-solid,  page: 32, box: [17, 427, 159, 477] }
- { id: fig-line-solid,         page: 32, box: [17, 526, 159, 576] }
- { id: fig-stop-crosswalk,     page: 32, box: [286, 102, 379, 282] }
- { id: fig-lane-arrows,        page: 32, box: [203, 422, 345, 472] }
- { id: fig-diamond-lane,       page: 33, box: [17, 251, 159, 301] }
```

- [ ] **Step 3: Failing tests** (`tests_py/test_crop_figures.py`)

```python
import pathlib
import sys

import fitz
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
from crop_figures import PDF, crop, load_figures, scene_pictures  # noqa: E402


def write(p: pathlib.Path, text: str) -> pathlib.Path:
    p.write_text(text, encoding="utf-8")
    return p


def test_load_figures_accepts_a_good_list(tmp_path):
    figs = load_figures(write(tmp_path / "f.yaml", "- { id: fig-a, page: 29, box: [10, 20, 110, 70] }\n"))
    assert figs == [{"id": "fig-a", "page": 29, "box": [10, 20, 110, 70]}]


@pytest.mark.parametrize("line", [
    "- { id: stop, page: 29, box: [10, 20, 110, 70] }",
    "- { id: fig-a, page: 29, box: [110, 20, 10, 70] }",
    "- { id: fig-a, page: 29, box: [10, 20, 110, 70] }\n- { id: fig-a, page: 30, box: [10, 20, 110, 70] }",
])
def test_load_figures_rejects_bad_entries(tmp_path, line):
    with pytest.raises(ValueError):
        load_figures(write(tmp_path / "f.yaml", line + "\n"))


def test_crop_renders_the_box_at_2x(tmp_path):
    out = crop(fitz.open(PDF), {"id": "fig-t", "page": 29, "box": [100, 200, 200, 250]}, tmp_path)
    pix = fitz.Pixmap(str(out))
    assert (pix.width, pix.height) == (200, 100)


def test_scene_pictures_lists_scene_stills(tmp_path):
    write(tmp_path / "ch05.yaml", """
id: ch05
number: 5
title: T
sections:
  - id: ch05-a
    title: A
    paragraphs:
      - { id: ch05-a-1, say: x, source: { page: 34, quote: q }, picture: "scene:turn-left" }
      - { id: ch05-a-2, say: x, source: { page: 34, quote: q }, picture: fig-stop-sign }
""")
    assert scene_pictures(tmp_path) == {"turn-left"}
```

Run: `python -m pytest tests_py/test_crop_figures.py` → FAIL (ModuleNotFoundError)

- [ ] **Step 4: `scripts/crop_figures.py`**

```python
"""Crop manual figures (content/reader/figures.yaml) to public/reader/figures/<id>.png at 2x, and copy
scene stills (picture: scene:<id> in content/reader/ch*.yaml) from screenshots/<id>.png (npm run shots)
to public/reader/scenes/<id>.png. Look at every PNG after running."""
import pathlib
import re
import shutil
import sys

import fitz  # PyMuPDF
import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF = ROOT / "public" / "manual" / "mv21.pdf"
READER = ROOT / "content" / "reader"
FIGURES = READER / "figures.yaml"
OUT_FIG = ROOT / "public" / "reader" / "figures"
OUT_SCENE = ROOT / "public" / "reader" / "scenes"
SHOTS = ROOT / "screenshots"
ZOOM = 2
FIG_ID = re.compile(r"^fig-[a-z0-9-]+$")


def load_figures(path: pathlib.Path) -> list[dict]:
    figs = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    seen: set[str] = set()
    for f in figs:
        if not FIG_ID.match(str(f.get("id", ""))):
            raise ValueError(f"bad figure id: {f.get('id')!r}")
        if f["id"] in seen:
            raise ValueError(f"duplicate figure id: {f['id']}")
        seen.add(f["id"])
        x0, y0, x1, y1 = f["box"]
        if not (x0 < x1 and y0 < y1):
            raise ValueError(f"{f['id']}: box must be [x0, y0, x1, y1] with x0 < x1 and y0 < y1")
    return figs


def crop(doc: fitz.Document, fig: dict, out_dir: pathlib.Path) -> pathlib.Path:
    out = out_dir / f"{fig['id']}.png"
    page = doc[fig["page"] - 1]
    page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=fitz.Rect(*fig["box"])).save(out)
    return out


def scene_pictures(reader_dir: pathlib.Path) -> set[str]:
    ids: set[str] = set()
    for p in sorted(reader_dir.glob("ch*.yaml")):
        ch = yaml.safe_load(p.read_text(encoding="utf-8"))
        for s in ch["sections"]:
            for para in s["paragraphs"]:
                pic = str(para.get("picture", ""))
                if pic.startswith("scene:"):
                    ids.add(pic[len("scene:"):])
    return ids


def main() -> None:
    figs = load_figures(FIGURES)
    OUT_FIG.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF)
    for f in figs:
        print(crop(doc, f, OUT_FIG).relative_to(ROOT).as_posix())
    keep = {f["id"] for f in figs}
    for png in sorted(OUT_FIG.glob("*.png")):
        if png.stem not in keep:
            png.unlink()
            print(f"removed {png.name}")
    missing = []
    for sid in sorted(scene_pictures(READER)):
        src = SHOTS / f"{sid}.png"
        if not src.exists():
            missing.append(sid)
            continue
        OUT_SCENE.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, OUT_SCENE / f"{sid}.png")
        print(f"public/reader/scenes/{sid}.png")
    if missing:
        sys.exit("missing screenshots, run: npm run shots -- " + " ".join(missing))


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run.** `python -m pytest tests_py` → PASS. `npm run figures` → 23 lines.

- [ ] **Step 6: Look at every PNG** in `public/reader/figures/` with the Read tool. Each must show the whole figure (every sign, lamp, lane line and label in it), with no body text and no part of a neighbouring figure. If one is clipped or includes text, widen or narrow its box by 2–6 points in `figures.yaml`, run `npm run figures` again and look again.

- [ ] **Step 7: Commit**

```bash
git add requirements.txt package.json content/reader/figures.yaml scripts/crop_figures.py tests_py/test_crop_figures.py public/reader/figures
git commit -m "feat(reader): crop manual figures with PyMuPDF"
```

---

### Task 6: Chapter 4 retelling, narration and lesson links

**Goal:** Write `content/reader/ch04.yaml`: all four sections of Chapter 4 (pp. 29–33), 40 paragraphs, each citing the passage it retells. Voice it, listen to it, and link the four matching lessons with `readerStart`. Add the reader writing rules to `content/AUTHORING.md`.

**Files:**
- Create: `content/reader/ch04.yaml`, `public/audio/reader/reader-ch04-*.mp3|json` (generated)
- Modify: `content/lessons/signs.yaml`, `content/lessons/yield.yaml`, `content/lessons/lights.yaml`, `content/lessons/markings.yaml`, `content/AUTHORING.md`, `content/audio-lines.json`, `public/audio/manifest.json`
- Test: `tests/reader.test.ts`

**Acceptance Criteria:**
- [ ] `ch04.yaml` has exactly the sections, paragraph ids, pages, quotes and pictures listed below, in that order
- [ ] Every paragraph's `say` covers every fact in its "Must cover" line (conditions and exceptions included), adds nothing from outside the manual, and is 15–130 words
- [ ] `signs` and `yield` have `readerStart: ch04-signs`, `lights` has `ch04-signals`, and `markings` has `ch04-markings`
- [ ] `npm run check -- --audio` passes and prints `Reader: 1 chapters, 4 sections, 40 paragraphs, ...`
- [ ] Every Chapter 4 clip has been listened to on `review.html` (Task 10 adds the tab; until then play `public/audio/reader/*.mp3` directly), and misread words were reworded

**Verify:** `npx vitest run tests/reader.test.ts` → pass; `npm run check -- --audio` → `OK: 12 lessons, ...` and `Reader: 1 chapters, 4 sections, 40 paragraphs, <words> words, about <m> minutes of listening, 0 picture-only sources`

**Steps:**

- [ ] **Step 1: Failing test.** Append to `tests/reader.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

describe('content/reader/ch04.yaml', () => {
  const ch = ChapterSchema.parse(YAML.parse(readFileSync('content/reader/ch04.yaml', 'utf8')));
  const count = (s: string) => s.trim().split(/\s+/).length;
  test('the four sections, in manual order', () => {
    expect(ch.sections.map((s) => [s.id, s.title, s.paragraphs.length])).toEqual([
      ['ch04-signs', 'Signs', 13],
      ['ch04-signals', 'Traffic Signals', 12],
      ['ch04-markings', 'Pavement Markings', 13],
      ['ch04-officers', 'Traffic Officers', 2],
    ]);
  });
  test('paragraph ids are <section>-<n>, numbered from 1', () => {
    for (const s of ch.sections) expect(s.paragraphs.map((p) => p.id)).toEqual(s.paragraphs.map((_, k) => `${s.id}-${k + 1}`));
  });
  test('every paragraph is 15 to 130 words', () => {
    for (const p of ch.sections.flatMap((s) => s.paragraphs)) expect([p.id, count(p.say) >= 15 && count(p.say) <= 130]).toEqual([p.id, true]);
  });
});
```

Run: `npx vitest run tests/reader.test.ts` → FAIL (ENOENT: ch04.yaml)

- [ ] **Step 2: Writing rules** (also added to `content/AUTHORING.md` in Step 6)

- **Listening level:** she understands speech near her age level. Write normal spoken sentences at about a 9th–10th grade level, and talk to her as "you". She is *not* reading this, so sentences can be 15–25 words. Avoid stacked clauses.
- **Retell everything, in the manual's order.** Every fact in the paragraph's quote must be in its `say`, with its conditions and exceptions ("except to make a left turn into a driveway", "unless a sign that permits it is posted"). Simplify the words, never the meaning.
- **Nothing from outside the manual.** Don't name a sign's shape unless the text states it (the stop and yield shapes are picture-only; leave them out). When a figure is on screen and the text refers to it ("as shown in the sample signs", "In this illustration"), you may point at it: "In the picture, ...". Describe only what the picture plainly shows (e.g. the words NARROW BRIDGE on a sign).
- **Leave out** cross-references ("see Chapter 5", "Read Chapter 6 ...", "(See “Pedestrians” in Chapter 11)"), metric conversions ("(40 km/h)") and the chapter-end QUESTIONS list.
- **Section openers:** the first paragraph of a section starts by naming the topic ("Next, traffic signals."). The first paragraph of the chapter says "Chapter 4 is about traffic control."
- **Numbers:** write them as digits with spoken units: "25 miles per hour" (not "MPH"). Write "New York City" in full.
- **Length:** 40–120 words per paragraph. A one-sentence manual item (flag person, destination signs, flashing red, steady green, green arrow) may be shorter, down to 15 words. Don't pad it with facts from outside the manual.
- **YAML:** use `say: >-` (folded) for multi-line text. Copy each `quote` exactly as given below; they were all checked with the real validator.
- **After voicing:** listen to every clip. If the voice misreads something (e.g. "HOV", "U.S."), reword the `say` (e.g. "H O V lanes, for high-occupancy vehicles") and run `npm run audio` again.

Two worked examples, showing the level and completeness expected:

```yaml
      - id: ch04-signs-1
        say: >-
          Chapter 4 is about traffic control, and it starts with signs. Traffic signs tell you about
          the rules of the road and about special hazards. They also tell you where you are, how to get
          where you are going, and where you can find services. The shape and the color of a sign give
          you a clue about what kind of information it has.
        source:
          page: 29
          quote: "Traffic signs tell you about traffic rules, special hazards, where you are, how to get where you are going and where services are available. The shape and color of traffic signs give indications to the type of information they provide:"
      # ...
      - id: ch04-signs-3
        say: >-
          Now for the most common signs, starting with regulation signs. The stop sign is red with white
          letters. At a stop sign, come to a full stop. Then yield the right-of-way to vehicles and
          pedestrians that are in the intersection or heading toward it, and go only when it is safe.
          If there is a stop line painted on the road, you must stop before the stop line. If there is
          no stop line, you must stop before you enter the crosswalk.
        source:
          page: 29
          quote: "Stop Sign COLOR: Red, with white letters MEANING: Come to a full stop, yield the right-of-way to vehicles and pedestrians in or heading toward the intersection. Go when it is safe. You must come to a stop before the stop line, if there is one. If not, you must stop before you enter the crosswalk."
        picture: fig-stop-sign
```

- [ ] **Step 3: Write `content/reader/ch04.yaml`.** Header:

```yaml
id: ch04
number: 4
title: Traffic Control
sections:
```

Then these sections and paragraphs, in this order. Each paragraph is `id`, `say`, `source: { page, quote }` and `picture` (omit `picture` where it says "none"; the screen then carries the section's latest picture forward, or shows the title card).

**Section `ch04-signs`, title `Signs`**

1. `ch04-signs-1` · p. 29 · picture: none
   Quote: "Traffic signs tell you about traffic rules, special hazards, where you are, how to get where you are going and where services are available. The shape and color of traffic signs give indications to the type of information they provide:"
   Must cover: chapter opener; the five things signs tell you; shape and color tell the type.
2. `ch04-signs-2` · p. 29 · picture: none
   Quote: "REGULATION SIGNS normally are white rectangles with black letters or symbols, but some are different shapes, and some can use red letters or symbols. WARNING SIGNS normally are yellow and diamond-shaped, with black letters or symbols. DESTINATION SIGNS are green with white letters and symbols. SERVICE SIGNS are blue with white letters and symbols. Know the signs shown below and what they indicate. You will be asked about them on your written test."
   Must cover: regulation = normally white rectangles, black letters/symbols, but some other shapes and some red; warning = normally yellow diamonds, black; destination = green, white; service = blue, white; know these signs, the written test asks about them.
3. `ch04-signs-3` · p. 29 · picture: `fig-stop-sign`
   Quote: "Stop Sign COLOR: Red, with white letters MEANING: Come to a full stop, yield the right-of-way to vehicles and pedestrians in or heading toward the intersection. Go when it is safe. You must come to a stop before the stop line, if there is one. If not, you must stop before you enter the crosswalk."
   Must cover: as in the worked example.
4. `ch04-signs-4` · p. 29 · picture: none (carries the stop sign)
   Quote: "If there is no stop line or crosswalk, you must stop before you enter the intersection, at the point nearest the intersection that gives you a view of traffic on the intersecting roadway."
   Must cover: no stop line and no crosswalk → stop before entering the intersection, at the point nearest it where you can see traffic on the crossing road.
5. `ch04-signs-5` · p. 29 · picture: `fig-yield-sign`
   Quote: "Yield Sign COLOR: Red and white, with red letters. MEANING: Decrease speed as you reach the intersection. Prepare to stop and yield the right-of-way to vehicles and pedestrians in or heading toward the intersection. You must come to a full stop at a YIELD sign if traffic conditions require it. When you approach a YIELD sign, check carefully for traffic, and be prepared to stop."
   Must cover: red and white, red letters; slow down; prepare to stop and yield to vehicles and pedestrians in or heading toward the intersection; full stop if traffic requires; check carefully and be ready to stop.
6. `ch04-signs-6` · p. 29 · picture: `fig-regulation-signs`
   Quote: "Other Regulation Signs COLOR: White, with black and/or red letters or symbols MEANING: These signs give information about rules for traffic direction, lane use, turns, speed, parking and other special requirements."
   Must cover: white with black and/or red; rules for direction, lane use, turns, speed, parking, other special requirements. You may name the pictured DO NOT PASS, NO TURN ON RED and SPEED LIMIT 55 signs.
7. `ch04-signs-7` · p. 29 · picture: none (carries the regulation signs)
   Quote: "Some regulation signs have a red circle with a slash over a symbol. This indicates that an action, like a right turn, is not allowed or that some vehicles are restricted from the road. Rectangular white signs with black or red letters or symbols are indications to be alert for special rules."
   Must cover: red circle with a slash = an action (like a right turn) not allowed, or some vehicles restricted from the road; white rectangles with black or red = be alert for special rules.
8. `ch04-signs-8` · p. 30 · picture: `fig-warning-signs`
   Quote: "COLOR: Yellow, with black letters or symbols MEANING: You are approaching a hazardous location or a location where there is a special rule, as shown in the sample signs. Sometimes a warning sign is joined with a yellow and black “recommended speed” sign. This indicates reduced speed is advised in that area."
   Must cover: warning signs: yellow, black; you're approaching a hazard or a place with a special rule; a yellow and black "recommended speed" sign with it means a lower speed is advised there.
9. `ch04-signs-9` · p. 30 · picture: `fig-work-area-signs`
   Quote: "Work Area Signs COLOR: Orange, with black letters or symbols MEANING: People are at work on or near the roadway and traffic can be controlled by a flag person. A work area speed limit as low as 25 MPH (40 km/h) can be posted. Even if no speed limit is provided, you must drive at a reduced speed through the work zone and you must always obey the flag persons."
   Must cover: orange, black; people working on or near the road; a flag person may control traffic; a limit as low as 25 miles per hour can be posted; even with no posted limit you must drive at a reduced speed; always obey flag persons.
10. `ch04-signs-10` · p. 30 · picture: `fig-flag-person`
    Quote: "These illustrations show some signals a flag person will use. Know and obey them."
    Must cover: the pictures show a flag person's signals for stop, proceed and slow (the labels in the figure); know and obey them.
11. `ch04-signs-11` · p. 30 · picture: `fig-destination-sign`
    Quote: "DESTINATION SIGNS: COLOR: Green, with white letters MEANING: Show the direction and distance to locations."
    Must cover: green with white letters; show direction and distance to places (you may read the pictured sign: Rochester 55, Lockport 10).
12. `ch04-signs-12` · p. 30 · picture: `fig-route-signs`
    Quote: "Route Signs COLOR: Varied. MEANING: Indicate interstate, U.S., state or county routes. The shape tells you the type of route you are on. The sample signs, left to right, are for state, U.S., and interstate routes. When you plan a trip, use a highway map to decide which routes to take. During the trip, watch for destination signs so you will not get lost, or have to turn or stop suddenly."
    Must cover: colors vary; they mark interstate, U.S., state or county routes; the shape tells the type; pictured left to right: state, U.S., interstate; plan routes with a highway map; watch destination signs so you don't get lost or have to turn or stop suddenly.
13. `ch04-signs-13` · p. 30 · picture: `fig-service-signs`
    Quote: "SERVICE SIGNS: COLOR: Blue, with white letters or symbols MEANING: Show the location of services, like rest areas, gas stations, camping or medical facilities."
    Must cover: blue with white; show where services are: rest areas, gas stations, camping, medical facilities.

**Section `ch04-signals`, title `Traffic Signals`**

1. `ch04-signals-1` · p. 30 · picture: `fig-traffic-light`
   Quote: "Traffic lights are normally red, yellow and green from the top to bottom or left to right. At some intersections, there are lone red, yellow or green lights. Some traffic lights are steady, others flash. Some are round, and some are arrows."
   Must cover: section opener; red, yellow, green from top to bottom or left to right; some intersections have a single red, yellow or green light; steady or flashing; round or arrows.
2. `ch04-signals-2` · p. 30 · picture: none (carries the traffic light)
   Quote: "State law requires that if the traffic lights or controls are out of service or do not operate correctly when you approach an intersection, you must come to a stop as you would for a stop sign. You must then continue according to the rules of right-of-way, unless you are told to continue by a traffic officer."
   Must cover: lights out or not working → stop as for a stop sign; then go by the right-of-way rules, unless a traffic officer tells you to go.
3. `ch04-signals-3` · p. 31 · picture: none
   Quote: "STEADY RED: Stop. Do not go until the light is green. If a green arrow is shown with the red light, you can go only toward the arrow and only if the intersection is clear."
   Must cover: stop, wait for green; a green arrow with the red → go only toward the arrow and only if the intersection is clear.
4. `ch04-signals-4` · p. 31 · picture: none
   Quote: "You can make a right turn at a steady red light after you come to a full stop and yield the right-of-way to oncoming traffic and pedestrians. You can make a left turn at a steady red light when you turn from a one-way road into another one-way road after you come to a full stop and yield the right-of-way to oncoming traffic and pedestrians."
   Must cover: right on steady red after a full stop and yielding to oncoming traffic and pedestrians; left on steady red only from a one-way road into another one-way road, with the same full stop and yield. Say that the exceptions come next.
5. `ch04-signals-5` · p. 31 · picture: none
   Quote: "You cannot make a turn at a red light if there is a NO TURN ON RED sign posted or another sign, signal or pavement marking prevents the turn. You are not allowed to turn on a red light in New York City unless a sign that permits it is posted. The driver of a school bus containing students cannot turn right on any red light."
   Must cover: no turn on red with a NO TURN ON RED sign, or when another sign, signal or marking prevents it; no turn on red in New York City unless a sign permits it; a school bus with students can't turn right on any red.
6. `ch04-signals-6` · p. 31 · picture: `fig-light-flashing-red`
   Quote: "FLASHING RED: Means the same as a STOP sign: Stop, yield the right-of-way, and go when it is safe."
   Must cover: same as a stop sign: stop, yield, go when safe.
7. `ch04-signals-7` · p. 31 · picture: `fig-traffic-light`
   Quote: "RED ARROW: Do not go in the direction of the arrow until the red arrow light is off and a green light or arrow light goes on. A right or left turn on red is not permitted at a red arrow."
   Must cover: don't go toward the arrow until the red arrow is off and a green light or arrow is on; no right or left turn on red at a red arrow.
8. `ch04-signals-8` · p. 31 · picture: `fig-light-steady-yellow`
   Quote: "STEADY YELLOW: Be prepared to stop. A steady yellow light means the traffic signal is about to turn red. FLASHING YELLOW: Drive with caution."
   Must cover: steady yellow: be ready to stop, the light is about to turn red; flashing yellow: drive with caution.
9. `ch04-signals-9` · p. 31 · picture: `fig-traffic-light`
   Quote: "YELLOW ARROW: The protection of a green arrow will end. If you intend to turn in the direction of the arrow, be prepared to stop."
   Must cover: the green arrow's protection is ending; if you're turning that way, be ready to stop.
10. `ch04-signals-10` · p. 31 · picture: `fig-light-steady-green`
    Quote: "STEADY GREEN: Go, but yield the right-of-way to other traffic at the intersection as required by law"
    Must cover: go, but yield to other traffic at the intersection as the law requires.
11. `ch04-signals-11` · p. 31 · picture: `fig-light-green-arrow`
    Quote: "GREEN ARROW: You can go in the direction of the arrow, but you must yield the right-of-way to other traffic at the intersection as required by law"
    Must cover: go in the arrow's direction, but yield to other traffic at the intersection as the law requires.
12. `ch04-signals-12` · p. 31 · picture: `fig-lane-use-lights`
    Quote: "Lane Use Control Lights Special above the pavement lights are sometimes used to indicate which lanes of a highway can be used at certain times: STEADY RED “X”: Do not drive in this lane. STEADY YELLOW “X”: Move from this lane. FLASHING YELLOW “X”: This lane can only be used for a left turn. GREEN ARROW: You can use this lane."
    Must cover: lights above the lanes show which highway lanes can be used at certain times; steady red X: don't drive in this lane; steady yellow X: move out of this lane; flashing yellow X: left turns only; green arrow: you can use this lane.

**Section `ch04-markings`, title `Pavement Markings`**

1. `ch04-markings-1` · p. 31 · picture: none
   Quote: "Lines and symbols on the roadway divide lanes and tell you when you can pass other vehicles or change lanes. They also tell you which lanes to use for turns and where you must stop for signs or traffic signals. The arrows on these illustrations show the direction of traffic."
   Must cover: section opener; lines and symbols divide lanes, show when you can pass or change lanes, which lanes to use for turns, and where to stop for signs or signals; in the pictures, the arrows show which way traffic moves.
2. `ch04-markings-2` · p. 31 · picture: `fig-edge-line-narrows`
   Quote: "Solid lines along the side of the road tell you where its edge is – where the travel lane ends and the shoulder begins. It is illegal to drive across the edge line, except when told to by a police officer or other authorized official or when allowed by an official sign. An edge line that angles towards the center of the road shows that the road is narrower ahead."
   Must cover: solid edge lines mark where the lane ends and the shoulder begins; crossing it is illegal except when a police officer or other authorized official tells you to, or an official sign allows it; an edge line angling toward the center means the road narrows ahead.
3. `ch04-markings-3` · p. 32 · picture: `fig-line-solid-broken`
   Quote: "Lines that separate lanes of traffic that move in the same direction are white. Lines that separate traffic that moves in opposite directions are yellow. There may be two lines between lanes and lines can be solid or broken."
   Must cover: same direction → white lines; opposite directions → yellow lines; there may be two lines; lines can be solid or broken.
4. `ch04-markings-4` · p. 32 · picture: `fig-line-broken`
   Quote: "One broken line: You can pass other vehicles or change lanes if you can do so safely without interfering with traffic."
   Must cover: you may pass or change lanes if you can do it safely without interfering with traffic.
5. `ch04-markings-5` · p. 32 · picture: `fig-line-solid-broken`
   Quote: "Solid line with broken line: If you are on the side with the solid line, you cannot pass other vehicles or go across the line except to make a left turn into a driveway. If you are on the side with the broken line, you can pass if it is safe to and you will not interfere with traffic."
   Must cover: on the solid side: no passing and no crossing, except a left turn into a driveway; on the broken side: you may pass if it is safe and you won't interfere with traffic.
6. `ch04-markings-6` · p. 32 · picture: `fig-line-double-solid`
   Quote: "Double solid lines: You cannot pass or change lanes. You cannot go across the lines except to turn left to enter or leave the highway (e.g. to or from a driveway or to do a U-turn, see Chapter 5)."
   Must cover: no passing or changing lanes; no crossing except to turn left to enter or leave the highway, for example to or from a driveway, or to make a U-turn.
7. `ch04-markings-7` · p. 32 · picture: `fig-line-solid`
   Quote: "One solid line: You can pass other vehicles or change lanes, but you can only do so when obstructions in the road or traffic conditions make it necessary."
   Must cover: passing or changing lanes is allowed only when something blocking the road or traffic conditions make it necessary.
8. `ch04-markings-8` · p. 32 · picture: `fig-stop-crosswalk`
   Quote: "Stop and Crosswalk Lines: At an intersection controlled by a STOP sign, YIELD sign or traffic light, there can be a white stop line painted across the lane, (called a Stop Line) and/or two parallel lines painted across the road (called a Crosswalk). When required to stop because of a sign or light, you must stop before you reach the stop line, if there is one, or the crosswalk."
   Must cover: at a stop sign, yield sign or traffic light there can be a white stop line across the lane and/or two parallel lines across the road (a crosswalk); when a sign or light makes you stop, stop before the stop line if there is one, or else before the crosswalk.
9. `ch04-markings-9` · p. 32 · picture: none (carries the stop/crosswalk picture)
   Quote: "You need only stop at a stop line or crosswalk if required to by a light, sign or traffic officer, or to yield to a pedestrian, in-line skater or scooter at a marked or unmarked crosswalk."
   Must cover: you only have to stop there if a light, sign or traffic officer requires it, or to yield to a pedestrian, in-line skater or scooter at a marked or unmarked crosswalk.
10. `ch04-markings-10` · p. 32 · picture: none (carries the stop/crosswalk picture)
    Quote: "A single stop line may be placed at intersections to allow room for larger vehicles (such as tractor-trailers, buses, and trucks) to turn without forcing other traffic to back up. It’s important that you stop before you reach this stop line"
    Must cover: a stop line may be set back to leave room for large vehicles (tractor-trailers, buses, trucks) to turn without making other traffic back up; it's important to stop before that line.
11. `ch04-markings-11` · p. 32 · picture: `fig-lane-arrows`
    Quote: "Arrows: Arrows show which lanes you must use. In this illustration, for example, you can turn right only from the right lane. To go straight, you must use the left lane. You must be in the correct lane before you reach the solid line that separates the lanes."
    Must cover: arrows show which lane you must use; in the picture, right turns only from the right lane and straight only from the left lane; be in the correct lane before you reach the solid line between the lanes.
12. `ch04-markings-12` · p. 33 · picture: `fig-diamond-lane`
    Quote: "Diamond Symbol: This symbol indicates the lane is reserved lanes for buses, HOV (High-Occupancy Vehicles) like car-pools and van-pools, bicycles or other special vehicles. You cannot enter and use these lanes unless your vehicle complies with the occupancy or other requirements indicated by signs for the times the special conditions are in effect."
    Must cover: a diamond marks a reserved lane for buses, high-occupancy vehicles (car pools, van pools), bicycles or other special vehicles; you can't use it unless your vehicle meets the occupancy or other rules on the signs, during the times those rules apply.
13. `ch04-markings-13` · p. 33 · picture: none (carries the diamond lane)
    Quote: "When used to designate reserved lanes on city streets, sections of the solid white line that separates the diamond lanes from the normal lanes can be replaced by broken white lines. In these locations, non-HOV can enter the HOV lane if they make a right turn at the next intersection. Bus lanes and HOV lanes are to promote the most efficient use of limited street and highway capacity. They assure that vehicles with the highest importance move the fastest."
    Must cover: on city streets, parts of the solid white line beside a diamond lane can be broken white lines; there, other vehicles may enter the lane if they turn right at the next intersection; bus and HOV lanes make the best use of limited road space and let the most important vehicles move fastest.

**Section `ch04-officers`, title `Traffic Officers`**

1. `ch04-officers-1` · p. 33 · picture: none
   Quote: "Directions given by traffic officers take precedence over signs, signals or pavement markings. If a traffic officer signals you to stop at a green light, for example, you must stop. If an officer signals you to drive through a red light or stop sign, you must do it."
   Must cover: section opener; an officer's directions come before signs, signals and markings; stop if an officer signals stop at a green; go through a red light or stop sign if an officer signals you to.
2. `ch04-officers-2` · p. 33 · picture: `fig-flag-person`
   Quote: "Among the persons authorized to direct traffic are police officers, fire police, highway work area flag persons and school crossing persons, and school bus drivers."
   Must cover: people who may direct traffic include police officers, fire police, highway work area flag persons, school crossing persons and school bus drivers.

- [ ] **Step 4: Check.** `npx vitest run tests/reader.test.ts` → PASS. `npm run check` → OK with `Reader: 1 chapters, 4 sections, 40 paragraphs, ...`. Fix any quote error by re-copying the quote from this plan; never loosen the checker.

- [ ] **Step 5: Link lessons.** Add a `readerStart` line after `icon:` in each file:
  - `content/lessons/signs.yaml`: `readerStart: ch04-signs`
  - `content/lessons/yield.yaml`: `readerStart: ch04-signs`
  - `content/lessons/lights.yaml`: `readerStart: ch04-signals`
  - `content/lessons/markings.yaml`: `readerStart: ch04-markings`

  `npm run check` → OK.

- [ ] **Step 6: `content/AUTHORING.md`.** Append a section `# Writing the manual reader` with the writing rules from Step 2 (the bullets, word for word), plus:

```markdown
## Reader files
- One file per chapter: `content/reader/chNN.yaml` (`id: chNN`, `number`, `title`, `sections`). Section ids are `chNN-<topic>`; paragraph ids are `<section id>-<n>` from 1.
- `source.quote` is the whole contiguous manual passage the paragraph retells (it may continue onto the next page). `npm run check` verifies it.
- `picture` is `fig-<id>` (a crop listed in `content/reader/figures.yaml`, made with `npm run figures`, then looked at) or `scene:<scene-id>` (run `npm run shots -- <scene-id>` first; `npm run figures` copies it). A paragraph with no picture keeps the section's latest picture, or shows the section title.
- A lesson's `readerStart` names the reader section that its "📖 Learn more" button opens.
- After writing: `npm run check`, `npm run audio`, listen to every new clip on `review.html#reader`, then `npm run check -- --audio`.
```

- [ ] **Step 7: Voice it.** `npm run audio` → `40 generated, ... unchanged, 0 stale files removed`. `npm run check -- --audio` → OK. Listen to every `public/audio/reader/reader-ch04-*.mp3`. Reword and regenerate any that are misread. Check that the highlighted words in `public/audio/reader/*.json` cover most tokens: `python -c "import json,glob;[print(f, len(json.load(open(f))['words']), len(json.load(open(f))['text'].split())) for f in sorted(glob.glob('public/audio/reader/*.json'))]"`. The first number should be close to the second.

- [ ] **Step 8: Commit**

```bash
git add content/reader/ch04.yaml content/lessons/signs.yaml content/lessons/yield.yaml content/lessons/lights.yaml content/lessons/markings.yaml content/AUTHORING.md content/audio-lines.json public/audio/reader public/audio/manifest.json tests/reader.test.ts
git commit -m "content(reader): Chapter 4 retelling, narration and lesson links"
```

---

### Task 7: Offline caching for reader audio

**Goal:** Reader clips are left out of the precache and cached at runtime (CacheFirst, dedicated cache) the first time they are fetched. Lesson audio stays precached.

**Files:**
- Modify: `vite.config.ts`
- Create: `scripts/check-sw.ts`

**Acceptance Criteria:**
- [ ] `dist/sw.js` precaches lesson audio and no file under `audio/reader/`
- [ ] `dist/sw.js` has a CacheFirst route for `/audio/reader/` using the cache `reader-audio-v1`, with range request support
- [ ] `skipWaiting: false` and the other PWA settings are unchanged

**Verify:** `npm run build && npx tsx scripts/check-sw.ts` → `OK: <n> precached audio files, none under audio/reader/; reader-audio-v1 runtime cache present`

**Steps:**

- [ ] **Step 1: `scripts/check-sw.ts`** (this fails until the config changes)

```ts
import { readFileSync } from 'node:fs';

const sw = readFileSync('dist/sw.js', 'utf8');
const audio = sw.match(/url:"audio\/[^"]+"/g) ?? [];
const reader = audio.filter((u) => u.startsWith('url:"audio/reader/'));
const problems: string[] = [];
if (!audio.some((u) => u.startsWith('url:"audio/card-'))) problems.push('lesson audio is not precached');
if (reader.length) problems.push(`${reader.length} reader files are precached (e.g. ${reader[0]})`);
if (!sw.includes('reader-audio-v1')) problems.push('no reader-audio-v1 runtime cache');
if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
console.log(`OK: ${audio.length} precached audio files, none under audio/reader/; reader-audio-v1 runtime cache present`);
```

Run: `npm run build && npx tsx scripts/check-sw.ts` → FAIL (`80 reader files are precached ...` (40 mp3 + 40 json) and `no reader-audio-v1 runtime cache`)

- [ ] **Step 2: `vite.config.ts`.** In `workbox`, replace `globIgnores` and add `runtimeCaching`:

```ts
        globIgnores: ['**/scene-preview.html', '**/audio/reader/**'],
        // Manual reader clips are not precached (hours of audio). Each clip and its word timings are
        // cached the first time they are fetched. The reader fetch()es the current and next clip without
        // a Range header so a full 200 response gets cached; rangeRequests then serves <audio>'s ranged
        // requests from it.
        runtimeCaching: [
          {
            urlPattern: /\/audio\/reader\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'reader-audio-v1',
              expiration: { maxEntries: 2000 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
```

- [ ] **Step 3: Run.** `npm run build && npx tsx scripts/check-sw.ts` → OK line. `npm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts scripts/check-sw.ts
git commit -m "feat(reader): cache reader audio at runtime, not in the precache"
```

---

### Task 8: Reader screen and Home entry

**Goal:** `src/screens/reader.ts` plays paragraphs back to back with a picture, a highlighted caption, and ⏮ ⏸/▶ ⏭ ☰ 🏠. It saves her place, shows a note when a clip fails, and ends on a "You finished the manual" card. Home gets a wide "📖 Listen to the manual" button, and `App` routes `{ kind: 'reader' }`.

**Files:**
- Create: `src/screens/reader.ts`, `e2e/reader.spec.ts`
- Modify: `src/screens/home.ts`, `src/app.ts`, `src/main.ts`, `src/styles.css`, `src/screens/ctx.ts` (`speak()` gains an optional `suffix` parameter, forwarded to `player.play()`, so reader clips can be played with the same versioned URL they were prefetched with — see Task 7's `readerClipQuery`)

**Acceptance Criteria:**
- [ ] Home → Listen starts at Chapter 4 paragraph 1 when there is no saved place, and at the saved paragraph otherwise (also after a reload)
- [ ] The top line reads "Chapter 4 · <section>"; the caption highlights words; the picture follows the `pictureAt` rule (title card when `null`)
- [ ] ⏭ plays the next paragraph; ⏮ follows the 2-second rule; ⏸ pauses and ▶ resumes the same clip; ☰ lists chapters and sections, and a tap jumps there and plays
- [ ] A clip that ends starts the next paragraph; a clip that fails shows "Can't play this part right now", does not advance on its own, and ⏭ still works
- [ ] 🏠 stops playback and returns Home; the place is saved when each paragraph starts
- [ ] After the last paragraph, a "You finished the manual" card with ↺ Start over appears
- [ ] Screenshots at 1250 px and 360 px wide have been looked at; no horizontal scroll at 360 px

**Verify:** `npx playwright test e2e/reader.spec.ts` → all pass; then look at `screenshots/reader-*.png`

**Steps:**

- [ ] **Step 1: Failing e2e** (`e2e/reader.spec.ts`)

```ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const CH4 = YAML.parse(readFileSync('content/reader/ch04.yaml', 'utf8')) as { sections: { id: string; title: string; paragraphs: { id: string; say: string }[] }[] };
const say = (sec: number, n: number) => CH4.sections[sec].paragraphs[n].say.replace(/\s+/g, ' ').trim();
const firstWords = (s: string) => s.split(' ').slice(0, 6).join(' ');

/** Records every clip that starts playing, and keeps the last media element for seeking. */
const hook = () => {
  (window as any).plays = [];
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    (window as any).media = this;
    (window as any).plays.push(this.src.split('/').pop());
    return op.call(this);
  };
};
const plays = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).plays.slice());
const where = (page: Page) => page.locator('.reader-where');
const caption = (page: Page) => page.locator('.reader-cap');
const listen = (page: Page) => page.getByRole('button', { name: /Listen to the manual/ });
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const playedSince = async (page: Page, clip: string, since: number) =>
  expect.poll(async () => (await plays(page)).slice(since), { timeout: 20_000 }).toContain(clip);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('Listen plays paragraph 1, Next advances, Home then Listen resumes there (also after a reload)', async ({ page }) => {
  await listen(page).click();
  await expect(where(page)).toHaveText('Chapter 4 · Signs');
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
  await playedSince(page, 'reader-ch04-signs-1.mp3', 0);
  await btn(page, 'Next').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await playedSince(page, 'reader-ch04-signs-2.mp3', 0);
  await btn(page, 'Home').click();
  const before = (await plays(page)).length;
  await listen(page).click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await playedSince(page, 'reader-ch04-signs-2.mp3', before);
  await page.reload();
  await listen(page).click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
});

test('Back: previous paragraph within 2 seconds, else restart this one', async ({ page }) => {
  await listen(page).click();
  await btn(page, 'Next').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await btn(page, 'Back').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
  await btn(page, 'Next').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await playedSince(page, 'reader-ch04-signs-2.mp3', 0);
  await page.waitForTimeout(3000);
  const before = (await plays(page)).length;
  await btn(page, 'Back').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await playedSince(page, 'reader-ch04-signs-2.mp3', before);
});

test('Pause and Play continue the same clip', async ({ page }) => {
  await listen(page).click();
  await playedSince(page, 'reader-ch04-signs-1.mp3', 0);
  await btn(page, 'Pause').click();
  await expect(btn(page, 'Play')).toBeVisible();
  expect(await page.evaluate(() => (window as any).media.paused)).toBe(true);
  const before = (await plays(page)).length;
  await btn(page, 'Play').click();
  await expect(btn(page, 'Pause')).toBeVisible();
  expect((await plays(page)).slice(before)).toEqual(['reader-ch04-signs-1.mp3']);
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
});

test('a clip that ends starts the next paragraph', async ({ page }) => {
  await listen(page).click();
  await playedSince(page, 'reader-ch04-signs-1.mp3', 0);
  await expect.poll(() => page.evaluate(() => Number.isFinite((window as any).media.duration))).toBe(true);
  await page.evaluate(() => { const m = (window as any).media; m.currentTime = m.duration - 0.3; });
  await expect(caption(page)).toContainText(firstWords(say(0, 1)), { timeout: 10_000 });
  await playedSince(page, 'reader-ch04-signs-2.mp3', 0);
});

test('Chapters menu jumps to a section and plays', async ({ page }) => {
  await listen(page).click();
  await btn(page, 'Chapters').click();
  await page.getByRole('button', { name: 'Pavement Markings' }).click();
  await expect(where(page)).toHaveText('Chapter 4 · Pavement Markings');
  await playedSince(page, 'reader-ch04-markings-1.mp3', 0);
});

test('a clip that fails shows a note, does not advance, and Next still works', async ({ page }) => {
  await page.route('**/audio/reader/reader-ch04-signs-1.mp3', (r) => r.abort());
  await listen(page).click();
  await expect(page.locator('.reader-note')).toBeVisible();
  await expect(page.locator('.reader-note')).toHaveText("Can't play this part right now");
  await page.waitForTimeout(3000);
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
  await btn(page, 'Next').click();
  await playedSince(page, 'reader-ch04-signs-2.mp3', 0);
});

test('the last paragraph leads to the finished card', async ({ page }) => {
  await listen(page).click();
  await btn(page, 'Chapters').click();
  await page.getByRole('button', { name: 'Traffic Officers' }).click();
  await btn(page, 'Next').click();
  await expect(caption(page)).toContainText(firstWords(say(3, 1)));
  await btn(page, 'Next').click();
  await expect(page.locator('.caption')).toHaveText('You finished the manual. Great job!');
  await page.getByRole('button', { name: /Start over/ }).click();
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
});

test('screenshots to look at', async ({ page }) => {
  for (const [name, size] of [['desktop', { width: 1250, height: 900 }], ['phone', { width: 360, height: 740 }]] as const) {
    await page.setViewportSize(size);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.screenshot({ path: `screenshots/reader-home-${name}.png`, fullPage: true });
    await listen(page).click();
    await expect(page.locator('.reader-title')).toBeVisible();
    await page.screenshot({ path: `screenshots/reader-title-${name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await btn(page, 'Chapters').click();
    await page.screenshot({ path: `screenshots/reader-menu-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Traffic Signals' }).click();
    await expect(page.locator('.reader-pic img')).toHaveJSProperty('complete', true);
    await page.screenshot({ path: `screenshots/reader-picture-${name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await btn(page, 'Home').click();
  }
});
```

Run: `npx playwright test e2e/reader.spec.ts` → FAIL (no Listen button)

- [ ] **Step 2: `src/screens/reader.ts`**

```ts
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
  focusMain(ctx.root);

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
```

- [ ] **Step 3: `src/screens/home.ts`.** The type and signature become:

```ts
export type HomeChoice = { kind: 'lesson'; lesson: Lesson } | { kind: 'practice' } | { kind: 'reader'; section?: string };

export function showHome(ctx: Ctx, lessons: Lesson[], progress: ProgressStore, hasReader = false): Promise<HomeChoice> {
```

Create the button after `practice`, `const listen = h('button', { class: 'btn soft wide' }, '📖 Listen to the manual');`, and render it under the tiles:

```ts
  ctx.root.replaceChildren(h('div', { class: 'home-grid' }, ...tiles), ...(hasReader ? [listen] : []), h('div', { class: 'bar' }, keep, practice));
```

Inside the promise add `listen.addEventListener('click', () => resolve({ kind: 'reader' }));`.

- [ ] **Step 4: `src/app.ts`.** Add imports:

```ts
import type { Chapter } from './reader/types';
import { Playlist } from './reader/playlist';
import { runReader } from './screens/reader';
```

Constructor and fields:

```ts
  private playlist: Playlist;

  constructor(private root: HTMLElement, private lessons: Lesson[], chapters: Chapter[] = []) {
    this.playlist = new Playlist(chapters);
  }
```

In `start()`, the home call and the dispatch become:

```ts
        const choice = await showHome(ctx, this.lessons, this.progress, this.playlist.length > 0);
        this.player.stop();
        if (choice.kind === 'lesson') await this.runLesson(ctx, choice.lesson);
        else if (choice.kind === 'reader') await this.runReader(ctx, choice.section);
        else await runPractice(ctx, this.lessons, this.progress);
```

And a new method:

```ts
  /** Opens the reader at `section`'s first paragraph, or where she left off. */
  private async runReader(ctx: Ctx, section?: string): Promise<void> {
    const at = section === undefined ? -1 : this.playlist.sectionStart(section);
    await runReader(ctx, this.playlist, this.progress, at >= 0 ? at : this.playlist.resume(this.progress.readerPlace()));
  }
```

- [ ] **Step 5: `src/main.ts`**

```ts
import './styles.css';
import { loadLessons } from './content/load';
import { loadChapters } from './reader/load';
import { App } from './app';

void new App(document.getElementById('app')!, loadLessons(), loadChapters()).start();
```

- [ ] **Step 6: `src/styles.css`.** Append:

```css
/* ---- manual reader ---- */
.btn.wide { width: 100%; }
.reader-where { font-size: 22px; font-weight: 700; color: var(--soft-ink); }
.stage.reader-pic { background: #fff; border: 2px solid #eee; align-items: center; padding: 12px; }
.stage.reader-pic img { display: block; max-width: 100%; max-height: 34vh; object-fit: contain; }
.stage.reader-title { background: var(--soft); color: var(--soft-ink); align-items: center; min-height: 22vh; padding: 16px; font-size: 40px; font-weight: 800; text-align: center; }
.caption.reader-cap { font-size: 24px; flex: 0 0 auto; }
.reader-note { background: #fff3e0; border: 2px solid #ffb74d; border-radius: var(--radius); padding: 8px 12px; font-size: 20px; font-weight: 700; }
.reader-bar .btn.go.icon:not([disabled]) { background: var(--go); border-color: #2e7d32; }
.reader-menu { display: flex; flex-direction: column; gap: 10px; }
.reader-menu-ch { display: flex; flex-direction: column; gap: 10px; }
.reader-menu h2 { margin: 8px 0 0; font-size: 22px; }
.reader-menu-sec { width: 100%; text-align: left; }
.reader-menu-sec.here { border-color: var(--you); box-shadow: 0 0 0 4px #bbdefb; }
@media (max-width: 480px) {
  .caption.reader-cap { font-size: 21px; }
  .stage.reader-title { font-size: 30px; }
}
```

- [ ] **Step 7: Run.** `npx playwright test e2e/reader.spec.ts` → PASS. `npm run e2e` → all PASS (the old specs are unaffected). `npm test` and `npx tsc --noEmit` → clean.

- [ ] **Step 8: Look at the screenshots.** Read each `screenshots/reader-*.png` (home, title, menu, picture × desktop, phone). Check that: the Listen button sits under the tiles and is full width; the top line is readable; the figure is centered, not stretched, and the caption is visible without scrolling on desktop; the four control buttons fit one row at 360 px; the menu's current section is ringed. Fix the CSS and re-run until they look right.

- [ ] **Step 9: Commit**

```bash
git add src/screens/reader.ts src/screens/home.ts src/app.ts src/main.ts src/styles.css e2e/reader.spec.ts
git commit -m "feat(reader): reader screen, chapter menu, finished card and Home button"
```

---

### Task 9: "📖 Learn more" from lessons

**Goal:** Lesson card screens (top bar) and the lesson-end screen show "📖 Learn more" when the lesson has a `readerStart`. It leaves the lesson the way 🏠 does (her card place is kept) and opens the reader at that section.

**Files:**
- Modify: `src/screens/ctx.ts`, `src/screens/learn.ts`, `src/screens/lessonEnd.ts`, `src/app.ts`, `src/styles.css`
- Create: `e2e/learn-more.spec.ts`

**Acceptance Criteria:**
- [ ] Yield → Learn more opens "Chapter 4 · Signs" and plays `reader-ch04-signs-1`; 🏠 → Yield resumes at the card she left
- [ ] Traffic lights → Learn more opens "Chapter 4 · Traffic Signals"
- [ ] The lesson-end screen shows Learn more for Yield; lessons without `readerStart` (Parking) show no Learn more
- [ ] At 360 px the lesson top bar shows only 📖 (accessible name still "Learn more") and does not scroll sideways

**Verify:** `npx playwright test e2e/learn-more.spec.ts` → all pass; look at `screenshots/learn-more-phone.png`

**Steps:**

- [ ] **Step 1: Failing e2e** (`e2e/learn-more.spec.ts`)

```ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const hook = () => {
  (window as any).plays = [];
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { (window as any).plays.push(this.src.split('/').pop()); return op.call(this); };
};
const plays = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).plays.slice());
const learnMore = (page: Page) => page.getByRole('button', { name: 'Learn more' });
const nextCard = async (page: Page) => {
  const next = page.getByRole('button', { name: /Next/ });
  await expect(next).toBeEnabled({ timeout: 30_000 });
  await next.click();
};
const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const YIELD = YAML.parse(readFileSync('content/lessons/yield.yaml', 'utf8')) as { questions: { ask: string; choices: string[]; answer: number }[] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('Learn more on a card opens the mapped section and keeps her card', async ({ page }) => {
  await page.getByRole('button', { name: /Yield/ }).click();
  await nextCard(page);
  await expect(page.locator('.caption').first()).toContainText('When you see a yield sign, slow down');
  await learnMore(page).click();
  await expect(page.locator('.reader-where')).toHaveText('Chapter 4 · Signs');
  await expect.poll(() => plays(page), { timeout: 20_000 }).toContain('reader-ch04-signs-1.mp3');
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: /Yield/ }).click();
  await expect(page.locator('.caption').first()).toContainText('When you see a yield sign, slow down');
});

test('Traffic lights opens Traffic Signals', async ({ page }) => {
  await page.getByRole('button', { name: /Traffic lights/ }).click();
  await learnMore(page).click();
  await expect(page.locator('.reader-where')).toHaveText('Chapter 4 · Traffic Signals');
});

test('no Learn more for a lesson without readerStart', async ({ page }) => {
  await page.getByRole('button', { name: /Parking$/ }).click(); // not "Parking signs"
  await expect(page.locator('.caption').first()).toBeVisible();
  await expect(learnMore(page)).toHaveCount(0);
});

test('the lesson-end screen offers Learn more', async ({ page }) => {
  await page.getByRole('button', { name: /Yield/ }).click();
  for (let k = 0; k < 3; k++) await nextCard(page);
  for (let k = 0; k < YIELD.questions.length; k++) {
    const ask = norm(await page.locator('.ask-row .caption').textContent());
    const q = YIELD.questions.find((x) => norm(x.ask) === ask)!;
    await page.locator('.tile').nth(q.answer).click();
    await expect(page.locator('.feedback.good')).toBeVisible();
    if (k < YIELD.questions.length - 1) await expect(page.locator('.ask-row .caption')).not.toHaveText(ask, { timeout: 20_000 });
  }
  await expect(page.getByRole('button', { name: /Home/ }).last()).toBeVisible({ timeout: 20_000 });
  await learnMore(page).click();
  await expect(page.locator('.reader-where')).toHaveText('Chapter 4 · Signs');
});

test('phone: Learn more shrinks to its icon and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole('button', { name: /Yield/ }).click();
  await expect(learnMore(page)).toBeVisible();
  await expect(page.locator('.learn-more .lm-text')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'screenshots/learn-more-phone.png', fullPage: true });
});
```

Run: `npx playwright test e2e/learn-more.spec.ts` → FAIL (no Learn more button)

- [ ] **Step 2: `src/screens/ctx.ts`.** Extend `Ctx` and add the button helper:

```ts
export interface Ctx {
  root: HTMLElement; player: AudioPlayer; signal: AbortSignal; goHome: () => void;
  /** Leaves the current flow the way 🏠 does, then opens the reader at a section. */
  openReader: (section: string) => void;
}
```

```ts
/** "📖 Learn more": leaves the lesson like 🏠 (her card is already saved) and opens the reader at `section`. */
export function learnMoreButton(ctx: Ctx, section: string): HTMLElement {
  const b = h('button', { class: 'btn soft learn-more', 'aria-label': 'Learn more' }, h('span', {}, '📖'), h('span', { class: 'lm-text' }, ' Learn more'));
  b.addEventListener('click', () => ctx.openReader(section));
  return b;
}
```

- [ ] **Step 3: `src/screens/learn.ts`.** Add an optional last parameter and put the button in the top bar:

```ts
export async function learnCard(ctx: Ctx, card: Card, fraction: number, canGoBack: boolean, readerStart?: string): Promise<CardMove> {
```

```ts
  ctx.root.replaceChildren(
    topBar(ctx, fraction, restart, ...(readerStart ? [learnMoreButton(ctx, readerStart)] : [])), stage, caption.el,
    h('div', { class: 'bar' }, say, again, ...(canGoBack ? [back] : []), next),
  );
```

(import `learnMoreButton` from `./ctx`.)

- [ ] **Step 4: `src/screens/lessonEnd.ts`.** The bar becomes:

```ts
  ctx.root.replaceChildren(
    h('div', { class: 'big-center' }, h('div', { class: 'huge' }, '✅'), cap.el),
    h('div', { class: 'bar' }, ...(lesson.readerStart ? [learnMoreButton(ctx, lesson.readerStart)] : []), home),
  );
```

(import `learnMoreButton` from `./ctx`.)

- [ ] **Step 5: `src/app.ts`.** Remember the pending choice and use it before showing Home:

```ts
  /** Set by ctx.openReader: what to open instead of Home after the current flow is aborted. */
  private pending: HomeChoice | null = null;

  private newCtx(): Ctx {
    const c = new AbortController();
    return {
      root: this.root, player: this.player, signal: c.signal, goHome: () => c.abort(),
      openReader: (section) => { this.pending = { kind: 'reader', section }; c.abort(); },
    };
  }
```

In `start()`:

```ts
        const pending = this.pending;
        this.pending = null;
        const choice = pending ?? await showHome(ctx, this.lessons, this.progress, this.playlist.length > 0);
```

In `runLesson`, pass the lesson's section: `const move = await learnCard(ctx, lesson.cards[i], i / total, i > 0, lesson.readerStart);`. Import `type HomeChoice` from `./screens/home`.

- [ ] **Step 6: `src/styles.css`.** Append:

```css
/* ---- Learn more: icon only on phones, so the lesson top bar fits ---- */
@media (max-width: 480px) { .learn-more .lm-text { display: none; } }
```

- [ ] **Step 7: Run.** `npx playwright test e2e/learn-more.spec.ts` → PASS; `npm run e2e` → all PASS; `npm test`, `npx tsc --noEmit` → clean. Look at `screenshots/learn-more-phone.png`: 🏠, the progress bar, ↺ Start over and 📖 fit on one row.

- [ ] **Step 8: Commit**

```bash
git add src/screens/ctx.ts src/screens/learn.ts src/screens/lessonEnd.ts src/app.ts src/styles.css e2e/learn-more.spec.ts
git commit -m "feat(reader): Learn more from lesson cards and the lesson end"
```

---

### Task 10: "Manual reader" tab on the parent fact-check page

**Goal:** `review.html` gets Lessons and Manual reader tabs. The reader tab lists every paragraph with its picture, retelling, ▶ Listen button and paragraph id, next to the manual quote and a page link.

**Files:**
- Modify: `src/review/main.ts`, `src/styles.css`
- Create: `e2e/review.spec.ts`

**Acceptance Criteria:**
- [ ] `review.html` shows the Lessons tab by default; `review.html#reader` shows only the reader tab; the tabs switch without a reload
- [ ] Every Chapter 4 paragraph has a row: picture (or title card), `say`, ▶ Listen (plays `audio/reader/reader-<id>.mp3`), the quote and a "Manual page N" link
- [ ] The tab starts with chapter/section/paragraph counts and listening minutes

**Verify:** `npx playwright test e2e/review.spec.ts` → pass

**Steps:**

- [ ] **Step 1: Failing e2e** (`e2e/review.spec.ts`)

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const CH4 = YAML.parse(readFileSync('content/reader/ch04.yaml', 'utf8')) as { sections: { paragraphs: unknown[] }[] };
const PARAGRAPHS = CH4.sections.reduce((n, s) => n + s.paragraphs.length, 0);

test('Manual reader tab lists every paragraph beside its quote', async ({ page }) => {
  await page.goto('review.html#reader');
  await expect(page.getByRole('heading', { name: 'Chapter 4: Traffic Control' })).toBeVisible();
  await expect(page.locator('.reader-pane .row')).toHaveCount(PARAGRAPHS);
  await expect(page.locator('.lessons-pane')).toBeHidden();
  await expect(page.locator('.reader-pane .row').first().getByRole('link', { name: 'Manual page 29' })).toBeVisible();
  await page.getByRole('link', { name: 'Lessons' }).click();
  await expect(page.locator('.lessons-pane')).toBeVisible();
  await expect(page.locator('.reader-pane')).toBeHidden();
});
```

Run: `npx playwright test e2e/review.spec.ts` → FAIL

- [ ] **Step 2: `src/review/main.ts`.** Keep the helpers (`listen`, `thumb`, `safeThumb`, `source`) as they are. Add imports:

```ts
import { readerClip } from '../content/audioLines';
import { loadChapters } from '../reader/load';
import { Playlist, readerStats } from '../reader/playlist';
import { picturePath } from '../reader/types';
```

Replace everything from `const root = ...` to the end of the file with:

```ts
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
readerPane.append(h('p', {},
  `${stats.chapters} chapters, ${stats.sections} sections, ${stats.paragraphs} paragraphs, about ${stats.minutes} minutes of listening. ` +
  'Each paragraph retells the manual passage on the right. Check that nothing is missing, changed or added.'));
const list = new Playlist(chapters);
list.entries.forEach((e, i) => {
  if (e.paragraph === e.chapter.sections[0].paragraphs[0]) readerPane.append(h('h2', {}, `Chapter ${e.chapter.number}: ${e.chapter.title}`));
  if (e.paragraph === e.section.paragraphs[0]) readerPane.append(h('h3', {}, e.section.title));
  const pic = list.pictureAt(i);
  const shown = pic
    ? h('img', { class: 'thumb', src: `${base}${picturePath(pic)}`, alt: pic })
    : h('div', { class: 'thumb title-card' }, e.section.title);
  readerPane.append(h('div', { class: 'row' },
    shown,
    h('div', {}, h('p', { class: 'say' }, e.paragraph.say), h('p', { class: 'pid' }, e.paragraph.id), listen(readerClip(e.paragraph))),
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
```

- [ ] **Step 3: `src/styles.css`.** Append:

```css
/* ---- parent review: tabs and the reader tab ---- */
.review .tabs { display: flex; gap: 8px; margin: 8px 0 16px; }
.review .tab { padding: 8px 16px; border: 2px solid #90caf9; border-radius: 8px; text-decoration: none; color: var(--soft-ink); font-weight: 700; }
.review .tab.on { background: var(--soft-ink); color: #fff; }
.review img.thumb { width: 100%; background: #fff; border: 1px solid #ddd; }
.review .thumb.title-card { background: var(--soft); color: var(--soft-ink); font-weight: 800; padding: 16px 8px; text-align: center; }
.review .pid { font-size: 12px; color: #777; margin: 0 0 6px; }
```

- [ ] **Step 4: Run.** `npx playwright test e2e/review.spec.ts` → PASS; `npx tsc --noEmit` → clean. Open `npm run dev` → `http://localhost:5173/permit-study/review.html#reader`. Click three ▶ Listen buttons and one page link to check they work.

- [ ] **Step 5: Commit**

```bash
git add src/review/main.ts src/styles.css e2e/review.spec.ts
git commit -m "feat(review): Manual reader tab for the parent fact check"
```

---

### Task 11: Full verification, screenshots and docs

**Goal:** Everything passes together, the reader screens have been looked at, and the docs describe the reader.

**Files:**
- Modify: `CLAUDE.md`, `docs/PARENT-GUIDE.md`

**Acceptance Criteria:**
- [ ] `npm test`, `npm run check -- --audio`, `npm run e2e`, `npm run build` (then `npx tsx scripts/check-sw.ts`) and `python -m pytest tests_py` all pass
- [ ] Every `screenshots/reader-*.png` and `screenshots/learn-more-phone.png` has been looked at, and any problem fixed
- [ ] `CLAUDE.md` covers the reader (commands, architecture, content files); `docs/PARENT-GUIDE.md` explains Listen to the manual, Learn more and the Manual reader review tab
- [ ] No scene changed: `git diff $(git log -1 --format=%H -- docs/superpowers/plans/2026-09-25-manual-reader.md) --stat -- src/scenes` prints nothing

**Verify:** `npm test && npm run check -- --audio && npm run e2e && npm run build && npx tsx scripts/check-sw.ts && python -m pytest tests_py` → every step passes (exit code 0)

**Steps:**

- [ ] **Step 1: Run everything.** Run the **Verify** command. Fix any failure at its cause (never loosen a checker or a test), then run it again from the start.

- [ ] **Step 2: Look at the screenshots.** `npx playwright test e2e/reader.spec.ts e2e/learn-more.spec.ts -g "screenshots|phone"`, then Read each `screenshots/reader-home-*.png`, `reader-title-*.png`, `reader-menu-*.png`, `reader-picture-*.png` and `learn-more-phone.png`. Check: nothing is cut off or overlapping; the figure is sharp and not stretched; the top line, caption and controls are all visible; on the phone, the four control buttons fit on one row and the lesson top bar fits.

- [ ] **Step 3: Offline check (manual).** `npm run build && npx vite preview --port 4173`. Open `http://localhost:4173/permit-study/`, play two reader paragraphs, then in DevTools → Application check that the `reader-audio-v1` cache holds those clips (mp3 + json) and the next one. Go offline, reload, and play those paragraphs again: they play. A paragraph that was never fetched shows "Can't play this part right now", and ⏭ still works.

- [ ] **Step 4: `CLAUDE.md`.** Under **Commands**, add `npm run figures`: crops `content/reader/figures.yaml` from the manual PDF to `public/reader/figures/` (PyMuPDF) and copies `scene:` stills; look at every PNG. Under **Architecture**, add a **Manual reader** bullet: `content/reader/chNN.yaml` (chapters → sections → paragraphs, each with a validated `source` quote and optional `picture`), `src/reader/playlist.ts` (all ordering, Back 2-second rule and resume fallback), `src/screens/reader.ts`, lesson `readerStart` → "📖 Learn more" via `ctx.openReader`, reader audio in `public/audio/reader/` (runtime-cached by the service worker, not precached; check with `npx tsx scripts/check-sw.ts` after a build), and the review page's `#reader` tab. Point to `content/AUTHORING.md` "Writing the manual reader". In **Known follow-ups**, add: Chapters 5, 6, 8, 9, 10 and 11 of the reader, and their lessons' `readerStart`.

- [ ] **Step 5: `docs/PARENT-GUIDE.md`.** Add a short section: **📖 Listen to the manual** on Home plays a spoken retelling of the manual's Chapter 4 with its pictures, and remembers where she stopped. ⏮ goes back, ⏸ pauses, ⏭ skips ahead, ☰ jumps to a section. **📖 Learn more** in the Signs, Yield, Traffic lights and Pavement markings lessons opens the matching part. On `review.html`, the **Manual reader** tab lists every retold paragraph beside the manual's words. Please read and listen to Chapter 4 there before she uses it.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/PARENT-GUIDE.md
git commit -m "docs: manual reader in CLAUDE.md and the parent guide"
```

---

## Later milestones (not tasks in this plan)

Each batch follows Task 6's pattern: write the chapter files (every paragraph with a validated quote), measure and crop its figures (`figures.yaml`, `npm run figures`, look at every PNG), `npm run audio`, add the lessons' `readerStart`, get the parent's fact check on `review.html#reader`, then publish.

1. **Chapters 5–6:** `content/reader/ch05.yaml` (Intersections and Turns: Right-of-Way, Emergency Vehicles, Turns, ...) and `ch06.yaml` (How to Pass, incl. School Buses). Lessons: `right-of-way` → Ch 5 Right-of-Way, `emergency` → Ch 5 Emergency Vehicles, `turns` → Ch 5 Turns, `school-bus` → Ch 6 School Buses.
2. **Chapters 8–9:** `ch08.yaml` (Defensive Driving, incl. Speed) and `ch09.yaml` (Alcohol and Other Drugs). Lessons: `speed` → Ch 8 Speed, `alcohol` → Ch 9's first section.
3. **Chapters 10–11:** `ch10.yaml` (Special Driving Conditions) and `ch11.yaml` (Sharing the Road).

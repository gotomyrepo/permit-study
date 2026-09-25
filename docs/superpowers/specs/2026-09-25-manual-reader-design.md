# Manual Reader ("Listen to the manual"): design

Date: 2026-09-25. Status: approved in brainstorming; waiting for parent review of this spec.

## Goal

A visual audiobook of the NYS Driver's Manual. A narrator reads a plain-language retelling of each section, the words highlight as they are spoken, and the manual's own drawings are shown. It plays on its own until she stops it. Nothing is gated.

## The learner (update to the original spec)

She reads and writes at a 1st–2nd grade level, but she understands speech at close to her age level (18), with only slightly lower retention. Spoken retellings can use normal sentences at about a 9th–10th grade level. On-screen text she has to read without the narration (buttons, headings) stays short.

## Scope

- Core chapters only: 4 Traffic Control, 5 Intersections and Turns, 6 How to Pass, 8 Defensive Driving, 9 Alcohol and Other Drugs, 10 Special Driving Conditions, 11 Sharing the Road. That is about pp. 27–79 and about 40 sections.
- Chapters 1–3, 7, 12 and 13 are left out for now. The format allows adding them later with no code changes.
- Not included: check questions in the reader, and gating of any kind.

## What she sees and does

**Entry points**
- Home: a wide **"📖 Listen to the manual"** button under the lesson tiles. It resumes at her saved place, or starts at the first paragraph of Chapter 4 if there is none.
- Lessons: a **"📖 Learn more"** button in the lesson top bar and on the lesson-end screen. It starts the reader at that lesson's `readerStart` section (see the mapping below) and keeps playing on from there. Lessons without a `readerStart` don't show the button.

**Screen**
- Top line: chapter and section, e.g. "Chapter 5 · Right-of-Way".
- Picture: the paragraph's `picture` if it has one. Otherwise the most recent picture in the same section. Otherwise a large section title card.
- Caption: the `say` text in large type, with word-by-word highlighting from the audio timings (the same caption component the lessons use).
- Controls, always enabled:
  - ⏸/▶ Pause/Play.
  - ⏮ Back: goes to the start of the current paragraph, or to the previous paragraph if the current one has played for less than 2 seconds.
  - ⏭ Next: the next paragraph.
  - ☰ Chapters: a list of chapters and sections; tapping one jumps there and plays.
  - 🏠 (the existing button): stops playback and saves her place.

**Playback**
- Paragraphs play back to back. At the end of a section the next section starts, and at the end of a chapter the next chapter starts. After the last paragraph of Chapter 11 it stops on a "You finished the manual" card with a Start over button.
- If a clip fails to load (offline, not cached yet), the caption stays visible, a short "Can't play this part right now" note appears, and ⏭ still works. Playback does not auto-advance past a failed clip.
- Her place is saved to localStorage whenever a paragraph starts, as `{ chapter, section, paragraph }`, using the ids below. Unknown ids (after content changes) fall back to the start of that section, then to the start of the chapter, then to Chapter 4.

## Content

**Files:** `content/reader/ch04.yaml` … `content/reader/ch11.yaml`.

```yaml
id: ch04
number: 4
title: Traffic Control
sections:
  - id: ch04-signs
    title: Signs
    paragraphs:
      - id: ch04-signs-1
        say: "..."            # plain-language retelling, ~9th–10th grade listening level
        source: { page: 29, quote: "..." }   # same rules as lesson sources (or source.figure)
        picture: fig-sign-colors             # optional: a manual figure or scene still id
```

**Writing rules**
- Retell the whole section, in the manual's order, not just the highlights. No partial rules: keep the manual's conditions and exceptions.
- Facts come only from the manual. Every paragraph cites a page and quote that the validator checks.
- Paragraphs run about 40–120 words (about 15–45 seconds each).
- Leave out pure cross-references ("see Chapter 6") and page furniture.
- Numbers are written the way they should be spoken when the TTS misreads them (same practice as the lessons).

**Pictures**
- Manual figures: `content/reader/figures.yaml` lists `{ id, page, box: [x0, y0, x1, y1] }` in PDF points. `scripts/crop_figures.py` (PyMuPDF, added to `requirements.txt`; pypdf cannot render) renders each one at 2x to `public/reader/figures/<id>.png`. Crops are chosen by eye and checked by looking at the PNGs.
- Scene stills: `picture: scene:<scene-id>` uses a PNG made with the existing screenshot tool, copied to `public/reader/scenes/<scene-id>.png` by the same script.
- The validator checks that every `picture` id exists.

**Lesson → reader mapping** (new optional `readerStart` field on lessons)

| Lesson | readerStart |
|---|---|
| signs, yield | Ch 4 Signs |
| lights | Ch 4 Traffic Signals |
| markings | Ch 4 Pavement Markings |
| right-of-way | Ch 5 Right-of-Way |
| emergency | Ch 5 Emergency Vehicles |
| turns | Ch 5 Turns |
| school-bus | Ch 6 School Buses |
| speed | Ch 8 Speed |
| alcohol | Ch 9 (first section) |
| parking, parking-signs | none (Chapter 7 is out of scope) |

## Audio

- Same voice and pipeline: `audioLines()` adds one line per paragraph, id `reader-<paragraph id>`, and `npm run audio` makes the mp3 plus word timings. Only changed paragraphs are re-synthesized.
- Output goes to `public/audio/reader/` so the PWA config can treat it separately.
- **Offline:** reader audio is **not precached**. A Workbox `runtimeCaching` rule (CacheFirst, dedicated cache name) stores each clip and its timings the first time it plays. Lesson audio stays precached as it is today. The precache glob must exclude `audio/reader/**`.
- `npm run check -- --audio` requires the reader clips too.

## Code

- `src/reader/types.ts`, `src/reader/load.ts`: chapter types and loading (like `src/content/load.ts`).
- `src/reader/playlist.ts`: a pure flat ordering of paragraphs with `next`, `prev`, `indexOf(place)`, `sectionStart`, and resume fallback. This is where most of the logic lives, and it is unit-tested.
- `src/screens/reader.ts`: the screen. It follows the `Ctx`/AbortSignal pattern; abort stops the audio and resolves back to Home. It reuses `src/ui/caption.ts` for highlighting.
- `src/progress/store.ts`: `readerPlace` get/set.
- `src/screens/home.ts`: the Listen button, plus a new `HomeChoice` `{ kind: 'reader' }`.
- Lesson screens: the Learn more button, which leaves the lesson through the same path as 🏠 (saving her lesson place) and opens the reader at `readerStart`.
- `src/content/validate.ts`: validate reader files (schema, unique ids, quotes on page, pictures exist, lesson `readerStart` refers to a real section).
- `scripts/check-content.ts`: print chapter, section, paragraph and word counts, plus the estimated listening minutes.
- `review.html`: a "Manual reader" tab listing each paragraph beside its quote and a manual page link.

## Testing

- Unit: playlist order across sections and chapters, next/prev at the edges, Back's 2-second rule, resume fallback for unknown ids, and validator errors for a bad quote, a missing picture and a bad `readerStart`.
- e2e: Home → Listen plays paragraph 1, ⏭ advances, 🏠 → Listen resumes at the same paragraph, and a lesson's Learn more opens the mapped section.
- Parent fact check on `review.html` before each batch of chapters is published.

## Rollout

1. Engine, screen, pipeline, PWA caching, and all of Chapter 4 written. Parent tries it and fact-checks it.
2. Chapters 5–6, then 8–9, then 10–11. Each batch is written, checked, reviewed by the parent, then published.

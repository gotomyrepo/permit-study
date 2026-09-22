# NYS Learner Permit Study App — Design

**Date:** 2026-09-22
**Status:** Draft for review

## Purpose

A study app for one learner: an 18-year-old with autism who reads and writes at a 1st–2nd grade level and learns best by hearing, seeing, and doing. The official NYS audio manual is low-quality robotic speech. This app gives her:

1. A natural, conversational voice explaining each rule in simple words.
2. An animation or picture showing the rule in action.
3. Questions read aloud, answered by tapping, in the style of the real permit test.

She will take the real test with the questions read aloud, so practice mirrors that.

**Success:** she can use it alone on her Windows 11 laptop, move through the tested sections of the manual, and pass read-aloud practice tests built like the real one.

## Constraints

- **Works without reading.** Every screen speaks automatically and has a replay (🔊) button. On-screen text is short, and each word is highlighted as it is spoken.
- **Facts come only from the official NYS Driver's Manual (MV-21)**, downloaded from dmv.ny.gov. Nothing is taken from other websites or written from memory. Every fact and every correct answer records its manual citation.
- **Feedback is gentle.** No buzzers and no red X. A wrong answer gets "Not quite. Let's watch again," a replay, and a retry.
- **No reward system.**
- **Lessons last about 10–15 minutes:** 3–5 learn cards, then 3–5 questions.
- **Internet is normally available**, but the app is cached so it also works offline.
- **Build window is a few days.** The first version covers the most-tested topics; the rest come later.

## Scope (v1 topics, in order)

1. Road signs: shapes and colors (stop, yield, warning, regulatory, guide, work zone)
2. Traffic lights and arrows
3. Pavement markings (line colors and types)
4. Right of way at intersections (yield, stop, 4-way stop, uncontrolled, left turns)
5. Turning and lane use
6. School buses
7. Emergency vehicles
8. Speed limits
9. Parking rules (distances)
10. Alcohol and drugs (NY-specific laws)

The test format (number of questions, passing score, sign-question rule) is **taken from the manual in the first content task**, not assumed. The practice test follows whatever the manual says.

Later topics (v2): passing, highway driving, sharing the road (pedestrians, bicycles, motorcycles, trucks), bad weather and night driving, defensive driving.

## Approach

A static website (TypeScript + Vite). All narration is **pre-generated** into audio files with Microsoft neural voices (the `edge-tts` Python package), so the voice is consistent and every line can be reviewed. It is hosted free on GitHub Pages under the user's account (`gotomyrepo`), in a public repo. It is installable from Edge as an app (PWA), so it gets a taskbar icon and opens full-screen.

Rejected alternatives:
- **Live browser speech:** voice quality depends on Edge and Windows updates, and it is harder to sync with animations.
- **Embedded YouTube videos:** inconsistent, not NY-specific, have ads, and aren't at her level.

## Visual style

Bird's-eye (top-down) cartoon scenes. **She is always the blue car.** Other vehicles are other colors. Scenes follow US right-hand traffic. Fact-based rules that have no motion (e.g. parking distances, BAC limits) use still diagrams with labels.

## User flow

1. **Home:** a grid of picture tiles, one per lesson, plus a checkmark on finished ones. A big "▶ Keep going" button opens the next unfinished lesson. A "📝 Practice test" button starts a practice test.
2. **Learn:** 3–5 cards per lesson. Each card plays one narration line with its animation step, with the caption words highlighted as they are spoken. Buttons are 🔊 replay, 🔁 watch again, and ▶ Next. Next unlocks only after the card's narration and animation finish.
3. **Question:** a scene or picture, then the question read aloud, then each answer read aloud in turn with its tile highlighted ("Number 2: the red car"). Each tile has its own 🔊. She taps a tile to answer. Answers are pictures with 1–3 words where possible, otherwise short phrases.
4. **Feedback:** if correct, "Yes! [restates the answer]." If wrong, "Not quite. Let's watch again," the related learn card replays, and the same question is asked again. Missed questions go into a review queue.
5. **Lesson end:** "Great job, you're done with [topic]!", then back to Home.
6. **Practice test:** built like the real test (count, choices, and sign-question rule from the manual). It draws from the question pool, weighted toward questions she has missed. There is no feedback during the test. The final score is spoken and shown, e.g. "You got 16 out of 20. You passed!", followed by an optional review of the missed questions with their animations.

There are no timers anywhere.

## Architecture

```
content/
  manual/            MV-21 PDF + extracted text (source of truth)
  lessons/*.yaml     one file per lesson (see schema below)
scripts/
  fetch-manual       download PDF from dmv.ny.gov, extract text with page numbers
  build-audio.py     edge-tts: one mp3 + word-timing json per narration line/question/answer
  check-content      validate lesson files: schema, citations exist in manual text
src/
  scenes/            SVG scene engine + reusable parts (roads, intersections, cars, bus, signs, lights, markings)
  scenes/defs/       one scene definition per animation (actors + step timelines)
  screens/           Home, Learn, Question, Feedback, LessonEnd, PracticeTest, Results
  audio/             player: plays a clip, emits word-boundary events for highlighting
  progress/          localStorage store: completed lessons, missed-question queue
  review/            parent fact-check page (/review.html)
public/audio/        generated audio (committed so the site needs no build-time TTS)
tests/
```

### Lesson file schema (YAML, example values)

```yaml
id: yield
title: Yield          # 1–2 words, shown on the tile
icon: yield-sign
cards:
  - id: yield-1
    say: "This is a yield sign. It is a red and white triangle."
    scene: yield-intersection
    step: show-sign
    source: { page: 42, quote: "<exact sentence from the manual>" }
questions:
  - id: yield-q1
    ask: "You are the blue car. Who goes first?"
    scene: yield-intersection
    step: question-freeze
    choices: ["The blue car (you)", "The red car"]
    answer: 1
    explainCard: yield-2
    source: { page: 42, quote: "<exact sentence>" }
    signQuestion: false
```

- `source.quote` must appear word for word in the extracted manual text on that page. `check-content` fails the build otherwise.
- Every card and every question needs a `source`.

### Scene engine

- A scene is SVG plus actors (vehicles, pedestrians, lights with states). Each scene declares named **steps**. Each step is a list of actor moves or state changes over time.
- The Learn screen starts step N when narration line N starts, and the card finishes when **both** the audio and the step have finished. This keeps the words and the animation lined up regardless of clip length.
- Scenes declare their geometry (lane rectangles, stop/yield lines, intersection box) so the scene checker can verify behavior.

### Audio

- `build-audio.py` generates audio for every `say`, `ask`, and `choices` entry, plus fixed phrases ("Yes!", "Not quite. Let's watch again.", "Number 1", ...).
- It writes `<id>.mp3` and `<id>.words.json` (word offsets for highlighting). Files are regenerated only when their text changes (content hash).
- Voice: chosen by the parent from 3–4 neural voice samples before the full generation run.

## Error handling

- If audio fails to load or play, the caption stays visible with a large 🔊 retry button, and Next unlocks after a short delay so she is never stuck.
- If progress storage is unavailable, the app works normally and simply doesn't remember progress.
- An unknown scene or step in content fails the `check-content` build step, not at runtime.

## Testing and verification

- **Content checks** (`check-content`): schema validity, every card/question has a citation, each quote is found on its cited page, each answer index is valid, and each scene/step reference exists.
- **Scene checker** (automated, headless browser): runs every step of every scene, sampling every 100 ms. It asserts that vehicles never overlap, that stopped vehicles are behind their stop/yield line, and that vehicles stay inside their lane rectangles except during declared turn moves.
- **Screenshot review:** key frames of each scene are captured and looked at before a lesson ships.
- **Unit tests** (Vitest): progress store, practice test assembly (count and sign-question rule), missed-question weighting.
- **Parent fact-check page:** lists every narration line and question beside the manual's original quote and page, for the parent to confirm the meaning was preserved.

## Deployment

- A public GitHub repo under `gotomyrepo`, deployed to GitHub Pages by a GitHub Actions workflow on push to `main`.
- A PWA manifest and service worker cache the app and all audio for offline use.
- Install on her laptop: open the site in Edge, then choose "Install this site as an app", then pin it to the taskbar.

## Out of scope

- User accounts, cloud sync, a parent dashboard, and rewards.
- Filmed video.
- Languages other than English.
- The road test (only the written permit test is covered).

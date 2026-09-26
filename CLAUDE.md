# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
A study app for the NYS learner permit written test, built for one learner (18, autistic, reads at a 1st–2nd grade level). Lessons are narrated by a pre-recorded neural voice, shown as bird's-eye cartoon scenes (she is always the blue car), and checked with read-aloud tap-to-answer questions. Deployed to GitHub Pages as an installable PWA. Design: `docs/superpowers/specs/2026-09-22-nys-permit-study-app-design.md`. Plan: `docs/superpowers/plans/2026-09-22-nys-permit-study-app.md`. Parent handoff: `docs/PARENT-GUIDE.md`.

## Commands
- `npm run dev`: dev server at http://localhost:5173/permit-study/ (also `/permit-study/review.html` for the parent fact check and `/permit-study/scene-preview.html?scene=<id>`)
- `npm test`: vitest (unit tests + the behavior check of every registered scene). Single file: `npx vitest run tests/check.test.ts`; single test: `npx vitest run -t "flags a collision"`
- `npm run check`: validate lessons (schema, manual quotes, scene/step refs) and print lesson, question and sign-question counts. Add `-- --audio` to also require every audio file
- `npm run audio`: regenerate narration (`scripts/list-audio-lines.ts` writes `content/audio-lines.json`, then `scripts/build_audio.py` writes `public/audio/<id>.mp3` + `<id>.json` word timings). Only changed lines are re-synthesized. Voice settings: `content/voice.json`; Python deps: `requirements.txt`. Reader clips go to `public/audio/reader/`, and their content hashes to `src/content/readerAudioVersions.json`
- `npm run figures`: `scripts/crop_figures.py` (PyMuPDF) crops the boxes in `content/reader/figures.yaml` from the manual PDF to `public/reader/figures/<id>.png` and copies `scene:` stills from `screenshots/`. Look at every PNG
- `npm run shots -- <scene-id>...`: screenshots to `screenshots/<id>.png` (all scenes if no ids). Always look at them after changing a scene
- `npm run e2e`: Playwright (Edge) end-to-end, `e2e/`. It starts its own Vite on port 5391
- `python -m pytest tests_py`: audio word-matching tests
- `npm run build`: `check --audio` + typecheck + build to `dist/` + `scripts/check-sw.ts` (reader audio is runtime-cached, not precached). CI (`.github/workflows/deploy.yml`) runs `npm test` and `npm run build`, then deploys on push to `main`. CI does not run e2e, so run it locally

## Architecture
- **Facts come only from the official manual.** `public/manual/mv21.pdf` is extracted to `content/manual/pages.json` (and `mv21.txt`, for grep) by `scripts/fetch_manual.py`. Every lesson card and question cites `source.page` + `source.quote` (or `source.figure` for a picture-only fact, flagged for the parent), and `src/content/validate.ts` requires the quote to appear on that page (compared as lowercase letters and digits, to survive PDF artifacts). Never add facts from outside the manual. The plan's manual page numbers are sometimes off by one: find a fact by searching `mv21.txt` for its section name or words, not by trusting a page number.
- **Lessons** are `content/lessons/*.yaml` (sorted by `order`, 12 so far), loaded by `src/content/load.ts`. How to write one: `content/AUTHORING.md` (read it before touching a lesson or scene).
- **Scenes are pure data** (`src/scenes/defs/<lesson>.ts`, registered in `src/scenes/registry.ts`): actors + ordered steps of keyframes and timed states. `frameAt()` in `engine.ts` is deterministic, which lets `ScenePlayer` (`render.ts`) draw it and `checkScene()` (`check.ts`) verify it: no overlaps, cars in lanes going their direction (except `turning` keyframes), `stopsBehind` and `entersAfter` expectations.
- **Shared scene helpers** (details and numbers in `content/AUTHORING.md`):
  - Layouts (`layouts.ts`): `fourWay`/`FOURWAY`/`stopPose`, `wideFourWay`/`WIDEFOUR`/`wideStopPose`, `twoLane`/`TWOLANE`, `sameWay`/`SAMEWAY`, `curbStreet`/`CURB`, `driveway`/`DRIVEWAY`, plus `LayoutExtras` pieces `shoulder`, `median`, added with `withExtras`.
  - Props (`layouts.ts`): `signCloseup`, `signPair`, `signProp`, `trafficLightProp`, `lampCarCloseup`, `planArrow`, `laneGlow`, `measureProp`, `fogBank`, `speedGauge`, `wheelsProp`, `stopLineAhead`, `partStates`. Distances: `feetPx`/`inchesPx`.
  - Motion (`paths.ts`): `drive`/`driveUntil`/`driveInTo`, `changeSpeed`, `laneChange`, `turnPath`/`turnMs`, `uTurnPath`/`uTurnMs`, `kf`, all at a steady `SPEED`.
  - Timed states: `set(id, state, t)` from `steps.ts`. Test helper `stateAt()` in `tests/helpers.ts`.
- **Narration ↔ animation sync:** a lesson card names a scene + step. The Learn screen starts the audio clip and the step together and unlocks Next when both finish. Caption highlighting uses `public/audio/<id>.json` word timings, whose indexes are whitespace tokens of the same text (`src/ui/caption.ts` and `build_audio.py` must split identically).
- **Audio ids** are derived in `src/content/audioLines.ts` (`audioId`, `TEXT`, `PHRASES`). Any new spoken string must be added there so `npm run audio` generates it.
- **Screens** (`src/screens/`) are async functions over a `Ctx` with an AbortSignal. The 🏠 button aborts the flow and `App.start()` (`src/app.ts`) loops back to Home.
- **Manual reader** ("📖 Listen to the manual", Chapter 4 so far): a narrated retelling of the manual. `content/reader/chNN.yaml` (chapters → sections → paragraphs, each with a `say`, a validated `source` quote and an optional `picture`: `fig-<id>`, `scene:<id>` or `none` for the section title card, which also stops the section's earlier picture carrying on). `src/reader/playlist.ts` holds all ordering, Back's 2-second rule, picture fallback and resume fallback; `src/screens/reader.ts` is the screen (a failed clip shows a note, ▶ retries it). A lesson's `readerStart` shows "📖 Learn more" on its cards and end screen (only signs, yield, lights, markings for now), which leaves via `ctx.openReader`. Clips are `public/audio/reader/<id>.mp3|json`, loaded with `?v=<hash>` and cached at runtime (CacheFirst), not precached. Parent check: `review.html#reader`. How to write: `content/AUTHORING.md` "Writing the manual reader".
- **Progress** is in localStorage (`src/progress/store.ts`). The practice test (`src/practice/assemble.ts`) follows the manual's rule (p.10): 20 questions, at least 14 correct, including 2 of the 4 sign questions. Missed questions are picked more often.
- **PWA:** `vite-plugin-pwa` with `skipWaiting: false`, so a new version only takes over after every app window is closed. The manual PDF and reader audio are not precached.

## Authoring rules the reviews keep enforcing
- Pictures change on the spoken word: time each change from the word timings in `public/audio/card-*.json`, and name that word in a comment. Digits often get no timing, so show a number before the gap where it is said.
- Anything the narration names is already on screen (and ringed with `highlight` while it is named).
- No partial rules: if a card teaches a rule, it includes the manual's conditions and exceptions, or leaves the rule out.
- Question pictures don't give away the answer.
- Changing one lesson must leave every other scene byte-identical. Dump the scene data (`ALL_SCENES` plus `frameAt` samples) to JSON before and after a shared-helper change and diff them.
- After a scene change: `npm test`, `npm run shots -- <ids>`, and look at every PNG.

## Known follow-ups
- `alcohol.ts` has its own `textW`/`word` text-sizing helpers. Folding them into `label()` in `parts.ts` would change many other scenes' SVG, so it was deferred.
- Reader Chapters 5, 6, 8, 9, 10 and 11, and their lessons' `readerStart` (see the plan's "Later milestones": `docs/superpowers/plans/2026-09-25-manual-reader.md`).

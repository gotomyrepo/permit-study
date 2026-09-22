# Writing lessons

The learner is 18, autistic, and reads at a 1st–2nd grade level. Everything is heard, then seen, then answered by tapping.

## Facts
- Every card and question needs `source.page` plus `source.quote` copied **word for word** from `content/manual/mv21.txt` (search it with grep). Punctuation, line breaks and case don't matter; the words do.
- Use `source.figure` (no quote) only when the fact appears solely in a manual picture (e.g., a sign's shape). Describe the picture: `figure: "Yield sign picture: upside-down triangle"`. These are flagged for the parent to check.
- Never add facts that aren't in the manual, even if true. Never use outside knowledge to fill a gap.
- Simplify the wording, never the meaning. Keep every number exactly (e.g., "15 feet", "0.08").

## Words (`say`, `ask`, `choices`)
- Short sentences, ideally 12 words or fewer. Common words. Talk to her: "you".
- She is always **the blue car**. Name other cars by color: "the red car".
- Write numbers as digits: "15 feet", "65 miles per hour".
- Use one idea per card, 3–5 cards per lesson.
- No double negatives. Avoid "except", "unless", and "not" in questions when a positive wording works.
- Choices: 1–8 words each. Put the meaning first: "Slow down." rather than "You should slow down."
- Each choice must sound right after "Yes!" and after "The answer is:".
- Don't refer to "this picture" unless the question's own scene shows it.

## Lesson file
- Copy `content/lessons/yield.yaml` and `src/scenes/defs/yield.ts` as your template.
- `order` must be unique across lessons. `icon` is one emoji in quotes, as in the template.
- Each card's and question's `step` must match a step id in its `scene`.
- In scenes, the learner's car has `you: true`; that is what makes it blue.

## Questions
- 3–6 per lesson. At least half should have 4 choices, like the real test. Never more than 4 (the schema rejects 5+).
- Wrong choices must be clearly wrong according to the manual, not tricky.
- `answer` counts from 0: the first choice is 0.
- `explainCard` is the card that teaches the answer; it replays when she misses. It must be a card in the same lesson.
- `signQuestion: true` for "what does this sign mean / what shape / what color" questions. The practice test needs at least 4 of these across all lessons.
- The practice test mixes questions from all lessons, so each question must make sense on its own.

## Scenes
- Reuse `fourWay()` / `stopPose()` / `FOURWAY` / `signCloseup()` from `src/scenes/layouts.ts`, and build new layouts there when a lesson needs a different road.
- Every step that shows waiting or stopping must have `expect` entries (`stopsBehind`, `entersAfter`) so the checker proves the behavior.
- Steps play while the matching card is spoken. Make each step about as long as its narration (about 350 ms per word, at least 2500 ms).
- Question steps are usually a still frame: use `at` to place cars, with a short `duration` (500 ms).
- After writing scenes, run `npm test` and `npm run shots -- <scene-id>`, then **look at every PNG**. A scene that passes the checker can still look wrong, e.g. a sign on the wrong side or a car that looks like it's in the grass.

## Strict checker rules
- Quotes: start and end on whole words (no cut-off words), and be at least 4 words or 20 letters/digits long.
- Numbers keep their `.` `,` `/` ("0.08", "1,000", "1/2") and must match a whole number in the manual: "15" does not match "150".
- Card and question ids must be unique across all lessons. Use only lowercase letters, digits and `-` (audio file names come from them, and every audio id must be unique).
- `entersAfter`: both cars must enter the zone during that same step.
- `stopsBehind` with `from` equal to `to` means the car is already stopped at that moment.
- If a check fails, fix the lesson or scene. Never loosen the checker.

## Checklist for a new lesson
1. Read the manual pages for the topic in `content/manual/mv21.txt`.
2. Write scenes in `src/scenes/defs/<lesson>.ts`, export a `<lesson>Scenes` array, and add it to `ALL` in `src/scenes/registry.ts`.
3. Write `content/lessons/<lesson>.yaml`.
4. `npm test` (scene checks) and `npm run check` (citations).
5. `npm run shots -- <each scene id>` and inspect the images.
6. `npm run audio`, then `npm run check -- --audio`.
7. Commit.

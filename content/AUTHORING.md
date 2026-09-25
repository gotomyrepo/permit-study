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
- For a card narrated over a sign close-up, pass `teachMs` to `signCloseup()` to add a `teach` still step sized to the narration. Use `signPair()` to show two signs side by side.
- `twoLane({ center })` is a straight two-way road (eastbound lane center y 170, westbound y 130; start/exit poses in `TWOLANE`). `center` is `'broken-yellow'` (default), `'solid-yellow'`, `'double-yellow'` or `'solid-and-broken'` (solid on the eastbound side). `sameWay()` is the same road with two eastbound lanes (`eb-right` y 170, `eb-left` y 130) split by a broken white line. Both also take `LayoutExtras` options (`props`, `lanes`, `zones`, `lines`), the same as `withExtras` below. For a lane change, use `laneChange(from, side, forward, t0, t1)` from `paths.ts`: a smooth S-curve at steady speed with headings that follow the path. Keep `forward` at 180 or more for a 40 px lane so the angle stays under the lane check's 20°.
- `fourWay({ crosswalks: true })` adds a crosswalk on every approach and moves the stop lines behind them; use `stopPose(dir, kind, { crosswalks: true })` to match (or `before: 'crosswalk'` to stop just before the crosswalk, checked against `FOURWAY.crosswalkLineId(dir)`). Set `FOURWAY.barId(dir)` to `hidden` to show a crosswalk with no stop line. Off by default.
- Moving cars: use `drive(from, dist, t0, { fromStop, toStop })` and `driveUntil(from, t0, t1, { fromStop })` from `paths.ts`. They keep a steady `SPEED` (45 px/s) and ease over 25 px when a car starts or stops, so nothing lurches. For a turn, `turnMs(from, to)` gives the `turnPath` time that holds that speed. To turn from a stop, first `drive` a short distance with `fromStop`, then `turnPath`.
- `withExtras(layout, extras)` is the one way to add `LayoutExtras` to any layout: `props` (`ExtraProp`: `{ id, svg }`, drawn on top of the road and under the cars; the svg needs `data-prop="<id>"`), `lanes`, `zones` and `lines` (stop lines for `stopsBehind`). `planArrow(id, from, to, color)` is a "where this car will go" arrow (it curves like `turnPath` when the headings differ). Hide it with `initialStates: { id: 'hidden' }` and show it by setting its state to `''` in the step where it's needed. List blue's arrow last so it's drawn on top.
- People walking: in crosswalk mode, add `FOURWAY.walkLane(dir)` (a lane with `heading: 'any'`) and `FOURWAY.walkZone(dir)` (for `entersAfter`) with `withExtras`. A `pedestrian` is 24 × 18 px (shoulders × depth), drawn as an orange person seen from above with a dark outline.
- `wideFourWay({ controls })` is a bigger four-way intersection with **two lanes each way**, for "which lane do you turn from?" pictures. Roads run 90–210; a double yellow center line at 150 and broken white lane lines split the 30 px lanes. Lanes are `<dir>-left` (next to the center line) and `<dir>-right` (next to the curb); centers come from `WIDEFOUR.center(dir, lane)` (nb x 165 / 195, sb 135 / 105, eb y 165 / 195, wb 135 / 105). Use `WIDEFOUR.start/exit[dir][lane]`, `wideStopPose(dir, lane)` and `WIDEFOUR.lineId(dir)` (every approach has a stop line; `controls` add a bar across both lanes and the sign or light, as in `fourWay`). It also takes `LayoutExtras`.
- `laneGlow(id, rect, color)` is a see-through glow with a thick edge (default bright yellow) over a lane, to point at "this lane" while it is named; `WIDEFOUR.laneRect(dir, lane, 'in' | 'out')` gives the lane's stretch before or after the junction. Hide it with `hidden` until it is needed.
- U-turns: `uTurnPath(from, to, t0, t1)` from `paths.ts` is two chained `turnPath` 90° turns through `uTurnApex(from, to)`, so it is round, its headings follow the path and every keyframe is `turning`. Use `uTurnMs(from, to)` for its time. `to` must face the opposite way, off to one side (a 30 px lane is too narrow for a round U: end in the far lane). `planArrow(id, from, to, color, via)` bends through `via` (e.g. `uTurnApex`) to draw a U.
- Turn signals: a car whose state includes `signal-left` or `signal-right` shows big amber lamps at that side's front and back corners (the lamps stay on and a halo blinks, so a still picture shows them). Combine with other states, e.g. `'highlight signal-left'`. Cars only.
- Speeding up, slowing down and pulling over: `changeSpeed(from, forward, t0, v0, v1, { side })` from `paths.ts` drives `forward` px while the speed changes steadily from `v0` to `v1` px/s (it takes `changeSpeedMs(forward, v0, v1)`). `v1: 0` comes to a stop; `side` adds an S-curve sideways like `laneChange` (e.g. `side: 10, forward: 50` pulls over to a stop at the right edge of a 40 px lane, staying inside it). Keep atan(1.5 × |side| / forward) under 20°.
- Emergency vehicles: an `ambulance` with state `flashing` has a big red and a big blue roof light; the lamps stay lit and only their halos blink, so a still picture shows them on.
- School buses: a `bus` is yellow-orange, 64 × 22 px. State `stop-arm` shows a big red stop arm on its left (driver's) side near the front; `flashing` lights its 4 red roof lights and `warning` its 4 yellow ones (the lamps stay lit and only their halos blink, so a still picture shows them on). A stopped bus with its red lights on is `'stop-arm flashing'`.
- Speed: `signProp(id, kind, x, y, { text, size })` in `layouts.ts` is a road sign as a prop, so a step can `highlight` it (e.g. a `speed` sign with `text: '55'`, size 60, on the grass below a `twoLane()` road, on eastbound blue's right). `fogBank(id, x0, x1)` is a see-through white fog bank from x0 to x1 (full height, under the cars) with a soft edge that reaches `FOG_EDGE_PX` (22 px) past x0; have blue finish slowing before that edge. `speedGauge(id, cx, cy, mph, { max, r, ring })` is blue's speedometer: a dial with a blue ring, unlabeled ticks, a red needle and only `mph` written in it, so no unquoted number appears. `signPair(..., { ids: [a, b] })` makes both signs props for `highlight`. Digits get no word timing, so show a number before the gap where it is said.
- `median()` is `LayoutExtras` for `twoLane()`: a grass median (y 143–157) with a yellow edge line on each side, so the road reads as a divided highway. It stays clear of both lanes' cars. Merge its `props` with your own as for `shoulder()`.
- Distances: `feetPx(ft)` and `inchesPx(in)` in `layouts.ts` turn a quoted distance into scene px (`FOOT_PX` is 2.4: a 36 px car stands for 15 feet, so 20 feet is 48 px). Use them instead of bare numbers whenever the manual quotes a distance.
- `measureProp(id, a, b, at, text, { vertical, label, reach })` is a prop: a labeled "this far" arrow (e.g. "20 feet") with a tick across each end. Horizontal by default, from (a, at) to (b, at), with `label` `'above'` (default) or `'below'`. With `vertical: true` it runs from (at, a) to (at, b), e.g. a car's side to the curb, with `label` `'right'` (default) or `'left'`. `reach: [ra, rb]` adds a dashed guide from each end to that y (horizontal) or x (vertical), tying the arrow to the two things it measures between. Ends under 20 px apart (e.g. inches to a curb) get their heads outside the ends, pointing in. Keep the label on clear ground, not over a car or line, and hide the prop until the distance is said.
- `stopLineAhead(id, pose, kind, gap)` in `layouts.ts` is an unpainted stop line `gap` px (default 2) in front of a vehicle of `kind` standing at `pose`, facing its heading. Add it with `lines` and use it in `stopsBehind` to prove a car stays stopped somewhere with no painted line (pulled over, or behind a stopped bus).
- `shoulder()` is `LayoutExtras` for `twoLane()` / `sameWay()`: a paved shoulder below the road (y 190–216, center `SHOULDER.y` 203) with a white edge line, and a zone so a vehicle parked there passes the lane check. It doesn't change the lanes. Spreading it (`twoLane({ ...shoulder() })`) only works when you pass no other `props` or `zones`: a later `props:` key replaces the shoulder's. To add your own too, merge them: `const sh = shoulder(); sameWay({ props: [...sh.props, myGlow], zones: sh.zones })`.
- `lampCarCloseup(id, vehicles, { teachMs })` is a close-up of one to three big vehicles, each with a colored roof light (`blue`, `green` or `amber`), for the manual's blue, green and amber lights. A vehicle is a color (a grey car) or `{ lamp, kind: 'tow-truck' }`. Props are `lampPropId(v)` (`lamp-car-<color>` / `lamp-truck-<color>`); `highlight` rings one.
- `driveway()` is a street (the same as `fourWay`'s horizontal road) with a parking lot and driveway below it. `DRIVEWAY.stop()` is the pose for waiting at the street's edge. `DRIVEWAY.lineId` is that edge's (unpainted) stop line, and `DRIVEWAY.zoneId` is the near lane in front of the driveway.
- Actors take `highlight` too (a yellow ring). Use it on the car or person the narration names.
- `highlight` works on stop bars and crosswalks (`FOURWAY.barId` / `FOURWAY.crosswalkId`) as a white glow. Don't highlight yellow lines: the white glow makes them look white.
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

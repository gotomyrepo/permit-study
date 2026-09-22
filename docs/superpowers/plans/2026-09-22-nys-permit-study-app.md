# NYS Permit Study App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, installable web app that teaches the NYS learner-permit material to a learner who reads at a 1st–2nd grade level. It uses pre-recorded natural narration, bird's-eye cartoon animations synced to that narration, and read-aloud tap-to-answer questions. Every fact is cited to the official MV-21 manual.

**Architecture:**
- **Content:** lesson YAML files reference scenes by id. Each fact carries a page and quote, and a checker verifies each quote against the extracted manual text.
- **Scenes:** pure data (actors plus keyframed steps). A deterministic `frameAt()` engine drives both the SVG renderer and an automated checker for collisions, lanes, stop lines, and right-of-way order.
- **Audio:** narration is pre-generated with `edge-tts` into mp3 files plus word timings, which drive caption highlighting.
- **UI:** vanilla TypeScript screens run as async flows with AbortSignal cancellation.
- **Hosting:** GitHub Pages, as a PWA.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright (Edge channel), zod, yaml, vite-plugin-pwa, Python 3 (pypdf, edge-tts, pytest), GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-09-22-nys-permit-study-app-design.md`

---

## Key facts already verified (2026-09-22)

- Manual PDF: `https://dmv.ny.gov/brochure/mv21.pdf` (84 pages). The printed page numbers match the PDF page numbers.
- Test rule, from manual page 10: *"To pass the written test, you must correctly answer at least 14 of the 20 questions asked, but you must correctly answer two of the four questions about road signs."*
- Yield sign text is on page 29. Extracted text contains line-break hyphens (`intersec-\ntion`) and split letters (`Y ou`), so quote matching must normalize to lowercase alphanumerics only.
- `edge-tts` 7.x: `Communicate(text, voice, rate=..., boundary="WordBoundary")`. `stream()` yields `{"type":"audio","data":bytes}` and `{"type":"WordBoundary","offset":ticks,"duration":ticks,"text":word}` (1 tick = 100 ns, so ms = ticks // 10000).
- Installed on the machine: Python 3.14, Node 24, npm 11, git, and gh (logged in as `gotomyrepo`).

## File map

```
package.json, tsconfig.json, vite.config.ts, playwright.config.ts, requirements.txt, .gitignore
index.html                      app entry
review.html                     parent fact-check page
scene-preview.html              dev page: every step of a scene at 5 time points
public/manual/mv21.pdf          official manual (served so the review page can link to pages)
public/audio/                   generated <id>.mp3 + <id>.json + manifest.json
public/icon.svg, icon-192.png, icon-512.png
content/manual/pages.json       [{page, text}] extracted manual text
content/manual/mv21.txt         same text with "=== PAGE n ===" markers, for grep
content/lessons/*.yaml          one lesson per file
content/voice.json              {"voice": "...", "rate": "-10%"}
content/audio-lines.json        generated list of {id, text} to synthesize
content/AUTHORING.md            rules for writing lessons (Task 6)
scripts/fetch_manual.py         download + extract manual
scripts/build_audio.py          synthesize audio-lines.json → public/audio
scripts/voice_samples.py        4 voice samples for the parent to choose
scripts/lib.ts                  read lessons/pages from disk (node)
scripts/check-content.ts        validate lessons (+ --audio: audio files exist)
scripts/list-audio-lines.ts     write content/audio-lines.json
scripts/screenshot-scenes.ts    render scene-preview pages to screenshots/<id>.png
scripts/make-icons.ts           render public/icon.svg to PNGs
src/scenes/types.ts             scene data types
src/scenes/geometry.ts          vectors, oriented boxes, overlap
src/scenes/engine.ts            SIZES, frameAt()
src/scenes/paths.ts             kf(), turnPath()
src/scenes/check.ts             checkScene() → violations
src/scenes/parts.ts             SVG string builders: road, lines, signs, lights, labels
src/scenes/vehicles.ts          vehicleSvg()
src/scenes/layouts.ts           fourWay(), FOURWAY, stopPose(), signCloseup()
src/scenes/render.ts            ScenePlayer (DOM)
src/scenes/registry.ts          SCENES, getScene, stepIndexOf, sceneIndex
src/scenes/defs/*.ts            one file per lesson's scenes
src/content/types.ts            zod schemas + types
src/content/normalize.ts        normalizeForMatch()
src/content/validate.ts         validateLessons()
src/content/audioLines.ts       PHRASES, TEXT, audioId, audioLines()
src/content/load.ts             browser lesson loading (import.meta.glob)
src/progress/store.ts           ProgressStore, safeStorage
src/practice/assemble.ts        assembleTest(), scoreTest()
src/audio/player.ts             AudioPlayer
src/ui/dom.ts                   h(), clicked(), chooseOne(), delay(), childController(), isAbort()
src/ui/caption.ts               Caption (word highlighting)
src/screens/ctx.ts              Ctx, speak(), topBar()
src/screens/home.ts, learn.ts, question.ts, lessonEnd.ts, practice.ts, results.ts
src/app.ts, src/main.ts, src/styles.css
src/review/main.ts, src/preview/main.ts
tests/*.test.ts                 vitest (node)
tests_py/test_build_audio.py    pytest
e2e/*.spec.ts                   playwright
.github/workflows/deploy.yml
CLAUDE.md
```

---

### Task 0: Project scaffold

**Goal:** Set up a working Vite + TypeScript + Vitest project with a trivial passing test.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/styles.css`, `requirements.txt`, `tests/smoke.test.ts`
- Modify: `.gitignore`

**Acceptance Criteria:**
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run dev` serves a page at `http://localhost:5173/permit-study/`
- [ ] Python deps installed

**Verify:** `npm test` → `1 passed`

**Steps:**

- [ ] **Step 1: Create package.json and install**

```json
{
  "name": "permit-study",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsx scripts/check-content.ts --audio && tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "check": "tsx scripts/check-content.ts",
    "audio": "tsx scripts/list-audio-lines.ts && python scripts/build_audio.py",
    "shots": "tsx scripts/screenshot-scenes.ts",
    "e2e": "playwright test"
  }
}
```

Run:
```bash
npm i -D vite typescript vitest tsx yaml zod vite-plugin-pwa @playwright/test @types/node
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "scripts", "tests", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 3: vite.config.ts** (PWA is added in Task 10)

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: '/permit-study/',
  build: {
    rollupOptions: {
      input: { main: r('./index.html') },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 4: index.html, src/main.ts, src/styles.css**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Permit Practice</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts` (temporary; replaced in Task 8):
```ts
import './styles.css';
document.getElementById('app')!.textContent = 'Permit Practice';
```

`src/styles.css` (temporary; replaced in Task 8):
```css
body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #fdfaf3; }
```

- [ ] **Step 5: Smoke test**

`tests/smoke.test.ts`:
```ts
import { test, expect } from 'vitest';
test('toolchain works', () => expect(1 + 1).toBe(2));
```

- [ ] **Step 6: Python requirements and .gitignore**

`requirements.txt`:
```
pypdf>=6
edge-tts>=7.2
pytest>=8
```

Run: `python -m pip install -r requirements.txt`

Replace `.gitignore` with:
```
.superpowers/
node_modules/
dist/
__pycache__/
screenshots/
voice-samples/
test-results/
playwright-report/
```

- [ ] **Step 7: Verify and commit**

Run: `npm test` → 1 passed. Run: `npx tsc --noEmit` → no output.

```bash
git add -A
git commit -m "chore: scaffold vite + typescript + vitest project"
```

---

### Task 1: Download and extract the official manual

**Goal:** Save the MV-21 PDF and its per-page text in the repo. This is the only fact source.

**Files:**
- Create: `scripts/fetch_manual.py`, `public/manual/mv21.pdf`, `content/manual/pages.json`, `content/manual/mv21.txt`

**Acceptance Criteria:**
- [ ] `pages.json` has 84 entries
- [ ] Page 10 text contains "at least 14 of the 20"

**Verify:** `python -c "import json,re;p=json.load(open('content/manual/pages.json',encoding='utf-8'));print(len(p), 'at least 14 of the 20' in re.sub(r'\s+',' ',p[9]['text']))"` → `84 True`

Note: pypdf's exact whitespace/line-break placement in extracted text varies by version, so the verify command collapses all whitespace before the substring check rather than only replacing newlines.

**Steps:**

- [ ] **Step 1: Write scripts/fetch_manual.py**

```python
"""Download the official NYS Driver's Manual (MV-21) and extract per-page text."""
import json
import pathlib
import urllib.request

from pypdf import PdfReader

URL = "https://dmv.ny.gov/brochure/mv21.pdf"
ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF = ROOT / "public" / "manual" / "mv21.pdf"
OUT = ROOT / "content" / "manual"


def main() -> None:
    PDF.parent.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    if not data.startswith(b"%PDF"):
        raise SystemExit("Download is not a PDF")
    PDF.write_bytes(data)
    reader = PdfReader(str(PDF))
    pages = [{"page": i + 1, "text": p.extract_text() or ""} for i, p in enumerate(reader.pages)]
    (OUT / "pages.json").write_text(json.dumps(pages, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "mv21.txt").write_text(
        "\n".join(f"=== PAGE {p['page']} ===\n{p['text']}" for p in pages), encoding="utf-8"
    )
    print(f"Saved {len(pages)} pages")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `python scripts/fetch_manual.py` → `Saved 84 pages`

- [ ] **Step 3: Verify** with the Verify command above → `84 True`

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch_manual.py public/manual content/manual
git commit -m "feat: add official MV-21 manual and extracted page text"
```

---

### Task 2: Scene engine core (pure, no DOM)

**Goal:** Build the scene data types, the deterministic `frameAt()`, path helpers, and `checkScene()`, which catches collisions, wrong-lane driving, running stop/yield lines, and wrong right-of-way order.

**Files:**
- Create: `src/scenes/types.ts`, `src/scenes/geometry.ts`, `src/scenes/engine.ts`, `src/scenes/paths.ts`, `src/scenes/check.ts`
- Test: `tests/geometry.test.ts`, `tests/engine.test.ts`, `tests/check.test.ts`

**Acceptance Criteria:**
- [ ] `frameAt` interpolates keyframes with easing, carries poses across steps, applies `at` overrides and timed states
- [ ] `checkScene` reports: vehicle overlap, out-of-lane or wrong-direction, front past a stop line or moving during `stopsBehind`, `entersAfter` violations, structural errors (unknown actor/prop/line/zone, bad keyframe times, duplicate step ids)
- [ ] A correct yield scenario returns `[]`

**Verify:** `npx vitest run tests/geometry.test.ts tests/engine.test.ts tests/check.test.ts` → all pass

**Steps:**

- [ ] **Step 1: types.ts**

```ts
export type Ease = 'linear' | 'in' | 'out' | 'inOut';

/** heading in degrees: 0 = up (north), 90 = right (east), clockwise. */
export interface Pose { x: number; y: number; heading: number }
export interface Keyframe extends Pose { t: number; ease?: Ease; turning?: boolean }

export type ActorKind = 'car' | 'bus' | 'ambulance' | 'truck' | 'bike' | 'pedestrian';
export interface ActorDef { id: string; kind: ActorKind; color?: string; you?: boolean; start: Pose }

export interface Lane { id: string; x: number; y: number; w: number; h: number; heading: number | 'any' }
export interface Zone { id: string; x: number; y: number; w: number; h: number }
/** A vehicle travelling in `heading` must keep its front on the near side of (x, y). */
export interface StopLine { id: string; x: number; y: number; heading: number }
export interface StateSet { t: number; id: string; state: string }

export type Expectation =
  | { type: 'stopsBehind'; actor: string; line: string; from: number; to: number }
  | { type: 'entersAfter'; actor: string; other: string; zone: string };

export interface StepDef {
  id: string;
  duration: number;
  /** Poses that replace the carried-over poses at the start of this step. */
  at?: Record<string, Pose>;
  tracks?: Record<string, Keyframe[]>;
  states?: StateSet[];
  expect?: Expectation[];
}

export interface SceneDef {
  id: string;
  width: number;
  height: number;
  background: string;
  lanes: Lane[];
  zones: Zone[];
  lines: StopLine[];
  props: string[];
  actors: ActorDef[];
  initialStates?: Record<string, string>;
  steps: StepDef[];
}

export type FramePose = Pose & { turning: boolean };
export interface Frame { poses: Record<string, FramePose>; states: Record<string, string> }
```

- [ ] **Step 2: Write failing geometry tests** (`tests/geometry.test.ts`)

```ts
import { describe, test, expect } from 'vitest';
import { angleDiff, corners, dir, front, obbOverlap, rectContains } from '../src/scenes/geometry';

describe('geometry', () => {
  test('dir: heading 0 is up, 90 is right', () => {
    expect(dir(0).x).toBeCloseTo(0); expect(dir(0).y).toBeCloseTo(-1);
    expect(dir(90).x).toBeCloseTo(1); expect(dir(90).y).toBeCloseTo(0);
  });
  test('front of a north-facing car is above its center', () => {
    const f = front({ x: 100, y: 100, heading: 0 }, 36);
    expect(f.x).toBeCloseTo(100); expect(f.y).toBeCloseTo(82);
  });
  test('cars in adjacent lanes do not overlap', () => {
    const a = corners({ x: 135, y: 100, heading: 0 }, 36, 18);
    const b = corners({ x: 165, y: 100, heading: 0 }, 36, 18);
    expect(obbOverlap(a, b)).toBe(false);
  });
  test('crossing cars at the same point overlap', () => {
    const a = corners({ x: 150, y: 150, heading: 0 }, 36, 18);
    const b = corners({ x: 150, y: 150, heading: 90 }, 36, 18);
    expect(obbOverlap(a, b)).toBe(true);
  });
  test('angleDiff wraps around 360', () => {
    expect(angleDiff(350, 10)).toBeCloseTo(20);
    expect(angleDiff(0, 180)).toBeCloseTo(180);
  });
  test('rectContains', () => {
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5 })).toBe(true);
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 5 })).toBe(false);
  });
});
```

Run: `npx vitest run tests/geometry.test.ts` → FAIL (module not found)

- [ ] **Step 3: geometry.ts**

```ts
import type { Pose } from './types';

export interface Vec { x: number; y: number }
export interface RectLike { x: number; y: number; w: number; h: number }

export function dir(heading: number): Vec {
  const r = (heading * Math.PI) / 180;
  return { x: Math.sin(r), y: -Math.cos(r) };
}

export function normHeading(h: number): number {
  return ((h % 360) + 360) % 360;
}

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normHeading(a) - normHeading(b));
  return d > 180 ? 360 - d : d;
}

export function front(p: Pose, length: number): Vec {
  const d = dir(p.heading);
  return { x: p.x + d.x * (length / 2), y: p.y + d.y * (length / 2) };
}

export function corners(p: Pose, length: number, width: number): Vec[] {
  const f = dir(p.heading);
  const r = { x: -f.y, y: f.x }; // right-hand side
  const hl = length / 2, hw = width / 2;
  return [
    [hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw],
  ].map(([a, b]) => ({ x: p.x + f.x * a + r.x * b, y: p.y + f.y * a + r.y * b }));
}

export function rectCorners(r: RectLike): Vec[] {
  return [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
  ];
}

function project(poly: Vec[], nx: number, ny: number): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const p of poly) { const v = p.x * nx + p.y * ny; if (v < min) min = v; if (v > max) max = v; }
  return [min, max];
}

/** Separating-axis test for two convex quads. Touching edges do not count as overlap. */
export function obbOverlap(a: Vec[], b: Vec[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const nx = p2.y - p1.y, ny = p1.x - p2.x;
      const [amin, amax] = project(a, nx, ny);
      const [bmin, bmax] = project(b, nx, ny);
      if (amax <= bmin || bmax <= amin) return false;
    }
  }
  return true;
}

export function rectContains(r: RectLike, v: Vec): boolean {
  return v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
}
```

Run: `npx vitest run tests/geometry.test.ts` → PASS

- [ ] **Step 4: Write failing engine tests** (`tests/engine.test.ts`)

```ts
import { describe, test, expect } from 'vitest';
import { frameAt } from '../src/scenes/engine';
import { kf, turnPath } from '../src/scenes/paths';
import type { SceneDef } from '../src/scenes/types';

const scene: SceneDef = {
  id: 't', width: 300, height: 300, background: '', lanes: [], zones: [], lines: [], props: [],
  actors: [{ id: 'a', kind: 'car', start: { x: 0, y: 100, heading: 0 } }],
  steps: [
    { id: 'move', duration: 1000, tracks: { a: [{ t: 1000, x: 0, y: 0, heading: 0 }] } },
    { id: 'hold', duration: 500 },
    { id: 'jump', duration: 500, at: { a: { x: 50, y: 50, heading: 90 } }, states: [{ t: 250, id: 'a', state: 'hidden' }] },
    { id: 'spin', duration: 1000, tracks: { a: [{ t: 1000, x: 50, y: 50, heading: 10 }] }, at: { a: { x: 50, y: 50, heading: 350 } } },
    { id: 'eased', duration: 1000, at: { a: { x: 0, y: 0, heading: 90 } }, tracks: { a: [{ t: 1000, x: 100, y: 0, heading: 90, ease: 'out' }] } },
  ],
};

describe('frameAt', () => {
  test('interpolates linearly within a step', () => {
    expect(frameAt(scene, 0, 500).poses.a.y).toBeCloseTo(50);
  });
  test('carries the end pose into the next step', () => {
    expect(frameAt(scene, 1, 0).poses.a.y).toBeCloseTo(0);
  });
  test('holds the last keyframe after it ends', () => {
    expect(frameAt(scene, 1, 400).poses.a.y).toBeCloseTo(0);
  });
  test('`at` overrides the starting pose', () => {
    const p = frameAt(scene, 2, 0).poses.a;
    expect(p.x).toBe(50); expect(p.heading).toBe(90);
  });
  test('timed states apply once their time is reached', () => {
    expect(frameAt(scene, 2, 100).states.a).toBeUndefined();
    expect(frameAt(scene, 2, 300).states.a).toBe('hidden');
  });
  test('states carry into later steps', () => {
    expect(frameAt(scene, 3, 0).states.a).toBe('hidden');
  });
  test('heading takes the short way around', () => {
    expect(frameAt(scene, 3, 500).poses.a.heading).toBeCloseTo(0);
  });
  test('ease out is past halfway at the midpoint', () => {
    expect(frameAt(scene, 4, 500).poses.a.x).toBeGreaterThan(50);
  });
  test('clamps t to the step duration', () => {
    expect(frameAt(scene, 0, 5000).poses.a.y).toBeCloseTo(0);
  });
});

describe('paths', () => {
  test('kf builds a keyframe from a pose', () => {
    expect(kf({ x: 1, y: 2, heading: 90 }, 500, 'in')).toEqual({ x: 1, y: 2, heading: 90, t: 500, ease: 'in' });
  });
  test('turnPath ends exactly at the target pose, marked turning', () => {
    const k = turnPath({ x: 165, y: 210, heading: 0 }, { x: 100, y: 135, heading: 270 }, 1000, 3000, 8);
    expect(k).toHaveLength(8);
    const last = k[k.length - 1];
    expect(last).toMatchObject({ x: 100, y: 135, heading: 270, t: 3000 });
    expect(k.every((f) => f.turning)).toBe(true);
    for (let i = 1; i < k.length; i++) expect(k[i].t).toBeGreaterThan(k[i - 1].t);
  });
});
```

Run: `npx vitest run tests/engine.test.ts` → FAIL

- [ ] **Step 5: engine.ts**

```ts
import type { ActorKind, Ease, Frame, FramePose, Keyframe, Pose, SceneDef, StepDef } from './types';
import { normHeading } from './geometry';

export const SIZES: Record<ActorKind, { length: number; width: number }> = {
  car: { length: 36, width: 18 },
  bus: { length: 64, width: 22 },
  ambulance: { length: 40, width: 20 },
  truck: { length: 60, width: 22 },
  bike: { length: 16, width: 6 },
  pedestrian: { length: 8, width: 8 },
};

function ease(e: Ease | undefined, u: number): number {
  switch (e) {
    case 'in': return u * u;
    case 'out': return 1 - (1 - u) * (1 - u);
    case 'inOut': return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    default: return u;
  }
}

function lerpAngle(a: number, b: number, u: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return normHeading(a + d * u);
}

function trackPose(start: Pose, kfs: Keyframe[] | undefined, t: number): FramePose {
  if (!kfs || kfs.length === 0) return { ...start, turning: false };
  let prev: Pose = start;
  let prevT = 0;
  for (const k of kfs) {
    if (t <= k.t) {
      const span = k.t - prevT;
      const u = span <= 0 ? 1 : ease(k.ease, (t - prevT) / span);
      return {
        x: prev.x + (k.x - prev.x) * u,
        y: prev.y + (k.y - prev.y) * u,
        heading: lerpAngle(prev.heading, k.heading, u),
        turning: !!k.turning && t > prevT,
      };
    }
    prev = k;
    prevT = k.t;
  }
  return { x: prev.x, y: prev.y, heading: normHeading(prev.heading), turning: false };
}

function evalStep(step: StepDef, base: Record<string, Pose>, baseStates: Record<string, string>, t: number): Frame {
  const start: Record<string, Pose> = { ...base, ...(step.at ?? {}) };
  const poses: Record<string, FramePose> = {};
  for (const [id, p] of Object.entries(start)) poses[id] = trackPose(p, step.tracks?.[id], t);
  const states = { ...baseStates };
  const sets = [...(step.states ?? [])].sort((a, b) => a.t - b.t);
  for (const s of sets) if (s.t <= t) states[s.id] = s.state;
  return { poses, states };
}

export function frameAt(scene: SceneDef, stepIndex: number, t: number): Frame {
  let poses: Record<string, Pose> = Object.fromEntries(scene.actors.map((a) => [a.id, { ...a.start }]));
  let states: Record<string, string> = { ...(scene.initialStates ?? {}) };
  for (let i = 0; i < stepIndex; i++) {
    const f = evalStep(scene.steps[i], poses, states, scene.steps[i].duration);
    poses = Object.fromEntries(Object.entries(f.poses).map(([id, p]) => [id, { x: p.x, y: p.y, heading: p.heading }]));
    states = f.states;
  }
  const step = scene.steps[stepIndex];
  return evalStep(step, poses, states, Math.max(0, Math.min(t, step.duration)));
}
```

- [ ] **Step 6: paths.ts**

```ts
import type { Ease, Keyframe, Pose } from './types';
import { dir, normHeading } from './geometry';

export function kf(p: Pose, t: number, ease?: Ease): Keyframe {
  return ease ? { x: p.x, y: p.y, heading: p.heading, t, ease } : { x: p.x, y: p.y, heading: p.heading, t };
}

/** Smooth turn along a quadratic Bézier from `from` to `to`, arriving at t1. Starts at t0 (the previous keyframe time). */
export function turnPath(from: Pose, to: Pose, t0: number, t1: number, n = 8): Keyframe[] {
  const d1 = dir(from.heading), d2 = dir(to.heading);
  const det = d1.x * d2.y - d1.y * d2.x;
  const rx = to.x - from.x, ry = to.y - from.y;
  let cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2;
  if (Math.abs(det) > 1e-6) {
    const s = (rx * d2.y - ry * d2.x) / det;
    cx = from.x + s * d1.x;
    cy = from.y + s * d1.y;
  }
  const out: Keyframe[] = [];
  for (let k = 1; k <= n; k++) {
    const u = k / n;
    const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * cx + u * u * to.x;
    const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * cy + u * u * to.y;
    const dx = 2 * (1 - u) * (cx - from.x) + 2 * u * (to.x - cx);
    const dy = 2 * (1 - u) * (cy - from.y) + 2 * u * (to.y - cy);
    const heading = k === n ? to.heading : normHeading((Math.atan2(dx, -dy) * 180) / Math.PI);
    out.push({ t: t0 + (t1 - t0) * u, x: k === n ? to.x : x, y: k === n ? to.y : y, heading, turning: true });
  }
  return out;
}
```

Run: `npx vitest run tests/engine.test.ts` → PASS

- [ ] **Step 7: Write failing checker tests** (`tests/check.test.ts`)

```ts
import { describe, test, expect } from 'vitest';
import { checkScene } from '../src/scenes/check';
import type { SceneDef } from '../src/scenes/types';

const base = (): Omit<SceneDef, 'actors' | 'steps'> => ({
  id: 'x', width: 300, height: 300, background: '', props: [],
  lanes: [
    { id: 'nb', x: 150, y: -100, w: 30, h: 500, heading: 0 },
    { id: 'sb', x: 120, y: -100, w: 30, h: 500, heading: 180 },
    { id: 'eb', x: -100, y: 150, w: 500, h: 30, heading: 90 },
  ],
  zones: [{ id: 'junction', x: 120, y: 120, w: 60, h: 60 }],
  lines: [{ id: 'line-nb', x: 165, y: 188, heading: 0 }],
});

const blue = { id: 'blue', kind: 'car' as const, you: true, start: { x: 165, y: 340, heading: 0 } };
const red = { id: 'red', kind: 'car' as const, start: { x: -40, y: 165, heading: 90 } };

describe('checkScene', () => {
  test('correct yield: blue stops, red passes, blue goes', () => {
    const s: SceneDef = { ...base(), actors: [blue, red], steps: [
      { id: 'approach', duration: 3000, tracks: { blue: [{ t: 3000, x: 165, y: 210, heading: 0, ease: 'out' }] } },
      { id: 'wait-then-go', duration: 7000,
        tracks: { red: [{ t: 3500, x: 340, y: 165, heading: 90 }],
                  blue: [{ t: 4500, x: 165, y: 210, heading: 0 }, { t: 7000, x: 165, y: -40, heading: 0, ease: 'in' }] },
        expect: [
          { type: 'stopsBehind', actor: 'blue', line: 'line-nb', from: 0, to: 4500 },
          { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
        ] },
    ] };
    expect(checkScene(s)).toEqual([]);
  });

  test('flags a collision', () => {
    const s: SceneDef = { ...base(), actors: [blue, red], steps: [
      { id: 'crash', duration: 2000, tracks: {
        blue: [{ t: 2000, x: 165, y: -40, heading: 0 }],
        red: [{ t: 2000, x: 340, y: 165, heading: 90 }] } },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('overlap'))).toBe(true);
  });

  test('flags stopping past the line', () => {
    const s: SceneDef = { ...base(), actors: [blue], steps: [
      { id: 'overshoot', duration: 2000, tracks: { blue: [{ t: 1000, x: 165, y: 195, heading: 0 }] },
        expect: [{ type: 'stopsBehind', actor: 'blue', line: 'line-nb', from: 1000, to: 2000 }] },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('past line'))).toBe(true);
  });

  test('flags moving when it should be stopped', () => {
    const s: SceneDef = { ...base(), actors: [blue], steps: [
      { id: 'rolling', duration: 2000, tracks: { blue: [{ t: 2000, x: 165, y: 220, heading: 0 }] },
        expect: [{ type: 'stopsBehind', actor: 'blue', line: 'line-nb', from: 0, to: 1000 }] },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('moving'))).toBe(true);
  });

  test('flags driving the wrong way in a lane', () => {
    const s: SceneDef = { ...base(), actors: [{ ...blue, start: { x: 135, y: 340, heading: 0 } }], steps: [
      { id: 'wrong-way', duration: 1000, tracks: { blue: [{ t: 1000, x: 135, y: 250, heading: 0 }] } },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('lane'))).toBe(true);
  });

  test('flags entering the junction before the other car has left', () => {
    const s: SceneDef = { ...base(), actors: [blue, red], steps: [
      { id: 'cut-off', duration: 4000,
        tracks: { blue: [{ t: 4000, x: 165, y: -40, heading: 0 }], red: [{ t: 1000, x: 60, y: 165, heading: 90 }, { t: 4000, x: 340, y: 165, heading: 90 }] },
        expect: [{ type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' }] },
    ] };
    expect(checkScene(s).some((v) => v.message.includes('entered'))).toBe(true);
  });

  test('flags structural errors', () => {
    const s: SceneDef = { ...base(), actors: [blue], steps: [
      { id: 'a', duration: 1000, tracks: { ghost: [{ t: 500, x: 0, y: 0, heading: 0 }] } },
      { id: 'a', duration: 1000, tracks: { blue: [{ t: 2000, x: 165, y: 300, heading: 0 }] }, states: [{ t: 0, id: 'nope', state: 'x' }] },
    ] };
    const msgs = checkScene(s).map((v) => v.message).join('\n');
    expect(msgs).toContain('unknown actor "ghost"');
    expect(msgs).toContain('duplicate step id "a"');
    expect(msgs).toContain('keyframe time');
    expect(msgs).toContain('unknown state target "nope"');
  });
});
```

Run: `npx vitest run tests/check.test.ts` → FAIL

- [ ] **Step 8: check.ts**

```ts
import type { SceneDef } from './types';
import { frameAt, SIZES } from './engine';
import { angleDiff, corners, dir, front, obbOverlap, rectContains, rectCorners } from './geometry';

export interface Violation { scene: string; step: string; t: number; message: string }

const LANE_TOLERANCE_DEG = 20;
const STILL_PX = 0.5;
const DT = 50;

export function checkScene(scene: SceneDef, dt = DT): Violation[] {
  const out: Violation[] = [];
  const add = (step: string, t: number, message: string) => out.push({ scene: scene.id, step, t, message });
  const actors = new Map(scene.actors.map((a) => [a.id, a]));
  const lines = new Map(scene.lines.map((l) => [l.id, l]));
  const zones = new Map(scene.zones.map((z) => [z.id, z]));
  const stateTargets = new Set([...actors.keys(), ...scene.props]);

  // Structure
  const seen = new Set<string>();
  for (const step of scene.steps) {
    if (seen.has(step.id)) add(step.id, 0, `duplicate step id "${step.id}"`);
    seen.add(step.id);
    for (const [id, kfs] of Object.entries(step.tracks ?? {})) {
      if (!actors.has(id)) add(step.id, 0, `unknown actor "${id}" in tracks`);
      let prev = 0;
      for (const k of kfs) {
        if (k.t <= prev && !(prev === 0 && k.t === 0) || k.t > step.duration) add(step.id, k.t, `bad keyframe time ${k.t} for "${id}" (must increase and be ≤ ${step.duration})`);
        prev = k.t;
      }
    }
    for (const id of Object.keys(step.at ?? {})) if (!actors.has(id)) add(step.id, 0, `unknown actor "${id}" in at`);
    for (const s of step.states ?? []) if (!stateTargets.has(s.id)) add(step.id, s.t, `unknown state target "${s.id}"`);
    for (const e of step.expect ?? []) {
      if (!actors.has(e.actor)) add(step.id, 0, `unknown actor "${e.actor}" in expectation`);
      if (e.type === 'stopsBehind' && !lines.has(e.line)) add(step.id, 0, `unknown line "${e.line}"`);
      if (e.type === 'entersAfter' && (!zones.has(e.zone) || !actors.has(e.other))) add(step.id, 0, `unknown zone/actor in entersAfter`);
    }
  }
  if (out.length) return out;

  const isHidden = (states: Record<string, string>, id: string) => (states[id] ?? '').split(/\s+/).includes('hidden');

  scene.steps.forEach((step, si) => {
    const times: number[] = [];
    for (let t = 0; t < step.duration; t += dt) times.push(t);
    times.push(step.duration);

    const firstIn = new Map<string, number>();
    const lastIn = new Map<string, number>();

    for (const t of times) {
      const f = frameAt(scene, si, t);
      const visible = scene.actors.filter((a) => !isHidden(f.states, a.id));
      const boxes = new Map(visible.map((a) => [a.id, corners(f.poses[a.id], SIZES[a.kind].length, SIZES[a.kind].width)]));

      for (let i = 0; i < visible.length; i++)
        for (let j = i + 1; j < visible.length; j++)
          if (obbOverlap(boxes.get(visible[i].id)!, boxes.get(visible[j].id)!))
            add(step.id, t, `overlap: "${visible[i].id}" and "${visible[j].id}"`);

      for (const a of visible) {
        const p = f.poses[a.id];
        if (p.turning) continue;
        const ok = scene.zones.some((z) => rectContains(z, p)) ||
          scene.lanes.some((l) => rectContains(l, p) && (l.heading === 'any' || angleDiff(l.heading, p.heading) <= LANE_TOLERANCE_DEG));
        if (!ok) add(step.id, t, `"${a.id}" is not in a lane going its direction (x=${p.x.toFixed(0)}, y=${p.y.toFixed(0)}, heading=${p.heading.toFixed(0)})`);
      }

      for (const e of step.expect ?? []) {
        if (e.type !== 'entersAfter') continue;
        const z = zones.get(e.zone)!;
        for (const id of [e.actor, e.other]) {
          const box = boxes.get(id);
          if (box && obbOverlap(box, rectCorners(z))) {
            if (!firstIn.has(id)) firstIn.set(id, t);
            lastIn.set(id, t);
          }
        }
      }

      for (const e of step.expect ?? []) {
        if (e.type !== 'stopsBehind' || t < e.from || t > e.to) continue;
        const a = actors.get(e.actor)!;
        const p = f.poses[a.id];
        const line = lines.get(e.line)!;
        const fr = front(p, SIZES[a.kind].length);
        const d = dir(line.heading);
        if ((fr.x - line.x) * d.x + (fr.y - line.y) * d.y > 0) add(step.id, t, `"${a.id}" is past line "${line.id}"`);
        const later = frameAt(scene, si, Math.min(t + dt, step.duration)).poses[a.id];
        if (Math.hypot(later.x - p.x, later.y - p.y) > STILL_PX) add(step.id, t, `"${a.id}" is moving but should be stopped behind "${line.id}"`);
      }
    }

    for (const e of step.expect ?? []) {
      if (e.type !== 'entersAfter') continue;
      const enter = firstIn.get(e.actor);
      const otherLast = lastIn.get(e.other);
      if (enter !== undefined && otherLast !== undefined && enter <= otherLast)
        add(step.id, enter, `"${e.actor}" entered "${e.zone}" at ${enter}ms while "${e.other}" was still there until ${otherLast}ms`);
    }
  });
  return out;
}
```

Run: `npx vitest run tests/check.test.ts` → PASS. If "correct yield" fails, print the violations and fix the checker rather than the test data. The test data was hand-verified: red leaves the junction at about 2.2 s and blue enters after 4.5 s.

- [ ] **Step 9: Commit**

```bash
git add src/scenes tests/geometry.test.ts tests/engine.test.ts tests/check.test.ts
git commit -m "feat: deterministic scene engine with automated behavior checker"
```

---

### Task 3: Scene rendering, standard layouts, first scene (yield)

**Goal:** Build the SVG parts library, vehicles, the four-way intersection layout, `ScenePlayer`, the scene registry, and a preview page with a screenshot script. The first real scene is `yield-intersection`, plus a `sign-yield` close-up.

**Files:**
- Create: `src/scenes/parts.ts`, `src/scenes/vehicles.ts`, `src/scenes/layouts.ts`, `src/scenes/render.ts`, `src/scenes/registry.ts`, `src/scenes/defs/yield.ts`, `src/ui/dom.ts`, `src/preview/main.ts`, `scene-preview.html`, `scripts/screenshot-scenes.ts`
- Modify: `vite.config.ts` (add preview input), `src/styles.css` (scene styles)
- Test: `tests/scenes.test.ts`

**Acceptance Criteria:**
- [ ] `tests/scenes.test.ts` runs `checkScene` on every registered scene and passes
- [ ] `npm run shots -- yield-intersection` writes `screenshots/yield-intersection.png`
- [ ] Visual check of that screenshot: blue waits behind the white triangles, red passes in its own lane, blue exits north, and the yield sign sits on the grass to the right of blue's lane

**Verify:** `npx vitest run tests/scenes.test.ts` → PASS, then `npm run shots -- yield-intersection sign-yield` and look at both PNGs with the Read tool.

**Steps:**

- [ ] **Step 1: src/ui/dom.ts** (shared by the preview, review, and app)

```ts
type Child = Node | string;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string | undefined> = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

export function clicked(el: HTMLElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onClick = () => { cleanup(); resolve(); };
    const onAbort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => { el.removeEventListener('click', onClick); signal.removeEventListener('abort', onAbort); };
    el.addEventListener('click', onClick);
    signal.addEventListener('abort', onAbort);
  });
}

export function chooseOne(els: HTMLElement[], signal: AbortSignal): Promise<number> {
  return Promise.race(els.map((el, i) => clicked(el, signal).then(() => i)));
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const id = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(id); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function childController(parent: AbortSignal): AbortController {
  const c = new AbortController();
  if (parent.aborted) c.abort(parent.reason);
  else parent.addEventListener('abort', () => c.abort(parent.reason), { once: true });
  return c;
}
```

Note: the losing `clicked()` promises in `chooseOne` keep their listeners until the screen is replaced. That's fine because every screen replaces `root`'s children.

- [ ] **Step 2: parts.ts**

```ts
const n = (v: number) => +v.toFixed(2);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const COLORS = { grass: '#8bc34a', road: '#555555', yellow: '#ffd600', white: '#ffffff', you: '#1e88e5' };

export function grass(w: number, h: number): string {
  return `<rect x="0" y="0" width="${w}" height="${h}" fill="${COLORS.grass}"/>`;
}

export function road(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COLORS.road}"/>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, o: { color?: string; dash?: boolean; width?: number } = {}): string {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${o.color ?? COLORS.white}" stroke-width="${o.width ?? 2.5}"${o.dash ? ' stroke-dasharray="10 8"' : ''}/>`;
}

export function doubleYellow(x1: number, y1: number, x2: number, y2: number): string {
  const horizontal = y1 === y2;
  const [dx, dy] = horizontal ? [0, 2.2] : [2.2, 0];
  return line(x1 - dx, y1 - dy, x2 - dx, y2 - dy, { color: COLORS.yellow, width: 2 }) +
    line(x1 + dx, y1 + dy, x2 + dx, y2 + dy, { color: COLORS.yellow, width: 2 });
}

export function stopBar(x1: number, y1: number, x2: number, y2: number): string {
  return line(x1, y1, x2, y2, { width: 4 });
}

/** "Shark teeth" yield line. `point` is the direction the teeth point: toward approaching traffic. */
export function yieldTeeth(x1: number, y1: number, x2: number, y2: number, point: 'up' | 'down' | 'left' | 'right'): string {
  const horizontal = y1 === y2;
  const len = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
  const count = Math.max(1, Math.floor(len / 9));
  const step = len / count;
  let s = '';
  for (let i = 0; i < count; i++) {
    const c = (horizontal ? Math.min(x1, x2) : Math.min(y1, y2)) + step * (i + 0.5);
    let pts: string;
    if (point === 'down') pts = `${n(c - 3)},${n(y1 - 3)} ${n(c + 3)},${n(y1 - 3)} ${n(c)},${n(y1 + 3)}`;
    else if (point === 'up') pts = `${n(c - 3)},${n(y1 + 3)} ${n(c + 3)},${n(y1 + 3)} ${n(c)},${n(y1 - 3)}`;
    else if (point === 'left') pts = `${n(x1 + 3)},${n(c - 3)} ${n(x1 + 3)},${n(c + 3)} ${n(x1 - 3)},${n(c)}`;
    else pts = `${n(x1 - 3)},${n(c - 3)} ${n(x1 - 3)},${n(c + 3)} ${n(x1 + 3)},${n(c)}`;
    s += `<polygon points="${pts}" fill="${COLORS.white}"/>`;
  }
  return s;
}

export function crosswalk(x: number, y: number, w: number, h: number, stripes: 'vertical' | 'horizontal'): string {
  let s = '';
  if (stripes === 'vertical') for (let i = x + 2; i < x + w - 2; i += 8) s += `<rect x="${n(i)}" y="${y}" width="4" height="${h}" fill="#fff"/>`;
  else for (let j = y + 2; j < y + h - 2; j += 8) s += `<rect x="${x}" y="${n(j)}" width="${w}" height="4" fill="#fff"/>`;
  return s;
}

export function octagonPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const a = ((22.5 + 45 * i) * Math.PI) / 180;
    return `${n(cx + r * Math.cos(a))},${n(cy + r * Math.sin(a))}`;
  }).join(' ');
}

export type SignKind =
  | 'stop' | 'yield' | 'warning' | 'work-zone' | 'speed' | 'school' | 'rr-advance' | 'rr-crossbuck'
  | 'do-not-enter' | 'one-way' | 'wrong-way' | 'regulation' | 'destination' | 'service';

export interface SignOpts { id?: string; size?: number; text?: string; post?: boolean }

export function sign(kind: SignKind, x: number, y: number, o: SignOpts = {}): string {
  const s = o.size ?? 26;
  const r = s / 2;
  const t = (txt: string, size: number, color: string, dy = 0, dx = 0) =>
    `<text x="${n(dx)}" y="${n(dy)}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="700" font-size="${n(size)}" fill="${color}">${esc(txt)}</text>`;
  const rect = (fill: string, w = s, hgt = s * 0.7) =>
    `<rect x="${n(-w / 2)}" y="${n(-hgt / 2)}" width="${n(w)}" height="${n(hgt)}" rx="${n(s * 0.06)}" fill="${fill}" stroke="#212121" stroke-width="${n(s * 0.02)}"/>`;
  let body = '';
  switch (kind) {
    case 'stop':
      body = `<polygon points="${octagonPoints(0, 0, r)}" fill="#d32f2f" stroke="#fff" stroke-width="${n(s * 0.04)}"/>` + t('STOP', s * 0.28, '#fff');
      break;
    case 'yield':
      body = `<polygon points="${n(-r)},${n(-r * 0.8)} ${n(r)},${n(-r * 0.8)} 0,${n(r * 0.9)}" fill="#fff" stroke="#d32f2f" stroke-width="${n(s * 0.14)}" stroke-linejoin="round"/>` +
        t('YIELD', s * 0.14, '#d32f2f', -r * 0.35);
      break;
    case 'warning':
    case 'work-zone':
      body = `<polygon points="0,${n(-r)} ${n(r)},0 0,${n(r)} ${n(-r)},0" fill="${kind === 'warning' ? '#ffd600' : '#fb8c00'}" stroke="#212121" stroke-width="${n(s * 0.03)}"/>` +
        (o.text ? t(o.text, s * 0.14, '#212121') : '');
      break;
    case 'speed':
      body = `<rect x="${n(-r * 0.75)}" y="${n(-r)}" width="${n(s * 0.75)}" height="${n(s)}" rx="${n(s * 0.06)}" fill="#fff" stroke="#212121" stroke-width="${n(s * 0.03)}"/>` +
        t('SPEED', s * 0.12, '#212121', -r * 0.62) + t('LIMIT', s * 0.12, '#212121', -r * 0.35) + t(o.text ?? '30', s * 0.38, '#212121', r * 0.3);
      break;
    case 'school':
      body = `<polygon points="0,${n(-r)} ${n(r)},${n(-r * 0.2)} ${n(r)},${n(r)} ${n(-r)},${n(r)} ${n(-r)},${n(-r * 0.2)}" fill="#c6e32b" stroke="#212121" stroke-width="${n(s * 0.03)}"/>` +
        (o.text ? t(o.text, s * 0.13, '#212121', r * 0.3) : '');
      break;
    case 'rr-advance':
      body = `<circle r="${n(r)}" fill="#ffd600" stroke="#212121" stroke-width="${n(s * 0.03)}"/>` +
        line(-r * 0.7, -r * 0.7, r * 0.7, r * 0.7, { color: '#212121', width: s * 0.06 }) +
        line(r * 0.7, -r * 0.7, -r * 0.7, r * 0.7, { color: '#212121', width: s * 0.06 }) +
        t('R', s * 0.22, '#212121', 0, -r * 0.55) + t('R', s * 0.22, '#212121', 0, r * 0.55);
      break;
    case 'rr-crossbuck':
      body = `<rect x="${n(-r)}" y="${n(-s * 0.09)}" width="${n(s)}" height="${n(s * 0.18)}" fill="#fff" stroke="#212121" stroke-width="${n(s * 0.02)}" transform="rotate(45)"/>` +
        `<rect x="${n(-r)}" y="${n(-s * 0.09)}" width="${n(s)}" height="${n(s * 0.18)}" fill="#fff" stroke="#212121" stroke-width="${n(s * 0.02)}" transform="rotate(-45)"/>`;
      break;
    case 'do-not-enter':
      body = `<circle r="${n(r)}" fill="#d32f2f" stroke="#fff" stroke-width="${n(s * 0.03)}"/>` +
        `<rect x="${n(-r * 0.7)}" y="${n(-s * 0.08)}" width="${n(r * 1.4)}" height="${n(s * 0.16)}" fill="#fff"/>` +
        t('DO NOT', s * 0.11, '#fff', -r * 0.45) + t('ENTER', s * 0.11, '#fff', r * 0.45);
      break;
    case 'one-way':
      body = rect('#212121', s, s * 0.4) +
        `<polygon points="${n(-r * 0.8)},${n(-s * 0.06)} ${n(r * 0.4)},${n(-s * 0.06)} ${n(r * 0.4)},${n(-s * 0.14)} ${n(r * 0.85)},0 ${n(r * 0.4)},${n(s * 0.14)} ${n(r * 0.4)},${n(s * 0.06)} ${n(-r * 0.8)},${n(s * 0.06)}" fill="#fff"/>` +
        t('ONE WAY', s * 0.08, '#212121', 0, -r * 0.2);
      break;
    case 'wrong-way':
      body = rect('#d32f2f') + t('WRONG', s * 0.16, '#fff', -s * 0.12) + t('WAY', s * 0.16, '#fff', s * 0.12);
      break;
    case 'regulation':
      body = rect('#fff') + t(o.text ?? '', s * 0.13, '#212121');
      break;
    case 'destination':
      body = rect('#2e7d32') + t(o.text ?? '', s * 0.13, '#fff');
      break;
    case 'service':
      body = rect('#1565c0', s * 0.8, s * 0.8) + t(o.text ?? '', s * 0.3, '#fff');
      break;
  }
  const post = o.post === false ? '' : `<rect x="-1.5" y="${n(r * 0.8)}" width="3" height="${n(s * 0.7)}" fill="#757575"/>`;
  const idAttr = o.id ? ` data-prop="${o.id}"` : '';
  return `<g class="sign"${idAttr} transform="translate(${n(x)} ${n(y)})">${post}${body}</g>`;
}

/** Traffic light drawn upright. States (space-separated) via CSS: red, yellow, green, green-arrow, flash-red, flash-yellow. */
export function trafficLight(id: string, x: number, y: number): string {
  return `<g class="light" data-prop="${id}" transform="translate(${n(x)} ${n(y)})">` +
    `<rect x="-7" y="-20" width="14" height="40" rx="3" fill="#212121"/>` +
    `<circle class="lamp red" cx="0" cy="-12" r="5"/>` +
    `<circle class="lamp yellow" cx="0" cy="0" r="5"/>` +
    `<circle class="lamp green" cx="0" cy="12" r="5"/>` +
    `<path class="arrow" d="M4 12 H-4 M-4 12 l3 -3 M-4 12 l3 3" stroke-width="2" fill="none"/>` +
    `</g>`;
}

export function hydrant(x: number, y: number): string {
  return `<g transform="translate(${n(x)} ${n(y)})"><circle r="5" fill="#d32f2f" stroke="#7f0000"/><circle r="2" fill="#ff8a80"/></g>`;
}

export function label(x: number, y: number, text: string, size = 12): string {
  const w = text.length * size * 0.6 + 10;
  return `<g transform="translate(${n(x)} ${n(y)})"><rect x="${n(-w / 2)}" y="${n(-size * 0.8)}" width="${n(w)}" height="${n(size * 1.6)}" rx="4" fill="#fff" stroke="#212121" stroke-width="1"/>` +
    `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="700" font-size="${size}" fill="#212121">${esc(text)}</text></g>`;
}

/** Double-headed measuring arrow with a label, e.g. "15 feet". */
export function measure(x1: number, y1: number, x2: number, y2: number, text: string): string {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = (x: number, y: number, a: number) =>
    `<polygon points="${n(x)},${n(y)} ${n(x - 7 * Math.cos(a - 0.4))},${n(y - 7 * Math.sin(a - 0.4))} ${n(x - 7 * Math.cos(a + 0.4))},${n(y - 7 * Math.sin(a + 0.4))}" fill="#212121"/>`;
  return line(x1, y1, x2, y2, { color: '#212121', width: 2 }) + head(x2, y2, ang) + head(x1, y1, ang + Math.PI) +
    label((x1 + x2) / 2, (y1 + y2) / 2 - 12, text);
}
```

- [ ] **Step 3: vehicles.ts**

```ts
import type { ActorDef, ActorKind } from './types';
import { SIZES } from './engine';
import { COLORS, octagonPoints } from './parts';

const DEFAULT_COLOR: Record<ActorKind, string> = {
  car: '#e53935', bus: '#fbc02d', ambulance: '#ffffff', truck: '#78909c', bike: '#8e24aa', pedestrian: '#ff7043',
};

/** Drawn pointing up (heading 0), centered on the origin. */
export function vehicleSvg(a: ActorDef): string {
  const { length: L, width: W } = SIZES[a.kind];
  const x = -W / 2, y = -L / 2;
  const color = a.you ? COLORS.you : a.color ?? DEFAULT_COLOR[a.kind];
  const glass = (gy: number, gh: number) => `<rect x="${x + 3}" y="${gy}" width="${W - 6}" height="${gh}" rx="2" fill="#e3f2fd"/>`;
  switch (a.kind) {
    case 'car':
      return `<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="5" fill="${color}" stroke="#0004"/>` + glass(y + 6, 8) + glass(L / 2 - 8, 5);
    case 'bus':
      return `<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="4" fill="${color}" stroke="#0006"/>` + glass(y + 4, 7) +
        `<rect x="${x}" y="${y + 20}" width="${W}" height="3" fill="#212121"/>` +
        `<g class="stop-arm"><polygon points="${octagonPoints(x - 8, y + 16, 6)}" fill="#d32f2f" stroke="#fff"/></g>` +
        [[x + 3, y + 2], [-x - 3, y + 2], [x + 3, -y - 2], [-x - 3, -y - 2]]
          .map(([cx, cy]) => `<circle class="beacon" cx="${cx}" cy="${cy}" r="2.5" fill="#f44336"/>`).join('');
    case 'ambulance':
      return `<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="4" fill="${color}" stroke="#9e9e9e"/>` + glass(y + 4, 7) +
        `<rect x="-2.5" y="-6" width="5" height="16" fill="#d32f2f"/><rect x="-8" y="-0.5" width="16" height="5" fill="#d32f2f"/>` +
        `<circle class="beacon" cx="${x + 4}" cy="${y + 14}" r="3" fill="#f44336"/><circle class="beacon" cx="${-x - 4}" cy="${y + 14}" r="3" fill="#2196f3"/>`;
    case 'truck':
      return `<rect x="${x}" y="${y}" width="${W}" height="14" rx="3" fill="${color}" stroke="#0006"/>` + glass(y + 3, 5) +
        `<rect x="${x}" y="${y + 16}" width="${W}" height="${L - 16}" rx="2" fill="#cfd8dc" stroke="#0006"/>`;
    case 'bike':
      return `<rect x="-1.5" y="${y}" width="3" height="${L}" fill="#212121"/><circle r="3.5" fill="${color}"/>`;
    case 'pedestrian':
      return `<circle r="4" fill="${color}" stroke="#212121"/>`;
  }
}
```

- [ ] **Step 4: layouts.ts**

```ts
import type { ActorKind, Lane, Pose, SceneDef, StopLine, Zone } from './types';
import { SIZES } from './engine';
import { grass, line, road, sign, stopBar, trafficLight, yieldTeeth, COLORS, type SignKind, type SignOpts } from './parts';

export type Dir = 'nb' | 'sb' | 'eb' | 'wb';
export type Control = 'stop' | 'yield' | 'light';

/**
 * Standard 300×300 four-way intersection.
 * Horizontal road y 120–180, vertical road x 120–180, junction box 120–180 both ways.
 * Lane centers: nb x=165, sb x=135, eb y=165, wb y=135 (US right-hand traffic).
 */
const LINE: Record<Dir, StopLine> = {
  nb: { id: 'line-nb', x: 165, y: 188, heading: 0 },
  sb: { id: 'line-sb', x: 135, y: 112, heading: 180 },
  eb: { id: 'line-eb', x: 112, y: 165, heading: 90 },
  wb: { id: 'line-wb', x: 188, y: 135, heading: 270 },
};
const BAR: Record<Dir, [number, number, number, number]> = {
  nb: [150, 186, 180, 186], sb: [120, 114, 150, 114], eb: [114, 150, 114, 180], wb: [186, 120, 186, 150],
};
const TEETH: Record<Dir, { seg: [number, number, number, number]; point: 'up' | 'down' | 'left' | 'right' }> = {
  nb: { seg: [151, 186, 179, 186], point: 'down' },
  sb: { seg: [121, 114, 149, 114], point: 'up' },
  eb: { seg: [114, 151, 114, 179], point: 'left' },
  wb: { seg: [186, 121, 186, 149], point: 'right' },
};
/** On the grass, to the right of each approach, just before the junction. */
const SIGN_POS: Record<Dir, [number, number]> = { nb: [198, 208], sb: [102, 92], eb: [92, 198], wb: [208, 102] };

export const FOURWAY = {
  start: {
    nb: { x: 165, y: 340, heading: 0 }, sb: { x: 135, y: -40, heading: 180 },
    eb: { x: -40, y: 165, heading: 90 }, wb: { x: 340, y: 135, heading: 270 },
  } as Record<Dir, Pose>,
  exit: {
    nb: { x: 165, y: -40, heading: 0 }, sb: { x: 135, y: 340, heading: 180 },
    eb: { x: 340, y: 165, heading: 90 }, wb: { x: -40, y: 135, heading: 270 },
  } as Record<Dir, Pose>,
  lineId: (d: Dir) => LINE[d].id,
  signId: (d: Dir) => `sign-${d}`,
  lightId: (d: Dir) => `light-${d}`,
};

/** Pose with the vehicle's front 4px behind the stop/yield line of approach `dir`. */
export function stopPose(dir: Dir, kind: ActorKind = 'car'): Pose {
  const half = SIZES[kind].length / 2 + 4;
  const l = LINE[dir];
  switch (dir) {
    case 'nb': return { x: 165, y: l.y + half, heading: 0 };
    case 'sb': return { x: 135, y: l.y - half, heading: 180 };
    case 'eb': return { x: l.x - half, y: 165, heading: 90 };
    case 'wb': return { x: l.x + half, y: 135, heading: 270 };
  }
}

export interface Layout { background: string; lanes: Lane[]; zones: Zone[]; lines: StopLine[]; props: string[] }

export function fourWay(opts: { controls?: Partial<Record<Dir, Control>> } = {}): Layout {
  let bg = grass(300, 300) + road(0, 120, 300, 60) + road(120, 0, 60, 300);
  const y = { color: COLORS.yellow, dash: true };
  bg += line(150, 0, 150, 120, y) + line(150, 180, 150, 300, y) + line(0, 150, 120, 150, y) + line(180, 150, 300, 150, y);
  const props: string[] = [];
  for (const [d, c] of Object.entries(opts.controls ?? {}) as [Dir, Control][]) {
    const [sx, sy] = SIGN_POS[d];
    if (c === 'stop') { bg += stopBar(...BAR[d]) + sign('stop', sx, sy, { id: FOURWAY.signId(d) }); props.push(FOURWAY.signId(d)); }
    if (c === 'yield') { bg += yieldTeeth(...TEETH[d].seg, TEETH[d].point) + sign('yield', sx, sy, { id: FOURWAY.signId(d) }); props.push(FOURWAY.signId(d)); }
    if (c === 'light') { bg += stopBar(...BAR[d]) + trafficLight(FOURWAY.lightId(d), sx, sy); props.push(FOURWAY.lightId(d)); }
  }
  return {
    background: bg,
    lanes: [
      { id: 'nb', x: 150, y: -100, w: 30, h: 500, heading: 0 },
      { id: 'sb', x: 120, y: -100, w: 30, h: 500, heading: 180 },
      { id: 'eb', x: -100, y: 150, w: 500, h: 30, heading: 90 },
      { id: 'wb', x: -100, y: 120, w: 500, h: 30, heading: 270 },
    ],
    zones: [{ id: 'junction', x: 120, y: 120, w: 60, h: 60 }],
    lines: Object.values(LINE),
    props,
  };
}

/** A single large sign on a plain background, for "what does this sign mean?" questions. */
export function signCloseup(id: string, kind: SignKind, opts: Omit<SignOpts, 'size' | 'post' | 'id'> = {}): SceneDef {
  return {
    id, width: 300, height: 300,
    background: `<rect x="0" y="0" width="300" height="300" fill="#eceff1"/>` + sign(kind, 150, 150, { ...opts, size: 170, post: false }),
    lanes: [], zones: [], lines: [], props: [], actors: [],
    steps: [{ id: 'show', duration: 500 }],
  };
}
```

- [ ] **Step 5: render.ts**

```ts
import type { SceneDef } from './types';
import { frameAt } from './engine';
import { vehicleSvg } from './vehicles';

export class ScenePlayer {
  private actorEls = new Map<string, Element>();
  private propEls = new Map<string, Element>();
  private raf = 0;
  private finish: (() => void) | null = null;

  constructor(host: HTMLElement, private scene: SceneDef) {
    host.innerHTML =
      `<svg class="scene" viewBox="0 0 ${scene.width} ${scene.height}" xmlns="http://www.w3.org/2000/svg" role="img">` +
      scene.background +
      scene.actors.map((a) => `<g class="actor" data-id="${a.id}">${vehicleSvg(a)}</g>`).join('') +
      `</svg>`;
    const svg = host.querySelector('svg')!;
    for (const a of scene.actors) this.actorEls.set(a.id, svg.querySelector(`g.actor[data-id="${a.id}"]`)!);
    for (const p of scene.props) {
      const el = svg.querySelector(`[data-prop="${p}"]`);
      if (el) this.propEls.set(p, el);
    }
    this.showFrame(0, 0);
  }

  showFrame(stepIndex: number, t: number): void {
    const f = frameAt(this.scene, stepIndex, t);
    for (const [id, el] of this.actorEls) {
      const p = f.poses[id];
      el.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${p.heading})`);
      el.setAttribute('data-state', f.states[id] ?? '');
    }
    for (const [id, el] of this.propEls) el.setAttribute('data-state', f.states[id] ?? '');
  }

  /** Plays one step from its start. Resolves when it ends or when stop() is called. */
  play(stepIndex: number): Promise<void> {
    this.stop();
    const dur = this.scene.steps[stepIndex].duration;
    return new Promise((resolve) => {
      this.finish = resolve;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(now - t0, dur);
        this.showFrame(stepIndex, t);
        if (t >= dur) { this.finish = null; resolve(); return; }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    const f = this.finish;
    this.finish = null;
    f?.();
  }
}
```

- [ ] **Step 6: defs/yield.ts**

```ts
import type { SceneDef } from '../types';
import { fourWay, FOURWAY, signCloseup, stopPose } from '../layouts';
import { kf } from '../paths';

const L = fourWay({ controls: { nb: 'yield' } });

export const yieldIntersection: SceneDef = {
  id: 'yield-intersection', width: 300, height: 300, ...L,
  actors: [
    { id: 'blue', kind: 'car', you: true, start: FOURWAY.start.nb },
    { id: 'red', kind: 'car', color: '#e53935', start: FOURWAY.start.eb },
  ],
  steps: [
    { id: 'show-sign', duration: 2500, states: [{ t: 0, id: FOURWAY.signId('nb'), state: 'highlight' }] },
    {
      id: 'slow-down', duration: 3000,
      states: [{ t: 0, id: FOURWAY.signId('nb'), state: '' }],
      tracks: { blue: [kf(stopPose('nb'), 3000, 'out')] },
      expect: [{ type: 'stopsBehind', actor: 'blue', line: FOURWAY.lineId('nb'), from: 3000, to: 3000 }],
    },
    {
      id: 'wait-then-go', duration: 7000,
      tracks: {
        red: [kf(FOURWAY.exit.eb, 3500)],
        blue: [kf(stopPose('nb'), 4500), kf(FOURWAY.exit.nb, 7000, 'in')],
      },
      expect: [
        { type: 'stopsBehind', actor: 'blue', line: FOURWAY.lineId('nb'), from: 0, to: 4500 },
        { type: 'entersAfter', actor: 'blue', other: 'red', zone: 'junction' },
      ],
    },
    {
      id: 'question-freeze', duration: 500,
      at: { blue: { x: 165, y: 245, heading: 0 }, red: { x: 70, y: 165, heading: 90 } },
    },
  ],
};

export const yieldScenes: SceneDef[] = [yieldIntersection, signCloseup('sign-yield', 'yield')];
```

- [ ] **Step 7: registry.ts**

```ts
import type { SceneDef } from './types';
import { yieldScenes } from './defs/yield';

// Each lesson task adds its scene list here.
const ALL: SceneDef[] = [...yieldScenes];

export const SCENES: Record<string, SceneDef> = Object.fromEntries(ALL.map((s) => [s.id, s]));
export const ALL_SCENES: readonly SceneDef[] = ALL;

export function getScene(id: string): SceneDef {
  const s = SCENES[id];
  if (!s) throw new Error(`Unknown scene: ${id}`);
  return s;
}

export function stepIndexOf(scene: SceneDef, stepId: string): number {
  const i = scene.steps.findIndex((s) => s.id === stepId);
  if (i < 0) throw new Error(`Scene ${scene.id} has no step ${stepId}`);
  return i;
}

export function sceneIndex(): Record<string, string[]> {
  return Object.fromEntries(ALL.map((s) => [s.id, s.steps.map((st) => st.id)]));
}
```

- [ ] **Step 8: tests/scenes.test.ts**

```ts
import { describe, test, expect } from 'vitest';
import { ALL_SCENES } from '../src/scenes/registry';
import { checkScene } from '../src/scenes/check';

describe('every registered scene', () => {
  test('scene ids are unique', () => {
    const ids = ALL_SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const scene of ALL_SCENES) {
    test(`${scene.id} passes behavior checks`, () => {
      expect(checkScene(scene)).toEqual([]);
    });
  }
});
```

Run: `npx vitest run tests/scenes.test.ts` → PASS

- [ ] **Step 9: Scene styles.** Append to `src/styles.css`:

```css
/* ---- scenes ---- */
svg.scene { display: block; width: 100%; height: auto; }
.sign[data-state~="highlight"] { filter: drop-shadow(0 0 4px #fff59d) drop-shadow(0 0 3px #fbc02d); }
.light .lamp { fill: #424242; }
.light .arrow { stroke: none; }
.light[data-state~="red"] .lamp.red { fill: #f44336; }
.light[data-state~="yellow"] .lamp.yellow { fill: #ffc107; }
.light[data-state~="green"] .lamp.green { fill: #4caf50; }
.light[data-state~="green-arrow"] .arrow { stroke: #4caf50; stroke-width: 3; }
.light[data-state~="flash-red"] .lamp.red { fill: #f44336; animation: flash 1s steps(2) infinite; }
.light[data-state~="flash-yellow"] .lamp.yellow { fill: #ffc107; animation: flash 1s steps(2) infinite; }
.actor .stop-arm { display: none; }
.actor[data-state~="stop-arm"] .stop-arm { display: inline; }
.actor .beacon { opacity: 0.25; }
.actor[data-state~="flashing"] .beacon { opacity: 1; animation: flash 0.5s steps(2) infinite; }
.actor[data-state~="hidden"] { display: none; }
@keyframes flash { 50% { opacity: 0.15; } }
/* ---- scene preview (dev) ---- */
.preview-row { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 16px; }
.preview-row h3 { width: 100%; margin: 4px 0; font-size: 16px; }
.preview-cell { width: 230px; font-size: 12px; }
```

- [ ] **Step 10: Preview page + screenshot script**

`scene-preview.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>Scene preview</title></head>
  <body><div id="app"></div><script type="module" src="/src/preview/main.ts"></script></body>
</html>
```

`src/preview/main.ts`:
```ts
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
```

`vite.config.ts`: change `input` to:
```ts
      input: { main: r('./index.html'), preview: r('./scene-preview.html') },
```

`scripts/screenshot-scenes.ts`:
```ts
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SCENES } from '../src/scenes/registry';

const only = process.argv.slice(2);
const ids = only.length ? only : Object.keys(SCENES);
const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
mkdirSync('screenshots', { recursive: true });
try {
  for (const id of ids) {
    if (!SCENES[id]) { console.error(`unknown scene ${id}`); process.exitCode = 1; continue; }
    await page.goto(`http://localhost:5199/permit-study/scene-preview.html?scene=${id}`);
    await page.waitForSelector('.preview-cell svg');
    await page.screenshot({ path: `screenshots/${id}.png`, fullPage: true });
    console.log(`screenshots/${id}.png`);
  }
} finally {
  await browser.close();
  await server.close();
}
```

- [ ] **Step 11: Screenshot and inspect**

Run: `npm run shots -- yield-intersection sign-yield`
Open both PNGs with the Read tool. Confirm:
- The `slow-down` last frame shows blue just behind the white triangles.
- In `wait-then-go`, red is in the lower half of the horizontal road and moving right, blue waits until red is gone, and then blue goes north.
- The yield sign is on the grass to the right of blue's lane, pointing down.
- `sign-yield` shows a large yield sign.

Fix any drawing problem before committing.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: SVG scene renderer, four-way layout, yield scene, preview + screenshots"
```

---

### Task 4: Content pipeline (schema, citation check, audio line list)

**Goal:** Load lesson YAML, validate it strictly (including that each quote appears on its cited manual page and that scene/step references exist), and produce the list of audio lines.

**Files:**
- Create: `src/content/types.ts`, `src/content/normalize.ts`, `src/content/validate.ts`, `src/content/audioLines.ts`, `src/content/load.ts`, `scripts/lib.ts`, `scripts/check-content.ts`, `scripts/list-audio-lines.ts`
- Test: `tests/content.test.ts`

**Acceptance Criteria:**
- [ ] Wrong quote, wrong page, unknown scene/step, bad answer index, bad explainCard, duplicate ids, and duplicate order are all reported
- [ ] Quotes match despite hyphenated line breaks, "Y ou" splits, curly quotes, and ligatures
- [ ] `npm run check` passes with zero lessons

**Verify:** `npx vitest run tests/content.test.ts` → PASS; `npm run check` → `OK: 0 lessons`

**Steps:**

- [ ] **Step 1: types.ts**

```ts
import { z } from 'zod';

const Id = z.string().regex(/^[a-z0-9-]+$/, 'ids use lowercase letters, digits and dashes');

export const SourceSchema = z.object({
  page: z.number().int().positive(),
  quote: z.string().min(10).optional(),
  figure: z.string().min(3).optional(),
}).refine((s) => s.quote || s.figure, { message: 'source needs a quote (or a figure description for facts shown only in a manual picture)' });

export const CardSchema = z.object({
  id: Id, say: z.string().min(1), scene: z.string(), step: z.string(), source: SourceSchema,
});

export const QuestionSchema = z.object({
  id: Id,
  ask: z.string().min(1),
  scene: z.string(),
  step: z.string(),
  choices: z.array(z.string().min(1)).min(2).max(4),
  answer: z.number().int().min(0),
  explainCard: z.string(),
  signQuestion: z.boolean().default(false),
  source: SourceSchema,
});

export const LessonSchema = z.object({
  id: Id,
  order: z.number().int().positive(),
  title: z.string().min(1).max(20),
  icon: z.string().min(1),
  cards: z.array(CardSchema).min(1),
  questions: z.array(QuestionSchema).min(1),
});

export type Source = z.infer<typeof SourceSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
```

- [ ] **Step 2: normalize.ts**

```ts
/** Lowercase letters and digits only. Makes PDF artifacts irrelevant: "intersec-\ntion", "Y ou", curly quotes, ligatures. */
export function normalizeForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
}
```

- [ ] **Step 3: Write failing tests** (`tests/content.test.ts`)

```ts
import { describe, test, expect } from 'vitest';
import { normalizeForMatch } from '../src/content/normalize';
import { validateLessons } from '../src/content/validate';
import { audioLines, audioId, TEXT } from '../src/content/audioLines';
import { LessonSchema, type Lesson } from '../src/content/types';

const pages = [
  { page: 29, text: 'MEANING: Decrease speed \nas you reach the intersec-\ntion. Y ou must come to a full stop at \na YIELD sign if traffic conditions require it.' },
  { page: 30, text: 'Traffic signals are usually red, yellow and green.' },
];
const scenes = { 'yield-intersection': ['slow-down', 'question-freeze'] };

const lesson = (over: Partial<Lesson> = {}): Lesson => LessonSchema.parse({
  id: 'yield', order: 2, title: 'Yield', icon: '🔻',
  cards: [{ id: 'yield-1', say: 'Slow down.', scene: 'yield-intersection', step: 'slow-down',
    source: { page: 29, quote: 'Decrease speed as you reach the intersection.' } }],
  questions: [{ id: 'yield-q1', ask: 'Who goes first?', scene: 'yield-intersection', step: 'question-freeze',
    choices: ['Blue', 'Red'], answer: 1, explainCard: 'yield-1',
    source: { page: 29, quote: 'You must come to a full stop at a YIELD sign if traffic conditions require it.' } }],
  ...over,
});

describe('normalizeForMatch', () => {
  test('ignores PDF artifacts', () => {
    expect(normalizeForMatch('intersec-\ntion')).toBe(normalizeForMatch('intersection'));
    expect(normalizeForMatch('Y ou')).toBe('you');
    expect(normalizeForMatch('ﬁre “hydrant”')).toBe('firehydrant');
  });
});

describe('validateLessons', () => {
  test('valid lesson has no errors', () => {
    expect(validateLessons([lesson()], pages, scenes)).toEqual([]);
  });
  test('quote not on the cited page', () => {
    const l = lesson();
    l.cards[0].source = { page: 30, quote: 'Decrease speed as you reach the intersection.' };
    expect(validateLessons([l], pages, scenes).join()).toContain('quote not found on page 30');
  });
  test('quote may continue onto the next page', () => {
    const l = lesson();
    l.cards[0].source = { page: 29, quote: 'require it. Traffic signals are usually red' };
    expect(validateLessons([l], pages, scenes)).toEqual([]);
  });
  test('page outside the manual', () => {
    const l = lesson();
    l.cards[0].source = { page: 999, quote: 'Decrease speed as you reach the intersection.' };
    expect(validateLessons([l], pages, scenes).join()).toContain('page 999');
  });
  test('unknown scene and step', () => {
    const l = lesson();
    l.cards[0].scene = 'nope';
    l.questions[0].step = 'nope';
    const e = validateLessons([l], pages, scenes).join('\n');
    expect(e).toContain('unknown scene "nope"');
    expect(e).toContain('has no step "nope"');
  });
  test('answer index out of range and bad explainCard', () => {
    const l = lesson();
    l.questions[0].answer = 5;
    l.questions[0].explainCard = 'missing';
    const e = validateLessons([l], pages, scenes).join('\n');
    expect(e).toContain('answer 5');
    expect(e).toContain('explainCard "missing"');
  });
  test('duplicate ids and orders across lessons', () => {
    const e = validateLessons([lesson(), lesson()], pages, scenes).join('\n');
    expect(e).toContain('duplicate id "yield"');
    expect(e).toContain('duplicate order 2');
  });
});

describe('audioLines', () => {
  test('includes every spoken string with stable ids', () => {
    const l = lesson();
    const lines = audioLines([l]);
    const ids = new Set(lines.map((x) => x.id));
    for (const id of ['phrase-not-quite', 'phrase-num-1', 'card-yield-1', 'q-yield-q1', 'q-yield-q1-c0', 'q-yield-q1-c1',
      'q-yield-q1-yes', 'q-yield-q1-answer', 'end-yield', 'score-14-of-20', 'score-0-of-1']) expect(ids.has(id)).toBe(true);
    expect(ids.size).toBe(lines.length);
  });
  test('feedback text restates the right answer', () => {
    const q = lesson().questions[0];
    expect(TEXT.yes(q)).toBe('Yes! Red.');
    expect(TEXT.answerIs(q)).toBe('The answer is: Red.');
    expect(audioId.choice(q, 1)).toBe('q-yield-q1-c1');
  });
});
```

Run: `npx vitest run tests/content.test.ts` → FAIL

- [ ] **Step 4: validate.ts**

```ts
import type { Lesson, Source } from './types';
import { normalizeForMatch } from './normalize';

export interface ManualPage { page: number; text: string }
export type SceneIndex = Record<string, string[]>;

export function validateLessons(lessons: Lesson[], pages: ManualPage[], scenes: SceneIndex): string[] {
  const errors: string[] = [];
  const norm = new Map(pages.map((p) => [p.page, normalizeForMatch(p.text)]));
  const ids = new Set<string>();
  const orders = new Set<number>();

  const checkId = (id: string, where: string) => {
    if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    ids.add(id);
  };
  const checkSource = (s: Source, where: string) => {
    const here = norm.get(s.page);
    if (here === undefined) { errors.push(`${where}: page ${s.page} is not in the manual`); return; }
    if (s.quote) {
      const text = here + (norm.get(s.page + 1) ?? '');
      if (!text.includes(normalizeForMatch(s.quote))) errors.push(`${where}: quote not found on page ${s.page}: "${s.quote}"`);
    }
  };
  const checkScene = (scene: string, step: string, where: string) => {
    const steps = scenes[scene];
    if (!steps) errors.push(`${where}: unknown scene "${scene}"`);
    else if (!steps.includes(step)) errors.push(`${where}: scene "${scene}" has no step "${step}"`);
  };

  for (const l of lessons) {
    checkId(l.id, `lesson ${l.id}`);
    if (orders.has(l.order)) errors.push(`lesson ${l.id}: duplicate order ${l.order}`);
    orders.add(l.order);
    const cardIds = new Set(l.cards.map((c) => c.id));
    for (const c of l.cards) {
      const where = `${l.id}/${c.id}`;
      checkId(c.id, where);
      checkSource(c.source, where);
      checkScene(c.scene, c.step, where);
    }
    for (const q of l.questions) {
      const where = `${l.id}/${q.id}`;
      checkId(q.id, where);
      checkSource(q.source, where);
      checkScene(q.scene, q.step, where);
      if (q.answer >= q.choices.length) errors.push(`${where}: answer ${q.answer} but only ${q.choices.length} choices`);
      if (!cardIds.has(q.explainCard)) errors.push(`${where}: explainCard "${q.explainCard}" is not a card in this lesson`);
    }
  }
  return errors;
}
```

- [ ] **Step 5: audioLines.ts**

```ts
import type { Lesson, Question } from './types';

export const PHRASES: Record<string, string> = {
  'phrase-home': 'Hi! Tap the green button to keep learning.',
  'phrase-not-quite': "Not quite. Let's watch again.",
  'phrase-num-1': 'Number 1.',
  'phrase-num-2': 'Number 2.',
  'phrase-num-3': 'Number 3.',
  'phrase-num-4': 'Number 4.',
  'phrase-passed': 'You passed! Great job!',
  'phrase-not-yet': "Not yet. Let's keep practicing.",
  'phrase-test-start': "Let's do a practice test. Listen to each question, then tap your answer.",
  'phrase-review-missed': "Let's practice the ones you missed.",
};

const trimEnd = (s: string) => s.trim().replace(/[.!?]+$/, '');

export const TEXT = {
  yes: (q: Question) => `Yes! ${trimEnd(q.choices[q.answer])}.`,
  answerIs: (q: Question) => `The answer is: ${trimEnd(q.choices[q.answer])}.`,
  lessonEnd: (l: Lesson) => `Great job! You're done with ${l.title}.`,
  score: (n: number, t: number) => `You got ${n} out of ${t}.`,
};

export const audioId = {
  card: (c: { id: string }) => `card-${c.id}`,
  ask: (q: { id: string }) => `q-${q.id}`,
  choice: (q: { id: string }, i: number) => `q-${q.id}-c${i}`,
  yes: (q: { id: string }) => `q-${q.id}-yes`,
  answerIs: (q: { id: string }) => `q-${q.id}-answer`,
  lessonEnd: (l: { id: string }) => `end-${l.id}`,
  score: (n: number, t: number) => `score-${n}-of-${t}`,
};

export interface AudioLine { id: string; text: string }

export function audioLines(lessons: Lesson[]): AudioLine[] {
  const out: AudioLine[] = Object.entries(PHRASES).map(([id, text]) => ({ id, text }));
  for (let t = 1; t <= 20; t++) for (let n = 0; n <= t; n++) out.push({ id: audioId.score(n, t), text: TEXT.score(n, t) });
  for (const l of lessons) {
    out.push({ id: audioId.lessonEnd(l), text: TEXT.lessonEnd(l) });
    for (const c of l.cards) out.push({ id: audioId.card(c), text: c.say });
    for (const q of l.questions) {
      out.push({ id: audioId.ask(q), text: q.ask });
      q.choices.forEach((c, i) => out.push({ id: audioId.choice(q, i), text: c }));
      out.push({ id: audioId.yes(q), text: TEXT.yes(q) }, { id: audioId.answerIs(q), text: TEXT.answerIs(q) });
    }
  }
  return out;
}
```

Run: `npx vitest run tests/content.test.ts` → PASS

- [ ] **Step 6: load.ts (browser)**

```ts
import YAML from 'yaml';
import { LessonSchema, type Lesson } from './types';

const raw = import.meta.glob('../../content/lessons/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function loadLessons(): Lesson[] {
  return Object.values(raw).map((r) => LessonSchema.parse(YAML.parse(r))).sort((a, b) => a.order - b.order);
}
```

- [ ] **Step 7: scripts/lib.ts, check-content.ts, list-audio-lines.ts**

`scripts/lib.ts`:
```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
import { LessonSchema, type Lesson } from '../src/content/types';
import type { ManualPage } from '../src/content/validate';

export function readLessons(errors: string[]): Lesson[] {
  const dir = 'content/lessons';
  if (!existsSync(dir)) return [];
  const lessons: Lesson[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort()) {
    try { lessons.push(LessonSchema.parse(YAML.parse(readFileSync(`${dir}/${f}`, 'utf8')))); }
    catch (e) { errors.push(`${f}: ${(e as Error).message}`); }
  }
  return lessons.sort((a, b) => a.order - b.order);
}

export function readPages(): ManualPage[] {
  return JSON.parse(readFileSync('content/manual/pages.json', 'utf8')) as ManualPage[];
}
```

`scripts/check-content.ts`:
```ts
import { existsSync } from 'node:fs';
import { readLessons, readPages } from './lib';
import { validateLessons } from '../src/content/validate';
import { audioLines } from '../src/content/audioLines';
import { sceneIndex } from '../src/scenes/registry';

const errors: string[] = [];
const lessons = readLessons(errors);
errors.push(...validateLessons(lessons, readPages(), sceneIndex()));
if (process.argv.includes('--audio')) {
  for (const line of audioLines(lessons))
    if (!existsSync(`public/audio/${line.id}.mp3`)) errors.push(`missing audio for ${line.id} (run: npm run audio)`);
}
const figures = lessons.flatMap((l) => [...l.cards, ...l.questions]).filter((x) => !x.source.quote).length;
const questions = lessons.reduce((n, l) => n + l.questions.length, 0);
const signs = lessons.reduce((n, l) => n + l.questions.filter((q) => q.signQuestion).length, 0);
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`OK: ${lessons.length} lessons, ${questions} questions (${signs} sign questions), ${figures} picture-only sources for parent review`);
```

`scripts/list-audio-lines.ts`:
```ts
import { writeFileSync } from 'node:fs';
import { readLessons } from './lib';
import { audioLines } from '../src/content/audioLines';

const errors: string[] = [];
const lessons = readLessons(errors);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const lines = audioLines(lessons);
writeFileSync('content/audio-lines.json', JSON.stringify(lines, null, 1));
console.log(`${lines.length} audio lines`);
```

Run: `npm run check` → `OK: 0 lessons, 0 questions (0 sign questions), 0 picture-only sources for parent review`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: lesson schema, citation validation against manual, audio line list"
```

---

### Task 5: Audio generation and voice choice

**Goal:** Build the Python script that synthesizes every audio line into mp3 plus word timings, skipping lines whose text hasn't changed. Get the parent to choose the voice.

**Files:**
- Create: `scripts/build_audio.py`, `scripts/voice_samples.py`, `content/voice.json`, `tests_py/test_build_audio.py`

**Acceptance Criteria:**
- [ ] `match_words` maps edge-tts word boundaries to caption token indexes, including hyphenated tokens and unmatched boundaries
- [ ] Unchanged lines are not regenerated; stale files are deleted
- [ ] **The parent has chosen a voice** and `content/voice.json` records it

**Verify:** `python -m pytest tests_py -q` → all pass; `npm run audio` twice → the second run prints `0 generated`

**Steps:**

- [ ] **Step 1: Failing tests** (`tests_py/test_build_audio.py`)

```python
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
from build_audio import match_words  # noqa: E402


def b(text, ms):
    return {"text": text, "offset": ms * 10000, "duration": 100 * 10000}


def test_simple_sentence():
    words = match_words("This is a yield sign.", [b("This", 0), b("is", 100), b("a", 200), b("yield", 300), b("sign", 400)])
    assert [w["i"] for w in words] == [0, 1, 2, 3, 4]


def test_times_are_milliseconds():
    words = match_words("Go now.", [b("Go", 50), b("now", 300)])
    assert words[0] == {"i": 0, "start": 50, "end": 150}
    assert words[1]["start"] == 300


def test_hyphenated_token_gets_several_boundaries():
    words = match_words("Yield the right-of-way now.", [b("Yield", 0), b("the", 1), b("right", 2), b("of", 3), b("way", 4), b("now", 5)])
    assert [w["i"] for w in words] == [0, 1, 2, 2, 2, 3]


def test_unmatched_boundary_is_skipped():
    words = match_words("Park 15 feet away.", [b("Park", 0), b("fifteen", 1), b("feet", 2), b("away", 3)])
    assert [w["i"] for w in words] == [0, 2, 3]
```

Run: `python -m pytest tests_py -q` → FAIL (import error)

- [ ] **Step 2: scripts/build_audio.py**

```python
"""Generate narration mp3 + word timings for every line in content/audio-lines.json."""
import asyncio
import hashlib
import json
import pathlib
import re

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = ROOT / "content" / "audio-lines.json"
VOICE = ROOT / "content" / "voice.json"
OUT = ROOT / "public" / "audio"
MANIFEST = OUT / "manifest.json"


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def match_words(text: str, boundaries: list[dict]) -> list[dict]:
    """Map each spoken word to the index of the whitespace-separated caption token it belongs to."""
    toks = [norm(t) for t in text.split()]
    out: list[dict] = []
    ti, pos = 0, 0
    for bd in boundaries:
        bw = norm(bd["text"])
        if not bw:
            continue
        j, p = ti, pos
        while j < len(toks) and not toks[j][p:].startswith(bw):
            j, p = j + 1, 0
        if j >= len(toks):
            continue
        start = bd["offset"] // 10000
        out.append({"i": j, "start": start, "end": start + bd["duration"] // 10000})
        p += len(bw)
        if p >= len(toks[j]):
            j, p = j + 1, 0
        ti, pos = j, p
    return out


def line_hash(text: str, voice: dict) -> str:
    return hashlib.sha1(f"{voice['voice']}|{voice.get('rate', '+0%')}|{text}".encode()).hexdigest()


async def synth(text: str, voice: dict) -> tuple[bytes, list[dict]]:
    comm = edge_tts.Communicate(text, voice["voice"], rate=voice.get("rate", "+0%"), boundary="WordBoundary")
    audio = bytearray()
    bounds: list[dict] = []
    async for ch in comm.stream():
        if ch["type"] == "audio":
            audio.extend(ch["data"])
        elif ch["type"] == "WordBoundary":
            bounds.append(ch)
    if not audio:
        raise RuntimeError(f"no audio returned for: {text!r}")
    return bytes(audio), bounds


async def build_one(line: dict, voice: dict, manifest: dict, sem: asyncio.Semaphore) -> bool:
    h = line_hash(line["text"], voice)
    mp3 = OUT / f"{line['id']}.mp3"
    js = OUT / f"{line['id']}.json"
    if manifest.get(line["id"]) == h and mp3.exists() and js.exists():
        return False
    async with sem:
        for attempt in range(3):
            try:
                audio, bounds = await synth(line["text"], voice)
                break
            except Exception:
                if attempt == 2:
                    raise
                await asyncio.sleep(2 * (attempt + 1))
    mp3.write_bytes(audio)
    js.write_text(json.dumps({"text": line["text"], "words": match_words(line["text"], bounds)}), encoding="utf-8")
    manifest[line["id"]] = h
    return True


async def main() -> None:
    lines = json.loads(LINES.read_text(encoding="utf-8"))
    voice = json.loads(VOICE.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    sem = asyncio.Semaphore(4)
    try:
        made = await asyncio.gather(*(build_one(l, voice, manifest, sem) for l in lines))
    finally:
        keep = {l["id"] for l in lines}
        for k in list(manifest):
            if k not in keep:
                del manifest[k]
        MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True), encoding="utf-8")
    removed = 0
    for f in OUT.iterdir():
        if f.name != "manifest.json" and f.stem not in keep:
            f.unlink()
            removed += 1
    print(f"{sum(made)} generated, {len(lines) - sum(made)} unchanged, {removed} stale files removed")


if __name__ == "__main__":
    asyncio.run(main())
```

Run: `python -m pytest tests_py -q` → 4 passed

- [ ] **Step 3: scripts/voice_samples.py**

```python
"""Make short samples of candidate voices so the parent can choose one."""
import asyncio
import pathlib

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "voice-samples"
VOICES = ["en-US-AvaNeural", "en-US-EmmaNeural", "en-US-JennyNeural", "en-US-AndrewNeural"]
TEXT = ("This is a yield sign. Yield means: let the other cars go first. "
        "Slow down as you get close. If a car is coming, stop and wait.")
RATE = "-10%"


async def main() -> None:
    OUT.mkdir(exist_ok=True)
    for v in VOICES:
        await edge_tts.Communicate(TEXT, v, rate=RATE).save(str(OUT / f"{v}.mp3"))
    rows = "\n".join(f'<p><b>{i + 1}. {v.split("-")[2].replace("Neural", "")}</b><br><audio controls src="{v}.mp3"></audio></p>'
                     for i, v in enumerate(VOICES))
    (OUT / "index.html").write_text(f"<!doctype html><meta charset=utf-8><title>Voices</title>"
                                    f"<body style='font:20px system-ui;margin:40px'><h1>Pick a voice</h1>{rows}</body>",
                                    encoding="utf-8")
    print(OUT / "index.html")


if __name__ == "__main__":
    asyncio.run(main())
```

Run: `python scripts/voice_samples.py`

- [ ] **Step 4: CHECKPOINT — the parent chooses a voice**

Tell the user to open `voice-samples/index.html` (for example `start voice-samples/index.html` from PowerShell) and pick 1–4. Also ask whether the speed is right (the samples are 10% slower than normal). Write their choice:

`content/voice.json`:
```json
{ "voice": "en-US-AvaNeural", "rate": "-10%" }
```
(replace with the chosen voice/rate)

- [ ] **Step 5: Run the pipeline**

Run: `npm run audio` → e.g. `240 generated, 0 unchanged, 0 stale files removed` (phrases + score lines)
Run: `npm run audio` again → `0 generated, 240 unchanged, 0 stale files removed`

- [ ] **Step 6: Commit**

```bash
git add scripts/build_audio.py scripts/voice_samples.py tests_py content/voice.json content/audio-lines.json public/audio
git commit -m "feat: neural-voice audio generation with word timings"
```

---

### Task 6: Yield lesson (worked example) + authoring guide

**Goal:** Create the first complete lesson with verified citations and generated audio, plus `content/AUTHORING.md`, which every later lesson task follows.

**Files:**
- Create: `content/lessons/yield.yaml`, `content/AUTHORING.md`
- Modify: `content/audio-lines.json`, `public/audio/*` (generated)

**Acceptance Criteria:**
- [ ] `npm run check -- --audio` passes
- [ ] AUTHORING.md contains the reading-level, citation, scene, and question rules below

**Verify:** `npm run check -- --audio` → `OK: 1 lessons, 3 questions (1 sign questions), 0 picture-only sources for parent review`

**Steps:**

- [ ] **Step 1: content/lessons/yield.yaml**

```yaml
id: yield
order: 2
title: Yield
icon: "🔻"
cards:
  - id: yield-1
    say: "This is a yield sign. Yield means: let the other cars go first."
    scene: yield-intersection
    step: show-sign
    source:
      page: 29
      quote: "Prepare to stop and yield the right-of-way to vehicles and pedestrians in or heading toward the intersection."
  - id: yield-2
    say: "When you see a yield sign, slow down as you get close."
    scene: yield-intersection
    step: slow-down
    source:
      page: 29
      quote: "Decrease speed as you reach the intersection."
  - id: yield-3
    say: "If a car is coming, stop and wait. Let it go first. When it is gone, you can go."
    scene: yield-intersection
    step: wait-then-go
    source:
      page: 29
      quote: "You must come to a full stop at a YIELD sign if traffic conditions require it."
questions:
  - id: yield-q1
    ask: "You are the blue car. There is a yield sign. Who goes first?"
    scene: yield-intersection
    step: question-freeze
    choices: ["The blue car. That is you.", "The red car."]
    answer: 1
    explainCard: yield-3
    source:
      page: 29
      quote: "Prepare to stop and yield the right-of-way to vehicles and pedestrians in or heading toward the intersection."
  - id: yield-q2
    ask: "What should you do when you get close to a yield sign?"
    scene: sign-yield
    step: show
    choices: ["Speed up.", "Slow down.", "Honk your horn.", "Turn around."]
    answer: 1
    explainCard: yield-2
    source:
      page: 29
      quote: "Decrease speed as you reach the intersection."
  - id: yield-q3
    ask: "What does this sign tell you to do?"
    scene: sign-yield
    step: show
    choices: ["Stop every time, even if no one is coming.", "Let other cars go first.", "Do not turn.", "Go faster."]
    answer: 1
    explainCard: yield-1
    signQuestion: true
    source:
      page: 29
      quote: "Prepare to stop and yield the right-of-way to vehicles and pedestrians in or heading toward the intersection."
```

- [ ] **Step 2: content/AUTHORING.md**

````markdown
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

## Questions
- 3–6 per lesson. At least half should have 4 choices, like the real test.
- Wrong choices must be clearly wrong according to the manual, not tricky.
- `explainCard` is the card that teaches the answer; it replays when she misses.
- `signQuestion: true` for "what does this sign mean / what shape / what color" questions. The practice test needs at least 4 of these across all lessons.
- The practice test mixes questions from all lessons, so each question must make sense on its own.

## Scenes
- Reuse `fourWay()` / `stopPose()` / `FOURWAY` / `signCloseup()` from `src/scenes/layouts.ts`, and build new layouts there when a lesson needs a different road.
- Every step that shows waiting or stopping must have `expect` entries (`stopsBehind`, `entersAfter`) so the checker proves the behavior.
- Steps play while the matching card is spoken. Make each step about as long as its narration (about 350 ms per word, at least 2500 ms).
- Question steps are usually a still frame: use `at` to place cars, with a short `duration` (500 ms).
- After writing scenes, run `npm test` and `npm run shots -- <scene-id>`, then **look at every PNG**. A scene that passes the checker can still look wrong, e.g. a sign on the wrong side or a car that looks like it's in the grass.

## Checklist for a new lesson
1. Read the manual pages for the topic in `content/manual/mv21.txt`.
2. Write scenes in `src/scenes/defs/<lesson>.ts`, export a `<lesson>Scenes` array, and add it to `ALL` in `src/scenes/registry.ts`.
3. Write `content/lessons/<lesson>.yaml`.
4. `npm test` (scene checks) and `npm run check` (citations).
5. `npm run shots -- <each scene id>` and inspect the images.
6. `npm run audio`, then `npm run check -- --audio`.
7. Commit.
````

- [ ] **Step 3: Validate, generate audio, validate audio**

Run: `npm run check` → `OK: 1 lessons, 3 questions (1 sign questions), 0 picture-only sources for parent review`
Run: `npm run audio` → `N generated, …`
Run: `npm run check -- --audio` → OK

- [ ] **Step 4: Commit**

```bash
git add content public/audio
git commit -m "feat: yield lesson with manual citations and narration; authoring guide"
```

---

### Task 7: Progress store and practice test logic

**Goal:** Build the pure logic for saving progress, choosing the next lesson, tracking missed questions, and assembling and scoring a practice test under the manual's rule (at least 14 of 20 correct, including 2 of the 4 sign questions).

**Files:**
- Create: `src/progress/store.ts`, `src/practice/assemble.ts`
- Test: `tests/progress.test.ts`, `tests/practice.test.ts`

**Acceptance Criteria:**
- [ ] Progress survives reload through the KV store; corrupt data resets to empty; storage failures don't throw
- [ ] `nextLesson` returns the first incomplete lesson by order, or the first lesson when all are done
- [ ] `assembleTest` gives min(20, pool) questions, including min(4, signPool) sign questions, with no duplicates, and weights missed questions higher
- [ ] `scoreTest` applies the manual's rule for a full 20/4 test and a 70% rule for smaller pools

**Verify:** `npx vitest run tests/progress.test.ts tests/practice.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Failing tests**

`tests/progress.test.ts`:
```ts
import { describe, test, expect } from 'vitest';
import { ProgressStore, type KV } from '../src/progress/store';

const memKV = (init: Record<string, string> = {}): KV & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};
const lessons = [{ id: 'signs', order: 1 }, { id: 'yield', order: 2 }, { id: 'lights', order: 3 }];

describe('ProgressStore', () => {
  test('starts empty and saves completions', () => {
    const kv = memKV();
    const p = new ProgressStore(kv);
    expect(p.isCompleted('signs')).toBe(false);
    p.completeLesson('signs');
    expect(new ProgressStore(kv).isCompleted('signs')).toBe(true);
  });
  test('nextLesson is the first incomplete by order, else the first', () => {
    const p = new ProgressStore(memKV());
    expect(p.nextLesson(lessons)?.id).toBe('signs');
    p.completeLesson('signs');
    expect(p.nextLesson(lessons)?.id).toBe('yield');
    p.completeLesson('yield'); p.completeLesson('lights');
    expect(p.nextLesson(lessons)?.id).toBe('signs');
  });
  test('missed questions are tracked without duplicates', () => {
    const p = new ProgressStore(memKV());
    p.markMissed('q1'); p.markMissed('q1'); p.markMissed('q2');
    expect(p.missed()).toEqual(['q1', 'q2']);
    p.clearMissed('q1');
    expect(p.missed()).toEqual(['q2']);
  });
  test('corrupt data resets', () => {
    const p = new ProgressStore(memKV({ [ProgressStore.KEY]: '{not json' }));
    expect(p.missed()).toEqual([]);
  });
  test('storage that throws does not break the app', () => {
    const kv: KV = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const p = new ProgressStore(kv);
    expect(() => p.completeLesson('signs')).not.toThrow();
    expect(p.isCompleted('signs')).toBe(true);
  });
});
```

`tests/practice.test.ts`:
```ts
import { describe, test, expect } from 'vitest';
import { assembleTest, scoreTest } from '../src/practice/assemble';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pool = (n: number, signs: number) =>
  Array.from({ length: n }, (_, i) => ({ q: { id: `q${i}`, signQuestion: i < signs } }));

describe('assembleTest', () => {
  test('20 questions with exactly 4 sign questions and no duplicates', () => {
    const t = assembleTest(pool(60, 10), new Set(), seeded(1));
    expect(t).toHaveLength(20);
    expect(t.filter((x) => x.q.signQuestion)).toHaveLength(4);
    expect(new Set(t.map((x) => x.q.id)).size).toBe(20);
  });
  test('small pool uses everything available', () => {
    const t = assembleTest(pool(7, 2), new Set(), seeded(2));
    expect(t).toHaveLength(7);
    expect(t.filter((x) => x.q.signQuestion)).toHaveLength(2);
  });
  test('missed questions are picked more often', () => {
    let hits = 0;
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) if (assembleTest(pool(60, 10), new Set(['q40']), rng).some((x) => x.q.id === 'q40')) hits++;
    // unweighted chance is 16/50 = 32%; weighted should be clearly higher
    expect(hits / 200).toBeGreaterThan(0.5);
  });
});

describe('scoreTest', () => {
  const answers = (correct: number, signCorrect: number) =>
    Array.from({ length: 20 }, (_, i) => i < 4
      ? { correct: i < signCorrect, sign: true }
      : { correct: i - 4 < correct - signCorrect, sign: false });
  test('14 right with 2 signs passes', () => {
    expect(scoreTest(answers(14, 2))).toMatchObject({ correct: 14, total: 20, signCorrect: 2, passed: true });
  });
  test('13 right fails', () => expect(scoreTest(answers(13, 4)).passed).toBe(false));
  test('18 right but only 1 sign fails', () => expect(scoreTest(answers(18, 1)).passed).toBe(false));
  test('small test uses 70%', () => {
    expect(scoreTest([{ correct: true, sign: false }, { correct: true, sign: false }, { correct: false, sign: false }]).passed).toBe(false);
    expect(scoreTest([{ correct: true, sign: false }, { correct: true, sign: false }, { correct: true, sign: false }]).passed).toBe(true);
  });
});
```

Run: `npx vitest run tests/progress.test.ts tests/practice.test.ts` → FAIL

- [ ] **Step 2: src/progress/store.ts**

```ts
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
interface Data { completed: string[]; missed: string[] }

export function safeStorage(): KV {
  try {
    const s = window.localStorage;
    s.setItem('__probe', '1');
    s.removeItem('__probe');
    return s;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
  }
}

export class ProgressStore {
  static readonly KEY = 'permit-progress-v1';
  private data: Data;

  constructor(private kv: KV) { this.data = this.load(); }

  private load(): Data {
    try {
      const raw = this.kv.getItem(ProgressStore.KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d && Array.isArray(d.completed) && Array.isArray(d.missed)) return { completed: d.completed, missed: d.missed };
    } catch { /* fall through */ }
    return { completed: [], missed: [] };
  }

  private save(): void {
    try { this.kv.setItem(ProgressStore.KEY, JSON.stringify(this.data)); } catch { /* keep working without saving */ }
  }

  isCompleted(id: string): boolean { return this.data.completed.includes(id); }
  completeLesson(id: string): void { if (!this.isCompleted(id)) { this.data.completed.push(id); this.save(); } }
  nextLesson<T extends { id: string; order: number }>(lessons: T[]): T | undefined {
    const sorted = [...lessons].sort((a, b) => a.order - b.order);
    return sorted.find((l) => !this.isCompleted(l.id)) ?? sorted[0];
  }
  missed(): string[] { return [...this.data.missed]; }
  markMissed(qid: string): void { if (!this.data.missed.includes(qid)) { this.data.missed.push(qid); this.save(); } }
  clearMissed(qid: string): void {
    const n = this.data.missed.length;
    this.data.missed = this.data.missed.filter((x) => x !== qid);
    if (this.data.missed.length !== n) this.save();
  }
}
```

- [ ] **Step 3: src/practice/assemble.ts**

```ts
export interface TestItem { q: { id: string; signQuestion: boolean } }
export interface TestAnswer { correct: boolean; sign: boolean }
export interface TestScore { correct: number; total: number; signCorrect: number; signTotal: number; passed: boolean }

export const TEST_SIZE = 20;
export const SIGN_COUNT = 4;
const MISSED_WEIGHT = 4;

/** Weighted sampling without replacement (Efraimidis–Spirakis). */
function pick<T extends TestItem>(items: T[], n: number, missed: Set<string>, rng: () => number): T[] {
  return items
    .map((it) => ({ it, key: rng() ** (1 / (missed.has(it.q.id) ? MISSED_WEIGHT : 1)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, n)
    .map((x) => x.it);
}

export function assembleTest<T extends TestItem>(pool: T[], missed: Set<string>, rng: () => number = Math.random): T[] {
  const signs = pool.filter((p) => p.q.signQuestion);
  const others = pool.filter((p) => !p.q.signQuestion);
  const s = pick(signs, Math.min(SIGN_COUNT, signs.length), missed, rng);
  const o = pick(others, Math.min(TEST_SIZE - s.length, others.length), missed, rng);
  const all = [...s, ...o];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export function scoreTest(answers: TestAnswer[]): TestScore {
  const total = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  const signTotal = answers.filter((a) => a.sign).length;
  const signCorrect = answers.filter((a) => a.sign && a.correct).length;
  const passed = total === TEST_SIZE && signTotal === SIGN_COUNT
    ? correct >= 14 && signCorrect >= 2 // manual p.10
    : correct >= Math.ceil(total * 0.7) && (signTotal === 0 || signCorrect >= Math.ceil(signTotal / 2));
  return { correct, total, signCorrect, signTotal, passed };
}
```

Run: `npx vitest run tests/progress.test.ts tests/practice.test.ts` → PASS

- [ ] **Step 4: Commit**

```bash
git add src/progress src/practice tests/progress.test.ts tests/practice.test.ts
git commit -m "feat: progress store and practice test assembly/scoring (manual p.10 rule)"
```

---

### Task 8: App UI (screens, audio player, captions) + e2e test

**Goal:** Build the whole learner-facing app from the approved mockup: Home, Learn, Question (read aloud, gentle feedback), Lesson end, Practice test, and Results. A 🏠 button on every screen cancels the current flow.

**Files:**
- Create: `src/audio/player.ts`, `src/ui/caption.ts`, `src/screens/ctx.ts`, `src/screens/home.ts`, `src/screens/learn.ts`, `src/screens/question.ts`, `src/screens/lessonEnd.ts`, `src/screens/practice.ts`, `src/screens/results.ts`, `src/app.ts`, `playwright.config.ts`, `e2e/lesson.spec.ts`
- Modify: `src/main.ts`, `src/styles.css`

**Acceptance Criteria:**
- [ ] Home shows lesson tiles (✓ when done, glow on next), ▶ Keep going, and 📝 Practice test
- [ ] Learn: narration and step animation start together; the caption words highlight in time; ▶ Next unlocks only after both finish; 🔁 replays both; 🔊 replays the audio
- [ ] Question: reads the question, then "Number N" + each choice with that tile highlighted; tapping interrupts reading. Correct answer: "Yes! …". First miss: "Not quite. Let's watch again", the explain card replays, and the question is asked again. Second miss: the right answer is shown and spoken, then Next
- [ ] Practice test: no feedback; results screen speaks the score and pass/not yet; optional review of missed questions
- [ ] If audio fails, the 🔊 button pulses and Next unlocks after 3 s
- [ ] 🏠 always returns home
- [ ] e2e passes

**Verify:** `npm run e2e` → PASS; `npx tsc --noEmit` → clean; manual run through `npm run dev` in Edge

**Steps:**

- [ ] **Step 1: src/audio/player.ts**

```ts
interface WordTiming { i: number; start: number; end: number }

export class AudioPlayer {
  private audio = new Audio();
  private words = new Map<string, WordTiming[]>();
  private cancelCurrent: (() => void) | null = null;

  constructor(private base: string) { this.audio.preload = 'auto'; }

  private async timings(id: string): Promise<WordTiming[]> {
    if (!this.words.has(id)) {
      try {
        const r = await fetch(`${this.base}audio/${id}.json`);
        this.words.set(id, r.ok ? ((await r.json()).words as WordTiming[]) : []);
      } catch { this.words.set(id, []); }
    }
    return this.words.get(id)!;
  }

  /** Resolves when the clip ends. Rejects with AbortError if aborted or replaced by another play(), or with Error if it fails. */
  async play(id: string, signal: AbortSignal, onWord?: (i: number) => void): Promise<void> {
    this.cancelCurrent?.();
    if (signal.aborted) throw signal.reason;
    const words = onWord ? await this.timings(id) : [];
    if (signal.aborted) throw signal.reason;
    const a = this.audio;
    a.pause();
    a.src = `${this.base}audio/${id}.mp3`;
    await new Promise<void>((resolve, reject) => {
      let raf = 0;
      let settled = false;
      const done = (err?: unknown) => {
        if (settled) return;
        settled = true;
        cancelAnimationFrame(raf);
        a.onended = null;
        a.onerror = null;
        signal.removeEventListener('abort', onAbort);
        if (this.cancelCurrent === cancel) this.cancelCurrent = null;
        onWord?.(-1);
        if (err) reject(err); else resolve();
      };
      const onAbort = () => { a.pause(); done(signal.reason); };
      const cancel = () => { a.pause(); done(new DOMException('replaced', 'AbortError')); };
      this.cancelCurrent = cancel;
      const tick = () => {
        const ms = a.currentTime * 1000;
        let cur = -1;
        for (const w of words) if (ms >= w.start) cur = w.i;
        onWord?.(cur);
        raf = requestAnimationFrame(tick);
      };
      a.onended = () => done();
      a.onerror = () => done(new Error(`audio failed: ${id}`));
      signal.addEventListener('abort', onAbort, { once: true });
      a.play().then(() => { if (onWord && !settled) raf = requestAnimationFrame(tick); }, (e) => done(e));
    });
  }

  stop(): void { this.cancelCurrent?.(); this.audio.pause(); }
}
```

- [ ] **Step 2: src/ui/caption.ts**

```ts
import { h } from './dom';

/** Text split on whitespace into word spans; indexes match build_audio.py's text.split(). */
export class Caption {
  readonly el: HTMLDivElement;
  private words: HTMLSpanElement[] = [];

  constructor(text: string, cls = 'caption') {
    this.el = h('div', { class: cls });
    this.words = text.split(/\s+/).filter(Boolean).map((w) => h('span', { class: 'w' }, w));
    this.words.forEach((s, i) => { if (i) this.el.append(' '); this.el.append(s); });
  }

  highlight(i: number): void { this.words.forEach((s, j) => s.classList.toggle('hl', j === i)); }
}
```

- [ ] **Step 3: src/screens/ctx.ts**

```ts
import type { AudioPlayer } from '../audio/player';
import type { Caption } from '../ui/caption';
import { h, isAbort } from '../ui/dom';

export interface Ctx { root: HTMLElement; player: AudioPlayer; signal: AbortSignal; goHome: () => void }
export type SpeakResult = 'ok' | 'failed' | 'interrupted';

/** Never rejects unless the whole flow (ctx.signal) was aborted. */
export async function speak(ctx: Ctx, id: string, caption?: Caption, signal: AbortSignal = ctx.signal): Promise<SpeakResult> {
  try {
    await ctx.player.play(id, signal, caption ? (i) => caption.highlight(i) : undefined);
    return 'ok';
  } catch (e) {
    if (ctx.signal.aborted) throw e;
    if (isAbort(e)) return 'interrupted';
    console.warn(e);
    return 'failed';
  }
}

export function topBar(ctx: Ctx, fraction: number): HTMLElement {
  const home = h('button', { class: 'btn soft icon', 'aria-label': 'Home' }, '🏠');
  home.addEventListener('click', () => ctx.goHome());
  const bar = h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(fraction * 100)}%` }));
  return h('div', { class: 'top' }, home, bar);
}
```

- [ ] **Step 4: src/screens/home.ts**

```ts
import type { Lesson } from '../content/types';
import type { ProgressStore } from '../progress/store';
import { h } from '../ui/dom';
import { speak, type Ctx } from './ctx';

export type HomeChoice = { kind: 'lesson'; lesson: Lesson } | { kind: 'practice' };

export function showHome(ctx: Ctx, lessons: Lesson[], progress: ProgressStore): Promise<HomeChoice> {
  const next = progress.nextLesson(lessons);
  const tiles = lessons.map((l) => {
    const cls = ['lesson-tile', progress.isCompleted(l.id) ? 'done' : '', l === next ? 'next' : ''].filter(Boolean).join(' ');
    return h('button', { class: cls }, h('span', { class: 'icon' }, l.icon), h('span', {}, l.title));
  });
  const keep = h('button', { class: 'btn go' }, '▶ Keep going');
  const practice = h('button', { class: 'btn soft' }, '📝 Practice test');
  if (!next) keep.setAttribute('disabled', '');
  ctx.root.replaceChildren(h('div', { class: 'home-grid' }, ...tiles), h('div', { class: 'bar' }, keep, practice));
  void speak(ctx, 'phrase-home').catch(() => {});
  return new Promise((resolve, reject) => {
    keep.addEventListener('click', () => next && resolve({ kind: 'lesson', lesson: next }));
    practice.addEventListener('click', () => resolve({ kind: 'practice' }));
    tiles.forEach((t, i) => t.addEventListener('click', () => resolve({ kind: 'lesson', lesson: lessons[i] })));
    ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason), { once: true });
  });
}
```

- [ ] **Step 5: src/screens/learn.ts**

```ts
import type { Card } from '../content/types';
import { audioId } from '../content/audioLines';
import { getScene, stepIndexOf } from '../scenes/registry';
import { ScenePlayer } from '../scenes/render';
import { Caption } from '../ui/caption';
import { clicked, delay, h } from '../ui/dom';
import { speak, topBar, type Ctx } from './ctx';

const AUDIO_FAIL_UNLOCK_MS = 3000;

/** Plays a card's narration and its scene step together. Resolves when both are done. */
export async function playCard(ctx: Ctx, card: Card, stage: HTMLElement, caption: Caption): Promise<'ok' | 'failed' | 'interrupted'> {
  const scene = getScene(card.scene);
  const player = new ScenePlayer(stage, scene);
  const [said] = await Promise.all([speak(ctx, audioId.card(card), caption), player.play(stepIndexOf(scene, card.step))]);
  return said;
}

export async function learnCard(ctx: Ctx, card: Card, fraction: number): Promise<void> {
  const stage = h('div', { class: 'stage' });
  const caption = new Caption(card.say);
  const say = h('button', { class: 'btn soft icon', 'aria-label': 'Hear again' }, '🔊');
  const again = h('button', { class: 'btn soft' }, '🔁 Watch again');
  const next = h('button', { class: 'btn go', disabled: '' }, '▶ Next');
  ctx.root.replaceChildren(topBar(ctx, fraction), stage, caption.el, h('div', { class: 'bar' }, say, again, next));

  let run = 0;
  const go = async () => {
    const mine = ++run;
    const said = await playCard(ctx, card, stage, caption);
    if (mine !== run) return;
    if (said === 'failed') {
      say.classList.add('retry-big');
      await delay(AUDIO_FAIL_UNLOCK_MS, ctx.signal);
    }
    next.removeAttribute('disabled');
  };
  say.addEventListener('click', () => {
    say.classList.remove('retry-big');
    void speak(ctx, audioId.card(card), caption).catch(() => {});
  });
  again.addEventListener('click', () => void go().catch(() => {}));
  void go().catch(() => {});
  try {
    await clicked(next, ctx.signal);
  } finally {
    ctx.player.stop();
  }
}
```

- [ ] **Step 6: src/screens/question.ts**

```ts
import type { Lesson, Question } from '../content/types';
import { audioId, PHRASES, TEXT } from '../content/audioLines';
import { getScene, stepIndexOf } from '../scenes/registry';
import { ScenePlayer } from '../scenes/render';
import { Caption } from '../ui/caption';
import { childController, chooseOne, clicked, delay, h } from '../ui/dom';
import { playCard } from './learn';
import { speak, topBar, type Ctx } from './ctx';

export type QuestionMode = 'teach' | 'test';

/** Returns true if answered correctly on the first try. */
export async function askQuestion(ctx: Ctx, lesson: Lesson, q: Question, mode: QuestionMode, fraction: number): Promise<boolean> {
  const stage = h('div', { class: 'stage' });
  const showQuestionScene = () => {
    const scene = getScene(q.scene);
    const si = stepIndexOf(scene, q.step);
    new ScenePlayer(stage, scene).showFrame(si, scene.steps[si].duration);
  };
  showQuestionScene();

  const ask = new Caption(q.ask);
  const askSay = h('button', { class: 'btn soft icon', 'aria-label': 'Hear the question' }, '🔊');
  const feedback = h('div', { class: 'feedback' });
  const caps = q.choices.map((c) => new Caption(c, 'choice-text'));
  let reader = childController(ctx.signal);

  const readChoice = async (i: number, signal: AbortSignal) => {
    tiles[i].classList.add('reading');
    try {
      if ((await speak(ctx, `phrase-num-${i + 1}`, undefined, signal)) === 'interrupted') return 'interrupted';
      return await speak(ctx, audioId.choice(q, i), caps[i], signal);
    } finally {
      tiles[i].classList.remove('reading');
    }
  };
  const readAll = async (signal: AbortSignal) => {
    if ((await speak(ctx, audioId.ask(q), ask, signal)) === 'interrupted') return;
    for (let i = 0; i < tiles.length; i++) if ((await readChoice(i, signal)) === 'interrupted') return;
  };

  const tiles = q.choices.map((_, i) => {
    const say = h('span', { class: 'say', role: 'button', 'aria-label': 'Hear this answer' }, '🔊');
    say.addEventListener('click', (e) => { e.stopPropagation(); void readChoice(i, reader.signal).catch(() => {}); });
    return h('button', { class: 'tile' }, h('span', { class: 'num' }, String(i + 1)), caps[i].el, say);
  });
  askSay.addEventListener('click', () => void speak(ctx, audioId.ask(q), ask, reader.signal).catch(() => {}));

  ctx.root.replaceChildren(
    topBar(ctx, fraction), stage,
    h('div', { class: 'ask-row' }, ask.el, askSay),
    h('div', { class: 'tiles' }, ...tiles),
    feedback,
  );

  let tries = 0;
  for (;;) {
    reader = childController(ctx.signal);
    void readAll(reader.signal).catch(() => {});
    const open = tiles.filter((t) => !t.hasAttribute('disabled'));
    const pick = tiles.indexOf(open[await chooseOne(open, ctx.signal)]);
    reader.abort();

    if (mode === 'test') {
      tiles[pick].classList.add('picked');
      await delay(400, ctx.signal);
      return pick === q.answer;
    }
    if (pick === q.answer) {
      tiles[pick].classList.add('right');
      const yes = new Caption(TEXT.yes(q));
      feedback.className = 'feedback good';
      feedback.replaceChildren(yes.el);
      await speak(ctx, audioId.yes(q), yes);
      await delay(600, ctx.signal);
      return tries === 0;
    }

    tries++;
    tiles[pick].classList.add('tried');
    tiles[pick].setAttribute('disabled', '');
    if (tries === 1) {
      // Lock all tiles during the replay so a tap can't be silently lost.
      tiles.forEach((t) => t.setAttribute('disabled', ''));
      const nq = new Caption(PHRASES['phrase-not-quite']);
      feedback.className = 'feedback';
      feedback.replaceChildren(nq.el);
      await speak(ctx, 'phrase-not-quite', nq);
      const card = lesson.cards.find((c) => c.id === q.explainCard)!;
      const cap = new Caption(card.say);
      feedback.replaceChildren(cap.el);
      await playCard(ctx, card, stage, cap);
      feedback.replaceChildren();
      showQuestionScene();
      tiles.forEach((t) => { if (!t.classList.contains('tried')) t.removeAttribute('disabled'); });
      continue;
    }

    tiles[q.answer].classList.add('right');
    const ans = new Caption(TEXT.answerIs(q));
    feedback.className = 'feedback';
    feedback.replaceChildren(ans.el);
    await speak(ctx, audioId.answerIs(q), ans);
    const next = h('button', { class: 'btn go' }, '▶ Next');
    ctx.root.append(h('div', { class: 'bar' }, next));
    await clicked(next, ctx.signal);
    return false;
  }
}
```

- [ ] **Step 7: lessonEnd.ts, results.ts, practice.ts**

`src/screens/lessonEnd.ts`:
```ts
import type { Lesson } from '../content/types';
import { audioId, TEXT } from '../content/audioLines';
import { Caption } from '../ui/caption';
import { clicked, h } from '../ui/dom';
import { speak, type Ctx } from './ctx';

export async function lessonEnd(ctx: Ctx, lesson: Lesson): Promise<void> {
  const cap = new Caption(TEXT.lessonEnd(lesson));
  const home = h('button', { class: 'btn go' }, '🏠 Home');
  ctx.root.replaceChildren(h('div', { class: 'big-center' }, h('div', { class: 'huge' }, '✅'), cap.el), h('div', { class: 'bar' }, home));
  void speak(ctx, audioId.lessonEnd(lesson), cap).catch(() => {});
  await clicked(home, ctx.signal);
}
```

`src/screens/results.ts`:
```ts
import { audioId, PHRASES, TEXT } from '../content/audioLines';
import type { TestScore } from '../practice/assemble';
import { Caption } from '../ui/caption';
import { chooseOne, h } from '../ui/dom';
import { speak, type Ctx } from './ctx';

export async function showResults(ctx: Ctx, s: TestScore, canReview: boolean): Promise<'home' | 'review'> {
  const score = new Caption(TEXT.score(s.correct, s.total));
  const verdictId = s.passed ? 'phrase-passed' : 'phrase-not-yet';
  const verdict = new Caption(PHRASES[verdictId]);
  const home = h('button', { class: 'btn soft' }, '🏠 Home');
  const review = h('button', { class: 'btn go' }, '🔁 Practice the ones I missed');
  const buttons = canReview ? [review, home] : [home];
  ctx.root.replaceChildren(
    h('div', { class: 'big-center' }, h('div', { class: 'huge' }, s.passed ? '🎉' : '💪'), score.el, verdict.el),
    h('div', { class: 'bar' }, ...buttons),
  );
  void (async () => {
    await speak(ctx, audioId.score(s.correct, s.total), score);
    await speak(ctx, verdictId, verdict);
  })().catch(() => {});
  const i = await chooseOne(buttons, ctx.signal);
  return buttons[i] === review ? 'review' : 'home';
}
```

`src/screens/practice.ts`:
```ts
import type { Lesson } from '../content/types';
import { PHRASES } from '../content/audioLines';
import { assembleTest, scoreTest, type TestAnswer } from '../practice/assemble';
import type { ProgressStore } from '../progress/store';
import { Caption } from '../ui/caption';
import { clicked, h } from '../ui/dom';
import { speak, type Ctx } from './ctx';
import { askQuestion } from './question';
import { showResults } from './results';

export async function runPractice(ctx: Ctx, lessons: Lesson[], progress: ProgressStore): Promise<void> {
  const intro = new Caption(PHRASES['phrase-test-start']);
  const start = h('button', { class: 'btn go' }, '▶ Start');
  ctx.root.replaceChildren(h('div', { class: 'big-center' }, h('div', { class: 'huge' }, '📝'), intro.el), h('div', { class: 'bar' }, start));
  void speak(ctx, 'phrase-test-start', intro).catch(() => {});
  await clicked(start, ctx.signal);
  ctx.player.stop();

  const pool = lessons.flatMap((lesson) => lesson.questions.map((q) => ({ q, lesson })));
  const test = assembleTest(pool, new Set(progress.missed()));
  const answers: TestAnswer[] = [];
  for (const [i, item] of test.entries()) {
    const ok = await askQuestion(ctx, item.lesson, item.q, 'test', i / test.length);
    answers.push({ correct: ok, sign: item.q.signQuestion });
    if (ok) progress.clearMissed(item.q.id); else progress.markMissed(item.q.id);
  }
  const missed = test.filter((_, i) => !answers[i].correct);
  if ((await showResults(ctx, scoreTest(answers), missed.length > 0)) !== 'review') return;

  const cap = new Caption(PHRASES['phrase-review-missed']);
  ctx.root.replaceChildren(h('div', { class: 'big-center' }, cap.el));
  await speak(ctx, 'phrase-review-missed', cap);
  for (const [i, item] of missed.entries()) {
    if (await askQuestion(ctx, item.lesson, item.q, 'teach', i / missed.length)) progress.clearMissed(item.q.id);
  }
}
```

- [ ] **Step 8: app.ts, main.ts**

`src/app.ts`:
```ts
import type { Lesson } from './content/types';
import { AudioPlayer } from './audio/player';
import { ProgressStore, safeStorage } from './progress/store';
import { isAbort } from './ui/dom';
import type { Ctx } from './screens/ctx';
import { showHome } from './screens/home';
import { learnCard } from './screens/learn';
import { askQuestion } from './screens/question';
import { lessonEnd } from './screens/lessonEnd';
import { runPractice } from './screens/practice';

export class App {
  private player = new AudioPlayer(import.meta.env.BASE_URL);
  private progress = new ProgressStore(safeStorage());

  constructor(private root: HTMLElement, private lessons: Lesson[]) {}

  private newCtx(): Ctx {
    const c = new AbortController();
    return { root: this.root, player: this.player, signal: c.signal, goHome: () => c.abort() };
  }

  async start(): Promise<never> {
    for (;;) {
      const ctx = this.newCtx();
      try {
        const choice = await showHome(ctx, this.lessons, this.progress);
        this.player.stop();
        if (choice.kind === 'lesson') await this.runLesson(ctx, choice.lesson);
        else await runPractice(ctx, this.lessons, this.progress);
      } catch (e) {
        if (!isAbort(e)) console.error(e);
      } finally {
        this.player.stop();
      }
    }
  }

  private async runLesson(ctx: Ctx, lesson: Lesson): Promise<void> {
    const total = lesson.cards.length + lesson.questions.length;
    let n = 0;
    for (const card of lesson.cards) await learnCard(ctx, card, n++ / total);
    for (const q of lesson.questions) {
      const ok = await askQuestion(ctx, lesson, q, 'teach', n++ / total);
      if (ok) this.progress.clearMissed(q.id); else this.progress.markMissed(q.id);
    }
    this.progress.completeLesson(lesson.id);
    await lessonEnd(ctx, lesson);
  }
}
```

`src/main.ts`:
```ts
import './styles.css';
import { loadLessons } from './content/load';
import { App } from './app';

void new App(document.getElementById('app')!, loadLessons()).start();
```

- [ ] **Step 9: styles.css.** Replace the temporary top section, above the `/* ---- scenes ---- */` block added in Task 3, with:

```css
:root {
  --bg: #fdfaf3; --ink: #222; --go: #43a047; --soft: #e3f2fd; --soft-ink: #1565c0;
  --hl: #fff59d; --you: #1e88e5; --radius: 14px;
  font-family: "Segoe UI", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); }
#app { max-width: 960px; margin: 0 auto; padding: 12px 16px; min-height: 100vh; display: flex; flex-direction: column; gap: 12px; }
.top { display: flex; align-items: center; gap: 12px; }
.progress { flex: 1; height: 14px; background: #e0e0e0; border-radius: 7px; overflow: hidden; }
.progress > i { display: block; height: 100%; background: var(--go); }
.btn { font: inherit; font-size: 24px; font-weight: 700; border: 0; border-radius: var(--radius); padding: 14px 20px; cursor: pointer; min-height: 64px; }
.btn.go { background: var(--go); color: #fff; }
.btn.soft { background: var(--soft); color: var(--soft-ink); border: 2px solid #90caf9; }
.btn.icon { min-width: 64px; flex: 0 0 auto; }
.btn[disabled] { opacity: 0.35; cursor: default; }
.retry-big { outline: 6px solid #fbc02d; animation: pulse 1s infinite; }
@keyframes pulse { 50% { outline-color: var(--hl); } }
.bar { display: flex; gap: 12px; }
.bar .btn { flex: 1; }
.stage { background: #8bc34a; border-radius: var(--radius); overflow: hidden; display: flex; justify-content: center; }
.stage svg { max-height: 52vh; }
.caption { background: #fff; border: 2px solid #eee; border-radius: var(--radius); padding: 12px 16px; font-size: 30px; font-weight: 600; line-height: 1.35; flex: 1; }
.w.hl { background: var(--hl); border-radius: 4px; }
.ask-row { display: flex; gap: 12px; align-items: stretch; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.tile { font: inherit; background: #fff; border: 4px solid #ccc; border-radius: var(--radius); padding: 12px 36px 12px 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 22px; font-weight: 700; color: var(--ink); position: relative; }
.tile .num { background: #333; color: #fff; border-radius: 50%; width: 36px; height: 36px; line-height: 36px; font-size: 20px; }
.tile .say { position: absolute; top: 6px; right: 8px; font-size: 24px; }
.tile.reading { border-color: #fbc02d; box-shadow: 0 0 0 4px var(--hl); }
.tile.right { border-color: var(--go); box-shadow: 0 0 0 4px #c8e6c9; }
.tile.picked { border-color: var(--you); }
.tile.tried, .tile[disabled] { opacity: 0.45; cursor: default; }
.feedback { font-size: 28px; font-weight: 700; text-align: center; }
.feedback .caption { font-size: 28px; }
.feedback.good .caption { border-color: #a5d6a7; background: #e8f5e9; }
.home-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.lesson-tile { font: inherit; background: #fff; border: 3px solid #ccc; border-radius: var(--radius); padding: 12px 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 20px; font-weight: 700; cursor: pointer; position: relative; color: var(--ink); }
.lesson-tile .icon { font-size: 48px; line-height: 1.1; }
.lesson-tile.done::after { content: "✓"; position: absolute; top: 4px; right: 10px; color: var(--go); font-size: 28px; }
.lesson-tile.next { border-color: var(--you); box-shadow: 0 0 0 4px #bbdefb; }
.big-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; }
.big-center .caption { flex: 0 0 auto; }
.huge { font-size: 96px; }
```

- [ ] **Step 10: Manual check in the browser**

Run: `npm run dev`, open `http://localhost:5173/permit-study/` in Edge, and tap the Yield tile. Check each acceptance criterion by hand, including:
- the wrong answer path (pick "The blue car" first)
- 🏠 in the middle of a card
- the practice test (with only 3 questions it uses the 70% rule)

Run the "audio fails" case by temporarily renaming one mp3; restore it afterwards.

- [ ] **Step 11: e2e test**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: {
    channel: 'msedge',
    baseURL: 'http://localhost:5198/permit-study/',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: { command: 'npx vite --port 5198 --strictPort', url: 'http://localhost:5198/permit-study/', reuseExistingServer: true },
});
```

`e2e/lesson.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('yield lesson: cards unlock Next, wrong answer replays, right answer confirms', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Yield/ }).click();

  for (let i = 0; i < 3; i++) {
    const next = page.getByRole('button', { name: /Next/ });
    await expect(next).toBeDisabled();
    await expect(next).toBeEnabled({ timeout: 30_000 });
    await next.click();
  }

  await expect(page.locator('.ask-row .caption')).toContainText('Who goes first?');
  await page.locator('.tile', { hasText: 'The blue car' }).click();
  await expect(page.locator('.feedback')).toContainText('Not quite', { timeout: 10_000 });
  await expect(page.locator('.tile', { hasText: 'The blue car' })).toBeDisabled();
  await page.locator('.tile', { hasText: 'The red car' }).click({ timeout: 40_000 });
  await expect(page.locator('.feedback')).toContainText('Yes!');
});

test('home button leaves a lesson', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Yield/ }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: /Keep going/ })).toBeVisible();
});
```

Run: `npm run e2e` → 2 passed

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: learner app screens with narrated lessons, read-aloud questions, practice test"
```

---

### Task 9: Parent fact-check page

**Goal:** Build `review.html`. For every card and question it shows the scene thumbnail, what the app says, a ▶ Listen button, and the manual quote with a link that opens the manual PDF at that page. Picture-only sources are flagged.

**Files:**
- Create: `review.html`, `src/review/main.ts`
- Modify: `vite.config.ts` (add input), `src/styles.css`

**Acceptance Criteria:**
- [ ] Every card and question in every lesson is listed with its quote and page link
- [ ] The correct answer is marked, and sign questions are labeled
- [ ] Page links open `manual/mv21.pdf#page=N`

**Verify:** `npm run dev`, open `http://localhost:5173/permit-study/review.html`, and check that the yield lesson shows 3 cards and 3 questions and that "Page 29" opens the PDF at page 29.

**Steps:**

- [ ] **Step 1: review.html**

```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Fact check</title></head>
  <body><div id="app" class="review"></div><script type="module" src="/src/review/main.ts"></script></body>
</html>
```

- [ ] **Step 2: src/review/main.ts**

```ts
import '../styles.css';
import { loadLessons } from '../content/load';
import { audioId } from '../content/audioLines';
import type { Source } from '../content/types';
import { getScene, stepIndexOf } from '../scenes/registry';
import { ScenePlayer } from '../scenes/render';
import { h } from '../ui/dom';

const base = import.meta.env.BASE_URL;
const audio = new Audio();
const listen = (id: string) => {
  const b = h('button', { class: 'listen' }, '▶ Listen');
  b.addEventListener('click', () => { audio.src = `${base}audio/${id}.mp3`; void audio.play(); });
  return b;
};
const thumb = (sceneId: string, stepId: string) => {
  const d = h('div', { class: 'thumb' });
  const sc = getScene(sceneId);
  const si = stepIndexOf(sc, stepId);
  new ScenePlayer(d, sc).showFrame(si, sc.steps[si].duration);
  return d;
};
const source = (s: Source) => h('div', { class: 'src' },
  h('a', { href: `${base}manual/mv21.pdf#page=${s.page}`, target: '_blank' }, `Manual page ${s.page}`),
  s.quote ? h('blockquote', {}, s.quote) : h('p', { class: 'figure' }, `⚠ Picture in the manual: ${s.figure}. Please check the picture.`));

const root = document.getElementById('app')!;
root.append(
  h('h1', {}, 'Fact check'),
  h('p', {}, "Left: what the app shows and says. Right: the exact words from the NYS Driver's Manual. Click a page link to open the manual on that page."),
);
for (const l of loadLessons()) {
  root.append(h('h2', {}, `${l.icon} ${l.title}`));
  for (const c of l.cards)
    root.append(h('div', { class: 'row' }, thumb(c.scene, c.step), h('div', {}, h('p', { class: 'say' }, c.say), listen(audioId.card(c))), source(c.source)));
  for (const q of l.questions)
    root.append(h('div', { class: 'row' }, thumb(q.scene, q.step),
      h('div', {},
        h('p', { class: 'say' }, `❓ ${q.ask}${q.signQuestion ? '  (road sign question)' : ''}`),
        h('ol', {}, ...q.choices.map((c, i) => h('li', { class: i === q.answer ? 'correct' : '' }, i === q.answer ? `${c}  ✔ correct` : c))),
        listen(audioId.ask(q))),
      source(q.source)));
}
```

- [ ] **Step 3: vite input + styles**

`vite.config.ts` input becomes:
```ts
      input: { main: r('./index.html'), review: r('./review.html'), preview: r('./scene-preview.html') },
```

Append to `src/styles.css`:
```css
/* ---- parent review page ---- */
#app.review { display: block; max-width: 1200px; font-size: 16px; }
.review .row { display: grid; grid-template-columns: 180px 1fr 1fr; gap: 16px; padding: 12px 0; border-bottom: 1px solid #ddd; align-items: start; }
.review .thumb { background: #8bc34a; border-radius: 8px; overflow: hidden; }
.review .say { font-size: 18px; font-weight: 600; margin: 0 0 6px; }
.review blockquote { margin: 6px 0 0; padding: 8px 10px; background: #fff8e1; border-left: 4px solid #fbc02d; }
.review .figure { color: #b71c1c; font-weight: 600; }
.review .correct { color: #2e7d32; font-weight: 700; }
.review .listen { font: inherit; padding: 4px 10px; border-radius: 6px; border: 1px solid #90caf9; background: #e3f2fd; cursor: pointer; }
```

- [ ] **Step 4: Verify in the browser** (see Verify above), then commit.

```bash
git add -A
git commit -m "feat: parent fact-check page linking every line to the manual"
```

---

### Task 10: Installable app (PWA) + icons

**Goal:** Make Edge offer "Install", with a taskbar icon, a standalone window, and offline caching of the app and all audio.

**Files:**
- Create: `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `scripts/make-icons.ts`
- Modify: `vite.config.ts`, `index.html`

**Acceptance Criteria:**
- [ ] `npm run build` succeeds, and `dist/manifest.webmanifest` and `dist/sw.js` exist
- [ ] `npm run preview` in Edge: the install icon appears in the address bar; after loading once, the app works with DevTools set to "Offline"

**Verify:** `npm run build && ls dist/manifest.webmanifest dist/sw.js` → both listed

**Steps:**

- [ ] **Step 1: public/icon.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1e88e5"/>
  <polygon points="96,150 416,150 256,420" fill="#fff" stroke="#d32f2f" stroke-width="44" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 2: scripts/make-icons.ts**

```ts
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch({ channel: 'msedge' });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written');
```

Run: `npx tsx scripts/make-icons.ts` → `icons written`

- [ ] **Step 3: vite.config.ts** (full file)

```ts
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: '/permit-study/',
  build: {
    rollupOptions: {
      input: { main: r('./index.html'), review: r('./review.html'), preview: r('./scene-preview.html') },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Permit Practice',
        short_name: 'Permit',
        description: 'Learn the NYS learner permit rules with pictures and a friendly voice.',
        start_url: '/permit-study/',
        scope: '/permit-study/',
        display: 'standalone',
        background_color: '#fdfaf3',
        theme_color: '#1e88e5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,json}'],
        globIgnores: ['**/scene-preview.html'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 4: index.html head additions**

```html
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#1e88e5" />
```

- [ ] **Step 5: Build and check offline**

Run: `npm run build` → success. Run: `npm run preview` and open the printed URL in Edge. Confirm that:
- the install icon appears in the address bar
- the app reloads with DevTools → Network → Offline enabled

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: installable offline PWA with icons"
```

---

### Task 11: Publish to GitHub Pages

**Goal:** Put the app online at `https://gotomyrepo.github.io/permit-study/`, redeployed automatically on every push to `main`.

**Files:**
- Create: `.github/workflows/deploy.yml`

**Acceptance Criteria:**
- [ ] **The user has confirmed** creating a *public* repo named `permit-study` under `gotomyrepo`. This is outward-facing, so ask first and state that the repo will be public.
- [ ] The Actions run is green, and the site loads and plays the yield lesson

**Verify:** `gh run watch` → success; open the site URL in Edge

**Steps:**

- [ ] **Step 1: .github/workflows/deploy.yml**

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit the workflow**

```bash
git add .github
git commit -m "ci: build, test and deploy to GitHub Pages"
```

- [ ] **Step 3: ASK THE USER**, then create the repo, enable Pages, and push

Ask: "Ready to publish? This creates a public GitHub repo `gotomyrepo/permit-study` containing the app, lessons, and audio (nothing about your daughter)." Only proceed on a clear yes.

```bash
gh repo create gotomyrepo/permit-study --public --source . --remote origin
gh api -X POST repos/gotomyrepo/permit-study/pages -f build_type=workflow
git push -u origin main
gh run watch
```

If the `pages` API call returns 409 (already enabled), continue.

- [ ] **Step 4: Verify** that `https://gotomyrepo.github.io/permit-study/` loads in Edge and the Yield lesson plays with sound.

---

### Tasks 12–21: Lessons

Each lesson task follows `content/AUTHORING.md` exactly. Each one:
- reads its manual pages in `content/manual/mv21.txt`
- creates `src/scenes/defs/<id>.ts` (exporting `<camelId>Scenes`) and registers it in `src/scenes/registry.ts`
- creates `content/lessons/<id>.yaml`
- runs `npm test`, `npm run check`, `npm run shots -- <scene ids>` (and **inspects every image**), `npm run audio`, and `npm run check -- --audio`
- commits with `feat: <title> lesson`

Common acceptance criteria for every lesson task:
- [ ] 3–5 cards and 3–6 questions; at least half the questions have 4 choices
- [ ] Every card and question has a manual quote (or a flagged figure) that `npm run check` accepts
- [ ] All new scenes pass `npm test`. Any step showing stopping or waiting has `expect` entries
- [ ] The screenshots were inspected and match the narration: right side of the road, signs on the correct side, and cars stopping behind lines
- [ ] Audio is generated; `npm run check -- --audio` passes
- [ ] No facts from outside the manual

**Verify (every lesson):** `npm test && npm run check -- --audio` → all pass, plus an inspection of the screenshots.

#### Task 12: Signs (order 1, id `signs`, icon 🛑)
- **Manual:** page 29 (sign categories by shape/color, STOP, YIELD), page 30 (other regulation, warning, work zone, destination, service signs, and the start of signals).
- **Cards:** colors and shapes tell you the type of sign (red = stop/yield/prohibited, yellow diamond = warning, orange = work zone, green = destination, blue = service); STOP means a full stop behind the line; regulation signs are white rectangles.
- **Scenes:** one `signCloseup` per sign kind (`sign-stop`, `sign-warning`, `sign-work-zone`, `sign-speed`, `sign-destination`, `sign-service`, `sign-rr-advance`, `sign-do-not-enter`, `sign-one-way`, `sign-wrong-way`, `sign-school`). Also a `stop-intersection` scene using `fourWay({controls:{nb:'stop'}})` in which blue comes to a full stop behind the bar (`stopsBehind`) before crossing after the cross traffic (`entersAfter`).
- **Questions:** at least **5** with `signQuestion: true`, e.g. "What does this sign mean?" and "What shape is a warning sign?". The practice test needs 4 sign questions and should vary them.
- Only use sign kinds and meanings that are described on pages 29–30. If a sign in `SignKind` isn't in the manual text, don't use it.

#### Task 13: Traffic lights (order 3, id `lights`, icon 🚦)
- **Manual:** page 30 (Traffic Signals: red, yellow, green, arrows, flashing red/yellow, lights out).
- **Scenes:** `fourWay({controls:{nb:'light'}})` with states set on `light-nb`: red, where blue stops behind the bar; green, where blue goes; yellow, where blue stops if it can do so safely; flashing red, treated like a stop sign; and green arrow, where blue turns left using `turnPath` from `stopPose('nb')` to a westbound pose.
- For any turn, add a lane check exception only through `turnPath` (its keyframes have `turning: true`). Never widen the lanes to make a scene pass.

#### Task 14: Pavement markings (order 4, id `markings`, icon 🛣️)
- **Manual:** pages 31–33 (line colors, broken vs solid, double solid, passing zones, stop lines and crosswalks, arrows, HOV).
- **Scenes:** add a `twoLane()` layout to `layouts.ts`: a 300×300 horizontal road at y 110–190 with an eastbound lane at y 150–190 (center 170) and a westbound lane at y 110–150 (center 130), with a configurable center line (`'broken-yellow' | 'solid-yellow' | 'double-yellow' | 'solid-and-broken'`). Add a unit test in `tests/layouts.test.ts` asserting the lane rectangles and headings.
- **Cards:** yellow lines separate traffic going opposite ways; white lines separate lanes going the same way; broken means you may cross when safe; solid means you should not. Show the stop line and crosswalk from `fourWay`, extended with a `crosswalks` option if the manual text covers them.

#### Task 15: Right-of-way (order 5, id `right-of-way`, icon 🤝)
- **Manual:** page 34 (Right-of-Way rules: uncontrolled intersections, left turns yield to oncoming traffic, entering from a driveway, traffic circles, pedestrians).
- **Scenes:** use `fourWay()` for each rule, with `entersAfter` expectations proving who goes first; add sidewalk/crosswalk lanes (`heading: 'any'`) for pedestrians if they're used. Each question: "You are the blue car. Who goes first?"
- Every scenario must match a sentence on page 34. Don't include scenarios the manual doesn't describe.

#### Task 16: Turns (order 6, id `turns`, icon ↪️)
- **Manual:** pages 36–37 (Turns, U-Turns).
- **Scenes:** right turn from the right lane into the right lane; left turn from the lane nearest the center into the nearest lane going the new direction. Use `turnPath` and add a test in `tests/scenes.test.ts` style (the registry covers it automatically).

#### Task 17: Emergency vehicles (order 7, id `emergency`, icon 🚑)
- **Manual:** page 35 (Emergency Vehicles; Blue, Green and Amber Lights).
- **Scenes:** use a `twoLane()` road. An ambulance (`kind: 'ambulance'`, state `flashing`) approaches from behind; blue pulls to the right edge and stops (use `at`/keyframes that keep blue inside its lane rectangle near the right edge), and the ambulance passes (no overlap). Also cover the rule for stopped emergency vehicles on the shoulder only if it appears on these pages or on a page you cite.

#### Task 18: School buses (order 8, id `school-bus`, icon 🚌)
- **Manual:** pages 40–41 (School Buses).
- **Scenes:** use `twoLane()`. A bus (`kind: 'bus'`) stops with state `stop-arm flashing`; blue stops behind it (and in the opposite-direction variant, blue stops too), in whichever situations the manual text describes. Add a `StopLine` in the scene at a safe distance behind the bus so `stopsBehind` proves blue stopped short of it.

#### Task 19: Speed (order 9, id `speed`, icon 🏁)
- **Manual:** page 48 (Speed), plus any speed limit numbers quoted in the manual (search `mv21.txt` for "mph" and "miles per hour").
- **Scenes:** `signCloseup` speed signs with the quoted numbers, and a `twoLane()` scene with a speed sign where blue slows down.
- Use only numbers that appear in quotes.

#### Task 20: Parking (order 10, id `parking`, icon 🅿️)
- **Manual:** pages 42–44 (How to Park, Parking Regulations, disability parking).
- **Scenes:** still diagrams. Add a `curbStreet()` layout: a road with a parking lane (`heading: 'any'`), a hydrant, a crosswalk, and a stop sign. Use `measure()` labels showing each distance **exactly as quoted**. Parked cars use `at` poses in the parking lane.

#### Task 21: Alcohol and drugs (order 11, id `alcohol`, icon 🚫)
- **Manual:** pages 54–60 (Chapter 9: what alcohol does, BAC, chemical tests, consequences, reminders).
- **Scenes:** mostly still `label()` diagrams, e.g. a large "0.08" card if quoted. Also `signCloseup('...', 'regulation', { text })` cards for key numbers, using only quoted numbers and penalties.
- Keep the wording simple and non-scary: "Never drive after drinking."

---

### Task 22: Final pass, parent handoff, CLAUDE.md

**Goal:** Everything is green, deployed, documented for future work, and the parent has a short install and review guide.

**Files:**
- Create: `CLAUDE.md`, `docs/PARENT-GUIDE.md`

**Acceptance Criteria:**
- [ ] `npm test`, `npm run check -- --audio`, `npm run e2e`, and `npm run build` all pass
- [ ] At least 20 questions and at least 4 sign questions exist (`npm run check` output)
- [ ] Pushed; the Pages deploy is green
- [ ] CLAUDE.md documents the commands and architecture; PARENT-GUIDE.md explains install and review

**Verify:** all four commands pass; `gh run watch` → success

**Steps:**

- [ ] **Step 1: CLAUDE.md**

````markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
A study app for the NYS learner permit written test, built for one learner (18, autistic, reads at a 1st–2nd grade level). Lessons are narrated by a pre-recorded neural voice, shown as bird's-eye cartoon scenes (she is always the blue car), and checked with read-aloud tap-to-answer questions. Deployed to GitHub Pages as an installable PWA. Design: `docs/superpowers/specs/2026-09-22-nys-permit-study-app-design.md`.

## Commands
- `npm run dev`: dev server at http://localhost:5173/permit-study/ (also `/review.html` for the parent fact check and `/scene-preview.html?scene=<id>`)
- `npm test`: vitest (unit tests + the behavior check of every registered scene). Single file: `npx vitest run tests/check.test.ts`; single test: `npx vitest run -t "flags a collision"`
- `npm run check`: validate lessons (schema, manual quotes, scene refs). Add `-- --audio` to also require audio files
- `npm run audio`: regenerate narration (`content/audio-lines.json` → `public/audio/`). Only changed lines are re-synthesized
- `npm run shots -- <scene-id>...`: screenshots to `screenshots/`. Always look at them after changing a scene
- `npm run e2e`: Playwright (Edge) end-to-end
- `python -m pytest tests_py`: audio word-matching tests
- `npm run build`: check + typecheck + build. CI runs `npm test` and `npm run build`, then deploys on push to `main`

## Architecture
- **Facts come only from the official manual.** `public/manual/mv21.pdf` is extracted to `content/manual/pages.json` by `scripts/fetch_manual.py`. Every lesson card and question cites `source.page` + `source.quote`, and `src/content/validate.ts` requires the quote to appear on that page (compared as lowercase alphanumerics, to survive PDF artifacts). Never add facts from outside the manual. See `content/AUTHORING.md`.
- **Scenes are pure data** (`src/scenes/defs/*.ts`, registered in `src/scenes/registry.ts`): actors + ordered steps of keyframes and timed states. `frameAt()` in `engine.ts` is deterministic, which lets `ScenePlayer` (render.ts) draw it and `checkScene()` (check.ts) verify it: no overlaps, cars in lanes going their direction (except `turning` keyframes from `turnPath`), `stopsBehind` and `entersAfter` expectations. Standard geometry lives in `layouts.ts` (`fourWay`, `FOURWAY`, `stopPose`, `signCloseup`).
- **Narration ↔ animation sync:** a lesson card names a scene + step. The Learn screen starts the audio clip and the step together and unlocks Next when both finish. Caption highlighting uses `public/audio/<id>.json` word timings, whose indexes are whitespace tokens of the same text (`Caption` and `build_audio.py` must split identically).
- **Audio ids** are derived in `src/content/audioLines.ts` (`audioId`, `TEXT`, `PHRASES`). Any new spoken string must be added there so `npm run audio` generates it.
- **Screens** (`src/screens/`) are async functions over a `Ctx` with an AbortSignal. The 🏠 button aborts the flow and `App.start()` loops back to Home.
- **Progress** is in localStorage (`src/progress/store.ts`). The practice test (`src/practice/assemble.ts`) follows the manual's rule: at least 14 of 20 correct, including 2 of the 4 sign questions.
````

- [ ] **Step 2: docs/PARENT-GUIDE.md**

```markdown
# Permit Practice: parent guide

## Put it on her laptop
1. On her laptop, open **Microsoft Edge** and go to https://gotomyrepo.github.io/permit-study/
2. Click the small "App available / Install" icon at the right end of the address bar (or ⋯ menu → Apps → Install this site as an app).
3. Right-click its taskbar icon → Pin to taskbar.
4. Open it once while online and wait a minute. After that it also works without internet.

## How she uses it
- Tap **▶ Keep going** to do the next lesson, or tap any picture tile.
- Every screen talks. 🔊 hears it again. 🔁 watches the picture again. 🏠 goes back home.
- **📝 Practice test** works like the real one: 20 questions read aloud, 4 about road signs. She passes with 14 right, including 2 of the 4 sign questions (from the NYS Driver's Manual, page 10).

## Check the facts yourself
Open https://gotomyrepo.github.io/permit-study/review.html. Every sentence the app says is next to the manual's exact words and a link to that page. Lines marked ⚠ come from a picture in the manual, so please look at the picture.

## Progress
Progress is saved on that laptop only. Clearing Edge's browsing data resets it.
```

- [ ] **Step 3: Full verification**

Run: `npm test && npm run check -- --audio && npm run e2e && npm run build` → all pass. Confirm the check output shows ≥20 questions and ≥4 sign questions; if not, add questions to the relevant lessons (following AUTHORING.md).

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "docs: CLAUDE.md and parent guide"
git push
gh run watch
```

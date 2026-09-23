import { describe, test, expect } from 'vitest';
import { fourWay, sameWay, stopPose, twoLane, TWOLANE, type CenterLine } from '../src/scenes/layouts';
import { laneChange } from '../src/scenes/paths';

/** The <line> elements inside the center-line group of a layout's background. */
function centerLines(bg: string, id = 'center-line'): string[] {
  const g = bg.match(new RegExp(`<g class="marking" data-prop="${id}">(.*?)</g>`));
  expect(g).not.toBeNull();
  return g![1].match(/<line [^>]*\/>/g) ?? [];
}
const isDashed = (l: string) => l.includes('stroke-dasharray');
const yOf = (l: string) => Number(l.match(/y1="([\d.]+)"/)![1]);

describe('twoLane', () => {
  test('lane rectangles and headings', () => {
    const L = twoLane();
    expect(L.lanes).toEqual([
      { id: 'eb', x: -100, y: 150, w: 500, h: 40, heading: 90 },
      { id: 'wb', x: -100, y: 110, w: 500, h: 40, heading: 270 },
    ]);
  });
  test('road is y 110–190 on a 300×300 picture', () => {
    expect(twoLane().background).toContain('<rect x="0" y="110" width="300" height="80"');
  });
  test('start and exit poses sit on the lane centers', () => {
    expect(TWOLANE.start.eb).toEqual({ x: -40, y: 170, heading: 90 });
    expect(TWOLANE.start.wb).toEqual({ x: 340, y: 130, heading: 270 });
    expect(TWOLANE.exit.eb.y).toBe(170);
    expect(TWOLANE.exit.wb.y).toBe(130);
  });
  const cases: [CenterLine, boolean[]][] = [
    ['broken-yellow', [true]],
    ['solid-yellow', [false]],
    ['double-yellow', [false, false]],
    ['solid-and-broken', [false, true]],
  ];
  for (const [kind, dashed] of cases) {
    test(`${kind} center line is drawn ${dashed.map((d) => (d ? 'broken' : 'solid')).join(' + ')} in yellow`, () => {
      const lines = centerLines(twoLane({ center: kind }).background);
      expect(lines.map(isDashed)).toEqual(dashed);
      for (const l of lines) expect(l).toContain('stroke="#ffd600"');
    });
  }
  test('solid-and-broken puts the solid line on the eastbound side', () => {
    const [solid, broken] = centerLines(twoLane({ center: 'solid-and-broken' }).background);
    expect(yOf(solid)).toBeGreaterThan(150);
    expect(yOf(broken)).toBeLessThan(150);
  });
  test('default center line is broken yellow', () => {
    expect(centerLines(twoLane().background).map(isDashed)).toEqual([true]);
  });
});

describe('sameWay', () => {
  test('two eastbound lanes split by a broken white line', () => {
    const L = sameWay();
    expect(L.lanes).toEqual([
      { id: 'eb-right', x: -100, y: 150, w: 500, h: 40, heading: 90 },
      { id: 'eb-left', x: -100, y: 110, w: 500, h: 40, heading: 90 },
    ]);
    const lines = centerLines(L.background, 'lane-line');
    expect(lines.map(isDashed)).toEqual([true]);
    expect(lines[0]).toContain('stroke="#ffffff"');
  });
});

describe('fourWay crosswalks', () => {
  test('off by default: lines and poses are unchanged', () => {
    const L = fourWay({ controls: { nb: 'stop' } });
    expect(L.lines.find((l) => l.id === 'line-nb')).toEqual({ id: 'line-nb', x: 165, y: 188, heading: 0 });
    expect(L.lines).toHaveLength(4);
    expect(stopPose('nb')).toEqual({ x: 165, y: 210, heading: 0 });
  });
  test('crosswalks move the stop line back and add a line at each crosswalk', () => {
    const L = fourWay({ controls: { nb: 'stop' }, crosswalks: true });
    const nb = L.lines.find((l) => l.id === 'line-nb')!;
    const cw = L.lines.find((l) => l.id === 'crosswalk-nb')!;
    expect(nb.y).toBeGreaterThan(cw.y);
    expect(cw.y).toBeGreaterThan(180);
    expect(L.props).toContain('bar-nb');
    expect(stopPose('nb', 'car', { crosswalks: true }).y).toBe(nb.y + 22);
    expect(stopPose('nb', 'car', { crosswalks: true, before: 'crosswalk' }).y).toBe(cw.y + 22);
  });
});

describe('straight-road extras', () => {
  test('lines and props pass through to twoLane and sameWay', () => {
    const extras = { lines: [{ id: 'l1', x: 100, y: 170, heading: 90 }], props: [{ id: 'p1', svg: '<g data-prop="p1"/>' }] };
    for (const L of [twoLane({ center: 'double-yellow', ...extras }), sameWay(extras)]) {
      expect(L.lines).toEqual(extras.lines);
      expect(L.props).toContain('p1');
      expect(L.background).toContain('<g data-prop="p1"/>');
    }
  });
  test('before: crosswalk implies crosswalks', () => {
    expect(stopPose('nb', 'car', { before: 'crosswalk' })).toEqual(stopPose('nb', 'car', { crosswalks: true, before: 'crosswalk' }));
  });
});

describe('laneChange', () => {
  test('ends one lane over, heading straight, with headings that follow the path', () => {
    const from = { x: 100, y: 170, heading: 90 };
    const kfs = laneChange(from, -40, 180, 1000, 5000);
    const last = kfs[kfs.length - 1];
    expect(last.x).toBeCloseTo(280); expect(last.y).toBeCloseTo(130); expect(last.heading).toBeCloseTo(90); expect(last.t).toBe(5000);
    let prev = from;
    for (const k of kfs) {
      const pathHeading = (Math.atan2(k.x - prev.x, -(k.y - prev.y)) * 180) / Math.PI;
      expect(Math.abs(pathHeading - 90)).toBeLessThan(20);
      expect(Math.abs(k.heading - pathHeading)).toBeLessThan(6);
      expect(k.turning).toBeUndefined();
      prev = k;
    }
  });
});

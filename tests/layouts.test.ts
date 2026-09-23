import { describe, test, expect } from 'vitest';
import { driveway, DRIVEWAY, FOURWAY, fourWay, sameWay, stopPose, twoLane, TWOLANE, walkBand, withExtras, type CenterLine } from '../src/scenes/layouts';
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

describe('withExtras', () => {
  const base = fourWay({ controls: { nb: 'light' } });
  test('no extras leaves the layout unchanged', () => {
    expect(withExtras(base, {})).toEqual(base);
  });
  test('appends props, lanes, zones and lines after the base ones, without changing the base', () => {
    const before = JSON.stringify(base);
    const lane = { id: 'x-lane', x: 0, y: 0, w: 10, h: 10, heading: 'any' as const };
    const zone = { id: 'x-zone', x: 0, y: 0, w: 10, h: 10 };
    const line = { id: 'x-line', x: 5, y: 5, heading: 0 };
    const L = withExtras(base, { props: [{ id: 'p1', svg: '<g data-prop="p1"/>' }], lanes: [lane], zones: [zone], lines: [line] });
    expect(L.background).toBe(base.background + '<g data-prop="p1"/>');
    expect(L.props).toEqual([...base.props, 'p1']);
    expect(L.lanes).toEqual([...base.lanes, lane]);
    expect(L.zones).toEqual([...base.zones, zone]);
    expect(L.lines).toEqual([...base.lines, line]);
    expect(JSON.stringify(base)).toBe(before);
  });
  test('twoLane and sameWay add their extras the same way', () => {
    const extras = { props: [{ id: 'p1', svg: '<g data-prop="p1"/>' }] };
    expect(twoLane(extras)).toEqual(withExtras(twoLane(), extras));
    expect(sameWay(extras)).toEqual(withExtras(sameWay(), extras));
  });
});

describe('crosswalk walking lanes', () => {
  // Crosswalk lines sit 4 and 24 px outside the junction and are 5.5 px wide.
  test('walkBand covers the crosswalk band, across the road plus `extra` each side', () => {
    expect(walkBand('nb', 30)).toEqual({ x: 90, y: 181.25, w: 120, h: 25.5 });
    expect(walkBand('sb', 0)).toEqual({ x: 120, y: 93.25, w: 60, h: 25.5 });
    expect(walkBand('eb', 0)).toEqual({ x: 93.25, y: 120, w: 25.5, h: 60 });
    expect(walkBand('wb', 30)).toEqual({ x: 181.25, y: 90, w: 25.5, h: 120 });
  });
  test('walkLane allows any heading; walkZone is the on-road part', () => {
    expect(FOURWAY.walkLane('nb')).toEqual({ id: 'walk-lane-nb', x: 90, y: 181.25, w: 120, h: 25.5, heading: 'any' });
    expect(FOURWAY.walkZone('nb')).toEqual({ id: 'walk-zone-nb', x: 120, y: 181.25, w: 60, h: 25.5 });
  });
});

describe('driveway', () => {
  test('street lanes match fourWay, plus a northbound driveway lane', () => {
    const L = driveway();
    const four = fourWay();
    expect(L.lanes).toEqual([
      four.lanes.find((l) => l.id === 'eb'),
      four.lanes.find((l) => l.id === 'wb'),
      { id: 'drive', x: 150, y: 180, w: 30, h: 140, heading: 0 },
    ]);
    expect(L.zones).toEqual([{ id: DRIVEWAY.zoneId, x: 130, y: 150, w: 100, h: 30 }]);
    expect(L.lines).toEqual([{ id: DRIVEWAY.lineId, x: 165, y: 182, heading: 0 }]);
  });
  test('DRIVEWAY.stop puts the front 4 px behind the stop line', () => {
    expect(DRIVEWAY.stop()).toEqual({ x: 165, y: 204, heading: 0 });
    expect(DRIVEWAY.stop('bus').y).toBe(182 + 32 + 4);
  });
});

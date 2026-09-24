import { describe, test, expect } from 'vitest';
import { driveway, DRIVEWAY, FOURWAY, fourWay, laneGlow, planArrow, sameWay, stopPose, twoLane, TWOLANE, walkBand, WIDEFOUR, wideFourWay, wideStopPose, withExtras, type CenterLine } from '../src/scenes/layouts';
import { uTurnApex } from '../src/scenes/paths';
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

describe('wideFourWay', () => {
  test('two 30 px lanes each way, left lanes next to the center line', () => {
    const lanes = Object.fromEntries(wideFourWay().lanes.map((l) => [l.id, l]));
    expect(lanes['nb-left']).toEqual({ id: 'nb-left', x: 150, y: -100, w: 30, h: 500, heading: 0 });
    expect(lanes['nb-right']).toEqual({ id: 'nb-right', x: 180, y: -100, w: 30, h: 500, heading: 0 });
    expect(lanes['sb-left']).toEqual({ id: 'sb-left', x: 120, y: -100, w: 30, h: 500, heading: 180 });
    expect(lanes['sb-right']).toEqual({ id: 'sb-right', x: 90, y: -100, w: 30, h: 500, heading: 180 });
    expect(lanes['eb-left']).toEqual({ id: 'eb-left', x: -100, y: 150, w: 500, h: 30, heading: 90 });
    expect(lanes['eb-right']).toEqual({ id: 'eb-right', x: -100, y: 180, w: 500, h: 30, heading: 90 });
    expect(lanes['wb-left']).toEqual({ id: 'wb-left', x: -100, y: 120, w: 500, h: 30, heading: 270 });
    expect(lanes['wb-right']).toEqual({ id: 'wb-right', x: -100, y: 90, w: 500, h: 30, heading: 270 });
  });
  test('roads 90–210, junction zone, double yellow center and broken white lane lines', () => {
    const L = wideFourWay();
    expect(L.background).toContain('<rect x="0" y="90" width="300" height="120"');
    expect(L.background).toContain('<rect x="90" y="0" width="120" height="300"');
    expect(L.zones).toEqual([{ id: 'junction', x: 90, y: 90, w: 120, h: 120 }]);
    expect(L.background).toContain('x1="147.8" y1="0" x2="147.8" y2="90" stroke="#ffd600"');
    expect(L.background).toContain('x1="120" y1="0" x2="120" y2="90" stroke="#ffffff" stroke-width="2.5" stroke-dasharray');
  });
  test('start, exit and stop poses sit on lane centers; every approach has a stop line', () => {
    expect(WIDEFOUR.start.nb.right).toEqual({ x: 195, y: 340, heading: 0 });
    expect(WIDEFOUR.start.sb.left).toEqual({ x: 135, y: -40, heading: 180 });
    expect(WIDEFOUR.exit.eb.right).toEqual({ x: 340, y: 195, heading: 90 });
    expect(WIDEFOUR.exit.wb.left).toEqual({ x: -40, y: 135, heading: 270 });
    expect(wideFourWay().lines.map((l) => l.id)).toEqual(['line-nb', 'line-sb', 'line-eb', 'line-wb']);
    // Car front (18 px ahead of center) 4 px behind the line at y 218.
    expect(wideStopPose('nb', 'left')).toEqual({ x: 165, y: 240, heading: 0 });
    expect(wideStopPose('wb', 'right')).toEqual({ x: 240, y: 105, heading: 270 });
    expect(wideStopPose('sb', 'right')).toEqual({ x: 105, y: 60, heading: 180 });
  });
  test('controls add a bar across both lanes plus the sign or light prop', () => {
    const L = wideFourWay({ controls: { nb: 'stop', eb: 'light' } });
    expect(L.props).toEqual([WIDEFOUR.signId('nb'), WIDEFOUR.lightId('eb')]);
    expect(L.background).toContain('<line x1="150" y1="216" x2="210" y2="216"');
    expect(L.background).toContain('<line x1="84" y1="150" x2="84" y2="210"');
    expect(wideFourWay().props).toEqual([]);
  });
  test('laneRect covers the lane before (in) or after (out) the junction', () => {
    expect(WIDEFOUR.laneRect('nb', 'right', 'in')).toEqual({ x: 180, y: 210, w: 30, h: 90 });
    expect(WIDEFOUR.laneRect('nb', 'left', 'out')).toEqual({ x: 150, y: 0, w: 30, h: 90 });
    expect(WIDEFOUR.laneRect('eb', 'right', 'out')).toEqual({ x: 210, y: 180, w: 90, h: 30 });
    expect(WIDEFOUR.laneRect('wb', 'left', 'out')).toEqual({ x: 0, y: 120, w: 90, h: 30 });
  });
  test('laneGlow is a prop with the given id and color', () => {
    const g = laneGlow('g', { x: 0, y: 0, w: 30, h: 90 }, '#e53935');
    expect(g.id).toBe('g');
    expect(g.svg).toContain('data-prop="g"');
    expect(g.svg).toContain('fill="#e53935"');
    expect(withExtras(wideFourWay(), { props: [g] }).props).toEqual(['g']);
  });
});

describe('planArrow via', () => {
  test('without via the path is one curve; with via it bends through the via pose', () => {
    const from = { x: 165, y: 230, heading: 0 }, to = { x: 105, y: 230, heading: 180 };
    // Two <path>s (edge + color), one curve each.
    expect(planArrow('a', from, { x: 100, y: 135, heading: 270 }, '#000').svg.match(/Q/g)).toHaveLength(2);
    const u = planArrow('u', from, to, '#000', uTurnApex(from, to)).svg;
    expect(u).toContain('M165 230 Q165 200 135 200 Q105 200 105 230');
  });
});

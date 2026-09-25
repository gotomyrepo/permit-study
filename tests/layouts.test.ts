import { describe, test, expect } from 'vitest';
import { CURB, curbStreet, WHEEL_OUT, wheelsProp, fogBank, signPair, signProp, speedGauge, feetPx, FOOT_PX, inchesPx, median, MEDIAN, measureProp, stopLineAhead, lampCarCloseup, lampPropId, LAMP_COLORS, shoulder, SHOULDER, driveway, DRIVEWAY, FOURWAY, fourWay, laneGlow, planArrow, sameWay, stopPose, twoLane, TWOLANE, walkBand, WIDEFOUR, wideFourWay, wideStopPose, withExtras, type CenterLine } from '../src/scenes/layouts';
import { laneChange, uTurnApex } from '../src/scenes/paths';

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

describe('shoulder', () => {
  test('a prop and a zone below the road, passed through to twoLane and sameWay', () => {
    const sh = shoulder();
    expect(sh.zones).toEqual([{ id: SHOULDER.zoneId, x: -100, y: 190, w: 500, h: 26 }]);
    expect(SHOULDER.y).toBe(203);
    expect(sh.props[0].svg).toContain(`data-prop="${SHOULDER.id}"`);
    for (const L of [twoLane(sh), sameWay(sh)]) {
      expect(L.props).toContain(SHOULDER.id);
      expect(L.zones.map((z) => z.id)).toContain(SHOULDER.zoneId);
      expect(L.lanes.map((l) => l.y + l.h)).toEqual([190, 150]); // lanes are not widened
    }
  });
});

describe('lampCarCloseup', () => {
  test('one centered car or two side by side, each a prop with its colored roof light', () => {
    const one = lampCarCloseup('x', ['green']);
    expect(one.props).toEqual(['lamp-car-green']);
    expect(one.steps.map((s) => s.id)).toEqual(['show']);
    expect(one.background).toContain(`fill="${LAMP_COLORS.green.lamp}"`);
    expect(one.background).toContain('cx="150"');
    const two = lampCarCloseup('y', ['blue', 'green'], { teachMs: 3000 });
    expect(two.props).toEqual(['lamp-car-blue', 'lamp-car-green']);
    expect(two.steps).toEqual([{ id: 'show', duration: 500 }, { id: 'teach', duration: 3000 }]);
    expect(two.background).toContain(`fill="${LAMP_COLORS.blue.lamp}"`);
    expect(two.actors).toEqual([]);
  });
  test('a tow truck with an amber light, in a row of three', () => {
    const truck = { lamp: 'amber', kind: 'tow-truck' } as const;
    expect(lampPropId(truck)).toBe('lamp-truck-amber');
    const three = lampCarCloseup('z', ['blue', 'green', truck]);
    expect(three.props).toEqual(['lamp-car-blue', 'lamp-car-green', 'lamp-truck-amber']);
    expect(three.background).toContain(`fill="${LAMP_COLORS.amber.lamp}"`);
    for (const x of [55, 150, 245]) expect(three.background).toContain(`cx="${x}"`);
  });
});

describe('stopLineAhead', () => {
  test('sits gap px in front of the vehicle, facing its heading', () => {
    expect(stopLineAhead('a', { x: 100, y: 180, heading: 90 })).toEqual({ id: 'a', x: 120, y: 180, heading: 90 });
    expect(stopLineAhead('b', { x: 165, y: 250, heading: 0 }, 'bus', 5)).toEqual({ id: 'b', x: 165, y: 213, heading: 0 });
    expect(stopLineAhead('c', { x: 200, y: 130, heading: 270 }, 'ambulance')).toEqual({ id: 'c', x: 178, y: 130, heading: 270 });
  });
});

describe('median', () => {
  test('a grass strip with a yellow edge line on each side, clear of both lanes of twoLane', () => {
    const m = median();
    expect(m.props.map((p) => p.id)).toEqual([MEDIAN.id]);
    expect(m.props[0].svg).toContain(`data-prop="${MEDIAN.id}"`);
    const road = twoLane(m);
    expect(road.props).toContain(MEDIAN.id);
    expect(road.lanes.map((l) => l.id)).toEqual(['eb', 'wb']);
    // Car bodies: westbound y 121–139, eastbound 161–179; the median's lines (3 px wide) stay between them.
    expect(MEDIAN.top - 1.5).toBeGreaterThan(139);
    expect(MEDIAN.bottom + 1.5).toBeLessThan(161);
  });
});

describe('measureProp', () => {
  test('a labeled arrow prop with ticks at both ends', () => {
    const m = measureProp('gap', 150, 198, 214, '20 feet');
    expect(m.id).toBe('gap');
    expect(m.svg).toContain('data-prop="gap"');
    expect(m.svg).toContain('20 feet');
    expect(m.svg).toContain('x1="150"');
    expect(m.svg).toContain('x1="198"');
  });
  test('reach adds a dashed guide from each end to the given y', () => {
    const m = measureProp('gap', 120, 168, 200, '20 feet', { reach: [170, 130] });
    expect(m.svg).toContain('x1="120" y1="200" x2="120" y2="170"');
    expect(m.svg).toContain('x1="168" y1="200" x2="168" y2="130"');
    expect(m.svg.match(/stroke-dasharray="4 3"/g)).toHaveLength(2);
    expect(measureProp('gap', 120, 168, 200, '20 feet').svg).not.toContain('stroke-dasharray');
  });
  test('vertical arrows, label sides and guides that run sideways', () => {
    const v = measureProp('curb', 170, 190, 250, '12 inches', { vertical: true, reach: [230, 230] });
    expect(v.svg).toContain('x1="243" y1="170" x2="257" y2="170"'); // tick across the top end
    expect(v.svg).toContain('x1="250" y1="190" x2="230" y2="190"'); // dashed guide to x 230
    expect(v.svg).toContain('translate(296.4 180)'); // label to the right, clear of the arrow
    const left = measureProp('curb', 170, 190, 250, '12 inches', { vertical: true, label: 'left' });
    expect(left.svg).toContain('translate(203.6 180)');
    const below = measureProp('gap', 100, 160, 50, '5 feet', { label: 'below' });
    expect(below.svg).toContain('translate(130 62)');
  });
  test('short distances get inward heads outside the ends instead of throwing', () => {
    const s = measureProp('curb', 180, 186, 250, '1 foot', { vertical: true });
    expect(s.svg).toContain('x1="250" y1="166" x2="250" y2="200"'); // lead line past both ends
    expect(s.svg.match(/<polygon/g)).toHaveLength(2);
    expect(s.svg).toContain('translate(285.6 183)');
  });
  test('the default horizontal arrow is unchanged', () => {
    expect(measureProp('gap', 150, 198, 96, '20 feet').svg).toBe(
      measureProp('gap', 150, 198, 96, '20 feet', { label: 'above' }).svg);
  });
  test('rejects zero length, bad numbers, empty text and a label on the wrong side', () => {
    expect(() => measureProp('g', 100, 100, 50, '5 feet')).toThrow(/must be different numbers/);
    expect(() => measureProp('g', 100, NaN, 50, '5 feet')).toThrow(/must be different numbers/);
    expect(() => measureProp('g', 100, 160, NaN, '5 feet')).toThrow(/must be different numbers/);
    expect(() => measureProp('g', 100, 160, 50, ' ')).toThrow(/text must not be empty/);
    expect(() => measureProp('g', 100, 160, 50, '5 feet', { label: 'left' })).toThrow(/horizontal arrow's label goes above or below/);
    expect(() => measureProp('g', 100, 160, 50, '5 feet', { vertical: true, label: 'above' })).toThrow(/vertical arrow's label goes left or right/);
  });
});

describe('distance scale', () => {
  test('1 foot is 2.4 px (a 36 px car is 15 feet); inches are a twelfth of that', () => {
    expect(FOOT_PX).toBe(2.4);
    expect(feetPx(15)).toBe(36);
    expect(feetPx(20)).toBe(48);
    expect(feetPx(0)).toBe(0);
    expect(inchesPx(12)).toBe(2.4);
    expect(inchesPx(6)).toBe(1.2);
  });
  test('rejects negative or non-number distances', () => {
    expect(() => feetPx(-1)).toThrow(/feetPx: the distance must be a number 0 or more/);
    expect(() => inchesPx(NaN)).toThrow(/inchesPx: the distance must be a number 0 or more/);
  });
});

describe('speed helpers', () => {
  test('signProp is a sign prop with its id, and rejects bad input', () => {
    const p = signProp('sign-55', 'speed', 96, 232, { text: '55', size: 60 });
    expect(p.id).toBe('sign-55');
    expect(p.svg).toContain('data-prop="sign-55"');
    expect(p.svg).toContain('>55<');
    expect(() => signProp('', 'speed', 0, 0)).toThrow(/id/);
    expect(() => signProp('s', 'speed', NaN, 0)).toThrow(/numbers/);
  });
  test('signPair ids make both signs props, and existing calls stay the same', () => {
    const a = signPair('p', { kind: 'speed', text: '55' }, { kind: 'speed', text: '65' }, 3000);
    expect(a.props).toEqual([]);
    expect(a.background).not.toContain('data-prop');
    const b = signPair('p', { kind: 'speed', text: '55' }, { kind: 'speed', text: '65' }, 3000, { ids: ['s55', 's65'] });
    expect(b.props).toEqual(['s55', 's65']);
    expect(b.background).toContain('data-prop="s55"');
    expect(b.background).toContain('data-prop="s65"');
    expect(() => signPair('p', { kind: 'speed' }, { kind: 'speed' }, 3000, { ids: ['x', 'x'] })).toThrow(/different/);
    expect(() => signPair('p', { kind: 'speed' }, { kind: 'speed' }, 3000, { ids: ['', 'y'] })).toThrow(/non-empty/);
  });
  test('fogBank covers x0..x1 and rejects bad ranges', () => {
    const f = fogBank('fog', 200, 300);
    expect(f.svg).toContain('data-prop="fog"');
    expect(f.svg).toContain('<rect x="200" y="0" width="100" height="300"/>');
    expect(() => fogBank('fog', 300, 200)).toThrow(/x0 < x1/);
    expect(() => fogBank('fog', 100, 110)).toThrow(/20 px/);
    expect(() => fogBank('fog', -5, 100)).toThrow();
    expect(() => fogBank('fog', 0, 301)).toThrow();
    expect(() => fogBank('', 0, 100)).toThrow(/id/);
    expect(f.svg).toContain('opacity="0.85"');
    expect(f.svg).not.toContain('>FOG<');
    const l = fogBank('fog', 200, 300, { label: 'FOG', opacity: 0.6 });
    expect(l.svg).toContain('>FOG<');
    expect(l.svg).toContain('opacity="0.6"');
    expect(() => fogBank('fog', 200, 300, { opacity: 0 })).toThrow(/opacity/);
    expect(() => fogBank('fog', 200, 300, { opacity: 1.5 })).toThrow(/opacity/);
    expect(() => fogBank('fog', 200, 300, { label: ' ' })).toThrow(/label/);
  });
  test('speedGauge writes only its own number and points the needle along the dial', () => {
    const g = speedGauge('g', 150, 246, 55);
    expect(g.svg).toContain('data-prop="g"');
    expect(g.svg.match(/>\d+</g)).toEqual(['>55<']);
    expect(g.svg).toContain('>mph<');
    // 0 points lower left, max lower right, half-way straight up.
    const tip = (mph: number) => {
      const m = speedGauge('g', 0, 0, mph, { max: 80 }).svg.match(/<line x1="0" y1="-6\.9" x2="([-\d.]+)" y2="([-\d.]+)"/)!;
      return { x: +m[1], y: +m[2] };
    };
    expect(tip(0).x).toBeLessThan(0);
    expect(tip(0).y).toBeGreaterThan(-6.9);
    expect(tip(40).x).toBeCloseTo(0, 1);
    expect(tip(40).y).toBeLessThan(-20);
    expect(tip(80).x).toBeGreaterThan(0);
    expect(() => speedGauge('g', 0, 0, 90)).toThrow(/0 to 80/);
    expect(() => speedGauge('g', 0, 0, -1)).toThrow(/0 to 80/);
    expect(() => speedGauge('g', 0, 0, 10, { max: 0 })).toThrow(/max/);
    expect(() => speedGauge('g', 0, 0, 10, { r: 10 })).toThrow(/r must/);
    expect(() => speedGauge('', 0, 0, 10)).toThrow(/id/);
  });
});

describe('curbStreet', () => {
  test('twoLane road plus a parking lane (any heading) along the curb; a car at CURB.parkY has its wheels 1 foot from the curb', () => {
    const L = curbStreet();
    expect(L.lanes).toEqual([...twoLane().lanes, { id: CURB.laneId, x: -100, y: 190, w: 500, h: 24, heading: 'any' }]);
    expect(CURB.parkY).toBeCloseTo(CURB.curbY - feetPx(1) - WHEEL_OUT - 9, 6);
    // The parked car's body (plus its tires) stays inside the parking lane.
    expect(CURB.parkY - 9).toBeGreaterThanOrEqual(CURB.parkTop);
    expect(L.props).toEqual([TWOLANE.centerId, CURB.curbId, CURB.crosswalkId, CURB.signId, CURB.hydrantId]);
    for (const id of L.props) expect(L.background).toContain(`data-prop="${id}"`);
  });
  test('corner and hydrant options', () => {
    expect(curbStreet({ corner: 'crosswalk' }).props).toEqual([TWOLANE.centerId, CURB.curbId, CURB.crosswalkId, CURB.hydrantId]);
    const plain = curbStreet({ corner: 'none', hydrant: false });
    expect(plain.props).toEqual([TWOLANE.centerId, CURB.curbId]);
    expect(plain.background).not.toContain('STOP');
    expect(curbStreet({ hydrant: 170, corner: 'none' }).background).toContain('cx="170" cy="226"');
  });
  test('takes LayoutExtras', () => {
    const L = curbStreet({ props: [laneGlow('g', { x: 0, y: 190, w: 50, h: 24 })], lines: [{ id: 'l', x: 1, y: 2, heading: 90 }] });
    expect(L.props).toContain('g');
    expect(L.lines.map((l) => l.id)).toEqual(['l']);
  });
  test('throws when the hydrant is off the sidewalk or on the corner', () => {
    expect(() => curbStreet({ hydrant: 5 })).toThrow(/hydrant must be on the sidewalk, from x 10 to 222/);
    expect(() => curbStreet({ hydrant: 230 })).toThrow(/hydrant must be on the sidewalk/);
    expect(() => curbStreet({ hydrant: NaN })).toThrow(/hydrant must be on the sidewalk/);
    expect(() => curbStreet({ hydrant: 280, corner: 'none' })).not.toThrow();
  });
});

describe('wheelsProp', () => {
  test('four tires that stick out WHEEL_OUT px past each side of the car, turned to its heading', () => {
    const w = wheelsProp('w', { x: 150, y: 200, heading: 90 });
    expect(w.svg).toContain('data-prop="w"');
    expect(w.svg).toContain('translate(150 200) rotate(90)');
    expect(w.svg.match(/<rect /g)).toHaveLength(4);
    // Car frame (pointing up): a car is 18 px wide, so the tires' outer edges are at x ±(9 + WHEEL_OUT).
    const xs = [...w.svg.matchAll(/<rect x="([-\d.]+)"[^>]*width="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[1]) + Number(m[2])]);
    expect(Math.min(...xs.map((x) => x[0]))).toBe(-9 - WHEEL_OUT);
    expect(Math.max(...xs.map((x) => x[1]))).toBe(9 + WHEEL_OUT);
  });
  test('throws clear errors', () => {
    expect(() => wheelsProp('', { x: 1, y: 1, heading: 0 })).toThrow(/id must not be empty/);
    expect(() => wheelsProp('w', { x: NaN, y: 1, heading: 0 })).toThrow(/pose must be numbers/);
  });
});

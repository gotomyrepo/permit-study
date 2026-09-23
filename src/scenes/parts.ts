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
    `<path class="arrow" d="M5 12 H-5 M-5 12 l4 -4 M-5 12 l4 4" stroke-width="2" fill="none"/>` +
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

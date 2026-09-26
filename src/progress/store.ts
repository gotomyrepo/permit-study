import type { ReaderPlace } from '../reader/types';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
/** Where she is in one lesson; `seq` orders places by how recently they were used. */
interface Place { card: number; seq: number }
interface Data { completed: string[]; missed: string[]; places: Record<string, Place>; reader: ReaderPlace | null }

const isPlace = (x: unknown): x is Place =>
  !!x && typeof x === 'object' && Number.isInteger((x as Place).card) && (x as Place).card >= 0 && Number.isFinite((x as Place).seq);

const isReaderPlace = (x: unknown): x is ReaderPlace =>
  !!x && typeof x === 'object' && ['chapter', 'section', 'paragraph'].every((k) => typeof (x as Record<string, unknown>)[k] === 'string');

function loadPlaces(x: unknown): Record<string, Place> {
  const out: Record<string, Place> = {};
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    for (const [id, p] of Object.entries(x)) if (isPlace(p)) out[id] = { card: p.card, seq: p.seq };
  }
  return out;
}

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
      if (d && Array.isArray(d.completed) && Array.isArray(d.missed)) {
        return {
          completed: d.completed.filter((x: unknown) => typeof x === 'string'),
          missed: d.missed.filter((x: unknown) => typeof x === 'string'),
          places: loadPlaces(d.places),
          reader: isReaderPlace(d.reader) ? { chapter: d.reader.chapter, section: d.reader.section, paragraph: d.reader.paragraph } : null,
        };
      }
    } catch { /* fall through */ }
    return { completed: [], missed: [], places: {}, reader: null };
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
  /** Card to resume a lesson at: its saved card if that card still exists, else 0. */
  resumeCard(lesson: { id: string; cards: readonly unknown[] }): number {
    const p = this.data.places[lesson.id];
    return p && p.card < lesson.cards.length ? p.card : 0;
  }
  /** Saves her card in a lesson and marks that lesson as the most recently used. */
  setPlace(lesson: string, card: number): void {
    const all = Object.entries(this.data.places);
    const top = all.reduce((m, [, p]) => Math.max(m, p.seq), 0);
    const p = this.data.places[lesson];
    if (p && p.card === card && p.seq === top) return;
    this.data.places[lesson] = { card, seq: top + 1 };
    this.save();
  }
  clearPlace(lesson: string): void {
    if (lesson in this.data.places) { delete this.data.places[lesson]; this.save(); }
  }
  /** "Keep going": the most recently used unfinished lesson with a saved place, else nextLesson(). */
  keepGoing<T extends { id: string; order: number }>(lessons: T[]): T | undefined {
    let best: T | undefined;
    let bestSeq = -Infinity;
    for (const l of lessons) {
      const p = this.data.places[l.id];
      if (p && !this.isCompleted(l.id) && p.seq > bestSeq) { best = l; bestSeq = p.seq; }
    }
    return best ?? this.nextLesson(lessons);
  }
  /** Her place in the manual reader, or null if she has never listened. */
  readerPlace(): ReaderPlace | null { return this.data.reader ? { ...this.data.reader } : null; }
  setReaderPlace(p: ReaderPlace): void {
    const r = this.data.reader;
    if (r && r.chapter === p.chapter && r.section === p.section && r.paragraph === p.paragraph) return;
    this.data.reader = { chapter: p.chapter, section: p.section, paragraph: p.paragraph };
    this.save();
  }
  missed(): string[] { return [...this.data.missed]; }
  markMissed(qid: string): void { if (!this.data.missed.includes(qid)) { this.data.missed.push(qid); this.save(); } }
  clearMissed(qid: string): void {
    const n = this.data.missed.length;
    this.data.missed = this.data.missed.filter((x) => x !== qid);
    if (this.data.missed.length !== n) this.save();
  }
}

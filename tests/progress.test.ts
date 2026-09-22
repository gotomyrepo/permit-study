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
  test('non-string entries in stored arrays are dropped', () => {
    const raw = JSON.stringify({ completed: ['signs', 42, null], missed: ['q1', { bad: true }] });
    const p = new ProgressStore(memKV({ [ProgressStore.KEY]: raw }));
    expect(p.isCompleted('signs')).toBe(true);
    expect(p.missed()).toEqual(['q1']);
  });
  test('storage that throws does not break the app', () => {
    const kv: KV = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const p = new ProgressStore(kv);
    expect(() => p.completeLesson('signs')).not.toThrow();
    expect(p.isCompleted('signs')).toBe(true);
  });

  describe('saved place', () => {
    const yieldL = { id: 'yield', cards: [{}, {}, {}] };
    test('is saved per lesson and survives a reload', () => {
      const kv = memKV();
      const p = new ProgressStore(kv);
      expect(p.resumeCard(yieldL)).toBe(0);
      p.setPlace('yield', 2);
      expect(new ProgressStore(kv).resumeCard(yieldL)).toBe(2);
    });
    test('another lesson starts at card 0', () => {
      const p = new ProgressStore(memKV());
      p.setPlace('yield', 2);
      expect(p.resumeCard({ id: 'signs', cards: [{}, {}, {}] })).toBe(0);
    });
    test('an index out of range after a lesson changes falls back to 0', () => {
      const p = new ProgressStore(memKV());
      p.setPlace('yield', 2);
      expect(p.resumeCard({ id: 'yield', cards: [{}, {}] })).toBe(0);
    });
    test('clearPlace forgets it', () => {
      const p = new ProgressStore(memKV());
      p.setPlace('yield', 1);
      p.clearPlace();
      expect(p.resumeCard(yieldL)).toBe(0);
    });
    test('bad stored places are dropped, other data kept', () => {
      for (const place of [{ lesson: 5, card: 1 }, { lesson: 'yield', card: -1 }, { lesson: 'yield', card: 1.5 }, 'x', null]) {
        const kv = memKV({ [ProgressStore.KEY]: JSON.stringify({ completed: ['signs'], missed: [], place }) });
        const p = new ProgressStore(kv);
        expect(p.resumeCard(yieldL)).toBe(0);
        expect(p.isCompleted('signs')).toBe(true);
      }
    });
    test('old saves without a place still load', () => {
      const kv = memKV({ [ProgressStore.KEY]: JSON.stringify({ completed: ['signs'], missed: ['q1'] }) });
      const p = new ProgressStore(kv);
      expect(p.missed()).toEqual(['q1']);
      expect(p.resumeCard(yieldL)).toBe(0);
    });
  });
});

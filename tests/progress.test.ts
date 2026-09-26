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

  describe('saved places', () => {
    const yieldL = { id: 'yield', cards: [{}, {}, {}] };
    const L = [
      { id: 'signs', order: 1, cards: [{}, {}, {}] },
      { id: 'yield', order: 2, cards: [{}, {}, {}] },
      { id: 'lights', order: 3, cards: [{}, {}, {}] },
    ];
    test('are saved per lesson and survive a reload', () => {
      const kv = memKV();
      const p = new ProgressStore(kv);
      expect(p.resumeCard(yieldL)).toBe(0);
      p.setPlace('yield', 2);
      p.setPlace('signs', 1);
      const q = new ProgressStore(kv);
      expect(q.resumeCard(yieldL)).toBe(2);
      expect(q.resumeCard(L[0])).toBe(1);
      expect(q.resumeCard(L[2])).toBe(0);
    });
    test('an index out of range after a lesson changes falls back to 0', () => {
      const p = new ProgressStore(memKV());
      p.setPlace('yield', 2);
      expect(p.resumeCard({ id: 'yield', cards: [{}, {}] })).toBe(0);
    });
    test('clearPlace forgets only that lesson', () => {
      const p = new ProgressStore(memKV());
      p.setPlace('yield', 1);
      p.setPlace('signs', 2);
      p.clearPlace('yield');
      expect(p.resumeCard(yieldL)).toBe(0);
      expect(p.resumeCard(L[0])).toBe(2);
    });
    test('bad stored places are dropped, other data kept', () => {
      for (const places of [{ yield: { card: -1, seq: 1 } }, { yield: { card: 1.5, seq: 1 } }, { yield: 'x' }, { yield: { card: 1 } }, 'x', null, [1]]) {
        const kv = memKV({ [ProgressStore.KEY]: JSON.stringify({ completed: ['signs'], missed: [], places }) });
        const p = new ProgressStore(kv);
        expect(p.resumeCard(yieldL)).toBe(0);
        expect(p.isCompleted('signs')).toBe(true);
      }
    });
    test('old saves without places still load', () => {
      const kv = memKV({ [ProgressStore.KEY]: JSON.stringify({ completed: ['signs'], missed: ['q1'] }) });
      const p = new ProgressStore(kv);
      expect(p.missed()).toEqual(['q1']);
      expect(p.resumeCard(yieldL)).toBe(0);
    });
    test('Keep going picks the most recently used unfinished lesson', () => {
      const kv = memKV();
      const p = new ProgressStore(kv);
      expect(p.keepGoing(L)?.id).toBe('signs'); // nothing started: nextLesson
      p.setPlace('lights', 1);
      p.setPlace('yield', 2);
      expect(p.keepGoing(L)?.id).toBe('yield');
      p.setPlace('lights', 0); // moving in a lesson makes it the most recent
      expect(new ProgressStore(kv).keepGoing(L)?.id).toBe('lights');
    });
    test('Keep going skips finished lessons and lessons that no longer exist', () => {
      const p = new ProgressStore(memKV());
      p.setPlace('yield', 2);
      p.setPlace('gone', 1);
      p.completeLesson('yield'); // e.g. a completed lesson replayed and left mid-way
      expect(p.keepGoing(L)?.id).toBe('signs');
    });
  });

  describe('reader place', () => {
    const place = { chapter: 'ch04', section: 'ch04-signals', paragraph: 'ch04-signals-3' };
    test('starts empty, saves and reloads', () => {
      const kv = memKV();
      const p = new ProgressStore(kv);
      expect(p.readerPlace()).toBeNull();
      p.setReaderPlace(place);
      expect(new ProgressStore(kv).readerPlace()).toEqual(place);
    });
    test('a malformed reader place is dropped and nothing else is lost', () => {
      const raw = JSON.stringify({ completed: ['signs'], missed: ['q1'], places: { yield: { card: 1, seq: 1 } }, reader: { chapter: 'ch04', section: 3 } });
      const p = new ProgressStore(memKV({ [ProgressStore.KEY]: raw }));
      expect(p.readerPlace()).toBeNull();
      expect(p.isCompleted('signs')).toBe(true);
      expect(p.missed()).toEqual(['q1']);
      expect(p.resumeCard({ id: 'yield', cards: [1, 2, 3] })).toBe(1);
    });
    test('the returned place is a copy', () => {
      const p = new ProgressStore(memKV());
      p.setReaderPlace(place);
      p.readerPlace()!.paragraph = 'changed';
      expect(p.readerPlace()).toEqual(place);
    });
  });
});

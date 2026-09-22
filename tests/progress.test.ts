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
});

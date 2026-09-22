import { describe, test, expect, beforeEach, vi } from 'vitest';

// Minimal fakes for the browser pieces AudioPlayer uses.
class FakeAudio {
  static last: FakeAudio;
  preload = '';
  src = '';
  paused = true;
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  plays: string[] = [];
  constructor() { FakeAudio.last = this; }
  play() { this.paused = false; this.plays.push(this.src); return Promise.resolve(); }
  pause() { this.paused = true; }
  end() { this.paused = true; this.onended?.(); }
}

let pendingFetches: Array<() => void> = [];
beforeEach(() => {
  pendingFetches = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  // Timings fetches stay pending until the test releases them (a slow network).
  vi.stubGlobal('fetch', () => new Promise((resolve) => {
    pendingFetches.push(() => resolve({ ok: true, json: async () => ({ words: [] }) }));
  }));
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const settled = <T>(p: Promise<T>) => {
  const s = { done: false, error: undefined as unknown };
  p.then(() => { s.done = true; }, (e) => { s.done = true; s.error = e; });
  return s;
};

describe('AudioPlayer', () => {
  test('play() with an already-aborted signal does not stop the current clip', async () => {
    const { AudioPlayer } = await import('../src/audio/player');
    const p = new AudioPlayer('/');
    const first = settled(p.play('a', new AbortController().signal));
    await flush();
    const dead = new AbortController();
    dead.abort();
    await expect(p.play('b', dead.signal)).rejects.toBeDefined();
    await flush();
    expect(first.done).toBe(false);
    expect(FakeAudio.last.paused).toBe(false);
    FakeAudio.last.end();
    await flush();
    expect(first).toEqual({ done: true, error: undefined });
  });

  test('two plays racing on slow timings both settle; the later one wins', async () => {
    const { AudioPlayer } = await import('../src/audio/player');
    const p = new AudioPlayer('/');
    const onWord = () => {};
    const first = settled(p.play('x', new AbortController().signal, onWord));
    const second = settled(p.play('y', new AbortController().signal, onWord));
    await flush();
    pendingFetches.forEach((f) => f());
    await flush(); await flush();
    expect(first.done).toBe(true);
    expect((first.error as DOMException).name).toBe('AbortError');
    expect(FakeAudio.last.plays).toEqual(['/audio/y.mp3']);
    FakeAudio.last.end();
    await flush();
    expect(second).toEqual({ done: true, error: undefined });
  });

  test('stop() while timings load settles the pending play', async () => {
    const { AudioPlayer } = await import('../src/audio/player');
    const p = new AudioPlayer('/');
    const first = settled(p.play('x', new AbortController().signal, () => {}));
    await flush();
    p.stop();
    pendingFetches.forEach((f) => f());
    await flush(); await flush();
    expect(first.done).toBe(true);
    expect(FakeAudio.last.plays).toEqual([]);
  });
});

import { describe, test, expect } from 'vitest';
import { childController, chooseOne } from '../src/ui/dom';

/** EventTarget that counts live listeners. */
class Counting extends EventTarget {
  live = 0;
  addEventListener(...a: Parameters<EventTarget['addEventListener']>) { this.live++; super.addEventListener(...a); }
  removeEventListener(...a: Parameters<EventTarget['removeEventListener']>) { this.live--; super.removeEventListener(...a); }
}

describe('dom helpers', () => {
  test('chooseOne removes listeners from every element once one is picked', async () => {
    const els = [new Counting(), new Counting(), new Counting()];
    const parent = new AbortController();
    const p = chooseOne(els as unknown as HTMLElement[], parent.signal);
    els[1].dispatchEvent(new Event('click'));
    expect(await p).toBe(1);
    expect(els.map((e) => e.live)).toEqual([0, 0, 0]);
  });

  test('childController detaches from its parent when aborted on its own', () => {
    const parent = new AbortController();
    const removed: unknown[] = [];
    const orig = parent.signal.removeEventListener.bind(parent.signal);
    parent.signal.removeEventListener = ((t: string, l: EventListener) => { removed.push(t); orig(t, l); }) as typeof orig;
    const c = childController(parent.signal);
    c.abort();
    expect(removed).toContain('abort');
  });

  test('childController still follows its parent', () => {
    const parent = new AbortController();
    const c = childController(parent.signal);
    parent.abort();
    expect(c.signal.aborted).toBe(true);
  });
});

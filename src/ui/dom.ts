type Child = Node | string;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string | undefined> = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

export function clicked(el: HTMLElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onClick = () => { cleanup(); resolve(); };
    const onAbort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => { el.removeEventListener('click', onClick); signal.removeEventListener('abort', onAbort); };
    el.addEventListener('click', onClick);
    signal.addEventListener('abort', onAbort);
  });
}

/** Resolves with the index of the first element clicked. Removes all its listeners when it settles. */
export function chooseOne(els: HTMLElement[], signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onClicks = els.map((_, i) => () => { cleanup(); resolve(i); });
    const onAbort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => {
      els.forEach((el, i) => el.removeEventListener('click', onClicks[i]));
      signal.removeEventListener('abort', onAbort);
    };
    els.forEach((el, i) => el.addEventListener('click', onClicks[i]));
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const id = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(id); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function childController(parent: AbortSignal): AbortController {
  const c = new AbortController();
  if (parent.aborted) {
    c.abort(parent.reason);
  } else {
    const onParentAbort = () => c.abort(parent.reason);
    parent.addEventListener('abort', onParentAbort, { once: true });
    // Aborted on its own: stop listening to the parent so long-lived parents don't pile up listeners.
    c.signal.addEventListener('abort', () => parent.removeEventListener('abort', onParentAbort), { once: true });
  }
  return c;
}

/**
 * Moves keyboard focus to the screen's main control: the first enabled primary (.btn.go) button,
 * else the first enabled answer tile, else the first enabled button in the bottom bar, else any enabled button.
 */
export function focusMain(root: HTMLElement): HTMLElement | null {
  const el = root.querySelector<HTMLElement>('.btn.go:not([disabled])')
    ?? root.querySelector<HTMLElement>('.tile:not([disabled])')
    ?? root.querySelector<HTMLElement>('.bar button:not([disabled])')
    ?? root.querySelector<HTMLElement>('button:not([disabled])');
  el?.focus();
  return el;
}

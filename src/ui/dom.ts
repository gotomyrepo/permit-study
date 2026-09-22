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

export function chooseOne(els: HTMLElement[], signal: AbortSignal): Promise<number> {
  return Promise.race(els.map((el, i) => clicked(el, signal).then(() => i)));
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
  if (parent.aborted) c.abort(parent.reason);
  else parent.addEventListener('abort', () => c.abort(parent.reason), { once: true });
  return c;
}

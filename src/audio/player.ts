interface WordTiming { i: number; start: number; end: number }

export class AudioPlayer {
  private audio = new Audio();
  private words = new Map<string, WordTiming[]>();
  private cancelCurrent: (() => void) | null = null;

  constructor(private base: string) { this.audio.preload = 'auto'; }

  private async timings(id: string): Promise<WordTiming[]> {
    if (!this.words.has(id)) {
      try {
        const r = await fetch(`${this.base}audio/${id}.json`);
        this.words.set(id, r.ok ? ((await r.json()).words as WordTiming[]) : []);
      } catch { this.words.set(id, []); }
    }
    return this.words.get(id)!;
  }

  /** Resolves when the clip ends. Rejects with AbortError if aborted or replaced by another play(), or with Error if it fails. */
  async play(id: string, signal: AbortSignal, onWord?: (i: number) => void): Promise<void> {
    this.cancelCurrent?.();
    if (signal.aborted) throw signal.reason;
    const words = onWord ? await this.timings(id) : [];
    if (signal.aborted) throw signal.reason;
    const a = this.audio;
    a.pause();
    a.src = `${this.base}audio/${id}.mp3`;
    await new Promise<void>((resolve, reject) => {
      let raf = 0;
      let settled = false;
      const done = (err?: unknown) => {
        if (settled) return;
        settled = true;
        cancelAnimationFrame(raf);
        a.onended = null;
        a.onerror = null;
        signal.removeEventListener('abort', onAbort);
        if (this.cancelCurrent === cancel) this.cancelCurrent = null;
        onWord?.(-1);
        if (err) reject(err); else resolve();
      };
      const onAbort = () => { a.pause(); done(signal.reason); };
      const cancel = () => { a.pause(); done(new DOMException('replaced', 'AbortError')); };
      this.cancelCurrent = cancel;
      const tick = () => {
        const ms = a.currentTime * 1000;
        let cur = -1;
        for (const w of words) if (ms >= w.start) cur = w.i;
        onWord?.(cur);
        raf = requestAnimationFrame(tick);
      };
      a.onended = () => done();
      a.onerror = () => done(new Error(`audio failed: ${id}`));
      signal.addEventListener('abort', onAbort, { once: true });
      a.play().then(() => { if (onWord && !settled) raf = requestAnimationFrame(tick); }, (e) => done(e));
    });
  }

  stop(): void { this.cancelCurrent?.(); this.audio.pause(); }
}

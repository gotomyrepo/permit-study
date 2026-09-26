interface WordTiming { i: number; start: number; end: number }

export class AudioPlayer {
  private audio = new Audio();
  private words = new Map<string, WordTiming[]>();
  private cancelCurrent: (() => void) | null = null;
  /** Bumped by every play() and stop(); a play() that finds it changed after an await was replaced. */
  private gen = 0;

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

  /**
   * Resolves when the clip ends. Rejects with AbortError if aborted, replaced by another play() or stopped,
   * or with Error if it fails. Always settles.
   */
  async play(id: string, signal: AbortSignal, onWord?: (i: number) => void): Promise<void> {
    if (signal.aborted) throw signal.reason; // a dead signal must not stop what is playing now
    const gen = ++this.gen;
    this.cancelCurrent?.();
    const words = onWord ? await this.timings(id) : [];
    if (signal.aborted) throw signal.reason;
    if (gen !== this.gen) throw new DOMException('replaced', 'AbortError');
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

  /** Pauses the current clip. Its play() stays pending until resume() lets it end, or it is stopped or aborted. */
  pause(): void { if (this.cancelCurrent) this.audio.pause(); }

  /** Continues a paused clip. Does nothing if no clip is playing. */
  resume(): void { if (this.cancelCurrent && this.audio.paused) void this.audio.play().catch(() => {}); }

  /** How far into the current clip playback is, in ms (0 when no clip is playing). */
  elapsedMs(): number { return this.cancelCurrent ? Math.round(this.audio.currentTime * 1000) : 0; }

  stop(): void { this.gen++; this.cancelCurrent?.(); this.audio.pause(); }
}

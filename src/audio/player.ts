interface WordTiming { i: number; start: number; end: number }

export class AudioPlayer {
  private audio = new Audio();
  private words = new Map<string, WordTiming[]>();
  private cancelCurrent: (() => void) | null = null;
  /** Starts (or restarts) the current clip's playback; set while a play() is in flight. */
  private startPlayback: (() => void) | null = null;
  /** True from pause() until resume(), stop() or a new play() clears it. */
  private paused = false;
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
    this.paused = false; // a new play() always starts fresh, not paused
    const words = onWord ? await this.timings(id) : [];
    if (signal.aborted) throw signal.reason;
    if (gen !== this.gen) throw new DOMException('replaced', 'AbortError');
    const a = this.audio;
    a.pause();
    a.src = `${this.base}audio/${id}.mp3`;
    await new Promise<void>((resolve, reject) => {
      let raf = 0;
      let rafStarted = false;
      let settled = false;
      const done = (err?: unknown) => {
        if (settled) return;
        settled = true;
        this.paused = false;
        cancelAnimationFrame(raf);
        a.onended = null;
        a.onerror = null;
        signal.removeEventListener('abort', onAbort);
        if (this.cancelCurrent === cancel) this.cancelCurrent = null;
        if (this.startPlayback === start) this.startPlayback = null;
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
      // Starts (or restarts) playback. Called now unless paused, and again by resume().
      const start = () => {
        a.play().then(
          () => { if (onWord && !rafStarted && !settled) { rafStarted = true; raf = requestAnimationFrame(tick); } },
          // The browser rejects an in-flight play() with AbortError when a pause() interrupts it, even one
          // already undone by a quick resume() (the rejection is queued and can arrive after `paused` flips
          // back to false). Either way it is not a real failure and must not end the clip. stop()/abort call
          // done() directly, and load failures go through onerror, so this can only ever be that rejection.
          (e) => { if (!(e instanceof DOMException && e.name === 'AbortError')) done(e); },
        );
      };
      this.startPlayback = start;
      a.onended = () => done();
      a.onerror = () => done(new Error(`audio failed: ${id}`));
      signal.addEventListener('abort', onAbort, { once: true });
      if (!this.paused) start();
    });
  }

  /** Pauses the current clip. Its play() stays pending until resume() lets it end, or it is stopped or aborted. */
  pause(): void {
    this.paused = true;
    this.audio.pause();
  }

  /** Continues a paused clip. Does nothing if pause() was not called (or was already undone). */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.startPlayback?.();
  }

  /** How far into the current clip playback is, in ms (0 when no clip is playing). */
  elapsedMs(): number { return this.cancelCurrent ? Math.round(this.audio.currentTime * 1000) : 0; }

  stop(): void { this.gen++; this.paused = false; this.cancelCurrent?.(); this.audio.pause(); }
}

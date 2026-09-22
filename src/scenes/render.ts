import type { SceneDef } from './types';
import { frameAt } from './engine';
import { vehicleSvg } from './vehicles';

export class ScenePlayer {
  private actorEls = new Map<string, Element>();
  private propEls = new Map<string, Element>();
  private raf = 0;
  private finish: (() => void) | null = null;

  constructor(host: HTMLElement, private scene: SceneDef) {
    host.innerHTML =
      `<svg class="scene" viewBox="0 0 ${scene.width} ${scene.height}" xmlns="http://www.w3.org/2000/svg" role="img">` +
      scene.background +
      scene.actors.map((a) => `<g class="actor" data-id="${a.id}">${vehicleSvg(a)}</g>`).join('') +
      `</svg>`;
    const svg = host.querySelector('svg')!;
    for (const a of scene.actors) this.actorEls.set(a.id, svg.querySelector(`g.actor[data-id="${a.id}"]`)!);
    for (const p of scene.props) {
      const el = svg.querySelector(`[data-prop="${p}"]`);
      if (el) this.propEls.set(p, el);
    }
    this.showFrame(0, 0);
  }

  showFrame(stepIndex: number, t: number): void {
    const f = frameAt(this.scene, stepIndex, t);
    for (const [id, el] of this.actorEls) {
      const p = f.poses[id];
      el.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${p.heading})`);
      el.setAttribute('data-state', f.states[id] ?? '');
    }
    for (const [id, el] of this.propEls) el.setAttribute('data-state', f.states[id] ?? '');
  }

  /** Plays one step from its start. Resolves when it ends or when stop() is called. */
  play(stepIndex: number): Promise<void> {
    this.stop();
    const dur = this.scene.steps[stepIndex].duration;
    return new Promise((resolve) => {
      this.finish = resolve;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(now - t0, dur);
        this.showFrame(stepIndex, t);
        if (t >= dur) { this.finish = null; resolve(); return; }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    const f = this.finish;
    this.finish = null;
    f?.();
  }
}

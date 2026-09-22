import type { Lesson } from './content/types';
import { AudioPlayer } from './audio/player';
import { ProgressStore, safeStorage } from './progress/store';
import { isAbort } from './ui/dom';
import type { Ctx } from './screens/ctx';
import { showHome } from './screens/home';
import { learnCard } from './screens/learn';
import { askQuestion } from './screens/question';
import { lessonEnd } from './screens/lessonEnd';
import { runPractice } from './screens/practice';

export class App {
  private player = new AudioPlayer(import.meta.env.BASE_URL);
  private progress = new ProgressStore(safeStorage());

  constructor(private root: HTMLElement, private lessons: Lesson[]) {}

  private newCtx(): Ctx {
    const c = new AbortController();
    return { root: this.root, player: this.player, signal: c.signal, goHome: () => c.abort() };
  }

  async start(): Promise<never> {
    for (;;) {
      const ctx = this.newCtx();
      try {
        const choice = await showHome(ctx, this.lessons, this.progress);
        this.player.stop();
        if (choice.kind === 'lesson') await this.runLesson(ctx, choice.lesson);
        else await runPractice(ctx, this.lessons, this.progress);
      } catch (e) {
        if (!isAbort(e)) console.error(e);
      } finally {
        this.player.stop();
      }
    }
  }

  private async runLesson(ctx: Ctx, lesson: Lesson): Promise<void> {
    const total = lesson.cards.length + lesson.questions.length;
    let n = 0;
    for (const card of lesson.cards) await learnCard(ctx, card, n++ / total);
    for (const q of lesson.questions) {
      const ok = await askQuestion(ctx, lesson, q, 'teach', n++ / total);
      if (ok) this.progress.clearMissed(q.id); else this.progress.markMissed(q.id);
    }
    this.progress.completeLesson(lesson.id);
    await lessonEnd(ctx, lesson);
  }
}

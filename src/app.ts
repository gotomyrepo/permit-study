import type { Lesson } from './content/types';
import { AudioPlayer } from './audio/player';
import { ProgressStore, safeStorage } from './progress/store';
import { isAbort } from './ui/dom';
import type { Ctx } from './screens/ctx';
import { showHome, type HomeChoice } from './screens/home';
import { learnCard } from './screens/learn';
import { askQuestion } from './screens/question';
import { lessonEnd } from './screens/lessonEnd';
import { runPractice } from './screens/practice';
import type { Chapter } from './reader/types';
import { Playlist } from './reader/playlist';
import { runReader } from './screens/reader';

export class App {
  private player = new AudioPlayer(import.meta.env.BASE_URL);
  private progress = new ProgressStore(safeStorage());

  private playlist: Playlist;

  /** Set by ctx.openReader: what to open instead of Home after the current flow is aborted. */
  private pending: HomeChoice | null = null;

  constructor(private root: HTMLElement, private lessons: Lesson[], chapters: Chapter[] = []) {
    this.playlist = new Playlist(chapters);
  }

  private newCtx(): Ctx {
    const c = new AbortController();
    return {
      root: this.root, player: this.player, signal: c.signal, goHome: () => c.abort(),
      openReader: (section) => { this.pending = { kind: 'reader', section }; c.abort(); },
    };
  }

  async start(): Promise<never> {
    for (;;) {
      const ctx = this.newCtx();
      try {
        const pending = this.pending;
        this.pending = null;
        const choice = pending ?? await showHome(ctx, this.lessons, this.progress, this.playlist.length > 0);
        this.player.stop();
        if (choice.kind === 'lesson') await this.runLesson(ctx, choice.lesson);
        else if (choice.kind === 'reader') await this.runReader(ctx, choice.section);
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
    let i = this.progress.resumeCard(lesson);
    while (i < lesson.cards.length) {
      this.progress.setPlace(lesson.id, i);
      const move = await learnCard(ctx, lesson.cards[i], i / total, i > 0, lesson.readerStart);
      if (move === 'next') i++;
      else if (move === 'back') i--;
      else { this.progress.clearPlace(lesson.id); i = 0; }
    }
    let n = lesson.cards.length;
    for (const q of lesson.questions) {
      const ok = await askQuestion(ctx, lesson, q, 'teach', n++ / total);
      if (ok) this.progress.clearMissed(q.id); else this.progress.markMissed(q.id);
    }
    this.progress.completeLesson(lesson.id);
    this.progress.clearPlace(lesson.id);
    await lessonEnd(ctx, lesson);
  }

  /** Opens the reader at `section`'s first paragraph, or where she left off. */
  private async runReader(ctx: Ctx, section?: string): Promise<void> {
    const at = section === undefined ? -1 : this.playlist.sectionStart(section);
    await runReader(ctx, this.playlist, this.progress, at >= 0 ? at : this.playlist.resume(this.progress.readerPlace()));
  }
}

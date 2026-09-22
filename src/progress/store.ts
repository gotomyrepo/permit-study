export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
interface Data { completed: string[]; missed: string[] }

export function safeStorage(): KV {
  try {
    const s = window.localStorage;
    s.setItem('__probe', '1');
    s.removeItem('__probe');
    return s;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
  }
}

export class ProgressStore {
  static readonly KEY = 'permit-progress-v1';
  private data: Data;

  constructor(private kv: KV) { this.data = this.load(); }

  private load(): Data {
    try {
      const raw = this.kv.getItem(ProgressStore.KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d && Array.isArray(d.completed) && Array.isArray(d.missed)) return { completed: d.completed, missed: d.missed };
    } catch { /* fall through */ }
    return { completed: [], missed: [] };
  }

  private save(): void {
    try { this.kv.setItem(ProgressStore.KEY, JSON.stringify(this.data)); } catch { /* keep working without saving */ }
  }

  isCompleted(id: string): boolean { return this.data.completed.includes(id); }
  completeLesson(id: string): void { if (!this.isCompleted(id)) { this.data.completed.push(id); this.save(); } }
  nextLesson<T extends { id: string; order: number }>(lessons: T[]): T | undefined {
    const sorted = [...lessons].sort((a, b) => a.order - b.order);
    return sorted.find((l) => !this.isCompleted(l.id)) ?? sorted[0];
  }
  missed(): string[] { return [...this.data.missed]; }
  markMissed(qid: string): void { if (!this.data.missed.includes(qid)) { this.data.missed.push(qid); this.save(); } }
  clearMissed(qid: string): void {
    const n = this.data.missed.length;
    this.data.missed = this.data.missed.filter((x) => x !== qid);
    if (this.data.missed.length !== n) this.save();
  }
}

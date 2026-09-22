import type { Lesson, Source } from './types';
import { normalizeForMatch } from './normalize';

export interface ManualPage { page: number; text: string }
export type SceneIndex = Record<string, string[]>;

export function validateLessons(lessons: Lesson[], pages: ManualPage[], scenes: SceneIndex): string[] {
  const errors: string[] = [];
  const norm = new Map(pages.map((p) => [p.page, normalizeForMatch(p.text)]));
  const ids = new Set<string>();
  const orders = new Set<number>();

  const checkId = (id: string, where: string) => {
    if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    ids.add(id);
  };
  const checkSource = (s: Source, where: string) => {
    const here = norm.get(s.page);
    if (here === undefined) { errors.push(`${where}: page ${s.page} is not in the manual`); return; }
    if (s.quote) {
      const text = here + (norm.get(s.page + 1) ?? '');
      if (!text.includes(normalizeForMatch(s.quote))) errors.push(`${where}: quote not found on page ${s.page}: "${s.quote}"`);
    }
  };
  const checkScene = (scene: string, step: string, where: string) => {
    const steps = scenes[scene];
    if (!steps) errors.push(`${where}: unknown scene "${scene}"`);
    else if (!steps.includes(step)) errors.push(`${where}: scene "${scene}" has no step "${step}"`);
  };

  for (const l of lessons) {
    checkId(l.id, `lesson ${l.id}`);
    if (orders.has(l.order)) errors.push(`lesson ${l.id}: duplicate order ${l.order}`);
    orders.add(l.order);
    const cardIds = new Set(l.cards.map((c) => c.id));
    for (const c of l.cards) {
      const where = `${l.id}/${c.id}`;
      checkId(c.id, where);
      checkSource(c.source, where);
      checkScene(c.scene, c.step, where);
    }
    for (const q of l.questions) {
      const where = `${l.id}/${q.id}`;
      checkId(q.id, where);
      checkSource(q.source, where);
      checkScene(q.scene, q.step, where);
      if (q.answer >= q.choices.length) errors.push(`${where}: answer ${q.answer} but only ${q.choices.length} choices`);
      if (!cardIds.has(q.explainCard)) errors.push(`${where}: explainCard "${q.explainCard}" is not a card in this lesson`);
    }
  }
  return errors;
}

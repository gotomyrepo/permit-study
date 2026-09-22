import type { Lesson, Source } from './types';
import { normalizeForMatch } from './normalize';
import { audioLines } from './audioLines';

export interface ManualPage { page: number; text: string }
export type SceneIndex = Record<string, string[]>;

const MIN_QUOTE_NORM_LEN = 20;
const MIN_QUOTE_WORDS = 4;

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

/**
 * True if `quote` (already normalized) occurs in `haystack` (already normalized) at a
 * position where it isn't a partial number: if the quote starts or ends with a digit,
 * the character immediately outside the match may not also be a digit. Without this,
 * "5 mph" would match inside "55 mph" and "5 feet" inside "15 feet".
 */
function quoteFound(haystack: string, quote: string): boolean {
  if (!quote) return false;
  const startsDigit = isDigit(quote[0]);
  const endsDigit = isDigit(quote[quote.length - 1]);
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(quote, from);
    if (idx < 0) return false;
    const beforeOk = !startsDigit || !isDigit(haystack[idx - 1]);
    const afterOk = !endsDigit || !isDigit(haystack[idx + quote.length]);
    if (beforeOk && afterOk) return true;
    from = idx + 1;
  }
}

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
      const normQuote = normalizeForMatch(s.quote);
      const words = s.quote.trim().split(/\s+/).filter(Boolean).length;
      if (normQuote.length < MIN_QUOTE_NORM_LEN && words < MIN_QUOTE_WORDS) {
        errors.push(`${where}: quote too short to verify (need ${MIN_QUOTE_NORM_LEN}+ characters or ${MIN_QUOTE_WORDS}+ words): "${s.quote}"`);
        return;
      }
      const text = here + (norm.get(s.page + 1) ?? '');
      if (!quoteFound(text, normQuote)) errors.push(`${where}: quote not found on page ${s.page}: "${s.quote}"`);
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

  try {
    const audioSeenAt = new Map<string, string>();
    for (const line of audioLines(lessons)) {
      const prior = audioSeenAt.get(line.id);
      if (prior !== undefined) errors.push(`duplicate audio id "${line.id}" (id collision between generated audio lines)`);
      else audioSeenAt.set(line.id, line.text);
    }
  } catch {
    // A malformed answer index (already reported above) can make audioLines() throw
    // while building feedback text; skip the audio-id check in that case.
  }

  return errors;
}

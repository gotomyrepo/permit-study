import type { Lesson, Source } from './types';
import { PICTURE_NONE, type Chapter } from '../reader/types';
import { normalizeForMatch, normalizeIndexed } from './normalize';
import { audioLines } from './audioLines';

export interface ManualPage { page: number; text: string }
export type SceneIndex = Record<string, string[]>;

const MIN_QUOTE_NORM_LEN = 20;
const MIN_QUOTE_WORDS = 4;

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const isLetter = (c: string | undefined) => c !== undefined && c >= 'a' && c <= 'z';

/**
 * Is there a letter immediately before `pos` in the un-stripped page text `t`, treating a
 * hyphenated line break ("intersec-\ntion") as no boundary at all (i.e. still the same word)?
 */
function letterBefore(t: string, pos: number): boolean {
  let j = pos - 1;
  if (t[j] === '\n' && t[j - 1] === '-') j -= 2;
  return isLetter(t[j]);
}

/** Mirror of letterBefore, checking the character immediately after `pos` (exclusive end of a match). */
function letterAfter(t: string, pos: number): boolean {
  let j = pos;
  if (t[j] === '-' && t[j + 1] === '\n') j += 2;
  return isLetter(t[j]);
}

/**
 * True if `quote` (already normalized) occurs in the normalized page text `norm` at a
 * position that respects word/number boundaries:
 * - if the quote starts or ends with a digit, the normalized character immediately
 *   outside the match may not also be a digit ("5 mph" must not match inside "55 mph");
 * - if the quote starts or ends with a letter, the ORIGINAL (un-stripped) page character
 *   immediately outside the match may not also be a letter ("legal ..." must not match
 *   inside "illegal ...", since normalizeForMatch strips the space that would separate them).
 * `t`/`idx` are normalizeIndexed(pageText): idx[k] is t's index for norm[k].
 */
function quoteFound(norm: string, t: string, idx: number[], quote: string): boolean {
  if (!quote) return false;
  const startsDigit = isDigit(quote[0]);
  const endsDigit = isDigit(quote[quote.length - 1]);
  const startsLetter = isLetter(quote[0]);
  const endsLetter = isLetter(quote[quote.length - 1]);
  let from = 0;
  for (;;) {
    const i = norm.indexOf(quote, from);
    if (i < 0) return false;
    const last = i + quote.length - 1;
    const beforeDigitOk = !startsDigit || !isDigit(norm[i - 1]);
    const afterDigitOk = !endsDigit || !isDigit(norm[i + quote.length]);
    const beforeLetterOk = !startsLetter || !letterBefore(t, idx[i]);
    const afterLetterOk = !endsLetter || !letterAfter(t, idx[last] + 1);
    if (beforeDigitOk && afterDigitOk && beforeLetterOk && afterLetterOk) return true;
    from = i + 1;
  }
}

/** Returns a checker that pushes an error for a source whose page is unknown or whose quote isn't on that page (or continuing onto the next). */
export function sourceChecker(pages: ManualPage[], errors: string[]): (s: Source, where: string) => void {
  const indexed = new Map(pages.map((p) => [p.page, normalizeIndexed(p.text)]));
  return (s, where) => {
    const here = indexed.get(s.page);
    if (here === undefined) { errors.push(`${where}: page ${s.page} is not in the manual`); return; }
    if (s.quote) {
      const normQuote = normalizeForMatch(s.quote);
      const words = s.quote.trim().split(/\s+/).filter(Boolean).length;
      if (normQuote.length < MIN_QUOTE_NORM_LEN && words < MIN_QUOTE_WORDS) {
        errors.push(`${where}: quote too short to verify (need ${MIN_QUOTE_NORM_LEN}+ characters or ${MIN_QUOTE_WORDS}+ words): "${s.quote}"`);
        return;
      }
      // Concatenate this page with the next so a quote may continue across a page break;
      // idx offsets for the next page's characters shift by here.t.length.
      const next = indexed.get(s.page + 1);
      const t = here.t + (next?.t ?? '');
      const norm = here.norm + (next?.norm ?? '');
      const idx = next ? here.idx.concat(next.idx.map((k) => k + here.t.length)) : here.idx;
      if (!quoteFound(norm, t, idx, normQuote)) errors.push(`${where}: quote not found on page ${s.page}: "${s.quote}"`);
    }
  };
}

export function validateLessons(lessons: Lesson[], pages: ManualPage[], scenes: SceneIndex): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const orders = new Set<number>();

  const checkId = (id: string, where: string) => {
    if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    ids.add(id);
  };
  const checkSource = sourceChecker(pages, errors);
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

/**
 * Reader chapters: unique ids (chapters, sections, paragraphs share one namespace) and chapter numbers,
 * quotes on their pages, pictures that have a PNG (`pictures` holds fig-<id> and scene:<id> ids),
 * fig-<id> pictures that are also listed in figures.yaml (`figures`, so a stale PNG can't pass),
 * and every lesson readerStart naming a real section.
 */
export function validateReader(
  chapters: readonly Chapter[], pages: ManualPage[], pictures: ReadonlySet<string>, figures: ReadonlySet<string>,
  lessons: readonly { id: string; readerStart?: string }[],
): string[] {
  const errors: string[] = [];
  const checkSource = sourceChecker(pages, errors);
  const ids = new Set<string>();
  const numbers = new Set<number>();
  const checkId = (id: string, where: string) => {
    if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    ids.add(id);
  };
  for (const ch of chapters) {
    checkId(ch.id, `chapter ${ch.id}`);
    if (numbers.has(ch.number)) errors.push(`chapter ${ch.id}: duplicate number ${ch.number}`);
    numbers.add(ch.number);
    for (const s of ch.sections) {
      checkId(s.id, `${ch.id}/${s.id}`);
      for (const p of s.paragraphs) {
        const where = `${ch.id}/${s.id}/${p.id}`;
        checkId(p.id, where);
        checkSource(p.source, where);
        if (p.picture && p.picture !== PICTURE_NONE && !pictures.has(p.picture)) errors.push(`${where}: picture "${p.picture}" has no PNG (run: npm run figures)`);
        if (p.picture?.startsWith('fig-') && !figures.has(p.picture)) errors.push(`${where}: picture "${p.picture}" is not listed in content/reader/figures.yaml`);
      }
    }
  }
  const sections = new Set(chapters.flatMap((c) => c.sections.map((s) => s.id)));
  for (const l of lessons)
    if (l.readerStart !== undefined && !sections.has(l.readerStart)) errors.push(`lesson ${l.id}: readerStart "${l.readerStart}" is not a reader section`);
  return errors;
}

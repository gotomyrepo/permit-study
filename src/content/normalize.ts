const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const isLower = (c: string | undefined) => c !== undefined && c >= 'a' && c <= 'z';

/** NFKC + lowercase + fraction-slash mapping, with no characters removed (same indices as the input, aside from NFKC expansions like ligatures). */
function prep(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/⁄/g, '/'); // fraction slash -> /
}

export interface NormalizedIndexed {
  /** prep(s): the un-stripped text that boundary checks read original characters from. */
  t: string;
  /** normalizeForMatch(s): letters, digits, and digit-adjacent . , / only. */
  norm: string;
  /** idx[k] is the index into `t` of the character that produced norm[k]. */
  idx: number[];
}

/**
 * Lowercase letters and digits, plus ".", "," and "/" when they sit next to a digit
 * (".08", "1/2", "55/45"), keeping an index back to the un-stripped text so callers can
 * check word boundaries against the real characters (see quoteFound in validate.ts).
 */
export function normalizeIndexed(s: string): NormalizedIndexed {
  const t = prep(s);
  let norm = '';
  const idx: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (isLower(c) || isDigit(c)) { norm += c; idx.push(i); continue; }
    if ((c === '.' || c === ',' || c === '/') && (isDigit(t[i - 1]) || isDigit(t[i + 1]))) { norm += c; idx.push(i); }
  }
  return { t, norm, idx };
}

/**
 * Lowercase letters and digits only (plus digit-adjacent punctuation). Makes PDF artifacts
 * irrelevant: "intersec-\ntion", "Y ou", curly quotes, ligatures — while keeping distinct
 * numbers ("55 mph" vs "5 mph", ".08" vs "0.8") from collapsing into the same string.
 */
export function normalizeForMatch(s: string): string {
  return normalizeIndexed(s).norm;
}

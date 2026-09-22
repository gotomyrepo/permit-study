/** Lowercase letters and digits only. Makes PDF artifacts irrelevant: "intersec-\ntion", "Y ou", curly quotes, ligatures. */
export function normalizeForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
}

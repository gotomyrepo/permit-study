/**
 * Lowercase letters and digits, plus ".", "," and "/" when they sit next to a digit
 * (".08", "1/2", "55/45"). Makes PDF artifacts irrelevant: "intersec-\ntion", "Y ou",
 * curly quotes, ligatures — while keeping distinct numbers ("55 mph" vs "5 mph", ".08"
 * vs "0.8") from collapsing into the same string.
 */
export function normalizeForMatch(s: string): string {
  const t = s.normalize('NFKC').toLowerCase().replace(/⁄/g, '/'); // fraction slash -> /
  const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if ((c >= 'a' && c <= 'z') || isDigit(c)) { out += c; continue; }
    if ((c === '.' || c === ',' || c === '/') && (isDigit(t[i - 1]) || isDigit(t[i + 1]))) out += c;
  }
  return out;
}

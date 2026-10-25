const date = '(?:\\d{4}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}(?:\\s*日)?|\\d{4}\\s*[-/.]\\s*\\d{1,2}\\s*[-/.]\\s*\\d{1,2}|\\d{1,2}\\s*[-/.]\\s*\\d{1,2}\\s*[-/.]\\s*\\d{4}|\\d{4}\\s*[-/]\\s*\\d{1,2}|\\d{1,2}\\s*[-/]\\s*(?:\\d{4}|\\d{2}))';
const separator = '(?:至|to\\b|[–—-])';
const range = `(${date})(?:\\s*${separator}\\s*(${date}))?`;
// Match the whole date before considering month/year. A malformed continuation
// must not leave the user with a misleading mask over only part of the value.
export const expiryDatePattern = new RegExp(`^${range}(?!\\s*[-/.年月]\\s*\\d|\\s*(?:至|to\\b|[–—])|[\\p{L}\\p{N}])`, 'iu');
const completeExpiry = new RegExp(`^${range}$`, 'iu');

function calendar(year: number, month: number, day = 1): number[] {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2199 && parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day ? [parsed.getTime()] : [];
}

function interpretations(value: string): number[] {
  const n = value.match(/\d+/g)!.map(Number);
  if (n.length === 3) return n[0]! >= 1900 ? calendar(n[0]!, n[1]!, n[2]!) :
    [...calendar(n[2]!, n[1]!, n[0]!), ...calendar(n[2]!, n[0]!, n[1]!)];
  return n[0]! >= 1900 ? calendar(n[0]!, n[1]!) :
    calendar(n[1]! < 100 ? 2000 + n[1]! : n[1]!, n[0]!);
}

export function validExpiryDate(value: string): boolean {
  const matched = completeExpiry.exec(value.trim());
  if (!matched) return false;
  const starts = interpretations(matched[1]!);
  if (!matched[2]) return starts.length > 0;
  const ends = interpretations(matched[2]);
  // Day/month and month/day are both used on documents. Preserve ambiguous
  // candidates for review, but reject ranges impossible under either reading.
  return starts.some(start => ends.some(end => end >= start));
}

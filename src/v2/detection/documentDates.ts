// Supported printed birth dates: numeric YMD/DMY/MDY and English month names.
// A label supplies the birth-date context; this module does not infer dates in prose.
const monthName = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const numeric = '(?:\\d{4}\\s*[-/.年]\\s*\\d{1,2}\\s*[-/.月]\\s*\\d{1,2}\\s*日?|\\d{1,2}\\s*[-/.]\\s*\\d{1,2}\\s*[-/.]\\s*\\d{4})';
const dayMonthYear = `\\d{1,2}\\s+${monthName}\\.?\\s+\\d{4}`;
const monthDayYear = `${monthName}\\.?\\s+\\d{1,2}(?:,\\s*|\\s+)\\d{4}`;
export const birthDatePattern = new RegExp(`^(?:${numeric}|${dayMonthYear}|${monthDayYear})(?![\\p{L}\\p{N}])`, 'iu');
const numericDate = new RegExp(`^${numeric}$`, 'u');
const namedDayFirst = new RegExp(`^(\\d{1,2})\\s+(${monthName})\\.?\\s+(\\d{4})$`, 'i');
const namedMonthFirst = new RegExp(`^(${monthName})\\.?\\s+(\\d{1,2})(?:,\\s*|\\s+)(\\d{4})$`, 'i');
const months: Readonly<Record<string, number>> = { jan: 1, feb: 2, mar: 3, apr: 4,
  may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= new Date().getUTCFullYear() &&
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function validBirthDate(value: string): boolean {
  const text = value.trim();
  if (numericDate.test(text)) {
    const numbers = text.match(/\d+/g)!.map(Number);
    return numbers[0]! > 31 ? validCalendarDate(numbers[0]!, numbers[1]!, numbers[2]!) :
      validCalendarDate(numbers[2]!, numbers[0]!, numbers[1]!) ||
      validCalendarDate(numbers[2]!, numbers[1]!, numbers[0]!);
  }
  const dayFirst = namedDayFirst.exec(text);
  if (dayFirst) return validCalendarDate(Number(dayFirst[3]), months[dayFirst[2]!.slice(0, 3).toLowerCase()]!, Number(dayFirst[1]));
  const monthFirst = namedMonthFirst.exec(text);
  if (monthFirst) return validCalendarDate(Number(monthFirst[3]), months[monthFirst[1]!.slice(0, 3).toLowerCase()]!, Number(monthFirst[2]));
  return false;
}

import { expect, it } from 'vitest';
import { birthDatePattern, validBirthDate } from './documentDates';
it.each(['12 MAR 1990', '12 March 1990', 'March 12, 1990', 'Feb. 29 2000', '2000 年 2 月 29 日', '29 / 02 / 2000'])('accepts printed birth date %s', value => {
  expect(birthDatePattern.exec(value)?.[0]).toBe(value);
  expect(validBirthDate(value)).toBe(true);
});
it.each(['29 Feb 2001', '31 April 2000', 'February 30, 1990', '12 Mars 1990', '1900-02-29', '1990-13-01'])('rejects impossible or unsupported date %s', value => {
  expect(validBirthDate(value)).toBe(false);
});

import { describe, expect, it } from 'vitest';
import { expiryDatePattern, validExpiryDate } from './documentExpiry';

describe('document expiry values', () => {
  it.each([
    '28/02/2029', '02/28/2029', '2029-02-28', '2029.02.28', '2028/02/29',
    '2029年2月28日', '08/29', '8 / 2029', '2029/08', '2029-8',
    '2024-01-01 to 2029-12-31', '2024年1月1日至2029年12月31日',
    '01/24–08/29', '2024/01 — 2029/08', '2024-01-01 - 2029-12-31',
    '08/29-09/30',
  ])('preserves and validates the complete value %s', value => {
    expect(expiryDatePattern.exec(value)?.[0]).toBe(value);
    expect(validExpiryDate(value)).toBe(true);
  });

  it.each([
    '2029-02-29', '31/04/2029', '2029/00/12', '2029/12/00', '13/29',
    '00/29', '28/02', '2029/13', '08/202', '08/2200', '1899-12-31',
    '2029-12-31 to 2024-01-01', '2024-01-01 to 2029-02-30',
    'invalid 08/29', '08/29 trailing text', '08 29', '08/29 to invalid',
    '2029年02/28', '',
  ])('rejects invalid or incomplete values %s', value => {
    expect(validExpiryDate(value)).toBe(false);
  });

  it.each(['28/02/2029', '2029-02-28', '28/02/20299', '08/20299', '08/29 to invalid'])
    ('does not fall back to a truncated month/year in %s', value => {
      const match = expiryDatePattern.exec(value)?.[0];
      expect(match === undefined || match === value).toBe(true);
    });

  it('allows surrounding field text without including it in the date', () => {
    expect(expiryDatePattern.exec('28/02/2029 Issued by example university')?.[0]).toBe('28/02/2029');
    expect(expiryDatePattern.exec('08/29, example note')?.[0]).toBe('08/29');
    expect(expiryDatePattern.exec('08/29ABC')).toBeNull();
  });
});

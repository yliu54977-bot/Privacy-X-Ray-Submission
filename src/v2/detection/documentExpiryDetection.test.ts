import { describe, expect, it } from 'vitest';
import type { DetectionInput } from '../contracts';
import { documentPatternDetector } from './documentPatterns';

function input(lines: string[]): DetectionInput {
  return { imageId: 'fictional-expiry', imageWidth: 1800, imageHeight: 1200,
    ocr: { imageId: 'fictional-expiry', width: 1800, height: 1200, language: 'eng+chi_sim', text: lines.join('\n'),
      words: lines.flatMap((line, row) => {
        let x = 40;
        return line.split(' ').map((text, index) => {
          const box = { x, y: 40 + row * 40, width: text.length * 12, height: 26 };
          x += box.width + 10;
          return { id: `w${row}-${index}`, lineId: `l${row}`, text, confidence: 0.94, box };
        });
      }) } };
}

describe('expiry detection across document contexts', () => {
  it.each([
    ['Expiry Date: 28/02/2029', '28/02/2029'],
    ['Expiry Date28/02/2029', '28/02/2029'],
    ['Expiration: 2029-02-28', '2029-02-28'],
    ['Valid until: 2029/08', '2029/08'],
    ['有效期限：2024年1月1日至2029年12月31日', '2024年1月1日至2029年12月31日'],
  ])('keeps the full generic document expiry in %s', async (line, value) => {
    const findings = await documentPatternDetector.detect(input(['EXAMPLE UNIVERSITY', line]));
    const expiry = findings.filter(finding => /expiry date/i.test(finding.label));
    expect(expiry).toHaveLength(1);
    expect(expiry[0]).toMatchObject({ label: 'Possible expiry date', value, categoryIds: ['personal_identity'] });
    expect(expiry[0]!.boxes).toHaveLength(1);
  });

  it.each(['Valid thru: 08/29', 'Credit card expiry: 08/29', 'Debit card expiration date: 2029/08'])
    ('uses financial context only when the label supports it: %s', async line => {
      const findings = await documentPatternDetector.detect(input([line]));
      const expiry = findings.filter(finding => /expiry date/i.test(finding.label));
      expect(expiry).toHaveLength(1);
      expect(expiry[0]).toMatchObject({ label: 'Possible card expiry date', categoryIds: ['financial_information'] });
    });

  it('covers every date word and both endpoints when OCR splits a date range', async () => {
    const source = input(['Expiry Date: 01 / 01 / 2024 to 28 / 02 / 2029']);
    const findings = await documentPatternDetector.detect(source);
    const expiry = findings.find(finding => finding.label === 'Possible expiry date');
    expect(expiry?.value).toBe('01 / 01 / 2024 to 28 / 02 / 2029');
    expect(expiry?.boxes).toHaveLength(11);
    expect(expiry?.evidence[0]?.wordIds).toEqual(source.ocr!.words.slice(2).map(word => word.id));
  });

  it.each(['Expiry Date: 2029-02-29', 'Expiry Date: 28/02', 'Expiry Date: 2029-02-30',
    'Expiry Date: 13/29', 'Expiry Date: 08/29 to invalid'])
    ('does not turn an invalid date into a partial expiry candidate: %s', async line => {
      const findings = await documentPatternDetector.detect(input([line]));
      expect(findings.filter(finding => /expiry date/i.test(finding.label))).toEqual([]);
    });

  it('does not infer expiry from an unlabeled document date', async () => {
    const findings = await documentPatternDetector.detect(input(['EXAMPLE UNIVERSITY', '28/02/2029']));
    expect(findings.filter(finding => /expiry date/i.test(finding.label))).toEqual([]);
  });

  it.each(['28 / 02 / 2029', '2029 / 02 / 28', '02 / 28 / 2029'])(
    'never adds a partial contextual month/year inside the full date %s', async value => {
      const findings = await documentPatternDetector.detect(input([
        'Payment card number: 4111 1111 1111 1111', `Expiry Date: ${value}`,
      ]));
      const expiry = findings.filter(finding => /expiry date/i.test(finding.label));
      expect(expiry).toHaveLength(1);
      expect(expiry[0]?.value).toBe(value);
      expect(expiry[0]?.boxes).toHaveLength(5);
    });

  it('retains a standalone contextual card month/year', async () => {
    const findings = await documentPatternDetector.detect(input([
      'Payment card number: 4111 1111 1111 1111', '08 / 29',
    ]));
    expect(findings.filter(finding => /expiry date/i.test(finding.label)))
      .toEqual([expect.objectContaining({ label: 'Possible card expiry date', value: '08 / 29' })]);
  });
});

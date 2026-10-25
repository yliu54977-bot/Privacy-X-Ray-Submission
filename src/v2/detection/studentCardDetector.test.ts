import { describe, expect, it } from 'vitest';
import type { DetectionInput } from '../contracts';
import { studentCardDetector } from './studentCardDetector';
import { detectUniversalPrivacy } from './detectUniversalPrivacy';
import { universalPolicyRecommendations } from '../integration/policyAdapter';
import { initialSharingContext } from '../integration/temporaryPolicy';

function card(lines = ['EASTVALE UNIVERSITY', 'MORGAN', 'ALEX', '7654321', 'UNDERGRADUATE']): DetectionInput {
  return { imageId: 'fictional-card', imageWidth: 1000, imageHeight: 650,
    ocr: { imageId: 'fictional-card', width: 1000, height: 650, language: 'eng', text: lines.join('\n'),
      words: lines.flatMap((line, i) => line.split(' ').map((text, j) => ({
        id: `word-${i}-${j}`, lineId: `line-${i}`, text, confidence: 0.91,
        box: { x: (i === 0 ? 30 : 400) + j * 180, y: i * 40 + 20, width: text.length * 12, height: 25 },
      }))) } };
}

describe('unlabeled student-card document candidates', () => {
  it('locates a card number and aligned name without inventing labels, confidence or face geometry', async () => {
    const input = card();
    const result = await studentCardDetector.detect(input);
    expect(result.map(f => f.label)).toEqual(['Possible student card number', 'Possible cardholder name']);
    expect(result[0]?.value).toBe('7654321');
    expect(result[1]?.value).toBe('MORGAN ALEX');
    expect(result[1]?.boxes).toEqual([input.ocr!.words[2]!.box, input.ocr!.words[3]!.box]);
    expect(result.every(f => f.typeId === undefined && f.status === 'UNKNOWN_POTENTIALLY_SENSITIVE')).toBe(true);
    expect(result.every(f => f.entityClassificationConfidence === undefined)).toBe(true);
  });
  it.each([
    ['INVOICE', 'MORGAN', 'ALEX', '7654321', 'TOTAL'],
    ['UNIVERSITY', 'MORGAN', 'ALEX', '7654321', 'PAYMENT'],
    ['STUDENT', 'MORGAN', 'ALEX', '7654321'],
    ['UNIVERSITY', 'MORGAN', 'ALEX', '0000000', 'UNDERGRADUATE'],
    ['UNIVERSITY', 'MORGAN', 'ALEX', '7654', 'UNDERGRADUATE'],
  ])('does not classify bare numbers or weak document context', async (...lines) => {
    expect(await studentCardDetector.detect(card(lines))).toEqual([]);
  });
  it('does not treat institution names or unaligned / distant text as cardholder names', async () => {
    const input = card(['EASTVALE UNIVERSITY', 'SCHOOL SERVICES', 'STUDENT CARD', '7654321', 'UNDERGRADUATE']);
    expect((await studentCardDetector.detect(input)).map(f => f.label)).toEqual(['Possible student card number']);
    const offset = { ...card(), ocr: { ...card().ocr!, words: card().ocr!.words.map(word =>
      word.lineId === 'line-2' ? { ...word, box: { ...word.box, x: 50 } } : word) } };
    expect((await studentCardDetector.detect(offset)).map(f => f.label)).toEqual(['Possible student card number']);
  });
  it('finds title-case names and numeric tokens despite merged OCR line IDs or extra text', async () => {
    const input = card(['EASTVALE UNIVERSITY', 'Morgan', 'Alex', '7654321 ACTIVE', 'UNDERGRADUATE']);
    const fragmented = { ...input, ocr: { ...input.ocr!, words: input.ocr!.words.map(word => ({
      ...word, lineId: 'one-incorrect-merged-line',
    })) } };
    const result = await studentCardDetector.detect(fragmented);
    expect(result.map(f => f.value)).toEqual(['7654321', 'Morgan Alex']);
    expect(result[0]?.boxes).toHaveLength(1);
    expect(result[1]?.boxes).toHaveLength(2);
  });
  it('is registered and routes uncertain document findings to C policy review', async () => {
    const result = await detectUniversalPrivacy(card());
    expect(result.findings.filter(f => f.id.startsWith('student-card:'))).toHaveLength(2);
    expect(universalPolicyRecommendations(result, initialSharingContext).every(r => r.action === 'REVIEW')).toBe(true);
    expect(result.coverage.areas.find(a => a.family === 'document_structure')?.status).toBe('partial');
  });
});

it('isolates the name column from distant watermark text on the same OCR rows', async () => {
  const source = card();
  const input = { ...source, ocr: { ...source.ocr!, words: [...source.ocr!.words,
    { id: 'watermark-a', lineId: 'unreliable', text: 'GOLD', confidence: 0.9, box: { x: 560, y: 60, width: 50, height: 25 } },
    { id: 'watermark-b', lineId: 'unreliable', text: 'BADGE', confidence: 0.9, box: { x: 560, y: 100, width: 50, height: 25 } },
  ] } };
  expect((await studentCardDetector.detect(input)).find(f => f.label === 'Possible cardholder name')?.value).toBe('MORGAN ALEX');
});

function institutionCard(): DetectionInput {
  const lines = [
    { text: 'EASTVALE UNIVERSITY', x: 250, y: 40 },
    { text: 'Alex', x: 250, y: 170 },
    { text: 'MORGAN', x: 250, y: 210 },
    { text: '7654321', x: 250, y: 250 },
    { text: 'Expiry Date: 28/02/2030', x: 250, y: 290 },
    { text: '21259765432112', x: 250, y: 390 },
  ];
  const input = card();
  return { ...input, ocr: { ...input.ocr!, text: lines.map(line => line.text).join('\n'),
    words: lines.flatMap((line, i) => {
      let x = line.x;
      return line.text.split(' ').map((text, j) => {
        const word = { id: `fixture-${i}-${j}`, lineId: `row-${i}`, text, confidence: 0.93,
          box: { x, y: line.y, width: text.length * 12, height: 25 } };
        x += word.box.width + 12;
        return word;
      });
    }),
  } };
}

describe('institution cards without explicit student wording', () => {
  it.each(['Alex MORGAN', "Anne-Marie O'Connor", 'Alex McDonald'])(
    'preserves mixed case and punctuation in a compact single-row name: %s', async value => {
      const input = institutionCard();
      let x = 250;
      const nameWords = value.split(' ').map((text, index) => {
        const word = { id: `name-${index}`, lineId: 'name', text, confidence: 0.93,
          box: { x, y: 210, width: text.length * 12, height: 25 } };
        x += word.box.width + 12;
        return word;
      });
      const words = [...input.ocr!.words.filter(word => !['row-1', 'row-2'].includes(word.lineId!)), ...nameWords];
      const result = await studentCardDetector.detect({ ...input, ocr: { ...input.ocr!, words } });
      const name = result.find(finding => finding.label === 'Possible cardholder name');
      expect(name?.value).toBe(value);
      expect(name?.boxes).toEqual(nameWords.map(word => word.box));
    },
  );

  it('finds a split name and nearby identifier without assuming a student role or reading a barcode as the ID', async () => {
    const input = institutionCard();
    const result = await studentCardDetector.detect(input);
    expect(result.map(f => [f.label, f.value])).toEqual([
      ['Possible institution card number', '7654321'],
      ['Possible cardholder name', 'Alex MORGAN'],
    ]);
    expect(result[1]?.boxes).toEqual(input.ocr!.words.filter(word => ['row-1', 'row-2'].includes(word.lineId!)).map(word => word.box));
    expect(result.every(f => f.status === 'UNKNOWN_POTENTIALLY_SENSITIVE' && f.typeId === undefined)).toBe(true);
    expect(result.every(f => !f.label.toLowerCase().includes('student'))).toBe(true);
    expect(result[0]?.evidence[0]?.explanation).toContain('cardholder role is unknown');
  });

  it.each(['missing', 'distant', 'other-column'])('requires expiry evidence close to the name and ID: %s', async variant => {
    const source = institutionCard();
    const words = source.ocr!.words.flatMap(word => {
      if (word.lineId !== 'row-4') return [word];
      if (variant === 'missing') return [];
      return [{ ...word, box: { ...word.box, ...(variant === 'distant' ? { y: 620 } : { x: word.box.x + 600 }) } }];
    });
    expect(await studentCardDetector.detect({ ...source, ocr: { ...source.ocr!, words } })).toEqual([]);
  });

  it.each(['missing', 'distant', 'unaligned'])('requires a compact aligned name, not a distant page title: %s', async variant => {
    const source = institutionCard();
    const words = source.ocr!.words.flatMap(word => {
      if (!['row-1', 'row-2'].includes(word.lineId!)) return [word];
      if (variant === 'missing') return [];
      return [{ ...word, box: { ...word.box, ...(variant === 'distant' ? { y: word.box.y - 160 } : { x: 30 }) } }];
    });
    expect(await studentCardDetector.detect({ ...source, ocr: { ...source.ocr!, words } })).toEqual([]);
  });

  it.each([
    ['EASTVALE UNIVERSITY', 'Annual Report', '7654321', 'Expiry Date: 28/02/2030'],
    ['EASTVALE UNIVERSITY', 'Page Summary', '7654321', 'Expiry Date: 28/02/2030'],
    ['EASTVALE UNIVERSITY', 'TOTAL ENROLMENT', '7654321', 'For more details visit our office'],
  ])('does not treat university prose or reporting headings as a cardholder', async (...lines) => {
    expect(await studentCardDetector.detect(card(lines))).toEqual([]);
  });
});

describe('card number false-positive safeguards', () => {
  it.each(['20300228', '28022030', '02282030', 'Expiry Date: 12345678', 'Birth Date 20001010', '21259765432112'])(
    'does not treat complete dates, date-labeled values or long barcode digits as card identifiers: %s', async value => {
      const input = card(['STUDENT CARD', 'MORGAN', 'ALEX', value]);
      expect(await studentCardDetector.detect(input)).toEqual([]);
    },
  );

  it('does not join OCR date components into a card identifier', async () => {
    const input = institutionCard();
    const words = [...input.ocr!.words.filter(word => word.lineId !== 'row-3'),
      ...['2030', '02', '28'].map((text, i) => ({ id: `date-${i}`, lineId: 'date', text, confidence: 0.94,
        box: { x: [250, 308, 342][i]!, y: 250, width: text.length * 12, height: 25 } }))];
    expect(await studentCardDetector.detect({ ...input, ocr: { ...input.ocr!, words } })).toEqual([]);
  });

  it('preserves non-date eight-digit IDs and contiguous numeric OCR tokens', async () => {
    const input = institutionCard();
    const words = [...input.ocr!.words.filter(word => word.lineId !== 'row-3'),
      ...['8765', '4321'].map((text, i) => ({ id: `id-${i}`, lineId: 'id', text, confidence: 0.94,
        box: { x: 250 + i * 60, y: 250, width: text.length * 12, height: 25 } }))];
    expect((await studentCardDetector.detect({ ...input, ocr: { ...input.ocr!, words } })).map(f => f.value)).toEqual(['87654321', 'Alex MORGAN']);
  });
});

describe('explicit non-student card contexts', () => {
  it.each([
    ['EMPLOYEE CARD', 'Possible employee card number', ['personal_identity', 'employment_information']],
    ['STAFF ID CARD', 'Possible employee card number', ['personal_identity', 'employment_information']],
    ['LIBRARY CARD', 'Possible library card number', ['personal_identity']],
    ['MEMBERSHIP CARD', 'Possible membership card number', ['personal_identity']],
  ])('uses the stated card role and appropriate categories: %s', async (heading, label, categories) => {
    const result = await studentCardDetector.detect(card([heading, 'Morgan', 'Alex', '7654321']));
    expect(result.map(f => f.label)).toEqual([label, 'Possible cardholder name']);
    expect(result.every(f => f.categoryIds.join(',') === categories.join(','))).toBe(true);
    expect(result.every(f => !f.uncertaintyReason?.includes('student'))).toBe(true);
  });
});

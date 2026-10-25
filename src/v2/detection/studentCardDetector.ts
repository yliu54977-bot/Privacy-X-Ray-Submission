import type { OcrWord } from '../../types';
import type { PrivacyDetector, UniversalFinding } from '../contracts';

const institution = /\b(?:university|college|polytechnic)\b|大\s*学|学\s*院/i;
const studentContext = /\b(?:undergraduate|postgraduate|student|campus|graduate)\b|学\s*生|校\s*园/i;
const nonName = /\b(?:university|college|student|campus|card|undergraduate|postgraduate|graduate|valid|expires|expiry|expiration|date|number|department|faculty|library|services|school|polytechnic|of|employee|staff|member|membership|report|statement|record|records|page|chapter|total|annual|enrollment|enrolment|summary)\b/i;
const expiryWording = /\b(?:expiry|expires|expiration|valid\s*(?:until|thru|through|to))\b|有\s*效\s*期/i;
const dateWording = /\b(?:date|expiry|expires|expiration|birth|dob|issued|valid)\b|日\s*期|出\s*生|有\s*效/i;

interface CardContext {
  numberLabel: string;
  description: string;
  categoryIds: string[];
  needsLayoutConfirmation: boolean;
}

function cardContext(text: string): CardContext | undefined {
  const common = { needsLayoutConfirmation: false, categoryIds: ['personal_identity'] };
  if (/\b(?:employee|staff)\s*(?:id(?:entification)?\s*)?card\b|员\s*工\s*卡|工\s*作\s*证/i.test(text)) {
    return { ...common, numberLabel: 'Possible employee card number', description: 'an employee card', categoryIds: ['personal_identity', 'employment_information'] };
  }
  if (/\blibrary\s*card\b|借\s*书\s*证|图\s*书\s*卡/i.test(text)) {
    return { ...common, numberLabel: 'Possible library card number', description: 'a library card' };
  }
  if (/\b(?:member|membership|loyalty)\s*card\b|会\s*员\s*卡/i.test(text)) {
    return { ...common, numberLabel: 'Possible membership card number', description: 'a membership card' };
  }
  if (/\bstudent\s*(?:id(?:entification)?\s*)?card\b|学\s*生\s*证/i.test(text) || (institution.test(text) && studentContext.test(text))) {
    return { ...common, numberLabel: 'Possible student card number', description: 'a student card', categoryIds: ['personal_identity', 'education_records'] };
  }
  if (institution.test(text)) {
    // Some university cards only print the institution, a name, an ID and an
    // expiry. Do not assume student status: require that compact layout below.
    return { ...common, numberLabel: 'Possible institution card number', description: 'an institution card', categoryIds: ['personal_identity', 'education_records'], needsLayoutConfirmation: true };
  }
  return undefined;
}

function resemblesDate(words: readonly OcrWord[], printedRow: readonly OcrWord[]): boolean {
  if (dateWording.test(printedRow.map(word => word.text).join(' '))) return true;
  const digits = words.map(word => word.text).join('');
  if (digits.length !== 8) return false;
  const valid = (year: number, month: number, day: number) => year >= 1900 && year <= 2199 &&
    month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  // OCR may drop all date separators. Avoid presenting a plausible complete
  // calendar date as an unlabeled numeric identifier.
  return valid(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6))) ||
    valid(Number(digits.slice(4)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2))) ||
    valid(Number(digits.slice(4)), Number(digits.slice(0, 2)), Number(digits.slice(2, 4)));
}

/** Document-context candidates: no asserted identity, fabricated type or portrait box. */
export const studentCardDetector: PrivacyDetector = {
  capability: { id: 'student_card_layout', family: 'document_structure',
    name: 'Institution and membership card layout candidates', status: 'implemented', verified: true,
    supportedTypeIds: [],
    limitation: 'Uses explicit card wording, or institution text with a nearby name, identifier and expiry. Names and numbers remain unconfirmed; portraits and faces are not inspected.' },
  async detect(input) {
    if (!input.ocr) return [];
    const text = input.ocr.words.map(word => word.text).join(' ');
    const context = cardContext(text);
    if (!context) return [];
    // OCR line IDs can merge columns or fragment a single printed row. Reconstruct
    // rows from actual word positions instead of trusting segmentation IDs.
    const rows: OcrWord[][] = [];
    for (const word of [...input.ocr.words].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
      const center = word.box.y + word.box.height / 2;
      const row = rows.find(row => Math.abs(center - (row[0]!.box.y + row[0]!.box.height / 2))
        <= Math.min(word.box.height, row[0]!.box.height) * 0.55);
      if (row) row.push(word); else rows.push([word]);
    }
    for (const row of rows) row.sort((a, b) => a.box.x - b.box.x);
    const findings: UniversalFinding[] = [];
    function candidate(label: string, words: readonly OcrWord[], value: string) {
      const id = `student-card:${input.imageId}:${label}:${words.map(word => word.id).join(',')}`;
      findings.push({ id, label, value, source: { kind: 'image', id: input.imageId },
        status: 'UNKNOWN_POTENTIALLY_SENSITIVE', categoryIds: context!.categoryIds,
        ocrRecognitionConfidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length,
        uncertaintyReason: `The document resembles ${context!.description}, but this unlabeled information is not confirmed. Check the original and decide whether to mask it. Inspect any portrait manually.`,
        boxes: words.map(word => word.box),
        evidence: [{ id: `${id}:layout`, detectorId: 'student_card_layout', method: 'document_structure',
          source: 'ocr', explanation: context!.needsLayoutConfirmation
            ? 'Institution wording occurs with a compact, aligned name and numeric identifier beside expiry wording. The cardholder role is unknown.'
            : `Card context suggests ${context!.description}; the numeric text and any adjacent name remain unconfirmed.`,
          wordIds: words.map(word => word.id), boxes: words.map(word => word.box) }] });
    }
    for (let i = 0; i < rows.length; i++) {
      const printedRow = rows[i]!;
      const row = printedRow.filter(word => /^\d+$/.test(word.text));
      const digits = row.map(word => word.text).join('');
      if (!row.length || !/^\d{7,12}$/.test(digits) || /^0+$/.test(digits)) continue;
      if (resemblesDate(row, printedRow)) continue;
      // Join only contiguous digit tokens, never distant numbers in another column.
      if (row.some((word, j) => j > 0 && word.box.x -
        (row[j - 1]!.box.x + row[j - 1]!.box.width) > Math.max(24, word.box.height))) continue;
      const names: OcrWord[][] = [];
      let following = row;
      for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
        // Only the nearby name column: distant logos/other columns on the same
        // OCR row must not be joined into the cardholder's name.
        const nearby = rows[j]!.filter(word => Math.abs(word.box.x - row[0]!.box.x) <=
          Math.max(120, input.imageWidth * 0.18));
        const clusters: OcrWord[][] = [];
        for (const word of nearby) {
          const last = clusters[clusters.length - 1];
          const previous = last?.[last.length - 1];
          if (last && previous && word.box.x - previous.box.x - previous.box.width <= Math.max(28, word.box.height * 1.6)) last.push(word);
          else clusters.push([word]);
        }
        const previous = clusters.sort((a,b) => Math.abs(a[0]!.box.x-row[0]!.box.x) - Math.abs(b[0]!.box.x-row[0]!.box.x))[0] ?? [];
        if (!previous.length) break;
        const value = previous.map(word => word.text).join(' ');
        const first = previous[0]!, next = following[0]!;
        const gap = next.box.y - first.box.y;
        const aligned = Math.abs(first.box.x - row[0]!.box.x) <= Math.max(35, input.imageWidth * 0.05);
        // Cards commonly mix a title-case given name and an uppercase surname
        // on one line. Check each word independently, preserving apostrophes,
        // hyphens and internal capitals in names such as O'Connor or McDonald.
        const nameLike = /^[\p{L}][\p{L}'’\-]*(?:\s+[\p{L}][\p{L}'’\-]*){0,3}$/u.test(value) &&
          value.length >= 2 && value.length <= 60 && value.split(' ').every(part =>
            part === part.toUpperCase() || /^\p{Lu}[\p{L}'’\-]*$/u.test(part)) && !nonName.test(value);
        if (!aligned || gap <= 0 || gap > Math.max(first.box.height, next.box.height) * 2.6 || !nameLike) break;
        names.unshift(previous);
        following = previous;
      }
      if (context.needsLayoutConfirmation) {
        const idBox = row[0]!.box;
        const nearbyExpiry = rows.some(expiryRow => expiryWording.test(expiryRow.map(word => word.text).join(' ')) &&
          expiryRow.some(word => Math.abs(word.box.x - idBox.x) <= Math.max(100, input.imageWidth * 0.18) &&
            Math.abs(word.box.y - idBox.y) <= Math.max(idBox.height * 9, input.imageHeight * 0.2)));
        if (!names.length || !nearbyExpiry) continue;
      }
      candidate(context.numberLabel, row, digits);
      if (names.length) candidate('Possible cardholder name', names.flat(), names.flat().map(word => word.text).join(' '));
    }
    return findings;
  },
};

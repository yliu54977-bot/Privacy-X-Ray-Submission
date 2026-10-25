import { birthDatePattern, validBirthDate } from './documentDates';
export { validBirthDate } from './documentDates';
import { addressContinuation, isAddressContinuation, locatedLine, type LocatedLine } from './addressLayout';
import { extendedMaterialRules } from './extendedMaterialRules';
import type { OcrWord } from '../../types';
import type { DetectionInput, PrivacyDetector, UniversalFinding } from '../contracts';

export function luhn(value: string): boolean {
  const digits = value.replace(/[ -]/g, '');
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let n = Number(digits[i]); if (double) { n *= 2; if (n > 9) n -= 9; } sum += n;
  }
  return sum % 10 === 0;
}
const ibanLengths: Record<string, number> = { GB: 22, DE: 22, FR: 27, ES: 24, IT: 27,
  NL: 18, BE: 16, CH: 21, AT: 20, IE: 22, PL: 28, PT: 25, SA: 24, AE: 23 };
export function validIban(value: string): boolean {
  const normalized = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized) || ibanLengths[normalized.slice(0, 2)] !== normalized.length) return false;
  const moved = normalized.slice(4) + normalized.slice(0, 4);
  let remainder = 0;
  for (const char of moved) for (const digit of /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char)
    remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
export function validChineseId(value: string): boolean {
  if (!/^[1-9]\d{16}[\dX]$/i.test(value)) return false;
  const year = Number(value.slice(6, 10)), month = Number(value.slice(10, 12)), day = Number(value.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > new Date().getUTCFullYear() || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const sum = weights.reduce((total, weight, i) => total + Number(value[i]) * weight, 0);
  return '10X98765432'[sum % 11] === value[17]!.toUpperCase();
}

export type DocumentRule = { id: string; label: string; categories: string[]; labelPattern: RegExp;
  valuePattern: RegExp; accept?: (value: string) => boolean };
const identifier = /^[A-Z0-9][A-Z0-9 /_-]{3,39}/i;
const content = /^[^:：\n]{2,100}/u;
const person = /^(?:[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,4})/u;
const amount = /^(?:[A-Z]{3}\s*)?[$£€¥￥]?\s*\d[\d,]*(?:\.\d{1,2})?/;
export const documentLabelRules: readonly DocumentRule[] = [
  ...extendedMaterialRules,
  { id: 'name', label: 'Person name', categories: ['personal_identity'], labelPattern: /\b(?:full|legal|first|last|given|family|patient|employee|cardholder|beneficiary|recipient|applicant)\s*name\b|\bname(?=\s*[:：])|姓\s*名|收\s*件\s*人|持\s*卡\s*人|联\s*系\s*人/gi, valuePattern: person },
  { id: 'passport', label: 'Passport number', categories: ['government_identification','movement_travel'], labelPattern: /\bpassport\s*(?:number|no\.?|id|#)?\b|护\s*照\s*号(?:\s*码)?/gi, valuePattern: identifier },
  { id: 'government-id', label: 'Government identifier', categories: ['government_identification'], labelPattern: /\b(?:national|government|identity|citizen)\s*(?:id|number|no\.?)\b|身\s*份\s*证\s*号(?:\s*码)?|公\s*民\s*身\s*份\s*号\s*码/gi, valuePattern: identifier },
  { id: 'driver', label: 'Driving licence number', categories: ['government_identification'], labelPattern: /\b(?:driver'?s?|driving)\s*licen[cs]e\s*(?:number|no\.?|id|#)?\b|驾\s*驶\s*证\s*号/gi, valuePattern: identifier },
  { id: 'tax', label: 'Tax or social insurance identifier', categories: ['government_identification','financial_information'], labelPattern: /\b(?:ssn|sin|tax\s*(?:id|number)|social\s*(?:security|insurance)\s*(?:number|no\.?)?)\b|纳\s*税\s*人\s*识\s*别\s*号|社\s*保\s*号/gi, valuePattern: identifier, accept: v => /\d/.test(v) },
  { id: 'card', label: 'Payment card number', categories: ['financial_information'], labelPattern: /\b(?:credit|debit|payment)\s*card\s*(?:number|no\.?)?\b|银\s*行\s*卡\s*号|信\s*用\s*卡\s*号/gi, valuePattern: /^[\d*Xx•][\d *Xx•-]{7,30}/ },
  { id: 'security-code', label: 'Card security code', categories: ['authentication_credentials','financial_information'], labelPattern: /\b(?:cvv2?|cvc2?|card\s*security\s*code)\b/gi, valuePattern: /^\d{3,4}\b/ },
  { id: 'account', label: 'Financial account identifier', categories: ['financial_information'], labelPattern: /\b(?:iban|routing\s*(?:number|no\.?)|sort\s*code|swift|bic)\b|银\s*行\s*账\s*号|收\s*款\s*账\s*户/gi, valuePattern: identifier },
  { id: 'balance', label: 'Balance or salary', categories: ['financial_information','employment_information'], labelPattern: /\b(?:(?:(?:account|available|closing)\s*)?balance|salary|net\s*pay|gross\s*pay|annual\s*income)\b|账\s*户\s*余\s*额|工\s*资|薪\s*资|年\s*收\s*入/gi, valuePattern: amount },
  { id: 'address', label: 'Postal address', categories: ['contact_information','geographic_locations'], labelPattern: /\bdeliver\s*to(?=\s*[:：]|\s*$)|\b(?:(?:home|residential|mailing|postal|shipping|billing|delivery|recipient)\s*)?address\b|地\s*址|住\s*址|通\s*讯\s*地\s*址/gi, valuePattern: content },
  { id: 'birth', label: 'Birth date', categories: ['personal_identity'], labelPattern: /\b(?:dob|date\s*of\s*birth|birth\s*date)\b|出\s*生(?:\s*日\s*期)?/gi, valuePattern: birthDatePattern, accept: validBirthDate },
  { id: 'student', label: 'Academic identifier', categories: ['education_records','personal_identity'], labelPattern: /\b(?:student|candidate|enrollment|registration)\s*(?:id|number|no\.?)\b|学\s*号|考\s*生\s*号|准\s*考\s*证\s*号/gi, valuePattern: identifier },
  { id: 'grade', label: 'Academic result', categories: ['education_records'], labelPattern: /\b(?:gpa|grade|exam\s*score|student\s*result)\b|成\s*绩|绩\s*点/gi, valuePattern: content },
  { id: 'employee', label: 'Employee identifier', categories: ['employment_information','personal_identity'], labelPattern: /\b(?:employee|staff|payroll)\s*(?:id|number|no\.?)\b|工\s*号|员\s*工\s*编\s*号/gi, valuePattern: identifier },
  { id: 'medical-id', label: 'Patient or health identifier', categories: ['health_medical','personal_identity'], labelPattern: /\b(?:patient|medical\s*record|health\s*card|mrn|nhs)\s*(?:id|number|no\.?)?\b|病\s*历\s*号|就\s*诊\s*号|医\s*保\s*号/gi, valuePattern: identifier },
  { id: 'diagnosis', label: 'Health or treatment information', categories: ['health_medical'], labelPattern: /\b(?:diagnosis|medication|prescription|test\s*result|allergies|treatment)\b|诊\s*断|用\s*药|处\s*方|检\s*验\s*结\s*果|过\s*敏\s*史/gi, valuePattern: content },
  { id: 'policy', label: 'Insurance policy identifier', categories: ['insurance_benefits'], labelPattern: /\b(?:insurance\s*(?:policy|member)|policy|claim)\s*(?:id|number|no\.?)\b|保\s*单\s*号|理\s*赔\s*号/gi, valuePattern: identifier },
  { id: 'case', label: 'Legal case or contract identifier', categories: ['legal_information','contracts_records'], labelPattern: /\b(?:case|docket|contract|agreement)\s*(?:id|number|no\.?)\b|案\s*号|合\s*同\s*号/gi, valuePattern: identifier },
  { id: 'tracking', label: 'Tracking or shipping identifier', categories: ['transactions_purchases','movement_travel'], labelPattern: /\b(?:tracking|shipment|waybill|invoice|receipt)\s*(?:id|number|no\.?)\b|快\s*递\s*单\s*号|运\s*单\s*号|发\s*票\s*号/gi, valuePattern: identifier, accept: v => /\d/.test(v) },
  { id: 'travel', label: 'Travel booking or ticket identifier', categories: ['movement_travel'], labelPattern: /\b(?:pnr|booking\s*(?:reference|code|id)|ticket\s*(?:number|no\.?)|reservation\s*(?:code|id))\b|票\s*号|预\s*订\s*号/gi, valuePattern: identifier },
  { id: 'hotel', label: 'Travel location or schedule', categories: ['movement_travel','geographic_locations'], labelPattern: /\b(?:hotel|departure|arrival|destination|check[- ]?in|check[- ]?out)\s*(?:address|date|time)?\b|入\s*住\s*时\s*间|出\s*发\s*地|目\s*的\s*地/gi, valuePattern: content },
  { id: 'handle', label: 'Account or messaging handle', categories: ['internet_identities','communications'], labelPattern: /\b(?:username|user\s*id|account\s*handle|wechat\s*id|telegram\s*id|discord\s*id)\b|微\s*信\s*号|用\s*户\s*名|昵\s*称|账\s*号/gi, valuePattern: /^[\p{L}\p{N}@._-]{3,50}/u },
  { id: 'message', label: 'Correspondence information', categories: ['communications'], labelPattern: /\b(?:subject|sender|recipient|from|to)(?=\s*[:：])|邮\s*件\s*主\s*题|发\s*件\s*人|收\s*件\s*人/gi, valuePattern: content },
  { id: 'secret', label: 'Access secret', categories: ['authentication_credentials'], labelPattern: /\b(?:access\s*token|refresh\s*token|client\s*secret|secret\s*key|authorization|session\s*(?:id|token))\b|访\s*问\s*令\s*牌|密\s*钥/gi, valuePattern: /^(?:Bearer\s+)?[A-Za-z0-9_+/.=:-]{8,240}/ },
  { id: 'wifi', label: 'Wi-Fi access information', categories: ['authentication_credentials','device_network_identifiers'], labelPattern: /\b(?:wifi|wi-fi)\s*(?:password|key|ssid)\b/gi, valuePattern: content },
  { id: 'device', label: 'Device identifier', categories: ['device_network_identifiers'], labelPattern: /\b(?:imei|imsi|iccid|serial\s*(?:number|no\.?))\b|设\s*备\s*序\s*列\s*号/gi, valuePattern: identifier },
  { id: 'vehicle', label: 'Vehicle identifier', categories: ['personal_assets','movement_travel'], labelPattern: /\b(?:vin|licen[cs]e\s*plate|vehicle\s*(?:id|registration))\b|车\s*牌\s*号|车\s*架\s*号/gi, valuePattern: /^[\p{L}\p{N} -]{4,24}/u },
  { id: 'business', label: 'Confidential business information', categories: ['commercial_confidential','corporate_financial'], labelPattern: /\b(?:revenue|profit|budget|internal\s*project|confidential\s*client)\b|营\s*收|利\s*润|预\s*算|内\s*部\s*项\s*目/gi, valuePattern: content },
  { id: 'participant', label: 'Research participant identifier', categories: ['research_information','personal_identity'], labelPattern: /\b(?:participant|subject)\s*(?:id|number|no\.?)\b|受\s*试\s*者\s*编\s*号/gi, valuePattern: identifier },
];

export function documentLines(input: DetectionInput): LocatedLine[] {
  const rows: OcrWord[][] = [];
  for (const word of [...(input.ocr?.words ?? [])].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    const row = rows.find(row => row.some(neighbor => {
      const sameBaseline = Math.abs(neighbor.box.y + neighbor.box.height / 2 - word.box.y - word.box.height / 2);
      return sameBaseline <= Math.min(word.box.height, neighbor.box.height) * 0.5;
    }));
    if (row) row.push(word); else rows.push([word]);
  }
  // Assemble complete baselines before splitting columns: shorter glyphs can
  // arrive after their neighbors and must not split one identifier into fragments.
  return rows.flatMap(row => {
    const runs: OcrWord[][] = [];
    for (const word of row.sort((a,b) => a.box.x - b.box.x)) {
      const previous = runs.at(-1)?.at(-1);
      if (!previous || word.box.x - previous.box.x - previous.box.width > Math.max(word.box.height, previous.box.height) * 4) runs.push([]);
      runs.at(-1)!.push(word);
    }
    return runs.map(locatedLine);
  });
}

const patterns: { id: string; label: string; categories: string[]; regex: RegExp; accept?: (value: string) => boolean }[] = [
  { id: 'email', label: 'Email address', categories: ['contact_information','internet_identities'], regex: /(?<![\w.+-])[\w+-]+(?:\s*\.\s*[\w+-]+)*\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)+/gi },
  { id: 'phone', label: 'Phone number', categories: ['contact_information'], regex: /(?<!\d)(?:\+\d{1,3}[ .-]?(?:\(?\d{2,4}\)?[ .-]?){2,4}\d{2,4}|\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}|1[3-9]\d{9})(?!\d)/g,
    accept: v => { const n = v.replace(/\D/g, '').length; return n >= 10 && n <= 15; } },
  { id: 'card', label: 'Payment card number', categories: ['financial_information'], regex: /(?<!\d)(?<!\d[ -])\d(?:[ -]?\d){12,18}(?![ -]?\d)/g, accept: luhn },
  { id: 'iban', label: 'IBAN account identifier', categories: ['financial_information'], regex: new RegExp('\\b(?:' + Object.entries(ibanLengths).map(([country, length]) =>
    `${country}\\d{2}(?:[ ]?[A-Z0-9]){${length - 4}}`).join('|') + ')(?![A-Z0-9])', 'g'), accept: validIban },
  { id: 'china-id', label: 'Chinese identity number', categories: ['government_identification'], regex: /(?<!\d)[1-9]\d{16}[\dX](?![\dA-Z])/gi, accept: validChineseId },
  { id: 'mac', label: 'Network device address', categories: ['device_network_identifiers'], regex: /\b[\dA-F]{2}(?::[\dA-F]{2}){5}\b/gi },
  { id: 'ip', label: 'IP address', categories: ['device_network_identifiers','technical_infrastructure'], regex: /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g, accept: v => v.split('.').every(n => Number(n) <= 255) },
  { id: 'token', label: 'Service access token', categories: ['authentication_credentials'], regex: /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{30,255}|sk-(?:proj-)?[A-Za-z0-9_-]{20,240}|AKIA[A-Z0-9]{16})\b/g },
  { id: 'street', label: 'Street address', categories: ['contact_information','geographic_locations'], regex: /(?<!\d)\d{1,6}\s+(?:[\p{L}\d.'’–-]+\s+){0,5}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way)\b(?:\s+(?:Apt|Unit|Suite)\s+[A-Z0-9-]+)?/giu },
  { id: 'social-handle', label: 'Account handle', categories: ['internet_identities'], regex: /(?<![\w.+-])@[A-Z0-9_][A-Z0-9_.]{2,29}\b/gi },
  { id: 'postal', label: 'Canadian postal code', categories: ['geographic_locations'], regex: /(?<![A-Z0-9])[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ][ -]?\d[ABCEGHJ-NPRSTVWXYZ]\d(?![A-Z0-9])/gi },
  { id: 'wallet', label: 'Wallet-like address', categories: ['digital_assets','financial_information'], regex: /\b0x[A-F0-9]{40}\b/gi },
  { id: 'mrz', label: 'Passport machine-readable line', categories: ['government_identification','movement_travel'], regex: /\bP<[A-Z]{3}[A-Z<]{10,44}/g },
  { id: 'jwt', label: 'Encoded access token', categories: ['authentication_credentials'], regex: /\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{12,}\b/g },
  { id: 'ssn-format', label: 'Social security number format', categories: ['government_identification'], regex: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g, accept: v => !/^(?:000|666|9)/.test(v) && v.slice(4, 6) !== '00' && v.slice(7) !== '0000' },
  { id: 'mrz-details', label: 'Passport machine-readable personal data', categories: ['government_identification','movement_travel'], regex: /(?<![A-Z0-9<])[A-Z0-9<]{9}\d[A-Z]{3}\d{6}\d[MF<]\d{6}\d[A-Z0-9<]{14,16}(?![A-Z0-9<])/g },
  { id: 'credential-url', label: 'Credential-bearing connection URL', categories: ['authentication_credentials','technical_infrastructure'], regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?):\/\/[^:\s/]+:[^@\s/]+@[^\s]+/gi },
  { id: 'signed-url', label: 'Access-bearing URL', categories: ['authentication_credentials','internet_identities'], regex: /https?:\/\/[^\s]*[?&](?:access_token|token|signature|x-amz-signature|api_key|auth|secret)=[^\s&#]+[^\s]*/gi },
  { id: 'private-key', label: 'Private key material', categories: ['authentication_credentials','technical_infrastructure'], regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

/** Broad evidence-based candidates. Unverified types remain REVIEW, never a safety decision. */
export const documentPatternDetector: PrivacyDetector = {
  capability: { id: 'document_privacy_candidates', family: 'pattern', name: 'Multi-material privacy candidates',
    status: 'implemented', verified: true, supportedTypeIds: [],
    limitation: 'English/Chinese labels and selected validated formats; handwritten, arbitrary semantic and visual content may be missed.' },
  async detect(input) {
    if (!input.ocr) return [];
    const lines = documentLines(input);
    const findings: UniversalFinding[] = [];
    const seen = new Set<string>();
    function add(id: string, label: string, categories: string[], line: LocatedLine, start: number, end: number, explanation: string) {
      const selected = line.words.filter(item => item.start < end && item.end > start).map(item => item.word);
      if (!selected.length) return;
      const value = line.text.slice(start, end).trim();
      if (!value || /^(?:redacted|placeholder|unknown|n\/a|\*+|x+|•+)$/i.test(value)) return;
      const key = `${id}:${selected.map(word => word.id).join(',')}`;
      if (seen.has(key)) return; seen.add(key);
      const findingId = `document:${input.imageId}:${key}`;
      findings.push({ id: findingId, source: { kind: 'image', id: input.imageId },
        status: 'UNKNOWN_POTENTIALLY_SENSITIVE', categoryIds: categories, label: `Possible ${label.toLowerCase()}`, value,
        boxes: selected.map(word => word.box),
        ocrRecognitionConfidence: selected.reduce((sum, word) => sum + word.confidence, 0) / selected.length,
        uncertaintyReason: 'This is a format or label-backed candidate, not a verified identity or official sharing requirement. Confirm the text and choose what to mask.',
        evidence: [{ id: `${findingId}:e`, detectorId: 'document_privacy_candidates', method: 'pattern', source: 'ocr',
          explanation, wordIds: selected.map(word => word.id), boxes: selected.map(word => word.box) }] });
    }
    for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
      const line = lines[rowIndex]!;
      const labels = documentLabelRules.flatMap(rule => [...line.text.matchAll(rule.labelPattern)]
        .map(match => ({ rule, start: match.index, end: match.index + match[0].length })))
        .sort((a, b) => a.start - b.start || b.end - a.end)
        .filter((hit, i, all) => !all.slice(0, i).some(previous => previous.start <= hit.start && previous.end >= hit.end));
      for (let i = 0; i < labels.length; i++) {
        const hit = labels[i]!;
        let source = line, start = hit.end;
        let raw = line.text.slice(start, labels[i + 1]?.start ?? line.text.length);
        if (!raw.replace(/^[\s:：#=–—-]+/, '').trim()) {
          const labelWord = line.words.find(item => item.end > hit.start)?.word;
          const labelLast = line.words.filter(item => item.start < hit.end).at(-1)?.word;
          const candidates = labelWord && labelLast ? lines.filter(candidate => candidate !== line)
            .map(candidate => locatedLine(candidate.words.map(item => item.word)
              .filter(word => word.box.x >= labelWord.box.x - labelWord.box.height * 0.7)))
            .filter(candidate => candidate.words.length)
            .filter(candidate => {
              const first = candidate.words[0]!.word;
              const below = first.box.y >= labelWord.box.y + labelWord.box.height * 0.65 &&
                first.box.y - labelWord.box.y <= labelWord.box.height * 3 &&
                Math.abs(first.box.x - labelWord.box.x) <= Math.max(60, input.imageWidth * 0.06);
              const right = Math.abs(first.box.y + first.box.height / 2 - labelLast.box.y - labelLast.box.height / 2) <= Math.min(first.box.height, labelLast.box.height) * 0.5 &&
                first.box.x >= labelLast.box.x + labelLast.box.width &&
                first.box.x - labelLast.box.x - labelLast.box.width <= input.imageWidth * (hit.rule.id === 'balance' ? 0.65 : 0.25);
              return (below || right) && !documentLabelRules.some(rule => new RegExp(rule.labelPattern.source, 'i').test(candidate.text));
            }).sort((a,b) => a.words[0]!.word.box.y - b.words[0]!.word.box.y) : [];
          const next = candidates[0];
          if (next) { source = next; start = 0; raw = next.text; }
        }

        const noAbbreviation = /\bno$/i.test(line.text.slice(hit.start, hit.end));
        const prefix = (noAbbreviation ? /^[\s.:：#=–—-]+/ : /^[\s:：#=–—-]+/).exec(raw)?.[0].length ?? 0;
        // Generic labels require punctuation or an aligned value row.
        const joinedExpiry = /^(?:expiry-date|card-expiry)$/.test(hit.rule.id) && /^\d/.test(raw);
        if (source === line && prefix === 0 && !joinedExpiry && !/\p{Script=Han}/u.test(line.text.slice(hit.start, hit.end))) continue;
        const parsed = hit.rule.valuePattern.exec(raw.slice(prefix));
        if (parsed && (!hit.rule.accept || hit.rule.accept(parsed[0]))) {
          const from = start + prefix, to = from + parsed[0].trimEnd().length;
          if (hit.rule.id === 'address') {
            const selected = source.words.filter(item => item.start < to && item.end > from).map(item => item.word);
            const labelX = line.words.find(item => item.end > hit.start)?.word.box.x ?? selected[0]?.box.x ?? 0;
            const words = addressContinuation(lines, selected, lines.findIndex(row => row.words.some(item => item.word.id === selected[0]?.id)), labelX,
              value => documentLabelRules.some(rule => new RegExp(rule.labelPattern.source, 'i').test(value)));
            const block = locatedLine(words);
            add(hit.rule.id, hit.rule.label, hit.rule.categories, block, 0, block.text.length,
              'Explicit address label with adjacent aligned address lines. Check every line before sharing.');
          } else add(hit.rule.id, hit.rule.label, hit.rule.categories, source, from, to,
            `Explicit ${hit.rule.label.toLowerCase()} label with readable value text.`);
        }
      }
      for (const pattern of patterns) for (const match of line.text.matchAll(pattern.regex)) {
        if (pattern.accept && !pattern.accept(match[0])) continue;
        if (pattern.id === 'street') {
          const suffix = line.text.slice(match.index + match[0].length);
          const inlineContinuation = /^\s*,/.test(suffix) && isAddressContinuation(suffix.replace(/^\s*,\s*/, ''));
          const end = inlineContinuation ? line.text.length : match.index + match[0].length;
          const selected = line.words.filter(item => item.start < end && item.end > match.index).map(item => item.word);
          const words = addressContinuation(lines, selected, rowIndex, line.words[0]!.word.box.x,
            value => documentLabelRules.some(rule => new RegExp(rule.labelPattern.source, 'i').test(value)));
          if (inlineContinuation || words.length > selected.length) {
            const block = locatedLine(words);
            add('address', 'Postal address', pattern.categories, block, 0, block.text.length, 'Street address with adjacent aligned address lines; verify the entire block.');
            continue;
          }
        }
        add(pattern.id, pattern.label, pattern.categories, line, match.index, match.index + match[0].length,
          `Matched a supported ${pattern.label.toLowerCase()} format; check the source image.`);
      }
    }
    // Card layouts often print the holder and expiry without any nearby label.
    // Use a detected card number as context; never infer these from arbitrary documents.
    const cards=findings.filter(f=>f.label==='Possible payment card number'&&f.boxes?.length);
    if (cards.length) {
      for (const line of lines) {
        const left=Math.min(...line.words.map(w=>w.word.box.x)),right=Math.max(...line.words.map(w=>w.word.box.x+w.word.box.width));
        const top=Math.min(...line.words.map(w=>w.word.box.y)),bottom=Math.max(...line.words.map(w=>w.word.box.y+w.word.box.height));
        const nearby=cards.some(card=>{
          const boxes=card.boxes!,x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
          const width=Math.max(...boxes.map(b=>b.x+b.width))-x,height=Math.max(...boxes.map(b=>b.y+b.height))-y;
          const horizontal=Math.max(width*1.5,input.imageWidth*0.05),vertical=Math.max(height*15,input.imageHeight*0.08);
          return left<=x+width+horizontal&&right>=x-horizontal&&Math.max(0,y-bottom,top-y-height)<=vertical;
        });
        if(!nearby)continue;
        const expiry = /(?<![\d/])(?:0?[1-9]|1[0-2])\s*\/\s*(?:20)?\d{2}(?![\d/])/g;
        for (const match of line.text.matchAll(expiry)) {
          // OCR can insert spaces around separators. Do not offer a partial
          // month/year inside a full date as a second, incomplete mask.
          const before = line.text.slice(0, match.index);
          const after = line.text.slice(match.index + match[0].length);
          if (/\d\s*[/.-]\s*$/.test(before) || /^\s*[/.-]\s*\d/.test(after)) continue;
          add('card-context-expiry', 'Card expiry date', ['financial_information'], line,
            match.index, match.index + match[0].length, 'Month/year near a detected payment card; confirm this is its expiry date.');
        }
        if (/^(?:[A-Z][a-zA-Z'’-]+\s+){1,3}[A-Z][a-zA-Z'’-]+$/.test(line.text) &&
          !/\b(?:bank|visa|mastercard|credit|debit|american|express|valid|thru|through|platinum|gold|signature|card|rewards|payment|security|details|private|record|statement|confidential)\b/i.test(line.text))
          add('card-context-holder', 'Cardholder name', ['personal_identity'], line, 0, line.text.length,
            'Name-shaped line near a detected payment card; confirm it is a person rather than a brand.');
      }
    }
    // A private-key header is not enough: cover the complete readable key block.
    for (let i = 0; i < lines.length; i++) {
      if (!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(lines[i]!.text)) continue;
      let end = i;
      while (end + 1 < lines.length && end - i < 255 && !/-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(lines[end]!.text)) {
        const next = lines[end + 1]!.text;
        if (!/-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(next) && !/^[A-Za-z0-9+/=]{16,}$/.test(next.replace(/\s/g, ''))) break;
        end++;
      }
      const words = lines.slice(i, end + 1).flatMap(line => line.words.map(item => item.word));
      const index = findings.findIndex(item => item.label === 'Possible private key material' && item.evidence.some(e => e.wordIds?.includes(words[0]!.id)));
      if (index >= 0) {
        const finding = findings[index]!, boxes = words.map(word => word.box);
        findings[index] = { ...finding, value: 'Private key block', boxes,
          evidence: [{ ...finding.evidence[0]!, explanation: 'Readable private-key block, including its header and body. Confirm all lines are covered.', wordIds: words.map(word => word.id), boxes }] };
      }
      i = end;
    }
    return findings;
  },
};

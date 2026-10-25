import { describe, expect, it } from 'vitest';
import { documentPatternDetector, luhn, validIban, validChineseId, validBirthDate } from './documentPatterns';
import type { DetectionInput } from '../contracts';
import { detectUniversalPrivacy } from './detectUniversalPrivacy';
import { universalPolicyRecommendations } from '../integration/policyAdapter';
import { initialSharingContext } from '../integration/temporaryPolicy';

function input(lines: string[], column = 20): DetectionInput {
  return { imageId: 'fictional-materials', imageWidth: 2400, imageHeight: 2400,
    ocr: { imageId: 'fictional-materials', width: 2400, height: 2400, language: 'eng+chi_sim', text: lines.join('\n'),
      words: lines.flatMap((line, i) => {
        let x = column;
        return line.split(' ').map((text, j) => {
          const width = text.length * 9;
          const word = { id: `w-${i}-${j}`, lineId: `l-${i}`, text, confidence: 0.91,
            box: { x, y: 20 + i * 40, width, height: 24 } };
          x += width + 8; return word;
        });
      }) } };
}

const fields: [string, string][] = [
  ['Name: ALEX MORGAN','person name'], ['姓名：张三','person name'],
  ['Passport number: P8273649','passport number'], ['护照号码：E82736491','passport number'],
  ['National ID: 123456789','government identifier'], ['身份证号码：11010519491231002X','government identifier'],
  ["Driver license number: D-8273649",'driving licence number'], ['驾驶证号：D8273649','driving licence number'],
  ['SSN: 123-45-6789','tax or social insurance identifier'], ['Tax ID: TAX-8273649','tax or social insurance identifier'],
  ['Credit card number: 4111 1111 1111 1111','payment card number'], ['CVV: 731','card security code'],
  ['IBAN: DE89370400440532013000','financial account identifier'], ['Routing number: 123456789','financial account identifier'],
  ['Salary: $6500.00','balance or salary'], ['工资：6500','balance or salary'],
  ['Address: 81 Fictional Road','postal address'], ['地址：北京市测试路81号','postal address'],
  ['DOB: 1990-03-12','birth date'], ['出生日期：1990年03月12日','birth date'],
  ['Student ID: S8273649','academic identifier'], ['成绩：88','academic result'],
  ['Employee ID: EMP-8273','employee identifier'], ['Patient ID: MED-8273','patient or health identifier'],
  ['病历号：MED8273649','patient or health identifier'], ['Diagnosis: Fictional example condition','health or treatment information'],
  ['Medication: Fictional example medicine','health or treatment information'], ['检验结果：测试结果','health or treatment information'],
  ['Policy number: POL-8273649','insurance policy identifier'], ['保单号：POL8273649','insurance policy identifier'],
  ['Case number: CASE-8273649','legal case or contract identifier'], ['合同号：CNT8273649','legal case or contract identifier'],
  ['Tracking number: TRK-8273649','tracking or shipping identifier'], ['发票号：INV8273649','tracking or shipping identifier'],
  ['PNR: ABC731','travel booking or ticket identifier'], ['Ticket number: 1234567890123','travel booking or ticket identifier'],
  ['Destination: Fictional City','travel location or schedule'], ['Username: fictional_morgan','account or messaging handle'],
  ['微信号：fictional_morgan','account or messaging handle'], ['Subject: Fictional confidential message','correspondence information'],
  ['Access token: abcdef1234567890token','access secret'], ['WiFi password: fictional-network-pass','wi-fi access information'],
  ['IMEI: 490154203237518','device identifier'], ['VIN: 1M8GDM9AXKP042788','vehicle identifier'],
  ['Revenue: $950000','confidential business information'], ['Participant ID: STUDY-8273649','research participant identifier'],
];

describe('multi-material privacy candidates', () => {
  it.each(fields)('recognizes the labeled field %s', async (line, label) => {
    const findings = await documentPatternDetector.detect(input([line]));
    expect(findings.some(f => f.label === `Possible ${label}`)).toBe(true);
    expect(findings.every(f => f.status === 'UNKNOWN_POTENTIALLY_SENSITIVE' && !f.typeId)).toBe(true);
    expect(findings.every(f => f.boxes?.length && f.evidence[0]?.wordIds?.length)).toBe(true);
  });
  it.each([
    ['contact student@fictional.test today', 'email address'],
    ['call +1 416 555 0142', 'phone number'], ['13812345678', 'phone number'],
    ['4111 1111 1111 1111', 'payment card number'], ['DE89370400440532013000', 'iban account identifier'],
    ['11010519491231002X', 'chinese identity number'], ['Device 12:34:56:78:9A:BC', 'network device address'],
    ['Host 192.168.10.3', 'ip address'], ['81 Fictional Road', 'street address'],
    ['Postal K1A 0B1', 'canadian postal code'], ['-----BEGIN PRIVATE KEY-----', 'private key material'],
    ['ghp_012345678901234567890123456789012345', 'service access token'],
    ['0x0123456789012345678901234567890123456789', 'wallet-like address'],
    ['P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<', 'passport machine-readable line'],
  ])('recognizes a supported unlabeled format: %s', async (line, label) => {
    expect((await documentPatternDetector.detect(input([line]))).some(f => f.label === `Possible ${label}`)).toBe(true);
  });
  it('does not classify ordinary text, bare references, invalid check digits or impossible dates', async () => {
    const findings = await documentPatternDetector.detect(input(['Meeting at 12:30', 'Reference 1234567890',
      '4111 1111 1111 1112', 'DE00370400440532013000', '11010519490230002X',
      'DOB: 2001-02-30', 'Host 999.999.999.999', 'ordinary unclassified words']));
    expect(findings).toEqual([]);
  });
  it('handles adjacent fields, aligned value rows, OCR ordering and original boxes', async () => {
    const source = input(['Passport number: P8273649 Policy number: POL8273649', 'Patient ID:', 'MED8273649']);
    const reversed = { ...source, ocr: { ...source.ocr!, words: [...source.ocr!.words].reverse() } };
    const result = await documentPatternDetector.detect(reversed);
    expect(result.some(f => f.value === 'P8273649')).toBe(true);
    expect(result.some(f => f.value === 'POL8273649')).toBe(true);
    expect(result.some(f => f.value === 'MED8273649')).toBe(true);
    expect(result.every(f => f.boxes?.every(box => source.ocr!.words.some(word => word.box === box)))).toBe(true);
  });
  it('preserves conservative C recommendations and merges exact duplicate candidates', async () => {
    const result = await detectUniversalPrivacy(input(['Credit card number: 4111 1111 1111 1111', 'Patient ID: MED8273649']));
    const card = result.findings.filter(f => f.value === '4111 1111 1111 1111');
    expect(card).toHaveLength(1);
    expect(universalPolicyRecommendations(result, initialSharingContext).every(r => r.action === 'REVIEW')).toBe(true);
  });
});

describe('format checks', () => {
  it.each(['4111111111111111','378282246310005','5555555555554444'])('validates Luhn example %s', v => expect(luhn(v)).toBe(true));
  it.each(['0000000000000000','1111111111111111','4111111111111112','1234'])('rejects non-card example %s', v => expect(luhn(v)).toBe(false));
  it.each(['GB82 WEST 1234 5698 7654 32','DE89 3704 0044 0532 0130 00','FR1420041010050500013M02606'])('validates IBAN %s', v => expect(validIban(v)).toBe(true));
  it.each(['DE00370400440532013000','ZZ89370400440532013000','GB82WEST1234569876543'])('rejects malformed IBAN %s', v => expect(validIban(v)).toBe(false));
  it('checks Chinese identity date/check digit and birth calendar validity', () => {
    expect(validChineseId('11010519491231002X')).toBe(true);
    expect(validChineseId('110105194912310021')).toBe(false);
    expect(validChineseId('11010519490230002X')).toBe(false);
    expect(validBirthDate('2000-02-29')).toBe(true);
    expect(validBirthDate('2001-02-29')).toBe(false);
  });
});

it('bounds an unlabeled IBAN before an adjacent uppercase note', async () => {
  const findings = await documentPatternDetector.detect(input(['DE89 3704 0044 0532 0130 00 PAYMENT NOTE']));
  expect(findings.find(f => f.label === 'Possible iban account identifier')?.value).toBe('DE89 3704 0044 0532 0130 00');
});

describe('expanded material labels', () => {
  it.each([
    ['Valid thru: 08/29', 'card expiry date'], ['Card number: 4111 1111 1111 1111', 'payment card number'],
    ['Account holder: Alex Morgan', 'cardholder name'], ['BSB: 062-000', 'bank branch or transfer code'],
    ['Credit limit: USD 12000', 'financial record'], ['Document number: DOC8237649', 'identity document number'],
    ['Visa number: VIS8237649', 'immigration or residence identifier'], ['Aadhaar: 2345 6789 0123', 'regional government identifier'],
    ['Nationality: Fictional', 'passport personal details'], ['Emergency contact: Alex Morgan', 'emergency contact'],
    ['Mobile: 13812345678', 'contact telephone'], ['GPS: 43.1234, -79.5678', 'precise location'],
    ['Password: FictionalPass42!', 'password or pin'], ['OTP: 827364', 'verification or recovery code'],
    ['Seed phrase: fictional example only never a real wallet', 'verification or recovery code'],
    ['API key: fictional-token-827364', 'api or application secret'], ['Cookie: session=fictional827364', 'session or cookie value'],
    ['Meeting ID: 827 364 1234', 'meeting access details'], ['Ship to: 81 Fictional Road', 'shipping or billing details'],
    ['Transaction ref: TRX827364', 'order or transaction reference'], ['Member number: MEM827364', 'membership or loyalty identifier'],
    ['Passenger: ALEX MORGAN', 'passenger or guest details'], ['Flight number: AB8273', 'travel schedule or seat'],
    ['Blood pressure: 120/80', 'health measurement or report'], ['Subscriber ID: SUB827364', 'health coverage details'],
    ['Performance rating: Confidential example', 'employment or hr information'], ['Class rank: 12 of 100', 'education record details'],
    ['Settlement amount: USD 15000', 'legal record details'], ['Property ID: PROP827364', 'property or asset identifier'],
    ['Hostname: internal.example.test', 'device or infrastructure details'], ['Internal notes: Fictional confidential example', 'commercial or internal information'],
    ['Marital status: Fictional example', 'personal or family details'], ['验证码：827364', 'verification or recovery code'],
    ['卡号：4111 1111 1111 1111', 'payment card number'], ['签证号：VIS827364', 'immigration or residence identifier'],
    ['开户行：中国测试银行', 'bank branch or transfer code'], ['病历号：MED827364', 'patient or health identifier'],
  ])('finds a labeled candidate in %s', async (line, label) => {
    const findings = await documentPatternDetector.detect(input([line]));
    expect(findings.some(f => f.label === `Possible ${label}`)).toBe(true);
    expect(findings.every(f => f.status === 'UNKNOWN_POTENTIALLY_SENSITIVE')).toBe(true);
  });
});

it('covers private-key bodies rather than only the header', async () => {
  const result = await documentPatternDetector.detect(input(['-----BEGIN PRIVATE KEY-----', 'FICTIONALKEYBODY827364', '-----END PRIVATE KEY-----']));
  const key = result.find(f => f.label === 'Possible private key material');
  expect(key?.value).toBe('Private key block');
  expect(new Set(key?.boxes?.map(b => b.y)).size).toBe(3);
});
it.each(['postgres://fictional:secret827364@db.example.test/database', 'https://example.test/private?access_token=fictional827364'])('finds an access-bearing URL without opening it: %s', async value => {
  const result = await documentPatternDetector.detect(input([value]));
  expect(result.some(f => f.categoryIds.includes('authentication_credentials'))).toBe(true);
});
it('does not absorb a following labeled field when a key footer is missing', async () => {
  const result = await documentPatternDetector.detect(input(['-----BEGIN PRIVATE KEY-----', 'FICTIONALKEYBODY827364', 'Address: 81 Fictional Road']));
  const key = result.find(f => f.label === 'Possible private key material');
  expect(new Set(key?.boxes?.map(b => b.y)).size).toBe(2);
});
it('finds unlabeled expiry and holder lines only in a detected payment-card context', async () => {
  const withCard = await documentPatternDetector.detect(input(['4111 1111 1111 1111', 'ALEX MORGAN', '08/29', 'FICTIONAL BANK']));
  expect(withCard.some(f => f.label === 'Possible cardholder name' && f.value === 'ALEX MORGAN')).toBe(true);
  expect(withCard.some(f => f.label === 'Possible card expiry date' && f.value === '08/29')).toBe(true);
  expect(withCard.some(f => f.value === 'FICTIONAL BANK')).toBe(false);
  const ordinary = await documentPatternDetector.detect(input(['ALEX MORGAN', '08/29']));
  expect(ordinary).toHaveLength(0);
});
it('does not infer a cardholder from a distant name or a document heading elsewhere on the page', async () => {
  const source=input(['FICTIONAL PRIVATE RECORD','ALEX MORGAN','4111 1111 1111 1111','08/29']);
  const shifted={...source,ocr:{...source.ocr!,words:source.ocr!.words.map(word=>word.lineId==='l-2'||word.lineId==='l-3'?{...word,box:{...word.box,y:word.box.y+1800}}:word)}};
  const result=await documentPatternDetector.detect(shifted);
  expect(result.some(f=>f.label==='Possible cardholder name')).toBe(false);
  expect(result.some(f=>f.label==='Possible card expiry date')).toBe(true);
});
